#!/usr/bin/env tsx

/**
 * Test the snapshot-html endpoint
 * Usage: tsx scripts/test-snapshot-endpoint.ts <trade-id>
 */

import 'dotenv/config';

const tradeId = process.argv[2] || 'test-id';
const baseUrl = process.env.APP_BASE_URL || 'https://analyzhub.com';
const testUrl = `${baseUrl}/api/indices/trades/${tradeId}/snapshot-html`;

console.log('Testing snapshot endpoint...');
console.log('URL:', testUrl);
console.log('');

async function testEndpoint() {
  try {
    const response = await fetch(testUrl);

    console.log('Status:', response.status, response.statusText);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));
    console.log('');

    if (response.ok) {
      const html = await response.text();
      console.log('Response length:', html.length, 'bytes');
      console.log('First 500 characters:');
      console.log(html.substring(0, 500));
      console.log('\n✅ Endpoint is working!');
    } else {
      const text = await response.text();
      console.log('Error response:', text);
      console.log('\n❌ Endpoint returned an error');
    }
  } catch (error: any) {
    console.error('❌ Failed to reach endpoint:', error.message);
  }
}

testEndpoint();
