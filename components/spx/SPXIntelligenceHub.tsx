'use client'

import { useState } from 'react'
import {
  LayoutDashboard, Activity, BarChart2, Search, Radio, TrendingUp,
  ChevronLeft, Brain, BarChart3, Play, HeartPulse, SlidersHorizontal,
  Menu, X,
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
  shortLabel: string
  icon: React.ElementType
  accentText: string
  accentBg: string
  accentBorder: string
  accentBar: string
  group: 'core' | 'ops'
}

const TABS: TabDef[] = [
  {
    id: 'overview', label: 'Overview', shortLabel: 'Home', icon: LayoutDashboard, group: 'core',
    accentText: 'text-slate-200',  accentBg: 'bg-slate-500/15',  accentBorder: 'border-slate-500/30',  accentBar: 'bg-slate-400',
  },
  {
    id: 'live', label: 'Live Engine', shortLabel: 'Live', icon: Activity, group: 'core',
    accentText: 'text-blue-400',   accentBg: 'bg-blue-500/15',   accentBorder: 'border-blue-400/40',   accentBar: 'bg-blue-400',
  },
  {
    id: 'chain', label: 'Chain Monitor', shortLabel: 'Chain', icon: BarChart2, group: 'core',
    accentText: 'text-violet-400', accentBg: 'bg-violet-500/15', accentBorder: 'border-violet-400/40', accentBar: 'bg-violet-400',
  },
  {
    id: 'finder', label: 'Contract Finder', shortLabel: 'Finder', icon: Search, group: 'core',
    accentText: 'text-emerald-400', accentBg: 'bg-emerald-500/15', accentBorder: 'border-emerald-400/40', accentBar: 'bg-emerald-400',
  },
  {
    id: 'feed', label: 'Signal Feed', shortLabel: 'Signals', icon: Radio, group: 'core',
    accentText: 'text-amber-400',  accentBg: 'bg-amber-500/15',  accentBorder: 'border-amber-400/40',  accentBar: 'bg-amber-400',
  },
  {
    id: 'trades', label: 'Trades', shortLabel: 'Trades', icon: TrendingUp, group: 'core',
    accentText: 'text-green-400',  accentBg: 'bg-green-500/15',  accentBorder: 'border-green-400/40',  accentBar: 'bg-green-400',
  },
  {
    id: 'analytics', label: 'Analytics', shortLabel: 'Stats', icon: BarChart3, group: 'ops',
    accentText: 'text-orange-400', accentBg: 'bg-orange-500/15', accentBorder: 'border-orange-400/40', accentBar: 'bg-orange-400',
  },
  {
    id: 'replay', label: 'Replay', shortLabel: 'Replay', icon: Play, group: 'ops',
    accentText: 'text-cyan-400',   accentBg: 'bg-cyan-500/15',   accentBorder: 'border-cyan-400/40',   accentBar: 'bg-cyan-400',
  },
  {
    id: 'health', label: 'Health', shortLabel: 'Health', icon: HeartPulse, group: 'ops',
    accentText: 'text-rose-400',   accentBg: 'bg-rose-500/15',   accentBorder: 'border-rose-400/40',   accentBar: 'bg-rose-400',
  },
  {
    id: 'settings', label: 'Settings', shortLabel: 'Config', icon: SlidersHorizontal, group: 'ops',
    accentText: 'text-indigo-400', accentBg: 'bg-indigo-500/15', accentBorder: 'border-indigo-400/40', accentBar: 'bg-indigo-400',
  },
]

const BOTTOM_NAV_TABS: HubTab[] = ['overview', 'live', 'feed', 'trades', 'settings']

// ── OVERVIEW ─────────────────────────────────────────────────────────────────

