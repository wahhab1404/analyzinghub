'use client'

import {
  LayoutDashboard,
  Activity,
  TrendingUp,
  FileBarChart2,
  Archive,
  Plus,
  ChevronLeft,
  LineChart,
  Monitor,
} from 'lucide-react'

export type TerminalTab = 'overview' | 'analyses' | 'trades' | 'reports' | 'archive'

interface TerminalSidebarProps {
  activeTab: TerminalTab
  onTabChange: (tab: TerminalTab) => void
  currentView: string
  onBackToList: () => void
  onShowCreateForm: () => void
  onShowTradeDialog: () => void
  language: string
}

const TABS: { id: TerminalTab; label: string; labelAr: string; icon: React.ElementType; accent?: string }[] = [
  { id: 'overview', label: 'Overview', labelAr: 'نظرة عامة', icon: LayoutDashboard },
  { id: 'analyses', label: 'Analyses', labelAr: 'التحليلات', icon: Activity, accent: 'blue' },
  { id: 'trades', label: 'Trades', labelAr: 'التداولات', icon: TrendingUp, accent: 'emerald' },
  { id: 'reports', label: 'Reports', labelAr: 'التقارير', icon: FileBarChart2, accent: 'violet' },
  { id: 'archive', label: 'Archive', labelAr: 'الأرشيف', icon: Archive },
]

const ACCENT_COLORS: Record<string, string> = {
  blue: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  violet: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
  default: 'text-slate-300 bg-slate-500/10 border-slate-500/20',
}

const ACCENT_DOT: Record<string, string> = {
  blue: 'bg-blue-400',
  emerald: 'bg-emerald-400',
  violet: 'bg-violet-400',
  default: 'bg-slate-400',
}

export function TerminalSidebar({
  activeTab,
  onTabChange,
  currentView,
  onBackToList,
  onShowCreateForm,
  onShowTradeDialog,
  language,
}: TerminalSidebarProps) {
  const isAr = language === 'ar'

  const handleTabClick = (tab: TerminalTab) => {
    onTabChange(tab)
    if (currentView !== 'list') {
      onBackToList()
    }
  }

  return (
    <div className="w-[200px] flex-shrink-0 bg-[#0b1220] border-r border-[#1a2840] flex flex-col overflow-hidden">
      {/* Workspace header */}
      <div className="flex items-center gap-2 px-4 h-10 border-b border-[#1a2840] flex-shrink-0">
        <LineChart className="w-3.5 h-3.5 text-blue-500/70" />
        <span className="text-[10px] font-bold tracking-[0.18em] text-slate-500 uppercase">Workspace</span>
      </div>

      {/* Back breadcrumb in sub-views */}
      {currentView !== 'list' && (
        <button
          onClick={onBackToList}
          className="flex items-center gap-2 px-4 py-2.5 text-[11px] text-slate-500 hover:text-slate-200 hover:bg-[#141d2e] transition-colors border-b border-[#1a2840] flex-shrink-0"
        >
          <ChevronLeft className="w-3 h-3" />
          <span>Back to List</span>
        </button>
      )}

      {/* Sub-view indicator */}
      {currentView === 'manage-trades' && (
        <div className="px-4 py-2 border-b border-[#1a2840] flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <Monitor className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">Manage Trades</span>
          </div>
        </div>
      )}
      {currentView === 'monitor-trade' && (
        <div className="px-4 py-2 border-b border-[#1a2840] flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">Live Monitor</span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 p-2 flex-1">
        <div className="px-2 pb-2 pt-1">
          <span className="text-[9px] font-bold tracking-[0.2em] text-slate-700 uppercase">Navigation</span>
        </div>
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id && currentView === 'list'
          const accentKey = tab.accent || 'default'
          const activeClass = ACCENT_COLORS[accentKey]
          const dotClass = ACCENT_DOT[accentKey]

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`group flex items-center gap-2.5 px-3 py-2 rounded text-left transition-all duration-150 w-full ${
                isActive
                  ? `border ${activeClass} font-semibold`
                  : 'text-slate-500 hover:text-slate-300 hover:bg-[#141d2e] border border-transparent'
              }`}
            >
              <Icon
                className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${
                  isActive ? '' : 'group-hover:text-slate-300'
                }`}
              />
              <span className="text-[11px] flex-1">{isAr ? tab.labelAr : tab.label}</span>
              {isActive && <span className={`w-1 h-1 rounded-full flex-shrink-0 ${dotClass}`} />}
            </button>
          )
        })}
      </nav>

      {/* Quick Actions section */}
      <div className="flex-shrink-0 border-t border-[#1a2840]">
        <div className="px-4 py-2">
          <span className="text-[9px] font-bold tracking-[0.2em] text-slate-700 uppercase">Quick Actions</span>
        </div>
        <div className="px-2 pb-3 space-y-0.5">
          <button
            onClick={onShowCreateForm}
            className="group flex items-center gap-2 px-3 py-2 rounded text-left text-[11px] text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/5 hover:border-emerald-500/20 border border-transparent transition-all w-full"
          >
            <Plus className="w-3.5 h-3.5 flex-shrink-0 group-hover:text-emerald-400" />
            <span>{isAr ? 'تحليل جديد' : 'New Analysis'}</span>
          </button>
          <button
            onClick={onShowTradeDialog}
            className="group flex items-center gap-2 px-3 py-2 rounded text-left text-[11px] text-slate-500 hover:text-blue-400 hover:bg-blue-500/5 hover:border-blue-500/20 border border-transparent transition-all w-full"
          >
            <TrendingUp className="w-3.5 h-3.5 flex-shrink-0 group-hover:text-blue-400" />
            <span>{isAr ? 'صفقة جديدة' : 'New Trade'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
