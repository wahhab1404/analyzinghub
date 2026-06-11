/**
 * GET /api/indices/trades/[id]/generate-image
 *
 * Generates a professional PNG alert card for a trade using satori + resvg-wasm.
 *
 * WHY satori + @resvg/resvg-wasm instead of @vercel/og:
 *   @vercel/og's Node.js mode uses @resvg/resvg-js (a native C++ binary).
 *   On Netlify, the native binary compiled during CI build is incompatible with
 *   the Lambda execution environment (ABI/glibc mismatch), causing silent 500s.
 *   @resvg/resvg-wasm is platform-independent WebAssembly — works everywhere.
 *
 * Flow:
 *   1. Load WASM + fonts once at cold-start (cached for warm invocations)
 *   2. Fetch trade from Supabase (service-role, no user auth needed)
 *   3. Build JSX layout
 *   4. satori(jsx) → SVG string
 *   5. Resvg(svg).render().asPng() → PNG Uint8Array
 *   6. Return as image/png
 *
 * Canvas: 1000×560 — optimal for Telegram inline photo preview.
 * Runtime: nodejs (Netlify Lambda)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import satori from 'satori';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { readFileSync } from 'fs';
import path from 'path';
import React from 'react';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Design tokens ──────────────────────────────────────────────────────────
const C = {
  bg:       '#0A0E13',
  card:     '#111720',
  elevated: '#161D28',
  border:   '#1E2A38',
  divider:  '#1A2332',
  text:     '#E8EFF7',
  textSub:  '#8DA0B8',
  textMuted:'#4D6278',
  call:     '#27C76F',
  put:      '#F03E3E',
  blue:     '#3B9EFF',
  gold:     '#F5A623',
  callBg:   'rgba(39,199,111,0.10)',
  putBg:    'rgba(240,62,62,0.10)',
  callBd:   'rgba(39,199,111,0.25)',
  putBd:    'rgba(240,62,62,0.25)',
  goldBg:   'rgba(245,166,35,0.12)',
  goldBd:   'rgba(245,166,35,0.28)',
  blueBg:   'rgba(59,158,255,0.10)',
  blueBd:   'rgba(59,158,255,0.25)',
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function safeNum(v: any, fallback = 0): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}
function fmt(n: number): string { return n.toFixed(2); }
function compactNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

// ─── WASM + Font singleton ───────────────────────────────────────────────────
// On Netlify Lambda: module scope persists across warm invocations.
// initPromise ensures WASM is only initialised once per process lifetime.

// Durable asset loading (matches lib/companies/contract-trade-image.tsx):
// read the bundled file if Netlify traced it into the Lambda, else fetch from a
// CDN. This fixes the "ENOENT index_bg.wasm" tracing failure that blocked all
// index-trade images. Fonts are fetched as real TTF (satori rejects the bundled
// WOFF2 with "Unsupported OpenType signature wOF2").
const WASM_CDN = 'https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm';
const FONT_REG_CDN = 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf';
const FONT_BOLD_CDN = 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf';

async function fetchAsset(cdnUrl: string): Promise<Buffer> {
  const res = await fetch(cdnUrl);
  if (!res.ok) throw new Error(`Failed to fetch asset ${cdnUrl}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

let initPromise: Promise<{ fontReg: Buffer; fontBold: Buffer }> | null = null;

function ensureInit(): Promise<{ fontReg: Buffer; fontBold: Buffer }> {
  if (!initPromise) {
    initPromise = (async () => {
      // ── WASM ──────────────────────────────────────────────────────────────
      // Must be initialised before any Resvg instance is created. Read the
      // bundled file if traced into the Lambda, else fetch from the CDN.
      const wasmPath = path.join(
        process.cwd(),
        'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm'
      );
      let wasmBuffer: Buffer;
      try {
        wasmBuffer = readFileSync(wasmPath);
      } catch {
        wasmBuffer = await fetchAsset(WASM_CDN);
      }

      // ── Fonts ─────────────────────────────────────────────────────────────
      // Real TTF from the Fontsource CDN (satori rejects the bundled WOFF2).
      const [fontReg, fontBold] = await Promise.all([
        fetchAsset(FONT_REG_CDN),
        fetchAsset(FONT_BOLD_CDN),
      ]);

      try {
        await initWasm(wasmBuffer);
      } catch (e: any) {
        // initWasm throws if already initialised in this (warm) process — ignore.
        if (!String(e?.message || e).includes('Already initialized')) throw e;
      }
      console.log('[generate-image] ✅ resvg WASM + Inter TTF fonts ready');

      return { fontReg, fontBold };
    })().catch(err => {
      // Reset so the next request retries initialisation
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

// ─── Route handler ───────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const t0 = Date.now();
  console.log('[generate-image] ──────────────────────────────────────────');
  console.log('[generate-image] IMAGE GENERATION STARTED');
  console.log('[generate-image] Request URL:', request.url);

  try {
    const { id: tradeId } = await context.params;
    const { searchParams } = new URL(request.url);
    const isNewHigh = searchParams.get('isNewHigh') === 'true';
    const rawNewHigh = searchParams.get('newHighPrice');
    const newHighPrice: number | null = rawNewHigh ? safeNum(rawNewHigh) : null;

    console.log('[generate-image]', { tradeId, isNewHigh, newHighPrice });

    // ── Supabase ────────────────────────────────────────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      console.error('[generate-image] ❌ Missing SUPABASE env vars');
      return new NextResponse('Server configuration error', { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Fetch trade ─────────────────────────────────────────────────────────
    const { data: trade, error: tradeError } = await supabase
      .from('index_trades')
      .select('*, author:profiles!author_id(id, full_name)')
      .eq('id', tradeId)
      .single();

    if (tradeError || !trade) {
      console.error('[generate-image] ❌ Trade not found:', tradeError?.message);
      return new NextResponse('Trade not found', { status: 404 });
    }

    // Optional analysis info
    let analysisInfo: { id: string; title: string; index_symbol: string } | null = null;
    if (trade.analysis_id) {
      const { data } = await supabase
        .from('index_analyses')
        .select('id, title, index_symbol')
        .eq('id', trade.analysis_id)
        .maybeSingle();
      analysisInfo = data;
    }

    // ── Derived data ─────────────────────────────────────────────────────────
    const snap          = trade.entry_contract_snapshot ?? {};
    const entryPrice    = safeNum(snap.price ?? snap.mid ?? snap.last);
    const currentPrice  = safeNum(trade.current_contract, entryPrice);
    const highSince     = safeNum(trade.contract_high_since, currentPrice);

    const underlyingSymbol: string =
      analysisInfo?.index_symbol ?? trade.underlying_index_symbol ?? 'SPX';
    const underlyingPrice = safeNum(
      trade.current_underlying ?? trade.entry_underlying_snapshot?.price
    );
    const underlyingEntryPrice = safeNum(
      trade.entry_underlying_snapshot?.price,
      underlyingPrice
    );
    const underlyingChangePct =
      underlyingEntryPrice > 0
        ? ((underlyingPrice - underlyingEntryPrice) / underlyingEntryPrice) * 100
        : 0;

    const strike    = safeNum(trade.strike);
    const optionType = (trade.option_type ?? trade.direction ?? 'call').toLowerCase();
    const isCall    = optionType === 'call';
    const accent    = isCall ? C.call : C.put;
    const accentBg  = isCall ? C.callBg : C.putBg;
    const accentBd  = isCall ? C.callBd : C.putBd;

    const expiry = trade.expiry
      ? new Date(trade.expiry).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: '2-digit',
        })
      : '';

    const targets: any[] = Array.isArray(trade.targets) ? trade.targets : [];
    const t1: number | null = safeNum(targets[0]?.level ?? targets[0]?.price) || null;
    const t2: number | null = safeNum(targets[1]?.level ?? targets[1]?.price) || null;
    const stop: number | null = safeNum(trade.stoploss?.level ?? trade.stoploss?.price) || null;

    const qty       = safeNum(trade.qty, 1) || 1;
    const oi        = safeNum(snap.open_interest ?? snap.oi);
    const vol       = safeNum(snap.volume ?? snap.v);
    const bid       = safeNum(snap.bid);
    const ask       = safeNum(snap.ask);
    const delta     = safeNum(snap.delta);
    const gamma     = safeNum(snap.gamma);
    const theta     = safeNum(snap.theta);
    const vega      = safeNum(snap.vega);
    const iv        = safeNum(snap.implied_volatility);
    const hasGreeks = delta !== 0 || gamma !== 0 || theta !== 0 || vega !== 0;
    const hasBidAsk = bid > 0 && ask > 0 && bid !== ask;

    const analystName: string = (trade.author as any)?.full_name ?? 'Analyst';
    const timeStr = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York',
    });

    // Extract clean symbol from polygon ticker
    let sym = underlyingSymbol;
    if (trade.polygon_option_ticker) {
      const parts = (trade.polygon_option_ticker as string).split(':');
      if (parts.length > 1) sym = parts[1].replace(/\d{6}[CP]\d{8}$/, '');
    }

    const statusLabel = (trade.status ?? 'active').toUpperCase().replace('_', ' ');

    console.log('[generate-image] ✅ Data resolved:', {
      sym, entryPrice, currentPrice, strike, expiry, isCall,
      t1, t2, stop, analystName, hasGreeks, hasBidAsk,
      elapsed_ms: Date.now() - t0,
    });

    // ── Ensure WASM + fonts are ready ────────────────────────────────────────
    const { fontReg, fontBold } = await ensureInit();

    const satoriOpts = {
      width: 1000,
      height: 560,
      fonts: [
        { name: 'Inter', data: fontReg.buffer as ArrayBuffer,  weight: 400 as const, style: 'normal' as const },
        { name: 'Inter', data: fontBold.buffer as ArrayBuffer, weight: 700 as const, style: 'normal' as const },
        { name: 'Inter', data: fontBold.buffer as ArrayBuffer, weight: 800 as const, style: 'normal' as const },
        { name: 'Inter', data: fontBold.buffer as ArrayBuffer, weight: 900 as const, style: 'normal' as const },
      ],
    };

    // ── NEW HIGH card ────────────────────────────────────────────────────────
    if (isNewHigh) {
      const dispHigh = newHighPrice ?? highSince;
      const gainPct  = entryPrice > 0 ? ((dispHigh - entryPrice) / entryPrice) * 100 : 0;
      const gainUsd  = (dispHigh - entryPrice) * qty * 100;

      console.log('[generate-image] Rendering NEW HIGH card');

      const newHighElement = React.createElement('div', {
        style: {
          width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          background: C.bg, fontFamily: 'Inter',
          position: 'relative', overflow: 'hidden',
        },
      },
        // Gold top accent bar
        React.createElement('div', { style: {
          position: 'absolute', top: 0, left: 0, right: 0, height: 5,
          background: `linear-gradient(90deg, ${C.gold} 0%, #FFD26F 50%, ${C.gold} 100%)`,
        } }),

        // Content
        React.createElement('div', {
          style: { display: 'flex', flex: 1, padding: '36px 52px 32px', flexDirection: 'column' },
        },
          // Top row
          React.createElement('div', {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
          },
            React.createElement('div', { style: { display: 'flex', gap: 10, alignItems: 'center' } },
              React.createElement('div', {
                style: {
                  background: C.goldBg, border: `1px solid ${C.goldBd}`,
                  borderRadius: 6, padding: '5px 14px',
                  color: C.gold, fontSize: 14, fontWeight: 700, letterSpacing: '0.08em',
                },
              }, 'ANALYZINGHUB'),
              strike > 0 && React.createElement('div', {
                style: {
                  background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 6, padding: '5px 14px',
                  color: C.textSub, fontSize: 14, fontWeight: 600,
                },
              }, `${sym} $${strike.toLocaleString()} ${isCall ? 'C' : 'P'}${expiry ? ` ${expiry}` : ''}`),
            ),
            React.createElement('div', {
              style: {
                background: C.goldBg, border: `1px solid ${C.goldBd}`,
                borderRadius: 7, padding: '7px 18px',
                color: C.gold, fontSize: 16, fontWeight: 800, letterSpacing: '0.06em',
              },
            }, '🚀 NEW HIGH ALERT'),
          ),

          // Main row
          React.createElement('div', { style: { display: 'flex', flex: 1, gap: 40, alignItems: 'flex-start' } },
            // Left
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', minWidth: 280 } },
              React.createElement('div', {
                style: { fontSize: 13, color: C.textMuted, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 },
              }, 'Contract High'),
              React.createElement('div', {
                style: { fontSize: 96, fontWeight: 900, color: C.gold, lineHeight: 1, letterSpacing: '-3px' },
              }, `$${fmt(dispHigh)}`),
              React.createElement('div', {
                style: { fontSize: 32, fontWeight: 700, color: C.call, marginTop: 6, letterSpacing: '-0.5px' },
              }, `+${gainPct.toFixed(1)}%`),
              React.createElement('div', {
                style: { fontSize: 18, color: C.textMuted, marginTop: 4 },
              }, `+$${gainUsd.toFixed(0)} per lot`),
            ),
            // Right
            React.createElement('div', {
              style: { display: 'flex', flexDirection: 'column', flex: 1, gap: 10, marginTop: 8 },
            },
              React.createElement('div', {
                style: {
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: C.card, borderRadius: 10, padding: '14px 18px', border: `1px solid ${C.border}`,
                },
              },
                React.createElement('div', { style: { fontSize: 13, color: C.textMuted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' } }, 'Entry'),
                React.createElement('div', { style: { fontSize: 28, fontWeight: 700, color: C.textSub } }, `$${fmt(entryPrice)}`),
              ),
              React.createElement('div', {
                style: {
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: C.goldBg, borderRadius: 10, padding: '14px 18px', border: `1px solid ${C.goldBd}`,
                },
              },
                React.createElement('div', { style: { fontSize: 13, color: C.textMuted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' } }, 'Max Gain'),
                React.createElement('div', { style: { fontSize: 28, fontWeight: 800, color: C.gold } }, `+${gainPct.toFixed(2)}%`),
              ),
              React.createElement('div', {
                style: {
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: C.callBg, borderRadius: 10, padding: '14px 18px', border: `1px solid ${C.callBd}`,
                },
              },
                React.createElement('div', { style: { fontSize: 13, color: C.textMuted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' } }, 'P/L (1 lot)'),
                React.createElement('div', { style: { fontSize: 28, fontWeight: 800, color: C.call } }, `+$${gainUsd.toFixed(0)}`),
              ),
              t1 !== null && React.createElement('div', {
                style: {
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: C.card, borderRadius: 10, padding: '14px 18px', border: `1px solid ${C.border}`,
                },
              },
                React.createElement('div', { style: { fontSize: 13, color: C.textMuted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' } }, 'Target 1'),
                React.createElement('div', { style: { fontSize: 28, fontWeight: 700, color: C.call } }, `$${fmt(t1)}`),
              ),
            ),
          ),

          // Footer
          React.createElement('div', {
            style: {
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              paddingTop: 16, marginTop: 16, borderTop: `1px solid ${C.divider}`,
            },
          },
            React.createElement('div', { style: { display: 'flex', gap: 10, alignItems: 'center' } },
              React.createElement('div', { style: { fontSize: 15, fontWeight: 700, color: C.textSub } }, underlyingSymbol),
              React.createElement('div', {
                style: { fontSize: 15, fontWeight: 600, color: underlyingChangePct >= 0 ? C.call : C.put },
              }, `$${fmt(underlyingPrice)} ${underlyingChangePct >= 0 ? '▲' : '▼'}${Math.abs(underlyingChangePct).toFixed(2)}%`),
            ),
            React.createElement('div', { style: { fontSize: 14, color: C.textMuted } },
              `${analystName} · ${timeStr} ET`
            ),
          ),
        ),
      );

      const svg = await satori(newHighElement, satoriOpts);
      const resvg = new Resvg(svg);
      const pngData = resvg.render();
      const pngBuffer = Buffer.from(pngData.asPng());

      console.log(`[generate-image] ✅ NEW HIGH PNG ready — ${pngBuffer.length} bytes — ${Date.now() - t0}ms`);

      return new NextResponse(pngBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': String(pngBuffer.length),
          'Cache-Control': 'no-cache, no-store',
        },
      });
    }

    // ── NEW TRADE card (Webull-style) ─────────────────────────────────────────
    console.log('[generate-image] Rendering NEW TRADE card, sym:', sym);

    const tradeElement = React.createElement('div', {
      style: {
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        background: C.bg, fontFamily: 'Inter',
        position: 'relative', overflow: 'hidden',
      },
    },
      // Top accent bar
      React.createElement('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: accent } }),

      // ── CONTRACT HEADER ROW ──
      React.createElement('div', {
        style: {
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 48px 14px', marginTop: 5,
        },
      },
        // Brand badge
        React.createElement('div', {
          style: {
            background: accentBg, border: `1px solid ${accentBd}`,
            borderRadius: 6, padding: '5px 13px',
            color: accent, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em',
          },
        }, 'ANALYZINGHUB'),

        // Contract label (center)
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 } },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
            React.createElement('div', { style: { fontSize: 28, fontWeight: 900, color: C.text, letterSpacing: '-0.5px' } }, sym),
            strike > 0 && React.createElement('div', { style: { fontSize: 26, fontWeight: 800, color: accent } }, `$${strike.toLocaleString()}`),
            React.createElement('div', {
              style: {
                background: accentBg, border: `1px solid ${accentBd}`,
                borderRadius: 6, padding: '3px 10px',
                color: accent, fontSize: 14, fontWeight: 800, letterSpacing: '0.08em',
              },
            }, isCall ? '▲ CALL' : '▼ PUT'),
          ),
          expiry && React.createElement('div', { style: { fontSize: 13, color: C.textMuted, fontWeight: 500 } }, `Expires ${expiry}`),
        ),

        // Status badge
        React.createElement('div', {
          style: {
            background: C.blueBg, border: `1px solid ${C.blueBd}`,
            borderRadius: 7, padding: '6px 16px',
            color: C.blue, fontSize: 13, fontWeight: 700, letterSpacing: '0.07em',
          },
        }, `● ${statusLabel}`),
      ),

      // Divider
      React.createElement('div', { style: { height: 1, background: C.divider, margin: '0 48px' } }),

      // ── CONTENT: LEFT + RIGHT PANELS ──
      React.createElement('div', { style: { display: 'flex', flex: 1 } },

        // ── LEFT PANEL ──
        React.createElement('div', {
          style: {
            display: 'flex', flexDirection: 'column',
            width: 460, padding: '20px 32px 28px 48px',
            borderRight: `1px solid ${C.divider}`,
          },
        },
          // Entry price dominant
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', marginBottom: 14 } },
            React.createElement('div', {
              style: { fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 2 },
            }, 'Entry Price'),
            React.createElement('div', {
              style: { fontSize: 82, fontWeight: 900, color: C.text, lineHeight: 1, letterSpacing: '-2.5px' },
            }, `$${fmt(entryPrice)}`),
            React.createElement('div', { style: { fontSize: 13, color: C.textMuted, marginTop: 4 } },
              `${qty} contract${qty !== 1 ? 's' : ''} · $${(entryPrice * qty * 100).toFixed(0)} total`
            ),
          ),

          // Bid / Ask / Mid row
          React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 10 } },
            ...[
              { label: 'Bid',  value: hasBidAsk ? bid : entryPrice, color: hasBidAsk ? C.put  : C.textSub },
              { label: 'Ask',  value: hasBidAsk ? ask : entryPrice, color: hasBidAsk ? C.call : C.textSub },
              { label: 'Mid',  value: hasBidAsk ? (bid + ask) / 2 : entryPrice, color: C.text },
            ].map(({ label, value, color }) =>
              React.createElement('div', {
                key: label,
                style: {
                  flex: 1, background: C.card, borderRadius: 8, padding: '9px 12px',
                  border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 2,
                },
              },
                React.createElement('div', { style: { fontSize: 10, color: C.textMuted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' } }, label),
                React.createElement('div', { style: { fontSize: 20, fontWeight: 700, color } }, `$${fmt(value)}`),
              )
            ),
          ),

          // OI / Volume row
          (oi > 0 || vol > 0) && React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 10 } },
            ...[
              oi > 0  && { label: 'Open Int', value: compactNum(oi) },
              vol > 0 && { label: 'Volume',   value: compactNum(vol) },
            ].filter(Boolean).map((item: any) =>
              React.createElement('div', {
                key: item.label,
                style: {
                  flex: 1, background: C.card, borderRadius: 8, padding: '9px 12px',
                  border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 2,
                },
              },
                React.createElement('div', { style: { fontSize: 10, color: C.textMuted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' } }, item.label),
                React.createElement('div', { style: { fontSize: 18, fontWeight: 700, color: C.textSub } }, item.value),
              )
            ),
          ),

          // Underlying index
          underlyingPrice > 0 && React.createElement('div', {
            style: {
              display: 'flex', alignItems: 'center', gap: 8,
              background: C.card, borderRadius: 8, padding: '10px 14px',
              border: `1px solid ${C.border}`, marginTop: 'auto',
            },
          },
            React.createElement('div', { style: { fontSize: 13, fontWeight: 700, color: C.textSub } }, underlyingSymbol),
            React.createElement('div', { style: { width: 1, height: 13, background: C.border } }),
            React.createElement('div', {
              style: { fontSize: 13, fontWeight: 600, color: underlyingChangePct >= 0 ? C.call : C.put },
            }, `$${fmt(underlyingPrice)} ${underlyingChangePct >= 0 ? '▲' : '▼'}${Math.abs(underlyingChangePct).toFixed(2)}%`),
          ),
        ),

        // ── RIGHT PANEL ──
        React.createElement('div', {
          style: { display: 'flex', flexDirection: 'column', flex: 1, padding: '20px 44px 28px 32px' },
        },
          // Greeks section
          hasGreeks && React.createElement(React.Fragment, null,
            React.createElement('div', {
              style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
            },
              React.createElement('div', {
                style: { fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' },
              }, 'Options Greeks'),
              iv > 0 && React.createElement('div', {
                style: {
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: C.goldBg, border: `1px solid ${C.goldBd}`,
                  borderRadius: 6, padding: '4px 12px',
                },
              },
                React.createElement('div', { style: { fontSize: 10, color: C.gold, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' } }, 'IV'),
                React.createElement('div', { style: { fontSize: 16, fontWeight: 800, color: C.gold } }, `${(iv * 100).toFixed(1)}%`),
              ),
            ),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 12 } },
              React.createElement('div', { style: { display: 'flex', gap: 7 } },
                ...([
                  { label: 'Δ Delta', value: delta.toFixed(3), color: delta >= 0 ? C.call : C.put },
                  { label: 'Γ Gamma', value: gamma.toFixed(4), color: C.blue },
                ].map(g =>
                  React.createElement('div', {
                    key: g.label,
                    style: {
                      flex: 1, background: C.card, borderRadius: 8, padding: '10px 14px',
                      border: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    },
                  },
                    React.createElement('div', { style: { fontSize: 11, color: C.textMuted, fontWeight: 600 } }, g.label),
                    React.createElement('div', { style: { fontSize: 20, fontWeight: 700, color: g.color } }, g.value),
                  )
                )),
              ),
              React.createElement('div', { style: { display: 'flex', gap: 7 } },
                ...([
                  { label: 'Θ Theta', value: theta.toFixed(3), color: C.put },
                  { label: 'V Vega',  value: vega.toFixed(3),  color: C.blue },
                ].map(g =>
                  React.createElement('div', {
                    key: g.label,
                    style: {
                      flex: 1, background: C.card, borderRadius: 8, padding: '10px 14px',
                      border: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    },
                  },
                    React.createElement('div', { style: { fontSize: 11, color: C.textMuted, fontWeight: 600 } }, g.label),
                    React.createElement('div', { style: { fontSize: 20, fontWeight: 700, color: g.color } }, g.value),
                  )
                )),
              ),
            ),
            React.createElement('div', { style: { height: 1, background: C.divider, marginBottom: 12 } }),
          ),

          // Targets + Stop
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, flex: 1 } },
            t1 !== null && React.createElement('div', {
              style: { background: C.callBg, borderRadius: 10, padding: '12px 18px', border: `1px solid ${C.callBd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
            },
              React.createElement('div', { style: { fontSize: 12, color: C.textMuted, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' } }, 'Target 1'),
              React.createElement('div', { style: { fontSize: 30, fontWeight: 800, color: C.call } }, `$${fmt(t1)}`),
            ),
            t2 !== null && React.createElement('div', {
              style: { background: 'rgba(39,199,111,0.06)', borderRadius: 10, padding: '12px 18px', border: '1px solid rgba(39,199,111,0.18)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
            },
              React.createElement('div', { style: { fontSize: 12, color: C.textMuted, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' } }, 'Target 2'),
              React.createElement('div', { style: { fontSize: 30, fontWeight: 800, color: C.call } }, `$${fmt(t2)}`),
            ),
            t1 === null && t2 === null && !hasGreeks && React.createElement('div', {
              style: { background: C.card, borderRadius: 10, padding: '12px 18px', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center' },
            },
              React.createElement('div', { style: { fontSize: 14, color: C.textMuted } }, 'Targets not yet set'),
            ),
            stop !== null && React.createElement('div', {
              style: { background: C.putBg, borderRadius: 10, padding: '12px 18px', border: `1px solid ${C.putBd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
            },
              React.createElement('div', { style: { fontSize: 12, color: C.textMuted, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' } }, 'Stop Loss'),
              React.createElement('div', { style: { fontSize: 30, fontWeight: 800, color: C.put } }, `$${fmt(stop)}`),
            ),
          ),

          // Footer: analyst + time
          React.createElement('div', {
            style: {
              marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.divider}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            },
          },
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 1 } },
              React.createElement('div', { style: { fontSize: 10, color: C.textMuted, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' } }, 'Analyst'),
              React.createElement('div', { style: { fontSize: 18, fontWeight: 700, color: C.text } }, analystName),
            ),
            React.createElement('div', { style: { fontSize: 13, color: C.textMuted } }, `${timeStr} ET`),
          ),
        ),
      ),
    );

    const svg = await satori(tradeElement, satoriOpts);
    const resvg = new Resvg(svg);
    const pngData = resvg.render();
    const pngBuffer = Buffer.from(pngData.asPng());

    console.log(`[generate-image] ✅ NEW TRADE PNG ready — ${pngBuffer.length} bytes — ${Date.now() - t0}ms`);

    return new NextResponse(pngBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(pngBuffer.length),
        'Cache-Control': 'no-cache, no-store',
      },
    });

  } catch (error: any) {
    console.error('[generate-image] ❌ IMAGE GENERATION FAILED');
    console.error('[generate-image] Error:', error?.message);
    console.error('[generate-image] Stack:', error?.stack?.substring(0, 600));
    return new NextResponse(
      JSON.stringify({ error: error?.message ?? 'Image generation failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
