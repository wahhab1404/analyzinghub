'use client'

/**
 * components/spx/SettingsPanel.tsx
 *
 * Premium settings panel for the SPX intelligence engine.
 * Allows Analyzer/SuperAdmin users to configure all engine parameters.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Cpu, Target, Filter, Calendar, Layers, Zap, Activity, Bell,
  Clock, Timer, Database, Play, ChevronDown, ChevronRight, Save,
  Loader2, AlertCircle, CheckCircle2, Bot,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SPXSettings {
  engineEnabled: boolean
  paperMode: boolean
  minScoreToAlert: number
  minScoreToTrade: number
  minDelta: number
  maxDelta: number
  maxSpreadPct: number
  minOI: number
  minVolume: number
  prefer0DTE: boolean
  prefer1DTE: boolean
  preferWeekly: boolean
  maxDTE: number
  wallStrengthThreshold: number
  wallDistanceThreshold: number
  minShockSeverity: string
  minShockScore: number
  flowAnomalySensitivity: number
  telegramEnabled: boolean
  telegramSendSignals: boolean
  telegramSendShock: boolean
  telegramSendWall: boolean
  telegramSendTrade: boolean
  dedupNewSignalS: number
  dedupShockWarningS: number
  dedupWallAlertS: number
  dedupExitAlertS: number
  activeHourStart: number
  activeHourEnd: number
  premiumSource: string
  staleDataThresholdS: number
  replaySpeed: number
  replayDefaultDaysBack: number
  // Auto-Trade
  autoTradeEnabled: boolean
  autoTradeMaxPremium: number
  autoTradeMinLiquidity: number
  autoTradeMinConfidenceClass: string
  autoTradeChannelIds: string[]
  autoTradeTrackLifecycle: boolean
  updatedAt: string
  updatedBy: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHour(h: number): string {
  if (h === 0) return '12:00 AM'
  if (h < 12) return `${h}:00 AM`
  if (h === 12) return '12:00 PM'
  return `${h - 12}:00 PM`
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    })
  } catch {
    return iso
  }
}

function secsToMins(s: number): string {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Toggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!value)}
      className={`relative cursor-pointer w-10 h-5 rounded-full border transition-colors flex-shrink-0 ${
        value
          ? 'bg-emerald-500 border-emerald-400/50'
          : 'bg-slate-700 border-slate-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          value ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function ChangedDot() {
  return <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved change" />
}

function SectionCard({
  icon: Icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: React.ElementType
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-[#1a2840] bg-[#070e1a] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#0d1726]/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{title}</span>
        </div>
        {open
          ? <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
          : <ChevronRight className="h-3.5 w-3.5 text-slate-500" />}
      </button>
      {open && <div className="px-4 pb-4 border-t border-[#1a2840]">{children}</div>}
    </div>
  )
}

function FieldRow({
  label,
  changed,
  children,
}: {
  label: string
  changed?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-slate-500">{label}</span>
        {changed && <ChangedDot />}
      </div>
      {children}
    </div>
  )
}

function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  changed,
  onChange,
  format,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  changed?: boolean
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <FieldRow label={label} changed={changed}>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="flex-1 h-1.5 rounded-full accent-blue-500 bg-[#1a2840] appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #3b82f6 ${pct}%, #1a2840 ${pct}%)`,
          }}
        />
        <span className="text-[11px] font-mono text-slate-300 w-12 text-right">
          {format ? format(value) : value}
        </span>
      </div>
    </FieldRow>
  )
}

function NumberInput({
  label,
  value,
  changed,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string
  value: number
  changed?: boolean
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
}) {
  return (
    <FieldRow label={label} changed={changed}>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="bg-[#0d1726] border border-[#1a2840] text-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50 w-full font-mono"
        />
        {suffix && <span className="text-[11px] text-slate-500 flex-shrink-0">{suffix}</span>}
      </div>
    </FieldRow>
  )
}

function ToggleField({
  label,
  value,
  changed,
  onChange,
  disabled,
}: {
  label: string
  value: boolean
  changed?: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-slate-400">{label}</span>
        {changed && <ChangedDot />}
      </div>
      <Toggle value={value} onChange={onChange} disabled={disabled} />
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-[#1a2840] bg-[#070e1a] h-14" />
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface TelegramChannel {
  id: string
  chatId: string
  name: string
  audience: string
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState<SPXSettings | null>(null)
  const [draft, setDraft] = useState<SPXSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [telegramChannels, setTelegramChannels] = useState<TelegramChannel[]>([])

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/spx/settings').then(r => r.json()),
      fetch('/api/spx/telegram-channels').then(r => r.json()).catch(() => ({ channels: [] })),
    ])
      .then(([settingsJson, channelsJson]) => {
        const s = settingsJson.settings ?? settingsJson
        setSettings(s)
        setDraft(JSON.parse(JSON.stringify(s)))
        setTelegramChannels(channelsJson?.channels ?? [])
      })
      .catch(() => setStatus({ type: 'error', message: 'Failed to load settings.' }))
      .finally(() => setLoading(false))
  }, [])

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!draft) return
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch('/api/spx/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      const updated: SPXSettings = json.settings ?? json
      setSettings(updated)
      setDraft(JSON.parse(JSON.stringify(updated)))
      setStatus({ type: 'success', message: 'Settings saved successfully.' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setStatus({ type: 'error', message: `Save failed: ${msg}` })
    } finally {
      setSaving(false)
      setTimeout(() => setStatus(null), 4000)
    }
  }, [draft])

  // ── Helpers ────────────────────────────────────────────────────────────────
  function set<K extends keyof SPXSettings>(key: K, value: SPXSettings[K]) {
    setDraft(prev => prev ? { ...prev, [key]: value } : prev)
  }

  function changed<K extends keyof SPXSettings>(key: K): boolean {
    if (!settings || !draft) return false
    return settings[key] !== draft[key]
  }

  const hasChanges = settings && draft
    ? (Object.keys(draft) as Array<keyof SPXSettings>).some(k => {
        const a = draft[k]; const b = settings[k]
        if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) !== JSON.stringify(b)
        return a !== b
      })
    : false

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Engine Settings</span>
        <Loader2 className="h-3.5 w-3.5 text-slate-500 animate-spin" />
      </div>
      <Skeleton />
    </div>
  )

  if (!draft) return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-center gap-2 text-red-400 text-sm">
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      Failed to load settings. Please refresh.
    </div>
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Engine Settings</span>
          {hasChanges && (
            <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full px-2 py-0.5 text-[10px] font-medium">
              Unsaved Changes
            </span>
          )}
        </div>
      </div>

      {/* Status banner */}
      {status && (
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
          status.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          {status.type === 'success'
            ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
            : <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />}
          {status.message}
        </div>
      )}

      {/* ── Section 1: Engine Controls ── */}
      <SectionCard icon={Cpu} title="Engine Controls" defaultOpen>
        <div className="mt-3 space-y-1">
          <ToggleField
            label="Engine Enabled"
            value={draft.engineEnabled}
            changed={changed('engineEnabled')}
            onChange={v => set('engineEnabled', v)}
          />
          <ToggleField
            label="Paper Mode (no live orders)"
            value={draft.paperMode}
            changed={changed('paperMode')}
            onChange={v => set('paperMode', v)}
          />
        </div>
      </SectionCard>

      {/* ── Section 2: Score Thresholds ── */}
      <SectionCard icon={Target} title="Score Thresholds" defaultOpen>
        <div className="mt-3 grid grid-cols-1 gap-4">
          <SliderField
            label="Min Score to Alert"
            value={draft.minScoreToAlert}
            min={0} max={100}
            changed={changed('minScoreToAlert')}
            onChange={v => set('minScoreToAlert', v)}
            format={v => `${v}`}
          />
          <SliderField
            label="Min Score to Trade"
            value={draft.minScoreToTrade}
            min={0} max={100}
            changed={changed('minScoreToTrade')}
            onChange={v => set('minScoreToTrade', v)}
            format={v => `${v}`}
          />
        </div>
      </SectionCard>

      {/* ── Section 3: Contract Filters ── */}
      <SectionCard icon={Filter} title="Contract Filters">
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberInput
            label="Min Delta"
            value={draft.minDelta}
            changed={changed('minDelta')}
            onChange={v => set('minDelta', v)}
            min={0} max={1} step={0.01}
          />
          <NumberInput
            label="Max Delta"
            value={draft.maxDelta}
            changed={changed('maxDelta')}
            onChange={v => set('maxDelta', v)}
            min={0} max={1} step={0.01}
          />
          <NumberInput
            label="Max Spread %"
            value={draft.maxSpreadPct}
            changed={changed('maxSpreadPct')}
            onChange={v => set('maxSpreadPct', v)}
            min={0} step={0.1} suffix="%"
          />
          <NumberInput
            label="Min Open Interest"
            value={draft.minOI}
            changed={changed('minOI')}
            onChange={v => set('minOI', v)}
            min={0}
          />
          <NumberInput
            label="Min Volume"
            value={draft.minVolume}
            changed={changed('minVolume')}
            onChange={v => set('minVolume', v)}
            min={0}
          />
        </div>
      </SectionCard>

      {/* ── Section 4: Expiry Preferences ── */}
      <SectionCard icon={Calendar} title="Expiry Preferences">
        <div className="mt-3 space-y-1">
          <ToggleField
            label="Prefer 0DTE"
            value={draft.prefer0DTE}
            changed={changed('prefer0DTE')}
            onChange={v => set('prefer0DTE', v)}
          />
          <ToggleField
            label="Prefer 1DTE"
            value={draft.prefer1DTE}
            changed={changed('prefer1DTE')}
            onChange={v => set('prefer1DTE', v)}
          />
          <ToggleField
            label="Prefer Weekly"
            value={draft.preferWeekly}
            changed={changed('preferWeekly')}
            onChange={v => set('preferWeekly', v)}
          />
          <div className="pt-2">
            <NumberInput
              label="Max DTE"
              value={draft.maxDTE}
              changed={changed('maxDTE')}
              onChange={v => set('maxDTE', v)}
              min={0} max={365} suffix="days"
            />
          </div>
        </div>
      </SectionCard>

      {/* ── Section 5: Wall Sensitivity ── */}
      <SectionCard icon={Layers} title="Wall Sensitivity">
        <div className="mt-3 grid grid-cols-1 gap-4">
          <SliderField
            label="Wall Strength Threshold"
            value={draft.wallStrengthThreshold}
            min={0} max={100}
            changed={changed('wallStrengthThreshold')}
            onChange={v => set('wallStrengthThreshold', v)}
          />
          <NumberInput
            label="Wall Distance Threshold"
            value={draft.wallDistanceThreshold}
            changed={changed('wallDistanceThreshold')}
            onChange={v => set('wallDistanceThreshold', v)}
            min={0} step={0.5}
          />
        </div>
      </SectionCard>

      {/* ── Section 6: Shock Detection ── */}
      <SectionCard icon={Zap} title="Shock Detection">
        <div className="mt-3 grid grid-cols-2 gap-3">
          <FieldRow label="Min Shock Severity" changed={changed('minShockSeverity')}>
            <select
              value={draft.minShockSeverity}
              onChange={e => set('minShockSeverity', e.target.value)}
              className="bg-[#0d1726] border border-[#1a2840] text-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50 w-full"
            >
              <option value="mild">Mild</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
              <option value="extreme">Extreme</option>
            </select>
          </FieldRow>
          <div />
        </div>
        <div className="mt-3">
          <SliderField
            label="Min Shock Score"
            value={draft.minShockScore}
            min={0} max={100}
            changed={changed('minShockScore')}
            onChange={v => set('minShockScore', v)}
          />
        </div>
      </SectionCard>

      {/* ── Section 7: Flow Anomaly ── */}
      <SectionCard icon={Activity} title="Flow Anomaly">
        <div className="mt-3">
          <SliderField
            label="Flow Anomaly Sensitivity"
            value={draft.flowAnomalySensitivity}
            min={0.1} max={3.0} step={0.1}
            changed={changed('flowAnomalySensitivity')}
            onChange={v => set('flowAnomalySensitivity', parseFloat(v.toFixed(1)))}
            format={v => v.toFixed(1)}
          />
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-slate-600">
          <span>0.1 · Very sensitive</span>
          <span>3.0 · Least sensitive</span>
        </div>
      </SectionCard>

      {/* ── Section 8: Telegram Alerts ── */}
      <SectionCard icon={Bell} title="Telegram Alerts">
        <div className="mt-3 space-y-1">
          <ToggleField
            label="Telegram Enabled"
            value={draft.telegramEnabled}
            changed={changed('telegramEnabled')}
            onChange={v => set('telegramEnabled', v)}
          />
          <div className={`pl-3 border-l border-[#1a2840] space-y-1 mt-2 ${!draft.telegramEnabled ? 'opacity-40 pointer-events-none' : ''}`}>
            <ToggleField
              label="Send Signals"
              value={draft.telegramSendSignals}
              changed={changed('telegramSendSignals')}
              onChange={v => set('telegramSendSignals', v)}
              disabled={!draft.telegramEnabled}
            />
            <ToggleField
              label="Send Shock Alerts"
              value={draft.telegramSendShock}
              changed={changed('telegramSendShock')}
              onChange={v => set('telegramSendShock', v)}
              disabled={!draft.telegramEnabled}
            />
            <ToggleField
              label="Send Wall Alerts"
              value={draft.telegramSendWall}
              changed={changed('telegramSendWall')}
              onChange={v => set('telegramSendWall', v)}
              disabled={!draft.telegramEnabled}
            />
            <ToggleField
              label="Send Trade Alerts"
              value={draft.telegramSendTrade}
              changed={changed('telegramSendTrade')}
              onChange={v => set('telegramSendTrade', v)}
              disabled={!draft.telegramEnabled}
            />
          </div>
        </div>
      </SectionCard>

      {/* ── Section 9: Alert Deduplication ── */}
      <SectionCard icon={Clock} title="Alert Deduplication">
        <div className="mt-3 grid grid-cols-2 gap-3">
          <FieldRow label="New Signal Window" changed={changed('dedupNewSignalS')}>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={draft.dedupNewSignalS}
                min={0}
                onChange={e => set('dedupNewSignalS', parseInt(e.target.value) || 0)}
                className="bg-[#0d1726] border border-[#1a2840] text-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50 w-full font-mono"
              />
              <span className="text-[10px] text-slate-500 w-10 flex-shrink-0">{secsToMins(draft.dedupNewSignalS)}</span>
            </div>
          </FieldRow>
          <FieldRow label="Shock Warning Window" changed={changed('dedupShockWarningS')}>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={draft.dedupShockWarningS}
                min={0}
                onChange={e => set('dedupShockWarningS', parseInt(e.target.value) || 0)}
                className="bg-[#0d1726] border border-[#1a2840] text-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50 w-full font-mono"
              />
              <span className="text-[10px] text-slate-500 w-10 flex-shrink-0">{secsToMins(draft.dedupShockWarningS)}</span>
            </div>
          </FieldRow>
          <FieldRow label="Wall Alert Window" changed={changed('dedupWallAlertS')}>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={draft.dedupWallAlertS}
                min={0}
                onChange={e => set('dedupWallAlertS', parseInt(e.target.value) || 0)}
                className="bg-[#0d1726] border border-[#1a2840] text-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50 w-full font-mono"
              />
              <span className="text-[10px] text-slate-500 w-10 flex-shrink-0">{secsToMins(draft.dedupWallAlertS)}</span>
            </div>
          </FieldRow>
          <FieldRow label="Exit Alert Window" changed={changed('dedupExitAlertS')}>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={draft.dedupExitAlertS}
                min={0}
                onChange={e => set('dedupExitAlertS', parseInt(e.target.value) || 0)}
                className="bg-[#0d1726] border border-[#1a2840] text-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50 w-full font-mono"
              />
              <span className="text-[10px] text-slate-500 w-10 flex-shrink-0">{secsToMins(draft.dedupExitAlertS)}</span>
            </div>
          </FieldRow>
        </div>
        <p className="mt-2 text-[10px] text-slate-600">Values in seconds. Display shows equivalent in minutes.</p>
      </SectionCard>

      {/* ── Section 10: Active Hours ── */}
      <SectionCard icon={Timer} title="Active Hours (ET)">
        <div className="mt-3 grid grid-cols-2 gap-3">
          <FieldRow label="Start Hour" changed={changed('activeHourStart')}>
            <select
              value={draft.activeHourStart}
              onChange={e => set('activeHourStart', parseInt(e.target.value))}
              className="bg-[#0d1726] border border-[#1a2840] text-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50 w-full"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{formatHour(i)}</option>
              ))}
            </select>
          </FieldRow>
          <FieldRow label="End Hour" changed={changed('activeHourEnd')}>
            <select
              value={draft.activeHourEnd}
              onChange={e => set('activeHourEnd', parseInt(e.target.value))}
              className="bg-[#0d1726] border border-[#1a2840] text-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50 w-full"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{formatHour(i)}</option>
              ))}
            </select>
          </FieldRow>
        </div>
        <div className="mt-2 text-[10px] text-slate-600">
          Engine will only generate signals during: {formatHour(draft.activeHourStart)} – {formatHour(draft.activeHourEnd)} ET
        </div>
      </SectionCard>

      {/* ── Section 11: Data Sources ── */}
      <SectionCard icon={Database} title="Data Sources">
        <div className="mt-3 grid grid-cols-2 gap-3">
          <FieldRow label="Premium Source" changed={changed('premiumSource')}>
            <select
              value={draft.premiumSource}
              onChange={e => set('premiumSource', e.target.value)}
              className="bg-[#0d1726] border border-[#1a2840] text-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50 w-full"
            >
              <option value="polygon">Polygon</option>
              <option value="cboe">CBOE</option>
              <option value="manual">Manual</option>
              <option value="tradier">Tradier</option>
              <option value="alpaca">Alpaca</option>
              <option value="simulated">Simulated</option>
            </select>
          </FieldRow>
          <NumberInput
            label="Stale Data Threshold"
            value={draft.staleDataThresholdS}
            changed={changed('staleDataThresholdS')}
            onChange={v => set('staleDataThresholdS', v)}
            min={0} suffix="sec"
          />
        </div>
      </SectionCard>

      {/* ── Section 12: Replay Defaults ── */}
      <SectionCard icon={Play} title="Replay Defaults">
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberInput
            label="Replay Speed"
            value={draft.replaySpeed}
            changed={changed('replaySpeed')}
            onChange={v => set('replaySpeed', v)}
            min={0.1} max={100} step={0.1} suffix="×"
          />
          <NumberInput
            label="Default Days Back"
            value={draft.replayDefaultDaysBack}
            changed={changed('replayDefaultDaysBack')}
            onChange={v => set('replayDefaultDaysBack', v)}
            min={1} max={90} suffix="days"
          />
        </div>
      </SectionCard>

      {/* ── Section 13: Auto Trading ── */}
      <SectionCard icon={Bot} title="Auto Trading" defaultOpen>
        <FieldRow label="Enable Auto Trading">
          <Toggle value={draft?.autoTradeEnabled ?? false} onChange={v => set('autoTradeEnabled', v)} />
        </FieldRow>
        <FieldRow label="Track Lifecycle">
          <Toggle value={draft?.autoTradeTrackLifecycle ?? true} onChange={v => set('autoTradeTrackLifecycle', v)} />
        </FieldRow>
        <FieldRow label="Max Premium ($)">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0.1} max={50} step={0.1}
              value={draft?.autoTradeMaxPremium ?? 4}
              onChange={e => set('autoTradeMaxPremium', parseFloat(e.target.value))}
              className="w-20 bg-[#070e1a] border border-[#1a2840] rounded-lg px-2.5 py-1.5 text-xs text-white tabular-nums text-right focus:outline-none focus:border-blue-500"
            />
            <span className={`text-xs font-medium ${changed('autoTradeMaxPremium') ? 'text-amber-400' : 'text-slate-500'}`}>
              ${draft?.autoTradeMaxPremium?.toFixed(2) ?? '4.00'}
            </span>
          </div>
        </FieldRow>
        <FieldRow label="Min Liquidity Score">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0} max={100} step={5}
              value={draft?.autoTradeMinLiquidity ?? 60}
              onChange={e => set('autoTradeMinLiquidity', parseFloat(e.target.value))}
              className="w-20 bg-[#070e1a] border border-[#1a2840] rounded-lg px-2.5 py-1.5 text-xs text-white tabular-nums text-right focus:outline-none focus:border-blue-500"
            />
            <span className={`text-xs font-medium ${changed('autoTradeMinLiquidity') ? 'text-amber-400' : 'text-slate-500'}`}>
              {draft?.autoTradeMinLiquidity ?? 60}/100
            </span>
          </div>
        </FieldRow>
        <FieldRow label="Min Confidence Class">
          <select
            value={draft?.autoTradeMinConfidenceClass ?? 'B'}
            onChange={e => set('autoTradeMinConfidenceClass', e.target.value as any)}
            className="bg-[#070e1a] border border-[#1a2840] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            {['A', 'B', 'C', 'D', 'E'].map(c => (
              <option key={c} value={c}>Class {c}{c === 'A' ? ' (Strongest)' : c === 'E' ? ' (Weakest)' : ''}</option>
            ))}
          </select>
        </FieldRow>

        {/* Telegram Channel Selector */}
        <div className="pt-1">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Telegram Channels for Auto-Trade Alerts
          </div>
          {telegramChannels.length === 0 ? (
            <p className="text-xs text-slate-600 italic">No enabled Telegram channels found. Add channels in your account settings first.</p>
          ) : (
            <div className="space-y-2">
              {telegramChannels.map(ch => {
                const selected = (draft?.autoTradeChannelIds ?? []).includes(ch.chatId)
                return (
                  <label key={ch.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${selected ? 'border-violet-500/40 bg-violet-500/5' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10'}`}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {
                        const current = draft?.autoTradeChannelIds ?? []
                        set('autoTradeChannelIds', selected
                          ? current.filter(id => id !== ch.chatId)
                          : [...current, ch.chatId]
                        )
                      }}
                      className="w-3.5 h-3.5 accent-violet-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-200 truncate">{ch.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{ch.chatId}</div>
                    </div>
                    <span className="text-[10px] text-slate-600 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full capitalize">{ch.audience}</span>
                  </label>
                )
              })}
            </div>
          )}
          {(draft?.autoTradeChannelIds?.length ?? 0) > 0 && (
            <p className="text-[10px] text-violet-400 mt-2">
              {draft?.autoTradeChannelIds?.length} channel{(draft?.autoTradeChannelIds?.length ?? 0) > 1 ? 's' : ''} selected — auto-trade alerts will only go to these channels.
            </p>
          )}
        </div>
      </SectionCard>

      {/* ── Save Button ── */}
      <div className="pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-[12px] font-medium transition-colors ${
            hasChanges && !saving
              ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-500'
              : 'bg-[#0d1726] border-[#1a2840] text-slate-500 cursor-not-allowed'
          }`}
        >
          {saving
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
            : <><Save className="h-3.5 w-3.5" /> Save Changes</>}
        </button>
      </div>

      {/* ── Footer ── */}
      {settings && (
        <div className="text-center text-[10px] text-slate-600 pb-2">
          Last updated{settings.updatedBy ? ` by ${settings.updatedBy}` : ''}{' '}
          at {formatDateTime(settings.updatedAt)}
        </div>
      )}

    </div>
  )
}
