import { getMarketStatus, formatMarketTime } from '../lib/market-hours';

console.log('=== Testing Market Status ===\n');

const now = new Date();
console.log('Current time (system):', now.toString());
console.log('Current time (UTC):', now.toUTCString());

const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
console.log('Current time (ET):', etTime.toString());
console.log('Current time (ET formatted):', formatMarketTime());

const dayOfWeek = etTime.getDay();
const hours = etTime.getHours();
const minutes = etTime.getMinutes();
const timeInMinutes = hours * 60 + minutes;

console.log('\nTime breakdown:');
console.log('- Day of week:', dayOfWeek, '(0=Sun, 6=Sat)');
console.log('- Hours:', hours);
console.log('- Minutes:', minutes);
console.log('- Time in minutes:', timeInMinutes);
console.log('- Market open time:', 9 * 60 + 30, '(9:30 AM)');
console.log('- Market close time:', 16 * 60, '(4:00 PM)');

const status = getMarketStatus();
console.log('\nMarket Status:');
console.log(JSON.stringify(status, null, 2));
