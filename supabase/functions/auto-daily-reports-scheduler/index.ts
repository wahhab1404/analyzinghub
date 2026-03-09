import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log('[Auto Scheduler] Starting daily reports generation');

    const { data: enabledSettings, error: settingsError } = await supabase
      .from('report_settings')
      .select(`
        *,
        analyst:profiles!analyst_id(id, full_name, email)
      `)
      .eq('enabled', true);

    if (settingsError) throw settingsError;

    if (!enabledSettings || enabledSettings.length === 0) {
      console.log('[Auto Scheduler] No enabled settings found');
      return new Response(
        JSON.stringify({ message: 'No analysts with enabled auto-reports', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = [];

    for (const settings of enabledSettings) {
      try {
        const analystId = settings.analyst_id;
        const today = new Date();
        const reportDate = today.toISOString().split('T')[0];

        if (settings.last_generated_date === reportDate) {
          console.log(`[Auto Scheduler] Report already generated today for analyst ${analystId}`);
          continue;
        }

        console.log(`[Auto Scheduler] Processing analyst ${analystId}`);

        // Collect all channels for this analyst
        let targetChannels: Array<{ channelUuid: string; chatId: string }> = [];

        // 1. Channels from report_settings (default + extra)
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

        // 2. Fallback: channels from analyzer_plans if none found above
        if (targetChannels.length === 0) {
          const { data: plans } = await supabase
            .from('analyzer_plans')
            .select(`
              id,
              telegram_channel_id,
              telegram_channels!telegram_channel_id(id, channel_id)
            `)
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
          console.log(`[Auto Scheduler] No channels found for analyst ${analystId}, skipping`);
          results.push({ analyst_id: analystId, status: 'skipped', reason: 'no channels' });
          continue;
        }

        // Deduplicate by channelUuid
        const seen = new Set<string>();
        targetChannels = targetChannels.filter(c => {
          if (seen.has(c.channelUuid)) return false;
          seen.add(c.channelUuid);
          return true;
        });

        console.log(`[Auto Scheduler] Analyst ${analystId} has ${targetChannels.length} channel(s)`);

        let channelsSent = 0;

        for (const { channelUuid, chatId } of targetChannels) {
          try {
            // Generate a channel-specific report (filtered to this channel's trades)
            const generateResponse = await fetch(`${supabaseUrl}/functions/v1/generate-advanced-daily-report`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceRoleKey}`
              },
              body: JSON.stringify({
                date: reportDate,
                analyst_id: analystId,
                language_mode: settings.language_mode || 'dual',
                telegram_channel_id: channelUuid,
                dry_run: false
              })
            });

            if (!generateResponse.ok) {
              throw new Error(`Generation failed for channel ${channelUuid}: ${await generateResponse.text()}`);
            }

            const generatedData = await generateResponse.json();
            const reportId = generatedData.report_id;

            console.log(`[Auto Scheduler] Report ${reportId} generated for channel ${channelUuid}, sending to chat ${chatId}`);

            if (!botToken) {
              console.warn('[Auto Scheduler] No TELEGRAM_BOT_TOKEN, skipping send');
              continue;
            }

            const { data: report } = await supabase
              .from('daily_trade_reports')
              .select('*')
              .eq('id', reportId)
              .single();

            if (!report) continue;

            const message = `📊 <b>Daily Trading Report</b>\n📅 ${report.report_date}\n\n🎯 <b>Summary</b>\n━━━━━━━━━━━━━━━━━━━━\n📌 Total Trades: <b>${report.summary?.total_trades || 0}</b>\n🔵 Active: <b>${report.summary?.active_trades || 0}</b>\n✅ Closed: <b>${report.summary?.closed_trades || 0}</b>\n⏰ Expired: <b>${report.summary?.expired_trades || 0}</b>\n\n💰 Avg Profit: <b>${report.summary?.avg_profit_percent ? (report.summary.avg_profit_percent >= 0 ? '+' : '') + report.summary.avg_profit_percent.toFixed(1) + '%' : 'N/A'}</b>\n🚀 Max Profit: <b>+${report.summary?.max_profit_percent?.toFixed(1) || 0}%</b>\n🎯 Win Rate: <b>${report.summary?.win_rate?.toFixed(1) || 0}%</b>\n\n<i>📎 Full report attached</i>`;

            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
              })
            });

            if (report.html_content) {
              const formData = new FormData();
              formData.append('chat_id', chatId);
              const htmlBlob = new Blob([report.html_content], { type: 'text/html' });
              formData.append('document', htmlBlob, `Daily_Report_${report.report_date}.html`);
              formData.append('caption', `📊 Daily Trading Report - ${report.report_date}`);

              await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
                method: 'POST',
                body: formData
              });
            }

            await supabase
              .from('report_deliveries')
              .insert({
                report_id: reportId,
                channel_id: chatId,
                status: 'sent',
                sent_at: new Date().toISOString()
              });

            channelsSent++;
            console.log(`[Auto Scheduler] Sent to channel ${chatId}`);
          } catch (err) {
            console.error(`[Auto Scheduler] Failed for channel ${chatId}:`, err);
          }
        }

        await supabase
          .from('report_settings')
          .update({ last_generated_date: reportDate })
          .eq('analyst_id', analystId);

        results.push({
          analyst_id: analystId,
          status: 'success',
          channels_sent: channelsSent,
          channels_total: targetChannels.length
        });

      } catch (error) {
        console.error(`[Auto Scheduler] Error for analyst ${settings.analyst_id}:`, error);
        results.push({
          analyst_id: settings.analyst_id,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    console.log('[Auto Scheduler] Completed:', results);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Auto Scheduler] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
