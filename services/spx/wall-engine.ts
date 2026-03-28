/**
 * services/spx/wall-engine.ts
 *
 * Phase 2 — Strike Wall Engine
 *
 * Detects and tracks "walls" — strike levels with unusually high OI/volume/gamma
 * concentration that historically act as support (put walls) or resistance (call walls).
 *
 * HEURISTIC DOCUMENTATION
 * ───────────────────────
 * Wall strength formula (per strike):
 *   strength = (
 *     0.40 × (strike_oi / max_strike_oi_in_chain)          ← OI concentration
 *   + 0.30 × (strike_volume / max_strike_volume_in_chain)  ← Volume concentration
 *   + 0.20 × (gamma_cluster / total_chain_gamma)           ← Gamma cluster (±10pts)
 *   + 0.10 × nearby_reinforcement_bonus                    ← Adj. strikes ≥50% of peak
 *   ) × 100
 *
 * Wall persistence:
 *   persistenceScore = min(100, hours_as_dominant_wall × 20)
 *   Fully established at ≥5 hours. Score decays on migration.
 *
 * Wall state transitions:
 *   - holding:    price > 0.5% away from wall
 *   - approached: price within 0.5% of wall
 *   - rejected:   price tested wall (was within 0.3%) and reversed ≥0.2%
 *   - broken:     price has closed on the far side of the wall
 */

import { createClient } from '@supabase/supabase-js';
import type { WallEngineOutput, WallLevel, WallState } from './types';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const POLYGON_BASE_URL = 'https://api.polygon.io';

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function polygonFetch(path: string): Promise<any> {
  if (!POLYGON_API_KEY) throw new Error('POLYGON_API_KEY not configured');
  const url = `${POLYGON_BASE_URL}${path}${path.includes('?') ? '&' : '?'}apiKey=${POLYGON_API_KEY}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${POLYGON_API_KEY}` },
        next: { revalidate: 0 },
      });
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 1500));
        continue;
      }
      if (!res.ok) throw new Error(`Polygon ${res.status}`);
      return res.json();
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
    }
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

// ── TYPES (internal) ─────────────────────────────────────────────────────────

interface StrikeData {
  strike: number;
  callOI: number;
  callVolume: number;
  callGamma: number;
  putOI: number;
  putVolume: number;
  putGamma: number;
}

// ── CHAIN AGGREGATION ────────────────────────────────────────────────────────

async function fetchFullChain(underlyingPrice: number): Promise<StrikeData[]> {
  // Wider band (10%) to capture meaningful OI concentrations further from price
  const minStrike = (underlyingPrice * 0.90).toFixed(0);
  const maxStrike = (underlyingPrice * 1.10).toFixed(0);
  const today = new Date().toISOString().split('T')[0];
  const maxDate = new Date(Date.now() + 35 * 86400000).toISOString().split('T')[0];

  const params = new URLSearchParams({
    'strike_price.gte': minStrike,
    'strike_price.lte': maxStrike,
    'expiration_date.gte': today,
    'expiration_date.lte': maxDate,
    limit: '250',
  });

  const data = await polygonFetch(`/v3/snapshot/options/SPX?${params.toString()}`);
  const contracts: any[] = data.results ?? [];

  // Aggregate by strike across all expirations
  const strikeMap = new Map<number, StrikeData>();

  for (const c of contracts) {
    const strike: number = c.details?.strike_price;
    if (!strike) continue;

    const entry = strikeMap.get(strike) ?? {
      strike,
      callOI: 0, callVolume: 0, callGamma: 0,
      putOI: 0, putVolume: 0, putGamma: 0,
    };

    const oi = c.open_interest ?? 0;
    const vol = c.day?.volume ?? 0;
    const gamma = c.greeks?.gamma ?? 0;

    if (c.details?.contract_type === 'call') {
      entry.callOI += oi;
      entry.callVolume += vol;
      entry.callGamma += gamma;
    } else {
      entry.putOI += oi;
      entry.putVolume += vol;
      entry.putGamma += gamma;
    }

    strikeMap.set(strike, entry);
  }

  return Array.from(strikeMap.values()).sort((a, b) => a.strike - b.strike);
}

// ── WALL STRENGTH COMPUTATION ────────────────────────────────────────────────

