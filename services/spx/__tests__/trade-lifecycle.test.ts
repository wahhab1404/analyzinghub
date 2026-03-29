/**
 * services/spx/__tests__/trade-lifecycle.test.ts
 *
 * Unit tests for trade lifecycle state machine logic — pure functions only.
 *
 * The production trade-engine.ts calls Supabase for all state transitions.
 * These tests replicate the pure classification and calculation logic inline
 * so the tests run without any external dependencies.
 *
 * Formulas and thresholds are derived directly from trade-engine.ts.
 */

// ── TYPES (replicated from trade-engine.ts) ───────────────────────────────────

type TradeState =
  | 'detected'
  | 'candidate'
  | 'confirmed'
  | 'alerted'
  | 'entered'
  | 'active'
  | 'partially_exited'
  | 'closed_win'
  | 'closed_loss'
  | 'expired'
  | 'invalidated'
  | 'cancelled';

type FinalScoreOutcome =
  | 'big_win'
  | 'small_win'
  | 'breakeven'
  | 'small_loss'
  | 'big_loss';

// ── HELPERS (replicated from trade-engine.ts) ─────────────────────────────────

/**
 * Final score outcome classification (from trade-engine.ts closeTrade):
 *   realizedPnlPct >= +50%  → big_win
 *   realizedPnlPct >= +15%  → small_win
 *   realizedPnlPct >= -10%  → breakeven
 *   realizedPnlPct >= -30%  → small_loss
 *   realizedPnlPct <  -30%  → big_loss
 *
 * NOTE: the prompt spec shows ratio-based thresholds (exit/entry >= 1.50 etc.)
 * but the actual trade-engine.ts uses percentage-based thresholds on
 * realizedPnlPct.  We test the actual implementation.
 */
function classifyOutcome(exitPremium: number, entryPremium: number): FinalScoreOutcome {
  const pnlPct = ((exitPremium - entryPremium) / entryPremium) * 100;
  if (pnlPct >= 50)  return 'big_win';
  if (pnlPct >= 15)  return 'small_win';
  if (pnlPct >= -10) return 'breakeven';
  if (pnlPct >= -30) return 'small_loss';
  return 'big_loss';
}

/**
 * Terminal state determination (from closeTrade):
 *   realizedPnlPct > 0 → 'closed_win'
 *   else               → 'closed_loss'
 */
function determineClosingState(exitPremium: number, entryPremium: number): 'closed_win' | 'closed_loss' {
  const pnlPct = ((exitPremium - entryPremium) / entryPremium) * 100;
  return pnlPct > 0 ? 'closed_win' : 'closed_loss';
}

/**
 * Unrealized P&L percentage (from refreshTradePremium):
 *   (current_premium - entry_premium) / entry_premium × 100
 */
function computeUnrealizedPnlPct(currentPremium: number, entryPremium: number): number {
  return ((currentPremium - entryPremium) / entryPremium) * 100;
}

/**
 * MFE: Maximum Favorable Excursion (from refreshTradePremium):
 *   (highest_premium - entry_premium) / entry_premium × 100
 *   Clamped to minimum of 0.
 */
function computeMFE(highestPremium: number, entryPremium: number): number {
  return Math.max(0, ((highestPremium - entryPremium) / entryPremium) * 100);
}

/**
 * MAE: Maximum Adverse Excursion (from refreshTradePremium):
 *   (entry_premium - lowest_premium) / entry_premium × 100
 *   Clamped to minimum of 0.
 */
function computeMAE(lowestPremium: number, entryPremium: number): number {
  return Math.max(0, ((entryPremium - lowestPremium) / entryPremium) * 100);
}

/**
 * Valid state transition graph.
 *
 * Derived from the documented state machine in trade-engine.ts:
 *   detected → candidate → confirmed → alerted → entered → active
 *   active → partially_exited → closed_win | closed_loss
 *   Any active state → expired | invalidated | cancelled
 *
 * Returns true if the transition from `from` to `to` is valid.
 */
const VALID_TRANSITIONS: Record<TradeState, TradeState[]> = {
  detected:         ['candidate', 'expired', 'invalidated', 'cancelled'],
  candidate:        ['confirmed', 'expired', 'invalidated', 'cancelled'],
  confirmed:        ['alerted', 'expired', 'invalidated', 'cancelled'],
  alerted:          ['entered', 'expired', 'invalidated', 'cancelled'],
  entered:          ['active', 'expired', 'invalidated', 'cancelled'],
  active:           ['partially_exited', 'closed_win', 'closed_loss', 'expired', 'invalidated', 'cancelled'],
  partially_exited: ['closed_win', 'closed_loss', 'expired', 'invalidated', 'cancelled'],
  closed_win:       [],   // terminal
  closed_loss:      [],   // terminal
  expired:          [],   // terminal
  invalidated:      [],   // terminal
  cancelled:        [],   // terminal
};

