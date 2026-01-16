/**
 * Options Chain Caching Service
 *
 * Implements Supabase-based caching for options chain data with TTL
 * Reduces Polygon API calls and improves response times
 */

import { createClient } from '@supabase/supabase-js';
import type { OptionsChainConfig, OptionsChainResponse } from './options-chain.service';

// Default cache TTL (5 seconds for live data)
const DEFAULT_CACHE_TTL = 5;

interface CacheEntry {
  cache_key: string;
  data: any;
  created_at: string;
  expires_at: string;
}

class OptionsCacheService {
  private _supabase: ReturnType<typeof createClient> | null = null;

  private get supabase() {
    if (!this._supabase) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!url || !key) {
        throw new Error('Supabase environment variables not configured');
      }

      this._supabase = createClient(url, key);
    }
    return this._supabase;
  }

  /**
   * Generate cache key from config
   */
  private generateCacheKey(config: OptionsChainConfig): string {
    const {
      underlying,
      contractType,
      percentBand = 0.03,
      minDTE = 0,
      maxDTE = 45,
    } = config;

    // Create deterministic cache key
    // Round percentBand to avoid float precision issues
    const bandKey = (percentBand * 100).toFixed(1);

    return `options_chain:${underlying}:${contractType}:${bandKey}:${minDTE}:${maxDTE}`;
  }

  /**
   * Get cached options chain
   */
  async get(config: OptionsChainConfig): Promise<OptionsChainResponse | null> {
    const cacheKey = this.generateCacheKey(config);

    try {
      // Query cache table
      const { data, error } = await this.supabase
        .from('options_chain_cache')
        .select('*')
        .eq('cache_key', cacheKey)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[OptionsCache] Error fetching from cache:', error);
        return null;
      }

      if (!data) {
        console.log('[OptionsCache] Cache miss for key:', cacheKey);
        return null;
      }

      console.log('[OptionsCache] Cache hit for key:', cacheKey);

      // Return cached data with cached flag
      const cachedResponse = data.data as OptionsChainResponse;
      cachedResponse.metadata.cached = true;

      return cachedResponse;
    } catch (error) {
      console.error('[OptionsCache] Error reading cache:', error);
      return null;
    }
  }

  /**
   * Set cached options chain
   */
  async set(
    config: OptionsChainConfig,
    response: OptionsChainResponse,
    ttl: number = DEFAULT_CACHE_TTL
  ): Promise<void> {
    const cacheKey = this.generateCacheKey(config);

    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttl * 1000);

      // Upsert cache entry
      const { error } = await this.supabase
        .from('options_chain_cache')
        .upsert({
          cache_key: cacheKey,
          data: response,
          created_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        }, {
          onConflict: 'cache_key',
        });

      if (error) {
        console.error('[OptionsCache] Error writing to cache:', error);
        return;
      }

      console.log('[OptionsCache] Cached data for key:', cacheKey, 'TTL:', ttl, 's');
    } catch (error) {
      console.error('[OptionsCache] Error setting cache:', error);
    }
  }

  /**
   * Clear expired cache entries
   */
  async clearExpired(): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from('options_chain_cache')
        .delete()
        .lt('expires_at', new Date().toISOString())
        .select('cache_key');

      if (error) {
        console.error('[OptionsCache] Error clearing expired cache:', error);
        return 0;
      }

      const count = data?.length || 0;
      console.log('[OptionsCache] Cleared', count, 'expired cache entries');
      return count;
    } catch (error) {
      console.error('[OptionsCache] Error clearing cache:', error);
      return 0;
    }
  }

  /**
   * Clear all cache for a specific underlying
   */
  async clearUnderlying(underlying: string): Promise<number> {
    try {
      const pattern = `options_chain:${underlying}:%`;

      const { data, error } = await this.supabase
        .from('options_chain_cache')
        .delete()
        .like('cache_key', pattern)
        .select('cache_key');

      if (error) {
        console.error('[OptionsCache] Error clearing underlying cache:', error);
        return 0;
      }

      const count = data?.length || 0;
      console.log('[OptionsCache] Cleared', count, 'cache entries for', underlying);
      return count;
    } catch (error) {
      console.error('[OptionsCache] Error clearing underlying cache:', error);
      return 0;
    }
  }
}

export const optionsCacheService = new OptionsCacheService();
