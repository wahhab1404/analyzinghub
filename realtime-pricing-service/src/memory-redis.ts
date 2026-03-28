/**
 * realtime-pricing-service/src/memory-redis.ts
 *
 * In-memory drop-in replacement for ioredis.
 * Implements the exact subset of Redis commands used by this service:
 *   get, set, setex, del, incr, decr, sadd, srem, keys, exists, ping, quit
 *
 * TTL is honoured via setTimeout — keys auto-expire just like Redis.
 * EventEmitter interface matches ioredis so callers can do redis.on('connect').
 *
 * WHY: Upstash free tier drops TCP connections aggressively (ECONNRESET /
 * EPIPE). Since this service runs as a single instance, an in-process store
 * is simpler, faster, and perfectly sufficient.
 */

import { EventEmitter } from 'events';

export class MemoryRedis extends EventEmitter {
  private store   = new Map<string, string>();
  private sets    = new Map<string, Set<string>>();
  private timers  = new Map<string, NodeJS.Timeout>();
  private isReady = false;

  constructor() {
    super();
    // Simulate async connect so callers behave the same as with ioredis
    setImmediate(() => {
      this.isReady = true;
      this.emit('connect');
      this.emit('ready');
    });
  }

  // ── TTL helpers ──────────────────────────────────────────────────────────────

  private scheduleExpiry(key: string, seconds: number): void {
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      this.store.delete(key);
      this.sets.delete(key);
      this.timers.delete(key);
    }, seconds * 1000);
    t.unref(); // don't keep the process alive for expiry timers
    this.timers.set(key, t);
  }

  private clearExpiry(key: string): void {
    const t = this.timers.get(key);
    if (t) { clearTimeout(t); this.timers.delete(key); }
  }

  // ── String commands ──────────────────────────────────────────────────────────

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.clearExpiry(key);
    this.store.set(key, value);
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    this.store.set(key, value);
    this.scheduleExpiry(key, seconds);
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys.flat()) {
      const hadStr = this.store.delete(key);
      const hadSet = this.sets.delete(key);
      this.clearExpiry(key);
      if (hadStr || hadSet) count++;
    }
    return count;
  }

  async exists(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys.flat()) {
      if (this.store.has(key) || this.sets.has(key)) count++;
    }
    return count;
  }

  // ── Integer commands ─────────────────────────────────────────────────────────

  async incr(key: string): Promise<number> {
    const val = parseInt(this.store.get(key) ?? '0', 10) + 1;
    this.store.set(key, val.toString());
    return val;
  }

  async decr(key: string): Promise<number> {
    const val = parseInt(this.store.get(key) ?? '0', 10) - 1;
    this.store.set(key, val.toString());
    return val;
  }

  // ── Set commands ─────────────────────────────────────────────────────────────

  async sadd(key: string, ...members: string[]): Promise<number> {
    let s = this.sets.get(key);
    if (!s) { s = new Set(); this.sets.set(key, s); }
    let added = 0;
    for (const m of members.flat()) {
      if (!s.has(m)) { s.add(m); added++; }
    }
    return added;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const s = this.sets.get(key);
    if (!s) return 0;
    let removed = 0;
    for (const m of members.flat()) {
      if (s.delete(m)) removed++;
    }
    return removed;
  }

  async smembers(key: string): Promise<string[]> {
    return Array.from(this.sets.get(key) ?? []);
  }

  // ── Key scan ─────────────────────────────────────────────────────────────────

  async keys(pattern: string): Promise<string[]> {
    // Convert Redis glob pattern to RegExp
    const reStr = '^' + pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex special chars
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.') + '$';
    const re = new RegExp(reStr);
    const all = [...this.store.keys(), ...this.sets.keys()];
    return [...new Set(all)].filter(k => re.test(k));
  }

  // ── Connection ───────────────────────────────────────────────────────────────

  async ping(): Promise<'PONG'> {
    return 'PONG';
  }

  async quit(): Promise<'OK'> {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.store.clear();
    this.sets.clear();
    this.emit('end');
    return 'OK';
  }
}
