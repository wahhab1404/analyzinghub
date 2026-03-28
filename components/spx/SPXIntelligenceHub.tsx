'use client'

/**
 * components/spx/SPXIntelligenceHub.tsx
 *
 * Phase 2 — SPX Options Intelligence Hub
 *
 * Main container for the SPX Intelligence page.
 * Renders 5 tabs: Overview | Live Engine | Chain Monitor | Contract Finder | Signal Feed
 */

import { useState } from 'react'
import {
  LayoutDashboard,
  Activity,
  BarChart2,
  Search,
  Radio,
  ChevronLeft,
  Brain,
} from 'lucide-react'
import Link from 'next/link'
import { LiveEnginePanel } from './LiveEnginePanel'
import { ChainMonitorPanel } from './ChainMonitorPanel'
import { ContractFinderPanel } from './ContractFinderPanel'
import { SignalFeedPanel } from './SignalFeedPanel'

type HubTab = 'overview' | 'live' | 'chain' | 'finder' | 'feed'

const TABS: { id: HubTab; label: string; icon: React.ElementType; accent: string }[] = [
  { id: 'overview', label: 'Overview',       icon: LayoutDashboard, accent: 'slate' },
  { id: 'live',     label: 'Live Engine',    icon: Activity,        accent: 'blue' },
  { id: 'chain',    label: 'Chain Monitor',  icon: BarChart2,       accent: 'violet' },
  { id: 'finder',   label: 'Contract Finder',icon: Search,          accent: 'emerald' },
  { id: 'feed',     label: 'Signal Feed',    icon: Radio,           accent: 'amber' },
]

const ACCENT_ACTIVE: Record<string, string> = {
  slate:   'text-slate-300 bg-slate-500/10 border-slate-500/20',
  blue:    'text-blue-400 bg-blue-500/10 border-blue-500/30',
  violet:  'text-violet-400 bg-violet-500/10 border-violet-500/30',
  emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  amber:   'text-amber-400 bg-amber-500/10 border-amber-500/30',
}

