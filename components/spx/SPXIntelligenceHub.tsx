'use client'

/**
 * components/spx/SPXIntelligenceHub.tsx
 *
 * Phase 4 — SPX Options Intelligence Hub
 *
 * 10 tabs: Overview | Live Engine | Chain Monitor | Contract Finder |
 *          Signal Feed | Trades | Analytics | Replay | Health | Settings
 */

import { useState } from 'react'
import {
  LayoutDashboard,
  Activity,
  BarChart2,
  Search,
  Radio,
  TrendingUp,
  ChevronLeft,
  Brain,
  BarChart3,
  Play,
  HeartPulse,
  SlidersHorizontal,
} from 'lucide-react'
import Link from 'next/link'
import { LiveEnginePanel }      from './LiveEnginePanel'
import { ChainMonitorPanel }    from './ChainMonitorPanel'
import { ContractFinderPanel }  from './ContractFinderPanel'
import { SignalFeedPanel }      from './SignalFeedPanel'
import { ActiveTradesPanel }    from './ActiveTradesPanel'
import AnalyticsPanel           from './AnalyticsPanel'
import ReplayPanel              from './ReplayPanel'
import HealthPanel              from './HealthPanel'
import SettingsPanel            from './SettingsPanel'

type HubTab =
  | 'overview' | 'live' | 'chain' | 'finder' | 'feed'
  | 'trades' | 'analytics' | 'replay' | 'health' | 'settings'

interface TabDef {
  id: HubTab
  label: string
  icon: React.ElementType
  accent: string
  group?: 'core' | 'ops'
}

const TABS: TabDef[] = [
  { id: 'overview',   label: 'Overview',        icon: LayoutDashboard,  accent: 'slate',   group: 'core' },
  { id: 'live',       label: 'Live Engine',     icon: Activity,         accent: 'blue',    group: 'core' },
  { id: 'chain',      label: 'Chain Monitor',   icon: BarChart2,        accent: 'violet',  group: 'core' },
  { id: 'finder',     label: 'Contract Finder', icon: Search,           accent: 'emerald', group: 'core' },
  { id: 'feed',       label: 'Signal Feed',     icon: Radio,            accent: 'amber',   group: 'core' },
  { id: 'trades',     label: 'Trades',          icon: TrendingUp,       accent: 'green',   group: 'core' },
  { id: 'analytics',  label: 'Analytics',       icon: BarChart3,        accent: 'orange',  group: 'ops'  },
  { id: 'replay',     label: 'Replay',          icon: Play,             accent: 'cyan',    group: 'ops'  },
  { id: 'health',     label: 'Health',          icon: HeartPulse,       accent: 'rose',    group: 'ops'  },
  { id: 'settings',   label: 'Settings',        icon: SlidersHorizontal, accent: 'indigo', group: 'ops'  },
]

const ACCENT_ACTIVE: Record<string, string> = {
  slate:   'text-slate-300   bg-slate-500/10   border-slate-500/20',
  blue:    'text-blue-400    bg-blue-500/10    border-blue-500/30',
  violet:  'text-violet-400  bg-violet-500/10  border-violet-500/30',
  emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  amber:   'text-amber-400   bg-amber-500/10   border-amber-500/30',
  green:   'text-green-400   bg-green-500/10   border-green-500/30',
  orange:  'text-orange-400  bg-orange-500/10  border-orange-500/30',
  cyan:    'text-cyan-400    bg-cyan-500/10    border-cyan-500/30',
  rose:    'text-rose-400    bg-rose-500/10    border-rose-500/30',
  indigo:  'text-indigo-400  bg-indigo-500/10  border-indigo-500/30',
}

// ── OVERVIEW CONTENT ─────────────────────────────────────────────────────────

