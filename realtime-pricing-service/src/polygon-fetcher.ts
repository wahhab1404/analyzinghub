import Redis from 'ioredis';
import WebSocket from 'ws';
import { SubscriptionManager } from './subscription-manager';

export interface Quote {
  symbol: string;
  price: number;
  timestamp: string;
}

/**
 * Fetches real-time quotes from Polygon.io
 * Uses WebSocket for indices, REST for options
 */
export class PolygonQuoteFetcher {
  private redis: Redis;
  private apiKey: string;
  private subscriptionManager: SubscriptionManager;

  private ws: WebSocket | null = null;
  private wsConnected = false;
  private wsReconnectTimeout: NodeJS.Timeout | null = null;

  private restPollingInterval: NodeJS.Timeout | null = null;
  private readonly REST_POLL_INTERVAL_MS = 5000; // 5s for options

  private circuitBreakerOpen = false;
  private circuitBreakerResetTimeout: NodeJS.Timeout | null = null;
  private readonly CIRCUIT_BREAKER_TIMEOUT_MS = 60000; // 60s

  constructor(
    redis: Redis,
    apiKey: string,
    subscriptionManager: SubscriptionManager
  ) {
    this.redis = redis;
    this.apiKey = apiKey;
    this.subscriptionManager = subscriptionManager;
  }

  /**
   * Start fetching quotes
   */
  start(): void {
    this.connectWebSocket();
    this.startRestPolling();
  }

  /**
   * Stop fetching quotes
   */
  stop(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.wsReconnectTimeout) {
      clearTimeout(this.wsReconnectTimeout);
      this.wsReconnectTimeout = null;
    }

    if (this.restPollingInterval) {
      clearInterval(this.restPollingInterval);
      this.restPollingInterval = null;
    }

