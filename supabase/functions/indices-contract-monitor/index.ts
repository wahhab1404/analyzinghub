/**
 * indices-contract-monitor   (مراقبة وتجهيز العقد)
 *
 * Scheduled edge function that drives the pre-trade "monitoring" lifecycle for
 * index_trades rows with status='monitoring'. These are contracts an analyst is
 * PREPARING to enter — they are NOT counted as trades until they execute.
 *
 * Per monitoring contract, each cycle:
 *   1. If the preparation alert hasn't been sent, send a full-detail
 *      "مراقبة وتجهيز عقد" alert to Telegram (image + caption).
 *   2. Fetch the live contract price from Polygon and store it for display.
 *   3. Zone tracking (best-price strategy):
 *        - 'watching'  → once price drops into [exec_range_min, exec_range_max]
 *                        (i.e. price <= max), enter 'in_zone' and start tracking
 *                        the lowest price seen.
 *        - 'in_zone'   → keep lowering monitor_best_price while price falls;
 *                        EXECUTE at the best price when the price rebounds
 *                        (>= best * (1 + rebound_pct/100)) or leaves the range
 *                        upward (> max).
 *   4. Expiry:
 *        - in_zone at expiry → execute at the best price seen.
 *        - never entered the zone → mark 'expired' (never counted as a trade).
 *
 * Execution flips the row to a live status='active' trade (via the
 * execute_monitored_contract RPC) and sends an "execution / تم التنفيذ" alert as
 * a new trade. From then on the normal trackers take over.
 *
 * Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, POLYGON_API_KEY,
 *                   TELEGRAM_BOT_TOKEN (or admin_settings.telegram_bot_token),
 *                   APP_BASE_URL.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const POLYGON_API_KEY           = Deno.env.get("POLYGON_API_KEY");
const BASE_URL = Deno.env.get("APP_BASE_URL") || Deno.env.get("NEXT_PUBLIC_SITE_URL") || "https://analyzhub.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startedAt = new Date().toISOString();
  console.log(`[contract-monitor] ════════════════════════════════════════════`);
  console.log(`[contract-monitor] STARTED at ${startedAt} — BASE_URL=${BASE_URL}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // ── Bot token ──────────────────────────────────────────────────────────
    const { data: botTokenSetting } = await supabase
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "telegram_bot_token")
      .maybeSingle();
    const botToken = botTokenSetting?.setting_value || Deno.env.get("TELEGRAM_BOT_TOKEN");

    // ── Load live monitoring contracts ───────────────────────────────────────
    const { data: monitors, error: fetchErr } = await supabase
      .from("index_trades")
      .select(`
        id, underlying_index_symbol, polygon_option_ticker, polygon_underlying_index_ticker,
        strike, expiry, option_type, direction, qty,
        current_contract, monitor_last_price,
        exec_range_min, exec_range_max,
        monitor_status, monitor_best_price, monitor_best_at, monitor_entered_zone_at,
        monitor_expires_at, monitor_prep_alert_sent, monitor_rebound_pct,
        monitor_telegram_channel_id, telegram_channel_id,
        analysis_id, author_id, status, notes,
        author:profiles!author_id(id, full_name),
        analysis:index_analyses(id, title, index_symbol)
      `)
      .eq("status", "monitoring")
      .in("monitor_status", ["watching", "in_zone"]);

    if (fetchErr) {
      console.error("[contract-monitor] ❌ fetch failed:", fetchErr.message);
      return json({ ok: false, error: fetchErr.message }, 500);
    }

    const count = monitors?.length ?? 0;
    console.log(`[contract-monitor] ${count} live monitoring contract(s)`);
    if (count === 0) return json({ ok: true, checked: 0 });

    const results = { checked: 0, prep_alerts: 0, executed: 0, expired: 0, errors: 0, skipped: 0 };
    const now = Date.now();

    for (const m of monitors!) {
      results.checked++;
      try {
        // ── 1. Preparation alert (once) ──────────────────────────────────────
        if (!m.monitor_prep_alert_sent && botToken) {
          const channelId = await resolveChannel(supabase, m);
          if (channelId) {
            // Pre-trade alert — text only (no P/L image; it isn't a trade yet).
            const ok = await sendTelegramText(botToken, channelId, buildPrepCaption(m));
            if (ok) results.prep_alerts++;
          }
          // Mark sent regardless so we never spam; a missing channel just means
          // no Telegram alert, the monitor still works on the platform.
          await supabase.from("index_trades")
            .update({ monitor_prep_alert_sent: true })
            .eq("id", m.id);
          m.monitor_prep_alert_sent = true;
        }

        // ── 2. Live price ────────────────────────────────────────────────────
        let price = 0;
        if (POLYGON_API_KEY && m.polygon_option_ticker) {
          price = await fetchOptionPrice(m.underlying_index_symbol, m.polygon_option_ticker, POLYGON_API_KEY);
        }
        const expired = m.monitor_expires_at && new Date(m.monitor_expires_at).getTime() <= now;

        if (price > 0) {
          await supabase.from("index_trades")
            .update({ monitor_last_price: price, current_contract: price, last_price_update_at: new Date().toISOString() })
            .eq("id", m.id);
        }

        const rangeMin = Number(m.exec_range_min) || 0;
        const rangeMax = Number(m.exec_range_max) || 0;
        const reboundPct = Number(m.monitor_rebound_pct ?? 3);

        // ── 3. Zone tracking ─────────────────────────────────────────────────
        if (m.monitor_status === "watching") {
          if (price > 0 && rangeMax > 0 && price <= rangeMax) {
            // Entered the execution zone — start tracking the best (lowest) price.
            console.log(`[contract-monitor] ${m.id}: ENTERED zone @ ${price} (range ${rangeMin}-${rangeMax})`);
            await supabase.from("index_trades").update({
              monitor_status: "in_zone",
              monitor_entered_zone_at: new Date().toISOString(),
              monitor_best_price: price,
              monitor_best_at: new Date().toISOString(),
            }).eq("id", m.id);
            // Notify that monitoring is now actively tracking the entry (text only).
            if (botToken) {
              const ch = await resolveChannel(supabase, m);
              if (ch) await sendTelegramText(botToken, ch, buildEnteredZoneCaption(m, price));
            }
          } else if (expired) {
            console.log(`[contract-monitor] ${m.id}: EXPIRED without entering zone — not counted`);
            await markExpired(supabase, m, botToken);
            results.expired++;
          } else {
            results.skipped++;
          }
          continue;
        }

        // monitor_status === 'in_zone'
        let best = Number(m.monitor_best_price) || price;

        // Track the lowest price seen (best entry for a buyer).
        if (price > 0 && price < best) {
          best = price;
          await supabase.from("index_trades")
            .update({ monitor_best_price: price, monitor_best_at: new Date().toISOString() })
            .eq("id", m.id);
        }

        const reboundHit = price > 0 && best > 0 && price >= best * (1 + reboundPct / 100);
        const leftZoneUp = price > 0 && rangeMax > 0 && price > rangeMax;

        // Execute on rebound off the low, on leaving the zone upward, or at
        // expiry (capture the best price seen). While the price is still
        // falling we wait for a better fill — UNLESS the monitor has expired.
        if (reboundHit || leftZoneUp || expired) {
          const reason = reboundHit ? "rebound" : leftZoneUp ? "left-zone-up" : "expiry";
          const fillPrice = best > 0 ? best : price;
          console.log(`[contract-monitor] ${m.id}: EXECUTE @ best=${fillPrice} (trigger=${reason})`);
          const ok = await executeMonitor(supabase, m, fillPrice, botToken);
          if (ok) results.executed++; else results.errors++;
        } else {
          results.skipped++;
        }
      } catch (err: any) {
        console.error(`[contract-monitor] ❌ ${m.id}:`, err.message);
        results.errors++;
      }
    }

    const summary = { ok: true, started_at: startedAt, completed_at: new Date().toISOString(), ...results };
    console.log(`[contract-monitor] COMPLETED:`, summary);
    return json(summary);
  } catch (err: any) {
    console.error("[contract-monitor] ❌ Fatal:", err.message, err.stack);
    return json({ ok: false, error: err.message }, 500);
  }
});

// ── Execution ─────────────────────────────────────────────────────────────────

async function executeMonitor(supabase: any, m: any, fillPrice: number, botToken: string | null): Promise<boolean> {
  // Fetch a fresh underlying snapshot for the entry record (best effort).
  let underlyingPrice: number | null = null;
  if (POLYGON_API_KEY && m.polygon_underlying_index_ticker) {
    underlyingPrice = await fetchUnderlyingPrice(m.polygon_underlying_index_ticker, POLYGON_API_KEY);
  }

  const nowIso = new Date().toISOString();
  const contractSnapshot = {
    mid: fillPrice,
    last: fillPrice,
    price: fillPrice,
    timestamp: nowIso,
    source: "monitor_execution",
  };
  const underlyingSnapshot = {
    price: underlyingPrice ?? 0,
    timestamp: nowIso,
  };

  const { data, error } = await supabase.rpc("execute_monitored_contract", {
    p_trade_id: m.id,
    p_entry_price: fillPrice,
    p_underlying_price: underlyingPrice,
    p_underlying_snapshot: underlyingSnapshot,
    p_contract_snapshot: contractSnapshot,
  });

  if (error) {
    console.error(`[contract-monitor]   ❌ execute RPC failed: ${error.message}`);
    return false;
  }
  if (!data?.ok) {
    console.error(`[contract-monitor]   ❌ execute returned: ${JSON.stringify(data)}`);
    return false;
  }
  if (data.already_executed) {
    console.log(`[contract-monitor]   ⏩ ${m.id} already executed`);
    return true;
  }

  console.log(`[contract-monitor]   ✅ ${m.id} executed as active trade @ ${fillPrice}`);

  // Execution alert (تم التنفيذ — صفقة جديدة) with the platform image.
  if (botToken) {
    const channelId = await resolveChannel(supabase, m);
    if (channelId) {
      await sendAlert(supabase, botToken, channelId, m.id, buildExecutionCaption(m, fillPrice));
    }
  }
  return true;
}

async function markExpired(supabase: any, m: any, botToken: string | null): Promise<void> {
  await supabase.from("index_trades")
    .update({ monitor_status: "expired", updated_at: new Date().toISOString() })
    .eq("id", m.id);

  if (botToken) {
    const channelId = await resolveChannel(supabase, m);
    if (channelId) {
      const sym = m.analysis?.index_symbol ?? m.underlying_index_symbol ?? "";
      const strike = m.strike ? Number(m.strike).toFixed(0) : "";
      const type = (m.option_type ?? m.direction ?? "").toUpperCase();
      const caption =
        `⌛️ <b>انتهت مهلة مراقبة العقد</b>\n` +
        `<b>Contract Monitoring Expired</b>\n\n` +
        `<b>${sym}</b> ${type} ${strike ? "$" + strike : ""}\n` +
        `لم يدخل السعر رينج التنفيذ ($${Number(m.exec_range_min).toFixed(2)}–$${Number(m.exec_range_max).toFixed(2)}). ` +
        `لم تُحتسب كصفقة.\nThe price never entered the execution range — not counted as a trade.`;
      // No image for the expiry note.
      await sendTelegramText(botToken, channelId, caption).catch(() => {});
    }
  }
}

// ── Channel resolution (matches buy-range-alert-checker) ───────────────────────

async function resolveChannel(supabase: any, m: any): Promise<string | null> {
  const tryUuid = m.monitor_telegram_channel_id || m.telegram_channel_id;
  if (tryUuid && /^[0-9a-f-]{36}$/i.test(tryUuid)) {
    const { data: ch } = await supabase
      .from("telegram_channels").select("channel_id")
      .eq("id", tryUuid).eq("enabled", true).maybeSingle();
    if (ch?.channel_id) return ch.channel_id;
  }
  const { data: channels } = await supabase
    .from("telegram_channels").select("channel_id")
    .eq("user_id", m.author_id).eq("enabled", true).limit(1);
  return channels?.[0]?.channel_id ?? null;
}

// ── Telegram send (image with text fallback) ───────────────────────────────────

async function sendAlert(
  supabase: any, botToken: string, channelId: string, tradeId: string, caption: string
): Promise<boolean> {
  if (!BASE_URL.includes("localhost")) {
    try {
      const img = await fetchImageBuffer(tradeId);
      if (img && img.byteLength > 1024) {
        await sendTelegramPhoto(botToken, channelId, img, caption);
        return true;
      }
    } catch (e: any) {
      console.warn(`[contract-monitor]   image send failed (${e.message}) — text fallback`);
    }
  }
  return sendTelegramText(botToken, channelId, caption);
}

async function fetchImageBuffer(tradeId: string): Promise<ArrayBuffer | null> {
  const res = await fetch(`${BASE_URL}/api/indices/trades/${tradeId}/generate-image`, {
    signal: AbortSignal.timeout(28_000),
    headers: { Accept: "image/png" },
  });
  if (!res.ok) return null;
  if (!(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
  return res.arrayBuffer();
}

async function sendTelegramPhoto(botToken: string, chatId: string, png: ArrayBuffer, caption: string): Promise<void> {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("photo", new Blob([png], { type: "image/png" }), "alert.png");
  form.append("caption", caption.substring(0, 1024));
  form.append("parse_mode", "HTML");
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`sendPhoto ${res.status}: ${await res.text()}`);
}

async function sendTelegramText(botToken: string, chatId: string, text: string): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  return res.ok;
}

// ── Polygon ─────────────────────────────────────────────────────────────────

// Uses the SAME endpoint as the Next.js polygon service, which returns live
// prices reliably: /v3/snapshot/options/{underlying}/{optionContract}. The
// underlying is WITHOUT the "I:" prefix (e.g. SPX, not I:SPX). Returns the mid
// (bid/ask) when available, then last trade, day close, or fair-market value.
async function fetchOptionPrice(
  underlyingSymbol: string, ticker: string, apiKey: string
): Promise<number> {
  try {
    const clean = ticker.startsWith("O:") ? ticker : `O:${ticker}`;
    const underlying = (underlyingSymbol || "").replace(/^I:/, "");
    const res = await fetch(
      `https://api.polygon.io/v3/snapshot/options/${encodeURIComponent(underlying)}/${encodeURIComponent(clean)}?apiKey=${apiKey}`
    );
    if (!res.ok) return 0;
    const data = await res.json();
    const r = data.results;
    if (!r) return 0;

    const q = r.last_quote ?? {};
    const bid = Number(q.bid ?? 0), ask = Number(q.ask ?? 0);
    const lastTrade = Number(r.last_trade?.price ?? r.last?.price ?? 0);
    const dayClose = Number(r.day?.close ?? r.session?.close ?? 0);
    const fmv = Number(r.fair_market_value ?? 0);

    if (bid > 0 && ask > 0) return parseFloat(((bid + ask) / 2).toFixed(4));
    if (lastTrade > 0) return lastTrade;
    if (dayClose > 0) return dayClose;
    if (fmv > 0) return fmv;
    return 0;
  } catch (e: any) {
    console.error(`[contract-monitor] polygon snapshot error: ${e.message}`);
    return 0;
  }
}

async function fetchUnderlyingPrice(ticker: string, apiKey: string): Promise<number | null> {
  try {
    const t = ticker.startsWith("I:") ? ticker : `I:${ticker}`;
    const res = await fetch(
      `https://api.polygon.io/v3/snapshot/indices?ticker.any_of=${encodeURIComponent(t)}&apiKey=${apiKey}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.results?.[0];
    const price = r?.value ?? r?.session?.close ?? 0;
    return price > 0 ? price : null;
  } catch {
    return null;
  }
}

// ── Captions ──────────────────────────────────────────────────────────────────

function header(m: any): { sym: string; type: string; strike: string; expiry: string; ticker: string } {
  const sym = m.analysis?.index_symbol ?? m.underlying_index_symbol ?? "";
  const type = (m.option_type ?? m.direction ?? "").toUpperCase();
  const strike = m.strike ? Number(m.strike).toFixed(0) : "";
  const expiry = m.expiry
    ? new Date(m.expiry).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" })
    : "";
  const ticker = m.polygon_option_ticker?.replace(/^O:/, "") ?? "";
  return { sym, type, strike, expiry, ticker };
}

function nowEt(): string {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function buildPrepCaption(m: any): string {
  const { sym, type, strike, expiry, ticker } = header(m);
  const cur = Number(m.current_contract ?? m.monitor_last_price ?? 0);
  let msg = `👁️ <b>مراقبة وتجهيز عقد</b>\n`;
  msg += `<b>Contract Monitoring &amp; Preparation</b>\n\n`;
  msg += `<b>${sym}</b> ${type} ${strike ? "سترايك $" + strike : ""}\n`;
  if (ticker) msg += `<b>Contract:</b> ${ticker}\n`;
  if (expiry) msg += `<b>Expiration:</b> ${expiry}\n`;
  if (cur > 0) msg += `<b>السعر الحالي / Current:</b> $${cur.toFixed(2)}\n`;
  msg += `<b>رينج التنفيذ المقترح / Suggested Range:</b> $${Number(m.exec_range_min).toFixed(2)} – $${Number(m.exec_range_max).toFixed(2)}\n`;
  msg += `\n⏳ سيتم رصد العقد وإرسال تنبيه بالتنفيذ بأفضل سعر عند دخوله الرينج.\n`;
  msg += `The system will watch this contract and alert + enter it at the best price once it reaches the range.\n`;
  msg += `<i>لا تُحتسب كصفقة حتى دخول حيز التنفيذ.</i>\n`;
  if (m.author?.full_name) msg += `<b>Analyst:</b> ${m.author.full_name}\n`;
  msg += `<b>Time:</b> ${nowEt()} ET`;
  return msg.length > 1020 ? msg.substring(0, 1020) + "…" : msg;
}

function buildEnteredZoneCaption(m: any, price: number): string {
  const { sym, type, strike } = header(m);
  let msg = `🎯 <b>دخل العقد رينج التنفيذ</b>\n`;
  msg += `<b>Price Entered Execution Range</b>\n\n`;
  msg += `<b>${sym}</b> ${type} ${strike ? "$" + strike : ""}\n`;
  msg += `<b>السعر الحالي / Current:</b> $${price.toFixed(2)}\n`;
  msg += `<b>الرينج / Range:</b> $${Number(m.exec_range_min).toFixed(2)} – $${Number(m.exec_range_max).toFixed(2)}\n`;
  msg += `\n🔎 يتم الآن تتبع أفضل سعر للدخول…\nTracking the best entry price…\n`;
  msg += `<b>Time:</b> ${nowEt()} ET`;
  return msg;
}

function buildExecutionCaption(m: any, fillPrice: number): string {
  const { sym, type, strike, expiry, ticker } = header(m);
  let msg = `🚀 <b>تم التنفيذ — صفقة جديدة</b>\n`;
  msg += `<b>Executed — New Trade</b>\n\n`;
  msg += `<b>${sym}</b> ${type} ${strike ? "سترايك $" + strike : ""}\n`;
  if (ticker) msg += `<b>Contract:</b> ${ticker}\n`;
  if (expiry) msg += `<b>Expiration:</b> ${expiry}\n`;
  msg += `<b>سعر الدخول (أفضل سعر) / Entry (best price):</b> $${fillPrice.toFixed(2)}\n`;
  msg += `<b>الرينج المقترح / Suggested Range:</b> $${Number(m.exec_range_min).toFixed(2)} – $${Number(m.exec_range_max).toFixed(2)}\n`;
  if (m.author?.full_name) msg += `<b>Analyst:</b> ${m.author.full_name}\n`;
  msg += `<b>Time:</b> ${nowEt()} ET`;
  return msg.length > 1020 ? msg.substring(0, 1020) + "…" : msg;
}

// ── helpers ─────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
