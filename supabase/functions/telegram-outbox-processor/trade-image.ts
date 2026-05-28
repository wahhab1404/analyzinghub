/**
 * trade-image.ts — Native (in-edge) trade alert image generator.
 *
 * WHY THIS EXISTS:
 *   Previously the only way to attach a contract image to a Telegram alert was
 *   to HTTP-fetch the Next.js route /api/indices/trades/[id]/generate-image
 *   (directly, or indirectly via generate-trade-snapshot which stores the PNG
 *   and sets contract_url). When that route was unreachable from the Supabase
 *   edge runtime — wrong/missing APP_BASE_URL, Netlify cold start, lambda WASM
 *   bundling failure — the alert silently fell back to text-only. That is the
 *   root cause of "new high / new trade alerts arrive without an image".
 *
 *   This module renders the card *inside the edge function* using @vercel/og
 *   (same library/version already proven in generate-report-image). No external
 *   HTTP dependency, so an image is always available regardless of how the
 *   Next.js app is deployed.
 *
 * Returns raw PNG bytes (Uint8Array) or null on failure (caller falls back).
 */

import { ImageResponse } from "npm:@vercel/og@0.6.2";

// ─── Design tokens (mirrors the Next.js generate-image route) ─────────────────
const C = {
  bg: "#0A0E13",
  card: "#111720",
  border: "#1E2A38",
  divider: "#1A2332",
  text: "#E8EFF7",
  textSub: "#8DA0B8",
  textMuted: "#4D6278",
  call: "#27C76F",
  put: "#F03E3E",
  blue: "#3B9EFF",
  gold: "#F5A623",
  callBg: "rgba(39,199,111,0.10)",
  putBg: "rgba(240,62,62,0.10)",
  callBd: "rgba(39,199,111,0.25)",
  putBd: "rgba(240,62,62,0.25)",
  goldBg: "rgba(245,166,35,0.12)",
  goldBd: "rgba(245,166,35,0.28)",
  blueBg: "rgba(59,158,255,0.10)",
  blueBd: "rgba(59,158,255,0.25)",
} as const;

function safeNum(v: any, fallback = 0): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}
function fmt(n: number): string {
  return n.toFixed(2);
}

// Tiny vdom helper so the object notation stays readable.
function el(type: string, style: Record<string, any>, children?: any) {
  return { type, props: children === undefined ? { style } : { style, children } };
}

