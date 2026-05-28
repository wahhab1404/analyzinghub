import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TelegramMessage {
  userId: string;
  message: string;
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
}

interface NotificationPayload {
  notificationId: string;
  userId: string;
  type: string;
  analysisId?: string;
  analyzerName?: string;
  symbol?: string;
  targetNumber?: number;
  targetPrice?: number;
  stopPrice?: number;
  metadata?: Record<string, any>;
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

    const payload: NotificationPayload = await req.json();

    const { data: telegramAccount, error: accountError } = await supabase
      .from("telegram_accounts")
      .select("chat_id, username")
      .eq("user_id", payload.userId)
      .is("revoked_at", null)
      .maybeSingle();

    if (accountError || !telegramAccount) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: "No active Telegram account found" 
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("telegram_enabled, telegram_target_hit, telegram_stop_hit, telegram_new_analysis")
      .eq("user_id", payload.userId)
      .maybeSingle();

    if (!prefs?.telegram_enabled) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: "Telegram notifications disabled" 
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (payload.type === "target_hit" && !prefs.telegram_target_hit) {
      return new Response(
        JSON.stringify({ ok: false, error: "Target hit notifications disabled" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (payload.type === "stop_hit" && !prefs.telegram_stop_hit) {
      return new Response(
        JSON.stringify({ ok: false, error: "Stop hit notifications disabled" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (payload.type === "new_analysis" && !prefs.telegram_new_analysis) {
      return new Response(
        JSON.stringify({ ok: false, error: "New analysis notifications disabled" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: rateLimitOk } = await supabase.rpc(
      "check_telegram_rate_limit",
      { p_user_id: payload.userId }
    );

    if (!rateLimitOk) {
      await supabase.from("notification_delivery_log").insert({
        notification_id: payload.notificationId,
        user_id: payload.userId,
        channel: "telegram",
        status: "throttled",
        error_message: "Rate limit exceeded",
      });

      return new Response(
        JSON.stringify({ ok: false, error: "Rate limit exceeded" }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: isQuiet } = await supabase.rpc(
      "is_in_quiet_hours",
      { p_user_id: payload.userId }
    );

    if (isQuiet) {
      await supabase.from("notification_delivery_log").insert({
        notification_id: payload.notificationId,
        user_id: payload.userId,
        channel: "telegram",
        status: "throttled",
        error_message: "Quiet hours active",
      });

      return new Response(
        JSON.stringify({ ok: false, error: "Quiet hours active" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let message = "";
    const analysisUrl = payload.analysisId
      ? `${appBaseUrl}/share/${payload.analysisId}`
      : "";

    if (payload.type === "target_hit") {
      message = `🎯 <b>Target Hit!</b>\n\n`;
      message += `<b>Analyzer:</b> ${payload.analyzerName || "Unknown"}\n`;
      message += `<b>Symbol:</b> ${payload.symbol || "N/A"}\n`;
      message += `<b>Target ${payload.targetNumber}:</b> $${payload.targetPrice?.toFixed(2) || "N/A"}\n\n`;
      message += `<i>Target successfully reached!</i>\n\n`;
      if (analysisUrl) {
        message += `<a href="${analysisUrl}">View Analysis</a>`;
      }

      message += `\n\n━━━━━━━━━━\n\n`;
      message += `🎯 <b>تم الوصول للهدف!</b>\n\n`;
      message += `<b>المحلل:</b> ${payload.analyzerName || "غير معروف"}\n`;
      message += `<b>الرمز:</b> ${payload.symbol || "غير متاح"}\n`;
      message += `<b>الهدف ${payload.targetNumber}:</b> $${payload.targetPrice?.toFixed(2) || "غير متاح"}\n\n`;
      message += `<i>تم الوصول للهدف بنجاح!</i>`;
    } else if (payload.type === "stop_hit") {
      message = `🛑 <b>Stop Loss Hit</b>\n\n`;
      message += `<b>Analyzer:</b> ${payload.analyzerName || "Unknown"}\n`;
      message += `<b>Symbol:</b> ${payload.symbol || "N/A"}\n`;
      message += `<b>Stop Price:</b> $${payload.stopPrice?.toFixed(2) || "N/A"}\n\n`;
      message += `<i>Stop loss has been triggered.</i>\n\n`;
      if (analysisUrl) {
        message += `<a href="${analysisUrl}">View Analysis</a>`;
      }

      message += `\n\n━━━━━━━━━━\n\n`;
      message += `🛑 <b>تم الوصول لوقف الخسارة</b>\n\n`;
      message += `<b>المحلل:</b> ${payload.analyzerName || "غير معروف"}\n`;
      message += `<b>الرمز:</b> ${payload.symbol || "غير متاح"}\n`;
      message += `<b>سعر الوقف:</b> $${payload.stopPrice?.toFixed(2) || "غير متاح"}\n\n`;
      message += `<i>تم تفعيل وقف الخسارة.</i>`;
    } else if (payload.type === "new_analysis") {
      message = `📊 <b>New Analysis Published</b>\n\n`;
      message += `<b>Analyzer:</b> ${payload.analyzerName || "Unknown"}\n`;
      message += `<b>Symbol:</b> ${payload.symbol || "N/A"}\n\n`;
      if (analysisUrl) {
        message += `<a href="${analysisUrl}">View Analysis</a>`;
      }

      message += `\n\n━━━━━━━━━━\n\n`;
      message += `📊 <b>تحليل جديد</b>\n\n`;
      message += `<b>المحلل:</b> ${payload.analyzerName || "غير معروف"}\n`;
      message += `<b>الرمز:</b> ${payload.symbol || "غير متاح"}`;
    }

    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const telegramResponse = await fetch(telegramApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: telegramAccount.chat_id,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    });

    const telegramResult = await telegramResponse.json();

    if (!telegramResult.ok) {
      await supabase.from("notification_delivery_log").insert({
        notification_id: payload.notificationId,
        user_id: payload.userId,
        channel: "telegram",
        status: "failed",
        error_message: JSON.stringify(telegramResult),
      });

      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: "Failed to send Telegram message",
          details: telegramResult 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    await supabase.from("notification_delivery_log").insert({
      notification_id: payload.notificationId,
      user_id: payload.userId,
      channel: "telegram",
      status: "sent",
      sent_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ 
        ok: true, 
        messageId: telegramResult.result.message_id 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in telegram-sender:", error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