function OverviewContent() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div className="relative overflow-hidden rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 via-[#0a1020] to-violet-500/5 p-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Brain className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">SPX Options Intelligence Engine</h2>
            <p className="text-xs text-blue-400/70 font-medium mt-0.5">Phase 4 — Real-Time Multi-Factor Analysis</p>
          </div>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed">
          Continuous feature extraction from the live SPX index and options chain.
          Detects walls and shock conditions, generates composite signals with recommended contracts,
          manages trade lifecycle, and provides full analytics and historical replay.
        </p>
      </div>

      <div>
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Engine Modules</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ENGINE_SECTIONS.map(section => (
            <div key={section.title} className={`bg-[#0a1020] border ${section.border} rounded-xl p-4 hover:bg-[#0c1428] transition-colors`}>
              <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${section.color}`}>
                {section.title}
              </div>
              <ul className="space-y-2">
                {section.lines.map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-500 leading-snug">
                    <span className={`mt-0.5 flex-shrink-0 opacity-50 ${section.color}`}>▸</span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#0a1020] border border-[#1e2f47] rounded-xl p-5">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Quick Start</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {QUICK_START.map(item => (
            <div key={item.tab} className="flex gap-3">
              <span className="text-sm text-white font-semibold whitespace-nowrap min-w-[110px]">{item.tab}</span>
              <span className="text-xs text-slate-500 leading-relaxed">{item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#0a1020] border border-[#1e2f47] rounded-xl p-5">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Composite Score Formula</h3>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Structure', pct: '20%', cls: 'text-blue-400 border-blue-500/25 bg-blue-500/8' },
            { label: 'Flow',      pct: '20%', cls: 'text-emerald-400 border-emerald-500/25 bg-emerald-500/8' },
            { label: 'Gamma',     pct: '15%', cls: 'text-violet-400 border-violet-500/25 bg-violet-500/8' },
            { label: 'Wall',      pct: '15%', cls: 'text-orange-400 border-orange-500/25 bg-orange-500/8' },
            { label: 'IV',        pct: '10%', cls: 'text-amber-400 border-amber-500/25 bg-amber-500/8' },
            { label: 'Execution', pct: '10%', cls: 'text-cyan-400 border-cyan-500/25 bg-cyan-500/8' },
            { label: 'Time',      pct: '5%',  cls: 'text-rose-400 border-rose-500/25 bg-rose-500/8' },
            { label: 'Contract',  pct: '5%',  cls: 'text-indigo-400 border-indigo-500/25 bg-indigo-500/8' },
          ].map(s => (
            <div key={s.label} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${s.cls}`}>
              <span>{s.label}</span>
              <span className="opacity-60">{s.pct}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-600 mt-3">
          Confidence: <span className="text-emerald-400 font-semibold">A</span> ≥80 · <span className="text-blue-400 font-semibold">B</span> ≥65 · <span className="text-amber-400 font-semibold">C</span> ≥50 · <span className="text-orange-400 font-semibold">D</span> ≥35 · <span className="text-red-400 font-semibold">E</span> &lt;35
        </p>
      </div>
    </div>
  )
}

