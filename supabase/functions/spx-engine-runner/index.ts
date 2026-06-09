/**
 * supabase/functions/spx-engine-runner/index.ts
 *
 * Background SPX Intelligence Engine Runner.
 *
 * Triggered by pg_cron every 30 seconds.
 * Calls the Next.js /api/spx/signal endpoint which runs the full pipeline.
 *
 * Works only when:
 *   - spx_settings.engine_enabled = true
 *   - Current time is within active_hour_start / active_hour_end (ET)
 *
 * env vars required:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto-provided in edge runtime)
 *   APP_BASE_URL  e.g. https://your-app.vercel.app
 *   SPX_ENGINE_SECRET  optional. If unset, the service-role key is used as the
 *                      internal auth secret (the app accepts either).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, X-Client-Info",
};

// ── HELPERS ───────────────────────────────────────────────────────────────────

function getEasternHour(): number {
  const now = new Date();
  const etStr = now.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false });
  return parseInt(etStr, 10);
}

function isWeekend(): boolean {
  const now = new Date();
  const day = parseInt(now.toLocaleString("en-US", { timeZone: "America/New_York", weekday: "numeric" }), 10);
  // 0=Sun, 6=Sat in some locales — use day-of-week via UTC day adjusted for ET
  const etDay = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" })).getDay();
  return etDay === 0 || etDay === 6;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
  const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const appBaseUrl   = Deno.env.get("APP_BASE_URL") ?? Deno.env.get("NEXT_PUBLIC_APP_URL") ?? "";
  const engineSecret = Deno.env.get("SPX_ENGINE_SECRET") ?? "";

  if (!appBaseUrl) {
    console.error("[spx-engine-runner] APP_BASE_URL not set — cannot call intelligence pipeline");
    return new Response(JSON.stringify({ ok: false, reason: "no_app_base_url" }), { status: 500, headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // ── 1. Read settings ─────────────────────────────────────────────────────
    const { data: settingsRow } = await supabase
      .from("spx_settings")
      .select("engine_enabled, active_hour_start, active_hour_end")
      .limit(1)
      .single();

    const engineEnabled  = settingsRow?.engine_enabled  ?? false;
    const activeHourStart = settingsRow?.active_hour_start ?? 9;
    const activeHourEnd   = settingsRow?.active_hour_end   ?? 16;

    if (!engineEnabled) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "engine_disabled" }), { headers: corsHeaders });
    }

    // ── 2. Market hours guard ────────────────────────────────────────────────
    if (isWeekend()) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "weekend" }), { headers: corsHeaders });
    }

    const etHour = getEasternHour();
    if (etHour < activeHourStart || etHour >= activeHourEnd) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: `outside_hours:${etHour}` }), { headers: corsHeaders });
    }

    // ── 3. Call intelligence pipeline ────────────────────────────────────────
    const signalUrl = `${appBaseUrl}/api/spx/signal?skipWalls=false&skipContracts=false`;

    // Authenticate the internal call. Prefer an explicit SPX_ENGINE_SECRET;
    // otherwise fall back to the service-role key, which the app also holds.
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    };
    const internalSecret = engineSecret || serviceKey;
    if (internalSecret) {
      headers["X-SPX-Engine-Secret"] = internalSecret;
    }

    const startMs = Date.now();
    const res = await fetch(signalUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(25_000),
    });

    const durationMs = Date.now() - startMs;

    if (!res.ok) {
      const body = await res.text();
      console.error(`[spx-engine-runner] Pipeline HTTP ${res.status}: ${body.slice(0, 200)}`);
      return new Response(
        JSON.stringify({ ok: false, reason: `http_${res.status}`, durationMs }),
        { status: 502, headers: corsHeaders },
      );
    }

    const data = await res.json();
    const signalType  = data?.signal?.signalType  ?? "none";
    const confidence  = data?.signal?.confidenceClass ?? "—";
    const spxPrice    = data?.features?.underlying?.price ?? null;
    const autoTrade   = data?.autoTrade ?? null;

    console.log(`[spx-engine-runner] ✅ ${durationMs}ms | signal=${signalType} | class=${confidence} | SPX=${spxPrice}${autoTrade ? ` | auto=${autoTrade.created ? "created" : "skipped:"+autoTrade.reason}` : ""}`);

    return new Response(
      JSON.stringify({ ok: true, durationMs, signalType, confidence, spxPrice, autoTrade }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[spx-engine-runner] Error:", err?.message);
    return new Response(
      JSON.stringify({ ok: false, error: err?.message }),
      { status: 500, headers: corsHeaders },
    );
  }
});
