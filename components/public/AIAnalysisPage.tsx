'use client';

/**
 * AIAnalysisPage — Premium Public AI Analysis Component
 *
 * Renders a beautiful, mobile-first, dark-themed financial intelligence page
 * for all four analysis types: financial | technical | quick_summary | compare
 *
 * No login required.  Designed to feel like a premium fintech dashboard.
 */

import React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalysisRecord {
  slug:           string;
  analysis_type:  'financial' | 'technical' | 'quick_summary' | 'compare';
  ticker:         string;
  company_name:   string;
  market?:        string;
  language:       string;
  created_at:     string;
  result:         any;
}

interface Props {
  analysis: AnalysisRecord;
}

// ─── Top-level Router ─────────────────────────────────────────────────────────

export function AIAnalysisPage({ analysis }: Props) {
  switch (analysis.analysis_type) {
    case 'financial':     return <FinancialPage     analysis={analysis} />;
    case 'technical':     return <TechnicalPage     analysis={analysis} />;
    case 'quick_summary': return <QuickSummaryPage  analysis={analysis} />;
    case 'compare':       return <ComparePage       analysis={analysis} />;
    default:              return <FinancialPage     analysis={analysis} />;
  }
}

// ─── Shared Layout ────────────────────────────────────────────────────────────

function PageShell({ children, title, badge, ticker, date, market }: {
  children:  React.ReactNode;
  title:     string;
  badge:     string;
  ticker:    string;
  date:      string;
  market?:   string;
}) {
  const APP_URL = process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://analyzinghub.com';

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white font-sans">
      {/* ── Top nav bar ── */}
      <nav className="sticky top-0 z-50 bg-[#0d1424]/95 backdrop-blur-md border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href={APP_URL} className="flex items-center gap-2 text-white no-underline">
            <span className="text-[#4f8ef7] font-bold text-lg tracking-tight">AnalyzingHub</span>
          </a>
          <a
            href={APP_URL}
            className="text-xs font-medium bg-[#4f8ef7]/10 text-[#4f8ef7] border border-[#4f8ef7]/20 rounded-full px-3 py-1 hover:bg-[#4f8ef7]/20 transition-colors no-underline"
          >
            Open Platform →
          </a>
        </div>
      </nav>

      {/* ── Page header ── */}
      <header className="bg-gradient-to-b from-[#0d1424] to-[#0a0f1e] border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-xs font-semibold uppercase tracking-widest bg-[#4f8ef7]/15 text-[#4f8ef7] border border-[#4f8ef7]/20 rounded-full px-3 py-1">
                  {badge}
                </span>
                <span className="text-xs text-white/40">AI Generated</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-2">
                {title}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-white/50">
                <code className="bg-white/5 text-[#4f8ef7] px-2 py-0.5 rounded text-xs font-mono">{ticker}</code>
                {market && <span>{market}</span>}
                <span>{new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {children}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 mt-12 py-8">
        <div className="max-w-4xl mx-auto px-4 text-center text-xs text-white/30 space-y-2">
          <p>This AI analysis is for informational and educational purposes only. It does not constitute financial advice.</p>
          <p>Always conduct your own research and consult a licensed financial advisor before making investment decisions.</p>
          <p className="mt-3">
            <a href="https://analyzinghub.com" className="text-[#4f8ef7]/60 hover:text-[#4f8ef7] no-underline">analyzinghub.com</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function Card({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#0d1424] border border-white/8 rounded-2xl p-5 sm:p-6">
      {(title || icon) && (
        <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50 mb-4 flex items-center gap-2">
          {icon && <span>{icon}</span>}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

function MetricPill({ label, value, color }: { label: string; value: string; color?: string }) {
  const colorClass = color === 'green'  ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' :
                     color === 'red'    ? 'text-red-400 bg-red-400/10 border-red-400/20' :
                     color === 'yellow' ? 'text-amber-400 bg-amber-400/10 border-amber-400/20' :
                                          'text-[#4f8ef7] bg-[#4f8ef7]/10 border-[#4f8ef7]/20';
  return (
    <div className="flex flex-col gap-1 bg-white/3 border border-white/8 rounded-xl p-3">
      <span className="text-xs text-white/40 uppercase tracking-wide">{label}</span>
      <span className={`text-sm font-semibold border rounded-full px-2 py-0.5 w-fit ${colorClass}`}>{value}</span>
    </div>
  );
}

function ListItems({ items }: { items: string[] }) {
  if (!items?.length) return null;
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-white/75">
          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[#4f8ef7] flex-shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function StanceBadge({ stance }: { stance: string }) {
  const lower = (stance || '').toLowerCase();
  const color = lower.includes('bull') ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' :
                lower.includes('bear') ? 'bg-red-500/15 text-red-400 border-red-500/25' :
                lower.includes('caut') ? 'bg-amber-500/15 text-amber-400 border-amber-500/25' :
                                          'bg-blue-500/15 text-blue-400 border-blue-500/25';
  return (
    <span className={`inline-flex items-center text-xs font-semibold uppercase tracking-wider border rounded-full px-3 py-1 ${color}`}>
      {stance}
    </span>
  );
}

// ─── Financial Analysis Page ──────────────────────────────────────────────────

function FinancialPage({ analysis }: { analysis: AnalysisRecord }) {
  const r   = analysis.result || {};
  const co  = r.company_overview || {};

  return (
    <PageShell
      title={`${analysis.company_name} — AI Financial Analysis`}
      badge="Financial Analysis"
      ticker={analysis.ticker}
      date={analysis.created_at}
      market={analysis.market || r.market}
    >
      {/* Executive Summary */}
      <Card title="Executive Summary" icon="📋">
        <p className="text-base text-white/85 leading-relaxed">{r.executive_summary}</p>
        {r.investment_view?.stance && (
          <div className="mt-4 flex items-center gap-3">
            <span className="text-xs text-white/40">Investment Stance:</span>
            <StanceBadge stance={r.investment_view.stance} />
          </div>
        )}
      </Card>

      {/* Company Overview */}
      {(co.description || co.headquarters) && (
        <Card title="Company Overview" icon="🏢">
          {co.description && <p className="text-sm text-white/75 mb-4 leading-relaxed">{co.description}</p>}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {co.founded     && <MetricPill label="Founded"      value={co.founded} />}
            {co.headquarters && <MetricPill label="HQ"          value={co.headquarters} />}
            {co.employees   && <MetricPill label="Employees"    value={co.employees} />}
            {r.sector       && <MetricPill label="Sector"       value={r.sector} />}
          </div>
        </Card>
      )}

      {/* Key Metrics Row */}
      <Card title="Key Metrics" icon="📊">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {r.profitability_analysis?.gross_margin_pct   && <MetricPill label="Gross Margin"      value={r.profitability_analysis.gross_margin_pct} />}
          {r.profitability_analysis?.operating_margin_pct && <MetricPill label="Operating Margin"  value={r.profitability_analysis.operating_margin_pct} />}
          {r.valuation?.pe_ratio     && <MetricPill label="P/E Ratio"        value={r.valuation.pe_ratio} />}
          {r.valuation?.ev_ebitda    && <MetricPill label="EV/EBITDA"        value={r.valuation.ev_ebitda} />}
          {r.debt_leverage?.debt_to_equity && <MetricPill label="Debt / Equity" value={r.debt_leverage.debt_to_equity}
            color={parseFloat(r.debt_leverage.debt_to_equity) > 2 ? 'red' : 'green'} />}
          {r.liquidity?.current_ratio && <MetricPill label="Current Ratio" value={r.liquidity.current_ratio} />}
        </div>
      </Card>

      {/* Revenue Analysis */}
      {r.revenue_analysis && (
        <Card title="Revenue Analysis" icon="📈">
          <p className="text-sm text-white/75 leading-relaxed mb-3">{r.revenue_analysis.narrative}</p>
          {r.revenue_analysis.key_drivers?.length > 0 && (
            <>
              <p className="text-xs text-white/40 uppercase tracking-wide mb-2">Key Drivers</p>
              <ListItems items={r.revenue_analysis.key_drivers} />
            </>
          )}
        </Card>
      )}

      {/* Profitability + Margin */}
      {(r.profitability_analysis || r.margin_analysis) && (
        <div className="grid sm:grid-cols-2 gap-6">
          {r.profitability_analysis && (
            <Card title="Profitability" icon="💰">
              <p className="text-sm text-white/75 leading-relaxed">{r.profitability_analysis.narrative}</p>
            </Card>
          )}
          {r.margin_analysis && (
            <Card title="Margin Analysis" icon="📐">
              <p className="text-sm text-white/75 leading-relaxed mb-3">{r.margin_analysis.narrative}</p>
              {r.margin_analysis.trend && (
                <StanceBadge stance={
                  r.margin_analysis.trend === 'expanding' ? '📈 Expanding' :
                  r.margin_analysis.trend === 'compressing' ? '📉 Compressing' :
                  '➡️ Stable'
                } />
              )}
            </Card>
          )}
        </div>
      )}

      {/* Balance Sheet + Liquidity */}
      {(r.balance_sheet || r.liquidity) && (
        <div className="grid sm:grid-cols-2 gap-6">
          {r.balance_sheet && (
            <Card title="Balance Sheet" icon="🏦">
              <p className="text-sm text-white/75 leading-relaxed mb-3">{r.balance_sheet.narrative}</p>
              {r.balance_sheet.health && <StanceBadge stance={r.balance_sheet.health} />}
            </Card>
          )}
          {r.liquidity && (
            <Card title="Liquidity Position" icon="💧">
              <p className="text-sm text-white/75 leading-relaxed mb-3">{r.liquidity.narrative}</p>
              {r.liquidity.assessment && <StanceBadge stance={r.liquidity.assessment} />}
            </Card>
          )}
        </div>
      )}

      {/* Debt + Cash Flow */}
      {(r.debt_leverage || r.cash_flow) && (
        <div className="grid sm:grid-cols-2 gap-6">
          {r.debt_leverage && (
            <Card title="Debt & Leverage" icon="⚖️">
              <p className="text-sm text-white/75 leading-relaxed mb-3">{r.debt_leverage.narrative}</p>
              {r.debt_leverage.assessment && (
                <StanceBadge stance={r.debt_leverage.assessment} />
              )}
            </Card>
          )}
          {r.cash_flow && (
            <Card title="Cash Flow Quality" icon="🔄">
              <p className="text-sm text-white/75 leading-relaxed mb-3">{r.cash_flow.narrative}</p>
              {r.cash_flow.quality && <StanceBadge stance={r.cash_flow.quality} />}
            </Card>
          )}
        </div>
      )}

      {/* Valuation */}
      {r.valuation && (
        <Card title="Valuation Snapshot" icon="🎯">
          <p className="text-sm text-white/75 leading-relaxed mb-4">{r.valuation.narrative}</p>
          {r.valuation.assessment && <StanceBadge stance={r.valuation.assessment} />}
        </Card>
      )}

      {/* Strengths + Risks */}
      {(r.strengths || r.risks) && (
        <div className="grid sm:grid-cols-2 gap-6">
          {r.strengths?.length > 0 && (
            <Card title="Key Strengths" icon="✅">
              <ListItems items={r.strengths} />
            </Card>
          )}
          {r.risks?.length > 0 && (
            <Card title="Key Risks" icon="⚠️">
              <ListItems items={r.risks} />
            </Card>
          )}
        </div>
      )}

      {/* AI Investment View */}
      {r.investment_view && (
        <Card title="AI Investment View" icon="🧠">
          {r.investment_view.stance && (
            <div className="flex items-center gap-3 mb-4">
              <StanceBadge stance={r.investment_view.stance} />
              {r.investment_view.time_horizon && (
                <span className="text-xs text-white/40 border border-white/10 rounded-full px-2 py-0.5">
                  {r.investment_view.time_horizon}
                </span>
              )}
            </div>
          )}
          <p className="text-sm text-white/75 leading-relaxed">{r.investment_view.rationale}</p>
        </Card>
      )}

      {/* Final Conclusion */}
      {r.final_conclusion && (
        <Card title="Final Conclusion" icon="📌">
          <p className="text-base text-white/85 leading-relaxed">{r.final_conclusion}</p>
        </Card>
      )}

      {/* Data Note */}
      {r.data_note && (
        <p className="text-xs text-white/25 text-center px-4">{r.data_note}</p>
      )}
    </PageShell>
  );
}

// ─── Technical Analysis Page ──────────────────────────────────────────────────

function TechnicalPage({ analysis }: { analysis: AnalysisRecord }) {
  const r  = analysis.result || {};
  const tb = r.trend_bias     || {};
  const ms = r.market_structure || {};
  const mo = r.momentum       || {};
  const mv = r.multi_timeframe_view || {};

  const trendColor = (t: string) =>
    t?.toLowerCase().includes('bull') ? 'green' :
    t?.toLowerCase().includes('bear') ? 'red' : undefined;

  return (
    <PageShell
      title={`${analysis.company_name} — AI Technical Analysis`}
      badge="Technical Analysis"
      ticker={analysis.ticker}
      date={analysis.created_at}
      market={analysis.market || r.market}
    >
      {/* Executive Summary */}
      <Card title="Executive Summary" icon="📋">
        <p className="text-base text-white/85 leading-relaxed">{r.executive_summary}</p>
        {tb.overall && (
          <div className="mt-4 flex items-center gap-3">
            <span className="text-xs text-white/40">Overall Bias:</span>
            <StanceBadge stance={tb.overall} />
          </div>
        )}
      </Card>

      {/* Trend Bias */}
      {tb.overall && (
        <Card title="Trend Bias" icon="📊">
          {tb.narrative && <p className="text-sm text-white/75 leading-relaxed mb-4">{tb.narrative}</p>}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {tb.overall     && <MetricPill label="Overall"      value={tb.overall}      color={trendColor(tb.overall)} />}
            {tb.long_term   && <MetricPill label="Long-Term"    value={tb.long_term}    color={trendColor(tb.long_term)} />}
            {tb.medium_term && <MetricPill label="Medium-Term"  value={tb.medium_term}  color={trendColor(tb.medium_term)} />}
            {tb.short_term  && <MetricPill label="Short-Term"   value={tb.short_term}   color={trendColor(tb.short_term)} />}
          </div>
        </Card>
      )}

      {/* Market Structure */}
      {ms.pattern && (
        <Card title="Market Structure" icon="🏗">
          <div className="flex items-center gap-3 mb-3">
            <StanceBadge stance={ms.pattern} />
            {ms.key_pattern && <span className="text-xs text-white/50">{ms.key_pattern}</span>}
          </div>
          {ms.description && <p className="text-sm text-white/75 leading-relaxed">{ms.description}</p>}
        </Card>
      )}

      {/* Momentum */}
      {(mo.rsi_reading || mo.macd_signal) && (
        <Card title="Momentum & Volume" icon="⚡">
          {mo.narrative && <p className="text-sm text-white/75 leading-relaxed mb-4">{mo.narrative}</p>}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {mo.rsi_reading    && <MetricPill label="RSI"           value={mo.rsi_reading} />}
            {mo.macd_signal    && <MetricPill label="MACD Signal"   value={mo.macd_signal} />}
            {mo.volume_analysis && <MetricPill label="Volume"       value={mo.volume_analysis} />}
          </div>
        </Card>
      )}

      {/* Support + Resistance */}
      {(r.support_levels?.length || r.resistance_levels?.length) && (
        <div className="grid sm:grid-cols-2 gap-6">
          {r.support_levels?.length > 0 && (
            <Card title="Support Levels" icon="🟢">
              <div className="space-y-3">
                {r.support_levels.map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3">
                    <div>
                      <span className="text-sm font-mono text-emerald-400">{s.price}</span>
                      {s.description && <p className="text-xs text-white/45 mt-0.5">{s.description}</p>}
                    </div>
                    <span className="text-xs text-white/30 capitalize">{s.strength}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {r.resistance_levels?.length > 0 && (
            <Card title="Resistance Levels" icon="🔴">
              <div className="space-y-3">
                {r.resistance_levels.map((r2: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-red-500/5 border border-red-500/15 rounded-xl p-3">
                    <div>
                      <span className="text-sm font-mono text-red-400">{r2.price}</span>
                      {r2.description && <p className="text-xs text-white/45 mt-0.5">{r2.description}</p>}
                    </div>
                    <span className="text-xs text-white/30 capitalize">{r2.strength}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Scenarios */}
      {r.scenarios?.length > 0 && (
        <Card title="Key Scenarios" icon="🎭">
          <div className="space-y-4">
            {r.scenarios.map((s: any, i: number) => {
              const isBull = s.label?.toLowerCase().includes('bull');
              const border = isBull ? 'border-emerald-500/20' : 'border-red-500/20';
              const bg     = isBull ? 'bg-emerald-500/5' : 'bg-red-500/5';
              return (
                <div key={i} className={`${bg} border ${border} rounded-xl p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-white/85">{s.label}</span>
                    {s.probability && (
                      <span className="text-xs text-white/40 border border-white/10 rounded-full px-2 py-0.5 capitalize">{s.probability}</span>
                    )}
                  </div>
                  {s.trigger && <p className="text-xs text-white/55 mb-1"><span className="text-white/30">Trigger: </span>{s.trigger}</p>}
                  {s.target  && <p className="text-xs text-white/55"><span className="text-white/30">Target: </span><span className="font-mono text-white/75">{s.target}</span></p>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Targets + Invalidation */}
      {(r.targets?.length || r.invalidation) && (
        <div className="grid sm:grid-cols-2 gap-6">
          {r.targets?.length > 0 && (
            <Card title="Price Targets" icon="🎯">
              <div className="space-y-2">
                {r.targets.map((t: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-white/3 rounded-xl px-4 py-3">
                    <span className="text-xs text-white/50">{t.label}</span>
                    <div className="text-right">
                      <span className="text-sm font-mono text-[#4f8ef7]">{t.price}</span>
                      {t.timeframe && <span className="text-xs text-white/30 ml-2 capitalize">{t.timeframe}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {r.invalidation && (
            <Card title="Invalidation Level" icon="🛑">
              {r.invalidation.level && (
                <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-3 mb-3">
                  <span className="text-sm font-mono text-red-400">{r.invalidation.level}</span>
                </div>
              )}
              {r.invalidation.description && (
                <p className="text-xs text-white/55 leading-relaxed">{r.invalidation.description}</p>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Multi-Timeframe */}
      {mv.weekly && (
        <Card title="Multi-Timeframe View" icon="🕐">
          {mv.narrative && <p className="text-sm text-white/75 leading-relaxed mb-4">{mv.narrative}</p>}
          <div className="grid grid-cols-3 gap-3">
            {mv.weekly && <MetricPill label="Weekly" value={mv.weekly} color={trendColor(mv.weekly)} />}
            {mv.daily  && <MetricPill label="Daily"  value={mv.daily}  color={trendColor(mv.daily)} />}
            {mv.h4     && <MetricPill label="H4"     value={mv.h4}     color={trendColor(mv.h4)} />}
          </div>
        </Card>
      )}

      {/* Final Conclusion */}
      {r.final_conclusion && (
        <Card title="AI Conclusion" icon="📌">
          <p className="text-base text-white/85 leading-relaxed">{r.final_conclusion}</p>
        </Card>
      )}

      {r.data_note && (
        <p className="text-xs text-white/25 text-center px-4">{r.data_note}</p>
      )}
    </PageShell>
  );
}

// ─── Quick Summary Page ───────────────────────────────────────────────────────

function QuickSummaryPage({ analysis }: { analysis: AnalysisRecord }) {
  const r = analysis.result || {};
  const isMarket = analysis.ticker === 'MARKET';

  return (
    <PageShell
      title={isMarket ? 'Smart Market Insight' : `${analysis.company_name} — Investment Summary`}
      badge={isMarket ? 'Market Insight' : 'Investment Summary'}
      ticker={analysis.ticker}
      date={analysis.created_at}
      market={analysis.market}
    >
      {/* Summary */}
      <Card title="Summary" icon="📋">
        <p className="text-base text-white/85 leading-relaxed">{r.summary || r.macro_factors}</p>
        {r.investment_stance && (
          <div className="mt-4 flex items-center gap-2">
            <StanceBadge stance={r.investment_stance || r.market_sentiment} />
          </div>
        )}
      </Card>

      {/* Positives + Risks  /  Themes + Risks */}
      {(r.key_positives || r.key_themes) && (
        <div className="grid sm:grid-cols-2 gap-6">
          <Card title={isMarket ? 'Key Themes' : 'Key Positives'} icon="✅">
            <ListItems items={r.key_positives || r.key_themes || []} />
          </Card>
          {(r.key_risks || r.risks) && (
            <Card title="Key Risks" icon="⚠️">
              <ListItems items={r.key_risks || r.risks || []} />
            </Card>
          )}
        </div>
      )}

      {/* Valuation + Technical */}
      {(r.valuation_note || r.technical_note || r.opportunities) && (
        <div className="grid sm:grid-cols-2 gap-6">
          {(r.valuation_note || r.opportunities) && (
            <Card title={isMarket ? 'Opportunities' : 'Valuation'} icon="🎯">
              {r.valuation_note && <p className="text-sm text-white/75 leading-relaxed">{r.valuation_note}</p>}
              {r.opportunities  && <ListItems items={r.opportunities} />}
            </Card>
          )}
          {r.technical_note && (
            <Card title="Technical Snapshot" icon="📐">
              <p className="text-sm text-white/75 leading-relaxed">{r.technical_note}</p>
            </Card>
          )}
        </div>
      )}

      {/* Sectors to Watch */}
      {r.sectors_to_watch?.length > 0 && (
        <Card title="Sectors to Watch" icon="🏭">
          <div className="flex flex-wrap gap-2">
            {r.sectors_to_watch.map((s: string, i: number) => (
              <span key={i} className="text-xs bg-[#4f8ef7]/10 text-[#4f8ef7] border border-[#4f8ef7]/20 rounded-full px-3 py-1">{s}</span>
            ))}
          </div>
        </Card>
      )}

      {/* Conclusion */}
      {r.conclusion && (
        <Card title="Key Takeaway" icon="📌">
          <p className="text-base text-white/85 leading-relaxed">{r.conclusion}</p>
        </Card>
      )}
    </PageShell>
  );
}

// ─── Compare Companies Page ───────────────────────────────────────────────────

function ComparePage({ analysis }: { analysis: AnalysisRecord }) {
  const r   = analysis.result || {};
  const c1  = r.company1 || {};
  const c2  = r.company2 || {};
  const fc  = r.financial_comparison || {};
  const tc  = r.technical_comparison || {};
  const str = r.strengths || {};
  const ris = r.risks || {};
  const sc  = r.scorecard || {};
  const op  = r.overall_preference || {};

  const winnerColor = (winner: string, ticker: string) =>
    winner === ticker ? 'text-emerald-400' :
    winner === 'tied' ? 'text-amber-400'   : 'text-white/40';

  const CompareRow = ({ label, c1val, c2val, winner }: { label: string; c1val: string; c2val: string; winner: string }) => (
    <div className="grid grid-cols-3 gap-3 items-center py-2 border-b border-white/5">
      <span className="text-xs text-white/40">{label}</span>
      <span className={`text-sm text-center capitalize ${winnerColor(winner, c1.ticker)}`}>{c1val}</span>
      <span className={`text-sm text-center capitalize ${winnerColor(winner, c2.ticker)}`}>{c2val}</span>
    </div>
  );

  return (
    <PageShell
      title={`${c1.name || c1.ticker} vs ${c2.name || c2.ticker}`}
      badge="Company Comparison"
      ticker={`${c1.ticker} / ${c2.ticker}`}
      date={analysis.created_at}
    >
      {/* Scorecard Hero */}
      {sc.c1_score && (
        <div className="grid grid-cols-3 gap-4 bg-[#0d1424] border border-white/8 rounded-2xl p-5">
          <div className="text-center">
            <p className="text-xs text-white/40 mb-1">{c1.name || c1.ticker}</p>
            <p className="text-3xl font-bold text-[#4f8ef7]">{sc.c1_score}</p>
          </div>
          <div className="text-center flex items-center justify-center">
            <span className="text-2xl text-white/20">vs</span>
          </div>
          <div className="text-center">
            <p className="text-xs text-white/40 mb-1">{c2.name || c2.ticker}</p>
            <p className="text-3xl font-bold text-[#4f8ef7]">{sc.c2_score}</p>
          </div>
        </div>
      )}

      {/* Summary */}
      <Card title="Comparison Overview" icon="📋">
        <p className="text-base text-white/85 leading-relaxed">{r.comparison_summary}</p>
        {op.preferred && (
          <div className="mt-4">
            <span className="text-xs text-white/40 mr-2">Preferred:</span>
            <span className="text-sm font-semibold text-emerald-400">{op.preferred}</span>
          </div>
        )}
      </Card>

      {/* Financial Comparison Table */}
      {Object.keys(fc).length > 0 && (
        <Card title="Financial Comparison" icon="💰">
          <div className="grid grid-cols-3 gap-3 mb-3">
            <span className="text-xs text-white/30 uppercase">Metric</span>
            <span className="text-xs text-white/60 uppercase text-center">{c1.ticker}</span>
            <span className="text-xs text-white/60 uppercase text-center">{c2.ticker}</span>
          </div>
          {fc.revenue_growth  && <CompareRow label="Revenue Growth"  c1val={fc.revenue_growth.c1}  c2val={fc.revenue_growth.c2}  winner={fc.revenue_growth.winner} />}
          {fc.profitability   && <CompareRow label="Profitability"   c1val={fc.profitability.c1}   c2val={fc.profitability.c2}   winner={fc.profitability.winner} />}
          {fc.balance_sheet   && <CompareRow label="Balance Sheet"   c1val={fc.balance_sheet.c1}   c2val={fc.balance_sheet.c2}   winner={fc.balance_sheet.winner} />}
          {fc.valuation       && <CompareRow label="Valuation"       c1val={fc.valuation.c1}       c2val={fc.valuation.c2}       winner={fc.valuation.winner} />}
          {fc.cash_generation && <CompareRow label="Cash Generation" c1val={fc.cash_generation.c1} c2val={fc.cash_generation.c2} winner={fc.cash_generation.winner} />}
        </Card>
      )}

      {/* Technical Comparison */}
      {tc.relative_strength && (
        <Card title="Technical Comparison" icon="📐">
          <div className="grid grid-cols-2 gap-4 mb-4">
            {tc.trend && (
              <div>
                <p className="text-xs text-white/40 mb-2">Trend</p>
                <div className="flex gap-2">
                  <MetricPill label={c1.ticker} value={tc.trend.c1}
                    color={tc.trend.c1?.toLowerCase().includes('bull') ? 'green' : tc.trend.c1?.toLowerCase().includes('bear') ? 'red' : undefined} />
                  <MetricPill label={c2.ticker} value={tc.trend.c2}
                    color={tc.trend.c2?.toLowerCase().includes('bull') ? 'green' : tc.trend.c2?.toLowerCase().includes('bear') ? 'red' : undefined} />
                </div>
              </div>
            )}
          </div>
          <p className="text-sm text-white/75 leading-relaxed">{tc.relative_strength}</p>
        </Card>
      )}

      {/* Strengths + Risks side by side */}
      {(str.c1?.length || ris.c1?.length) && (
        <div className="grid sm:grid-cols-2 gap-6">
          <Card title={`${c1.ticker} — Strengths & Risks`} icon="🔍">
            {str.c1?.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-white/40 uppercase mb-2">Strengths</p>
                <ListItems items={str.c1} />
              </div>
            )}
            {ris.c1?.length > 0 && (
              <div>
                <p className="text-xs text-white/40 uppercase mb-2">Risks</p>
                <ListItems items={ris.c1} />
              </div>
            )}
          </Card>
          <Card title={`${c2.ticker} — Strengths & Risks`} icon="🔍">
            {str.c2?.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-white/40 uppercase mb-2">Strengths</p>
                <ListItems items={str.c2} />
              </div>
            )}
            {ris.c2?.length > 0 && (
              <div>
                <p className="text-xs text-white/40 uppercase mb-2">Risks</p>
                <ListItems items={ris.c2} />
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Investor Type Preference */}
      {(op.for_growth_investors || op.for_value_investors) && (
        <Card title="Best For..." icon="👤">
          <div className="grid grid-cols-3 gap-3">
            {op.for_growth_investors && <MetricPill label="Growth Investors" value={op.for_growth_investors} />}
            {op.for_value_investors  && <MetricPill label="Value Investors"  value={op.for_value_investors} />}
            {op.for_income_investors && <MetricPill label="Income Investors" value={op.for_income_investors} />}
          </div>
        </Card>
      )}

      {/* Final Conclusion */}
      {r.final_conclusion && (
        <Card title="Final Verdict" icon="📌">
          <p className="text-base text-white/85 leading-relaxed">{r.final_conclusion}</p>
          {op.rationale && (
            <div className="mt-4 bg-[#4f8ef7]/5 border border-[#4f8ef7]/15 rounded-xl p-3">
              <p className="text-sm text-[#4f8ef7]/80 leading-relaxed">{op.rationale}</p>
            </div>
          )}
        </Card>
      )}
    </PageShell>
  );
}