const ENGINE_SECTIONS = [
  { title: 'Feature Extractor', color: 'text-blue-400',    border: 'border-blue-500/20',    lines: ['Live SPX price from Polygon REST (with DB fallback)', 'Rolling history → 1m / 5m / 15m trend slopes', 'TWA-VWAP heuristic approximation', 'Options chain: OI, volume, greeks, IV', 'Flow bias, sweep detection, GEX estimate'] },
  { title: 'Wall Engine',       color: 'text-emerald-400', border: 'border-emerald-500/20', lines: ['Full chain snapshot (±10% band)', 'Strength = 40% OI + 30% Vol + 20% Gamma + 10% Reinforce', 'Persistence scoring across engine cycles', 'States: holding / approached / rejected / broken', 'Migration and compression detection'] },
  { title: 'Shock Engine',      color: 'text-orange-400',  border: 'border-orange-500/20',  lines: ['Price velocity 1m / 5m from rolling history', 'Shock = 35% vel + 30% reprice + 20% flow burst + 15% gamma', 'Acceleration = Δvelocity normalised', 'Continuation / reversal probability', 'Exhaustion heuristic for overextended moves'] },
  { title: 'Signal Scorer',     color: 'text-violet-400',  border: 'border-violet-500/20',  lines: ['8-component composite score (see formula below)', 'Confidence class A–E · 11 modes · 10 types', 'Direction bias from trend + flow + velocity vote', 'Entry plan: zones, stops, T1/T2/T3 targets', 'Persisted to spx_signal_events'] },
  { title: 'Trade Lifecycle',   color: 'text-amber-400',   border: 'border-amber-500/20',   lines: ['13-state machine: detected → active → closed', 'Premium tracking: entry / current / highest / lowest', 'MFE / MAE / unrealized P&L per cycle', 'Exit signals: EXIT_CALL, TRAIL_STOP, WALL_FAILURE …', 'Telegram alerts at each lifecycle milestone'] },
  { title: 'Phase 4 — Ops',     color: 'text-cyan-400',    border: 'border-cyan-500/20',    lines: ['Configurable settings (50+ parameters)', 'Analytics: win rate, expectancy, MFE/MAE by mode', 'Historical replay using Polygon minute bars', 'Engine health / heartbeat / data quality monitor', 'Tests, docs, tuning guide'] },
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
  const [moreOpen, setMoreOpen]   = useState(false)

  const coreTabs = TABS.filter(t => t.group === 'core')
  const opsTabs  = TABS.filter(t => t.group === 'ops')
  const bottomNavTabs = TABS.filter(t => BOTTOM_NAV_TABS.includes(t.id))
  const activeTabDef = TABS.find(t => t.id === activeTab)!

  return (
    <div className={`flex flex-col h-full bg-[#080d17] text-white ${className}`}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 py-3 bg-[#0b1220] border-b border-white/[0.06] flex-shrink-0">
        <Link
          href="/dashboard/indices"
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-200 transition-colors group"
        >
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="hidden sm:inline">Indices Hub</span>
        </Link>
        <span className="text-white/10 select-none">/</span>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
            <Brain className="w-4 h-4 text-blue-400" />
          </div>
          <span className="text-sm font-bold text-white tracking-tight">SPX Intelligence</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
          <span className="text-xs text-slate-500 hidden sm:inline font-medium">Phase 4 Live</span>
        </div>
      </header>

      {/* ── Desktop Tab Bar ─────────────────────────────────────────────────── */}
      <nav className="hidden md:flex items-center bg-[#0b1220]/80 border-b border-white/[0.06] flex-shrink-0 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1 px-3 py-1.5">
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-2 whitespace-nowrap">Core</span>
          {coreTabs.map(tab => (
            <DesktopTab key={tab.id} tab={tab} isActive={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} />
          ))}
          <div className="w-px h-5 bg-white/10 mx-1 flex-shrink-0" />
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-2 whitespace-nowrap">Ops</span>
          {opsTabs.map(tab => (
            <DesktopTab key={tab.id} tab={tab} isActive={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} />
          ))}
        </div>
      </nav>

      {/* ── Mobile Top Scroll Tabs ──────────────────────────────────────────── */}
      <nav className="md:hidden bg-[#0b1220]/80 border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-none">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                  isActive
                    ? `${tab.accentText} ${tab.accentBg} border ${tab.accentBorder}`
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                {tab.shortLabel}
              </button>
            )
          })}
        </div>
      </nav>

      {/* ── Page content ────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="p-4 md:p-6 max-w-screen-2xl mx-auto">
          {activeTab === 'overview'  && <OverviewContent />}
          {activeTab === 'live'      && <LiveEnginePanel />}
          {activeTab === 'chain'     && <ChainMonitorPanel />}
          {activeTab === 'finder'    && <ContractFinderPanel />}
          {activeTab === 'feed'      && <SignalFeedPanel />}
          {activeTab === 'trades'    && <ActiveTradesPanel />}
          {activeTab === 'analytics' && <AnalyticsPanel />}
          {activeTab === 'replay'    && <ReplayPanel />}
          {activeTab === 'health'    && <HealthPanel />}
          {activeTab === 'settings'  && <SettingsPanel />}
        </div>
      </main>

      {/* ── Mobile Bottom Navigation ─────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0b1220]/95 backdrop-blur-md border-t border-white/[0.08] flex-shrink-0">
        {/* "More" drawer */}
        {moreOpen && (
          <div className="absolute bottom-full left-0 right-0 bg-[#0e1828] border-t border-white/[0.08] px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">More Tabs</span>
              <button onClick={() => setMoreOpen(false)} className="text-slate-500 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {opsTabs.map(tab => {
                const isActive = activeTab === tab.id
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveTab(tab.id); setMoreOpen(false) }}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? `${tab.accentText} ${tab.accentBg} border ${tab.accentBorder}`
                        : 'text-slate-400 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex items-stretch justify-around px-1 py-1 safe-area-bottom">
          {bottomNavTabs.map(tab => {
            const isActive = activeTab === tab.id
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setMoreOpen(false) }}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all flex-1 max-w-[72px] ${
                  isActive ? tab.accentText : 'text-slate-600'
                }`}
              >
                <div className={`p-1.5 rounded-lg transition-all ${isActive ? tab.accentBg : ''}`}>
                  <Icon className="w-[22px] h-[22px]" />
                </div>
                <span className="text-[10px] font-semibold leading-none">{tab.shortLabel}</span>
              </button>
            )
          })}
          {/* More button */}
          <button
            onClick={() => setMoreOpen(v => !v)}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all flex-1 max-w-[72px] ${
              moreOpen ? 'text-slate-200' : 'text-slate-600'
            }`}
          >
            <div className={`p-1.5 rounded-lg transition-all ${moreOpen ? 'bg-white/10' : ''}`}>
              <Menu className="w-[22px] h-[22px]" />
            </div>
            <span className="text-[10px] font-semibold leading-none">More</span>
          </button>
        </div>
      </nav>
    </div>
  )
}

// ── DESKTOP TAB BUTTON ───────────────────────────────────────────────────────

function DesktopTab({
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
      className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all whitespace-nowrap rounded-lg ${
        isActive
          ? `${tab.accentText} ${tab.accentBg}`
          : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
      }`}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      {tab.label}
      {isActive && (
        <span className={`absolute bottom-0 left-3 right-3 h-0.5 rounded-full ${tab.accentBar}`} />
      )}
    </button>
  )
}
