"""
Offline integration test for the off-hours CME futures underlying feature.

Runs without a Databento API key, network access, or a real Supabase project
by mocking `databento.Live` and the Supabase client. It verifies:

  1. A cash index (I:SPX) is subscribed to its continuous CME future (ES.c.0)
     on GLBX.MDP3 with stype_in='continuous'.
  2. Option symbols still route to OPRA.PILLAR.
  3. Incoming records are resolved via the client's symbology_map.
  4. Futures prices are written to `current_underlying` (for the right
     underlying ticker) ONLY when the cash market is closed.

Usage:  python3 test_futures.py
"""
import os
import sys

# Provide dummy env so the service constructor doesn't bail out.
os.environ.setdefault('DATABENTO_API_KEY', 'db-test-key')
os.environ.setdefault('SUPABASE_URL', 'https://test.supabase.co')
os.environ.setdefault('SUPABASE_SERVICE_ROLE_KEY', 'test-role-key')
os.environ.setdefault('ENABLE_FUTURES_UNDERLYING', '1')

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))
import main as m  # noqa: E402


# --------------------------------------------------------------------------
# Mocks
# --------------------------------------------------------------------------
class FakeLive:
    """Stand-in for databento.Live."""
    def __init__(self, key=None):
        self.key = key
        self.subscriptions = []          # list of subscribe(**kwargs)
        self.symbology_map = {}          # instrument_id -> input symbol
        self.callbacks = []

    def add_callback(self, cb):
        self.callbacks.append(cb)

    def subscribe(self, dataset, schema, symbols, stype_in):
        self.subscriptions.append(
            dict(dataset=dataset, schema=schema, symbols=list(symbols), stype_in=stype_in)
        )

    def start(self): pass
    def block_for_close(self): pass
    def stop(self): pass
    def terminate(self): pass


class FakeQuery:
    """Chainable Supabase query that records the final update payload + filters."""
    def __init__(self, sink):
        self._sink = sink
        self._payload = None
        self._filters = {}

    def update(self, payload):
        self._payload = payload
        return self

    def select(self, *a, **k):
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def in_(self, col, vals):
        self._filters[col] = list(vals)
        return self

    def execute(self):
        if self._payload is not None:
            self._sink.append({'payload': self._payload, 'filters': self._filters})

        class R:
            data = []
        return R()


class FakeSupabase:
    def __init__(self):
        self.writes = []   # captured update payloads + filters

    def table(self, name):
        return FakeQuery(self.writes)

    def rpc(self, fn, args):
        # _update_database embeds rpc() calls inside the payload; return a marker.
        return f"rpc:{fn}({args})"


class FakeRecord:
    """Minimal TradeMsg-like record (instrument_id + price only)."""
    def __init__(self, instrument_id, price):
        self.instrument_id = instrument_id
        self.price = price


# --------------------------------------------------------------------------
# Test harness
# --------------------------------------------------------------------------
results = []

def check(name, cond, detail=""):
    results.append(cond)
    mark = "✅ PASS" if cond else "❌ FAIL"
    print(f"  {mark}  {name}" + (f"  — {detail}" if detail else ""))


def make_service():
    # Patch the Databento + Supabase factories the module uses.
    m.db.Live = FakeLive
    m.create_client = lambda url, key: FakeSupabase()
    svc = m.DatabentoLiveService()
    svc.client = FakeLive(key='db-test-key')
    svc.client.add_callback(svc._process_quote)
    return svc


print("=" * 60)
print("Off-hours CME futures — offline integration test")
print("=" * 60)

# --- Test 1: subscription routing -----------------------------------------
print("\n[1] Subscription routing (index -> GLBX continuous, option -> OPRA)")
svc = make_service()
svc._subscribe_to_symbols({'I:SPX', 'SPXW260105C06895000'})
subs = svc.client.subscriptions

glbx = [s for s in subs if s['dataset'] == 'GLBX.MDP3']
opra = [s for s in subs if s['dataset'] == 'OPRA.PILLAR']

check("I:SPX subscribed on GLBX.MDP3", len(glbx) == 1, str(glbx))
if glbx:
    g = glbx[0]
    check("GLBX symbol is ES.c.0", g['symbols'] == ['ES.c.0'], str(g['symbols']))
    check("GLBX stype_in is continuous", g['stype_in'] == 'continuous', g['stype_in'])
    check("GLBX schema is trades", g['schema'] == 'trades', g['schema'])
check("Option subscribed on OPRA.PILLAR", len(opra) == 1 and opra[0]['symbols'] == ['SPXW260105C06895000'], str(opra))

# --- Test 2: futures price written to underlying when market CLOSED --------
print("\n[2] Futures record -> current_underlying (market CLOSED)")
svc = make_service()
svc._is_cash_market_open = lambda: False          # force off-hours
svc.client.symbology_map = {111: 'ES.c.0'}         # simulate SymbolMappingMsg
svc._process_quote(FakeRecord(instrument_id=111, price=6000_000_000_000))  # 6000.00

writes = svc.supabase.writes
check("exactly one DB write", len(writes) == 1, str(len(writes)))
if writes:
    w = writes[0]
    check("targets underlying ticker I:SPX",
          w['filters'].get('polygon_underlying_index_ticker') == 'I:SPX', str(w['filters']))
    check("writes current_underlying field", 'current_underlying' in w['payload'],
          str(list(w['payload'].keys())))
    check("price decoded to 6000.0", abs(w['payload'].get('current_underlying', 0) - 6000.0) < 1e-6,
          str(w['payload'].get('current_underlying')))
    check("does NOT touch current_contract", 'current_contract' not in w['payload'])

# --- Test 3: futures IGNORED during RTH ------------------------------------
print("\n[3] Futures record ignored during regular trading hours (market OPEN)")
svc = make_service()
svc._is_cash_market_open = lambda: True            # force RTH
svc.client.symbology_map = {222: 'NQ.c.0'}
svc._process_quote(FakeRecord(instrument_id=222, price=21000_000_000_000))
check("no DB write during RTH", len(svc.supabase.writes) == 0, str(svc.supabase.writes))

# --- Test 4: unmapped instrument id is skipped safely ----------------------
print("\n[4] Unmapped / non-data records are skipped without error")
svc = make_service()
svc._is_cash_market_open = lambda: False
svc.client.symbology_map = {}                      # nothing mapped yet
try:
    svc._process_quote(FakeRecord(instrument_id=999, price=123_000_000_000))
    check("no crash on unmapped id", True)
    check("no DB write for unmapped id", len(svc.supabase.writes) == 0)
except Exception as e:
    check("no crash on unmapped id", False, repr(e))

# --------------------------------------------------------------------------
print("\n" + "=" * 60)
passed = sum(1 for r in results if r)
total = len(results)
print(f"RESULT: {passed}/{total} checks passed")
print("=" * 60)
sys.exit(0 if passed == total else 1)
