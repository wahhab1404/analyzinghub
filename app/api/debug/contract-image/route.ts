/**
 * GET /api/debug/contract-image
 *
 * Admin endpoint for testing contract alert image generation in isolation.
 * Generates a sample image using hard-coded fixture data — no trade ID required.
 *
 * Query params:
 *   type=new_trade|new_high   (default: new_trade)
 *   token=<ADMIN_SECRET>      required for access
 *
 * Returns image/png on success, JSON error on failure.
 *
 * Usage:
 *   curl "https://analyzhub.com/api/debug/contract-image?token=<ADMIN_SECRET>" \
 *        -o test-output.png
 */

import { NextRequest, NextResponse } from 'next/server';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { readFileSync } from 'fs';
import path from 'path';
import satori from 'satori';
import React from 'react';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Design tokens (same palette as generate-image) ──────────────────────────
const C = {
  bg:      '#0A0E13',
  card:    '#111720',
  border:  '#1E2A38',
  divider: '#1A2332',
  text:    '#E8EFF7',
  textSub: '#8DA0B8',
  textMuted: '#4D6278',
  call:    '#27C76F',
  put:     '#F03E3E',
  blue:    '#3B9EFF',
  gold:    '#F5A623',
  callBg:  'rgba(39,199,111,0.10)',
  callBd:  'rgba(39,199,111,0.25)',
  goldBg:  'rgba(245,166,35,0.12)',
  goldBd:  'rgba(245,166,35,0.28)',
  blueBg:  'rgba(59,158,255,0.10)',
  blueBd:  'rgba(59,158,255,0.25)',
} as const;

// ─── WASM + Font singleton (shared if both routes are warm) ──────────────────
let initPromise: Promise<{ fontReg: Buffer; fontBold: Buffer }> | null = null;

