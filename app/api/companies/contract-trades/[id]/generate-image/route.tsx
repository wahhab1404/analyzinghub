/**
 * POST /api/companies/contract-trades/[id]/generate-image
 *
 * Generates a shareable PNG alert card for a company option-contract deal
 * (same satori + @resvg/resvg-wasm approach as index trades), uploads it to the
 * public `trade-images` bucket and persists the URL on the trade row.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import satori from 'satori'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { readFileSync } from 'fs'
import path from 'path'
import React from 'react'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const C = {
  bg: '#0A0E13', card: '#111720', border: '#1E2A38', divider: '#1A2332',
  text: '#E8EFF7', textSub: '#8DA0B8', textMuted: '#4D6278',
  call: '#27C76F', put: '#F03E3E', gold: '#F5A623', blue: '#3B9EFF',
}

function num(v: unknown, fallback = 0): number {
  const n = parseFloat(String(v))
  return Number.isFinite(n) ? n : fallback
}
function fmt(n: number): string { return n.toFixed(2) }

let initPromise: Promise<{ fontReg: Buffer; fontBold: Buffer }> | null = null
function ensureInit(): Promise<{ fontReg: Buffer; fontBold: Buffer }> {
  if (!initPromise) {
    initPromise = (async () => {
      const wasmPath = path.join(process.cwd(), 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm')
      await initWasm(readFileSync(wasmPath))
      const fontBase = path.join(process.cwd(), 'node_modules', '@fontsource', 'inter', 'files')
      const fontReg = readFileSync(path.join(fontBase, 'inter-latin-400-normal.woff2'))
      const fontBold = readFileSync(path.join(fontBase, 'inter-latin-700-normal.woff2'))
      return { fontReg, fontBold }
    })().catch((err) => { initPromise = null; throw err })
  }
  return initPromise
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userClient = createServerClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceRoleClient()
    const { data: trade, error } = await supabase
      .from('contract_trades')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error || !trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 })
    }
    if (trade.author_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const entry = num(trade.entry_price)
    const current = num(trade.current_price, entry)
    const peak = num(trade.max_price_since_entry, current)
    const isCall = String(trade.direction).toUpperCase() === 'CALL'
    const accent = isCall ? C.call : C.put
    const pnlPct = entry > 0 ? ((current - entry) / entry) * 100 : 0
    const peakPct = entry > 0 ? ((peak - entry) / entry) * 100 : 0
    const expiry = trade.expiry_date
      ? new Date(trade.expiry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
      : ''

    const { fontReg, fontBold } = await ensureInit()

    const stat = (label: string, value: string, color: string) =>
      React.createElement('div', {
        style: { flex: 1, background: C.card, borderRadius: 10, padding: '16px 20px', border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 4 },
      },
        React.createElement('div', { style: { fontSize: 13, color: C.textMuted, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' } }, label),
        React.createElement('div', { style: { fontSize: 30, fontWeight: 800, color } }, value),
      )

    const element = React.createElement('div', {
      style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: 'Inter', padding: '40px 48px' },
    },
      React.createElement('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: accent } }),
      // Header
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 14 } },
          React.createElement('div', { style: { fontSize: 40, fontWeight: 900, color: C.text } }, String(trade.symbol)),
          React.createElement('div', { style: { fontSize: 34, fontWeight: 800, color: accent } }, `$${num(trade.strike).toLocaleString()}`),
          React.createElement('div', { style: { background: 'rgba(255,255,255,0.04)', border: `1px solid ${accent}`, borderRadius: 6, padding: '4px 14px', color: accent, fontSize: 18, fontWeight: 800 } }, isCall ? '▲ CALL' : '▼ PUT'),
        ),
        React.createElement('div', { style: { fontSize: 16, color: C.textMuted } }, expiry ? `Exp ${expiry}` : ''),
      ),
      // Big current price + pnl
      React.createElement('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 24, marginBottom: 28 } },
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column' } },
          React.createElement('div', { style: { fontSize: 14, color: C.textMuted, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' } }, 'Current'),
          React.createElement('div', { style: { fontSize: 96, fontWeight: 900, color: C.text, lineHeight: 1 } }, `$${fmt(current)}`),
        ),
        React.createElement('div', { style: { fontSize: 40, fontWeight: 800, color: pnlPct >= 0 ? C.call : C.put, marginBottom: 14 } }, `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%`),
      ),
      // Stat row
      React.createElement('div', { style: { display: 'flex', gap: 12, marginBottom: 'auto' } },
        stat('Entry', `$${fmt(entry)}`, C.textSub),
        stat('Peak', `$${fmt(peak)}`, C.gold),
        stat('Max Gain', `+${peakPct.toFixed(1)}%`, C.gold),
      ),
      // Footer
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 18, borderTop: `1px solid ${C.divider}`, marginTop: 24 } },
        React.createElement('div', { style: { fontSize: 16, fontWeight: 700, color: accent } }, 'ANALYZINGHUB'),
        React.createElement('div', { style: { fontSize: 14, color: C.textMuted } }, String(trade.status || 'ACTIVE')),
      ),
    )

    const svg = await satori(element, {
      width: 1000,
      height: 560,
      fonts: [
        { name: 'Inter', data: fontReg.buffer as ArrayBuffer, weight: 400, style: 'normal' },
        { name: 'Inter', data: fontBold.buffer as ArrayBuffer, weight: 700, style: 'normal' },
        { name: 'Inter', data: fontBold.buffer as ArrayBuffer, weight: 900, style: 'normal' },
      ],
    })

    const resvg = new Resvg(svg)
    const pngBuffer = Buffer.from(resvg.render().asPng())

    const filePath = `company-contracts/${params.id}-${Date.now()}.png`
    const { error: uploadError } = await supabase.storage
      .from('trade-images')
      .upload(filePath, pngBuffer, { contentType: 'image/png', upsert: true })

    if (uploadError) {
      console.error('[contract-image] upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
    }

    const { data: pub } = supabase.storage.from('trade-images').getPublicUrl(filePath)
    const imageUrl = pub.publicUrl

    await supabase
      .from('contract_trades')
      .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
      .eq('id', params.id)

    return NextResponse.json({ image_url: imageUrl })
  } catch (error) {
    console.error('[contract-image] error:', error)
    return NextResponse.json({ error: 'Image generation failed' }, { status: 500 })
  }
}