function isValidTransition(from: TradeState, to: TradeState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── TESTS ──────────────────────────────────────────────────────────────────────

describe('Trade Lifecycle State Machine', () => {

  // ── 1. Forward happy-path transitions ────────────────────────────────────────

  describe('forward state transitions (happy path)', () => {
    it('detected → candidate is valid', () => {
      expect(isValidTransition('detected', 'candidate')).toBe(true);
    });

    it('candidate → confirmed is valid', () => {
      expect(isValidTransition('candidate', 'confirmed')).toBe(true);
    });

    it('confirmed → alerted is valid', () => {
      expect(isValidTransition('confirmed', 'alerted')).toBe(true);
    });

    it('alerted → entered is valid', () => {
      expect(isValidTransition('alerted', 'entered')).toBe(true);
    });

    it('entered → active is valid', () => {
      expect(isValidTransition('entered', 'active')).toBe(true);
    });

    it('active → partially_exited is valid', () => {
      expect(isValidTransition('active', 'partially_exited')).toBe(true);
    });

    it('partially_exited → closed_win is valid', () => {
      expect(isValidTransition('partially_exited', 'closed_win')).toBe(true);
    });

    it('partially_exited → closed_loss is valid', () => {
      expect(isValidTransition('partially_exited', 'closed_loss')).toBe(true);
    });
  });

  // ── 2. Universal terminal transitions ────────────────────────────────────────

  describe('any active state → terminal (expired / invalidated / cancelled)', () => {
    const activeStates: TradeState[] = ['detected', 'candidate', 'confirmed', 'alerted', 'entered', 'active', 'partially_exited'];
    const terminalOverrides: TradeState[] = ['expired', 'invalidated', 'cancelled'];

    activeStates.forEach(state => {
      terminalOverrides.forEach(terminal => {
        it(`${state} → ${terminal} is valid`, () => {
          expect(isValidTransition(state, terminal)).toBe(true);
        });
      });
    });
  });

  // ── 3. Terminal states have no outgoing transitions ──────────────────────────

  describe('terminal states cannot transition further', () => {
    const terminalStates: TradeState[] = ['closed_win', 'closed_loss', 'expired', 'invalidated', 'cancelled'];

    terminalStates.forEach(terminal => {
      it(`${terminal} → detected is invalid (terminal state)`, () => {
        expect(isValidTransition(terminal, 'detected')).toBe(false);
      });
      it(`${terminal} → active is invalid (terminal state)`, () => {
        expect(isValidTransition(terminal, 'active')).toBe(false);
      });
    });
  });

  // ── 4. Invalid skip transitions ───────────────────────────────────────────────

  describe('invalid state skip transitions', () => {
    it('detected → active (skipping intermediate states) is invalid', () => {
      expect(isValidTransition('detected', 'active')).toBe(false);
    });

    it('detected → closed_win (skipping all intermediate states) is invalid', () => {
      expect(isValidTransition('detected', 'closed_win')).toBe(false);
    });

    it('candidate → entered (skipping confirmed and alerted) is invalid', () => {
      expect(isValidTransition('candidate', 'entered')).toBe(false);
    });
  });

  // ── 5. Final score outcome classification ────────────────────────────────────

  describe('final score outcome classification', () => {
    it('classifies big_win when exit >= 150% of entry (>= +50% P&L)', () => {
      // entry 4.00, exit 6.10 → +52.5%
      expect(classifyOutcome(6.10, 4.00)).toBe('big_win');
    });

    it('classifies big_win at exact +50% P&L boundary', () => {
      // entry 4.00, exit 6.00 → exactly +50%
      expect(classifyOutcome(6.00, 4.00)).toBe('big_win');
    });

    it('classifies small_win when exit is +15% to +49.9%', () => {
      // entry 4.00, exit 4.80 → +20%
      expect(classifyOutcome(4.80, 4.00)).toBe('small_win');
    });

    it('classifies small_win at exact +15% P&L boundary', () => {
      // entry 4.00, exit 4.60 → +15%
      expect(classifyOutcome(4.60, 4.00)).toBe('small_win');
    });

    it('classifies breakeven when P&L is between -10% and +14.9%', () => {
      // entry 4.00, exit 4.00 → 0% (flat)
      expect(classifyOutcome(4.00, 4.00)).toBe('breakeven');
      // entry 4.00, exit 3.65 → -8.75% (inside breakeven band)
      expect(classifyOutcome(3.65, 4.00)).toBe('breakeven');
    });

    it('classifies small_loss when P&L is between -30% and -10.01%', () => {
      // entry 4.00, exit 3.00 → -25%
      expect(classifyOutcome(3.00, 4.00)).toBe('small_loss');
    });

    it('classifies big_loss when exit < 70% of entry (< -30% P&L)', () => {
      // entry 4.00, exit 2.60 → -35%
      expect(classifyOutcome(2.60, 4.00)).toBe('big_loss');
    });

    it('classifies big_loss at exact -31% to verify boundary precision', () => {
      // entry 4.00, exit 2.76 → -31%
      expect(classifyOutcome(2.76, 4.00)).toBe('big_loss');
    });
  });

  // ── 6. Closing state determination ───────────────────────────────────────────

  describe('closing state determination', () => {
    it('transitions to closed_win when exit premium > entry premium', () => {
      expect(determineClosingState(5.00, 4.00)).toBe('closed_win');
    });

    it('transitions to closed_loss when exit premium < entry premium', () => {
      expect(determineClosingState(3.00, 4.00)).toBe('closed_loss');
    });

    it('transitions to closed_loss when exit premium equals entry (0% P&L not a win)', () => {
      expect(determineClosingState(4.00, 4.00)).toBe('closed_loss');
    });
  });

  // ── 7. Unrealized P&L calculation ────────────────────────────────────────────

  describe('unrealized P&L percentage', () => {
    it('computes positive unrealized P&L when current > entry', () => {
      // entry 4.00, current 5.00 → +25%
      expect(computeUnrealizedPnlPct(5.00, 4.00)).toBeCloseTo(25.0, 5);
    });

    it('computes negative unrealized P&L when current < entry', () => {
      // entry 4.00, current 3.00 → -25%
      expect(computeUnrealizedPnlPct(3.00, 4.00)).toBeCloseTo(-25.0, 5);
    });

    it('computes zero P&L when current equals entry', () => {
      expect(computeUnrealizedPnlPct(4.00, 4.00)).toBeCloseTo(0, 10);
    });

    it('formula: (current - entry) / entry × 100', () => {
      const result = computeUnrealizedPnlPct(6.50, 5.00);
      expect(result).toBeCloseTo(((6.50 - 5.00) / 5.00) * 100, 5);
    });
  });

  // ── 8. MFE and MAE tracking ───────────────────────────────────────────────────

  describe('MFE (Maximum Favorable Excursion) tracking', () => {
    it('computes MFE as (highest - entry) / entry × 100', () => {
      // entry 4.00, highest 6.00 → MFE = +50%
      expect(computeMFE(6.00, 4.00)).toBeCloseTo(50.0, 5);
    });

    it('clamps MFE to 0 when highest premium is below entry (position never moved in our favour)', () => {
      // entry 4.00, highest 3.50 (never exceeded entry) → MFE = 0
      expect(computeMFE(3.50, 4.00)).toBe(0);
    });

    it('MFE equals 0 when highest equals entry', () => {
      expect(computeMFE(4.00, 4.00)).toBe(0);
    });
  });

  describe('MAE (Maximum Adverse Excursion) tracking', () => {
    it('computes MAE as (entry - lowest) / entry × 100', () => {
      // entry 4.00, lowest 2.80 → MAE = (4.00 - 2.80) / 4.00 × 100 = 30%
      expect(computeMAE(2.80, 4.00)).toBeCloseTo(30.0, 5);
    });

    it('clamps MAE to 0 when lowest premium is above entry (no adverse move)', () => {
      // entry 4.00, lowest 4.20 (always above entry) → MAE = 0
      expect(computeMAE(4.20, 4.00)).toBe(0);
    });

    it('MAE equals 0 when lowest equals entry', () => {
      expect(computeMAE(4.00, 4.00)).toBe(0);
    });
  });

  // ── 9. Combined scenario: track full lifecycle P&L metrics ───────────────────

  describe('full lifecycle P&L scenario', () => {
    it('correctly tracks MFE, MAE, and unrealized P&L through a volatile trade', () => {
      const entryPremium  = 5.00;
      const highestSeen   = 7.50;  // ran +50% at best
      const lowestSeen    = 4.20;  // dipped -16% at worst
      const currentPrice  = 6.80;  // currently +36%

      const mfe           = computeMFE(highestSeen, entryPremium);
      const mae           = computeMAE(lowestSeen, entryPremium);
      const unrealizedPnl = computeUnrealizedPnlPct(currentPrice, entryPremium);

      expect(mfe).toBeCloseTo(50.0, 5);
      expect(mae).toBeCloseTo(16.0, 5);
      expect(unrealizedPnl).toBeCloseTo(36.0, 5);
    });

    it('outcome classification matches closed P&L in a winning trade scenario', () => {
      const entryPremium = 5.00;
      const exitPremium  = 8.00;  // +60% → big_win

      const outcome = classifyOutcome(exitPremium, entryPremium);
      const state   = determineClosingState(exitPremium, entryPremium);

      expect(outcome).toBe('big_win');
      expect(state).toBe('closed_win');
    });

    it('outcome classification matches closed P&L in a losing trade scenario', () => {
      const entryPremium = 5.00;
      const exitPremium  = 3.20;  // -36% → big_loss

      const outcome = classifyOutcome(exitPremium, entryPremium);
      const state   = determineClosingState(exitPremium, entryPremium);

      expect(outcome).toBe('big_loss');
      expect(state).toBe('closed_loss');
    });
  });
});
