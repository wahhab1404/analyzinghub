'use client'

import { useEffect, useRef, useState } from 'react'
import { BarChart3, Activity, Target, TrendingUp, Layers, Zap, ChevronDown } from 'lucide-react'

interface OverviewTabProps {
  language: string
}

const CHART_SYMBOLS = [
  { label: 'S&P 500', value: 'SP:SPX' },
  { label: 'NASDAQ 100', value: 'NASDAQ:NDX' },
  { label: 'DOW JONES', value: 'DJ:DJI' },
  { label: 'VIX', value: 'CBOE:VIX' },
]

export function OverviewTab({ language }: OverviewTabProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedSymbol, setSelectedSymbol] = useState(CHART_SYMBOLS[0])
  const [showSymbolPicker, setShowSymbolPicker] = useState(false)
  const isAr = language === 'ar'

  useEffect(() => {
    if (!containerRef.current) return

    // Clear previous widget
    containerRef.current.innerHTML = ''

    const widgetContainer = document.createElement('div')
    widgetContainer.className = 'tradingview-widget-container'
    widgetContainer.style.height = '100%'
    widgetContainer.style.width = '100%'

    const widgetDiv = document.createElement('div')
    widgetDiv.className = 'tradingview-widget-container__widget'
    widgetDiv.style.height = 'calc(100% - 32px)'
    widgetDiv.style.width = '100%'

    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.type = 'text/javascript'
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: selectedSymbol.value,
      interval: 'D',
      timezone: 'America/New_York',
      theme: 'dark',
      style: '1',
      locale: 'en',
      withdateranges: true,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      save_image: false,
      backgroundColor: 'rgba(8, 13, 22, 1)',
      gridColor: 'rgba(26, 40, 64, 0.5)',
      watchlist: ['SP:SPX', 'NASDAQ:NDX', 'DJ:DJI', 'CBOE:VIX'],
      studies: ['STD;Fib_Retracement'],
      show_popup_button: true,
      popup_width: '1000',
      popup_height: '650',
    })

    widgetContainer.appendChild(widgetDiv)
    widgetContainer.appendChild(script)
    containerRef.current.appendChild(widgetContainer)

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [selectedSymbol])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Symbol Selector Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#0b1220] border-b border-[#1a2840] flex-shrink-0">
        <div className="flex items-center gap-1.5 mr-2">
          <TrendingUp className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-[10px] font-bold tracking-widest text-slate-600 uppercase">
            {isAr ? 'الرسم البياني' : 'Chart'}
          </span>
        </div>

        {/* Symbol pills */}
        <div className="flex items-center gap-1">
          {CHART_SYMBOLS.map((sym) => (
            <button
              key={sym.value}
              onClick={() => setSelectedSymbol(sym)}
              className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-all ${
                selectedSymbol.value === sym.value
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-[#141d2e] border border-transparent'
              }`}
            >
              {sym.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3 text-[9px] text-slate-600">
          <span className="flex items-center gap-1">
            <span className="w-2 h-0.5 bg-amber-500/60 rounded" />
            Fib
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-0.5 bg-blue-500/60 rounded" />
            EMA
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-0.5 bg-violet-500/60 rounded" />
            ICT
          </span>
        </div>
      </div>

      {/* TradingView Chart */}
      <div className="flex-1 min-h-0 relative bg-[#080d16]" ref={containerRef} />

      {/* Bottom Stats Strip */}
      <div className="flex-shrink-0 border-t border-[#1a2840] bg-[#0b1220]">
        <div className="grid grid-cols-4 divide-x divide-[#1a2840]">
          <StripStat
            icon={BarChart3}
            label={isAr ? 'المؤشرات المدعومة' : 'Supported Indices'}
            value="SPX · NDX · VIX · DJI"
            iconColor="text-blue-500"
          />
          <StripStat
            icon={Layers}
            label={isAr ? 'أدوات التحليل' : 'Analysis Tools'}
            value={isAr ? 'إليوت · ICT · فيب' : 'Elliott · ICT · Fib'}
            iconColor="text-amber-500"
          />
          <StripStat
            icon={Target}
            label={isAr ? 'مستويات السيولة' : 'Liquidity Levels'}
            value={isAr ? 'دعم · مقاومة · منطقة' : 'Support · Resistance · Zone'}
            iconColor="text-emerald-500"
          />
          <StripStat
            icon={Zap}
            label={isAr ? 'الإطارات الزمنية' : 'Timeframes'}
            value="1D · 4H · 1H · 15M"
            iconColor="text-violet-500"
          />
        </div>
      </div>
    </div>
  )
}

function StripStat({
  icon: Icon,
  label,
  value,
  iconColor,
}: {
  icon: React.ElementType
  label: string
  value: string
  iconColor: string
}) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5">
      <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${iconColor}`} />
      <div className="min-w-0">
        <p className="text-[9px] text-slate-600 uppercase tracking-wider truncate">{label}</p>
        <p className="text-[10px] text-slate-400 font-medium truncate">{value}</p>
      </div>
    </div>
  )
}