function OverviewContent() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-base font-bold text-white mb-1">SPX Options Intelligence Engine</h2>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Phase 4 — real-time multi-factor analysis for SPX / SPXW options trading.
          The engine continuously extracts features from the live SPX index and options chain,
          detects walls and shock conditions, generates composite signals with recommended contracts,
          manages trade lifecycle, and provides full analytics and historical replay.
        </p>
      </div>

      {/* Engine modules */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ENGINE_SECTIONS.map(section => (
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

      {/* Quick start */}
      <div className="bg-[#0d1726] border border-[#1a2840] rounded-xl p-4">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
          Quick Start
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {QUICK_START.map(item => (
            <div key={item.tab} className="flex gap-2 text-[10px]">
              <span className="text-slate-300 font-semibold whitespace-nowrap">{item.tab}</span>
              <span className="text-slate-500">{item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Score formula reference */}
      <div className="bg-[#070e1a] border border-[#1a2840] rounded-xl p-4">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
          Composite Score Formula
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Structure', pct: '20%', color: 'text-blue-400 border-blue-500/20 bg-blue-500/5' },
            { label: 'Flow',      pct: '20%', color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' },
            { label: 'Gamma',     pct: '15%', color: 'text-violet-400 border-violet-500/20 bg-violet-500/5' },
            { label: 'Wall',      pct: '15%', color: 'text-orange-400 border-orange-500/20 bg-orange-500/5' },
            { label: 'IV',        pct: '10%', color: 'text-amber-400 border-amber-500/20 bg-amber-500/5' },
            { label: 'Execution', pct: '10%', color: 'text-cyan-400 border-cyan-500/20 bg-cyan-500/5' },
            { label: 'Time',      pct: '5%',  color: 'text-rose-400 border-rose-500/20 bg-rose-500/5' },
            { label: 'Contract',  pct: '5%',  color: 'text-indigo-400 border-indigo-500/20 bg-indigo-500/5' },
          ].map(s => (
            <div key={s.label} className={`flex items-center gap-1 px-2 py-1 rounded border text-[9px] font-medium ${s.color}`}>
              <span>{s.label}</span>
              <span className="opacity-60">{s.pct}</span>
            </div>
          ))}
        </div>
        <p className="text-[9px] text-slate-600 mt-2">
          Confidence A ≥ 80 · B ≥ 65 · C ≥ 50 · D ≥ 35 · E &lt; 35
        </p>
      </div>
    </div>
  )
}

const ENGINE_SECTIONS = [
  {
    title: 'Feature Extractor',
    color: 'text-blue-400',
    border: 'border-blue-500/20',
    lines: [
      'Live SPX price from Polygon REST (with DB fallback)',
      'Rolling history → 1m / 5m / 15m trend slopes',
      'TWA-VWAP heuristic approximation',
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
      'Strength = 40% OI + 30% Vol + 20% Gamma + 10% Reinforce',
      'Persistence scoring across engine cycles',
      'States: holding / approached / rejected / broken',
      'Migration and compression detection',
    ],
  },
  {
    title: 'Shock Engine',
    color: 'text-orange-400',
    border: 'border-orange-500/20',
    lines: [
      'Price velocity 1m / 5m from rolling history',
      'Shock = 35% vel + 30% reprice + 20% flow burst + 15% gamma',
      'Acceleration = Δvelocity normalised',
      'Continuation / reversal probability',
      'Exhaustion heuristic for overextended moves',
    ],
  },
  {
    title: 'Signal Scorer',
    color: 'text-violet-400',
    border: 'border-violet-500/20',
    lines: [
      '8-component composite score (see formula below)',
      'Confidence class A–E · 11 modes · 10 types',
      'Direction bias from trend + flow + velocity vote',
      'Entry plan: zones, stops, T1/T2/T3 targets',
      'Persisted to spx_signal_events',
    ],
  },
  {
    title: 'Trade Lifecycle',
    color: 'text-amber-400',
    border: 'border-amber-500/20',
    lines: [
      '13-state machine: detected → active → closed',
      'Premium tracking: entry / current / highest / lowest',
      'MFE / MAE / unrealized P&L per cycle',
      'Exit signals: EXIT_CALL, TRAIL_STOP, WALL_FAILURE …',
      'Telegram alerts at each lifecycle milestone',
    ],
  },
  {
    title: 'Phase 4 — Ops',
    color: 'text-cyan-400',
    border: 'border-cyan-500/20',
    lines: [
      'Configurable settings (50+ parameters)',
      'Analytics: win rate, expectancy, MFE/MAE by mode',
      'Historical replay using Polygon minute bars',
      'Engine health / heartbeat / data quality monitor',
      'Tests, docs, tuning guide',
    ],
  },
]

const QUICK_START = [
  { tab: 'Live Engine',     desc: 'Full pipeline run. Refreshes every 30s. Signal, walls, shock, contract.' },
  { tab: 'Chain Monitor',   desc: 'Deep dive into options chain features, greeks, flow, GEX, skew.' },
  { tab: 'Contract Finder', desc: 'Manual search with filters. Returns best/backup/aggressive/conservative.' },
  { tab: 'Signal Feed',     desc: 'Chronological signal history with confidence, rationale, resolution.' },
  { tab: 'Trades',          desc: 'Live active positions and recent closed trade outcomes.' },
  { tab: 'Analytics',       desc: 'Win rate, expectancy, MFE/MAE, performance by mode and time.' },
  { tab: 'Replay',          desc: 'Step through past sessions with SPX bars and stored signal events.' },
  { tab: 'Health',          desc: 'Engine heartbeat, Polygon feed status, Telegram channel status.' },
  { tab: 'Settings',        desc: 'Configure score thresholds, contract filters, alert controls.' },
]

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

interface SPXIntelligenceHubProps {
  className?: string
}

export function SPXIntelligenceHub({ className = '' }: SPXIntelligenceHubProps) {
  const [activeTab, setActiveTab] = useState<HubTab>('overview')

  const coreTabs = TABS.filter(t => t.group === 'core')
  const opsTabs  = TABS.filter(t => t.group === 'ops')

  return (
    <div className={`flex flex-col h-full bg-[#080d17] text-white ${className}`}>
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
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
        <div className="ml-auto flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[9px] text-slate-600 uppercase tracking-widest">Phase 4</span>
        </div>
      </div>

      {/* ── Tab navigation ──────────────────────────────────────────────────── */}
      <div className="bg-[#0b1220] border-b border-[#1a2840] flex-shrink-0">
        {/* Core tabs row */}
        <div className="flex items-center gap-1 px-4 pt-2 pb-0 overflow-x-auto scrollbar-none">
          <span className="text-[8px] text-slate-700 uppercase tracking-widest mr-1 whitespace-nowrap">
            Core
          </span>
          {coreTabs.map(tab => (
            <TabButton
              key={tab.id}
              tab={tab}
              isActive={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
          <div className="h-4 w-px bg-[#1a2840] mx-1" />
          <span className="text-[8px] text-slate-700 uppercase tracking-widest mr-1 whitespace-nowrap">
            Ops
          </span>
          {opsTabs.map(tab => (
            <TabButton
              key={tab.id}
              tab={tab}
              isActive={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </div>
        {/* Active indicator strip */}
        <div className="h-px bg-[#1a2840]" />
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'overview'   && <OverviewContent />}
        {activeTab === 'live'       && <LiveEnginePanel />}
        {activeTab === 'chain'      && <ChainMonitorPanel />}
        {activeTab === 'finder'     && <ContractFinderPanel />}
        {activeTab === 'feed'       && <SignalFeedPanel />}
        {activeTab === 'trades'     && <ActiveTradesPanel />}
        {activeTab === 'analytics'  && <AnalyticsPanel />}
        {activeTab === 'replay'     && <ReplayPanel />}
        {activeTab === 'health'     && <HealthPanel />}
        {activeTab === 'settings'   && <SettingsPanel />}
      </div>
    </div>
  )
}

// ── TAB BUTTON ───────────────────────────────────────────────────────────────

function TabButton({
  tab,
  isActive,
  onClick,
}: {
  tab: TabDef
  isActive: boolean
  onClick: () => void
}) {
  const Icon = tab.icon
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 mb-1 rounded text-[10px] font-semibold transition-all whitespace-nowrap ${
        isActive
          ? `border ${ACCENT_ACTIVE[tab.accent]}`
          : 'text-slate-600 hover:text-slate-300 border border-transparent'
      }`}
    >
      <Icon className="w-3 h-3 flex-shrink-0" />
      {tab.label}
    </button>
  )
}