function statCard(label: string, value: string, valueColor: string, bg: string, bd: string) {
  return el(
    "div",
    {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      background: bg,
      borderRadius: 10,
      padding: "14px 18px",
      border: `1px solid ${bd}`,
    },
    [
      el(
        "div",
        { fontSize: 13, color: C.textMuted, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" },
        label,
      ),
      el("div", { fontSize: 28, fontWeight: 800, color: valueColor }, value),
    ],
  );
}

export interface TradeImageOpts {
  isNewHigh?: boolean;
  isWinning?: boolean;
  isTesting?: boolean;
  highPrice?: number;
}

/**
 * Build a professional PNG alert card for a trade.
 * Never throws — returns null so the caller can fall back to another source.
 */
export async function generateTradeImage(
  trade: any,
  opts: TradeImageOpts,
): Promise<Uint8Array | null> {
  try {
    const isNewHigh = !!opts.isNewHigh;
    const isWinning = !!opts.isWinning;
    const isTesting = !!opts.isTesting;

    // ── Derived values ────────────────────────────────────────────────────────
    const snap = trade?.entry_contract_snapshot ?? {};
    const entryPrice = safeNum(snap.mid ?? snap.price ?? snap.last);
    const currentPrice = safeNum(trade?.current_contract, entryPrice);
    const highSince = safeNum(trade?.contract_high_since, currentPrice);
    const qty = safeNum(trade?.qty, 1) || 1;
    const strike = safeNum(trade?.strike);

    const optionType = (trade?.option_type ?? trade?.direction ?? "call").toLowerCase();
    const isCall = optionType === "call";
    const accent = isNewHigh ? C.gold : isWinning ? C.call : isCall ? C.call : C.put;
    const dirAccent = isCall ? C.call : C.put;
    const dirAccentBg = isCall ? C.callBg : C.putBg;
    const dirAccentBd = isCall ? C.callBd : C.putBd;

    let sym: string = trade?.analysis?.index_symbol ?? trade?.underlying_index_symbol ?? "SPX";
    if (trade?.polygon_option_ticker) {
      const parts = String(trade.polygon_option_ticker).split(":");
      if (parts.length > 1) sym = parts[1].replace(/\d{6}[CP]\d{8}$/, "");
    }

    const expiry = trade?.expiry
      ? new Date(trade.expiry).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })
      : "";

    const dispHigh = opts.highPrice ?? highSince;
    const gainPct = entryPrice > 0 ? ((dispHigh - entryPrice) / entryPrice) * 100 : 0;
    const gainUsd = (dispHigh - entryPrice) * qty * 100;
    const pnlUsd = (currentPrice - entryPrice) * qty * 100;
    const pnlPct = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;

    const analystName: string = trade?.author?.full_name ?? "Analyst";
    const timeStr = new Date().toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "America/New_York",
    });

    const underlyingSymbol: string = trade?.analysis?.index_symbol ?? trade?.underlying_index_symbol ?? sym;
    const underlyingPrice = safeNum(trade?.current_underlying ?? trade?.entry_underlying_snapshot?.price);

    // ── Badge + big metric per mode ─────────────────────────────────────────────
    const testPrefix = isTesting ? "TEST · " : "";
    let badgeText: string;
    let badgeColor: string;
    let badgeBg: string;
    let badgeBd: string;
    let bigLabel: string;
    let bigValue: string;
    let bigColor: string;
    let subText: string;
    let subColor: string;

    if (isNewHigh) {
      badgeText = `${testPrefix}NEW HIGH`;
      badgeColor = C.gold; badgeBg = C.goldBg; badgeBd = C.goldBd;
      bigLabel = "Contract High";
      bigValue = `$${fmt(dispHigh)}`;
      bigColor = C.gold;
      subText = `+${gainPct.toFixed(1)}%  ·  +$${gainUsd.toFixed(0)} per lot`;
      subColor = C.call;
    } else if (isWinning) {
      badgeText = `${testPrefix}WINNING TRADE`;
      badgeColor = C.call; badgeBg = C.callBg; badgeBd = C.callBd;
      bigLabel = "Current Price";
      bigValue = `$${fmt(currentPrice)}`;
      bigColor = C.call;
      subText = `+${pnlPct.toFixed(1)}%  ·  +$${pnlUsd.toFixed(0)} per lot`;
      subColor = C.call;
    } else {
      badgeText = `${testPrefix}NEW TRADE`;
      badgeColor = C.blue; badgeBg = C.blueBg; badgeBd = C.blueBd;
      bigLabel = "Entry Price";
      bigValue = `$${fmt(entryPrice)}`;
      bigColor = C.text;
      subText = `${qty} contract${qty !== 1 ? "s" : ""}  ·  $${(entryPrice * qty * 100).toFixed(0)} total`;
      subColor = C.textMuted;
    }

    // ── Right-side stat cards per mode ───────────────────────────────────────────
    const cards: any[] = [];
    if (isNewHigh) {
      cards.push(statCard("Entry", `$${fmt(entryPrice)}`, C.textSub, C.card, C.border));
      cards.push(statCard("Max Gain", `+${gainPct.toFixed(2)}%`, C.gold, C.goldBg, C.goldBd));
      cards.push(statCard("P/L (1 lot)", `+$${gainUsd.toFixed(0)}`, C.call, C.callBg, C.callBd));
    } else if (isWinning) {
      cards.push(statCard("Entry", `$${fmt(entryPrice)}`, C.textSub, C.card, C.border));
      cards.push(statCard("High", `$${fmt(highSince)}`, C.gold, C.goldBg, C.goldBd));
      cards.push(statCard("P/L (1 lot)", `${pnlUsd >= 0 ? "+" : "-"}$${Math.abs(pnlUsd).toFixed(0)}`, pnlUsd >= 0 ? C.call : C.put, pnlUsd >= 0 ? C.callBg : C.putBg, pnlUsd >= 0 ? C.callBd : C.putBd));
    } else {
      const bid = safeNum(snap.bid);
      const ask = safeNum(snap.ask);
      const hasBidAsk = bid > 0 && ask > 0 && bid !== ask;
      cards.push(statCard("Bid", hasBidAsk ? `$${fmt(bid)}` : `$${fmt(entryPrice)}`, hasBidAsk ? C.put : C.textSub, C.card, C.border));
      cards.push(statCard("Ask", hasBidAsk ? `$${fmt(ask)}` : `$${fmt(entryPrice)}`, hasBidAsk ? C.call : C.textSub, C.card, C.border));
      const t1 = safeNum(Array.isArray(trade?.targets) ? (trade.targets[0]?.level ?? trade.targets[0]?.price) : 0);
      if (t1 > 0) {
        cards.push(statCard("Target 1", `$${fmt(t1)}`, C.call, C.callBg, C.callBd));
      } else {
        cards.push(statCard("Current", `$${fmt(currentPrice)}`, C.text, C.card, C.border));
      }
    }

    // ── Header chips ────────────────────────────────────────────────────────────
    // Strike gets its own prominent, colour-coded pill so it reads clearly.
    const symExpiry = `${sym}${expiry ? ` · ${expiry}` : ""}`;
    const strikePill = `$${strike.toLocaleString()} ${isCall ? "CALL" : "PUT"}`;

    const vdom = el(
      "div",
      {
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        background: C.bg, fontFamily: "system-ui, sans-serif", position: "relative", overflow: "hidden",
      },
      [
        // Top accent bar
        el("div", { position: "absolute", top: 0, left: 0, right: 0, height: 5, background: accent }),

        el(
          "div",
          { display: "flex", flexDirection: "column", flex: 1, padding: "40px 52px 32px" },
          [
            // Header row
            el(
              "div",
              { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 },
              [
                el("div", { display: "flex", gap: 10, alignItems: "center" }, [
                  el(
                    "div",
                    {
                      background: badgeBg, border: `1px solid ${badgeBd}`, borderRadius: 6,
                      padding: "5px 14px", color: badgeColor, fontSize: 14, fontWeight: 700, letterSpacing: "0.08em",
                    },
                    "ANALYZINGHUB",
                  ),
                  el(
                    "div",
                    {
                      background: C.card, border: `1px solid ${C.border}`, borderRadius: 6,
                      padding: "5px 14px", color: C.textSub, fontSize: 14, fontWeight: 600,
                    },
                    symExpiry,
                  ),
                  ...(strike > 0
                    ? [el(
                        "div",
                        {
                          background: dirAccentBg, border: `1px solid ${dirAccentBd}`, borderRadius: 6,
                          padding: "5px 14px", color: dirAccent, fontSize: 17, fontWeight: 800, letterSpacing: "0.02em",
                        },
                        strikePill,
                      )]
                    : []),
                ]),
                el(
                  "div",
                  {
                    background: badgeBg, border: `1px solid ${badgeBd}`, borderRadius: 7,
                    padding: "7px 18px", color: badgeColor, fontSize: 16, fontWeight: 800, letterSpacing: "0.06em",
                  },
                  badgeText,
                ),
              ],
            ),

            // Main row
            el("div", { display: "flex", flex: 1, gap: 40, alignItems: "flex-start" }, [
              // Left — big metric
              el("div", { display: "flex", flexDirection: "column", width: 320 }, [
                el(
                  "div",
                  { fontSize: 13, color: C.textMuted, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 },
                  bigLabel,
                ),
                el(
                  "div",
                  { fontSize: 92, fontWeight: 900, color: bigColor, lineHeight: 1, letterSpacing: "-3px" },
                  bigValue,
                ),
                el("div", { fontSize: 22, fontWeight: 700, color: subColor, marginTop: 8, letterSpacing: "-0.5px" }, subText),
              ]),
              // Right — stat cards
              el("div", { display: "flex", flexDirection: "column", flex: 1, gap: 10, marginTop: 6 }, cards),
            ]),

            // Footer
            el(
              "div",
              {
                display: "flex", justifyContent: "space-between", alignItems: "center",
                paddingTop: 16, marginTop: 16, borderTop: `1px solid ${C.divider}`,
              },
              [
                el("div", { display: "flex", gap: 10, alignItems: "center" }, [
                  el("div", { fontSize: 15, fontWeight: 700, color: C.textSub }, underlyingSymbol),
                  underlyingPrice > 0
                    ? el("div", { fontSize: 15, fontWeight: 600, color: C.textMuted }, `$${fmt(underlyingPrice)}`)
                    : el("div", { fontSize: 0 }, ""),
                ]),
                el("div", { fontSize: 14, color: C.textMuted }, `${analystName} · ${timeStr} ET`),
              ],
            ),
          ],
        ),
      ],
    );

    const resp = new ImageResponse(vdom, { width: 1000, height: 560 });
    const buf = new Uint8Array(await resp.arrayBuffer());

    if (buf.byteLength < 1024) {
      console.warn(`[trade-image] Generated PNG too small (${buf.byteLength} bytes) — discarding`);
      return null;
    }
    console.log(`[trade-image] ✅ Native PNG generated — ${buf.byteLength} bytes (mode=${isNewHigh ? "new_high" : isWinning ? "winning" : "new_trade"})`);
    return buf;
  } catch (err: any) {
    console.error("[trade-image] ❌ Native image generation failed:", err?.message);
    return null;
  }
}
