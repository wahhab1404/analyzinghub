/**
 * Shared renderer for company option-contract deal alert images.
 *
 * Produces the same satori + @resvg/resvg-wasm PNG card used by the
 * /generate-image route, extracted so it can also be invoked synchronously
 * from the trade-create publish path (to attach an image to the Telegram post).
 */
import satori from 'satori'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
import { readFileSync } from 'fs'
import path from 'path'
import React from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

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

// Asset sources for the satori + resvg renderer on Lambda.
//
// WASM: read the bundled @resvg/resvg-wasm file if Netlify traced it into the
// Lambda, else fetch from a CDN (durable fix for the "ENOENT index_bg.wasm"
// tracing failure).
//
// FONTS: satori needs TTF/OTF (it rejects WOFF2 with "Unsupported OpenType
// signature wOF2", and the bundled @fontsource/inter v5 files are WOFF2-only).
// Fetch per-weight TTF from the Fontsource jsDelivr CDN, which serves real TTF.
const WASM_CDN = 'https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm'
const FONT_REG_CDN = 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf'
const FONT_BOLD_CDN = 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf'

async function fetchAsset(cdnUrl: string): Promise<Buffer> {
  const res = await fetch(cdnUrl)
  if (!res.ok) throw new Error(`Failed to fetch asset ${cdnUrl}: HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

let initPromise: Promise<{ fontReg: Buffer; fontBold: Buffer }> | null = null
function ensureInit(): Promise<{ fontReg: Buffer; fontBold: Buffer }> {
  if (!initPromise) {
    initPromise = (async () => {
      const wasmPath = path.join(process.cwd(), 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm')

      // WASM: read bundled file if traced, else fetch from CDN.
      let wasm: Buffer
      try {
        wasm = readFileSync(wasmPath)
      } catch {
        wasm = await fetchAsset(WASM_CDN)
      }

      // Fonts: fetch real TTF from CDN (satori rejects the bundled WOFF2).
      const [fontReg, fontBold] = await Promise.all([
        fetchAsset(FONT_REG_CDN),
        fetchAsset(FONT_BOLD_CDN),
      ])

      try {
        await initWasm(wasm)
      } catch (e: any) {
        // initWasm throws if the module was already initialised in this
        // process (e.g. a warm Lambda). That's fine — ignore only that case.
        if (!String(e?.message || e).includes('Already initialized')) throw e
      }
      return { fontReg, fontBold }
    })().catch((err) => { initPromise = null; throw err })
  }
  return initPromise
}

export interface ContractTradeLike {
  symbol: string
  strike: number | string | null
  direction: string
  expiry_date?: string | null
  entry_price: number | string
  current_price?: number | string | null
  max_price_since_entry?: number | string | null
  status?: string | null
}

/**
 * Render the alert card for a company contract deal to a PNG buffer.
 */
export async function renderContractTradePng(trade: ContractTradeLike): Promise<Buffer> {
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
    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 14 } },
        React.createElement('div', { style: { fontSize: 40, fontWeight: 900, color: C.text } }, String(trade.symbol)),
        React.createElement('div', { style: { fontSize: 34, fontWeight: 800, color: accent } }, `$${num(trade.strike).toLocaleString()}`),
        React.createElement('div', { style: { background: 'rgba(255,255,255,0.04)', border: `1px solid ${accent}`, borderRadius: 6, padding: '4px 14px', color: accent, fontSize: 18, fontWeight: 800 } }, isCall ? '▲ CALL' : '▼ PUT'),
      ),
      React.createElement('div', { style: { fontSize: 16, color: C.textMuted } }, expiry ? `Exp ${expiry}` : ''),
    ),
    React.createElement('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 24, marginBottom: 28 } },
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column' } },
        React.createElement('div', { style: { fontSize: 14, color: C.textMuted, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' } }, 'Current'),
        React.createElement('div', { style: { fontSize: 96, fontWeight: 900, color: C.text, lineHeight: 1 } }, `$${fmt(current)}`),
      ),
      React.createElement('div', { style: { fontSize: 40, fontWeight: 800, color: pnlPct >= 0 ? C.call : C.put, marginBottom: 14 } }, `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%`),
    ),
    React.createElement('div', { style: { display: 'flex', gap: 12, marginBottom: 'auto' } },
      stat('Entry', `$${fmt(entry)}`, C.textSub),
      stat('Peak', `$${fmt(peak)}`, C.gold),
      stat('Max Gain', `+${peakPct.toFixed(1)}%`, C.gold),
    ),
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
  return Buffer.from(resvg.render().asPng())
}

/**
 * Render + upload the alert card to the public `trade-images` bucket and return
 * its public URL. Persists nothing on the trade row (caller decides).
 */
export async function generateAndUploadContractTradeImage(
  supabase: SupabaseClient,
  tradeId: string,
  trade: ContractTradeLike
): Promise<string | null> {
  try {
    const pngBuffer = await renderContractTradePng(trade)
    const filePath = `company-contracts/${tradeId}-${Date.now()}.png`
    const { error: uploadError } = await supabase.storage
      .from('trade-images')
      .upload(filePath, pngBuffer, { contentType: 'image/png', upsert: true })
    if (uploadError) {
      console.error('[contract-image] upload error:', uploadError)
      return null
    }
    const { data: pub } = supabase.storage.from('trade-images').getPublicUrl(filePath)
    return pub.publicUrl
  } catch (error) {
    console.error('[contract-image] render error:', error)
    return null
  }
}