function computeCallWallStrength(
  sd: StrikeData,
  maxCallOI: number,
  maxCallVolume: number,
  totalCallGamma: number,
  allStrikes: StrikeData[],
): number {
  if (maxCallOI === 0) return 0;

  const oiConc = maxCallOI > 0 ? sd.callOI / maxCallOI : 0;
  const volConc = maxCallVolume > 0 ? sd.callVolume / maxCallVolume : 0;

  // Gamma cluster: sum gamma within ±10 pts
  const nearStrikes = allStrikes.filter(s =>
    Math.abs(s.strike - sd.strike) <= 10 && s.strike !== sd.strike,
  );
  const nearGamma = nearStrikes.reduce((a, s) => a + s.callGamma, 0) + sd.callGamma;
  const gammaCluster = totalCallGamma > 0 ? nearGamma / totalCallGamma : 0;

  // Nearby reinforcement: adjacent strikes ≥50% of this strike's OI
  const reinforced = nearStrikes.filter(s => s.callOI >= sd.callOI * 0.5).length > 0 ? 1 : 0;

  const rawStrength = (
    0.40 * oiConc +
    0.30 * volConc +
    0.20 * gammaCluster +
    0.10 * reinforced
  ) * 100;

  return clamp(rawStrength);
}

function computePutWallStrength(
  sd: StrikeData,
  maxPutOI: number,
  maxPutVolume: number,
  totalPutGamma: number,
  allStrikes: StrikeData[],
): number {
  if (maxPutOI === 0) return 0;

  const oiConc = maxPutOI > 0 ? sd.putOI / maxPutOI : 0;
  const volConc = maxPutVolume > 0 ? sd.putVolume / maxPutVolume : 0;

  const nearStrikes = allStrikes.filter(s =>
    Math.abs(s.strike - sd.strike) <= 10 && s.strike !== sd.strike,
  );
  const nearGamma = nearStrikes.reduce((a, s) => a + s.putGamma, 0) + sd.putGamma;
  const gammaCluster = totalPutGamma > 0 ? nearGamma / totalPutGamma : 0;

  const reinforced = nearStrikes.filter(s => s.putOI >= sd.putOI * 0.5).length > 0 ? 1 : 0;

  const rawStrength = (
    0.40 * oiConc +
    0.30 * volConc +
    0.20 * gammaCluster +
    0.10 * reinforced
  ) * 100;

  return clamp(rawStrength);
}

// ── WALL STATE DETECTION ─────────────────────────────────────────────────────

function detectWallState(
  wallStrike: number,
  underlyingPrice: number,
  side: 'call' | 'put',
  prevWallSnapshot: any | null,
): WallState {
  const distancePct = Math.abs(wallStrike - underlyingPrice) / underlyingPrice;

  if (distancePct > 0.005) {
    // Check if previously was "approached" or "rejected"
    const prevState = prevWallSnapshot?.full_snapshot?.[side === 'call' ? 'callWall' : 'putWall']?.state;
    if (prevState === 'approached') {
      // Were we previously at this wall and moved away?
      if (side === 'call' && underlyingPrice < wallStrike) return 'rejected';
      if (side === 'put' && underlyingPrice > wallStrike) return 'rejected';
    }
    return 'holding';
  }

  if (distancePct <= 0.003) return 'approached';

  // Check if broken: price has crossed to wrong side
  if (side === 'call' && underlyingPrice > wallStrike * 1.002) return 'broken';
  if (side === 'put' && underlyingPrice < wallStrike * 0.998) return 'broken';

  return 'holding';
}

// ── PERSISTENCE SCORING ───────────────────────────────────────────────────────

function computePersistenceScore(
  wallStrike: number,
  side: 'call' | 'put',
  priorSnapshots: any[],
): { score: number; firstSeenAt: string } {
  // Look back through prior snapshots to find when this strike first appeared as the dominant wall
  const now = new Date().toISOString();

  let firstSeenAt = now;
  let consecutiveHours = 0;

  for (const snap of priorSnapshots) {
    const snapStrike = side === 'call'
      ? snap.call_wall_strike
      : snap.put_wall_strike;

    // Allow ±5pt tolerance for wall migration detection
    if (snapStrike !== null && Math.abs(snapStrike - wallStrike) <= 5) {
      firstSeenAt = snap.captured_at;
      const snapshotAge =
        (Date.now() - new Date(snap.captured_at).getTime()) / 3_600_000;
      consecutiveHours = snapshotAge;
    } else {
      break; // Wall has moved; stop looking back
    }
  }

  const score = Math.min(100, consecutiveHours * 20);
  return { score, firstSeenAt };
}

// ── WALL MIGRATION DETECTION ─────────────────────────────────────────────────

