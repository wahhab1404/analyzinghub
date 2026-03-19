'use client'

import {
  Activity,
  Zap,
  Target,
  Newspaper,
  TrendingUp,
  TrendingDown,
  BarChart2,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { usePanelData } from '@/hooks/use-panel-data'
import type { RecentTradeItem, PulseItem } from '@/app/api/indices/panel-data/route'

interface RightPanelProps {
  language: string
  symbol?: string
}

// ─── Formatters ───────────────────────────────────────────────────────────────

/** Format a price for display. ≥1000 → no decimals, else 2 decimals */
function fmtPrice(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return '—'
  return v >= 1000 ? v.toFixed(0) : v.toFixed(2)
}

/** Format volume compactly: 1_234_567 → "1.2M" */
function fmtVol(v: number | null | undefined): string {
  if (v == null) return '—'
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return v.toString()
}

/** Format P/C ratio */
function fmtRatio(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toFixed(2)
}

/** Format a profit percentage with sign */
function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—'
  const sign = v >= 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}%`
}

/** Format a relative timestamp, e.g. "2m ago" */
function fmtAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/** Format a time string for the "last updated" footer */
function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  }) + ' ET'
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RightPanel({ language, symbol = 'SPX' }: RightPanelProps) {
  const isAr = language === 'ar'
  const { data, loading, error, lastUpdated, refresh } = usePanelData(symbol)

  // Derived sentiment values
  const bullScore = data?.sentiment.bullScore ?? 50
  const trendBias = data?.sentiment.trendBias ?? null
  const fearGreedValue = data?.sentiment.fearGreedValue
  const fearGreedLabel = data?.sentiment.fearGreedLabel
  const volatility = data?.sentiment.volatility

  // Trend bias display
  const biasLabel = isAr
    ? (trendBias === 'BULLISH' ? 'صاعد' : trendBias === 'BEARISH' ? 'هابط' : 'محايد')
    : (trendBias ?? '—')
  const biasColor =
    trendBias === 'BULLISH' ? 'text-emerald-400' :
    trendBias === 'BEARISH' ? 'text-red-400' :
    'text-slate-400'
  const BiasIcon =
    trendBias === 'BULLISH' ? ArrowUpRight :
    trendBias === 'BEARISH' ? ArrowDownRight :
    Minus

  // Fear/Greed color
  const fgColor =
    (fearGreedValue ?? 50) >= 56 ? 'text-emerald-400' :
    (fearGreedValue ?? 50) <= 43 ? 'text-red-400' :
    'text-slate-400'

  const opts = data?.optionsFlow
  const kl = data?.keyLevels
  const pulse: PulseItem[] = data?.pulse ?? []
  const recent: RecentTradeItem[] = data?.recentTrades ?? []

  return (
    <div className="hidden xl:flex w-[256px] flex-shrink-0 bg-[#0b1220] border-l border-[#1a2840] flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-[#1a2840] scrollbar-track-transparent">

      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-[#1a2840] flex-shrink-0">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-[10px] font-bold tracking-[0.18em] text-slate-600 uppercase">
            {isAr ? 'استخبارات السوق' : 'Market Intel'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono text-slate-700 bg-[#141d2e] px-1.5 py-0.5 rounded border border-[#1a2840]">
            {symbol}
          </span>
          <button
            onClick={refresh}
            disabled={loading}
            title="Refresh"
            className="text-slate-700 hover:text-slate-400 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error banner — only shown on total failure */}
      {error && !data && (
        <div className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 border-b border-red-500/20">
          <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
          <span className="text-[9px] text-red-400 leading-tight">
            {isAr ? 'فشل تحميل البيانات' : 'Failed to load data'}
          </span>
        </div>
      )}

      {/* ── MARKET SENTIMENT ─────────────────────────────────────────────── */}
      <PanelSection
        title={isAr ? 'مزاج السوق' : 'Market Sentiment'}
        icon={Activity}
        iconColor="text-blue-500"
        loading={loading && !data}
      >
        <div className="space-y-2.5">
          {/* Trend Bias */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500">
              {isAr ? 'التحيز العام' : 'Trend Bias'}
            </span>
            <span className={`text-[10px] font-bold flex items-center gap-1 ${biasColor}`}>
              <BiasIcon className="w-3 h-3" />
              {biasLabel}
            </span>
          </div>

          {/* Bull/Bear bar */}
          <div className="relative w-full bg-[#1a2840] rounded-full h-1.5 overflow-hidden">
            <div
              className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${
                bullScore >= 50
                  ? 'bg-gradient-to-r from-emerald-600 to-emerald-400'
                  : 'bg-gradient-to-r from-red-700 to-red-500'
              }`}
              style={{ width: `${bullScore}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-slate-700 font-medium">
            <span>{isAr ? 'هابط' : 'BEAR'}</span>
            <span className="text-slate-500 tabular-nums">{bullScore}%</span>
            <span>{isAr ? 'صاعد' : 'BULL'}</span>
          </div>

          {/* Fear/Greed + Volatility */}
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <MiniStat
              label={isAr ? 'خوف/طمع' : 'Fear/Greed'}
              value={
                fearGreedValue != null
                  ? `${fearGreedValue}`
                  : '—'
              }
              subLabel={fearGreedLabel ?? undefined}
              valueColor={fgColor}
            />
            <MiniStat
              label={isAr ? 'التقلب' : 'Volatility'}
              value={volatility ?? '—'}
              subLabel={volatility ? 'VIX' : undefined}
              valueColor={
                data?.sentiment.vix != null
                  ? data.sentiment.vix > 25 ? 'text-red-400'
                    : data.sentiment.vix > 18 ? 'text-amber-400'
                    : 'text-emerald-400'
                  : 'text-slate-400'
              }
            />
          </div>
        </div>
      </PanelSection>

      {/* ── OPTIONS FLOW ─────────────────────────────────────────────────── */}
      <PanelSection
        title={isAr ? 'تدفق الخيارات' : 'Options Flow'}
        icon={Zap}
        iconColor="text-amber-500"
        loading={loading && !data}
      >
        <div className="space-y-1.5">
          <FlowRow
            label={isAr ? 'حجم الشراء' : 'Call Vol'}
            value={fmtVol(opts?.callVol)}
            color="text-emerald-400"
            Icon={TrendingUp}
          />
          <FlowRow
            label={isAr ? 'حجم البيع' : 'Put Vol'}
            value={fmtVol(opts?.putVol)}
            color="text-red-400"
            Icon={TrendingDown}
          />
          <div className="h-px bg-[#1a2840] my-1" />
          <FlowRow
            label={isAr ? 'نسبة Put/Call' : 'P/C Ratio'}
            value={fmtRatio(opts?.pcRatio)}
            color={
              opts?.pcRatio != null
                ? opts.pcRatio > 1.2 ? 'text-red-400'
                  : opts.pcRatio < 0.8 ? 'text-emerald-400'
                  : 'text-slate-300'
                : 'text-slate-500'
            }
          />
          <FlowRow
            label={isAr ? 'OI غير عادي' : 'Unusual OI'}
            value={opts?.unusualOI ?? '—'}
            color="text-amber-400"
          />
          <FlowRow
            label={isAr ? 'جدار غاما' : 'Gamma Wall'}
            value={opts?.gammaWall != null ? fmtPrice(opts.gammaWall) : '—'}
            color="text-violet-400"
          />
        </div>
      </PanelSection>

      {/* ── KEY LEVELS ───────────────────────────────────────────────────── */}
      <PanelSection
        title={isAr ? 'مستويات رئيسية' : 'Key Levels'}
        icon={Target}
        iconColor="text-violet-500"
        loading={loading && !data}
      >
        <div className="space-y-2 font-mono">
          <LevelRow
            label={isAr ? 'مقاومة' : 'Resistance'}
            value={kl?.resistance != null ? fmtPrice(kl.resistance) : '—'}
            color="text-red-400"
            bg="bg-red-500/5"
            border="border-red-500/20"
          />
          <LevelRow
            label={isAr ? 'القيمة العادلة' : 'Fair Value'}
            value={kl?.fairValue != null ? fmtPrice(kl.fairValue) : '—'}
            color="text-blue-400"
            bg="bg-blue-500/5"
            border="border-blue-500/20"
          />
          <LevelRow
            label={isAr ? 'دعم' : 'Support'}
            value={kl?.support != null ? fmtPrice(kl.support) : '—'}
            color="text-emerald-400"
            bg="bg-emerald-500/5"
            border="border-emerald-500/20"
          />
          <LevelRow
            label={isAr ? 'منطقة سيولة' : 'Liquidity'}
            value={kl?.liquidity != null ? fmtPrice(kl.liquidity) : '—'}
            color="text-amber-400"
            bg="bg-amber-500/5"
            border="border-amber-500/20"
          />
        </div>
      </PanelSection>

      {/* ── MARKET PULSE ─────────────────────────────────────────────────── */}
      <PanelSection
        title={isAr ? 'نبض السوق' : 'Market Pulse'}
        icon={Newspaper}
        iconColor="text-slate-500"
        loading={loading && !data}
      >
        <div className="space-y-1.5 text-[10px]">
          {pulse.length > 0 ? (
            pulse.map(item => (
              <PulseRow key={item.id} item={item} isAr={isAr} />
            ))
          ) : (
            <div className="p-2.5 rounded bg-[#141d2e] border border-[#1a2840]">
              <p className="text-slate-500 leading-relaxed">
                {isAr
                  ? 'لا توجد صفقات نشطة حالياً.'
                  : 'No active trades at the moment.'}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between text-slate-700 text-[9px] pt-0.5">
            <span>{isAr ? 'آخر تحديث' : 'Last updated'}</span>
            <span className="font-mono">{fmtTime(lastUpdated)}</span>
          </div>
        </div>
      </PanelSection>

      {/* ── RECENT TRADES ────────────────────────────────────────────────── */}
      <PanelSection
        title={isAr ? 'آخر الصفقات' : 'Recent Trades'}
        icon={Activity}
        iconColor="text-emerald-500"
        loading={loading && !data}
      >
        {recent.length > 0 ? (
          <div className="space-y-1.5">
            {recent.map(trade => (
              <TradeRow key={trade.id} trade={trade} isAr={isAr} />
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-slate-600 text-center py-3">
            <TrendingUp className="w-6 h-6 mx-auto mb-2 opacity-20" />
            <p>{isAr ? 'لا توجد صفقات حديثة' : 'No recent trades'}</p>
          </div>
        )}
      </PanelSection>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PanelSection({
  title,
  icon: Icon,
  iconColor,
  children,
  loading,
}: {
  title: string
  icon: React.ElementType
  iconColor: string
  children: React.ReactNode
  loading?: boolean
}) {
  return (
    <div className="border-b border-[#1a2840] flex-shrink-0">
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-2">
        <Icon className={`w-3 h-3 ${iconColor}`} />
        <span className="text-[9px] font-bold tracking-[0.18em] text-slate-600 uppercase">
          {title}
        </span>
        {loading && (
          <RefreshCw className="w-2.5 h-2.5 text-slate-700 animate-spin ml-auto" />
        )}
      </div>
      <div className="px-4 pb-3">{children}</div>
    </div>
  )
}

function FlowRow({
  label,
  value,
  color,
  Icon,
}: {
  label: string
  value: string
  color: string
  Icon?: React.ElementType
}) {
  return (
    <div className="flex items-center justify-between text-[10px]">
      <span className="text-slate-600 flex items-center gap-1">
        {Icon && <Icon className={`w-2.5 h-2.5 ${color}`} />}
        {label}
      </span>
      <span className={`font-mono font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  )
}

