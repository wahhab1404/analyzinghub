/**
 * POST /api/indices/trades/[id]/snapshot-image
 *
 * Pre-generates the trade alert PNG and stores it in Supabase Storage.
 * Saves the public URL to index_trades.alert_image_url.
 *
 * Called at trade creation / activation so the buy-range-alert-checker can
 * send a Telegram photo instantly using a URL (no on-demand rendering at alert time).
 *
 * Returns: { url: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'trade-alert-images';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const t0 = Date.now();
  const { id: tradeId } = await context.params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  console.log(`[snapshot-image] ── SNAPSHOT GENERATE ── tradeId: ${tradeId}`);

  // ── 1. Generate PNG from the generate-image endpoint ──────────────────────
  const origin = new URL(request.url).origin;
  const imageUrl = `${origin}/api/indices/trades/${tradeId}/generate-image`;

  console.log(`[snapshot-image] Fetching PNG from: ${imageUrl}`);

  let imgBytes: ArrayBuffer;
  try {
    const imgRes = await fetch(imageUrl, {
      headers: { Accept: 'image/png' },
      signal: AbortSignal.timeout(35_000),
    });

    if (!imgRes.ok) {
      const body = await imgRes.text().catch(() => '(unreadable)');
      console.error(`[snapshot-image] generate-image returned ${imgRes.status}: ${body.substring(0, 300)}`);
      return NextResponse.json({ error: `Image generation failed (${imgRes.status})` }, { status: 502 });
    }

    const ct = imgRes.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) {
      const body = await imgRes.text().catch(() => '(unreadable)');
      console.error(`[snapshot-image] Unexpected content-type "${ct}": ${body.substring(0, 200)}`);
      return NextResponse.json({ error: 'Unexpected content-type from image generator' }, { status: 502 });
    }

    imgBytes = await imgRes.arrayBuffer();
    console.log(`[snapshot-image] PNG received — ${imgBytes.byteLength} bytes — ${Date.now() - t0}ms`);
  } catch (err: any) {
    console.error(`[snapshot-image] Image fetch failed: ${err.message}`);
    return NextResponse.json({ error: `Image fetch failed: ${err.message}` }, { status: 500 });
  }

  // ── 2. Ensure storage bucket exists ───────────────────────────────────────
  await supabase.storage
    .createBucket(BUCKET, { public: true, fileSizeLimit: 5_242_880 })
    .catch(() => {}); // Ignore error — bucket likely already exists

  // ── 3. Upload PNG to Supabase Storage ─────────────────────────────────────
  const storagePath = `trades/${tradeId}/alert.png`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, imgBytes, {
      contentType: 'image/png',
      upsert: true,
    });

  if (uploadError) {
    console.error(`[snapshot-image] Storage upload failed: ${uploadError.message}`);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // ── 4. Get public URL ──────────────────────────────────────────────────────
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  const publicUrl = urlData.publicUrl;

  console.log(`[snapshot-image] Uploaded — URL: ${publicUrl}`);

  // ── 5. Save URL to trade row ───────────────────────────────────────────────
  const { error: dbError } = await supabase
    .from('index_trades')
    .update({ alert_image_url: publicUrl })
    .eq('id', tradeId);

  if (dbError) {
    console.error(`[snapshot-image] DB update failed: ${dbError.message}`);
    // Non-fatal — URL is in storage even if DB write failed
  }

  console.log(`[snapshot-image] ✅ Done — ${Date.now() - t0}ms — tradeId: ${tradeId}`);

  return NextResponse.json({ url: publicUrl });
}