function detectMigration(
  newCallWall: number | null,
  newPutWall: number | null,
  prevSnapshot: any | null,
): { migrated: boolean; direction: 'higher' | 'lower' | 'none' } {
  if (!prevSnapshot) return { migrated: false, direction: 'none' };

  const prevCall = prevSnapshot.call_wall_strike;
  const prevPut = prevSnapshot.put_wall_strike;

  const callMoved =
    newCallWall !== null && prevCall !== null && Math.abs(newCallWall - prevCall) > 10;
  const putMoved =
    newPutWall !== null && prevPut !== null && Math.abs(newPutWall - prevPut) > 10;

  if (!callMoved && !putMoved) return { migrated: false, direction: 'none' };

  // Net direction: if both walls moved the same way
  const callDir = newCallWall && prevCall ? newCallWall - prevCall : 0;
  const putDir = newPutWall && prevPut ? newPutWall - prevPut : 0;
  const netDir = callDir + putDir;

  return {
    migrated: true,
    direction: netDir > 0 ? 'higher' : 'lower',
  };
}

// ── MAIN ENTRY POINT ──────────────────────────────────────────────────────────

export async function computeWallEngine(underlyingPrice: number): Promise<WallEngineOutput> {
  const warnings: string[] = [];
  const supabase = getServiceRoleClient();
  const now = new Date().toISOString();

  // 1. Load prior snapshots for persistence scoring
  const { data: priorSnaps } = await supabase
    .from('spx_wall_snapshots')
    .select('*')
    .order('captured_at', { ascending: false })
    .limit(20);

  const prevSnapshot = priorSnaps?.[0] ?? null;

  // 2. Fetch full options chain
  let strikeData: StrikeData[] = [];
  try {
    strikeData = await fetchFullChain(underlyingPrice);
  } catch (err: any) {
    warnings.push(`Chain fetch failed: ${err.message}. Wall data unavailable.`);
    // Return empty output
    const empty: WallEngineOutput = {
      computedAt: now,
      underlyingPrice,
      callWall: null,
      putWall: null,
      nearestWall: null,
      nearestWallDistance: null,
      secondaryCallWalls: [],
      secondaryPutWalls: [],
      wallMigration: false,
      migrationDirection: 'none',
      wallCompression: false,
      wallCompressionWidth: null,
      wallScore: 0,
      warnings,
    };
    return empty;
  }

  if (strikeData.length === 0) {
    warnings.push('Empty chain — wall data unavailable');
    return {
      computedAt: now,
      underlyingPrice,
      callWall: null,
      putWall: null,
      nearestWall: null,
      nearestWallDistance: null,
      secondaryCallWalls: [],
      secondaryPutWalls: [],
      wallMigration: false,
      migrationDirection: 'none',
      wallCompression: false,
      wallCompressionWidth: null,
      wallScore: 0,
      warnings,
    };
  }

  // 3. Compute chain-level maximums
  const maxCallOI = Math.max(...strikeData.map(s => s.callOI));
  const maxCallVolume = Math.max(...strikeData.map(s => s.callVolume));
  const maxPutOI = Math.max(...strikeData.map(s => s.putOI));
  const maxPutVolume = Math.max(...strikeData.map(s => s.putVolume));
  const totalCallGamma = strikeData.reduce((a, s) => a + s.callGamma, 0);
  const totalPutGamma = strikeData.reduce((a, s) => a + s.putGamma, 0);

  // 4. Score every call-side strike (above price)
  const callCandidates = strikeData
    .filter(s => s.strike >= underlyingPrice)
    .map(sd => ({
      sd,
      strength: computeCallWallStrength(sd, maxCallOI, maxCallVolume, totalCallGamma, strikeData),
    }))
    .filter(c => c.strength > 15) // minimum threshold
    .sort((a, b) => b.strength - a.strength);

  // 5. Score every put-side strike (below price)
  const putCandidates = strikeData
    .filter(s => s.strike <= underlyingPrice)
    .map(sd => ({
      sd,
      strength: computePutWallStrength(sd, maxPutOI, maxPutVolume, totalPutGamma, strikeData),
    }))
    .filter(c => c.strength > 15)
    .sort((a, b) => b.strength - a.strength);

  // 6. Build WallLevel objects
  function buildWallLevel(
    candidate: { sd: StrikeData; strength: number },
    side: 'call' | 'put',
  ): WallLevel {
    const { sd, strength } = candidate;
    const { score: persistenceScore, firstSeenAt } = computePersistenceScore(
      sd.strike,
      side,
      priorSnaps ?? [],
    );
    const state = detectWallState(sd.strike, underlyingPrice, side, prevSnapshot);
    const gammaCluster = side === 'call' ? sd.callGamma : sd.putGamma;
    const oi = side === 'call' ? sd.callOI : sd.putOI;
    const volume = side === 'call' ? sd.callVolume : sd.putVolume;
    const distance = Math.abs(sd.strike - underlyingPrice);
    const distancePct = (distance / underlyingPrice) * 100;

    return {
      strike: sd.strike,
      side,
      strength,
      openInterest: oi,
      volume,
      gammaCluster,
      distanceFromPrice: distance,
      distancePct,
      persistenceScore,
      state,
      firstSeenAt,
      lastSeenAt: now,
    };
  }

  const callWall = callCandidates[0]
    ? buildWallLevel(callCandidates[0], 'call')
    : null;

  const putWall = putCandidates[0]
    ? buildWallLevel(putCandidates[0], 'put')
    : null;

  const secondaryCallWalls = callCandidates.slice(1, 4).map(c => buildWallLevel(c, 'call'));
  const secondaryPutWalls = putCandidates.slice(1, 4).map(c => buildWallLevel(c, 'put'));

  // 7. Nearest wall
  let nearestWall: WallLevel | null = null;
  let nearestWallDistance: number | null = null;

  const bothWalls = [callWall, putWall].filter((w): w is WallLevel => w !== null);
  if (bothWalls.length > 0) {
    nearestWall = bothWalls.reduce((a, b) =>
      a.distanceFromPrice < b.distanceFromPrice ? a : b,
    );
    nearestWallDistance = nearestWall.distanceFromPrice;
  }

  // 8. Wall compression check
  let wallCompression = false;
  let wallCompressionWidth: number | null = null;
  if (callWall && putWall) {
    wallCompressionWidth = callWall.strike - putWall.strike;
    wallCompression = wallCompressionWidth > 0 && wallCompressionWidth < 30;
  }

  // 9. Migration detection
  const { migrated, direction } = detectMigration(
    callWall?.strike ?? null,
    putWall?.strike ?? null,
    prevSnapshot,
  );

  // 10. Aggregate wall score
  const callStr = callWall?.strength ?? 0;
  const putStr = putWall?.strength ?? 0;
  const compressionBonus = wallCompression ? 10 : 0;
  const wallScore = clamp((callStr * 0.5 + putStr * 0.5) + compressionBonus);

  const output: WallEngineOutput = {
    computedAt: now,
    underlyingPrice,
    callWall,
    putWall,
    nearestWall,
    nearestWallDistance,
    secondaryCallWalls,
    secondaryPutWalls,
    wallMigration: migrated,
    migrationDirection: direction,
    wallCompression,
    wallCompressionWidth,
    wallScore: Math.round(wallScore),
    warnings,
  };

  // 11. Persist snapshot
  const snapPayload = {
    underlying_price: underlyingPrice,
    call_wall_strike: callWall?.strike ?? null,
    call_wall_strength: callWall?.strength ?? null,
    call_wall_oi: callWall?.openInterest ?? null,
    call_wall_volume: callWall?.volume ?? null,
    call_wall_gamma: callWall?.gammaCluster ?? null,
    call_wall_state: callWall?.state ?? null,
    put_wall_strike: putWall?.strike ?? null,
    put_wall_strength: putWall?.strength ?? null,
    put_wall_oi: putWall?.openInterest ?? null,
    put_wall_volume: putWall?.volume ?? null,
    put_wall_gamma: putWall?.gammaCluster ?? null,
    put_wall_state: putWall?.state ?? null,
    nearest_wall_strike: nearestWall?.strike ?? null,
    nearest_wall_side: nearestWall?.side ?? null,
    nearest_wall_distance: nearestWallDistance,
    nearest_wall_strength: nearestWall?.strength ?? null,
    wall_compression: wallCompression,
    wall_compression_width: wallCompressionWidth,
    wall_migration: migrated,
    migration_direction: direction,
    wall_score: Math.round(wallScore),
    full_snapshot: {
      ...output,
      callVolume: strikeData.reduce((a, s) => a + s.callVolume, 0),
      putVolume: strikeData.reduce((a, s) => a + s.putVolume, 0),
    },
    warnings,
  };

  const { error: snapErr } = await supabase.from('spx_wall_snapshots').insert(snapPayload);
  if (snapErr) console.error('[WallEngine] Failed to persist snapshot:', snapErr.message);

  return output;
}
