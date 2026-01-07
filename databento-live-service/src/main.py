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
from typing import Dict, Set, Optional, List
from datetime import datetime, timedelta
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
        logger.error(f"⚠️  Callback error #{self.error_count}: {exception}")

    def _handle_shutdown(self, signum, frame):
        logger.info(f"Received signal {signum}, shutting down gracefully...")
        self.running = False
        if self.client:
            self.client.stop()

    def _is_contract_expired(self, expiry_date: str) -> bool:
        """Check if an options contract has expired
        Options expire at 4:00 PM ET on expiration date
        """
        if not expiry_date:
            return False

        try:
            # Parse expiry date (format: YYYY-MM-DD)
            expiry = datetime.strptime(expiry_date, '%Y-%m-%d')
            # Options expire at 4:00 PM ET (16:00) on expiration date
            # Using 21:00 UTC for standard time (16:00 ET + 5 hours)
            expiry_time = expiry.replace(hour=21, minute=0, second=0)

            # Current time in UTC
            now = datetime.utcnow()

            return now >= expiry_time
        except Exception as e:
            logger.warning(f"Error checking expiry for {expiry_date}: {e}")
            return False

    def _is_expiring_soon(self, expiry_date: str) -> bool:
        """Check if contract expires within 2 hours"""
        if not expiry_date:
            return False

        try:
            expiry = datetime.strptime(expiry_date, '%Y-%m-%d')
            expiry_time = expiry.replace(hour=21, minute=0, second=0)
            now = datetime.utcnow()

            # Check if expiring within 2 hours
            return timedelta(0) <= (expiry_time - now) <= timedelta(hours=2)
        except:
            return False

    def _fetch_active_trades(self):
        """Fetch all active trades from Supabase, filtering out expired contracts"""
        try:
            response = self.supabase.table('index_trades') \
                .select('id, polygon_option_ticker, polygon_underlying_index_ticker, current_contract, current_underlying, expiry') \
                .eq('status', 'active') \
                .execute()

            if not response.data:
                return []

            # Filter out expired contracts and warn about expiring soon
            active_trades = []
            expired_trade_ids = []

            for trade in response.data:
                if trade.get('expiry') and self._is_contract_expired(trade['expiry']):
                    expired_trade_ids.append(trade['id'])
                    logger.info(f"📅 Contract {trade.get('polygon_option_ticker', 'unknown')} expired on {trade['expiry']}")
                else:
                    # Warn about contracts expiring soon
                    if trade.get('expiry') and self._is_expiring_soon(trade['expiry']):
                        logger.warning(f"⏰ Contract {trade.get('polygon_option_ticker', 'unknown')} expires soon: {trade['expiry']} at 4:00 PM ET")
                    active_trades.append(trade)

            # Auto-close expired trades
            if expired_trade_ids:
                logger.info(f"🔒 Auto-closing {len(expired_trade_ids)} expired contracts...")
                try:
                    self.supabase.table('index_trades') \
                        .update({
                            'status': 'closed',
                            'outcome': 'expired',
                            'closed_at': datetime.utcnow().isoformat()
                        }) \
                        .in_('id', expired_trade_ids) \
                        .execute()
                    logger.info(f"✅ Closed {len(expired_trade_ids)} expired contracts")
                except Exception as e:
                    logger.error(f"Error auto-closing expired trades: {e}")

            return active_trades

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
        """Process incoming trade from Databento"""
        try:
            symbol = getattr(record, 'symbol', None)
            if not symbol:
                instrument_id = getattr(record, 'instrument_id', None)
                if instrument_id:
                    symbol = str(instrument_id)

            if not symbol:
                return

            # For trades schema, get the trade price
            price = getattr(record, 'price', 0)

            if price == 0:
                return

            # Convert price from fixed-point to decimal (price is in 1e-9 units)
            trade_price = price / 1e9 if price else 0

            if trade_price == 0:
                return

            last_price = self.last_prices.get(symbol, 0)
            price_change_pct = abs((trade_price - last_price) / last_price * 100) if last_price else 100

            # Update on significant price changes or first price
            if price_change_pct >= 0.1 or symbol not in self.last_prices:
                self.last_prices[symbol] = trade_price
                # Use trade price for both bid/ask approximation
                self._update_database(symbol, trade_price, trade_price, trade_price)
                self.update_count += 1

                if self.update_count % 5 == 0:
                    timestamp = datetime.utcnow().strftime('%H:%M:%S')
                    logger.info(f"[{timestamp}] 📊 {self.update_count} updates | {symbol} = ${trade_price:.4f} | Δ {price_change_pct:.2f}%")

        except Exception as e:
            logger.error(f"Error processing trade: {e}")

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

        # Filter out index symbols - we focus on options only
        option_symbols = [s for s in symbols if not s.startswith('I:')]

        if not option_symbols:
            logger.warning("No option symbols to subscribe to after filtering")
            return

        logger.info(f"📡 Subscribing to {len(option_symbols)} options on OPRA.PILLAR with trades schema")

        # Subscribe to each symbol individually to identify which ones fail
        successful = []
        failed = []

        for symbol in option_symbols:
            try:
                logger.info(f"   Subscribing to {symbol}...")
                self.client.subscribe(
                    dataset='OPRA.PILLAR',
                    schema='trades',
                    symbols=[symbol],
                    stype_in='raw_symbol'
                )
                successful.append(symbol)
                self.subscribed_symbols.add(symbol)

            except Exception as e:
                failed.append(symbol)
                logger.warning(f"   ⚠️  Failed to subscribe to {symbol}: {e}")

        if successful:
            logger.info(f"✅ Successfully subscribed to {len(successful)} contracts")

        if failed:
            logger.warning(f"⚠️  Failed to subscribe to {len(failed)} contracts (may be expired or inactive)")

        if not successful:
            raise ValueError("No symbols could be subscribed - all failed")

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

                logger.info("🔌 Creating Databento Live client...")
                self.client = db.Live(key=self.databento_key)

                # Add callback for processing trades
                self.client.add_callback(self._process_quote)

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

            except ValueError as e:
                # Handle case where no symbols could be subscribed
                logger.error(f"Subscription error: {e}")
                logger.info("Waiting 60 seconds before retrying with fresh symbol data...")
                time.sleep(60)
                retry_count = 0  # Reset retry count, try with fresh symbols
                continue

            except Exception as e:
                logger.error(f"Service error: {e}")
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