/** Overview tab: brief architecture and scoring explanation */
function OverviewContent() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-base font-bold text-white mb-1">SPX Options Intelligence Engine</h2>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Phase 2 — real-time multi-factor analysis for SPX / SPXW options trading.
          The engine continuously extracts features from the live SPX index and options chain,
          detects walls and shock conditions, and generates a composite signal with a
          recommended contract.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          {
            title: 'Feature Extractor',
            color: 'text-blue-400',
            border: 'border-blue-500/20',
            lines: [
              'Live SPX price from Polygon REST snapshot',
              'Rolling price history → 1m / 5m / 15m trend',
              'TWA-VWAP (time-weighted average, heuristic)',
              'Options chain: OI, volume, greeks, IV',
              'Flow bias, sweep detection, GEX estimate',
            ],
          },
          {
            title: 'Wall Engine',
            color: 'text-emerald-400',
            border: 'border-emerald-500/20',
            lines: [
              'Full chain snapshot (±10% band)',
              'Wall strength = 40% OI + 30% Vol + 20% Gamma cluster + 10% Reinforcement',
              'Persistence scoring (hours as dominant wall)',
              'State tracking: holding / approached / rejected / broken',
              'Migration and compression detection',
            ],
          },
          {
            title: 'Shock Engine',
            color: 'text-orange-400',
            border: 'border-orange-500/20',
            lines: [
              'Price velocity 1m / 5m from history',
              'Shock = 35% velocity + 30% repricing + 20% flow burst + 15% gamma accel',
              'Acceleration = velocity₁ₘ − velocity₅ₘ normalised',
              'Continuation / reversal probability with adjustments',
              'Exhaustion heuristic for overextended moves',
            ],
          },
          {
            title: 'Signal Scorer',
            color: 'text-violet-400',
            border: 'border-violet-500/20',
            lines: [
              'Composite = 20% structure + 20% flow + 15% gamma + 15% wall + 10% IV + 10% execution + 5% time + 5% contract fit',
              'Confidence class A–E (A ≥ 80)',
              '11 signal modes, 10 signal types',
              'Direction bias voted from trend + flow + velocity',
              'Persisted to spx_signal_events',
            ],
          },
          {
            title: 'Contract Ranker',
            color: 'text-amber-400',
            border: 'border-amber-500/20',
            lines: [
              'Rank = 35% liquidity + 30% responsiveness + 35% fit',
              'Liquidity = 30% vol + 25% OI + 30% spread + 15% quote',
              'Responsiveness = |delta| × (1/spread normalised)',
              'Fit = DTE match + delta range + premium range + OI threshold',
              'Labels: best, backup, aggressive, conservative',
            ],
          },
          {
            title: 'Data Notes',
            color: 'text-slate-400',
            border: 'border-slate-500/20',
            lines: [
              'SPX is an index — TWA-VWAP uses equal-weight time average',
              'GEX = Σ(gamma × OI × 100 × price²) — assumes dealer short gamma',
              'IV skew = avg OTM put IV − avg OTM call IV (near chain)',
              'Sweeps: inferred from burst volume + tight spread heuristic',
              'All heuristics documented in source code and tooltips',
            ],
          },
        ].map(section => (
          <div key={section.title} className={`bg-[#070e1a] border ${section.border} rounded-xl p-4`}>
            <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${section.color}`}>
              {section.title}
            </div>
            <ul className="space-y-1">
              {section.lines.map((line, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[10px] text-slate-500">
                  <span className="text-slate-700 mt-0.5">▸</span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="bg-[#0d1726] border border-[#1a2840] rounded-xl p-4">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Quick Start</div>
        <ol className="space-y-1.5 text-[10px] text-slate-500">
          <li><span className="text-slate-300 font-semibold">1. Live Engine</span> — Full pipeline run. Refreshes every 30s. Shows signal, walls, shock, and recommended contract.</li>
          <li><span className="text-slate-300 font-semibold">2. Chain Monitor</span> — Deep dive into options chain features, greeks, flow, GEX, and skew. Refreshes every 60s.</li>
          <li><span className="text-slate-300 font-semibold">3. Contract Finder</span> — Manual contract search with configurable filters. Returns best/backup/aggressive/conservative.</li>
          <li><span className="text-slate-300 font-semibold">4. Signal Feed</span> — Chronological history of all generated signals with confidence class, rationale, and resolution.</li>
        </ol>
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

interface SPXIntelligenceHubProps {
  className?: string
}

export function SPXIntelligenceHub({ className = '' }: SPXIntelligenceHubProps) {
  const [activeTab, setActiveTab] = useState<HubTab>('overview')

  return (
    <div className={`flex flex-col h-full bg-[#080d17] text-white ${className}`}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#0b1220] border-b border-[#1a2840] flex-shrink-0">
        <Link
          href="/dashboard/indices"
          className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-300 transition-colors"
        >
          <ChevronLeft className="w-3 h-3" />
          Indices Hub
        </Link>
        <span className="text-[#1a2840]">/</span>
        <div className="flex items-center gap-1.5">
          <Brain className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[11px] font-bold tracking-wide text-slate-200">
            SPX Intelligence
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[9px] text-slate-600 uppercase tracking-widest">Phase 2</span>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 px-4 py-2 bg-[#0b1220] border-b border-[#1a2840] flex-shrink-0 overflow-x-auto scrollbar-none">
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-semibold transition-all whitespace-nowrap ${
                isActive
                  ? `border ${ACCENT_ACTIVE[tab.accent]}`
                  : 'text-slate-600 hover:text-slate-300 border border-transparent'
              }`}
            >
              <Icon className="w-3 h-3 flex-shrink-0" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'overview' && <OverviewContent />}
        {activeTab === 'live'     && <LiveEnginePanel />}
        {activeTab === 'chain'    && <ChainMonitorPanel />}
        {activeTab === 'finder'   && <ContractFinderPanel />}
        {activeTab === 'feed'     && <SignalFeedPanel />}
      </div>
    </div>
  )
}
