import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

/**
 * End-of-day report generator.
 *
 * Generates one channel-scoped HTML report per (analyst × channel) pair, using
 * generate-advanced-daily-report as the backend so that channel isolation and
 * is_testing filtering are consistent across all report functions.
 *
 * Called by cron at 9 PM UTC (end of trading day). Supersedes the legacy
 * single-report-broadcast approach.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Accept optional target date from body
    let body: { date?: string; scheduled?: boolean } = {};
    if (req.method === 'POST') {
      try { body = await req.json(); } catch { /* no body */ }
    }
    const reportDate = body.date || new Date().toISOString().split('T')[0];

    console.log(`[PDF Report] End-of-day generation for ${reportDate}`);

    // Fetch all enabled report settings
    const { data: enabledSettings, error: settingsError } = await supabase
      .from('report_settings')
      .select('*')
      .eq('enabled', true);

    if (settingsError) throw settingsError;

    if (!enabledSettings || enabledSettings.length === 0) {
      console.log('[PDF Report] No enabled report settings found');
      return new Response(
        JSON.stringify({ message: 'No analysts with enabled auto-reports', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = [];

    for (const settings of enabledSettings) {
      const analystId = settings.analyst_id;

      // Collect channels for this analyst (same logic as auto-daily-reports-scheduler)
      let targetChannels: Array<{ channelUuid: string; chatId: string }> = [];

      const settingsChannelIds: string[] = [
        settings.default_channel_id,
        ...(settings.extra_channel_ids || [])
      ].filter(Boolean);

      if (settingsChannelIds.length > 0) {
        const { data: channelRows } = await supabase
          .from('telegram_channels')
          .select('id, channel_id')
          .in('id', settingsChannelIds);

        for (const row of channelRows || []) {
          if (row.channel_id) {
            targetChannels.push({ channelUuid: row.id, chatId: row.channel_id });
          }
        }
      }

      if (targetChannels.length === 0) {
        const { data: plans } = await supabase
          .from('analyzer_plans')
          .select(`id, telegram_channel_id, telegram_channels!telegram_channel_id(id, channel_id)`)
          .eq('analyst_id', analystId)
          .eq('is_active', true)
          .not('telegram_channel_id', 'is', null);

        for (const plan of plans || []) {
          const ch = (plan as any).telegram_channels;
          if (ch?.channel_id) {
            targetChannels.push({ channelUuid: ch.id, chatId: ch.channel_id });
          }
        }
      }

      if (targetChannels.length === 0) {
        console.log(`[PDF Report] No channels for analyst ${analystId}, skipping`);
        results.push({ analyst_id: analystId, status: 'skipped', reason: 'no channels' });
        continue;
      }

      // Deduplicate
      const seen = new Set<string>();
      targetChannels = targetChannels.filter(c => {
        if (seen.has(c.channelUuid)) return false;
        seen.add(c.channelUuid);
        return true;
      });

      let channelsSent = 0;

      for (const { channelUuid, chatId } of targetChannels) {
        try {
          // Generate a channel-specific report via generate-advanced-daily-report.
          // This ensures is_testing=false and telegram_channel_id filtering are applied.
          const generateResponse = await fetch(
            `${supabaseUrl}/functions/v1/generate-advanced-daily-report`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify({
                date: reportDate,
                analyst_id: analystId,
                language_mode: settings.language_mode || 'dual',
                telegram_channel_id: channelUuid,
                dry_run: false,
              }),
            }
          );

          if (!generateResponse.ok) {
            const errText = await generateResponse.text();
            console.error(`[PDF Report] Generation failed for channel ${channelUuid}: ${errText}`);
            continue;
          }

          const generatedData = await generateResponse.json();
          const reportId = generatedData.report_id;

          console.log(`[PDF Report] Report ${reportId} generated for channel ${channelUuid}`);

          if (!botToken) {
            console.warn('[PDF Report] No TELEGRAM_BOT_TOKEN, skipping send');
            continue;
          }

          const { data: report } = await supabase
            .from('daily_trade_reports')
            .select('*')
            .eq('id', reportId)
            .single();

          if (!report) continue;

          // Send summary message
          const message =
            `📊 <b>End-of-Day Trading Report</b>\n` +
            `📅 ${report.report_date}\n\n` +
            `🎯 <b>Summary</b>\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📌 Total Trades: <b>${report.summary?.total_trades || 0}</b>\n` +
            `🔵 Active: <b>${report.summary?.active_trades || 0}</b>\n` +
            `✅ Closed: <b>${report.summary?.closed_trades || 0}</b>\n` +
            `⏰ Expired: <b>${report.summary?.expired_trades || 0}</b>\n\n` +
            `💰 Avg Profit: <b>${report.summary?.avg_profit_percent != null
              ? (report.summary.avg_profit_percent >= 0 ? '+' : '') +
                report.summary.avg_profit_percent.toFixed(1) + '%'
              : 'N/A'}</b>\n` +
            `🚀 Max Profit: <b>+${report.summary?.max_profit_percent?.toFixed(1) || 0}%</b>\n` +
            `🎯 Win Rate: <b>${report.summary?.win_rate?.toFixed(1) || 0}%</b>\n\n` +
            `<i>📎 Full report attached</i>`;

          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
          });

          // Send HTML report as document
          if (report.html_content) {
            const formData = new FormData();
            formData.append('chat_id', chatId);
            const htmlBlob = new Blob([report.html_content], { type: 'text/html' });
            formData.append('document', htmlBlob, `EOD_Report_${report.report_date}.html`);
            formData.append('caption', `📊 End-of-Day Report — ${report.report_date}`);

            await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
              method: 'POST',
              body: formData,
            });
          }

          await supabase.from('report_deliveries').insert({
            report_id: reportId,
            channel_id: chatId,
            status: 'sent',
            sent_at: new Date().toISOString(),
          });

          channelsSent++;
          console.log(`[PDF Report] Sent to channel ${chatId}`);
        } catch (err) {
          console.error(`[PDF Report] Error for channel ${chatId}:`, err);
        }
      }

      results.push({
        analyst_id: analystId,
        status: 'success',
        channels_sent: channelsSent,
        channels_total: targetChannels.length,
      });
    }

    console.log('[PDF Report] Completed:', results);

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[PDF Report] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
