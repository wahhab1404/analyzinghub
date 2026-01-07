"""
Databento Live Streaming Service for Options Trading

This service maintains a WebSocket connection to Databento's Live API
and streams real-time options data, updating the Supabase database
whenever prices change significantly.
"""

import os
import sys
import time
import signal
import logging
from typing import Dict, Set, Optional
from datetime import datetime
from dotenv import load_dotenv

import databento as db
from databento import DBNRecord
from supabase import create_client, Client

load_dotenv()

logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO'),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class DatabentoLiveService:
    def __init__(self):
        self.databento_key = os.getenv('DATABENTO_API_KEY')
        self.supabase_url = os.getenv('SUPABASE_URL')
        self.supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

        if not all([self.databento_key, self.supabase_url, self.supabase_key]):
            raise ValueError("Missing required environment variables")

        self.supabase: Client = create_client(self.supabase_url, self.supabase_key)
        self.client: Optional[db.Live] = None
        self.running = False
        self.subscribed_symbols: Set[str] = set()
        self.last_prices: Dict[str, float] = {}
        self.update_count = 0
        self.error_count = 0

        signal.signal(signal.SIGTERM, self._handle_shutdown)
        signal.signal(signal.SIGINT, self._handle_shutdown)

    def _handle_error(self, exception: Exception):
        """Handle callback errors"""
        self.error_count += 1
        logger.error(f"⚠️  Callback error #{self.error_count}: {exception}", exc_info=True)

    def _handle_reconnect(self, last_ts: any, new_ts: any):
        """Handle reconnection events"""
        logger.warning(f"🔄 Reconnected! Gap from {last_ts} to {new_ts}")
        logger.info("Re-subscribing to all active symbols...")

    def _handle_shutdown(self, signum, frame):
        logger.info(f"Received signal {signum}, shutting down gracefully...")
        self.running = False
        if self.client:
            self.client.stop()

    def _fetch_active_trades(self):
        """Fetch all active trades from Supabase"""
        try:
            response = self.supabase.table('index_trades') \
                .select('id, polygon_option_ticker, polygon_underlying_index_ticker, current_contract, current_underlying') \
                .eq('status', 'active') \
                .execute()

            return response.data if response.data else []
        except Exception as e:
            logger.error(f"Error fetching active trades: {e}")
            return []

    def _get_symbols_to_subscribe(self) -> Set[str]:
        """Get unique symbols from active trades"""
        trades = self._fetch_active_trades()
        symbols = set()

        for trade in trades:
            if trade.get('polygon_option_ticker'):
                symbol = self._convert_polygon_to_databento(trade['polygon_option_ticker'])
                if symbol:
                    symbols.add(symbol)

            if trade.get('polygon_underlying_index_ticker'):
                symbol = self._convert_polygon_to_databento(trade['polygon_underlying_index_ticker'])
                if symbol:
                    symbols.add(symbol)

        if len(symbols) > 0:
            logger.info(f"🎯 Found {len(symbols)} unique symbols to subscribe:")
            for sym in symbols:
                logger.info(f"   - {sym}")
        else:
            logger.warning("⚠️  No symbols found in active trades")
        return symbols

    def _convert_polygon_to_databento(self, polygon_ticker: str) -> Optional[str]:
        """Convert Polygon ticker to Databento symbol format"""
        if not polygon_ticker:
            return None

        if polygon_ticker.startswith('O:'):
            return polygon_ticker[2:]

        if polygon_ticker.startswith('I:'):
            return polygon_ticker

        return polygon_ticker

    def _convert_databento_to_polygon(self, databento_symbol: str) -> str:
        """Convert Databento symbol back to Polygon ticker"""
        if databento_symbol.startswith('SPX') or \
           databento_symbol.startswith('NDX') or \
           databento_symbol.startswith('DJI'):
            if len(databento_symbol) > 3:
                return f"O:{databento_symbol}"
            else:
                return f"I:{databento_symbol}"

        return databento_symbol

    def _process_quote(self, record: DBNRecord):
        """Process incoming quote from Databento"""
        try:
            symbol = getattr(record, 'symbol', None)
            if not symbol:
                instrument_id = getattr(record, 'instrument_id', None)
                if instrument_id:
                    symbol = str(instrument_id)

            if not symbol:
                return

            bid = getattr(record, 'bid_px_00', 0)
            ask = getattr(record, 'ask_px_00', 0)

            if bid == 0 and ask == 0:
                return

            bid_price = bid / 1e9 if bid else 0
            ask_price = ask / 1e9 if ask else 0
            mid_price = (bid_price + ask_price) / 2 if (bid_price and ask_price) else (bid_price or ask_price)

            if mid_price == 0:
                return

            last_price = self.last_prices.get(symbol, 0)
            price_change_pct = abs((mid_price - last_price) / last_price * 100) if last_price else 100

            if price_change_pct >= 0.1 or symbol not in self.last_prices:
                self.last_prices[symbol] = mid_price
                self._update_database(symbol, mid_price, bid_price, ask_price)
                self.update_count += 1

                if self.update_count % 5 == 0:  # Log every 5 updates for better visibility
                    timestamp = datetime.utcnow().strftime('%H:%M:%S')
                    logger.info(f"[{timestamp}] 📊 {self.update_count} updates | {symbol} = ${mid_price:.4f} | Δ {price_change_pct:.2f}%")

        except Exception as e:
            logger.error(f"Error processing quote: {e}")

    def _update_database(self, databento_symbol: str, mid_price: float, bid: float, ask: float):
        """Update Supabase with new price"""
        try:
            polygon_ticker = self._convert_databento_to_polygon(databento_symbol)
            is_option = polygon_ticker.startswith('O:')

            if is_option:
                response = self.supabase.table('index_trades') \
                    .update({
                        'current_contract': mid_price,
                        'last_quote_at': datetime.utcnow().isoformat(),
                        'contract_high_since': self.supabase.rpc(
                            'greatest',
                            {'a': mid_price, 'b': 'contract_high_since'}
                        ),
                        'contract_low_since': self.supabase.rpc(
                            'least',
                            {'a': mid_price, 'b': 'contract_low_since'}
                        )
                    }) \
                    .eq('polygon_option_ticker', polygon_ticker) \
                    .eq('status', 'active') \
                    .execute()
            else:
                response = self.supabase.table('index_trades') \
                    .update({
                        'current_underlying': mid_price,
                        'last_quote_at': datetime.utcnow().isoformat(),
                        'underlying_high_since': self.supabase.rpc(
                            'greatest',
                            {'a': mid_price, 'b': 'underlying_high_since'}
                        ),
                        'underlying_low_since': self.supabase.rpc(
                            'least',
                            {'a': mid_price, 'b': 'underlying_low_since'}
                        )
                    }) \
                    .eq('polygon_underlying_index_ticker', polygon_ticker) \
                    .eq('status', 'active') \
                    .execute()

            logger.debug(f"Updated {polygon_ticker}: ${mid_price:.4f}")

        except Exception as e:
            logger.error(f"Database update error for {databento_symbol}: {e}")

    def _subscribe_to_symbols(self, symbols: Set[str]):
        """Subscribe to live data for given symbols"""
        if not symbols:
            logger.warning("No symbols to subscribe to")
            return

        for symbol in symbols:
            try:
                # Skip index symbols - Databento can't mix datasets in one session
                # We focus on options (OPRA.PILLAR) since that's our primary use case
                if symbol.startswith('I:'):
                    logger.info(f"⏭️  Skipping index {symbol} - focusing on options only")
                    continue

                # SPX options trade on OPRA.PILLAR (extended hours 24/5)
                # Use 'tbbo' schema (Top of Book Best Offer) for options
                dataset = 'OPRA.PILLAR'
                schema = 'tbbo'

                logger.info(f"📡 Subscribing to {symbol} on {dataset} with {schema} schema")

                self.client.subscribe(
                    dataset=dataset,
                    schema=schema,
                    symbols=[symbol],
                    stype_in='raw_symbol'
                )

                self.subscribed_symbols.add(symbol)
                logger.info(f"✅ Subscribed to {symbol} - Ready for 24/5 trading")

            except Exception as e:
                logger.error(f"❌ Failed to subscribe to {symbol}: {e}")

    def start(self):
        """Start the live streaming service"""
        logger.info("="*60)
        logger.info("🚀 STARTING DATABENTO LIVE SERVICE")
        logger.info("="*60)
        logger.info(f"📍 Supabase: {self.supabase_url}")
        logger.info(f"🔑 API Key: {self.databento_key[:8]}...{self.databento_key[-4:]}")
        logger.info(f"⏰ Extended Hours: ENABLED (24/5 SPX trading)")
        logger.info("="*60)

        self.running = True
        retry_count = 0
        max_retries = 5

        while self.running and retry_count < max_retries:
            try:
                symbols = self._get_symbols_to_subscribe()

                if not symbols:
                    logger.warning("⚠️  No active trades found. Waiting 30 seconds...")
                    time.sleep(30)
                    continue

                logger.info("🔌 Creating Databento Live client with auto-reconnect...")
                self.client = db.Live(
                    key=self.databento_key,
                    heartbeat_interval_s=30,
                    reconnect_policy='reconnect'  # Auto-reconnect on disconnect
                )

                # Add callbacks with error handling
                self.client.add_callback(
                    record_callback=self._process_quote,
                    exception_callback=self._handle_error
                )

                # Add reconnect callback to track gaps
                self.client.add_reconnect_callback(
                    reconnect_callback=self._handle_reconnect,
                    exception_callback=self._handle_error
                )

                self._subscribe_to_symbols(symbols)

                logger.info("="*60)
                logger.info("✅ ALL SYSTEMS GO - STREAMING LIVE!")
                logger.info("="*60)

                logger.info("🎬 Starting live data stream...")
                self.client.start()

                logger.info("🟢 Service is LIVE! Streaming real-time prices for 18 SPX options...")
                logger.info("📊 Press Ctrl+C to stop")
                logger.info("")

                self.client.block_for_close()

                if self.running:
                    logger.warning("Connection closed. Reconnecting in 5 seconds...")
                    time.sleep(5)
                    retry_count += 1
                else:
                    logger.info("Shutting down gracefully...")
                    break

            except KeyboardInterrupt:
                logger.info("Received keyboard interrupt")
                self.running = False
                break

            except Exception as e:
                logger.error(f"Service error: {e}", exc_info=True)
                retry_count += 1
                if retry_count < max_retries:
                    wait_time = min(2 ** retry_count, 60)
                    logger.info(f"Retrying in {wait_time} seconds... (attempt {retry_count}/{max_retries})")
                    time.sleep(wait_time)
                else:
                    logger.error("Max retries reached. Exiting.")
                    break

        if self.client:
            self.client.terminate()

        logger.info("="*60)
        logger.info("🛑 SERVICE STOPPED")
        logger.info(f"📊 Total updates processed: {self.update_count}")
        logger.info(f"⚠️  Total errors handled: {self.error_count}")
        logger.info("="*60)


def main():
    try:
        # Log dependency versions for troubleshooting
        import supabase
        import gotrue
        import httpx
        logger.info("="*60)
        logger.info("📦 DEPENDENCY VERSIONS")
        logger.info(f"   supabase: {supabase.__version__}")
        logger.info(f"   gotrue: {gotrue.__version__}")
        logger.info(f"   httpx: {httpx.__version__}")
        logger.info("="*60)

        service = DatabentoLiveService()
        service.start()
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