    if (this.circuitBreakerResetTimeout) {
      clearTimeout(this.circuitBreakerResetTimeout);
      this.circuitBreakerResetTimeout = null;
    }
  }

  /**
   * Check if Polygon connection is healthy
   */
  isConnected(): boolean {
    return this.wsConnected && !this.circuitBreakerOpen;
  }

  /**
   * Connect to Polygon WebSocket for indices
   */
  private connectWebSocket(): void {
    if (this.ws) {
      return; // Already connected or connecting
    }

    const wsUrl = `wss://socket.polygon.io/indices`;

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log('Polygon WebSocket connected');
      this.wsConnected = true;

      // Authenticate
      this.ws!.send(JSON.stringify({
        action: 'auth',
        params: this.apiKey,
      }));

      // Subscribe to all active index symbols
      this.subscribeToActiveIndices();
    });

    this.ws.on('message', async (data: WebSocket.Data) => {
      try {
        const messages = JSON.parse(data.toString());

        for (const msg of Array.isArray(messages) ? messages : [messages]) {
          if (msg.ev === 'status') {
            console.log('Polygon status:', msg.status, msg.message);
            continue;
          }

          // Index value update
          // Example: {ev: "V", T: "I:SPX", val: 4567.89, t: 1704304800000}
          if (msg.ev === 'V' && msg.T && msg.val) {
            const quote: Quote = {
              symbol: msg.T,
              price: msg.val,
              timestamp: new Date(msg.t).toISOString(),
            };

            await this.processQuote(quote);
          }
        }
      } catch (error) {
        console.error('Error processing Polygon WebSocket message:', error);
      }
    });

    this.ws.on('error', (error) => {
      console.error('Polygon WebSocket error:', error);
    });

    this.ws.on('close', () => {
      console.log('Polygon WebSocket disconnected');
      this.wsConnected = false;
      this.ws = null;

      // Reconnect after 5s
      this.wsReconnectTimeout = setTimeout(() => {
        console.log('Reconnecting to Polygon WebSocket...');
        this.connectWebSocket();
      }, 5000);
    });
  }

  /**
   * Subscribe to active index symbols on WebSocket
   */
  private subscribeToActiveIndices(): void {
    if (!this.ws || !this.wsConnected) return;

    const activeSymbols = this.subscriptionManager.getActiveSymbols();
    const indexSymbols = activeSymbols.filter((s) => s.startsWith('I:'));

    if (indexSymbols.length > 0) {
      this.ws.send(JSON.stringify({
        action: 'subscribe',
        params: indexSymbols.join(','),
      }));

      console.log(`Subscribed to ${indexSymbols.length} index symbols:`, indexSymbols);
    }
  }

  /**
   * Start REST polling for options quotes
   */
  private startRestPolling(): void {
    if (this.restPollingInterval) return;

    this.restPollingInterval = setInterval(async () => {
      if (this.circuitBreakerOpen) return;

      const activeSymbols = this.subscriptionManager.getActiveSymbols();
      const optionSymbols = activeSymbols.filter((s) => s.startsWith('O:'));

      for (const symbol of optionSymbols) {
        try {
          // Extract underlying from option ticker (O:SPX251219C05900000 -> SPX)
          const match = symbol.match(/O:([A-Z]+)/);
          const underlying = match ? match[1] : 'SPX';

          const url = `https://api.polygon.io/v3/snapshot/options/${underlying}/${symbol}?apiKey=${this.apiKey}`;
          const response = await fetch(url);

          if (response.status === 429) {
            console.warn('Polygon rate limited, opening circuit breaker');
            this.openCircuitBreaker();
            break;
          }

          if (!response.ok) {
            console.error(`Polygon API error for ${symbol}:`, response.status);
            continue;
          }

          const data = await response.json();

          if (data.results && data.results.last_quote) {
            const lastQuote = data.results.last_quote;
            const mid = (lastQuote.bid + lastQuote.ask) / 2;

            const quote: Quote = {
              symbol,
              price: mid || data.results.last?.price || 0,
              timestamp: new Date().toISOString(),
            };

            await this.processQuote(quote);
          }
        } catch (error) {
          console.error(`Error fetching quote for ${symbol}:`, error);
        }

        // Rate limiting: 200ms between calls (5 calls/sec)
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }, this.REST_POLL_INTERVAL_MS);
  }

  /**
   * Process a quote and update Redis + high/low tracking
   */
  private async processQuote(quote: Quote): Promise<void> {
    // Store latest quote in Redis
    await this.redis.setex(
      `quote:${quote.symbol}`,
      300, // 5min TTL
      JSON.stringify({
        price: quote.price,
        timestamp: quote.timestamp,
      })
    );

    // Get all trades subscribed to this symbol
    const tradeIds = this.subscriptionManager.getTradesForSymbol(quote.symbol);

    for (const tradeId of tradeIds) {
      const trade = this.subscriptionManager.getTrade(tradeId);
      if (!trade) continue;

      // Determine if this is underlying or contract quote
      const isUnderlying = quote.symbol === trade.underlyingSymbol;
      const prefix = isUnderlying ? 'underlying' : 'contract';

      // Update high
      const highKey = `trade:${tradeId}:${prefix}:high`;
      const currentHigh = await this.redis.get(highKey);
      if (!currentHigh || quote.price > parseFloat(currentHigh)) {
        await this.redis.set(highKey, quote.price.toString());
      }

      // Update low
      const lowKey = `trade:${tradeId}:${prefix}:low`;
      const currentLow = await this.redis.get(lowKey);
      if (!currentLow || quote.price < parseFloat(currentLow)) {
        await this.redis.set(lowKey, quote.price.toString());
      }

      // Update current
      const currentKey = `trade:${tradeId}:${prefix}:current`;
      await this.redis.setex(currentKey, 300, quote.price.toString());

      // Update last quote timestamp
      await this.redis.setex(`trade:${tradeId}:last_quote`, 300, quote.timestamp);
    }
  }

  /**
   * Open circuit breaker (stop making requests)
   */
  private openCircuitBreaker(): void {
    this.circuitBreakerOpen = true;

    this.circuitBreakerResetTimeout = setTimeout(() => {
      console.log('Closing circuit breaker');
      this.circuitBreakerOpen = false;
    }, this.CIRCUIT_BREAKER_TIMEOUT_MS);
  }
}
