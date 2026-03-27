/**
 * realtime-pricing-service/src/stream-health.ts
 *
 * Tracks the health of each WebSocket connection (options + indices) and
 * exposes a summary status used by the health endpoint and logged periodically.
 *
 * Also owns the heartbeat / connection-liveness logic:
 *   - tracks last-event timestamps per stream
 *   - emits 'degraded' when a stream has been silent for >DEGRADED_THRESHOLD
 *   - emits 'disconnected' when silent for >STALE_THRESHOLD or ws is closed
 */

import { EventEmitter } from 'events';

// ── THRESHOLDS ────────────────────────────────────────────────────────────────

const DEGRADED_THRESHOLD_MS = 30_000;   // 30 s silence → degraded
const STALE_THRESHOLD_MS    = 120_000;  // 2 min silence → disconnected
const REPORT_INTERVAL_MS    = 60_000;   // log health every 60 s

export type StreamName = 'options' | 'indices';
export type StreamStatus = 'healthy' | 'degraded' | 'disconnected';

export interface StreamStats {
  name: StreamName;
  status: StreamStatus;
  connected: boolean;
  authenticated: boolean;
  subscribedTickers: number;
  lastEventAt: Date | null;
  secondsSinceLastEvent: number | null;
  reconnectAttempts: number;
  totalEventsProcessed: number;
}

export interface EngineHealthSnapshot {
  overallStatus: StreamStatus;
  options: StreamStats;
  indices: StreamStats;
  uptimeSeconds: number;
  reportedAt: Date;
}

// ── STREAM HEALTH TRACKER ─────────────────────────────────────────────────────

export class StreamHealthTracker extends EventEmitter {
  private startedAt = new Date();
  private reportInterval: NodeJS.Timeout | null = null;

  private state: Record<StreamName, {
    connected: boolean;
    authenticated: boolean;
    subscribedTickers: number;
    lastEventAt: Date | null;
    reconnectAttempts: number;
    totalEventsProcessed: number;
  }> = {
    options: {
      connected: false,
      authenticated: false,
      subscribedTickers: 0,
      lastEventAt: null,
      reconnectAttempts: 0,
      totalEventsProcessed: 0,
    },
    indices: {
      connected: false,
      authenticated: false,
      subscribedTickers: 0,
      lastEventAt: null,
      reconnectAttempts: 0,
      totalEventsProcessed: 0,
    },
  };

  start(): void {
    if (this.reportInterval) return;
    this.reportInterval = setInterval(() => this.logHealthReport(), REPORT_INTERVAL_MS);
  }

  stop(): void {
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }
  }

  // ── MUTATION METHODS ──────────────────────────────────────────────────────

  setConnected(stream: StreamName, connected: boolean): void {
    this.state[stream].connected = connected;
    if (!connected) {
      this.state[stream].authenticated = false;
    }
  }

  setAuthenticated(stream: StreamName, authenticated: boolean): void {
    this.state[stream].authenticated = authenticated;
  }

  setSubscribedCount(stream: StreamName, count: number): void {
    this.state[stream].subscribedTickers = count;
  }

  recordEvent(stream: StreamName): void {
    const now = new Date();
    this.state[stream].lastEventAt = now;
    this.state[stream].totalEventsProcessed++;
  }

  recordReconnect(stream: StreamName): void {
    this.state[stream].reconnectAttempts++;
  }

  // ── STATUS COMPUTATION ────────────────────────────────────────────────────

  getStreamStatus(stream: StreamName): StreamStatus {
    const s = this.state[stream];

    if (!s.connected) return 'disconnected';

    if (s.lastEventAt === null) {
      // Connected but no events yet — give it some grace time
      const uptimeMs = Date.now() - this.startedAt.getTime();
      return uptimeMs < DEGRADED_THRESHOLD_MS ? 'healthy' : 'degraded';
    }

    const silenceMs = Date.now() - s.lastEventAt.getTime();
    if (silenceMs > STALE_THRESHOLD_MS)    return 'disconnected';
    if (silenceMs > DEGRADED_THRESHOLD_MS) return 'degraded';
    return 'healthy';
  }

  getStats(stream: StreamName): StreamStats {
    const s = this.state[stream];
    const lastEventAt = s.lastEventAt;
    const secondsSinceLastEvent = lastEventAt
      ? Math.floor((Date.now() - lastEventAt.getTime()) / 1000)
      : null;

    return {
      name: stream,
      status: this.getStreamStatus(stream),
      connected: s.connected,
      authenticated: s.authenticated,
      subscribedTickers: s.subscribedTickers,
      lastEventAt,
      secondsSinceLastEvent,
      reconnectAttempts: s.reconnectAttempts,
      totalEventsProcessed: s.totalEventsProcessed,
    };
  }

  getHealthSnapshot(): EngineHealthSnapshot {
    const optionsStats = this.getStats('options');
    const indicesStats = this.getStats('indices');

    // Overall status is the worst of the two streams
    const statusRank: Record<StreamStatus, number> = {
      healthy: 0,
      degraded: 1,
      disconnected: 2,
    };
    const overallStatus: StreamStatus =
      statusRank[optionsStats.status] >= statusRank[indicesStats.status]
        ? optionsStats.status
        : indicesStats.status;

    return {
      overallStatus,
      options: optionsStats,
      indices: indicesStats,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt.getTime()) / 1000),
      reportedAt: new Date(),
    };
  }

  isOptionsHealthy(): boolean {
    return this.getStreamStatus('options') === 'healthy';
  }

  isIndicesHealthy(): boolean {
    return this.getStreamStatus('indices') === 'healthy';
  }

  // ── LOGGING ───────────────────────────────────────────────────────────────

  private logHealthReport(): void {
    const snap = this.getHealthSnapshot();

    const icon = snap.overallStatus === 'healthy' ? '✅'
                : snap.overallStatus === 'degraded' ? '⚠️'
                : '❌';

    console.log(
      `${icon} [StreamHealth] Status: ${snap.overallStatus.toUpperCase()} | ` +
      `Options: ${snap.options.status} (${snap.options.subscribedTickers} tickers, ` +
      `${snap.options.secondsSinceLastEvent ?? 'n/a'}s ago, ` +
      `${snap.options.totalEventsProcessed} events) | ` +
      `Indices: ${snap.indices.status} (${snap.indices.subscribedTickers} tickers, ` +
      `${snap.indices.secondsSinceLastEvent ?? 'n/a'}s ago, ` +
      `${snap.indices.totalEventsProcessed} events) | ` +
      `Uptime: ${Math.floor(snap.uptimeSeconds / 60)}m`
    );
  }
}

// Singleton for use across the service
export const streamHealth = new StreamHealthTracker();
