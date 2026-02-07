"""
Trade monitoring and condition checking module

Monitors trades for:
- Target hits (TP)
- Stop loss hits (SL)
- New highs/lows
"""

import logging
from typing import Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class TradeMonitor:
    def __init__(self, supabase_client):
        self.supabase = supabase_client

    def check_trade_conditions(
        self,
        trade: Dict[str, Any],
        new_contract_price: float,
        new_underlying_price: float
    ) -> Optional[Dict[str, Any]]:
        """
        Check if trade hit any targets or stop loss

        Returns update dict if status changed, None otherwise
        """
        try:
            updates = {}
            status_changed = False

            entry_contract = trade.get('entry_contract_snapshot', {}).get('mid', 0) or \
                           trade.get('entry_contract_snapshot', {}).get('last', 0)

            trade_basis = trade.get('trade_price_basis', 'CONTRACT_PRICE')
            direction = trade.get('direction', 'call')
            is_call = direction.lower() == 'call'

            compare_price = new_underlying_price if trade_basis == 'UNDERLYING_PRICE' else new_contract_price
            entry_price = trade.get('entry_underlying_snapshot', {}).get('price', 0) \
                if trade_basis == 'UNDERLYING_PRICE' else entry_contract

            targets = trade.get('targets', [])
            stoploss = trade.get('stoploss', {})

            if targets and len(targets) > 0:
                target_price = targets[0].get('level')
                if target_price:
                    target_hit = (compare_price >= target_price) if is_call else (compare_price <= target_price)

                    if target_hit:
                        pnl_pct = ((compare_price - entry_price) / entry_price * 100) if entry_price else 0
                        updates['status'] = 'tp_hit'
                        updates['closed_at'] = datetime.utcnow().isoformat()
                        updates['win_condition_met'] = f"Target hit at ${compare_price:.4f} (+{pnl_pct:.2f}%)"
                        status_changed = True

                        logger.info(f"Trade {trade['id']}: Target hit! ${compare_price:.4f}")

            if not status_changed and stoploss:
                stop_price = stoploss.get('level')
                if stop_price:
                    stop_hit = (compare_price <= stop_price) if is_call else (compare_price >= stop_price)

                    if stop_hit:
                        pnl_pct = ((compare_price - entry_price) / entry_price * 100) if entry_price else 0
                        updates['status'] = 'sl_hit'
                        updates['closed_at'] = datetime.utcnow().isoformat()
                        updates['loss_condition_met'] = f"Stop loss hit at ${compare_price:.4f} ({pnl_pct:.2f}%)"
                        status_changed = True

                        logger.info(f"Trade {trade['id']}: Stop loss hit! ${compare_price:.4f}")

            return updates if status_changed else None

        except Exception as e:
            logger.error(f"Error checking trade conditions: {e}")
            return None

    def detect_new_high(
        self,
        trade: Dict[str, Any],
        new_price: float,
        price_type: str = 'contract'
    ) -> bool:
        """
        Check if new price is a new high

        Args:
            trade: Trade data
            new_price: Current price
            price_type: 'contract' or 'underlying'

        Returns:
            True if new high detected
        """
        try:
            if price_type == 'contract':
                previous_high = trade.get('contract_high_since', 0)
            else:
                previous_high = trade.get('underlying_high_since', 0)

            is_new_high = new_price > previous_high if previous_high else True

            if is_new_high:
                entry_price = trade.get('entry_contract_snapshot', {}).get('mid', 0) or \
                            trade.get('entry_contract_snapshot', {}).get('last', 0)

                if entry_price:
                    pnl_pct = ((new_price - entry_price) / entry_price * 100)
                    logger.info(f"New {price_type} high for trade {trade.get('id')}: ${new_price:.4f} (+{pnl_pct:.2f}%)")

            return is_new_high

        except Exception as e:
            logger.error(f"Error detecting new high: {e}")
            return False
