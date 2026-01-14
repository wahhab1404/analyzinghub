import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function processOutboxDirectly() {
  console.log('=== Processing Outbox Directly ===\n');

  // Get pending messages
  const { data: messages, error } = await supabase
    .from('telegram_outbox')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching messages:', error);
    return;
  }

  console.log(`Found ${messages?.length || 0} pending messages\n`);

  for (const msg of messages || []) {
    console.log('Message:', msg.id);
    console.log('Type:', msg.message_type);
    console.log('Channel:', msg.channel_id);
    console.log('Status:', msg.status);
    console.log('');

    if (msg.message_type === 'new_high') {
      const payload = msg.payload as any;
      const trade = payload.trade;

      // Format message
      const entryPrice = trade.entry_contract_snapshot?.mid || 4.05;
      const highPrice = payload.highPrice;
      const gainPercent = payload.gainPercent;

      const message = `🎯 *NEW HIGH ALERT!*\n\n` +
        `${trade.analysis.title}\n` +
        `${trade.analysis.index_symbol} ${trade.direction.toUpperCase()} $${trade.strike}\n\n` +
        `📈 *Entry:* $${entryPrice.toFixed(2)}\n` +
        `🔥 *New High:* $${highPrice.toFixed(2)}\n` +
        `💰 *Gain:* +${gainPercent}%\n\n` +
        `Keep monitoring! 🚀`;

      console.log('Sending message to Telegram...');
      console.log('─'.repeat(60));
      console.log(message);
      console.log('─'.repeat(60));
      console.log('');

      // Send to Telegram
      const botToken = process.env.TELEGRAM_BOT_TOKEN!;
      const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

      try {
        const response = await fetch(telegramUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: msg.channel_id,
            text: message,
            parse_mode: 'Markdown',
          }),
        });

        const result = await response.json();

        if (result.ok) {
          console.log('✅ Message sent successfully!');
          console.log('Telegram Message ID:', result.result.message_id);

          // Update status
          await supabase
            .from('telegram_outbox')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              telegram_message_id: result.result.message_id.toString(),
            })
            .eq('id', msg.id);

          console.log('Updated message status to sent');
        } else {
          console.error('❌ Telegram error:', result);

          await supabase
            .from('telegram_outbox')
            .update({
              status: 'failed',
              failed_at: new Date().toISOString(),
              last_error: JSON.stringify(result),
            })
            .eq('id', msg.id);
        }
      } catch (err: any) {
        console.error('❌ Error sending:', err.message);

        await supabase
          .from('telegram_outbox')
          .update({
            status: 'failed',
            failed_at: new Date().toISOString(),
            last_error: err.message,
          })
          .eq('id', msg.id);
      }
    }
    console.log('');
  }
}

processOutboxDirectly().catch(console.error);
