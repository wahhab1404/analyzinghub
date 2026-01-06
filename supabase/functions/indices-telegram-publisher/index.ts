import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  formatAnalysisMessage,
  formatTradeMessage,
  formatUpdateMessage,
  formatTradeResultMessage,
} from './message-formatter.ts';

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BASE_URL = 'https://analyzinghub.com';

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
  chatId: string,
  text: string,
  imageUrl?: string
) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
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
  chatId: string,
  photoUrl: string,
  caption: string
) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
  
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
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const payload: PublishRequest = await req.json();

    console.log('Publishing to Telegram:', payload.type);

    let message: { text?: string; caption?: string; snapshotImageUrl?: string };
    let channelIds: string[] = [];

    // Determine which channels to publish to
    if (payload.channelId) {
      // Check if channelId is a UUID (from telegram_channels table) or actual channel ID
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.channelId);

      if (isUuid) {
        // Look up the actual channel_id from the UUID
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
        // Already a channel ID (e.g., "-1002607859974")
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
      console.error('No active channels found for publishing');
      return new Response(
        JSON.stringify({ error: 'No active channels found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Publishing to Telegram channels:', channelIds);

    // Format message based on type
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

    // Send to all channels
    const results = [];
    for (const channelId of channelIds) {
      try {
        let result;
        if (message.snapshotImageUrl && message.caption) {
          result = await sendTelegramPhoto(channelId, message.snapshotImageUrl, message.caption);
        } else if (message.text) {
          result = await sendTelegramMessage(channelId, message.text);
        }
        results.push({ channelId, success: true, result });
      } catch (error: any) {
        console.error(`Failed to send to ${channelId}:`, error);
        results.push({ channelId, success: false, error: error.message });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in indices-telegram-publisher:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});