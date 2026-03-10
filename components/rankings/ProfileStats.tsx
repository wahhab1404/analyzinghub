'use client'

import { useEffect, useState } from 'react'
import { Trophy, TrendingUp, Target, Users, MessageSquare, Star, Repeat2, DollarSign, TrendingDown, Award, Zap } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/language-context'

// ── Tiny progress bar ────────────────────────────────────────────────────────
function ProgressBar({ value, color = '#3FB950' }: { value: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className="h-1 w-full rounded-full bg-muted/30 overflow-hidden mt-1.5">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

// ── Mini stat cell ────────────────────────────────────────────────────────────
function StatCell({ label, value, color = '#E6EDF3' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="text-base font-black num leading-tight" style={{ color }}>{value}</span>
    </div>
  )
}

// ── Panel wrapper ─────────────────────────────────────────────────────────────
function Panel({ title, icon: Icon, color = '#58A6FF', children }: {
  title: string; icon: any; color?: string; children: React.ReactNode
}) {
  return (
    <div className="bg-card border border-border rounded-sm overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <div className="h-6 w-6 rounded flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}18` }}>
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </div>
        <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

interface ProfileStatsProps { userId: string }

interface RankingData {
  analyst: {
    points: number; weeklyPoints: number; monthlyPoints: number
    rank: number | null; winRate: number; wins: number; losses: number
    closedAnalyses: number; targetHitsLast30Days: number; badges: any[]
  }
  trader: {
    points: number; weeklyPoints: number; monthlyPoints: number
    rank: number | null; likes: number; bookmarks: number; reposts: number
    comments: number; ratings: number; ratingAccuracy: number; badges: any[]
  }
}

interface TradingStats {
  total_closed_trades: number; winning_trades: number; losing_trades: number
  win_rate: number; total_profit: number; avg_win: number; avg_loss: number
  max_profit: number; max_loss: number
}

const usd = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })

const BADGE_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  diamond:  { color: '#79C0FF', bg: 'rgba(121,192,255,0.10)', border: 'rgba(121,192,255,0.30)' },
  platinum: { color: '#E6EDF3', bg: 'rgba(230,237,243,0.08)', border: 'rgba(230,237,243,0.25)' },
  gold:     { color: '#E3B341', bg: 'rgba(227,179,65,0.10)',  border: 'rgba(227,179,65,0.30)' },
  silver:   { color: '#8B949E', bg: 'rgba(139,148,158,0.10)', border: 'rgba(139,148,158,0.25)' },
  bronze:   { color: '#F78166', bg: 'rgba(247,129,102,0.10)', border: 'rgba(247,129,102,0.25)' },
}

export function ProfileStats({ userId }: ProfileStatsProps) {
  const { t } = useLanguage()
  const [data, setData] = useState<RankingData | null>(null)
  const [tradingStats, setTradingStats] = useState<TradingStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [userId])

  const loadData = async () => {
    try {
      const [rankingsRes, tradingRes] = await Promise.all([
        fetch(`/api/rankings/${userId}`),
        fetch(`/api/profiles/${userId}/trading-stats`),
      ])
      if (rankingsRes.ok) setData(await rankingsRes.json())
      if (tradingRes.ok)  setTradingStats(await tradingRes.json())
    } catch {}
    finally { setLoading(false) }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[80, 64, 56].map(h => (
          <div key={h} className={`h-${h} bg-muted/30 animate-pulse rounded-sm`} style={{ height: h * 4 }} />
        ))}
      </div>
    )
  }

  if (!data) return null

  const winColor = (rate: number) => rate >= 70 ? '#3FB950' : rate >= 50 ? '#E3B341' : '#F85149'

  return (
    <div className="space-y-3">

      {/* ── TRADING PERFORMANCE ────────────────────────────────────────────── */}
      {tradingStats && tradingStats.total_closed_trades > 0 && (
        <Panel title={t.profileStats.tradingPerformance} icon={DollarSign} color="#3FB950">

          {/* Win rate — featured */}
          <div className="mb-4">
            <div className="flex items-end justify-between mb-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {t.profileStats.winRate}
              </span>
              <span className="text-2xl font-black num" style={{ color: winColor(tradingStats.win_rate) }}>
                {tradingStats.win_rate}%
              </span>
            </div>
            <ProgressBar value={tradingStats.win_rate} color={winColor(tradingStats.win_rate)} />
          </div>

          {/* Top-line stats row */}
          <div className="grid grid-cols-3 gap-3 mb-4 pb-4 border-b border-border">
            <StatCell
              label={t.profileStats.totalProfit}
              value={`${tradingStats.total_profit >= 0 ? '+' : ''}${usd(tradingStats.total_profit)}`}
              color={tradingStats.total_profit >= 0 ? '#3FB950' : '#F85149'}
            />
            <StatCell label={t.profileStats.closedTrades} value={tradingStats.total_closed_trades} />
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                {t.profileStats.wlRatio}
              </span>
              <div className="flex items-baseline gap-0.5 mt-0.5">
                <span className="text-base font-black num text-emerald-500">{tradingStats.winning_trades}</span>
                <span className="text-xs text-muted-foreground">/</span>
                <span className="text-base font-black num text-red-500">{tradingStats.losing_trades}</span>
              </div>
            </div>
          </div>

          {/* Avg / Best / Worst */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: TrendingUp,   label: t.profileStats.avgWin,     value: usd(tradingStats.avg_win),              color: '#3FB950', bg: 'rgba(63,185,80,0.08)',  bd: 'rgba(63,185,80,0.20)'  },
              { icon: TrendingDown, label: t.profileStats.avgLoss,    value: usd(Math.abs(tradingStats.avg_loss)),    color: '#F85149', bg: 'rgba(248,81,73,0.08)',  bd: 'rgba(248,81,73,0.20)'  },
              { icon: Trophy,       label: t.profileStats.bestTrade,  value: usd(tradingStats.max_profit),            color: '#3FB950', bg: 'rgba(63,185,80,0.08)',  bd: 'rgba(63,185,80,0.20)'  },
              { icon: TrendingDown, label: t.profileStats.worstTrade, value: usd(Math.abs(tradingStats.max_loss)),    color: '#F85149', bg: 'rgba(248,81,73,0.08)',  bd: 'rgba(248,81,73,0.20)'  },
            ].map(item => {
              const Icon = item.icon
              return (
                <div key={item.label} className="flex items-center gap-2 px-2.5 py-2 rounded border"
                  style={{ background: item.bg, borderColor: item.bd }}>
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: item.color }} />
                  <div className="min-w-0">
                    <div className="text-xs font-bold num truncate" style={{ color: item.color }}>{item.value}</div>
                    <div className="text-[9px] text-muted-foreground truncate">{item.label}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {/* ── ANALYST PERFORMANCE ───────────────────────────────────────────── */}
      {data.analyst.points > 0 && (
        <Panel title={t.profileStats.analystPerformance} icon={TrendingUp} color="#58A6FF">

          {/* Rank + Win Rate hero row */}
          <div className="flex items-start justify-between mb-4 pb-4 border-b border-border">
            <div>
              <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                {t.profileStats.rank}
              </div>
              {data.analyst.rank
                ? (
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-[10px] font-bold text-muted-foreground">#</span>
                    <span className="text-3xl font-black text-primary num">{data.analyst.rank}</span>
                  </div>
                )
                : <span className="text-sm text-muted-foreground font-medium">{t.profileStats.unranked}</span>
              }
            </div>
            <div className="text-right">
              <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                {t.profileStats.winRate}
              </div>
              <span className="text-3xl font-black num" style={{ color: winColor(data.analyst.winRate) }}>
                {data.analyst.winRate.toFixed(1)}%
              </span>
              <ProgressBar value={data.analyst.winRate} color={winColor(data.analyst.winRate)} />
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            {[
              { icon: Users,  label: t.profileStats.closedAnalyses,      value: data.analyst.closedAnalyses,         color: '#E6EDF3' },
              { icon: Zap,    label: t.profileStats.weeklyPoints,         value: (data.analyst.weeklyPoints ?? 0).toLocaleString(), color: '#E3B341' },
              { icon: Target, label: t.profileStats.targetsHit30Days,     value: data.analyst.targetHitsLast30Days,   color: '#58A6FF' },
              { icon: Trophy, label: t.profileStats.totalPoints,          value: (data.analyst.points ?? 0).toLocaleString(), color: '#A371F7' },
            ].map(item => {
              const Icon = item.icon
              return (
                <div key={item.label} className="flex items-center gap-2 px-2.5 py-2 rounded bg-muted/20 border border-border">
                  <Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold num" style={{ color: item.color }}>{item.value}</div>
                    <div className="text-[9px] text-muted-foreground leading-tight">{item.label}</div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Badges */}
          {data.analyst.badges.length > 0 && (
            <div className="pt-3 border-t border-border">
              <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                {t.profileStats.achievements}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.analyst.badges.map((badge: any) => {
                  const bs = BADGE_STYLES[badge.badge_tier] || {}
                  return (
                    <span key={badge.badge_key}
                      className="text-[10px] font-bold px-2 py-0.5 rounded border"
                      style={{ color: bs.color, background: bs.bg, borderColor: bs.border }}>
                      {badge.badge_name}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </Panel>
      )}

      {/* ── ENGAGEMENT STATS ──────────────────────────────────────────────── */}
      {data.trader.points > 0 && (
        <Panel title={t.profileStats.engagementStats} icon={Users} color="#A371F7">

          {/* Points + Rank */}
          <div className="grid grid-cols-2 gap-3 mb-4 pb-4 border-b border-border">
            <StatCell label={t.profileStats.totalPoints} value={(data.trader.points ?? 0).toLocaleString()} color="#A371F7" />
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                {t.profileStats.rank}
              </span>
              {data.trader.rank
                ? <span className="text-base font-black text-primary num">#{data.trader.rank}</span>
                : <span className="text-xs text-muted-foreground">{t.profileStats.unranked}</span>
              }
            </div>
            {data.trader.ratings > 0 && (
              <StatCell
                label={t.profileStats.ratingAccuracy}
                value={`${data.trader.ratingAccuracy.toFixed(1)}%`}
                color="#58A6FF"
              />
            )}
            <StatCell label={t.profileStats.totalRatings} value={data.trader.ratings} />
          </div>

          {/* Activity row */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: MessageSquare, label: t.profileStats.comments,     value: data.trader.comments,               color: '#58A6FF' },
              { icon: Star,          label: t.profileStats.likes,         value: data.trader.likes,                  color: '#E3B341' },
              { icon: Repeat2,       label: t.profileStats.reposts,       value: data.trader.reposts,                color: '#3FB950' },
              { icon: Zap,           label: t.profileStats.weeklyPoints,  value: (data.trader.weeklyPoints ?? 0).toLocaleString(), color: '#A371F7' },
            ].map(item => {
              const Icon = item.icon
              return (
                <div key={item.label} className="flex items-center gap-2 px-2.5 py-2 rounded bg-muted/20 border border-border">
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: item.color }} />
                  <div className="min-w-0">
                    <div className="text-sm font-bold num" style={{ color: item.color }}>{item.value}</div>
                    <div className="text-[9px] text-muted-foreground leading-tight">{item.label}</div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Engagement badges */}
          {data.trader.badges.length > 0 && (
            <div className="pt-3 border-t border-border mt-3">
              <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                {t.profileStats.achievements}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.trader.badges.map((badge: any) => {
                  const bs = BADGE_STYLES[badge.badge_tier] || {}
                  return (
                    <span key={badge.badge_key}
                      className="text-[10px] font-bold px-2 py-0.5 rounded border"
                      style={{ color: bs.color, background: bs.bg, borderColor: bs.border }}>
                      {badge.badge_name}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}
