const TELEGRAM_BOT_TOKEN = '8311641714:AAFeqfvTaFo1b1vVAJxfh86A2m-zRHEXPQ0';
const CHANNEL_ID = '-1002607859974';

async function sendTest() {
  const message = `🚀 <b>NEW HIGH ALERT | تنبيه قمة جديدة!</b>

<b>Index | المؤشر:</b> SPX
<b>Direction | الاتجاه:</b> PUT | بيع
<b>Strike | السعر:</b> $6870
<b>Entry | الدخول:</b> $4.05
<b>Current | الحالي:</b> $8.20
<b>New High | القمة الجديدة:</b> $8.20 🎉
<b>Gain | المكسب:</b> +102.47%

<b>Analyst | المحلل:</b> Analyzer

<a href="https://analyzhub.com/dashboard/analysis/f2032f1b-f32d-4782-b3aa-b5212e4b331b">📊 View Analysis | عرض التحليل</a>`;

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHANNEL_ID,
      text: message,
      parse_mode: 'HTML',
    })
  });

  const result = await response.json();
  console.log('✅ Test message with Arabic sent!');
  console.log('Message ID:', result.result?.message_id);
  console.log('Has Arabic:', message.includes('تنبيه') ? 'YES ✓' : 'NO ✗');
}

sendTest();
