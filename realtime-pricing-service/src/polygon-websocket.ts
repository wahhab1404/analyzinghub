import 'dotenv/config';
import WebSocket from 'ws';
import { createClient } from '@supabase/supabase-js';

interface PolygonQuote {
  ev: string;
  sym: string;
  bx: number;
  ax: number;
  bp: number;
  ap: number;
  bs: number;
  as: number;
  t: number;
}

interface PolygonTrade {
  ev: string;
  sym: string;
  p: number;
  s: number;
  t: number;
}

export class PolygonWebSocketService {
  private ws: WebSocket | null = null;
  private supabase: any;
  private apiKey: string;
  private subscribedTickers: Set<string> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isAuthenticated = false;

  constructor() {
    if (!process.env.POLYGON_API_KEY) {
      throw new Error('POLYGON_API_KEY is required');
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials are required');
    }

    this.apiKey = process.env.POLYGON_API_KEY;
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('🔌 Connecting to Polygon WebSocket...');

      this.ws = new WebSocket('wss://socket.polygon.io/options');

      this.ws.on('open', () => {
        console.log('✅ WebSocket connected');
        this.authenticate();
      });

      this.ws.on('message', async (data: WebSocket.Data) => {
        try {
          const messages = JSON.parse(data.toString());

          if (!Array.isArray(messages)) {
            console.log('Received non-array message:', messages);
            return;
          }

          for (const msg of messages) {
            await this.handleMessage(msg);

            if (msg.ev === 'status' && msg.status === 'auth_success') {
              this.isAuthenticated = true;
              console.log('✅ Authentication successful');
              this.startHeartbeat();
              this.reconnectAttempts = 0;
              resolve();
            }
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('🔌 WebSocket closed');
        this.isAuthenticated = false;
        this.stopHeartbeat();
        this.attemptReconnect();
      });

      setTimeout(() => {
        if (!this.isAuthenticated) {
          reject(new Error('Authentication timeout'));
        }
      }, 10000);
    });
  }

