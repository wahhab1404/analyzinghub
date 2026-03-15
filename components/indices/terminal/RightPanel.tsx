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
} from 'lucide-react'

interface RightPanelProps {
  language: string
}

export function RightPanel({ language }: RightPanelProps) {
  const isAr = language === 'ar'

  return (
    <div className="hidden xl:flex w-[256px] flex-shrink-0 bg-[#0b1220] border-l border-[#1a2840] flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-[#1a2840] scrollbar-track-transparent">
      {/* Panel Header */}
      <div className="flex items-center gap-2 px-4 h-10 border-b border-[#1a2840] flex-shrink-0">
        <BarChart2 className="w-3.5 h-3.5 text-slate-600" />
        <span className="text-[10px] font-bold tracking-[0.18em] text-slate-600 uppercase">
          {isAr ? 'استخبارات السوق' : 'Market Intel'}
        </span>
      </div>

      {/* Market Sentiment */}
      <PanelSection title="Market Sentiment" titleAr="مزاج السوق" icon={Activity} iconColor="text-blue-500">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500">{isAr ? 'التحيز العام' : 'Trend Bias'}</span>
            <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" />
              {isAr ? 'صاعد' : 'BULLISH'}
            </span>
          </div>
          {/* Sentiment bar */}
          <div className="relative w-full bg-[#1a2840] rounded-full h-1.5 overflow-hidden">
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
              style={{ width: '62%' }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-slate-700 font-medium">
            <span>{isAr ? 'هابط' : 'BEAR'}</span>
            <span className="text-slate-500">62%</span>
            <span>{isAr ? 'صاعد' : 'BULL'}</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <MiniStat label={isAr ? 'خوف/طمع' : 'Fear/Greed'} value="—" />
            <MiniStat label={isAr ? 'التقلب' : 'Volatility' } value="—" />
          </div>
        </div>
      </PanelSection>

      {/* Options Flow */}
      <PanelSection title="Options Flow" titleAr="تدفق الخيارات" icon={Zap} iconColor="text-amber-500">
        <div className="space-y-1.5">
          <FlowRow label={isAr ? 'حجم الشراء' : 'Call Vol'} value="—" color="text-emerald-400" Icon={TrendingUp} />
          <FlowRow label={isAr ? 'حجم البيع' : 'Put Vol'} value="—" color="text-red-400" Icon={TrendingDown} />
          <div className="h-px bg-[#1a2840] my-1" />
          <FlowRow label={isAr ? 'نسبة Put/Call' : 'P/C Ratio'} value="—" color="text-slate-300" />
          <FlowRow label={isAr ? 'OI غير عادي' : 'Unusual OI'} value="—" color="text-amber-400" />
          <FlowRow label={isAr ? 'جدار غاما' : 'Gamma Wall'} value="—" color="text-violet-400" />
        </div>
      </PanelSection>

      {/* Key Liquidity Levels */}
      <PanelSection title="Key Levels" titleAr="مستويات رئيسية" icon={Target} iconColor="text-violet-500">
        <div className="space-y-2 font-mono">
          <LevelRow
            label={isAr ? 'مقاومة' : 'Resistance'}
            value="—"
            color="text-red-400"
            bg="bg-red-500/5"
            border="border-red-500/20"
          />
          <LevelRow
            label={isAr ? 'القيمة العادلة' : 'Fair Value'}
            value="—"
            color="text-blue-400"
            bg="bg-blue-500/5"
            border="border-blue-500/20"
          />
          <LevelRow
            label={isAr ? 'دعم' : 'Support'}
            value="—"
            color="text-emerald-400"
            bg="bg-emerald-500/5"
            border="border-emerald-500/20"
          />
          <LevelRow
            label={isAr ? 'منطقة سيولة' : 'Liquidity'}
            value="—"
            color="text-amber-400"
            bg="bg-amber-500/5"
            border="border-amber-500/20"
          />
        </div>
      </PanelSection>

      {/* Market Pulse / News */}
      <PanelSection title="Market Pulse" titleAr="نبض السوق" icon={Newspaper} iconColor="text-slate-500">
        <div className="space-y-2 text-[10px]">
          <div className="p-2.5 rounded bg-[#141d2e] border border-[#1a2840]">
            <p className="text-slate-400 leading-relaxed">
              {isAr
                ? 'بيانات السوق تظهر عند وجود تداولات نشطة. انتقل إلى التحليلات أو التداولات لرؤية النشاط الحي.'
                : 'Market data appears when trades are active. Navigate to Analyses or Trades to see live activity.'}
            </p>
          </div>
          <div className="flex items-center justify-between text-slate-600 text-[9px]">
            <span>{isAr ? 'آخر تحديث' : 'Last updated'}</span>
            <span className="font-mono">—</span>
          </div>
        </div>
      </PanelSection>

      {/* Recent Trades summary placeholder */}
      <PanelSection title="Recent Trades" titleAr="آخر الصفقات" icon={Activity} iconColor="text-emerald-500">
        <div className="text-[10px] text-slate-600 text-center py-3">
          <TrendingUp className="w-6 h-6 mx-auto mb-2 opacity-20" />
          <p>{isAr ? 'لا توجد صفقات حديثة' : 'No recent trades'}</p>
          <p className="text-[9px] mt-1 text-slate-700">
            {isAr ? 'ابدأ تحليلاً جديداً' : 'Start a new analysis'}
          </p>
        </div>
      </PanelSection>
    </div>
  )
}

/* ── Sub-components ─────────────────────────────────── */

function PanelSection({
  title,
  titleAr,
  icon: Icon,
  iconColor,
  children,
}: {
  title: string
  titleAr: string
  icon: React.ElementType
  iconColor: string
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-[#1a2840] flex-shrink-0">
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-2">
        <Icon className={`w-3 h-3 ${iconColor}`} />
        <span className="text-[9px] font-bold tracking-[0.18em] text-slate-600 uppercase">{title}</span>
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#141d2e] border border-[#1a2840] rounded p-1.5 text-center">
      <p className="text-[9px] text-slate-600 mb-0.5">{label}</p>
      <p className="text-[10px] font-mono font-semibold text-slate-400">{value}</p>
    </div>
  )
}
