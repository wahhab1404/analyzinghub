#!/usr/bin/env node

/**
 * Supabase Credentials Verification Script
 * Checks that all credentials match the correct project
 */

require('dotenv').config();

const CORRECT_PROJECT_ID = 'gbdzhdlpbwrnhykmstic';
const WRONG_PROJECT_ID = 'vjmbqaaxvlcpkbqknwwd';

console.log('\n🔍 VERIFYING SUPABASE CREDENTIALS...\n');

// Check URL
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
console.log(`📍 Supabase URL: ${url}`);

if (!url) {
  console.error('❌ ERROR: NEXT_PUBLIC_SUPABASE_URL is not set!');
  process.exit(1);
}

if (url.includes(WRONG_PROJECT_ID)) {
  console.error(`❌ ERROR: Using WRONG project (${WRONG_PROJECT_ID})!`);
  console.error(`   Should be: https://${CORRECT_PROJECT_ID}.supabase.co`);
  process.exit(1);
}

if (!url.includes(CORRECT_PROJECT_ID)) {
  console.error(`❌ ERROR: URL doesn't match correct project ID!`);
  console.error(`   Expected: ${CORRECT_PROJECT_ID}`);
  process.exit(1);
}

console.log(`✅ URL is correct (${CORRECT_PROJECT_ID})`);

// Check Anon Key
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!anonKey) {
  console.error('❌ ERROR: NEXT_PUBLIC_SUPABASE_ANON_KEY is not set!');
  process.exit(1);
}

// Decode JWT to check project
try {
  const payload = JSON.parse(Buffer.from(anonKey.split('.')[1], 'base64').toString());
  console.log(`📍 Anon Key Project: ${payload.ref}`);

  if (payload.ref !== CORRECT_PROJECT_ID) {
    console.error(`❌ ERROR: Anon Key is for wrong project!`);
    console.error(`   Found: ${payload.ref}`);
    console.error(`   Expected: ${CORRECT_PROJECT_ID}`);
    process.exit(1);
  }

  console.log(`✅ Anon Key matches correct project (${CORRECT_PROJECT_ID})`);
} catch (e) {
  console.error('❌ ERROR: Could not decode Anon Key JWT');
  process.exit(1);
}

// Check Service Role Key
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error('❌ ERROR: SUPABASE_SERVICE_ROLE_KEY is not set!');
  process.exit(1);
}

try {
  const payload = JSON.parse(Buffer.from(serviceKey.split('.')[1], 'base64').toString());
  console.log(`📍 Service Role Key Project: ${payload.ref}`);

  if (payload.ref !== CORRECT_PROJECT_ID) {
    console.error(`❌ ERROR: Service Role Key is for wrong project!`);
    console.error(`   Found: ${payload.ref}`);
    console.error(`   Expected: ${CORRECT_PROJECT_ID}`);
    process.exit(1);
  }

  console.log(`✅ Service Role Key matches correct project (${CORRECT_PROJECT_ID})`);
} catch (e) {
  console.error('❌ ERROR: Could not decode Service Role Key JWT');
  process.exit(1);
}

// Final check
console.log('\n✅ ALL CREDENTIALS ARE CORRECT!\n');
console.log(`✅ All keys match project: ${CORRECT_PROJECT_ID}`);
console.log(`✅ Dashboard: https://supabase.com/dashboard/project/${CORRECT_PROJECT_ID}\n`);