function ensureInit(): Promise<{ fontReg: Buffer; fontBold: Buffer }> {
  if (!initPromise) {
    initPromise = (async () => {
      const wasmPath = path.join(process.cwd(), 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm');
      await initWasm(readFileSync(wasmPath));
      const fontBase = path.join(process.cwd(), 'node_modules', '@fontsource', 'inter', 'files');
      const fontReg  = readFileSync(path.join(fontBase, 'inter-latin-400-normal.woff2'));
      const fontBold = readFileSync(path.join(fontBase, 'inter-latin-700-normal.woff2'));
      return { fontReg, fontBold };
    })().catch(err => { initPromise = null; throw err; });
  }
  return initPromise;
}

export async function GET(request: NextRequest) {
  const t0 = Date.now();

  // ── Auth ───────────────────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const token   = searchParams.get('token');
  const secret  = process.env.ADMIN_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!secret || token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const type = searchParams.get('type') === 'new_high' ? 'new_high' : 'new_trade';

  try {
    const { fontReg, fontBold } = await ensureInit();

    const satoriOpts = {
      width: 1000, height: 560,
      fonts: [
        { name: 'Inter', data: fontReg.buffer as ArrayBuffer,  weight: 400 as const, style: 'normal' as const },
        { name: 'Inter', data: fontBold.buffer as ArrayBuffer, weight: 700 as const, style: 'normal' as const },
        { name: 'Inter', data: fontBold.buffer as ArrayBuffer, weight: 800 as const, style: 'normal' as const },
        { name: 'Inter', data: fontBold.buffer as ArrayBuffer, weight: 900 as const, style: 'normal' as const },
      ],
    };

    const now = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York',
    });

    let element: React.ReactElement;

    if (type === 'new_high') {
      element = React.createElement('div', {
        style: {
          width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          background: C.bg, fontFamily: 'Inter', position: 'relative',
        },
      },
        React.createElement('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: `linear-gradient(90deg, ${C.gold} 0%, #FFD26F 50%, ${C.gold} 100%)` } }),
        React.createElement('div', { style: { display: 'flex', flex: 1, padding: '36px 52px 32px', flexDirection: 'column' } },
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 } },
            React.createElement('div', { style: { background: C.goldBg, border: `1px solid ${C.goldBd}`, borderRadius: 6, padding: '5px 14px', color: C.gold, fontSize: 14, fontWeight: 700 } }, 'ANALYZINGHUB DEBUG'),
            React.createElement('div', { style: { background: C.goldBg, border: `1px solid ${C.goldBd}`, borderRadius: 7, padding: '7px 18px', color: C.gold, fontSize: 16, fontWeight: 800 } }, '🚀 NEW HIGH ALERT'),
          ),
          React.createElement('div', { style: { display: 'flex', flex: 1, gap: 40, alignItems: 'flex-start' } },
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column' } },
              React.createElement('div', { style: { fontSize: 13, color: C.textMuted, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 } }, 'Contract High'),
              React.createElement('div', { style: { fontSize: 96, fontWeight: 900, color: C.gold, lineHeight: 1, letterSpacing: '-3px' } }, '$18.75'),
              React.createElement('div', { style: { fontSize: 32, fontWeight: 700, color: C.call, marginTop: 6 } }, '+87.5%'),
              React.createElement('div', { style: { fontSize: 18, color: C.textMuted, marginTop: 4 } }, '+$875 per lot'),
            ),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, gap: 10, marginTop: 8 } },
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', background: C.card, borderRadius: 10, padding: '14px 18px', border: `1px solid ${C.border}` } },
                React.createElement('div', { style: { fontSize: 13, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase' } }, 'Entry'),
                React.createElement('div', { style: { fontSize: 28, fontWeight: 700, color: C.textSub } }, '$10.00'),
              ),
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', background: C.goldBg, borderRadius: 10, padding: '14px 18px', border: `1px solid ${C.goldBd}` } },
                React.createElement('div', { style: { fontSize: 13, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase' } }, 'Max Gain'),
                React.createElement('div', { style: { fontSize: 28, fontWeight: 800, color: C.gold } }, '+87.50%'),
              ),
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', background: C.callBg, borderRadius: 10, padding: '14px 18px', border: `1px solid ${C.callBd}` } },
                React.createElement('div', { style: { fontSize: 13, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase' } }, 'P/L (1 lot)'),
                React.createElement('div', { style: { fontSize: 28, fontWeight: 800, color: C.call } }, '+$875'),
              ),
            ),
          ),
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', paddingTop: 16, marginTop: 16, borderTop: `1px solid ${C.divider}` } },
            React.createElement('div', { style: { display: 'flex', gap: 10 } },
              React.createElement('div', { style: { fontSize: 15, fontWeight: 700, color: C.textSub } }, 'SPX'),
              React.createElement('div', { style: { fontSize: 15, fontWeight: 600, color: C.call } }, '$5,820.00 ▲0.42%'),
            ),
            React.createElement('div', { style: { fontSize: 14, color: C.textMuted } }, `Debug Analyst · ${now} ET`),
          ),
        ),
      );
    } else {
      element = React.createElement('div', {
        style: {
          width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          background: C.bg, fontFamily: 'Inter', position: 'relative',
        },
      },
        React.createElement('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: C.call } }),

        // Header row
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 48px 14px', marginTop: 5 } },
          React.createElement('div', { style: { background: 'rgba(39,199,111,0.10)', border: '1px solid rgba(39,199,111,0.25)', borderRadius: 6, padding: '5px 13px', color: C.call, fontSize: 13, fontWeight: 700 } }, 'ANALYZINGHUB DEBUG'),
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
              React.createElement('div', { style: { fontSize: 28, fontWeight: 900, color: C.text } }, 'SPXW'),
              React.createElement('div', { style: { fontSize: 26, fontWeight: 800, color: C.call } }, '$5,800'),
              React.createElement('div', { style: { background: 'rgba(39,199,111,0.10)', border: '1px solid rgba(39,199,111,0.25)', borderRadius: 6, padding: '3px 10px', color: C.call, fontSize: 14, fontWeight: 800 } }, '▲ CALL'),
            ),
            React.createElement('div', { style: { fontSize: 13, color: C.textMuted } }, 'Expires May 8, 26'),
          ),
          React.createElement('div', { style: { background: C.blueBg, border: `1px solid ${C.blueBd}`, borderRadius: 7, padding: '6px 16px', color: C.blue, fontSize: 13, fontWeight: 700 } }, '● ACTIVE'),
        ),

        React.createElement('div', { style: { height: 1, background: C.divider, margin: '0 48px' } }),

        // Content
        React.createElement('div', { style: { display: 'flex', flex: 1 } },
          // Left panel
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', width: 460, padding: '20px 32px 28px 48px', borderRight: `1px solid ${C.divider}` } },
            React.createElement('div', { style: { marginBottom: 14 } },
              React.createElement('div', { style: { fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 2 } }, 'Entry Price'),
              React.createElement('div', { style: { fontSize: 82, fontWeight: 900, color: C.text, lineHeight: 1 } }, '$10.00'),
              React.createElement('div', { style: { fontSize: 13, color: C.textMuted, marginTop: 4 } }, '1 contract · $1,000 total'),
            ),
            React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 10 } },
              ...(['Bid', 'Ask', 'Mid'] as const).map((label, i) =>
                React.createElement('div', { key: label, style: { flex: 1, background: C.card, borderRadius: 8, padding: '9px 12px', border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 2 } },
                  React.createElement('div', { style: { fontSize: 10, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase' } }, label),
                  React.createElement('div', { style: { fontSize: 20, fontWeight: 700, color: i === 0 ? C.put : i === 1 ? C.call : C.text } }, i === 0 ? '$9.90' : i === 1 ? '$10.10' : '$10.00'),
                )
              ),
            ),
            React.createElement('div', { style: { display: 'flex', gap: 8 } },
              React.createElement('div', { style: { flex: 1, background: C.card, borderRadius: 8, padding: '9px 12px', border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 2 } },
                React.createElement('div', { style: { fontSize: 10, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase' } }, 'Open Int'),
                React.createElement('div', { style: { fontSize: 18, fontWeight: 700, color: C.textSub } }, '12.4K'),
              ),
              React.createElement('div', { style: { flex: 1, background: C.card, borderRadius: 8, padding: '9px 12px', border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 2 } },
                React.createElement('div', { style: { fontSize: 10, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase' } }, 'Volume'),
                React.createElement('div', { style: { fontSize: 18, fontWeight: 700, color: C.textSub } }, '3.2K'),
              ),
            ),
          ),

          // Right panel
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, padding: '20px 44px 28px 32px' } },
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, flex: 1 } },
              React.createElement('div', { style: { background: C.callBg, borderRadius: 10, padding: '12px 18px', border: `1px solid ${C.callBd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                React.createElement('div', { style: { fontSize: 12, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase' } }, 'Target 1'),
                React.createElement('div', { style: { fontSize: 30, fontWeight: 800, color: C.call } }, '$15.00'),
              ),
              React.createElement('div', { style: { background: 'rgba(39,199,111,0.06)', borderRadius: 10, padding: '12px 18px', border: '1px solid rgba(39,199,111,0.18)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                React.createElement('div', { style: { fontSize: 12, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase' } }, 'Target 2'),
                React.createElement('div', { style: { fontSize: 30, fontWeight: 800, color: C.call } }, '$20.00'),
              ),
              React.createElement('div', { style: { background: 'rgba(240,62,62,0.10)', borderRadius: 10, padding: '12px 18px', border: '1px solid rgba(240,62,62,0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                React.createElement('div', { style: { fontSize: 12, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase' } }, 'Stop Loss'),
                React.createElement('div', { style: { fontSize: 30, fontWeight: 800, color: C.put } }, '$7.00'),
              ),
            ),
            React.createElement('div', { style: { marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 1 } },
                React.createElement('div', { style: { fontSize: 10, color: C.textMuted, fontWeight: 600, textTransform: 'uppercase' } }, 'Analyst'),
                React.createElement('div', { style: { fontSize: 18, fontWeight: 700, color: C.text } }, 'Debug Mode'),
              ),
              React.createElement('div', { style: { fontSize: 13, color: C.textMuted } }, `${now} ET`),
            ),
          ),
        ),
      );
    }

    const svg = await satori(element, satoriOpts);
    const resvg = new Resvg(svg);
    const pngData = resvg.render();
    const pngBuffer = Buffer.from(pngData.asPng());

    const elapsed = Date.now() - t0;
    console.log(`[debug/contract-image] ✅ PNG ready — ${pngBuffer.length} bytes — type=${type} — ${elapsed}ms`);

    // Respond with the image directly for browser preview, include diagnostics in headers
    return new NextResponse(pngBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(pngBuffer.length),
        'Cache-Control': 'no-cache, no-store',
        'X-Debug-Type': type,
        'X-Debug-Elapsed-Ms': String(elapsed),
        'X-Debug-Size-Bytes': String(pngBuffer.length),
      },
    });

  } catch (err: any) {
    console.error('[debug/contract-image] ❌ FAILED:', err?.message);
    console.error('[debug/contract-image] Stack:', err?.stack?.substring(0, 600));
    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? 'Unknown error',
        hint: 'Check server logs. Common issues: WASM not bundled, font files missing, satori crash.',
        wasmPath: path.join(process.cwd(), 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm'),
        fontPath: path.join(process.cwd(), 'node_modules', '@fontsource', 'inter', 'files', 'inter-latin-400-normal.woff2'),
      },
      { status: 500 }
    );
  }
}