  private authenticate(): void {
    if (!this.ws) return;

    const authMsg = {
      action: 'auth',
      params: this.apiKey
    };

    console.log('🔐 Authenticating...');
    this.ws.send(JSON.stringify(authMsg));
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Polygon doesn't need explicit ping, but we can check connection
        console.log('💓 Connection alive, subscribed to', this.subscribedTickers.size, 'tickers');
      }
    }, 30000); // Check every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    console.log(`🔄 Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(async () => {
      try {
        await this.connect();

        // Re-subscribe to all tickers
        const tickers = Array.from(this.subscribedTickers);
        this.subscribedTickers.clear();

        for (const ticker of tickers) {
          await this.subscribe(ticker);
        }
      } catch (error) {
        console.error('Reconnection failed:', error);
      }
    }, delay);
  }

  async subscribe(ticker: string): Promise<void> {
    if (!this.ws || !this.isAuthenticated) {
      console.warn('Cannot subscribe: not connected or not authenticated');
      return;
    }

    if (this.subscribedTickers.has(ticker)) {
      console.log(`Already subscribed to ${ticker}`);
      return;
    }

    const subscribeMsg = {
      action: 'subscribe',
      params: `Q.${ticker},T.${ticker}` // Q = quotes, T = trades
    };

    console.log(`📊 Subscribing to ${ticker}...`);
    this.ws.send(JSON.stringify(subscribeMsg));
    this.subscribedTickers.add(ticker);
  }

  async unsubscribe(ticker: string): Promise<void> {
    if (!this.ws || !this.isAuthenticated) return;

    const unsubscribeMsg = {
      action: 'unsubscribe',
      params: `Q.${ticker},T.${ticker}`
    };

    console.log(`📊 Unsubscribing from ${ticker}...`);
    this.ws.send(JSON.stringify(unsubscribeMsg));
    this.subscribedTickers.delete(ticker);
  }

  private async handleMessage(msg: any): Promise<void> {
    try {
      // Handle status messages
      if (msg.ev === 'status') {
        console.log(`Status: ${msg.status} - ${msg.message || ''}`);
        return;
      }

      // Handle quotes (Q)
      if (msg.ev === 'Q') {
        await this.handleQuote(msg as PolygonQuote);
      }

      // Handle trades (T)
      if (msg.ev === 'T') {
        await this.handleTrade(msg as PolygonTrade);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  private async handleQuote(quote: PolygonQuote): Promise<void> {
    const ticker = quote.sym;
    const mid = (quote.bp + quote.ap) / 2;
    const timestamp = new Date(quote.t / 1000000); // Convert nanoseconds to milliseconds

    console.log(`📈 ${ticker}: Bid $${quote.bp} / Ask $${quote.ap} / Mid $${mid.toFixed(2)}`);

    // Update database
    await this.updateTradePrice(ticker, {
      bid: quote.bp,
      ask: quote.ap,
      mid: mid,
      timestamp: quote.t,
      volume: 0
    });
  }

  private async handleTrade(trade: PolygonTrade): Promise<void> {
    const ticker = trade.sym;
    const timestamp = new Date(trade.t / 1000000);

    console.log(`💰 ${ticker}: Trade at $${trade.p} (size: ${trade.s}) @ ${timestamp.toISOString()}`);

    // Trades can also update the last price
    await this.updateTradePrice(ticker, {
      last: trade.p,
      lastSize: trade.s,
      timestamp: trade.t
    });
  }

  private async updateTradePrice(ticker: string, data: any): Promise<void> {
    try {
      // Find the trade with this ticker
      const { data: trade, error: fetchError } = await this.supabase
        .from('index_trades')
        .select('id, current_contract, contract_high_since, entry_contract_snapshot')
        .eq('polygon_option_ticker', ticker)
        .eq('status', 'active')
        .maybeSingle();

      if (fetchError || !trade) {
        console.log(`No active trade found for ${ticker}`);
        return;
      }

      const currentPrice = data.mid || data.last;
      if (!currentPrice) return;

      const previousPrice = parseFloat(trade.current_contract);
      const previousHigh = parseFloat(trade.contract_high_since);
      const entryPrice = parseFloat(trade.entry_contract_snapshot?.mid || 0);

      const newHigh = Math.max(currentPrice, previousHigh);
      const isNewHigh = newHigh > previousHigh;

      // Update the trade
      const { error: updateError } = await this.supabase
        .from('index_trades')
        .update({
          current_contract: currentPrice.toFixed(4),
          contract_high_since: newHigh.toFixed(4),
          last_quote_at: new Date().toISOString(),
          current_contract_snapshot: {
            bid: data.bid || 0,
            ask: data.ask || 0,
            mid: data.mid || currentPrice,
            last: data.last || 0,
            volume: data.volume || 0,
            timestamp: data.timestamp
          }
        })
        .eq('id', trade.id);

      if (updateError) {
        console.error('Error updating trade:', updateError);
        return;
      }

      if (isNewHigh) {
        const profitPercent = ((newHigh - entryPrice) / entryPrice * 100).toFixed(2);
        console.log(`🎉 NEW HIGH! ${ticker}: $${newHigh.toFixed(2)} (+${profitPercent}%)`);
      }
    } catch (error) {
      console.error('Error updating trade price:', error);
    }
  }

  async subscribeToActiveTrades(): Promise<void> {
    console.log('📊 Fetching active trades...');

    const { data: trades, error } = await this.supabase
      .from('index_trades')
      .select('id, polygon_option_ticker, strike, option_type, expiry')
      .eq('status', 'active')
      .gte('expiry', new Date().toISOString().split('T')[0]);

    if (error) {
      console.error('Error fetching trades:', error);
      return;
    }

    if (!trades || trades.length === 0) {
      console.log('No active trades to subscribe to');
      return;
    }

    console.log(`Found ${trades.length} active trades`);

    for (const trade of trades) {
      await this.subscribe(trade.polygon_option_ticker);
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between subscriptions
    }
  }

  disconnect(): void {
    console.log('🔌 Disconnecting...');
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.subscribedTickers.clear();
    this.isAuthenticated = false;
  }
}

// Main execution
if (require.main === module) {
  const service = new PolygonWebSocketService();

  process.on('SIGINT', () => {
    console.log('\n📴 Shutting down...');
    service.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n📴 Shutting down...');
    service.disconnect();
    process.exit(0);
  });

  (async () => {
    try {
      await service.connect();
      await service.subscribeToActiveTrades();

      console.log('\n✅ Real-time streaming active!');
      console.log('Press Ctrl+C to stop\n');
    } catch (error) {
      console.error('Failed to start service:', error);
      process.exit(1);
    }
  })();
}

export default PolygonWebSocketService;
