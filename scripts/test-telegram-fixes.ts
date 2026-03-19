/**
 * Test script for Telegram bot fixes.
 *
 * Tests:
 * 1. send-trade-ad route compiles correctly (no wrong import)
 * 2. indices-telegram-publisher BASE_URL typo is fixed
 * 3. /start resets session in webhook
 * 4. errorKeyboard has single back-to-menu button
 * 5. indices-telegram-publisher photo fallback logic
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

// ─── Test 1: send-trade-ad route uses correct Supabase client ─────────────────

console.log('\n[1] send-trade-ad/route.ts — Supabase client import');

const sendTradeAdRoute = readFile('app/api/telegram/send-trade-ad/route.ts');

test('does NOT import createRouteHandlerClient from @supabase/ssr', () => {
  assert(
    !sendTradeAdRoute.includes('createRouteHandlerClient'),
    'createRouteHandlerClient still present in file'
  );
});

test('imports createClient from @/lib/supabase/server', () => {
  assert(
    sendTradeAdRoute.includes("from '@/lib/supabase/server'"),
    "Missing import from '@/lib/supabase/server'"
  );
});

test('imports cookies from next/headers', () => {
  assert(
    sendTradeAdRoute.includes("from 'next/headers'"),
    "Missing 'next/headers' import"
  );
});

test('creates supabase client with cookieStore', () => {
  assert(
    sendTradeAdRoute.includes('createClient(cookieStore)'),
    'Missing createClient(cookieStore) call'
  );
});

test('calls supabase.auth.getUser() for auth', () => {
  assert(
    sendTradeAdRoute.includes('supabase.auth.getUser()'),
    'Missing auth.getUser() call'
  );
});

test('passes userId to edge function', () => {
  assert(
    sendTradeAdRoute.includes('userId: user.id'),
    'Missing userId in edge function body'
  );
});

// ─── Test 2: indices-telegram-publisher BASE_URL typo fixed ───────────────────

console.log('\n[2] indices-telegram-publisher/index.ts — BASE_URL typo');

const publisher = readFile('supabase/functions/indices-telegram-publisher/index.ts');

test('does NOT contain analyzhub.com (typo)', () => {
  assert(
    !publisher.includes('analyzhub.com'),
    "Typo 'analyzhub.com' still present in publisher"
  );
});

test('contains correct analyzinghub.com fallback', () => {
  assert(
    publisher.includes('analyzinghub.com'),
    "Missing 'analyzinghub.com' fallback URL"
  );
});

// ─── Test 3: Photo fallback in publisher ─────────────────────────────────────

console.log('\n[3] indices-telegram-publisher/index.ts — photo fallback');

test('contains try/catch around sendTelegramPhoto', () => {
  assert(
    publisher.includes('falling back to text'),
    'Missing photo-to-text fallback log message'
  );
});

test('falls back to sendTelegramMessage on photo error', () => {
  // Check that after the photo catch block, it sends a text message
  const photoFallbackIdx = publisher.indexOf('falling back to text');
  const textFallbackIdx = publisher.indexOf('sendTelegramMessage', photoFallbackIdx);
  assert(
    photoFallbackIdx > -1 && textFallbackIdx > photoFallbackIdx,
    'No sendTelegramMessage call found after photo fallback'
  );
});

// ─── Test 4: /start resets session in webhook ─────────────────────────────────

console.log('\n[4] webhook/route.ts — /start resets session');

const webhook = readFile('app/api/telegram/webhook/route.ts');

test('/start handler calls sessions.reset(chatId)', () => {
  // Find the /start section and check for reset
  const startIdx = webhook.indexOf("text.startsWith('/start')");
  const nextSectionIdx = webhook.indexOf("text === '/menu'", startIdx);
  const startSection = webhook.slice(startIdx, nextSectionIdx);
  assert(
    startSection.includes('sessions.reset(chatId)'),
    '/start handler does not reset session'
  );
});

test('/menu handler calls sessions.reset(chatId)', () => {
  const menuIdx = webhook.indexOf("text === '/menu'");
  const nextSectionIdx = webhook.indexOf("text === '/help'", menuIdx);
  const menuSection = webhook.slice(menuIdx, nextSectionIdx);
  assert(
    menuSection.includes('sessions.reset(chatId)'),
    '/menu handler does not reset session'
  );
});

// ─── Test 5: errorKeyboard has single button ──────────────────────────────────

console.log('\n[5] menu-keyboards.ts — errorKeyboard single button');

const keyboards = readFile('lib/telegram/menu-keyboards.ts');

test('errorKeyboard does not contain duplicate CTA.try_again and CTA.back_to_menu in same row', () => {
  const errorFnStart = keyboards.indexOf('export function errorKeyboard');
  const errorFnEnd = keyboards.indexOf('\n}', errorFnStart) + 2;
  const errorFnBody = keyboards.slice(errorFnStart, errorFnEnd);

  const tryAgainCount = (errorFnBody.match(/CTA\.try_again/g) || []).length;
  const backToMenuCount = (errorFnBody.match(/CTA\.back_to_menu/g) || []).length;

  // Should have 0 try_again (removed the duplicate) and 1 back_to_menu
  assert(tryAgainCount === 0, `errorKeyboard still has CTA.try_again (count: ${tryAgainCount})`);
  assert(backToMenuCount === 1, `errorKeyboard should have 1 CTA.back_to_menu (found: ${backToMenuCount})`);
});

// ─── Test 6: message-formatter generates correct image URL ───────────────────

console.log('\n[6] message-formatter.ts — snapshotImageUrl construction');

const formatter = readFile('supabase/functions/indices-telegram-publisher/message-formatter.ts');

test('formatTradeMessage builds snapshotImageUrl correctly', () => {
  assert(
    formatter.includes('/api/indices/trades/'),
    'Missing trades API path in snapshotImageUrl'
  );
  assert(
    formatter.includes('generate-image'),
    'Missing generate-image in snapshotImageUrl'
  );
  assert(
    formatter.includes('isNewHigh=true'),
    'Missing isNewHigh param in snapshotImageUrl'
  );
});

// ─── Test 7: generate-image route exists and has correct runtime ──────────────

console.log('\n[7] generate-image/route.tsx — route structure');

const generateImage = readFile('app/api/indices/trades/[id]/generate-image/route.tsx');

test('generate-image uses nodejs runtime', () => {
  assert(
    generateImage.includes("runtime = 'nodejs'"),
    "Missing 'nodejs' runtime declaration"
  );
});

test('generate-image has force-dynamic', () => {
  assert(
    generateImage.includes("dynamic = 'force-dynamic'"),
    "Missing 'force-dynamic' directive"
  );
});

test('generate-image exports GET handler', () => {
  assert(
    generateImage.includes('export async function GET'),
    'Missing GET handler export'
  );
});

test('generate-image handles isNewHigh param', () => {
  assert(
    generateImage.includes("searchParams.get('isNewHigh')"),
    'Missing isNewHigh query param handling'
  );
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('Some tests failed!');
  process.exit(1);
} else {
  console.log('All tests passed! ✅');
}
