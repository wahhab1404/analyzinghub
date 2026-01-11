import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface BroadcastPayload {
  userId: string;
  analysisId: string;
  channelId?: string;
  eventType: 'new_analysis' | 'target_hit' | 'stop_hit';
  symbol?: string;
  direction?: string;
  entryPrice?: number;
  targetNumber?: number;
  targetPrice?: number;
  stopPrice?: number;
  metadata?: Record<string, any>;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

function chunkText(text: string, maxLength = 4096): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + maxLength));
    i += maxLength;
  }
  return chunks;
}

function formatAnalysisMessage(analysis: any, language: 'en' | 'ar', baseUrl: string): string {
  const isArabic = language === 'ar';

  const t = isArabic ? {
    newAnalysis: '📊 تحليل فني جديد',
    newNews: '📰 أخبار السوق',
    newArticle: '📝 مقالة جديدة',
    by: 'بواسطة',
    symbol: 'الرمز',
    direction: 'الاتجاه',
    stopLoss: 'وقف الخسارة',
    targets: 'الأهداف السعرية',
    target: 'الهدف',
    description: 'الوصف',
    viewFull: '👁️ عرض التحليل الكامل',
    long: '📈 شراء (صاعد)',
    short: '📉 بيع (هابط)',
    neutral: '➡️ محايد',
    poweredBy: 'مدعوم من AnalyzingHub',
    platform: '💹 منصة تحليل مالي احترافية',
  } : {
    newAnalysis: '📊 New Technical Analysis',
    newNews: '📰 Market News',
    newArticle: '📝 New Article',
    by: 'by',
    symbol: 'Symbol',
    direction: 'Direction',
    stopLoss: 'Stop Loss',
    targets: 'Price Targets',
    target: 'TP',
    description: 'Description',
    viewFull: '👁️ View Full Analysis',
    long: '📈 Long (Bullish)',
    short: '📉 Short (Bearish)',
    neutral: '➡️ Neutral',
    poweredBy: 'Powered by AnalyzingHub',
    platform: '💹 Professional Financial Analysis Platform',
  };

  const postType = analysis.post_type || 'analysis';

  let message = '';

  if (postType === 'analysis') {
    message += `*${t.newAnalysis}*\n`;
  } else if (postType === 'news') {
    message += `*${t.newNews}*\n`;
  } else {
    message += `*${t.newArticle}*\n`;
  }

  message += `━━━━━━━━━━━━━━━━\n\n`;

  if (analysis.title) {
    message += `*${escapeMarkdown(analysis.title)}*\n\n`;
  }

  message += `*${t.symbol}:* ${escapeMarkdown(analysis.symbols?.symbol || 'N/A')}\n`;
  message += `*${t.by}:* ${escapeMarkdown(analysis.profiles?.full_name || 'Analyzer')}\n\n`;

  if (postType === 'analysis') {
    if (analysis.direction) {
      const directionText = analysis.direction === 'Long' ? t.long :
                           analysis.direction === 'Short' ? t.short : t.neutral;
      message += `*${t.direction}:* ${directionText}\n\n`;
    }

    if (analysis.stop_loss !== undefined) {
      message += `🛑 *${t.stopLoss}:* $${analysis.stop_loss.toFixed(2)}\n\n`;
    }

    if (analysis.analysis_targets && analysis.analysis_targets.length > 0) {
      message += `🎯 *${t.targets}:*\n`;
      const sortedTargets = [...analysis.analysis_targets].sort((a: any, b: any) =>
        analysis.direction === 'Short' ? b.price - a.price : a.price - b.price
      );

      sortedTargets.forEach((target: any, index: number) => {
        message += `   ${t.target}${index + 1}: $${target.price.toFixed(2)}\n`;
      });
      message += `\n`;
    }

    if (analysis.description && analysis.description.trim()) {
      message += `📝 *${t.description}:*\n${escapeMarkdown(analysis.description)}\n\n`;
    }
  }

  const shareLink = `${baseUrl}/share/${analysis.id}?lang=${language}`;
  message += `[${t.viewFull}](${shareLink})\n\n`;

  message += `━━━━━━━━━━━━━━━━\n`;
  message += `${t.poweredBy}\n`;
  message += `${t.platform}`;

  return message;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    console.log('[Broadcast] Starting function execution');
    console.log('[Broadcast] Request method:', req.method);
    console.log('[Broadcast] Request URL:', req.url);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    console.log('[Broadcast] Environment check:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey,
      urlValue: supabaseUrl
    });

    if (!supabaseUrl) {
      console.error('[Broadcast] SUPABASE_URL environment variable is missing');
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Configuration error",
          details: "SUPABASE_URL environment variable is not configured. Please set it in your deployment environment."
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!supabaseKey) {
      console.error('[Broadcast] SUPABASE_SERVICE_ROLE_KEY environment variable is missing');
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Configuration error",
          details: "SUPABASE_SERVICE_ROLE_KEY environment variable is not configured. Please set it in your deployment environment."
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Function timeout after 20 seconds')), 20000);
    });

    const result = await Promise.race([
      processBroadcast(req, supabase, supabaseUrl),
      timeoutPromise
    ]);

    return result as Response;
  } catch (error) {
    console.error("[Broadcast] Top-level error:", error);
    console.error("[Broadcast] Error stack:", error?.stack);
    console.error("[Broadcast] Error name:", error?.name);
    console.error("[Broadcast] Error message:", error?.message);

    return new Response(
      JSON.stringify({
        ok: false,
        error: error?.message || 'Unknown error',
        errorName: error?.name || 'Unknown',
        stack: error?.stack || 'No stack trace'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function processBroadcast(req: Request, supabase: any, supabaseUrl: string) {
  try {
    const appBaseUrl = Deno.env.get("APP_BASE_URL") || "https://analyzhub.com";

    console.log('[Broadcast] Fetching bot token from database');
    const { data: botTokenSetting, error: tokenError } = await supabase
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "telegram_bot_token")
      .maybeSingle();

    if (tokenError) {
      console.error('[Broadcast] Error fetching bot token:', tokenError);
    }

    const botToken = botTokenSetting?.setting_value || Deno.env.get("TELEGRAM_BOT_TOKEN");
    console.log('[Broadcast] Bot token:', botToken ? 'Found' : 'NOT FOUND');

    if (!botToken) {
      console.error('[Broadcast] Bot token not found');
      return new Response(
        JSON.stringify({ ok: false, error: "TELEGRAM_BOT_TOKEN not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let payload: BroadcastPayload;
    try {
      payload = await req.json();
    } catch (parseError) {
      console.error('[Broadcast] Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid JSON in request body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    console.log('[Broadcast] Payload received:', JSON.stringify(payload));

    console.log('[Broadcast] Fetching channel data');
    let channelData;

    if (payload.channelId) {
      const { data } = await supabase
        .from('telegram_channels')
        .select('*')
        .eq('user_id', payload.userId)
        .eq('channel_id', payload.channelId)
        .eq('enabled', true)
        .maybeSingle();

      channelData = data;

      if (!channelData) {
        const { data: planData } = await supabase
          .from('analyzer_plans')
          .select('telegram_channel_id, name')
          .eq('analyst_id', payload.userId)
          .eq('telegram_channel_id', payload.channelId)
          .maybeSingle();

        if (planData?.telegram_channel_id) {
          channelData = {
            channel_id: planData.telegram_channel_id,
            channel_name: planData.name,
            user_id: payload.userId,
            enabled: true,
            notify_new_analysis: true,
            notify_target_hit: true,
            notify_stop_hit: true,
            broadcast_language: 'both',
          };
        }
      }
    } else {
      const { data } = await supabase
        .from('telegram_channels')
        .select('*')
        .eq('user_id', payload.userId)
        .eq('enabled', true)
        .maybeSingle();

      channelData = data;
    }

    if (!channelData) {
      console.log('[Broadcast] No active channel found');
      return new Response(
        JSON.stringify({
          ok: false,
          error: "No active channel found for analyzer"
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log('[Broadcast] Channel found:', channelData.channel_name || channelData.channel_id);

    if (payload.eventType === 'new_analysis' && !channelData.notify_new_analysis) {
      return new Response(
        JSON.stringify({ ok: false, error: "New analysis broadcasts disabled" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (payload.eventType === 'target_hit' && !channelData.notify_target_hit) {
      return new Response(
        JSON.stringify({ ok: false, error: "Target hit broadcasts disabled" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (payload.eventType === 'stop_hit' && !channelData.notify_stop_hit) {
      return new Response(
        JSON.stringify({ ok: false, error: "Stop hit broadcasts disabled" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log('[Broadcast] Fetching analysis');
    const { data: analysis } = await supabase
      .from('analyses')
      .select(`
        *,
        profiles:analyzer_id (id, full_name),
        symbols:symbol_id (symbol),
        analysis_targets (price, expected_time)
      `)
      .eq('id', payload.analysisId)
      .maybeSingle();

    if (!analysis) {
      console.log('[Broadcast] Analysis not found');
      return new Response(
        JSON.stringify({ ok: false, error: "Analysis not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log('[Broadcast] Analysis found, formatting message');
    const broadcastLanguage = channelData.broadcast_language || 'both';

    let finalMessage = '';

    if (broadcastLanguage === 'both') {
      const arMessage = formatAnalysisMessage(analysis, 'ar', appBaseUrl);
      const enMessage = formatAnalysisMessage(analysis, 'en', appBaseUrl);
      finalMessage = `${arMessage}\n\n━━━━━━━━━━━━━━━━━━━━\n\n${enMessage}`;
    } else if (broadcastLanguage === 'ar') {
      finalMessage = formatAnalysisMessage(analysis, 'ar', appBaseUrl);
    } else {
      finalMessage = formatAnalysisMessage(analysis, 'en', appBaseUrl);
    }
    console.log('[Broadcast] Message formatted, sending to Telegram');

    let telegramResult: any = null;
    let messageId: string | null = null;

    if (analysis.chart_image_url) {
      const chartImageUrl = analysis.chart_image_url.startsWith('http')
        ? analysis.chart_image_url
        : `${supabaseUrl}/storage/v1/object/public/chart-images/${analysis.chart_image_url}`;

      console.log('[Broadcast] Sending with HIGH QUALITY image:', chartImageUrl);

      const postType = analysis.post_type || 'analysis';
      const shortCaption = postType === 'analysis' ? '📊 New Technical Analysis' :
                          postType === 'news' ? '📰 Market News' : '📝 New Article';

      console.log('[Broadcast] Sending as document for maximum quality');
      const documentApiUrl = `https://api.telegram.org/bot${botToken}/sendDocument`;
      const documentResponse = await fetch(documentApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: channelData.channel_id,
          document: chartImageUrl,
          caption: shortCaption,
          parse_mode: "Markdown",
        }),
      });

      const documentResult = await documentResponse.json();
      console.log('[Broadcast] Document send result:', JSON.stringify(documentResult));

      if (!documentResult.ok) {
        telegramResult = documentResult;
      } else {
        messageId = documentResult.result?.message_id?.toString();

        const textChunks = chunkText(finalMessage, 4096);
        console.log('[Broadcast] Sending full text in', textChunks.length, 'chunk(s)');

        for (let i = 0; i < textChunks.length; i++) {
          const textApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
          const textResponse = await fetch(textApiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chat_id: channelData.channel_id,
              text: textChunks[i],
              parse_mode: "Markdown",
              disable_web_page_preview: true,
            }),
          });

          const textResult = await textResponse.json();
          console.log(`[Broadcast] Text chunk ${i + 1}/${textChunks.length} result:`, JSON.stringify(textResult));

          if (!textResult.ok) {
            telegramResult = textResult;
            break;
          } else if (i === textChunks.length - 1) {
            telegramResult = textResult;
          }
        }
      }
    } else {
      console.log('[Broadcast] Sending text-only message');
      const textChunks = chunkText(finalMessage, 4096);
      console.log('[Broadcast] Sending in', textChunks.length, 'chunk(s)');

      for (let i = 0; i < textChunks.length; i++) {
        const textApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const textResponse = await fetch(textApiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: channelData.channel_id,
            text: textChunks[i],
            parse_mode: "Markdown",
            disable_web_page_preview: false,
          }),
        });

        const textResult = await textResponse.json();
        console.log(`[Broadcast] Text chunk ${i + 1}/${textChunks.length} result:`, JSON.stringify(textResult));

        if (!textResult.ok) {
          telegramResult = textResult;
          break;
        } else {
          if (i === 0) {
            messageId = textResult.result?.message_id?.toString();
          }
          if (i === textChunks.length - 1) {
            telegramResult = textResult;
          }
        }
      }
    }

    console.log('[Broadcast] Final Telegram result:', JSON.stringify(telegramResult));

    if (!telegramResult.ok) {
      console.error('[Broadcast] Failed to send to Telegram');
      await supabase.from("channel_broadcast_log").insert({
        channel_id: channelData.channel_id,
        user_id: payload.userId,
        analysis_id: payload.analysisId,
        event_type: payload.eventType,
        status: "failed",
        error_message: JSON.stringify(telegramResult),
      });

      return new Response(
        JSON.stringify({
          ok: false,
          error: "Failed to send channel broadcast",
          details: telegramResult
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log('[Broadcast] Successfully sent to Telegram');
    await supabase.from("channel_broadcast_log").insert({
      channel_id: channelData.channel_id,
      user_id: payload.userId,
      analysis_id: payload.analysisId,
      event_type: payload.eventType,
      status: "sent",
      message_id: messageId,
      sent_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        ok: true,
        messageId: messageId,
        channelName: channelData.channel_name
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error('[Broadcast] Error in processBroadcast:', error);
    console.error('[Broadcast] Error details:', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack
    });

    return new Response(
      JSON.stringify({
        ok: false,
        error: error?.message || 'Error processing broadcast',
        errorName: error?.name || 'Unknown',
        stack: error?.stack || 'No stack trace'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}
