import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { formatAnalysisMessage, formatTradeMessage, formatUpdateMessage, formatTradeResultMessage } from "./message-formatter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PublishRequest {
  entityType: "analysis" | "trade" | "analysis_update" | "trade_update" | "trade_result";
  entityId: string;
  channelId: string;
  forceResend?: boolean;
  isNewHigh?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const appBaseUrl = Deno.env.get("APP_BASE_URL") || "https://analyzhub.com";

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: botTokenSetting } = await supabase
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "telegram_bot_token")
      .maybeSingle();

    const botToken = botTokenSetting?.setting_value || Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!botToken) {
      throw new Error("TELEGRAM_BOT_TOKEN not configured");
    }

    const payload: PublishRequest = await req.json();
    console.log("[indices-telegram-publisher] Processing request:", {
      entityType: payload.entityType,
      entityId: payload.entityId,
      channelId: payload.channelId,
    });

    const { data: channel, error: channelError } = await supabase
      .from("telegram_channels")
      .select("*")
      .eq("id", payload.channelId)
      .eq("enabled", true)
      .maybeSingle();

    if (channelError || !channel) {
      console.error("[indices-telegram-publisher] Channel not found:", channelError);
      return new Response(
        JSON.stringify({ ok: false, error: "Channel not found or disabled" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let messageData: { text?: string; caption?: string; photo?: string } | null = null;
    let entity: any = null;
    const isNewHigh = payload.entityType === "trade" && (payload as any).isNewHigh === true;

    if (payload.entityType === "analysis") {
      const { data } = await supabase
        .from("index_analyses")
        .select(`
          *,
          author:profiles!author_id(id, full_name, email)
        `)
        .eq("id", payload.entityId)
        .single();

      entity = data;
      if (entity) {
        messageData = formatAnalysisMessage(entity, appBaseUrl);
      }
    } else if (payload.entityType === "trade") {
      const { data } = await supabase
        .from("index_trades")
        .select(`
          *,
          author:profiles!author_id(id, full_name),
          analysis:index_analyses!analysis_id(id, title, index_symbol)
        `)
        .eq("id", payload.entityId)
        .single();

      entity = data;
      if (entity) {
        const tradeMessage = formatTradeMessage(entity, appBaseUrl, isNewHigh);
        
        try {
          console.log("[indices-telegram-publisher] Generating snapshot for trade:", payload.entityId);
          const snapshotResponse = await fetch(`${supabaseUrl}/functions/v1/generate-trade-snapshot`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              tradeId: payload.entityId,
              isNewHigh: isNewHigh,
            }),
          });

          if (snapshotResponse.ok) {
            const snapshotData = await snapshotResponse.json();
            messageData = {
              photo: snapshotData.imageUrl,
              caption: tradeMessage.caption,
            };
            console.log("[indices-telegram-publisher] Snapshot generated:", snapshotData.imageUrl);
          } else {
            console.warn("[indices-telegram-publisher] Snapshot generation failed, sending text only");
            messageData = { text: tradeMessage.caption };
          }
        } catch (snapshotError) {
          console.error("[indices-telegram-publisher] Snapshot error:", snapshotError);
          messageData = { text: tradeMessage.caption };
        }
      }
    } else if (payload.entityType === "analysis_update") {
      const { data } = await supabase
        .from("analysis_updates")
        .select(`
          *,
          author:profiles!author_id(id, full_name),
          analysis:index_analyses!analysis_id(id, title, index_symbol)
        `)
        .eq("id", payload.entityId)
        .single();
      
      entity = data;
      if (entity) {
        messageData = formatUpdateMessage(entity, "analysis", appBaseUrl);
      }
    } else if (payload.entityType === "trade_update") {
      const { data } = await supabase
        .from("trade_updates")
        .select(`
          *,
          author:profiles!author_id(id, full_name),
          trade:index_trades!trade_id(
            id,
            polygon_option_ticker,
            strike,
            expiry,
            analysis:index_analyses!analysis_id(id, title, index_symbol)
          )
        `)
        .eq("id", payload.entityId)
        .single();
      
      entity = data;
      if (entity) {
        messageData = formatUpdateMessage(entity, "trade", appBaseUrl);
      }
    } else if (payload.entityType === "trade_result") {
      const { data } = await supabase
        .from("index_trades")
        .select(`
          *,
          author:profiles!author_id(id, full_name),
          analysis:index_analyses!analysis_id(id, title, index_symbol)
        `)
        .eq("id", payload.entityId)
        .single();
      
      entity = data;
      if (entity && (entity.status === "tp_hit" || entity.status === "sl_hit")) {
        messageData = formatTradeResultMessage(entity, appBaseUrl);
      }
    }

    if (!messageData || !entity) {
      console.error("[indices-telegram-publisher] Entity not found or invalid");
      return new Response(
        JSON.stringify({ ok: false, error: "Entity not found or invalid" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const payloadContent = JSON.stringify({
      type: payload.entityType,
      text: messageData.text || messageData.caption,
      photo: messageData.photo,
    });
    
    const payloadHash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(payloadContent)
    ).then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join(""));

    if (!payload.forceResend) {
      const { data: existingLog } = await supabase
        .from("telegram_send_log")
        .select("id")
        .eq("entity_type", payload.entityType)
        .eq("entity_id", payload.entityId)
        .eq("channel_id", payload.channelId)
        .eq("payload_hash", payloadHash)
        .eq("status", "sent")
        .maybeSingle();

      if (existingLog) {
        console.log("[indices-telegram-publisher] Message already sent, skipping");
        return new Response(
          JSON.stringify({ ok: true, skipped: true, reason: "Already sent" }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    const { data: logEntry, error: logError } = await supabase
      .from("telegram_send_log")
      .insert({
        entity_type: payload.entityType,
        entity_id: payload.entityId,
        channel_id: payload.channelId,
        payload_hash: payloadHash,
        status: "pending",
      })
      .select()
      .single();

    if (logError) {
      console.error("[indices-telegram-publisher] Failed to create log entry:", logError);
      throw new Error("Failed to create log entry");
    }

    let telegramResult: any;
    const telegramBaseUrl = `https://api.telegram.org/bot${botToken}`;

    try {
      if (messageData.photo) {
        const response = await fetch(`${telegramBaseUrl}/sendPhoto`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: channel.channel_id,
            photo: messageData.photo,
            caption: messageData.caption,
            parse_mode: "HTML",
          }),
        });
        telegramResult = await response.json();
      } else {
        const response = await fetch(`${telegramBaseUrl}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: channel.channel_id,
            text: messageData.text,
            parse_mode: "HTML",
            disable_web_page_preview: false,
          }),
        });
        telegramResult = await response.json();
      }

      if (!telegramResult.ok) {
        throw new Error(JSON.stringify(telegramResult));
      }

      await supabase
        .from("telegram_send_log")
        .update({
          status: "sent",
          telegram_message_id: telegramResult.result.message_id?.toString(),
          telegram_chat_id: channel.channel_id,
          sent_at: new Date().toISOString(),
        })
        .eq("id", logEntry.id);

      const updateData = {
        telegram_message_id: telegramResult.result.message_id?.toString(),
        telegram_published_at: new Date().toISOString(),
      };

      if (payload.entityType === "analysis") {
        await supabase.from("index_analyses").update(updateData).eq("id", payload.entityId);
      } else if (payload.entityType === "trade") {
        await supabase.from("index_trades").update(updateData).eq("id", payload.entityId);
      } else if (payload.entityType === "analysis_update") {
        await supabase.from("analysis_updates").update(updateData).eq("id", payload.entityId);
      } else if (payload.entityType === "trade_update") {
        await supabase.from("trade_updates").update(updateData).eq("id", payload.entityId);
      }

      console.log("[indices-telegram-publisher] Message sent successfully:", {
        messageId: telegramResult.result.message_id,
        chatId: channel.channel_id,
      });

      return new Response(
        JSON.stringify({
          ok: true,
          messageId: telegramResult.result.message_id,
          chatId: channel.channel_id,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (sendError: any) {
      console.error("[indices-telegram-publisher] Failed to send message:", sendError);
      
      await supabase
        .from("telegram_send_log")
        .update({
          status: "failed",
          error: sendError.message || JSON.stringify(sendError),
          retry_count: (logEntry.retry_count || 0) + 1,
        })
        .eq("id", logEntry.id);

      return new Response(
        JSON.stringify({
          ok: false,
          error: "Failed to send Telegram message",
          details: sendError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (error: any) {
    console.error("[indices-telegram-publisher] Error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});