function LevelRow({
  label,
  value,
  color,
  bg,
  border,
}: {
  label: string
  value: string
  color: string
  bg: string
  border: string
}) {
  return (
    <div className={`flex items-center justify-between px-2 py-1 rounded text-[10px] ${bg} border ${border}`}>
      <span className="text-slate-600">{label}</span>
      <span className={`font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  )
}

function MiniStat({
  label,
  value,
  subLabel,
  valueColor = 'text-slate-400',
}: {
  label: string
  value: string
  subLabel?: string
  valueColor?: string
}) {
  return (
    <div className="bg-[#141d2e] border border-[#1a2840] rounded p-1.5 text-center">
      <p className="text-[9px] text-slate-600 mb-0.5">{label}</p>
      <p className={`text-[10px] font-mono font-semibold tabular-nums ${valueColor}`}>{value}</p>
      {subLabel && (
        <p className="text-[8px] text-slate-700 mt-0.5 truncate">{subLabel}</p>
      )}
    </div>
  )
}

function PulseRow({ item, isAr }: { item: PulseItem; isAr: boolean }) {
  const isCall = item.optionType === 'call' || item.direction === 'call'
  const isPut = item.optionType === 'put' || item.direction === 'put'
  const dirColor = isCall ? 'text-emerald-400' : isPut ? 'text-red-400' : 'text-slate-400'
  const dirLabel = isCall ? (isAr ? 'شراء' : 'CALL') : isPut ? (isAr ? 'بيع' : 'PUT') : item.direction.toUpperCase()

  const pnlColor = item.profitPct != null
    ? item.profitPct >= 0 ? 'text-emerald-400' : 'text-red-400'
    : 'text-slate-500'

  return (
    <div className="p-2 rounded bg-[#141d2e] border border-[#1a2840] space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className={`text-[9px] font-bold ${dirColor}`}>{dirLabel}</span>
          <span className="text-[9px] text-slate-600">{item.symbol}</span>
          {item.strike && (
            <span className="text-[9px] text-slate-500 font-mono">@{item.strike}</span>
          )}
        </div>
        {item.profitPct != null && (
          <span className={`text-[9px] font-mono font-bold tabular-nums ${pnlColor}`}>
            {fmtPct(item.profitPct)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-[8px] text-slate-700">
        <span>
          {isAr ? 'دخول' : 'Entry'}: {item.entryPrice != null ? item.entryPrice.toFixed(2) : '—'}
        </span>
        <span>{fmtAgo(item.timestamp)}</span>
      </div>
    </div>
  )
}

function TradeRow({ trade, isAr }: { trade: RecentTradeItem; isAr: boolean }) {
  const isCall = trade.optionType === 'call' || trade.direction === 'call'
  const isPut = trade.optionType === 'put' || trade.direction === 'put'
  const dirColor = isCall ? 'text-emerald-400' : isPut ? 'text-red-400' : 'text-slate-400'
  const dirLabel = isCall ? (isAr ? 'شراء' : 'C') : isPut ? (isAr ? 'بيع' : 'P') : trade.direction.charAt(0).toUpperCase()

  const statusDot =
    trade.status === 'active' ? 'bg-emerald-500' :
    trade.status === 'tp_hit' ? 'bg-blue-500' :
    trade.status === 'sl_hit' ? 'bg-red-500' :
    'bg-slate-600'

  const pnlColor = trade.profitPct != null
    ? trade.profitPct >= 0 ? 'text-emerald-400' : 'text-red-400'
    : 'text-slate-600'

  return (
    <div className="flex items-center justify-between text-[10px] py-1 border-b border-[#1a2840] last:border-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot}`} />
        <span className={`font-bold ${dirColor}`}>{dirLabel}</span>
        <span className="text-slate-600 font-mono truncate">
          {trade.strike ? `${trade.strike}` : trade.symbol}
          {trade.expiry ? ` ${trade.expiry.slice(5)}` : ''}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {trade.profitPct != null ? (
          <span className={`font-mono text-[9px] tabular-nums ${pnlColor}`}>
            {fmtPct(trade.profitPct)}
          </span>
        ) : (
          <span className="font-mono text-[9px] text-slate-600">
            {trade.entryPrice != null ? `$${trade.entryPrice.toFixed(2)}` : '—'}
          </span>
        )}
      </div>
    </div>
  )
}
