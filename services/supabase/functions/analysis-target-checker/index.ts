import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const EPSILON = 0.01;

interface PriceBasis {
  current: number;
  high: number;
  low: number;
  session: string;
  source: string;
}

interface TargetEvaluationResult {
  targetId: string;
  targetNumber: number;
  targetPrice: number;
  isHit: boolean;
  hitPrice?: number;
  hitAt?: string;
  hitSession?: string;
  hitSource?: string;
  reason?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("[analysis-target-checker] Starting target check cycle");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const polygonApiKey = Deno.env.get("POLYGON_API_KEY");

    if (!polygonApiKey) {
      throw new Error("POLYGON_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: indexAnalyses, error: indexAnalysesError } = await supabase
      .from("index_analyses")
      .select("id, index_symbol, title, author_id, targets, targets_hit, telegram_channel_id")
      .in("status", ["published", "active"])
      .order("last_target_check_at", { ascending: true, nullsFirst: true })
      .limit(25);

    if (indexAnalysesError) {
      console.error("Error fetching index analyses:", indexAnalysesError);
      throw indexAnalysesError;
    }

    const { data: stockAnalyses, error: stockAnalysesError } = await supabase
      .from("analyses")
      .select(`
        id,
        analyzer_id,
        direction,
        status,
        stop_loss,
        price_at_post,
        targets_hit_data,
        last_eval_at,
        symbol:symbols!inner(id, symbol)
      `)
      .eq("status", "IN_PROGRESS")
      .not("symbol_id", "is", null)
      .order("last_eval_at", { ascending: true, nullsFirst: true })
      .limit(25);

    if (stockAnalysesError) {
      console.error("Error fetching stock analyses:", stockAnalysesError);
      throw stockAnalysesError;
    }

    const indexAnalysesWithTargets = (indexAnalyses || []).filter(
      (a: any) => a.targets && Array.isArray(a.targets) && a.targets.length > 0
    );

    const stockAnalysesWithTargets = stockAnalyses || [];

    const totalToCheck = indexAnalysesWithTargets.length + stockAnalysesWithTargets.length;

    if (totalToCheck === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No analyses with targets to check", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${indexAnalysesWithTargets.length} index analyses and ${stockAnalysesWithTargets.length} stock analyses to check`);

    const results = {
      processed: 0,
      targetsHit: 0,
      errors: 0,
      indexAnalysesProcessed: 0,
      stockAnalysesProcessed: 0,
    };

    for (const analysis of indexAnalysesWithTargets) {
      try {
        const { data: indexRef } = await supabase
          .from("indices_reference")
          .select("polygon_index_ticker")
          .eq("index_symbol", analysis.index_symbol)
          .single();

        if (!indexRef) {
          console.error(`Index not found: ${analysis.index_symbol}`);
          continue;
        }

        const currentPrice = await fetchPolygonPrice(
          indexRef.polygon_index_ticker,
          polygonApiKey
        );

        if (!currentPrice) {
          console.error(`Failed to fetch price for ${indexRef.polygon_index_ticker}`);
          continue;
        }

        const targets = analysis.targets || [];
        const targetsHit = analysis.targets_hit || [];
        const newTargetsHit: number[] = [];

        for (let i = 0; i < targets.length; i++) {
          const target = targets[i];

          if (targetsHit.includes(i) || target.reached) {
            continue;
          }

          const targetLevel = parseFloat(target.level);
          const tolerance = targetLevel * 0.001;
          const priceReached = Math.abs(currentPrice - targetLevel) <= tolerance;

          if (priceReached) {
            console.log(`Target ${i} hit for analysis ${analysis.id}: $${currentPrice} (Target: $${targetLevel})`);
            newTargetsHit.push(i);

            targets[i] = {
              ...target,
              reached: true,
              reached_at: new Date().toISOString(),
            };

            await supabase.from("analysis_target_hits").insert({
              analysis_id: analysis.id,
              target_index: i,
              target_level: targetLevel,
              hit_price: currentPrice,
            });

            const updateText = `🎯 ${target.label || `Target ${i + 1}`} reached at $${currentPrice.toFixed(2)}!`;
            await supabase.from("analysis_updates").insert({
              analysis_id: analysis.id,
              author_id: analysis.author_id,
              body: updateText,
              text_en: updateText,
              text_ar: `🎯 ${target.label || `الهدف ${i + 1}`} تم الوصول إلى $${currentPrice.toFixed(2)}!`,
              update_type: "target_hit",
            });

            if (analysis.telegram_channel_id) {
              try {
                await fetch(`${supabaseUrl}/functions/v1/indices-telegram-publisher`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${supabaseKey}`,
                  },
                  body: JSON.stringify({
                    entityType: "analysis_update",
                    entityId: analysis.id,
                    channelId: analysis.telegram_channel_id,
                  }),
                });
              } catch (e) {
                console.error("Failed to send Telegram notification:", e);
              }
            }

            results.targetsHit++;
          }
        }

        if (newTargetsHit.length > 0) {
          await supabase
            .from("index_analyses")
            .update({
              targets,
              targets_hit: [...targetsHit, ...newTargetsHit],
              last_target_check_at: new Date().toISOString(),
            })
            .eq("id", analysis.id);
        } else {
          await supabase
            .from("index_analyses")
            .update({ last_target_check_at: new Date().toISOString() })
            .eq("id", analysis.id);
        }

        results.processed++;
        results.indexAnalysesProcessed++;
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error("Error processing index analysis:", error);
        results.errors++;
      }
    }

    for (const analysis of stockAnalysesWithTargets) {
      try {
        const symbol = analysis.symbol?.symbol;
        if (!symbol) {
          console.error(`Stock analysis ${analysis.id} missing symbol`);
          continue;
        }

        const direction = normalizeDirection(analysis.direction);
        if (!direction) {
          console.error(`Stock analysis ${analysis.id} has invalid direction: ${analysis.direction}`);
          continue;
        }

        console.log(`\n=== Checking ${symbol} (${direction}) ===`);

        const priceBasis = await fetchStockPriceBasis(symbol, polygonApiKey, true);

        if (!priceBasis) {
          console.error(`Failed to fetch price for ${symbol}`);
          continue;
        }

        console.log(`Price Basis: Current=$${priceBasis.current}, High=$${priceBasis.high}, Low=$${priceBasis.low}, Session=${priceBasis.session}, Source=${priceBasis.source}`);

        const { data: targets, error: targetsError } = await supabase
          .from("analysis_targets")
          .select("*")
          .eq("analysis_id", analysis.id)
          .order("price", { ascending: direction === "LONG" });

        if (targetsError || !targets || targets.length === 0) {
          console.log(`No targets for stock analysis ${analysis.id}`);
          await supabase
            .from("analyses")
            .update({ last_eval_at: new Date().toISOString() })
            .eq("id", analysis.id);
          continue;
        }

        console.log(`Found ${targets.length} targets to evaluate`);

        const evaluationResults = evaluateTargets(
          direction,
          targets,
          priceBasis,
          analysis.targets_hit_data || []
        );

        const targetsHitData = analysis.targets_hit_data || [];
        let newTargetsHit = 0;
        let firstTargetHit = null;
        const wasAlreadySuccessful = analysis.status === "SUCCESS";

        for (const result of evaluationResults) {
          if (result.isHit) {
            const alreadyHit = targetsHitData.some((hit: any) => hit.target_id === result.targetId);
            if (alreadyHit) {
              console.log(`⏭️  Target ${result.targetNumber} already marked as hit (skipping)`);
              continue;
            }

            console.log(`✅ Target ${result.targetNumber} HIT: $${result.hitPrice} (Target: $${result.targetPrice}) - ${result.reason}`);

            targetsHitData.push({
              target_id: result.targetId,
              target_number: result.targetNumber,
              target_price: result.targetPrice,
              hit_price: result.hitPrice,
              hit_at: result.hitAt,
              hit_session: result.hitSession,
              hit_source: result.hitSource,
            });

            if (!firstTargetHit) {
              firstTargetHit = result;
            }

            await supabase.rpc('award_points_for_event', {
              p_analyzer_id: analysis.analyzer_id,
              p_event_type: 'target_hit',
              p_reference_type: 'analysis_target',
              p_reference_id: result.targetId,
              p_metadata: {
                target_number: result.targetNumber,
                target_price: result.targetPrice,
                hit_price: result.hitPrice,
              }
            });

            try {
              const { data: channels } = await supabase
                .from("telegram_channels")
                .select("channel_id, channel_name, notify_target_hit")
                .eq("user_id", analysis.analyzer_id)
                .eq("enabled", true)
                .eq("notify_target_hit", true);

              if (channels && channels.length > 0) {
                const { data: siteDomain } = await supabase
                  .from("admin_settings")
                  .select("value")
                  .eq("key", "site_domain")
                  .single();

                const domain = siteDomain?.value || "analyzhub.com";

                for (const channel of channels) {
                  const message = `🎯 Target ${result.targetNumber} Hit!\n\n${symbol}\nTarget Price: $${result.targetPrice.toFixed(2)}\nHit Price: $${result.hitPrice.toFixed(2)}\nSession: ${result.hitSession}\n\n${direction === "LONG" ? "📈" : "📉"} View: https://${domain}/share/${analysis.id}`;

                  await supabase.from("telegram_outbox").insert({
                    channel_id: channel.channel_id,
                    message_type: "target_hit",
                    payload: {
                      analysis_id: analysis.id,
                      symbol,
                      target_number: result.targetNumber,
                      target_price: result.targetPrice,
                      hit_price: result.hitPrice,
                      message
                    },
                    priority: 2,
                  });

                  console.log(`📤 Queued Telegram notification for ${symbol} target ${result.targetNumber} to ${channel.channel_name}`);
                }
              }
            } catch (telegramError) {
              console.error("Failed to queue Telegram notification:", telegramError);
            }

            newTargetsHit++;
            results.targetsHit++;
          } else {
            console.log(`⏸️  Target ${result.targetNumber} NOT HIT: $${result.targetPrice} - ${result.reason}`);
          }
        }

        if (newTargetsHit > 0) {
          await supabase
            .from("analyses")
            .update({
              targets_hit_data: targetsHitData,
              last_eval_at: new Date().toISOString(),
            })
            .eq("id", analysis.id);

          if (firstTargetHit && !wasAlreadySuccessful) {
            console.log(`🎉 First target hit for analysis ${analysis.id}! Finalizing as SUCCESS...`);

            try {
              const { data: successResult, error: successError } = await supabase.rpc(
                'finalize_analysis_success',
                {
                  p_analysis_id: analysis.id,
                  p_target_id: firstTargetHit.targetId,
                  p_hit_price: firstTargetHit.hitPrice,
                  p_hit_session: firstTargetHit.hitSession,
                  p_hit_source: firstTargetHit.hitSource
                }
              );

              if (successError) {
                console.error(`Failed to finalize success for analysis ${analysis.id}:`, successError);
              } else {
                console.log(`✅ Analysis ${analysis.id} finalized as SUCCESS:`, successResult);
              }
            } catch (finalizeError) {
              console.error(`Exception finalizing success for analysis ${analysis.id}:`, finalizeError);
            }
          }
        } else {
          await supabase
            .from("analyses")
            .update({ last_eval_at: new Date().toISOString() })
            .eq("id", analysis.id);
        }

        results.processed++;
        results.stockAnalysesProcessed++;
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error("Error processing stock analysis:", error);
        results.errors++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`\nCompleted in ${duration}ms:`, results);

    return new Response(
      JSON.stringify({ ok: true, duration, ...results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Fatal error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function normalizeDirection(direction: string | null | undefined): "LONG" | "SHORT" | null {
  if (!direction) return null;
  const normalized = direction.toUpperCase().trim();
  if (normalized === "LONG" || normalized === "BUY" || normalized === "CALL") return "LONG";
  if (normalized === "SHORT" || normalized === "SELL" || normalized === "PUT") return "SHORT";
  return null;
}

function normalizePrice(value: string | number): number {
  if (typeof value === "number") return value;
  const parsed = parseFloat(value.toString().replace(/[$,]/g, ""));
  return isNaN(parsed) ? 0 : parsed;
}

function isPriceValid(price: number): boolean {
  return !isNaN(price) && price > 0 && isFinite(price);
}

function evaluateTargets(
  direction: "LONG" | "SHORT",
  targets: any[],
  priceBasis: PriceBasis,
  existingHits: any[]
): TargetEvaluationResult[] {
  const results: TargetEvaluationResult[] = [];

  const sortedTargets = [...targets].sort((a, b) => {
    const priceA = normalizePrice(a.price);
    const priceB = normalizePrice(b.price);
    return direction === "LONG" ? priceA - priceB : priceB - priceA;
  });

  let allPreviousHit = true;

  for (let i = 0; i < sortedTargets.length; i++) {
    const target = sortedTargets[i];
    const targetPrice = normalizePrice(target.price);

    if (!isPriceValid(targetPrice)) {
      results.push({
        targetId: target.id,
        targetNumber: i + 1,
        targetPrice,
        isHit: false,
        reason: "Invalid target price",
      });
      allPreviousHit = false;
      continue;
    }

    const alreadyHit = existingHits.some((hit: any) => hit.target_id === target.id);

    if (alreadyHit) {
      results.push({
        targetId: target.id,
        targetNumber: i + 1,
        targetPrice,
        isHit: true,
        reason: "Already marked as hit",
      });
      continue;
    }

    if (!allPreviousHit && i > 0) {
      results.push({
        targetId: target.id,
        targetNumber: i + 1,
        targetPrice,
        isHit: false,
        reason: "Previous target not hit (cascade rule)",
      });
      continue;
    }

    let isHit = false;
    let hitPrice = priceBasis.current;
    let hitSource = "current";
    let reason = "";

    if (direction === "LONG") {
      const priceWithEpsilon = targetPrice - EPSILON;

      if (priceBasis.high >= priceWithEpsilon) {
        isHit = true;
        hitPrice = priceBasis.high;
        hitSource = priceBasis.source + "_high";
        reason = `High $${priceBasis.high.toFixed(2)} >= Target $${targetPrice.toFixed(2)} (ε=${EPSILON})`;
      } else {
        reason = `High $${priceBasis.high.toFixed(2)} < Target $${targetPrice.toFixed(2)} (ε=${EPSILON})`;
      }
    } else {
      const priceWithEpsilon = targetPrice + EPSILON;

      if (priceBasis.low <= priceWithEpsilon) {
        isHit = true;
        hitPrice = priceBasis.low;
        hitSource = priceBasis.source + "_low";
        reason = `Low $${priceBasis.low.toFixed(2)} <= Target $${targetPrice.toFixed(2)} (ε=${EPSILON})`;
      } else {
        reason = `Low $${priceBasis.low.toFixed(2)} > Target $${targetPrice.toFixed(2)} (ε=${EPSILON})`;
      }
    }

    if (!isHit) {
      allPreviousHit = false;
    }

    results.push({
      targetId: target.id,
      targetNumber: i + 1,
      targetPrice,
      isHit,
      hitPrice: isHit ? hitPrice : undefined,
      hitAt: isHit ? new Date().toISOString() : undefined,
      hitSession: isHit ? priceBasis.session : undefined,
      hitSource: isHit ? hitSource : undefined,
      reason,
    });
  }

  return results;
}

async function fetchStockPriceBasis(
  symbol: string,
  apiKey: string,
  includeExtendedHours: boolean = true
): Promise<PriceBasis | null> {
  try {
    const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`Failed to fetch ${symbol}: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.status !== "OK" || !data.ticker) {
      return null;
    }

    const ticker = data.ticker;

    const lastTradePrice = ticker.lastTrade?.p || 0;
    const lastQuotePrice = (ticker.lastQuote?.p || 0 + ticker.lastQuote?.P || 0) / 2;
    const dayClose = ticker.day?.c || 0;
    const prevDayClose = ticker.prevDay?.c || 0;

    const current = lastTradePrice || lastQuotePrice || dayClose || prevDayClose || 0;

    if (!isPriceValid(current)) {
      console.error(`No valid current price for ${symbol}`);
      return null;
    }

    const dayHigh = ticker.day?.h || 0;
    const dayLow = ticker.day?.l || 0;
    const prevDayHigh = ticker.prevDay?.h || 0;
    const prevDayLow = ticker.prevDay?.l || 0;

    let high = current;
    let low = current;
    let session = "unknown";
    let source = "current";

    if (includeExtendedHours) {
      const allHighs = [dayHigh, prevDayHigh, current].filter(v => isPriceValid(v));
      const allLows = [dayLow, prevDayLow, current].filter(v => isPriceValid(v));

      high = allHighs.length > 0 ? Math.max(...allHighs) : current;
      low = allLows.length > 0 ? Math.min(...allLows) : current;

      if (dayHigh > 0) {
        session = "day";
        source = "day";
      } else if (prevDayHigh > 0) {
        session = "prev_day";
        source = "prev_day";
      } else {
        session = "extended";
        source = "extended";
      }
    } else {
      if (isPriceValid(dayHigh) && isPriceValid(dayLow)) {
        high = Math.max(dayHigh, current);
        low = Math.min(dayLow, current);
        session = "day";
        source = "day";
      } else {
        high = current;
        low = current;
        session = "current";
        source = "current";
      }
    }

    return {
      current,
      high,
      low,
      session,
      source,
    };
  } catch (error) {
    console.error(`Error fetching stock price basis for ${symbol}:`, error);
    return null;
  }
}

async function fetchPolygonPrice(ticker: string, apiKey: string): Promise<number | null> {
  try {
    const url = `https://api.polygon.io/v3/snapshot?ticker.any_of=${ticker}&apiKey=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (data.status === "OK" && data.results && data.results.length > 0) {
      const snapshot = data.results[0];
      const price = snapshot.value || snapshot.session?.close || snapshot.session?.previous_close || null;
      console.log(`Fetched ${ticker}: $${price}`);
      return price;
    }

    return null;
  } catch (error) {
    console.error("Error fetching price:", error);
    return null;
  }
}
