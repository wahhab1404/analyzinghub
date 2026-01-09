import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  formatAnalysisMessage,
  formatTradeMessage,
  formatUpdateMessage,
  formatTradeResultMessage,
} from './message-formatter.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BASE_URL = Deno.env.get('APP_BASE_URL') || Deno.env.get('NEXT_PUBLIC_SITE_URL') || 'https://analyzhub.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface PublishRequest {
  type: 'new_analysis' | 'new_trade' | 'trade_update' | 'trade_result' | 'analysis_update';
  data: any;
  channelId?: string;
  isNewHigh?: boolean;
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  imageUrl?: string
) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  const body: any = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: false,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram API error: ${error}`);
  }

  return response.json();
}

async function sendTelegramPhoto(
  botToken: string,
  chatId: string,
  photoUrl: string,
  caption: string
) {
  const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
  
  const body = {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: 'HTML',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram API error: ${error}`);
  }

  return response.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    console.log('[IndicesPublisher] Starting function execution');
    console.log('[IndicesPublisher] Request method:', req.method);
    console.log('[IndicesPublisher] Request URL:', req.url);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: botTokenSetting } = await supabase
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "telegram_bot_token")
      .maybeSingle();

    const botToken = botTokenSetting?.setting_value || Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!botToken) {
      throw new Error("Telegram bot token not configured");
    }

    console.log('[IndicesPublisher] Bot token loaded from:', botTokenSetting?.setting_value ? 'database' : 'environment');

    const payload: PublishRequest = await req.json();

    console.log('[IndicesPublisher] Payload received:', JSON.stringify(payload));
    console.log('[IndicesPublisher] Publishing to Telegram:', payload.type);

    let message: { text?: string; caption?: string; snapshotImageUrl?: string };
    let channelIds: string[] = [];

    if (payload.channelId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.channelId);

      if (isUuid) {
        const { data: channelData } = await supabase
          .from('telegram_channels')
          .select('channel_id')
          .eq('id', payload.channelId)
          .eq('enabled', true)
          .single();

        if (channelData?.channel_id) {
          channelIds = [channelData.channel_id];
        }
      } else {
        channelIds = [payload.channelId];
      }
    } else if (payload.data.author_id) {
      const { data: channels } = await supabase
        .from('telegram_channels')
        .select('channel_id')
        .eq('user_id', payload.data.author_id)
        .eq('enabled', true)
        .eq('notify_new_analysis', true);

      channelIds = channels?.map(c => c.channel_id) || [];
    }

    if (channelIds.length === 0) {
      console.error('[IndicesPublisher] No active channels found for publishing');
      console.error('[IndicesPublisher] Payload channelId:', payload.channelId);
      console.error('[IndicesPublisher] Payload author_id:', payload.data.author_id);
      return new Response(
        JSON.stringify({ error: 'No active channels found', details: { channelId: payload.channelId, authorId: payload.data.author_id } }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[IndicesPublisher] Publishing to Telegram channels:', channelIds);

    switch (payload.type) {
      case 'new_analysis':
        message = formatAnalysisMessage(payload.data, BASE_URL);
        break;
      case 'new_trade':
        message = formatTradeMessage(payload.data, BASE_URL, payload.isNewHigh || false);
        break;
      case 'trade_result':
        message = formatTradeResultMessage(payload.data, BASE_URL);
        break;
      case 'trade_update':
      case 'analysis_update':
        message = formatUpdateMessage(
          payload.data,
          payload.type === 'trade_update' ? 'trade' : 'analysis',
          BASE_URL
        );
        break;
      default:
        throw new Error(`Unknown message type: ${payload.type}`);
    }

    console.log('[IndicesPublisher] Formatted message:', {
      hasText: !!message.text,
      hasSnapshot: !!message.snapshotImageUrl,
      snapshotUrl: message.snapshotImageUrl,
      textLength: message.text?.length || 0,
    });

    const results = [];
    for (const channelId of channelIds) {
      try {
        console.log(`[IndicesPublisher] Sending to channel: ${channelId}`);
        let result;
        if (message.snapshotImageUrl && message.text) {
          console.log(`[IndicesPublisher] Sending photo with caption to ${channelId}, URL: ${message.snapshotImageUrl}`);
          result = await sendTelegramPhoto(botToken, channelId, message.snapshotImageUrl, message.text);
        } else if (message.text) {
          console.log(`[IndicesPublisher] Sending text message to ${channelId} (no photo available)`);
          result = await sendTelegramMessage(botToken, channelId, message.text);
        }
        console.log(`[IndicesPublisher] Successfully sent to ${channelId}`);
        results.push({ channelId, success: true, result });
      } catch (error: any) {
        console.error(`[IndicesPublisher] Failed to send to ${channelId}:`, error);
        results.push({ channelId, success: false, error: error.message });
      }
    }

    console.log('[IndicesPublisher] All sends completed, results:', JSON.stringify(results));

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[IndicesPublisher] Top-level error:', error);
    console.error('[IndicesPublisher] Error stack:', error?.stack);
    return new Response(
      JSON.stringify({ error: error.message, stack: error?.stack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});