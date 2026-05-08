'use client';

import { useState } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  BookOpen, Search, Play, Terminal, BarChart3, TrendingUp, LineChart,
  Trophy, Settings, Bell, User, FileText, Shield, CheckCircle2, Info,
  Lightbulb, Zap, Star, ArrowRight, ArrowLeft, Keyboard, HelpCircle,
  DollarSign, Activity, Filter, Eye, Share2, MessageSquare, Users,
  Send, Download, RefreshCw, PieChart, Target, Layers, Globe, Lock,
  Mail, AlertTriangle, LifeBuoy, BookMarked, GraduationCap, Bookmark,
  Cpu, Database, Clock, ChevronRight, Package, Plus, TrendingDown,
  BarChart2, Minus, Circle, CheckSquare, XCircle, Hash, AlignLeft,
  Image as ImageIcon, MonitorSpeaker, UserCheck, Radio,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════
   TERMINAL MOCKUP COMPONENTS — faithful recreations of actual UI
═══════════════════════════════════════════════════════════════════ */

function TerminalFrame({ title, live = false, closed = false, children }: {
  title: string; live?: boolean; closed?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-2xl my-6 select-none">
      {/* Chrome bar */}
      <div className="bg-[#0d1117] border-b border-white/8 px-3 py-2 flex items-center gap-3">
        <div className="flex gap-1.5 flex-shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[11px] text-slate-500 font-mono truncate">{title}</span>
        </div>
        {live && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[9px] text-emerald-400 font-mono font-bold tracking-widest">LIVE</span>
          </div>
        )}
        {closed && (
          <div className="flex items-center gap-1 bg-red-600 rounded px-2 py-0.5 flex-shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-red-300" />
            <span className="text-[9px] text-white font-bold">CLOSED</span>
          </div>
        )}
      </div>
      <div className="bg-[#0d1117]">{children}</div>
    </div>
  );
}

/* ── Dashboard ── matches actual screenshot: 6 stat tiles, 3-col layout */
function DashboardMockup() {
  return (
    <TerminalFrame title="analyzinghub.com/dashboard" live>
      {/* 6-tile stat bar */}
      <div className="grid grid-cols-6 divide-x divide-white/5 border-b border-white/5">
        {[
          { label: 'LIVE POSITIONS', val: '3', sub: '1C · 2P', valColor: 'text-amber-400' },
          { label: 'WIN RATE', val: '59.6%', sub: '62 wins / 104 closed', valColor: 'text-amber-400' },
          { label: 'TOTAL P&L', val: '$29,115', sub: 'All-time realized', valColor: 'text-emerald-400' },
          { label: 'MTD P&L', val: '$3,927', sub: 'Month-to-date', valColor: 'text-emerald-400' },
          { label: 'ANALYSTS LIVE', val: '1', sub: '3 total signals', valColor: 'text-slate-200' },
          { label: 'MY ANALYSES', val: '22', sub: '57.14% success rate', valColor: 'text-slate-200' },
        ].map(({ label, val, sub, valColor }) => (
          <div key={label} className="px-3 py-2.5 bg-[#0d1117]">
            <p className="text-[8px] text-slate-600 uppercase tracking-wider font-medium mb-1">{label}</p>
            <p className={`text-sm font-bold font-mono leading-none ${valColor}`}>{val}</p>
            <p className="text-[9px] text-slate-600 mt-1 leading-none">{sub}</p>
          </div>
        ))}
      </div>
      {/* 3-column body */}
      <div className="grid grid-cols-12 divide-x divide-white/5" style={{ minHeight: 220 }}>
        {/* Left panel */}
        <div className="col-span-3 p-3 space-y-3">
          <div>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-2">MARKET SENTIMENT</p>
            <div className="flex items-center gap-2 mb-1.5">
              <TrendingDown className="h-3 w-3 text-red-400" />
              <span className="text-red-400 font-bold text-xs">BEARISH</span>
              <span className="text-red-400 font-bold text-sm ml-auto">33%</span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500/60 via-slate-600 to-red-500/80" style={{ width: '100%' }} />
            </div>
            <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
              <span>1 BULL</span><span>2 BEAR</span>
            </div>
          </div>
          <div>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-1.5">PLATFORM ACTIVITY</p>
            {[['Analysts Live','1'],['Active Signals','3'],['Win Rate','59.6%'],['Symbols Tracked','1']].map(([k,v]) => (
              <div key={k} className="flex justify-between text-[10px] py-0.5 border-b border-white/4">
                <span className="text-slate-500">{k}</span>
                <span className="text-slate-300 font-mono font-semibold">{v}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-1.5">MY PERFORMANCE</p>
            {[['Total Analyses','22'],['Active','4'],['Successful','12'],['Success Rate','57.14%'],['Followers','2']].map(([k,v]) => (
              <div key={k} className="flex justify-between text-[10px] py-0.5 border-b border-white/4">
                <span className="text-slate-500">{k}</span>
                <span className={`font-mono font-semibold ${k==='Success Rate' ? 'text-amber-400' : 'text-slate-300'}`}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Centre */}
        <div className="col-span-6 p-3 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">LIVE POSITIONS <span className="text-blue-400 ml-1">3</span></p>
            </div>
            <div className="text-[9px] text-slate-600 grid grid-cols-6 gap-1 px-2 mb-1">
              {['SYMBOL / ANALYST','DIR','ENTRY','CURRENT','HIGH','BEST P&L'].map(h=><span key={h}>{h}</span>)}
            </div>
            {[
              { sym:'SPX', dir:'PUT', entry:'$1.83', curr:'$0.13', high:'$4.30', pnl:'+135.6%', up:true },
              { sym:'SPX', dir:'CALL', entry:'$2.70', curr:'$0.07', high:'$2.88', pnl:'+6.7%', up:true },
              { sym:'SPX', dir:'PUT', entry:'$3.45', curr:'$0.15', high:'$18.00', pnl:'+421.7%', up:true },
            ].map(({sym,dir,entry,curr,high,pnl,up},i)=>(
              <div key={i} className="grid grid-cols-6 gap-1 px-2 py-1.5 border-b border-white/4 text-[10px] font-mono items-center">
                <span className="text-slate-300 font-semibold">{sym}</span>
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold text-center ${dir==='PUT'?'bg-red-500/25 text-red-400':'bg-emerald-500/25 text-emerald-400'}`}>{dir}</span>
                <span className="text-slate-400">{entry}</span>
                <span className="text-red-400 font-bold">{curr}</span>
                <span className="text-emerald-400">{high}</span>
                <span className="text-emerald-400 font-bold">{pnl}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-2">OPTIONS ACTIVITY <span className="text-blue-400 ml-1">3</span></p>
            <div className="text-[9px] text-slate-600 grid grid-cols-7 gap-1 px-2 mb-1">
              {['TYPE','SYMBOL','STRIKE','EXPIRY','ENTRY$','CURR$','BEST P&L'].map(h=><span key={h}>{h}</span>)}
            </div>
            {[
              {type:'PUT',strike:'$7,320',exp:'May 7',entry:'$1.83',curr:'$0.13',pnl:'+135.62%',put:true},
              {type:'CALL',strike:'$7,355',exp:'May 7',entry:'$2.70',curr:'$0.07',pnl:'+6.67%',put:false},
              {type:'PUT',strike:'$7,330',exp:'May 7',entry:'$3.45',curr:'$0.15',pnl:'+421.74%',put:true},
            ].map(({type,strike,exp,entry,curr,pnl,put},i)=>(
              <div key={i} className="grid grid-cols-7 gap-1 px-2 py-1 border-b border-white/4 text-[9px] font-mono items-center">
                <span className={`px-1.5 rounded text-[8px] font-bold text-center ${put?'bg-red-500/25 text-red-400':'bg-emerald-500/25 text-emerald-400'}`}>{type}</span>
                <span className="text-slate-300">SPX</span>
                <span className="text-slate-400">{strike}</span>
                <span className="text-slate-500">{exp}</span>
                <span className="text-slate-400">{entry}</span>
                <span className="text-red-400">{curr}</span>
                <span className="text-emerald-400 font-bold">{pnl}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Right panel */}
        <div className="col-span-3 p-3 space-y-3">
          <div>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-2">ANALYST LEADERBOARD</p>
            <div className="flex items-center gap-2 p-2 rounded bg-white/3 border border-white/5">
              <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-[9px] font-bold text-black">🏆</div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold text-slate-200">Analyzer</p>
                <p className="text-[8px] text-amber-400 font-mono">1 trade · 0% WR</p>
              </div>
              <span className="text-blue-400 font-bold text-sm font-mono">60</span>
            </div>
            <p className="text-[9px] text-blue-400 mt-1 text-right">Full rankings →</p>
          </div>
          <div>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-2">ANALYST ACTIVITY <span className="text-blue-400 ml-1">19</span></p>
            {['SPX إيجابي قوي','SPX رؤية إيجابية بانخراق','SPX موجتي','SPX اكتمال نمط مثلث','SPX الاتجاه الهابط مسيطر'].map((a,i)=>(
              <div key={i} className="flex items-center justify-between py-1 border-b border-white/4 text-[9px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] bg-blue-500/20 text-blue-400 px-1 rounded">SPX</span>
                  <span className="text-slate-400 truncate max-w-[90px]">{a.replace('SPX ','')}</span>
                </div>
                <span className="text-slate-600 font-mono">{(i+9)*10}d</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </TerminalFrame>
  );
}

/* ── Analysis Creation ── matches actual form screenshots */
function AnalysisMockup() {
  return (
    <TerminalFrame title="analyzinghub.com/dashboard/create-analysis">
      <div className="grid grid-cols-2 divide-x divide-white/5">
        {/* Left: Price Targets form */}
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-emerald-400 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </div>
              <span className="text-sm font-semibold text-slate-200">Price Targets</span>
              <span className="text-red-400 text-xs">*</span>
            </div>
            <div className="flex items-center gap-1.5 border border-white/15 rounded-lg px-2.5 py-1 text-[11px] text-slate-300">
              <Plus className="h-3 w-3" /> Add Target
            </div>
          </div>
          {/* Target card */}
          <div className="border border-blue-500/30 bg-blue-500/5 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white">1</div>
              <span className="text-sm font-semibold text-slate-200">Target Price</span>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[11px] text-slate-500">e.g., 175.00</div>
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1.5">
                <Clock className="h-3 w-3" />
                Expected Date <span className="text-slate-600">(optional)</span>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 flex items-center gap-2 text-[11px] text-slate-500">
                <Clock className="h-3 w-3" /> Pick a date
              </div>
              <p className="text-[9px] text-slate-600 mt-1">Format: dd/mm/yyyy</p>
            </div>
          </div>
          {/* Activation condition */}
          <div className="border border-blue-500/25 bg-blue-500/4 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-[11px] font-semibold text-slate-300">Activation Condition <span className="text-slate-500">(Optional)</span></span>
              </div>
              <div className="flex items-center gap-1.5 border border-white/15 rounded px-2 py-0.5 text-[10px] text-slate-400">
                <div className="w-3 h-3 border border-slate-500 rounded-sm" /> Enable
              </div>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">Set a condition that must be met before the analysis becomes active. If stoploss is hit before activation, it will NOT be counted as a failure.</p>
          </div>
          {/* Description */}
          <div>
            <p className="text-sm text-slate-300 mb-2">Analysis Description <span className="text-slate-500 text-xs">(optional)</span></p>
            <div className="bg-white/3 border border-white/10 rounded-lg p-3 h-16">
              <p className="text-[10px] text-slate-600">Add additional context, reasoning, or notes about your analysis...</p>
            </div>
            <p className="text-[9px] text-slate-600 mt-1">Provide additional details. This will be included when sharing on Telegram.</p>
          </div>
        </div>
        {/* Right: Image, Visibility, Telegram, Publish */}
        <div className="p-5 space-y-5">
          <div>
            <p className="text-sm font-semibold text-slate-200 mb-3">Image <span className="text-slate-500 text-xs">(optional)</span></p>
            <div className="border-2 border-dashed border-white/15 rounded-xl p-6 text-center space-y-2">
              <div className="flex items-center justify-center gap-2 bg-white/8 border border-white/10 rounded-lg py-2.5 mx-4 text-[11px] text-slate-300 cursor-pointer">
                <Download className="h-3.5 w-3.5" /> Upload Image
              </div>
              <p className="text-[10px] text-slate-600">PNG, JPG up to 5MB</p>
            </div>
            <div className="flex items-center gap-2 my-3">
              <div className="flex-1 h-px bg-white/8" />
              <span className="text-[9px] text-slate-600 border border-white/10 rounded px-2 py-0.5">OR ENTER IMAGE URL</span>
              <div className="flex-1 h-px bg-white/8" />
            </div>
            <div className="bg-white/3 border border-white/10 rounded-lg px-3 py-2 text-[10px] text-slate-600">https://example.com/chart.png</div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-3.5 w-3.5 text-slate-400" />
              <p className="text-sm font-semibold text-slate-200">Audience &amp; Visibility</p>
            </div>
            <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-blue-400" />
                <div>
                  <p className="text-[11px] font-semibold text-slate-200">Public — Everyone</p>
                  <p className="text-[9px] text-slate-500">Anyone can see this in the global feed</p>
                </div>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
            </div>
            <p className="text-[9px] text-slate-600 mt-1">Choose who can see this post in their feed</p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Send className="h-3.5 w-3.5 text-slate-400" />
              <p className="text-sm font-semibold text-slate-200">Telegram Channel</p>
            </div>
            <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg px-3 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Send className="h-3 w-3 text-emerald-400" />
                <p className="text-[11px] font-semibold text-emerald-400">Will broadcast to: Wahhab charts tests</p>
              </div>
              <p className="text-[9px] text-slate-500">Your public audience will see this analysis on Telegram</p>
            </div>
          </div>
          <div className="bg-blue-600 hover:bg-blue-500 rounded-xl py-3 flex items-center justify-center gap-2 cursor-pointer">
            <LineChart className="h-4 w-4 text-white" />
            <span className="text-sm font-bold text-white">Publish Analysis</span>
          </div>
        </div>
      </div>
    </TerminalFrame>
  );
}

/* ── Live Monitor ── matches actual SPX $7320 PUT screenshot */
function TradeMockup() {
  return (
    <TerminalFrame title="analyzinghub.com/dashboard/indices/live-monitor" closed>
      {/* Index top bar */}
      <div className="bg-[#0a0e1a] border-b border-white/5 px-4 py-2 flex items-center gap-6">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="h-3 w-3 text-blue-400" />
          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">INDICES HUB</span>
        </div>
        {[
          {sym:'SPX',val:'7,337.11',sub:'S&P 500',up:true},
          {sym:'NDX',val:'28,563.95',sub:'NASDAQ',up:true},
          {sym:'VIX',val:'17.08',sub:'Volatility',up:false},
          {sym:'DJI',val:'49,596.97',sub:'Dow Jones',up:true},
        ].map(({sym,val,sub,up})=>(
          <div key={sym} className="flex items-center gap-1.5 text-[10px] font-mono">
            <span className="text-slate-500">{sym}</span>
            <span className={`font-bold ${up?'text-slate-200':'text-red-400'}`}>{val}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-2 text-[9px] text-slate-500 font-mono">
          <span>Thu, May 7</span>
          <span>08:27:41</span>
        </div>
      </div>
      <div className="grid grid-cols-12 divide-x divide-white/5">
        {/* Sidebar */}
        <div className="col-span-2 bg-[#090d18] py-3 px-2 space-y-1">
          <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] text-slate-500 hover:text-slate-300">
            <ArrowLeft className="h-3 w-3" /> Back to List
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-white/5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-bold text-slate-200">LIVE MONITOR</span>
          </div>
          <p className="text-[8px] text-slate-600 uppercase tracking-widest px-2 pt-2">NAVIGATION</p>
          {['Overview','Analyses','Trades','Reports','Archive'].map(n=>(
            <div key={n} className="flex items-center gap-2 px-2 py-1.5 text-[10px] text-slate-500">{n}</div>
          ))}
          <p className="text-[8px] text-slate-600 uppercase tracking-widest px-2 pt-2">QUICK ACTIONS</p>
          {['+ New Analysis','+ New Trade'].map(n=>(
            <div key={n} className="flex items-center gap-2 px-2 py-1.5 text-[10px] text-slate-500">{n}</div>
          ))}
        </div>
        {/* Main content */}
        <div className="col-span-7 p-4 space-y-3">
          <div className="flex items-start justify-between mb-1">
            <div>
              <h2 className="text-lg font-bold text-slate-100">SPX $7320 PUT</h2>
              <p className="text-[10px] text-slate-500 font-mono">0: SPXW260507P07320000</p>
              <p className="text-[10px] text-slate-500">Expires: 07/05/2026</p>
            </div>
            <div className="px-3 py-1 rounded-full bg-blue-500/20 border border-blue-500/30 text-[10px] text-blue-400 font-bold">active</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* Contract Price */}
            <div className="border border-white/8 rounded-xl p-4 bg-white/2">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-3">
                <DollarSign className="h-3 w-3" /> Contract Price
              </div>
              <div className="text-4xl font-bold text-slate-100 font-mono mb-1">0.13</div>
              <div className="flex items-center gap-2 text-[9px] text-slate-600 mb-4">
                <Clock className="h-2.5 w-2.5" /> 22:55:04
                <span className="border border-white/10 rounded px-1.5 py-0.5 text-slate-500">Market Closed</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  {l:'Entry',v:'1.83',c:'text-slate-300'},
                  {l:'P&L',v:'++$170.00',c:'text-emerald-400',sub:'+93.15%'},
                  {l:'↗ High',v:'4.30',c:'text-emerald-400',sub:'@ 22:25:04'},
                  {l:'↘ Low',v:'0.13',c:'text-red-400',sub:'@ 22:55:04'},
                ].map(({l,v,c,sub})=>(
                  <div key={l}>
                    <p className="text-[9px] text-slate-600 mb-0.5">{l}</p>
                    <p className={`text-sm font-bold font-mono ${c}`}>{v}</p>
                    {sub && <p className={`text-[9px] ${c} opacity-70`}>{sub}</p>}
                  </div>
                ))}
              </div>
            </div>
            {/* Underlying Index */}
            <div className="border border-white/8 rounded-xl p-4 bg-white/2">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-3">
                <Activity className="h-3 w-3" /> Underlying Index
              </div>
              <p className="text-[10px] text-slate-500 mb-1">SPX</p>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-3xl font-bold text-slate-100 font-mono">$7,337.11</span>
                <TrendingUp className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="text-[10px] text-emerald-400 mb-4">+0.06% since entry</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  {l:'↗ High',v:'$7,340.84',c:'text-emerald-400'},
                  {l:'↘ Low',v:'$7,324.58',c:'text-red-400'},
                ].map(({l,v,c})=>(
                  <div key={l}>
                    <p className="text-[9px] text-slate-600 mb-0.5">{l}</p>
                    <p className={`text-sm font-bold font-mono ${c}`}>{v}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Right MARKET INTEL */}
        <div className="col-span-3 bg-[#090d18] p-3 space-y-4">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">MARKET INTEL</p>
          <div>
            <p className="text-[8px] text-slate-600 uppercase tracking-widest mb-2">⚡ MARKET SENTIMENT</p>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-400">Trend Bias</span>
              <div className="flex items-center gap-1">
                <TrendingDown className="h-3 w-3 text-red-400" />
                <span className="text-[10px] font-bold text-red-400">BEARISH</span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-red-500 mb-1" />
            <div className="flex justify-between text-[9px]">
              <span className="text-red-400 font-bold">BEAR 71% ↓71%</span>
              <span className="text-emerald-400">29% BULL</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {[{l:'Fear/Greed',v:'76',sub:'Extreme Greed'},{l:'Volatility',v:'17.1',sub:'VIX'}].map(({l,v,sub})=>(
                <div key={l} className="bg-white/3 border border-white/5 rounded p-2 text-center">
                  <p className="text-[8px] text-slate-600">{l}</p>
                  <p className="text-sm font-bold text-slate-200 font-mono">{v}</p>
                  <p className="text-[8px] text-slate-600">{sub}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[8px] text-slate-600 uppercase tracking-widest mb-2">⚡ OPTIONS FLOW</p>
            {[['Call Vol','306.7K','text-emerald-400'],['Put Vol','283.8K','text-red-400'],['P/C Ratio','0.93','text-slate-300'],['Unusual OI','7300P','text-amber-400']].map(([l,v,c])=>(
              <div key={l} className="flex justify-between py-0.5 text-[9px] border-b border-white/4">
                <span className="text-slate-500">{l}</span>
                <span className={`font-mono font-semibold ${c}`}>{v}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[8px] text-slate-600 uppercase tracking-widest mb-2">⊕ KEY LEVELS</p>
            {[['Resistance','7385','bg-red-500/20 text-red-400'],['Fair Value','7348','bg-slate-600/30 text-slate-300'],['Support','7321','bg-emerald-500/20 text-emerald-400'],['Liquidity','7365','bg-blue-500/20 text-blue-400']].map(([l,v,c])=>(
              <div key={l} className="flex justify-between items-center py-0.5 text-[9px]">
                <span className="text-slate-500">{l}</span>
                <span className={`font-mono font-bold px-1.5 rounded ${c}`}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </TerminalFrame>
  );
}

/* ── Indices / SPX Intelligence ── */
function IndicesMockup() {
  return (
    <TerminalFrame title="analyzinghub.com/dashboard/indices/spx-intelligence" live>
      <div className="grid grid-cols-4 gap-px bg-white/5 border-b border-white/5">
        {[
          {sym:'SPX',val:'7,337.11',chg:'+0.06%',up:true},
          {sym:'NDX',val:'28,563.95',chg:'+1.42%',up:true},
          {sym:'VIX',val:'17.08',chg:'-2.1%',up:false},
          {sym:'DJI',val:'49,596.97',chg:'+0.38%',up:true},
        ].map(({sym,val,chg,up})=>(
          <div key={sym} className="bg-[#0d1117] px-4 py-3">
            <p className="text-[8px] text-slate-500 uppercase tracking-widest">{sym}</p>
            <p className="text-base font-bold font-mono text-slate-100">{val}</p>
            <p className={`text-[10px] font-mono ${up?'text-emerald-400':'text-red-400'}`}>{up?'▲':'▼'} {chg}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 divide-x divide-white/5">
        <div className="p-4">
          <p className="text-[8px] text-slate-500 uppercase tracking-widest font-bold mb-3">⚡ OPTIONS FLOW</p>
          {[
            {type:'CALL',strike:'7355C',exp:'May 7',size:'$306.7K',bull:true},
            {type:'PUT',strike:'7320P',exp:'May 7',size:'$283.8K',bull:false},
            {type:'PUT',strike:'7300P',exp:'May 7',size:'$1.2M',bull:false},
          ].map(({type,strike,exp,size,bull})=>(
            <div key={strike} className="flex items-center justify-between py-1.5 border-b border-white/4 text-[10px] font-mono">
              <div className="flex items-center gap-2">
                <span className={`px-1.5 rounded text-[8px] font-bold ${bull?'bg-emerald-500/20 text-emerald-400':'bg-red-500/20 text-red-400'}`}>{type}</span>
                <span className="text-slate-500">{strike} {exp}</span>
              </div>
              <span className={`font-bold ${bull?'text-emerald-400':'text-red-400'}`}>{size}</span>
            </div>
          ))}
          <div className="mt-3 space-y-1">
            {[['Call Vol','306.7K','text-emerald-400'],['Put Vol','283.8K','text-red-400'],['P/C Ratio','0.93','text-slate-300'],['Unusual OI','7300P','text-amber-400']].map(([l,v,c])=>(
              <div key={l} className="flex justify-between text-[9px]">
                <span className="text-slate-600">{l}</span>
                <span className={`font-mono font-semibold ${c}`}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4">
          <p className="text-[8px] text-slate-500 uppercase tracking-widest font-bold mb-3">⊕ KEY LEVELS</p>
          {[
            {label:'Resistance',val:'7385',color:'bg-red-500/20 text-red-400',pct:85},
            {label:'Fair Value',val:'7348',color:'bg-slate-600/30 text-slate-300',pct:55},
            {label:'Support',val:'7321',color:'bg-emerald-500/20 text-emerald-400',pct:35},
            {label:'Liquidity',val:'7365',color:'bg-blue-500/20 text-blue-400',pct:65},
          ].map(({label,val,color,pct})=>(
            <div key={label} className="mb-2.5">
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-slate-500">{label}</span>
                <span className={`font-mono font-bold px-1.5 rounded text-[9px] ${color}`}>{val}</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-slate-600" style={{width:`${pct}%`}} />
              </div>
            </div>
          ))}
          <div className="mt-3 pt-3 border-t border-white/5">
            <p className="text-[8px] text-slate-500 uppercase tracking-widest mb-2">⊕ MARKET PULSE</p>
            {[
              {label:'PUT SPX @7320',val:'+115.0%',entry:'Entry: 2.00',bull:false},
              {label:'CALL SPX @7355',val:'+0.0%',entry:'Entry: 2.40',bull:true},
            ].map(({label,val,entry,bull})=>(
              <div key={label} className="flex justify-between py-1 border-b border-white/4 text-[9px]">
                <div>
                  <span className={`font-semibold ${bull?'text-emerald-400':'text-red-400'}`}>{label}</span>
                  <p className="text-slate-600">{entry}</p>
                </div>
                <span className={`font-bold font-mono ${bull?'text-emerald-400':'text-red-400'}`}>{val}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="p-4">
          <p className="text-[8px] text-slate-500 uppercase tracking-widest font-bold mb-3">AI SIGNAL — TODAY</p>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
              <TrendingDown className="h-4 w-4 text-red-400" />
            </div>
            <div>
              <p className="text-xs font-bold text-red-400">BEARISH</p>
              <p className="text-[10px] text-slate-500">Confidence: 71%</p>
            </div>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden mb-3">
            <div className="h-full bg-gradient-to-r from-emerald-500/60 to-red-500" style={{width:'71%'}} />
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed">P/C ratio 0.93 near neutral. VIX at 17.1 — elevated. Dealer gamma net short at 7320 creates amplified downside risk below current levels.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[{l:'Bear',v:'71%',c:'text-red-400'},{l:'Bull',v:'29%',c:'text-emerald-400'}].map(({l,v,c})=>(
              <div key={l} className="bg-white/3 border border-white/5 rounded p-2 text-center">
                <p className={`text-xs font-bold ${c}`}>{v}</p>
                <p className="text-[9px] text-slate-600">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </TerminalFrame>
  );
}

/* ── Reports History ── matches actual Reports screenshot */
function ReportsMockup() {
  return (
    <TerminalFrame title="analyzinghub.com/dashboard/reports">
      <div className="p-4 pb-2">
        <p className="text-xl font-bold text-slate-100">Reports</p>
        <p className="text-[11px] text-slate-500 mb-4">Generate and manage trading reports</p>
        {/* Tabs */}
        <div className="flex border-b border-white/8 mb-5">
          {['Generate','Automated','History'].map((t,i)=>(
            <div key={t} className={`flex items-center gap-1.5 px-6 py-2.5 text-[11px] font-semibold cursor-pointer ${i===2?'border-b-2 border-slate-200 text-slate-200':'text-slate-500'}`}>
              {i===0&&<FileText className="h-3 w-3"/>}
              {i===1&&<Settings className="h-3 w-3"/>}
              {i===2&&<Clock className="h-3 w-3"/>}
              {t}
            </div>
          ))}
        </div>
        <p className="text-sm font-bold text-slate-200 mb-0.5">Generated Reports</p>
        <p className="text-[10px] text-slate-500 mb-4">History of generated reports</p>
      </div>
      {/* Report cards */}
      {[
        {date:'May 7th, 2026',range:'May 07 – May 07, 2026',profit:'+$3648',profitSub:'530.0% avg',total:'+$3648',totalSub:'from wins',wr:'100.0%',wrSub:'2W / 0L',best:'+$2515',bestSub:'636.7% gain'},
        {date:'May 6th, 2026',range:'May 06 – May 06, 2026',profit:'+$3648',profitSub:'530.0% avg',total:'+$3648',totalSub:'from wins',wr:'100.0%',wrSub:'2W / 0L',best:'+$2515',bestSub:'636.7% gain'},
      ].map(({date,range,profit,profitSub,total,totalSub,wr,wrSub,best,bestSub},ri)=>(
        <div key={date} className={`mx-4 mb-4 rounded-xl border ${ri===0?'border-cyan-500/40 bg-gradient-to-br from-cyan-900/20 to-teal-900/10':'border-white/8 bg-white/2'} p-4`}>
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-bold text-slate-200">{date}</p>
            <span className="flex items-center gap-1 text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5">
              <CheckCircle2 className="h-2.5 w-2.5"/> Generated
            </span>
            <span className="text-[9px] bg-white/10 text-slate-300 border border-white/15 rounded-full px-2 py-0.5">Both</span>
          </div>
          <p className="text-[10px] text-slate-500 mb-3">{range}</p>
          <div className="grid grid-cols-4 gap-3 mb-3">
            {[
              {l:'Net Profit',v:profit,sub:profitSub,border:'border-l-emerald-500',txt:'text-emerald-400'},
              {l:'Total Profit',v:total,sub:totalSub,border:'border-l-cyan-500',txt:'text-cyan-400'},
              {l:'Win Rate',v:wr,sub:wrSub,border:'border-l-amber-500',txt:'text-amber-400'},
              {l:'Best Trade',v:best,sub:bestSub,border:'border-l-purple-500',txt:'text-purple-400'},
            ].map(({l,v,sub,border,txt})=>(
              <div key={l} className={`bg-white/4 border border-white/8 border-l-2 ${border} rounded-lg p-3`}>
                <p className="text-[9px] text-slate-500 mb-1">{l}</p>
                <p className={`text-base font-bold font-mono ${txt}`}>{v}</p>
                <p className="text-[9px] text-slate-600">{sub}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              {[{i:Eye,l:'Preview'},{i:ImageIcon,l:'Image'},{i:Download,l:'HTML'},{i:FileText,l:'PDF'}].map(({i:Icon,l})=>(
                <div key={l} className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer hover:text-slate-200">
                  <Icon className="h-3 w-3"/> {l}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 bg-blue-600 rounded-lg px-3 py-1.5 text-[11px] text-white font-bold cursor-pointer">
              <Send className="h-3 w-3"/> Send
            </div>
          </div>
        </div>
      ))}
    </TerminalFrame>
  );
}

/* ── Rankings ── matches Analyst Leaderboard section */
function RankingsMockup() {
  return (
    <TerminalFrame title="analyzinghub.com/dashboard/rankings">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1">
            {['All Time','This Month','This Week'].map((t,i)=>(
              <div key={t} className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold ${i===1?'bg-amber-500/20 text-amber-400 border border-amber-500/30':'bg-white/5 border border-white/8 text-slate-500'}`}>{t}</div>
            ))}
          </div>
          <span className="text-[10px] text-slate-500 font-mono">238 Analyzers ranked</span>
        </div>
        {/* Table header */}
        <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[9px] text-slate-600 uppercase tracking-wider border-b border-white/5 mb-1">
          <span className="col-span-1">#</span>
          <span className="col-span-4">Analyzer</span>
          <span className="col-span-2 text-right">Win Rate</span>
          <span className="col-span-2 text-right">Net P&L</span>
          <span className="col-span-2 text-right">Subscribers</span>
          <span className="col-span-1 text-right">Score</span>
        </div>
        {[
          {rank:1,name:'Ahmad Al-Rashidi',wr:'84%',pnl:'+$48,200',subs:342,score:96.4,medal:'🥇'},
          {rank:2,name:'Sara Khalid',wr:'79%',pnl:'+$31,800',subs:218,score:91.2,medal:'🥈'},
          {rank:3,name:'Mike Torres',wr:'76%',pnl:'+$27,400',subs:175,score:88.7,medal:'🥉'},
          {rank:4,name:'Analyzer',wr:'57%',pnl:'+$29,115',subs:2,score:60,medal:'04'},
          {rank:5,name:'Omar Hassan',wr:'69%',pnl:'+$14,900',subs:98,score:78.3,medal:'05'},
        ].map(({rank,name,wr,pnl,subs,score,medal})=>(
          <div key={rank} className={`grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-lg border text-[11px] mb-1 ${rank===4?'bg-blue-500/8 border-blue-500/20':'bg-white/2 border-white/5'}`}>
            <span className="col-span-1 text-base">{medal.length>2?medal:`0${rank}`}</span>
            <div className="col-span-4 flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0">
                {name.split(' ').map(w=>w[0]).join('').slice(0,2)}
              </div>
              <span className="font-semibold text-slate-200">{name}</span>
            </div>
            <span className="col-span-2 text-right font-mono font-bold text-amber-400">{wr}</span>
            <span className="col-span-2 text-right font-mono font-bold text-emerald-400">{pnl}</span>
            <span className="col-span-2 text-right font-mono text-slate-400">{subs}</span>
            <span className="col-span-1 text-right font-mono font-bold text-blue-400">{score}</span>
          </div>
        ))}
      </div>
    </TerminalFrame>
  );
}

/* ── Profile ── */
function ProfileMockup() {
  return (
    <TerminalFrame title="analyzinghub.com/dashboard/profile">
      <div className="p-5">
        <div className="flex gap-4 mb-5">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">AK</div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-bold text-slate-200">Ahmad Khalid</p>
              <div className="px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-[9px] text-blue-400 font-bold">ANALYZER</div>
              <div className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-[9px] text-emerald-400 font-bold">✓ VERIFIED</div>
            </div>
            <p className="text-[11px] text-slate-500 mb-2">Swing trader specialising in US equities and SPX options. 5+ years experience in technical analysis.</p>
            <div className="flex gap-4 text-[10px] font-mono">
              <span><span className="text-slate-200 font-bold">142</span> <span className="text-slate-600">subscribers</span></span>
              <span><span className="text-slate-200 font-bold">87</span> <span className="text-slate-600">analyses</span></span>
              <span><span className="text-emerald-400 font-bold">73.2%</span> <span className="text-slate-600">win rate</span></span>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <div className="px-3 py-1.5 rounded-lg bg-blue-600 text-[11px] text-white font-bold">Subscribe</div>
            <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] text-slate-400">Follow</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-px bg-white/5 rounded-xl overflow-hidden">
          {[
            {label:'Total P&L',val:'+$48,200',color:'text-emerald-400'},
            {label:'Avg R:R',val:'2.8:1',color:'text-blue-400'},
            {label:'Best Month',val:'+$12,400',color:'text-emerald-300'},
          ].map(({label,val,color})=>(
            <div key={label} className="bg-[#0d1117] p-3 text-center">
              <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-1">{label}</p>
              <p className={`font-bold font-mono ${color}`}>{val}</p>
            </div>
          ))}
        </div>
      </div>
    </TerminalFrame>
  );
}

/* ── Settings ── */
function SettingsMockup() {
  return (
    <TerminalFrame title="analyzinghub.com/dashboard/settings">
      <div className="grid grid-cols-4 h-56">
        <div className="bg-[#090d18] border-r border-white/5 p-3 space-y-1">
          {['Account','Profile','Notifications','Telegram','Appearance','Billing'].map((item,i)=>(
            <div key={item} className={`px-2.5 py-2 rounded text-[11px] font-medium ${i===2?'bg-blue-600 text-white':'text-slate-500'}`}>{item}</div>
          ))}
        </div>
        <div className="col-span-3 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-200">Notification Preferences</p>
          {[
            {label:'Price target reached',on:true},
            {label:'New subscriber',on:true},
            {label:'Analysis liked',on:false},
            {label:'Daily report ready',on:true},
            {label:'Stop loss hit',on:true},
          ].map(({label,on})=>(
            <div key={label} className="flex items-center justify-between py-1.5 border-b border-white/5">
              <span className="text-[11px] text-slate-400">{label}</span>
              <div className={`w-8 h-4 rounded-full flex items-center px-0.5 ${on?'bg-blue-600 justify-end':'bg-white/10 justify-start'}`}>
                <div className="w-3 h-3 rounded-full bg-white"/>
              </div>
            </div>
          ))}
        </div>
      </div>
    </TerminalFrame>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ARTICLE DATA
═══════════════════════════════════════════════════════════════════ */

type Article = {
  id: string;
  category: string;
  title: string;
  summary: string;
  readTime: string;
  badge?: string;
  badgeColor?: string;
  mockup: React.ReactNode;
  content: React.ReactNode;
};

const ARTICLES: Article[] = [
  /* ─── GETTING STARTED ─── */
  {
    id: 'platform-overview',
    category: 'getting-started',
    title: 'Platform Overview: What is AnalyzingHub?',
    summary: 'A complete introduction to the AnalyzingHub trading intelligence terminal — roles, features, and what makes it different.',
    readTime: '5 min read',
    badge: 'Start Here',
    badgeColor: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
    mockup: <DashboardMockup />,
    content: (
      <div className="prose-article">
        <p>AnalyzingHub is a professional-grade trading intelligence platform designed to bridge the gap between market analysts and active traders. Unlike traditional social trading apps, AnalyzingHub is built around the concept of <strong>verified, structured market analyses</strong> — not social media posts.</p>

        <h3>The Core Philosophy</h3>
        <p>Every analysis published on AnalyzingHub follows a standardised structure: a defined symbol, directional bias (long or short), specific entry price, profit targets, and a stop-loss. This structure forces discipline and makes performance tracking mathematically precise. You cannot publish a vague "AAPL looks bullish" post — you must define exactly where you enter, where you exit, and how much you risk.</p>
        <p>This rigour creates accountability. Every analysis has a verifiable outcome: either targets were hit, the stop-loss was triggered, or the analysis expired. The platform tracks all of this automatically, building each Analyzer's true performance record over time.</p>

        <h3>Two Types of Users</h3>
        <p><strong>Analyzers</strong> are the content creators of the platform. They publish market analyses, build subscriber audiences, and can monetise their expertise through paid subscription tiers. Analyzers have access to the full suite of tools: analysis creation, trade journaling, performance reports, Telegram integration, and the Indices Hub terminal.</p>
        <p><strong>Traders</strong> are the consumers and practitioners. They follow Analyzers whose styles resonate with them, subscribe for premium content, manage their own private trade journals, and build their own performance records. Traders can also participate in the community feed and rankings system.</p>

        <h3>What Makes AnalyzingHub Different</h3>
        <p>The platform was designed from the ground up for serious market participants. Key differentiators include:</p>
        <ul>
          <li><strong>Verified performance tracking</strong> — win rates and P&L statistics are calculated from actual analysis outcomes, not self-reported</li>
          <li><strong>Bloomberg-inspired terminal UI</strong> — designed for speed and data density, not social media engagement metrics</li>
          <li><strong>Bilingual support</strong> — full English and Arabic interface with RTL layout, serving both Western and MENA markets</li>
          <li><strong>Telegram integration</strong> — automated reports and instant analysis alerts dispatched directly to subscriber channels</li>
          <li><strong>SPX Intelligence</strong> — AI-powered S&P 500 signals using options flow, gamma exposure, and volatility surface analysis</li>
        </ul>

        <h3>Navigating the Interface</h3>
        <p>The main navigation runs along the left sidebar, organised into three sections: Platform (Dashboard, Feed, Profile, Rankings), Trading (Companies analyses, Indices Hub), and Account (Subscriptions, Financial, Settings). The top header bar provides access to notifications, language switching, and your account menu.</p>
        <p>The central content area adapts to each section. In the Indices Hub, it becomes a multi-pane terminal. In the analysis feed, it shows a card-based list. On the dashboard, it presents your performance metrics and recent activity.</p>

        <h3>Getting Started Checklist</h3>
        <p>Before diving into features, complete these one-time setup steps: (1) Fill out your profile with a photo and bio. (2) Configure your notification preferences. (3) If you are an Analyzer, connect your Telegram channel and create at least one subscription tier. (4) Take the interactive platform tour available from this Help page. (5) Publish your first analysis or open your first trade journal entry.</p>
        <p>The platform has been designed so that most workflows are discoverable within 10 minutes of use. This documentation exists to help you understand the <em>why</em> behind each feature, not just the <em>how</em>.</p>
      </div>
    ),
  },
  {
    id: 'account-setup',
    category: 'getting-started',
    title: 'Account Setup & Profile Configuration',
    summary: 'Step-by-step guide to setting up your AnalyzingHub account, profile, notifications, and Telegram integration.',
    readTime: '7 min read',
    mockup: <ProfileMockup />,
    content: (
      <div className="prose-article">
        <p>Your AnalyzingHub profile is more than an account — it is your professional trading identity. For Analyzers, a complete profile directly affects subscriber acquisition. For Traders, it determines your position on the community leaderboard and how other users perceive your activity.</p>

        <h3>Step 1: Complete Your Profile</h3>
        <p>Navigate to <strong>My Profile → Edit Profile</strong>. You will see fields for your display name, a biographical summary, and trading specialisation tags. The bio field accepts up to 500 characters — use it wisely. Write about your trading style, instruments you focus on, and your approach to risk management. A bio written in third person ("Ahmad specialises in...") tends to read more professionally than first person for public-facing profiles.</p>
        <p>Upload a profile photo by clicking on the avatar circle. The platform accepts JPEG, PNG, and WebP formats. Use a high-quality image of at least 400×400 pixels — the platform auto-crops to a circle. Profiles with a photo receive substantially more subscriber inquiries than those without.</p>

        <h3>Step 2: Add Trading Specialisation Tags</h3>
        <p>Tags like "Swing Trading", "Options", "Technical Analysis", "SPX", and "Commodities" appear on your public profile and make you discoverable when other users browse the Analyzer directory. Add between three and six tags that genuinely reflect your areas of expertise. Misleading tags damage your credibility when your analysis history does not match.</p>

        <h3>Step 3: Configure Notifications</h3>
        <p>Go to <strong>Settings → Notifications</strong>. You will find toggles for each notification category: price target reached, stop-loss hit, new subscriber, analysis liked, comment on your analysis, and daily report generated. Enable the events that matter to you and disable the rest — notification fatigue is real, and receiving too many alerts causes you to ignore important ones.</p>
        <p>Set a price movement threshold for price alerts. A 1% threshold on a volatile equity like NVDA will trigger constantly. Consider setting 2–3% for individual stocks and 0.5% for index instruments like SPX.</p>

        <h3>Step 4: Connect Telegram (Analyzers)</h3>
        <p>This step is optional but strongly recommended for Analyzers. Navigate to <strong>Settings → Telegram Integration</strong>. You will need to create a Telegram bot via @BotFather (Telegram's official bot creation tool) and obtain an API token. You will also need your Telegram channel's ID, which can be found using the @username_to_id_bot.</p>
        <p>Enter both values in the Settings page and click Verify Connection. The platform will send a test message to your channel to confirm the integration is working. Once connected, your subscribers automatically receive alerts when you publish new analyses.</p>

        <h3>Step 5: Set Your Role Preferences</h3>
        <p>Roles are assigned by SuperAdmins during account creation. Your role determines what features you can access. If you believe your role is incorrect — for example, you should be an Analyzer but were registered as a Trader — contact platform administration through the Settings page. Role changes take effect immediately upon update.</p>

        <h3>Viewing Your Public Profile</h3>
        <p>At any time, click "View Public Profile" on your profile page to see exactly what other users and potential subscribers see. Your public profile shows: your bio, specialisation tags, total analyses published, overall win rate, subscriber count, and a feed of your published analyses sorted by most recent. Your private trades are never shown on your public profile.</p>
      </div>
    ),
  },

  /* ─── DASHBOARD ─── */
  {
    id: 'dashboard-overview',
    category: 'dashboard',
    title: 'Dashboard: Your Trading Command Centre',
    summary: 'A deep dive into every panel, metric, and widget on the main dashboard — and how to interpret them.',
    readTime: '8 min read',
    mockup: <DashboardMockup />,
    content: (
      <div className="prose-article">
        <p>The Dashboard is the first screen you see after logging in and the hub of your daily workflow on AnalyzingHub. It is designed to give you an immediate, high-density view of your trading performance, recent community activity, and live market data — all without navigating away.</p>

        <h3>Global Market Bar</h3>
        <p>Running across the top of every terminal-style page is the Global Market Bar. It displays live prices for SPX, NDX, DJI, VIX, and several major equities. Prices update in real time during market hours. The VIX reading is particularly important — a VIX above 20 indicates elevated fear in the market, which typically correlates with higher intraday volatility and wider bid-ask spreads.</p>
        <p>Green values indicate the instrument is trading higher than the previous close. Red values indicate it is lower. The percentage change shown is always relative to the prior session's closing price, not an intraday reference point.</p>

        <h3>Performance Metrics Row</h3>
        <p>The four large tiles below the market bar display your aggregated performance statistics. Understanding each one is essential:</p>
        <p><strong>Total P&L</strong> is the sum of all realised profits and losses across every closed trade in your journal, from your first trade to today. This is your cumulative historical performance and does not include unrealised gains from open positions.</p>
        <p><strong>Win Rate</strong> is calculated as: (Number of winning closed trades ÷ Total closed trades) × 100. A trade is "winning" if it closed at a profit, regardless of how much. Win rate is important but should always be read alongside average R:R — a 40% win rate with a 3:1 average R:R is more profitable than a 70% win rate with a 0.5:1 R:R.</p>
        <p><strong>Active Trades</strong> shows your currently open positions. The sub-line shows how many are in profit right now. This number updates in near real-time as market prices move.</p>
        <p><strong>Subscribers</strong> is visible for Analyzers only. It shows your total active subscriber count and the week-over-week change. Subscriber growth is tracked in the Financial dashboard with a detailed breakdown by tier.</p>

        <h3>Recent Analyses Feed</h3>
        <p>The main content area of the dashboard shows analyses from Analyzers you follow, sorted by most recently published. Each analysis card shows the symbol, directional bias, entry price, profit targets, stop-loss, risk-reward ratio, and current status. The current market price is shown alongside your entry, with a colour-coded indicator showing whether the trade is in profit or at a loss relative to the published entry.</p>
        <p>You can interact with each card directly from the feed: like, save to watchlist, share, or click to open the full analysis detail view. You can also subscribe to price alerts from the feed without opening the full analysis.</p>

        <h3>Active Trades Panel</h3>
        <p>Below the feed, the Active Trades panel shows a compact version of your open trade journal. Each row displays the symbol, your entry price, the current market price, unrealised P&L in both dollar and percentage terms, and the distance to your stop-loss and nearest target. Trades are colour-coded: green rows are in profit, red rows are at a loss.</p>
        <p>Clicking any trade row takes you directly to the trade detail page where you can modify your stop-loss, add partial closes, or close the entire position.</p>

        <h3>Notification Bell</h3>
        <p>The bell icon in the header shows an unread count badge when new alerts are waiting. Click it to open the notification drawer. Notifications are time-stamped and show the specific event: "AAPL hit your target at $238.00", "New subscriber: John D.", "Your analysis NVDA LONG closed at +12.4%". Price alerts are the most time-sensitive — check them promptly as price action continues while you are away.</p>

        <h3>Customising Your View</h3>
        <p>The feed supports filtering by analysis type (equities, indices, crypto), by followed Analyzers only, or by analyses you have liked. The sort order can be changed to newest, oldest, highest win rate, or most liked. These filter and sort settings are saved for your next session.</p>
      </div>
    ),
  },
  {
    id: 'notifications-guide',
    category: 'dashboard',
    title: 'Notification Centre & Price Alerts',
    summary: 'Configure, manage and act on notifications and real-time price alerts across all your tracked instruments.',
    readTime: '5 min read',
    mockup: <SettingsMockup />,
    content: (
      <div className="prose-article">
        <p>The notification system is the real-time nervous system of AnalyzingHub. Price alerts, subscriber events, and platform updates all flow through the same notification centre, giving you a single inbox for everything that matters to your trading workflow.</p>

        <h3>Types of Notifications</h3>
        <p><strong>Price Alerts</strong> are triggered when a tracked instrument's price crosses a level you defined — typically the entry zone, a profit target, or the stop-loss of an analysis or trade. These are time-critical and should be acted upon promptly.</p>
        <p><strong>Analysis Outcome Notifications</strong> fire automatically when the platform detects that a published analysis has hit a target or stop-loss. The Analyzer receives these, as do all subscribers who have that analysis in their watchlist.</p>
        <p><strong>Subscriber Events</strong> notify Analyzers when a new subscriber joins, renews, or cancels a subscription. These are informational and require no immediate action.</p>
        <p><strong>System Notifications</strong> cover platform-level events: new features, scheduled maintenance, account security events (new login from unrecognised device), and report generation completions.</p>

        <h3>Configuring Alert Thresholds</h3>
        <p>Navigate to <strong>Settings → Notifications</strong>. The price movement threshold control sets how large a price move must be before a price alert fires. Setting this too low (e.g. 0.1%) means you receive alerts every few minutes on actively traded symbols. Setting it too high (e.g. 5%) means you miss meaningful moves. A threshold of 1–2% is suitable for most equity traders. Options traders often use 0.5% due to the higher time-sensitivity of their positions.</p>

        <h3>Managing the Notification Drawer</h3>
        <p>Click the bell icon in the header to open the notification drawer. Use the tabs at the top to filter: All, Price Alerts, Subscriber Events, and System. Each notification shows a relative timestamp ("2 minutes ago") and a brief description of the event. Click any notification to navigate directly to the relevant analysis, trade, or settings page. Use "Mark all as read" to clear the unread count without reviewing each item individually.</p>

        <h3>Browser Notifications</h3>
        <p>If you grant browser notification permission when prompted, critical price alerts will appear as system-level desktop notifications even when AnalyzingHub is not the active browser tab. This is strongly recommended for active traders who need to be informed of target hits during the trading session.</p>

        <h3>Telegram Alerts (Analyzers)</h3>
        <p>When your Telegram integration is connected, analysis publication events automatically trigger a message to your subscriber channel. You can customise the message format in Settings → Telegram. The default message includes the symbol, direction, entry, targets, stop-loss, and your short thesis. Optional: include a chart screenshot by uploading one when creating the analysis — it will be attached to the Telegram message automatically.</p>
      </div>
    ),
  },

  /* ─── ANALYSIS ─── */
  {
    id: 'creating-analysis',
    category: 'analysis',
    title: 'Creating a Professional Market Analysis',
    summary: 'The complete guide to publishing a structured, high-quality market analysis — from symbol selection to publishing.',
    readTime: '10 min read',
    badge: 'Analyzer Only',
    badgeColor: 'bg-violet-500/20 text-violet-300 border border-violet-500/30',
    mockup: <AnalysisMockup />,
    content: (
      <div className="prose-article">
        <p>Publishing a market analysis on AnalyzingHub is the core activity for Analyzers. A well-structured analysis does three things: it communicates your thesis clearly to subscribers, it creates an accountable record of your judgement, and it positions you as a professional whose performance can be tracked and verified over time.</p>

        <h3>Before You Start: Analysis Discipline</h3>
        <p>The most common mistake new Analyzers make is publishing too frequently or with insufficient conviction. The platform tracks every analysis you publish — there is no way to delete a published analysis that went wrong. This accountability is by design. Before opening the create form, ask yourself: Would I risk real capital on this setup? If the answer is not an immediate yes, the analysis is not ready to publish.</p>
        <p>Quality beats quantity. An Analyzer who publishes 5 analyses per month with a 75% win rate will always outperform one who publishes 50 analyses with a 55% win rate — both in terms of subscriber trust and platform rankings.</p>

        <h3>Step 1: Select Your Symbol</h3>
        <p>Navigate to <strong>Companies → Create Company Analysis</strong> or press the keyboard shortcut ⌘N. In the symbol field, begin typing the ticker. The platform searches in real time across US equities, major ETFs, and indices. When the correct instrument appears, click to select it. The current market price, company name, and exchange are auto-populated.</p>
        <p>If you cannot find your symbol, it may not yet be in the platform's coverage database. The platform covers all NYSE and NASDAQ-listed equities, major ETFs, and the primary index instruments (SPX, NDX, DJI, RUT). Crypto and international equities have limited coverage.</p>

        <h3>Step 2: Set the Direction</h3>
        <p>Click <strong>LONG</strong> for a bullish trade (you expect the price to rise) or <strong>SHORT</strong> for a bearish trade (you expect the price to fall). This choice determines which target fields are shown — upside targets for longs, downside targets for shorts. You cannot change direction after setting entry prices without clearing all price fields.</p>

        <h3>Step 3: Define Your Price Levels</h3>
        <p>This is the most critical step. Four price fields are required: Entry Price, Target 1, Stop Loss, and optionally Target 2 and Target 3.</p>
        <p><strong>Entry Price</strong> should be the specific price (or midpoint of a zone) at which you would execute the trade. Do not enter the current market price as your entry unless you are genuinely entering at market. If you are waiting for a pullback to $220 before entering AAPL, enter $220, not the current $228.</p>
        <p><strong>Profit Targets</strong> should be based on your analysis — key resistance levels, measured moves, Fibonacci extensions, or fundamental valuation. Target 1 is typically a conservative target where you might take partial profits. Target 2 and 3 are more ambitious levels. The platform shows the percentage move from entry to each target automatically.</p>
        <p><strong>Stop Loss</strong> is non-negotiable. Every professional analysis requires a stop-loss. Place it at a level where your thesis is definitively wrong — below a key support level, below an earnings gap, or below a significant moving average. The platform calculates the risk (entry to stop distance) and the risk-reward ratio (reward to risk) in real time as you type.</p>
        <p>A risk-reward ratio of 2:1 or better is the professional standard. This means your target profit is at least twice the distance to your stop-loss. The platform will show a warning if you publish an analysis with a sub-1:1 R:R.</p>

        <h3>Step 4: Write Your Thesis</h3>
        <p>The analysis text field is where you explain the "why" behind your price levels. A strong thesis covers: the chart pattern or technical structure driving your view, key support/resistance levels, the timeframe of the trade (days, weeks, months), any upcoming catalysts (earnings, Fed meetings, product launches), and the conditions that would invalidate your thesis before the stop-loss is hit.</p>
        <p>Aim for 150–300 words. Shorter than 100 words suggests insufficient analysis. Longer than 500 words risks burying the key points. Use specific price references: "Support at the 200-day MA at $218" rather than "support nearby".</p>

        <h3>Step 5: Upload Supporting Charts</h3>
        <p>A chart is worth considerably more than the most eloquent thesis. Upload your annotated chart by dragging a PNG or JPEG file into the chart upload area or clicking to browse. Annotate your chart in your charting software before uploading — mark your entry zone, targets, stop-loss, and any key levels your thesis references. The platform accepts up to 4 chart images per analysis.</p>
        <p>Charts are stored on a CDN and auto-optimised for web display. Do not upload charts from TradingView's screenshot tool that include personal information or account details visible on screen.</p>

        <h3>Step 6: Set Visibility and Publish</h3>
        <p>Choose <strong>Public</strong> to make the analysis visible to all AnalyzingHub users. Choose <strong>Subscribers Only</strong> to restrict it to users who have an active paid subscription to your account. Public analyses are good for building an audience; subscriber-only analyses are your premium content that justifies the subscription fee.</p>
        <p>Click <strong>Publish Analysis</strong>. The analysis immediately appears in the community feed. If you have Telegram integration active, an alert is dispatched to your subscriber channel within 30 seconds of publishing.</p>

        <h3>After Publishing</h3>
        <p>The platform begins tracking the instrument's price in real time. When the current price crosses any of your defined levels — entry zone, Target 1, Target 2, or stop-loss — the analysis card is automatically updated with a visual indicator. You and your subscribers receive a notification. You can also manually close an analysis at any time by clicking the analysis and selecting "Close Analysis", which lets you provide a custom closing note and outcome.</p>
      </div>
    ),
  },
  {
    id: 'analysis-feed',
    category: 'analysis',
    title: 'Navigating the Analysis Feed',
    summary: 'How to filter, sort, interact with, and get the most value from the community analysis feed.',
    readTime: '6 min read',
    mockup: <DashboardMockup />,
    content: (
      <div className="prose-article">
        <p>The Analysis Feed is the community heart of AnalyzingHub — a live stream of published market analyses from Analyzers you follow and the broader community. Learning to navigate it efficiently is the key skill for Traders who use the platform to source trade ideas.</p>

        <h3>Feed Composition</h3>
        <p>By default, the feed shows analyses from all Analyzers on the platform, sorted by most recently published. You can narrow this to only Analyzers you follow using the "Following Only" filter chip at the top of the feed. This is recommended once you have identified five or more Analyzers whose style and performance aligns with your own.</p>
        <p>Each feed card shows at a glance: the Analyzer's name and win rate, the symbol and direction (LONG or SHORT), entry price, targets, stop-loss, risk-reward ratio, publication date, and current status. The current status reflects real-time market data — an analysis published an hour ago might already be showing "Near Target 1" if the market moved quickly.</p>

        <h3>Filtering Options</h3>
        <p>The filter panel at the top of the feed supports multiple simultaneous filters. Filter by <strong>Status</strong>: Active (open analyses), Closed Profit, Closed Loss, or Expired. Filtering to "Active" is most useful for finding current trade ideas. Filter by <strong>Direction</strong>: Long only, Short only, or Both. Filter by <strong>Asset Class</strong>: Equities, Indices, ETFs. Filter by <strong>Timeframe</strong>: Day Trade, Swing (2-14 days), Position (2+ weeks).</p>

        <h3>Sorting the Feed</h3>
        <p>Click the sort dropdown to change the ordering. <strong>Newest First</strong> is the default and best for staying current. <strong>Highest R:R</strong> surfaces analyses with the most favourable risk-reward ratios — useful for finding high-conviction setups. <strong>Most Liked</strong> shows community-validated analyses. <strong>Analyzer Win Rate</strong> prioritises analyses from Analyzers with the strongest historical track record.</p>

        <h3>Interacting with Analyses</h3>
        <p>Click the <strong>Like button</strong> (thumbs up) to endorse an analysis. Likes boost an analysis's visibility in the feed and contribute to the Analyzer's ranking score. Likes are public — other users can see that you have liked an analysis.</p>
        <p>Click the <strong>Bookmark button</strong> to save an analysis to your personal watchlist. Bookmarked analyses appear in a dedicated "Saved" view accessible from your profile. Use bookmarks to track analyses you are watching but have not yet entered.</p>
        <p>Click the <strong>Share button</strong> to copy a public URL to the analysis. Sharing links work even for users who are not logged in — the public view shows the analysis details without the proprietary platform UI.</p>
        <p>Click the <strong>Comment button</strong> or open the full analysis to leave a comment. Comments appear in a thread below the analysis. Analyzers are notified of new comments and typically respond within their active trading hours.</p>

        <h3>Price Alert Subscriptions</h3>
        <p>On any analysis card, click the <strong>bell icon</strong> to subscribe to price alerts for that specific analysis. You will be notified when the price enters the entry zone, hits a target, or triggers the stop-loss. This feature is separate from general account notifications — it is per-analysis and per-user.</p>

        <h3>Opening the Full Analysis</h3>
        <p>Click anywhere on an analysis card (except the action buttons) to open the full analysis detail view. This shows the complete thesis text, all uploaded charts, the full price target and stop-loss table with current price distances, the comment thread, and the Analyzer's profile summary. From the full view, you can also link this analysis to a trade in your journal by clicking "Create Trade from Analysis".</p>
      </div>
    ),
  },

  /* ─── TRADES ─── */
  {
    id: 'trade-journal',
    category: 'trades',
    title: 'Trade Journal: Logging & Tracking Positions',
    summary: 'How to log trades, set up position monitoring, manage partial closes, and maintain a professional trading journal.',
    readTime: '9 min read',
    mockup: <TradeMockup />,
    content: (
      <div className="prose-article">
        <p>The Trade Journal is your private performance ledger on AnalyzingHub. Unlike published analyses which are public, your trade journal is completely private — only you can see your trade entries. The journal serves two purposes: real-time position monitoring and historical performance tracking.</p>

        <h3>The Philosophy of Journaling</h3>
        <p>Professional traders journal every trade not because they have to, but because the act of recording forces clarity. Before you can log a trade, you must answer: What symbol? What direction? What entry price? What is my stop-loss? What are my targets? These questions filter out impulsive, unplanned entries. If you cannot answer all of them before entering a position, you should not enter the position.</p>
        <p>Over time, your journal becomes your most valuable trading resource. Pattern recognition emerges: you might notice you have a 90% win rate on AAPL longs but only 40% on TSLA longs. You might see that trades entered between 9:30–10:30 AM have a much lower win rate than afternoon entries. These insights are only visible in a systematic journal.</p>

        <h3>Opening a New Trade</h3>
        <p>Navigate to <strong>Trades</strong> in the sidebar. Click the <strong>+ New Trade</strong> button. The trade creation dialog opens with the following fields:</p>
        <p><strong>Symbol</strong> — Search and select the instrument. The current market price is auto-populated as a suggested entry.</p>
        <p><strong>Direction</strong> — Long or Short.</p>
        <p><strong>Entry Price</strong> — Override the auto-populated price if you entered at a different level. Always use your actual entry, not the current price.</p>
        <p><strong>Position Size</strong> — Number of shares, contracts, or units. This enables dollar P&L calculation in addition to percentage. For options, enter the number of contracts.</p>
        <p><strong>Stop-Loss</strong> — Your maximum loss level. Required field.</p>
        <p><strong>Target 1 (and 2, 3)</strong> — Your profit objectives. At least one target is required.</p>
        <p><strong>Link to Analysis</strong> — If this trade is based on a published analysis (yours or another Analyzer's), link it here. This creates a relationship between the public analysis and your private trade, enabling outcome correlation in your performance reports.</p>
        <p><strong>Notes</strong> — A free-text field for your entry reasoning. Even a single sentence is valuable for retrospective review.</p>

        <h3>Live Position Monitoring</h3>
        <p>Once a trade is logged, it appears in the Trade Monitor with live price data. The monitor updates the current price every 15–30 seconds during market hours. For each open trade, you can see:</p>
        <p>The <strong>Unrealised P&L</strong> in both dollar and percentage terms, colour-coded green for profit and red for loss. The <strong>Distance to Stop</strong>, showing how far the current price is from your stop-loss — this is critical risk management information. The <strong>Distance to Target</strong>, showing how close you are to your nearest profit objective. The <strong>Trade Age</strong> in days, helping you identify positions that have been open too long without directional follow-through.</p>

        <h3>Managing Open Positions</h3>
        <p>Click any trade row to open the trade management view. From here you can:</p>
        <p><strong>Adjust the Stop-Loss</strong> — Move your stop to breakeven after a trade reaches a certain profit level, or trail it to lock in partial gains. Any stop-loss change is logged with a timestamp.</p>
        <p><strong>Partial Close</strong> — Close a percentage of your position (e.g. sell 50 of 100 shares at Target 1). The platform records the partial close as a separate transaction and adjusts your remaining position size and average entry accordingly.</p>
        <p><strong>Add to Position</strong> — Log an additional entry to an existing trade, which the platform averages into your cost basis.</p>
        <p><strong>Full Close</strong> — Enter your exit price and the platform records the trade as closed, calculating the final P&L and updating all performance statistics immediately.</p>

        <h3>Closing a Trade</h3>
        <p>Click <strong>Close Trade</strong> on any open position. Enter your actual exit price — not the current market price if you exited at a different level. Select the close reason: Target Hit, Stop Hit, Manual Close (with your reason), or Expired. The close reason affects how the trade is categorised in your performance reports.</p>
        <p>After closing, the trade moves to the Closed Trades view. Closed trades are permanent — you cannot re-open them. If you made an error, you can add a correction note to the trade, but the original entry and exit prices remain in the record.</p>

        <h3>Trade Performance Analytics</h3>
        <p>The <strong>Performance</strong> tab in the Trades section shows your aggregated statistics. Win Rate, Average Gain, Average Loss, Profit Factor (Total Wins ÷ Total Losses), Maximum Drawdown, and Average R:R are all calculated automatically from your closed trade history. A breakdown by symbol shows which instruments you trade best. A time-of-day analysis shows your performance distribution across the trading session.</p>
        <p>Access your detailed financial dashboard at <strong>Dashboard → Financial</strong> for equity curve charts, monthly P&L bar charts, and streak analysis.</p>
      </div>
    ),
  },
  {
    id: 'performance-analytics',
    category: 'trades',
    title: 'Performance Analytics & Financial Dashboard',
    summary: 'Understanding your win rate, P&L curves, drawdown metrics, and how to use analytics to improve your trading.',
    readTime: '7 min read',
    mockup: <ReportsMockup />,
    content: (
      <div className="prose-article">
        <p>The Financial Dashboard is where raw trade data becomes actionable intelligence about your trading performance. It moves beyond simple P&L numbers to reveal patterns, strengths, and weaknesses in your approach that are invisible from individual trade results.</p>

        <h3>The Equity Curve</h3>
        <p>The equity curve is the most important chart in your performance analytics. It plots the cumulative value of your trading account over time, updated with each closed trade. A consistently rising equity curve indicates a positive expectancy system. A curve that rises, then falls sharply, then recovers reveals inconsistency — likely a period where discipline broke down or market conditions changed.</p>
        <p>Look for the smoothness of the curve. A smooth, gradually rising curve suggests consistent position sizing and risk management. A jagged curve with large spikes suggests inconsistent sizing — large wins from oversized positions masking poor overall performance.</p>

        <h3>Win Rate vs Expectancy</h3>
        <p>Win rate is the most commonly cited statistic and the most commonly misunderstood. A 70% win rate is excellent — if your average win is larger than your average loss. A 70% win rate is disastrous if your average win is half your average loss (a system where you win $100 seven times and lose $200 three times nets -$100 over 10 trades).</p>
        <p>The statistic that matters is <strong>Expectancy</strong>: (Win Rate × Average Win) − (Loss Rate × Average Loss). A positive expectancy means you make money on average per trade. Any trading system must have positive expectancy to be sustainable. The Financial dashboard calculates this for you and displays it prominently.</p>

        <h3>Profit Factor</h3>
        <p>Profit Factor = Total Gross Profit ÷ Total Gross Loss. A Profit Factor of 1.0 means you break even. A Profit Factor of 1.5 means for every $1.00 you lose, you make $1.50 — a solid edge. A Profit Factor above 2.0 is exceptional and typically indicates either a genuine edge or insufficient trade history. Professional trading systems generally target a Profit Factor of 1.3–1.8 as sustainable over thousands of trades.</p>

        <h3>Drawdown Analysis</h3>
        <p>Maximum Drawdown (MDD) is the largest peak-to-trough decline in your equity curve. If your account grew from $10,000 to $15,000 and then fell to $12,000 before recovering, your MDD is 20% (from $15,000 to $12,000). MDD is a measure of the psychological and financial pain your system can impose. An MDD above 20% is difficult for most traders to sustain without making emotional decisions that compound losses.</p>
        <p>The Drawdown by Month chart in the Financial dashboard shows each month's maximum decline relative to that month's starting equity. Consistent small drawdowns (under 5%) indicate excellent risk control. Occasional large drawdowns suggest sporadic discipline failures that need to be identified and addressed.</p>

        <h3>Symbol-Level Analysis</h3>
        <p>The Symbol Breakdown table shows your performance statistics broken down by individual instrument. This analysis often reveals unexpected patterns: an Analyzer might discover they have a 80% win rate on AAPL analyses but a 45% win rate on TSLA — suggesting they have a genuine edge in one company but are speculating in the other. Acting on this insight (trading only instruments where you have an edge) is one of the highest-leverage improvements a trader can make.</p>

        <h3>Time-of-Day Analysis</h3>
        <p>The Time Analysis chart shows your win rate and average P&L broken down by the hour at which you entered trades. Many traders discover that trades entered in the first 30 minutes after market open (9:30–10:00 AM ET) have significantly lower win rates than trades entered mid-morning. This is not universal — some strategies are specifically designed for the open — but it is a crucial insight to verify empirically from your own data.</p>

        <h3>Using Analytics to Improve</h3>
        <p>Review your Financial Dashboard at least weekly. Identify your top three performing setups (by symbol, pattern, or time of day) and your bottom three. The goal is to gradually shift your trading activity towards your edges and away from your weaknesses. If a symbol appears consistently in your bottom performers, consider removing it from your watchlist entirely for 30 days. This forced discipline often reveals that the absence of a distracting instrument improves overall performance.</p>
      </div>
    ),
  },

  /* ─── INDICES HUB ─── */
  {
    id: 'indices-terminal',
    category: 'indices',
    title: 'Indices Hub: Professional Index Terminal',
    summary: 'Master the multi-pane indices terminal — market bar, analysis feed, right panel, and options flow data.',
    readTime: '10 min read',
    mockup: <IndicesMockup />,
    content: (
      <div className="prose-article">
        <p>The Indices Hub is AnalyzingHub's most technically sophisticated interface — a Bloomberg-inspired multi-pane terminal designed specifically for trading and analysing major market indices: SPX (S&P 500), NDX (NASDAQ-100), DJI (Dow Jones), VIX (Volatility Index), and related instruments.</p>

        <h3>Why a Dedicated Index Terminal?</h3>
        <p>Index trading is fundamentally different from individual equity trading. Indices are influenced by macro forces — Federal Reserve policy, economic data releases, geopolitical events, and cross-asset correlations — rather than company-specific fundamentals. They also have derivatives ecosystems (options, futures) that are orders of magnitude larger than any individual stock's derivatives market. The Indices Hub is built to surface this multi-layer complexity in a single coherent interface.</p>

        <h3>The Global Market Bar</h3>
        <p>The market bar at the top of the Indices Hub shows live prices for all tracked instruments simultaneously. Beyond price and daily change, the bar contextualises the relationship between indices: when SPX is up 1% and VIX is up 2%, that is an unusual divergence (normally they move inversely) that often precedes a volatility spike. These cross-market relationships are visible at a glance in the bar.</p>
        <p>The VIX reading is particularly important. VIX measures the 30-day implied volatility of the S&P 500 options market. Values below 15 indicate a calm, low-fear environment — good for trend-following strategies. Values between 20-30 indicate moderate stress. Values above 30 indicate high fear — these levels have historically represented excellent long-term buying opportunities but brutal short-term conditions for long positions.</p>

        <h3>The Analysis Feed (Left Panel)</h3>
        <p>The left panel shows index-specific analyses published by all Analyzers on the platform. Unlike the main feed which includes equities, the Indices Hub feed is filtered exclusively to index instruments (SPX, NDX, DJI, RUT, etc.). Use the filter chips to narrow by direction (long/short), status (active/closed), or specific index.</p>
        <p>Click any analysis row to load it in the right panel without leaving the terminal. This side-by-side view is the terminal's key efficiency feature — you can browse the list while reading a detailed analysis simultaneously.</p>

        <h3>The Right Panel</h3>
        <p>The right panel is a collapsible detail view that shows the full content of a selected analysis. Pin it open using the pin icon in the panel header to keep it visible while you continue browsing the list. The panel shows: the full analysis text, price level table (entry, targets, stop), chart images, comment thread, and Analyzer profile summary. From the panel, you can like, bookmark, share, subscribe to price alerts, or create a trade linked to the analysis.</p>

        <h3>Options Flow Data</h3>
        <p>The Options Flow section surfaces unusual options activity in the index derivatives market. Each entry shows the type of transaction (call or put), whether it was a sweep (aggressive, time-sensitive order) or block (large single transaction), the strike price and expiration date, and the estimated dollar value. Large call sweeps above resistance levels suggest institutional bullish positioning. Large put blocks ahead of key events suggest hedging or directional bearish bets.</p>
        <p>Interpret options flow as one data point, not a definitive signal. Institutions hedge constantly, and a large put purchase might be portfolio protection rather than a bearish directional bet. The value of options flow is in spotting clusters of activity around specific strikes or expirations that indicate where institutional participants have concentrated exposure.</p>

        <h3>Creating Index Analyses</h3>
        <p>Analyzers can publish index-specific analyses via <strong>Indices Hub → Create Index Analysis</strong>. The form is similar to the equity analysis form but with additional fields relevant to index trading: the contract type (cash index, futures, options), expiration date for time-sensitive setups, and an implied volatility reference level at the time of publishing. This last field helps subscribers understand whether you are publishing in a high or low volatility environment, which affects position sizing recommendations.</p>
      </div>
    ),
  },
  {
    id: 'spx-intelligence',
    category: 'indices',
    title: 'SPX Intelligence: AI Signals & Options Analytics',
    summary: 'Deep guide to the SPX Intelligence dashboard — AI signals, gamma exposure (GEX), options flow, and how to use them together.',
    readTime: '12 min read',
    badge: 'Advanced',
    badgeColor: 'bg-violet-500/20 text-violet-300 border border-violet-500/30',
    mockup: <IndicesMockup />,
    content: (
      <div className="prose-article">
        <p>SPX Intelligence is the most advanced feature on AnalyzingHub — a quantitative analytics dashboard built specifically for the S&P 500 options market. It combines AI-generated directional signals with institutional-grade data on gamma exposure, put/call ratios, and unusual options flow to give sophisticated traders a multi-layer view of the market's most liquid instrument.</p>

        <h3>Understanding Gamma Exposure (GEX)</h3>
        <p>Gamma Exposure is perhaps the most powerful — and least understood — concept in modern options market analysis. To understand it, start with this: when market makers (dealers) sell options to retail traders and institutions, they must hedge their exposure by buying or selling the underlying instrument (SPX futures). The amount they must buy or sell depends on the option's delta, which changes as the price moves — that rate of change is gamma.</p>
        <p>When dealers are net long gamma (positive GEX), they buy when the market falls and sell when it rises, naturally suppressing volatility. This is why periods of high positive GEX correspond to low VIX and "pinning" behaviour near major strikes. When dealers are net short gamma (negative GEX), they must buy when the market rises and sell when it falls — amplifying moves and increasing volatility. Negative GEX environments produce the large, fast SPX moves that catch most traders off guard.</p>
        <p>The GEX chart in SPX Intelligence shows the net gamma exposure by strike price. The strike with the highest absolute GEX is the "gamma pin" — the level the market tends to gravitate towards as expiration approaches. Understanding where the pin is each week is one of the most practical applications of GEX analysis for SPX options traders.</p>

        <h3>Reading the AI Signal</h3>
        <p>The daily AI signal synthesises multiple quantitative inputs into a single directional view (Bullish, Bearish, or Neutral) with a confidence percentage. The inputs include: the put/call ratio (high put buying relative to calls is typically bearish but can also indicate hedging at market tops), the VIX term structure (whether near-term implied volatility is higher or lower than longer-term — "backwardation" often precedes sharp moves), the net gamma exposure direction, and the options flow data from that session.</p>
        <p>A confidence level of 75%+ historically correlates with a higher probability of the indicated direction playing out over the subsequent 1–3 sessions. Confidence levels below 60% indicate mixed signals — the model sees conflicting data and its output should carry less weight in your decision-making.</p>
        <p>Important caveat: no quantitative model is correct 100% of the time, and past performance of the signal does not guarantee future accuracy. Treat the AI signal as one high-quality input among several in your decision process, not as a definitive trade trigger.</p>

        <h3>Interpreting Options Flow in Context</h3>
        <p>The Options Flow panel shows today's largest unusual options transactions in SPX (and related instruments like SPY, QQQ). The key distinction is between <strong>sweeps</strong> and <strong>blocks</strong>. A sweep is an order that takes out multiple levels of the options order book simultaneously — it prioritises speed over price, suggesting urgency. Sweeps often indicate a trader who needs to establish a position quickly before an anticipated move. Blocks are large single transactions, often done over the counter — they suggest a pre-negotiated trade, often institutional hedging.</p>
        <p>When you see multiple call sweeps at the same strike on the same day, particularly above a resistance level, it often indicates a directional bullish bet from one or more sophisticated participants. When you see large put blocks across multiple strikes just before a known event (Fed meeting, CPI data, earnings), it almost always represents portfolio hedging from an institution with a large long equity book.</p>

        <h3>Combining the Three Data Sets</h3>
        <p>The highest-conviction SPX signals emerge when all three data sets align: the AI signal is bullish, GEX shows positive gamma (suppressing downside volatility), and options flow shows call sweeps rather than put buying. When these three elements align, the market has a structural bias toward the indicated direction. When they conflict — for example, the AI signal is bullish but unusual put activity is spiking — it is a reason for caution, not a trade signal in either direction.</p>

        <h3>Historical Signal Review</h3>
        <p>The Historical Signals tab shows past AI signal output with actual SPX outcomes annotated. Use this to calibrate your confidence in the model. Look for the types of market environments where the signal has historically been most accurate versus least accurate. You will likely find the model performs well in trending, low-volatility environments and less reliably during sharp macro-driven spikes in either direction.</p>
      </div>
    ),
  },

  /* ─── REPORTS ─── */
  {
    id: 'performance-reports',
    category: 'reports',
    title: 'Automated Performance Reports & Telegram Distribution',
    summary: 'Set up, configure, and distribute automated PDF performance reports to your Telegram subscriber channels.',
    readTime: '8 min read',
    badge: 'Analyzer Only',
    badgeColor: 'bg-violet-500/20 text-violet-300 border border-violet-500/30',
    mockup: <ReportsMockup />,
    content: (
      <div className="prose-article">
        <p>Automated performance reports are one of AnalyzingHub's most powerful subscriber retention tools. A professional, data-rich weekly report sent automatically to your Telegram channel demonstrates consistency, builds trust, and gives subscribers tangible evidence of the value they are paying for. The reports system handles the entire process — from data aggregation to PDF generation to Telegram delivery — without any manual intervention once configured.</p>

        <h3>Report Architecture</h3>
        <p>Each report is generated from your closed trade data for the specified period (daily, weekly, or monthly). The report includes: a performance summary header (trades closed, win rate, net P&L, best trade, worst trade), an equity curve chart visualising P&L accumulation across the period, a trade-by-trade breakdown table showing each closed position with entry, exit, gain/loss, and duration, a symbol-level performance summary, and a brief Analyzer commentary section where you can add context about the period.</p>
        <p>Reports are generated in both English and Arabic versions simultaneously if you have the bilingual option enabled. The Arabic version uses proper RTL (right-to-left) layout throughout, including the data tables and charts.</p>

        <h3>Step 1: Connect Telegram</h3>
        <p>Navigate to <strong>Settings → Telegram Integration</strong>. You need two things: a Telegram Bot API token and your channel's chat ID.</p>
        <p>To create a bot, open Telegram and message @BotFather. Send /newbot, follow the prompts to name your bot, and copy the API token it provides. To get your channel ID, add @username_to_id_bot to your Telegram channel as an administrator, message it, and it will reply with your channel's numeric ID (typically a negative number like -1001234567890).</p>
        <p>Enter both values in Settings → Telegram Integration and click <strong>Verify Connection</strong>. The platform sends a test message to your channel. If the message appears, the integration is working. If not, the most common issue is that your bot is not an administrator of the channel — open your Telegram channel settings, go to Administrators, and add your bot with permission to post messages.</p>

        <h3>Step 2: Configure Report Settings</h3>
        <p>Navigate to <strong>Indices Hub → Daily Reports → Settings</strong>. The settings page has several options:</p>
        <p><strong>Report Period</strong>: Daily (sent each evening for that day's closed trades), Weekly (sent Sunday evening for the week), or Monthly (sent the last day of each month). Most Analyzers find weekly reports provide the best balance of frequency and data richness.</p>
        <p><strong>Language</strong>: English only, Arabic only, or Bilingual (two separate PDF files sent sequentially to the channel). Bilingual is recommended for Analyzers with both English and Arabic-speaking subscribers.</p>
        <p><strong>Send Time</strong>: The time at which the report is generated and sent. Choose a time after market close for daily reports (6:00 PM ET is popular). For weekly reports, Sunday evening at 8:00 PM local time is typical.</p>
        <p><strong>Timezone</strong>: Your local timezone for scheduling purposes. The platform converts to UTC internally — always verify the send time reflects your local business hours.</p>
        <p><strong>Include Commentary</strong>: If enabled, a text field appears in the Reports section each period for you to add your forward-looking commentary. This is included in the PDF as an Analyzer Notes section and significantly improves subscriber engagement.</p>

        <h3>Step 3: Preview and Test</h3>
        <p>Before enabling automatic dispatch, click <strong>Generate Preview</strong>. This renders the current period's report as a PDF and displays it in-browser. Review it carefully: check that your name and profile photo appear correctly, that all trades are captured, that the equity curve looks accurate, and that the formatting appears professional.</p>
        <p>Click <strong>Send Test to Telegram</strong> to dispatch the preview report to your channel. Ask a trusted contact to review it as a subscriber would see it. Common issues at this stage: the bot's message permissions were not set correctly (report arrives as a file, no text message attached), or the report is empty because no trades were closed in the selected period (log a test trade and close it if needed).</p>

        <h3>Step 4: Enable Automatic Dispatch</h3>
        <p>Toggle <strong>Auto-Send Enabled</strong> to the on position. From this point forward, the system will automatically generate and send reports on your configured schedule without any action required from you. You can view all generated reports (including past ones) in the Reports history table, where each report shows its generation date, delivery status, and a link to download or re-send.</p>

        <h3>Manual Report Generation</h3>
        <p>At any time, you can generate a report for a custom date range from the Reports page. Select Start Date and End Date, choose the output format (PDF, HTML, or PNG image card), and click Generate. This is useful for generating monthly summaries for your own records, creating reports for specific trading campaigns, or producing a shareable performance card for social media.</p>
        <p>The PNG image card format produces a single, professionally formatted image showing your key statistics. This is optimised for posting on Twitter/X, Instagram, or Telegram directly without the PDF overhead — ideal for sharing highlights from exceptional performance periods.</p>
      </div>
    ),
  },

  /* ─── RANKINGS ─── */
  {
    id: 'rankings-leaderboard',
    category: 'rankings',
    title: 'Rankings & Leaderboard System',
    summary: 'How the leaderboard works, how your score is calculated, and strategies for improving your ranking over time.',
    readTime: '6 min read',
    mockup: <RankingsMockup />,
    content: (
      <div className="prose-article">
        <p>The Rankings system is AnalyzingHub's community meritocracy — a continuously updated leaderboard that ranks Analyzers by a composite score reflecting the quality and consistency of their market analyses. It is the primary discovery mechanism for Traders looking for top performers to follow and subscribe to.</p>

        <h3>How the Ranking Score is Calculated</h3>
        <p>The ranking score is a weighted composite of four components, each normalised on a 0–100 scale:</p>
        <p><strong>Win Rate (40% weight)</strong> — Your percentage of analyses that closed in profit. This carries the highest weight because it is the most direct measure of analytical accuracy. However, win rate alone can be gamed (by only publishing easy, high-probability but low-reward setups), which is why R:R is weighted as well.</p>
        <p><strong>Average Risk-Reward (30% weight)</strong> — The average R:R ratio across all your published analyses. This rewards Analyzers who identify high-conviction opportunities with genuine upside potential, not just those who publish safe, small-target setups to protect their win rate.</p>
        <p><strong>Trade Count (15% weight)</strong> — The number of closed analyses in the time period. Minimum statistical significance requires at least 20 closed analyses for a score to appear on the leaderboard. This prevents Analyzers with two lucky trades from outranking those with hundreds of verified results.</p>
        <p><strong>Subscriber Count (15% weight)</strong> — The size of your active subscriber base. This reflects community trust and market validation of your expertise.</p>
        <p>The formula is: Score = (Win Rate Component × 0.4) + (R:R Component × 0.3) + (Trade Count Component × 0.15) + (Subscriber Component × 0.15).</p>

        <h3>Time Period Filters</h3>
        <p>The leaderboard has three time filters: <strong>All Time</strong>, <strong>This Month</strong>, and <strong>This Week</strong>. All Time provides the most statistically reliable ranking — it is based on the complete history of all analyses ever published. This Month is useful for identifying Analyzers who are hot right now and may be particularly well-adapted to current market conditions. This Week is highly volatile (small sample sizes) and should be interpreted cautiously.</p>
        <p>The monthly leaderboard resets on the first of each month. All Time is cumulative and never resets. Your ranking on each time frame may differ significantly — a strong all-time Analyzer might have had a difficult recent month, while a newer Analyzer might be scoring well in the short-term but lack the track record for a high all-time ranking.</p>

        <h3>Browsing and Discovering Analyzers</h3>
        <p>The leaderboard shows each Analyzer's ranking position, display name, win rate, net P&L for the period, ranking score, and active subscriber count. Click any row to open that Analyzer's public profile, where you can see their complete analysis history, performance charts, and subscription tiers. The leaderboard also supports filtering by asset class specialisation — filter to "Indices" to find top-ranked SPX and NDX traders specifically.</p>

        <h3>Improving Your Ranking</h3>
        <p>The most reliable path to a higher ranking is publishing more high-quality analyses and building genuine subscriber relationships. Shortcuts — such as publishing many small-risk analyses to protect win rate — are visible in the data. The R:R component penalises Analyzers who consistently publish 1:1 or lower risk-reward setups.</p>
        <p>Focus on the following: Wait for high-conviction setups (fewer, better analyses outperform more, mediocre ones). Always define clear stops and realistic targets (tight stops and ambitious targets increase R:R naturally). Build your subscriber base organically by consistently delivering value — a growing subscriber count compounds the subscriber component of your score month over month. Engage with comments on your analyses — Analyzers who respond to subscriber questions maintain higher subscriber retention rates.</p>
      </div>
    ),
  },

  /* ─── ACCOUNT ─── */
  {
    id: 'settings-guide',
    category: 'account',
    title: 'Settings Reference & Account Management',
    summary: 'Complete reference for every settings section — account, profile, notifications, Telegram, appearance, and billing.',
    readTime: '6 min read',
    mockup: <SettingsMockup />,
    content: (
      <div className="prose-article">
        <p>The Settings area is the control panel of your AnalyzingHub account. It covers everything from your public profile to notification thresholds to billing management. This guide documents every settings section and what each option controls.</p>

        <h3>Settings → Account</h3>
        <p>The Account section manages your core identity on the platform. Your <strong>Display Name</strong> is shown across all your analyses, profile pages, and Telegram messages. Choose a name that is professional and consistent with how you want to be known in the trading community — this name becomes your brand.</p>
        <p>Your <strong>Email Address</strong> is used for OTP authentication codes and important account notifications. Changing your email requires OTP verification from both the old and new email addresses. The <strong>Account Deletion</strong> option at the bottom of this section permanently removes your account, all analyses, trades, and subscriber data after a 14-day cooling-off period.</p>

        <h3>Settings → Profile</h3>
        <p>Profile settings control your public-facing identity. Your <strong>Bio</strong> (up to 500 characters) appears on your public profile and in Telegram reports. Your <strong>Profile Photo</strong> appears on every analysis card you publish, in the leaderboard, and in Telegram report headers. <strong>Specialisation Tags</strong> (up to 6) categorise your expertise and appear as searchable filters in the Analyzer directory. <strong>Social Links</strong> allow you to add links to your Twitter/X profile or personal website, which appear on your public profile.</p>

        <h3>Settings → Notifications</h3>
        <p>Twelve individual notification types can be toggled independently. The critical ones for active traders are: Price Target Reached, Stop Loss Hit, and New Subscriber. Price movement threshold (default 1%) controls the sensitivity of price alerts. Browser notification permission can be granted or revoked here — granting it enables desktop alerts even when AnalyzingHub is a background tab. Email notification frequency controls how often batched notification emails are sent (immediate, hourly digest, or daily digest).</p>

        <h3>Settings → Telegram Integration</h3>
        <p>This section manages the Telegram bot connection. Required inputs: Bot API Token (from @BotFather) and Channel Chat ID (a negative integer). Optional: Alert Message Template, which lets you customise the format of analysis alerts sent to your channel. The template supports variables: {'{'}symbol{'}'}, {'{'}direction{'}'}, {'{'}entry{'}'}, {'{'}target1{'}'}, {'{'}stop{'}'}, {'{'}rr{'}'}, {'{'}thesis{'}'}. Click Verify Connection to send a test message confirming the integration is active. Click Disconnect to remove the integration without deleting bot or channel settings.</p>

        <h3>Settings → Appearance</h3>
        <p>Toggle between Dark Mode (Bloomberg terminal aesthetic, default) and Light Mode (clean professional light interface). The theme setting is stored in your browser's local storage and persists across sessions. Language selection (English or Arabic) switches the entire interface including the sidebar, headers, buttons, and form labels. Note: the language setting affects the interface only — the content of analyses is always shown in the language it was written in.</p>

        <h3>Settings → Billing</h3>
        <p>Billing settings are visible for Analyzers only. This section shows your current subscription tier configuration, the pricing and features of each tier you have created, active subscriber count per tier, monthly recurring revenue estimate, and payment history. Note that AnalyzingHub processes subscription payments through a payment gateway integration — contact support if you need to update banking details or have payment disputes.</p>

        <h3>Security Best Practices</h3>
        <p>AnalyzingHub uses OTP (one-time password) authentication — you never set a permanent password. Every login requires a 6-digit code sent to your email. This means even if your email is compromised, an attacker cannot access your account without also accessing your email in real time during a login attempt. Enable login notifications (Settings → Notifications) to receive an email whenever a new session begins from an unrecognised device.</p>
        <p>If you believe your account has been accessed without authorisation, contact support immediately. Support can invalidate all active sessions, requiring a fresh OTP login from all devices.</p>
      </div>
    ),
  },
];

/* ═══════════════════════════════════════════════════════════════════
   ARABIC TRANSLATIONS — keyed by article id
═══════════════════════════════════════════════════════════════════ */
const AR_ARTICLES: Record<string, {
  title: string; summary: string; readTime: string; badge?: string; content: React.ReactNode;
}> = {
  'platform-overview': {
    title: 'نظرة عامة على المنصة: ما هو AnalyzingHub؟',
    summary: 'مقدمة شاملة لمحطة استخبارات التداول AnalyzingHub — الأدوار والميزات وما يميزها عن غيرها.',
    readTime: '٥ دقائق قراءة',
    content: (
      <div className="prose-article" dir="rtl">
        <p>AnalyzingHub هي منصة استخبارات تداول احترافية صُممت لردم الهوة بين محللي السوق والمتداولين النشطين. على خلاف تطبيقات التداول الاجتماعي التقليدية، تقوم المنصة على مفهوم <strong>التحليلات السوقية المنظمة والموثقة</strong> — لا مجرد منشورات عابرة.</p>
        <h3>الفلسفة الجوهرية</h3>
        <p>كل تحليل يُنشر على المنصة يلتزم ببنية موحدة: رمز محدد، توجه اتجاهي (شراء أو بيع)، سعر دخول، أهداف ربح، ووقف خسارة. تفرض هذه البنية الانضباط وتجعل تتبع الأداء دقيقاً رياضياً. المنصة تتابع كل ذلك تلقائياً، فتبني سجل أداء حقيقياً وموثقاً لكل محلل.</p>
        <h3>نوعان من المستخدمين</h3>
        <p><strong>المحللون (Analyzers)</strong> هم منشئو المحتوى: ينشرون التحليلات، يبنون قاعدة مشتركين، ويحققون دخلاً من خبرتهم عبر مستويات الاشتراك المدفوعة. يمتلكون أدوات كاملة: إنشاء التحليلات، تدوين الصفقات، التقارير، تكامل Telegram، ومحطة مركز المؤشرات.</p>
        <p><strong>المتداولون (Traders)</strong> هم المستهلكون والممارسون: يتابعون المحللين، يشتركون في المحتوى المميز، ويديرون مجلات صفقاتهم الخاصة، ويبنون سجلات أدائهم بمرور الوقت.</p>
        <h3>ما يميز AnalyzingHub</h3>
        <ul>
          <li><strong>تتبع الأداء الموثق</strong> — معدلات الفوز وإحصائيات الربح والخسارة مبنية على نتائج فعلية لا تقارير ذاتية</li>
          <li><strong>واجهة مستوحاة من Bloomberg</strong> — مصممة للسرعة وكثافة البيانات</li>
          <li><strong>دعم ثنائي اللغة</strong> — واجهة كاملة بالإنجليزية والعربية مع تخطيط RTL</li>
          <li><strong>تكامل Telegram</strong> — تقارير آلية وتنبيهات فورية لمشتركيك</li>
          <li><strong>ذكاء SPX</strong> — إشارات S&P 500 مدعومة بالذكاء الاصطناعي</li>
        </ul>
        <h3>قائمة تحقق البدء</h3>
        <p>قبل التعمق في الميزات: (١) أكمل ملفك الشخصي بصورة وسيرة ذاتية. (٢) كوّن تفضيلات الإشعارات. (٣) إن كنت محللاً، اربط قناة Telegram وأنشئ مستوى اشتراك واحداً على الأقل. (٤) قم بجولة المنصة التفاعلية من هذه الصفحة. (٥) انشر أول تحليل أو افتح أول إدخال في مجلة الصفقات.</p>
      </div>
    ),
  },
  'account-setup': {
    title: 'إعداد الحساب وتهيئة الملف الشخصي',
    summary: 'دليل خطوة بخطوة لإعداد حساب AnalyzingHub وملفك الشخصي وإشعاراتك وتكامل Telegram.',
    readTime: '٧ دقائق قراءة',
    content: (
      <div className="prose-article" dir="rtl">
        <p>ملفك الشخصي على AnalyzingHub هو هويتك التداولية الاحترافية. للمحللين، الملف المكتمل يؤثر مباشرة في اكتساب المشتركين. للمتداولين، يحدد موقعك في لوحة المتصدرين المجتمعية.</p>
        <h3>الخطوة ١: أكمل ملفك الشخصي</h3>
        <p>انتقل إلى <strong>ملفي الشخصي ← تعديل الملف</strong>. ستجد حقولاً لاسمك وسيرتك الذاتية وتخصصاتك. يقبل حقل السيرة حتى ٥٠٠ حرف — استخدمه بحكمة لوصف أسلوبك التداولي وإدارة المخاطر. الملفات التي تحتوي صورة تحصل على استفسارات اشتراك أكثر بكثير من تلك التي بلا صورة.</p>
        <h3>الخطوة ٢: إضافة وسوم التخصص</h3>
        <p>وسوم مثل "تداول التأرجح"، "الخيارات"، "التحليل الفني"، "SPX" تظهر على ملفك العام وتجعلك قابلاً للاكتشاف. أضف ثلاثة إلى ستة وسوم تعكس خبرتك الحقيقية.</p>
        <h3>الخطوة ٣: تهيئة الإشعارات</h3>
        <p>اذهب إلى <strong>الإعدادات ← الإشعارات</strong>. ستجد مفاتيح تبديل لكل فئة: وصول هدف السعر، تفعيل وقف الخسارة، مشترك جديد، إعجاب بتحليل، وتقرير يومي. فعّل ما يهمك وعطّل الباقي — التشبع من الإشعارات حقيقي.</p>
        <h3>الخطوة ٤: ربط Telegram (للمحللين)</h3>
        <p>انتقل إلى <strong>الإعدادات ← تكامل Telegram</strong>. ستحتاج إلى توكن API من @BotFather ومعرّف قناتك. أدخل القيمتين واضغط "التحقق من الاتصال". ستتلقى رسالة اختبار للتأكيد.</p>
        <h3>الخطوة ٥: عرض ملفك العام</h3>
        <p>انقر "عرض الملف العام" في أي وقت لترى ما يراه المشتركون المحتملون: سيرتك، إجمالي التحليلات، معدل الفوز، عدد المشتركين، وتغذية تحليلاتك المنشورة. الصفقات الخاصة لا تظهر أبداً.</p>
      </div>
    ),
  },
  'dashboard-overview': {
    title: 'لوحة التحكم: مركز قيادة التداول',
    summary: 'تعمق في كل لوحة ومقياس وعنصر على لوحة التحكم الرئيسية — وكيفية تفسيرها بدقة.',
    readTime: '٨ دقائق قراءة',
    content: (
      <div className="prose-article" dir="rtl">
        <p>لوحة التحكم هي الشاشة الأولى التي تراها بعد تسجيل الدخول، ومحور سير العمل اليومي. صُممت لإعطائك نظرة فورية كثيفة على أداء التداول والنشاط المجتمعي وبيانات السوق الحية — دون الحاجة للتنقل.</p>
        <h3>شريط السوق العالمي</h3>
        <p>يعرض الشريط العلوي أسعاراً حية لـ SPX و NDX و DJI و VIX وعدة أسهم رئيسية. القيم الخضراء تشير إلى ارتفاع الأداة فوق إغلاق الجلسة السابقة، والحمراء إلى انخفاضها. قراءة VIX مهمة بشكل خاص — فوق ٢٠ يشير إلى خوف مرتفع في السوق.</p>
        <h3>صف مقاييس الأداء</h3>
        <p><strong>إجمالي الربح والخسارة</strong>: مجموع المكاسب والخسائر المحققة لجميع الصفقات المغلقة. لا يشمل المكاسب غير المحققة.</p>
        <p><strong>معدل الفوز</strong>: (عدد الصفقات الرابحة المغلقة ÷ إجمالي الصفقات المغلقة) × ١٠٠. اقرأه دائماً جنباً إلى جنب مع نسبة R:R المتوسطة.</p>
        <p><strong>الصفقات النشطة</strong>: مراكزك المفتوحة حالياً. تتحدث شبه فورياً مع تحرك الأسعار.</p>
        <h3>تغذية التحليلات الأخيرة</h3>
        <p>المنطقة الرئيسية تعرض تحليلات المحللين الذين تتابعهم. كل بطاقة تظهر الرمز، التوجه، سعر الدخول، الأهداف، ووقف الخسارة مع المسافة عن السعر الحالي.</p>
        <h3>لوحة الصفقات النشطة</h3>
        <p>تعرض نسخة مدمجة من مجلة صفقاتك المفتوحة: سعر الدخول، السعر الحالي، الربح/الخسارة غير المحققة، والمسافة إلى وقف الخسارة وأقرب هدف. الصفوف الخضراء رابحة، والحمراء خاسرة.</p>
        <h3>تخصيص العرض</h3>
        <p>تدعم التغذية التصفية حسب نوع التحليل، والمحللين المتابعين فقط، أو التحليلات المحفوظة. يمكن تغيير ترتيب الفرز إلى الأحدث، الأقدم، أعلى معدل فوز، أو الأكثر إعجاباً. تُحفظ هذه الإعدادات للجلسة التالية.</p>
      </div>
    ),
  },
  'notifications-guide': {
    title: 'مركز الإشعارات وتنبيهات الأسعار',
    summary: 'تهيئة وإدارة والتصرف بناءً على الإشعارات وتنبيهات الأسعار الفورية لجميع أدواتك المتتبعة.',
    readTime: '٥ دقائق قراءة',
    content: (
      <div className="prose-article" dir="rtl">
        <p>نظام الإشعارات هو الجهاز العصبي الفوري لـ AnalyzingHub. تنبيهات الأسعار وأحداث المشتركين وتحديثات المنصة كلها تتدفق عبر مركز إشعارات واحد.</p>
        <h3>أنواع الإشعارات</h3>
        <p><strong>تنبيهات الأسعار</strong>: تُطلق عندما يتجاوز سعر أداة متتبعة مستوى حددته — منطقة الدخول أو هدف الربح أو وقف الخسارة. حساسة للوقت ويجب التصرف فوراً.</p>
        <p><strong>إشعارات نتيجة التحليل</strong>: تُطلق تلقائياً عند تحقيق هدف أو تفعيل وقف خسارة. يتلقاها المحلل وجميع المشتركين الذين أضافوا التحليل لقائمة المراقبة.</p>
        <p><strong>أحداث المشتركين</strong>: تُعلم المحللين عند انضمام مشترك جديد أو تجديد اشتراك أو إلغائه.</p>
        <p><strong>إشعارات النظام</strong>: تغطي ميزات جديدة، صيانة مجدولة، وأحداث أمان الحساب.</p>
        <h3>تهيئة حدود التنبيه</h3>
        <p>انتقل إلى <strong>الإعدادات ← الإشعارات</strong>. عتبة حركة السعر تتحكم في حجم الحركة اللازمة قبل إطلاق التنبيه. ١-٢٪ مناسب لمعظم متداولي الأسهم. يستخدم متداولو الخيارات غالباً ٠.٥٪ بسبب حساسيتهم الأعلى للوقت.</p>
        <h3>إدارة درج الإشعارات</h3>
        <p>انقر أيقونة الجرس لفتح الدرج. استخدم التبويبات للتصفية: الكل، تنبيهات الأسعار، أحداث المشتركين، والنظام. انقر أي إشعار للانتقال مباشرة إلى التحليل أو الصفقة ذات الصلة.</p>
        <h3>إشعارات المتصفح</h3>
        <p>إذا منحت إذن إشعارات المتصفح، ستظهر تنبيهات الأسعار الحرجة كإشعارات سطح مكتب حتى عندما لا تكون AnalyzingHub هي التبويب النشط. يُنصح بهذا بشدة للمتداولين النشطين.</p>
      </div>
    ),
  },
  'creating-analysis': {
    title: 'إنشاء تحليل سوقي احترافي',
    summary: 'الدليل الكامل لنشر تحليل سوقي منظم وعالي الجودة — من اختيار الرمز إلى النشر.',
    readTime: '١٠ دقائق قراءة',
    badge: 'للمحللين فقط',
    content: (
      <div className="prose-article" dir="rtl">
        <p>نشر تحليل سوقي على AnalyzingHub هو النشاط الجوهري للمحللين. التحليل الجيد يحقق ثلاثة أهداف: يوصل أطروحتك بوضوح للمشتركين، يخلق سجلاً محاسبياً لحكمك، ويرسّخ مكانتك كمحترف يمكن التحقق من أدائه.</p>
        <h3>قبل البدء: انضباط التحليل</h3>
        <p>الخطأ الأكثر شيوعاً هو النشر بكثرة أو بدون اقتناع كافٍ. لا يمكن حذف تحليل منشور — هذه المحاسبة مقصودة. قبل فتح النموذج، اسأل نفسك: هل سأخاطر برأس مال حقيقي على هذا الإعداد؟ إذا لم تكن الإجابة نعم فورية، التحليل ليس جاهزاً.</p>
        <h3>الخطوة ١: اختر رمزك</h3>
        <p>انتقل إلى <strong>الأسهم ← إنشاء تحليل</strong> أو اضغط ⌘N. ابدأ بكتابة الرمز في الحقل المخصص. تبحث المنصة فورياً في جميع أسهم NYSE و NASDAQ والصناديق المتداولة والمؤشرات الرئيسية.</p>
        <h3>الخطوة ٢: حدد الاتجاه ومستويات الأسعار</h3>
        <p>اختر <strong>شراء</strong> للتوقع الصعودي أو <strong>بيع</strong> للتوقع الهبوطي. حدد: سعر الدخول (المستوى الفعلي للدخول لا السعر الحالي)، الأهداف (بناءً على المقاومات ومستويات فيبوناتشي)، ووقف الخسارة (حيث تبطل أطروحتك). نسبة R:R بمقدار ٢:١ أو أكثر هي المعيار الاحترافي.</p>
        <h3>الخطوة ٣: اكتب أطروحتك</h3>
        <p>اشرح "لماذا" وراء مستويات أسعارك: النمط الفني، المستويات الرئيسية، الإطار الزمني، المحفزات القادمة، والشروط التي تبطل أطروحتك. استهدف ١٥٠-٣٠٠ كلمة. استخدم مراجع سعرية محددة.</p>
        <h3>الخطوة ٤: الرؤية والنشر</h3>
        <p>اختر <strong>عام</strong> أو <strong>للمشتركين فقط</strong>. انقر <strong>نشر التحليل</strong>. يظهر التحليل فوراً في التغذية المجتمعية. إذا كان تكامل Telegram نشطاً، يُرسل تنبيه لقناتك خلال ٣٠ ثانية.</p>
      </div>
    ),
  },
  'analysis-feed': {
    title: 'التنقل في تغذية التحليل',
    summary: 'كيفية تصفية وفرز والتفاعل مع والاستفادة القصوى من تغذية التحليل المجتمعية.',
    readTime: '٦ دقائق قراءة',
    content: (
      <div className="prose-article" dir="rtl">
        <p>تغذية التحليل هي قلب مجتمع AnalyzingHub — بث مباشر للتحليلات من المحللين الذين تتابعهم والمجتمع الأوسع. إتقان التنقل فيها هو المهارة الأساسية للمتداولين الذين يستخدمون المنصة لاستقاء أفكار الصفقات.</p>
        <h3>تكوين التغذية</h3>
        <p>افتراضياً، تعرض التغذية تحليلات من جميع المحللين مرتبة بالأحدث أولاً. يمكنك تضييق ذلك للمحللين الذين تتابعهم فقط باستخدام فلتر "المتابَعون فقط". كل بطاقة تعرض: اسم المحلل ومعدل فوزه، الرمز والاتجاه، سعر الدخول والأهداف ووقف الخسارة، نسبة R:R، وتاريخ النشر والحالة الحالية.</p>
        <h3>خيارات التصفية</h3>
        <p>يدعم لوح التصفية عدة فلاتر متزامنة: <strong>الحالة</strong> (نشط، مغلق بربح، مغلق بخسارة)، <strong>الاتجاه</strong> (شراء، بيع)، <strong>فئة الأصول</strong> (أسهم، مؤشرات، صناديق)، <strong>الإطار الزمني</strong> (يومي، تأرجح، مراكز).</p>
        <h3>التفاعل مع التحليلات</h3>
        <p>اضغط <strong>الإعجاب</strong> لتأييد تحليل وتعزيز ظهوره. اضغط <strong>الحفظ</strong> لإضافته لقائمة مراقبتك. اضغط <strong>المشاركة</strong> لنسخ رابط عام. اضغط <strong>تعليق</strong> لترك ملاحظة — يُعلم المحللون بالتعليقات الجديدة. اضغط أيقونة <strong>الجرس</strong> على أي بطاقة للاشتراك في تنبيهات سعر ذلك التحليل تحديداً.</p>
        <h3>فتح التحليل الكامل</h3>
        <p>انقر في أي مكان على البطاقة (خارج أزرار الإجراءات) لفتح عرض التحليل التفصيلي: النص الكامل، الرسوم البيانية، جدول مستويات الأسعار، سلسلة التعليقات، وملخص ملف المحلل. من العرض الكامل يمكنك ربط التحليل بصفقة في مجلتك.</p>
      </div>
    ),
  },
  'trade-journal': {
    title: 'مجلة الصفقات: تسجيل المراكز وتتبعها',
    summary: 'كيفية تسجيل الصفقات وإعداد مراقبة المراكز وإدارة الإغلاقات الجزئية والحفاظ على مجلة تداول احترافية.',
    readTime: '٩ دقائق قراءة',
    content: (
      <div className="prose-article" dir="rtl">
        <p>مجلة الصفقات هي دفتر أداءك الخاص على AnalyzingHub. على خلاف التحليلات المنشورة العامة، مجلة صفقاتك خاصة تماماً — أنت وحدك من يراها. تخدم المجلة غرضين: مراقبة المراكز الآنية وتتبع الأداء التاريخي.</p>
        <h3>فلسفة التدوين</h3>
        <p>المتداولون المحترفون يدونون كل صفقة لأن عملية التسجيل تفرض الوضوح. قبل تسجيل أي صفقة يجب الإجابة على: ما الرمز؟ ما الاتجاه؟ ما سعر الدخول؟ ما وقف الخسارة؟ ما الأهداف؟ هذه الأسئلة تُصفي الدخولات الاندفاعية غير المخططة.</p>
        <h3>فتح صفقة جديدة</h3>
        <p>انتقل إلى <strong>الصفقات</strong> في الشريط الجانبي. انقر <strong>+ صفقة جديدة</strong>. في الحوار ستجد: الرمز، الاتجاه، سعر الدخول (استخدم دخولك الفعلي)، حجم المركز، وقف الخسارة، الأهداف، ربط بتحليل (اختياري)، وملاحظات.</p>
        <h3>مراقبة المراكز الحية</h3>
        <p>بعد تسجيل الصفقة تظهر في مراقب الصفقات ببيانات أسعار حية. لكل صفقة مفتوحة: الربح/الخسارة غير المحقق، المسافة إلى وقف الخسارة، المسافة إلى الهدف، وعمر الصفقة بالأيام.</p>
        <h3>إدارة المراكز المفتوحة</h3>
        <p>انقر أي صفقة للوصول إلى: <strong>تعديل وقف الخسارة</strong> (حركه إلى نقطة التعادل أو تتبع المكاسب)، <strong>إغلاق جزئي</strong> (أغلق نسبة من مركزك عند الهدف الأول)، <strong>إضافة للمركز</strong> (سجّل دخولاً إضافياً)، و<strong>إغلاق كامل</strong> (أدخل سعر الخروج الفعلي).</p>
        <h3>تحليلات أداء الصفقات</h3>
        <p>تبويب <strong>الأداء</strong> يعرض إحصاءاتك المجمعة: معدل الفوز، متوسط الكسب، متوسط الخسارة، عامل الربح، الحد الأقصى للتراجع، ومتوسط R:R — كلها محسوبة تلقائياً من تاريخ صفقاتك المغلقة.</p>
      </div>
    ),
  },
  'performance-analytics': {
    title: 'تحليلات الأداء ولوحة التحكم المالية',
    summary: 'فهم معدل الفوز ومنحنيات الربح والخسارة ومقاييس التراجع وكيفية استخدام التحليلات لتحسين تداولك.',
    readTime: '٧ دقائق قراءة',
    content: (
      <div className="prose-article" dir="rtl">
        <p>لوحة التحكم المالية هي المكان الذي تتحول فيه بيانات الصفقات الخام إلى استخبارات قابلة للتنفيذ حول أدائك. تتجاوز أرقام الربح والخسارة البسيطة لتكشف الأنماط والمزايا والنقاط الضعيفة في نهجك.</p>
        <h3>منحنى الأسهم</h3>
        <p>منحنى الأسهم هو أهم رسم بياني في تحليلات أدائك. يرسم القيمة التراكمية لحساب تداولك عبر الزمن مع كل صفقة مغلقة. ابحث عن نعومة المنحنى — المنحنى المتصاعد بسلاسة يشير إلى تحجيم مراكز واتساق في إدارة المخاطر.</p>
        <h3>معدل الفوز مقابل التوقع</h3>
        <p>معدل الفوز هو الإحصاء الأكثر استشهاداً والأكثر سوء فهم. معدل فوز ٧٠٪ ممتاز — إذا كان متوسط ربحك أكبر من متوسط خسارتك. الإحصاء المهم هو <strong>التوقع</strong>: (معدل الفوز × متوسط الكسب) − (معدل الخسارة × متوسط الخسارة). أي نظام تداول يجب أن يكون له توقع إيجابي ليكون مستداماً.</p>
        <h3>عامل الربح</h3>
        <p>عامل الربح = إجمالي الأرباح الإجمالية ÷ إجمالي الخسائر الإجمالية. عامل ١.٠ يعني التعادل. عامل ١.٥ يعني أنك تكسب ١.٥ دولار لكل دولار تخسره. أنظمة التداول الاحترافية تستهدف عاملاً بين ١.٣-١.٨ كهدف مستدام.</p>
        <h3>تحليل التراجع</h3>
        <p>الحد الأقصى للتراجع (MDD) هو أكبر انخفاض من قمة إلى قاع في منحنى أسهمك. التراجع فوق ٢٠٪ صعب على معظم المتداولين تحمّله دون اتخاذ قرارات عاطفية تزيد الخسائر.</p>
        <h3>تحليل مستوى الرمز والوقت</h3>
        <p>جدول تفصيل الرموز يكشف أنماطاً غير متوقعة — قد تجد معدل فوز ٨٠٪ على تحليلات AAPL لكن ٤٥٪ فقط على TSLA. التصرف بناءً على هذه الرؤية والتركيز فقط على الأدوات التي لديك فيها ميزة حقيقية هو أحد أعلى التحسينات تأثيراً.</p>
      </div>
    ),
  },
  'indices-terminal': {
    title: 'مركز المؤشرات: المحطة الاحترافية للمؤشرات',
    summary: 'إتقان محطة المؤشرات متعددة الأجزاء — شريط السوق وتغذية التحليل واللوحة اليمنى وبيانات تدفق الخيارات.',
    readTime: '١٠ دقائق قراءة',
    content: (
      <div className="prose-article" dir="rtl">
        <p>مركز المؤشرات هو الواجهة الأكثر تطوراً في AnalyzingHub — محطة متعددة الأجزاء مستوحاة من Bloomberg، مصممة خصيصاً لتداول وتحليل المؤشرات الرئيسية: SPX وNDX وDJI وVIX والأدوات ذات الصلة.</p>
        <h3>لماذا محطة مؤشرات مخصصة؟</h3>
        <p>تداول المؤشرات مختلف جوهرياً عن تداول الأسهم الفردية. تتأثر المؤشرات بقوى كلية — سياسة الاحتياطي الفيدرالي، إصدارات البيانات الاقتصادية، الأحداث الجيوسياسية. لها أيضاً نظم مشتقات (خيارات، عقود آجلة) أضخم بكثير من أي سهم فردي.</p>
        <h3>شريط السوق العالمي</h3>
        <p>يُظهر الشريط العلاقة بين المؤشرات: عندما يرتفع SPX ١٪ ويرتفع VIX ٢٪ في آنٍ واحد، هذا تباعد غير معتاد يسبق عادةً ارتفاعاً في التقلبات. VIX دون ١٥ يشير إلى بيئة هادئة. VIX فوق ٣٠ يشير إلى خوف مرتفع.</p>
        <h3>لوحة التحليل اليسرى وبيانات تدفق الخيارات</h3>
        <p>اللوحة اليسرى تعرض التحليلات الخاصة بالمؤشرات. انقر أي تحليل لتحميله في اللوحة اليمنى دون مغادرة المحطة. هذا العرض الجانبي هو ميزة الكفاءة الأساسية للمحطة.</p>
        <p>قسم تدفق الخيارات يكشف النشاط غير المعتاد في سوق مشتقات المؤشرات: نوع المعاملة (شراء/بيع)، سعر التنفيذ وتاريخ الانتهاء، القيمة الدولارية التقديرية. المسوح الكبيرة للمشتريات فوق مستويات المقاومة تشير إلى تموضع مؤسسي صعودي.</p>
      </div>
    ),
  },
  'spx-intelligence': {
    title: 'ذكاء SPX: إشارات الذكاء الاصطناعي وتحليلات الخيارات',
    summary: 'دليل معمق لـ SPX Intelligence — الإشارات الذكية، تعرض غاما (GEX)، تدفق الخيارات، وكيفية استخدامها معاً.',
    readTime: '١٢ دقيقة قراءة',
    badge: 'متقدم',
    content: (
      <div className="prose-article" dir="rtl">
        <p>SPX Intelligence هي الميزة الأكثر تطوراً في AnalyzingHub — لوحة تحليلات كمية مبنية خصيصاً لسوق خيارات S&P 500. تجمع إشارات الاتجاه المدعومة بالذكاء الاصطناعي مع بيانات المستوى المؤسسي حول تعرض غاما ونسب الشراء/البيع وتدفق الخيارات غير المعتاد.</p>
        <h3>فهم تعرض غاما (GEX)</h3>
        <p>تعرض غاما هو أقوى المفاهيم — وأقلها فهماً — في تحليل سوق الخيارات الحديث. عندما يبيع صانعو السوق خيارات، يجب عليهم التحوط عن طريق شراء أو بيع المؤشر الأساسي. عندما يكون صانعو السوق في وضع غاما إيجابي (GEX+)، يشترون عند الهبوط ويبيعون عند الارتفاع — ما يكبت التقلبات. في وضع غاما سلبي (GEX-)، يضخمون التحركات ويزيدون التقلبات. بيئات GEX السلبية تنتج تحركات SPX السريعة الكبيرة.</p>
        <h3>قراءة إشارة الذكاء الاصطناعي</h3>
        <p>تجمع الإشارة اليومية مدخلات كمية متعددة في رأي اتجاهي واحد (صعودي، هبوطي، أو محايد) بنسبة ثقة. مستوى ثقة ٧٥٪+ يرتبط تاريخياً باحتمالية أعلى للاتجاه المشار إليه خلال ١-٣ جلسات. مستويات دون ٦٠٪ تشير إلى إشارات متضاربة — ينبغي أن تحمل مخرجات النموذج وزناً أقل.</p>
        <h3>تفسير تدفق الخيارات في السياق</h3>
        <p>الفرق الجوهري بين <strong>المسوح</strong> (أوامر تأخذ مستويات متعددة من دفتر الطلبات — تعطي أولوية للسرعة، تشير إلى الإلحاح) و<strong>الكتل</strong> (معاملات فردية كبيرة، غالباً تحوط مؤسسي). عندما ترى مسوح شراء متعددة عند نفس سعر التنفيذ في نفس اليوم، يشير ذلك في الغالب إلى رهان اتجاهي صعودي من مشاركين متطورين.</p>
        <h3>الجمع بين مجموعات البيانات الثلاث</h3>
        <p>تنشأ إشارات SPX الأعلى اقتناعاً عندما تتوافق البيانات الثلاث: إشارة الذكاء الاصطناعي صعودية، GEX يُظهر غاما إيجابية (تكبت التقلب الهبوطي)، وتدفق الخيارات يُظهر مسوح شراء. عند التعارض بين هذه العوامل، تكون الحذر مبرراً.</p>
      </div>
    ),
  },
  'performance-reports': {
    title: 'تقارير الأداء الآلية وتوزيع Telegram',
    summary: 'إعداد وتهيئة وتوزيع تقارير أداء PDF الآلية إلى قنوات مشتركي Telegram.',
    readTime: '٨ دقائق قراءة',
    badge: 'للمحللين فقط',
    content: (
      <div className="prose-article" dir="rtl">
        <p>تقارير الأداء الآلية هي واحدة من أقوى أدوات الاحتفاظ بالمشتركين في AnalyzingHub. تقرير أسبوعي احترافي مليء بالبيانات يُرسل تلقائياً لقناة Telegram الخاصة بك يُثبت الاتساق ويبني الثقة ويمنح المشتركين دليلاً ملموساً على قيمة ما يدفعون مقابله.</p>
        <h3>بنية التقرير</h3>
        <p>يُولَّد كل تقرير من بيانات صفقاتك المغلقة للفترة المحددة (يومياً أو أسبوعياً أو شهرياً). يتضمن: ملخص الأداء (الصفقات المغلقة، معدل الفوز، صافي الربح والخسارة)، رسم منحنى الأسهم، جدول الصفقات التفصيلي، وملخص الأداء حسب الرمز.</p>
        <h3>الخطوة ١: ربط Telegram</h3>
        <p>انتقل إلى <strong>الإعدادات ← تكامل Telegram</strong>. تحتاج إلى توكن API من @BotFather ومعرّف القناة. أدخل القيمتين واضغط <strong>التحقق من الاتصال</strong>. إذا لم تصل رسالة الاختبار، تأكد أن البوت مشرف في القناة بصلاحية نشر الرسائل.</p>
        <h3>الخطوة ٢: تهيئة إعدادات التقرير</h3>
        <p>انتقل إلى <strong>مركز المؤشرات ← التقارير ← الإعدادات</strong>: اختر <strong>دورة التقرير</strong> (يومي، أسبوعي، شهري)، <strong>اللغة</strong> (إنجليزي، عربي، أو ثنائي اللغة)، <strong>وقت الإرسال</strong>، والمنطقة الزمنية. خيار التعليق يضيف قسم ملاحظاتك للمشتركين.</p>
        <h3>الخطوة ٣: معاينة واختبار</h3>
        <p>انقر <strong>توليد معاينة</strong> لعرض التقرير الحالي كـ PDF في المتصفح. تحقق أن اسمك وصورتك وجميع الصفقات ظاهرة بشكل صحيح، ثم انقر <strong>إرسال اختبار إلى Telegram</strong>.</p>
        <h3>الخطوة ٤: تفعيل الإرسال التلقائي</h3>
        <p>فعّل <strong>الإرسال التلقائي</strong>. من هذه اللحظة يُولَّد النظام التقارير ويُرسلها تلقائياً وفق جدولك المحدد. يمكنك أيضاً توليد تقرير يدوي لنطاق تواريخ مخصص في أي وقت بصيغة PDF أو HTML أو صورة PNG.</p>
      </div>
    ),
  },
  'rankings-leaderboard': {
    title: 'نظام التصنيفات ولوحة المتصدرين',
    summary: 'كيفية عمل لوحة المتصدرين وكيفية حساب درجتك واستراتيجيات تحسين تصنيفك بمرور الوقت.',
    readTime: '٦ دقائق قراءة',
    content: (
      <div className="prose-article" dir="rtl">
        <p>نظام التصنيفات هو ميريقراطية مجتمع AnalyzingHub — لوحة متصدرين محدَّثة باستمرار تصنّف المحللين بدرجة مركبة تعكس جودة تحليلاتهم واتساقها. هو الآلية الأساسية لاكتشاف أفضل المحللين.</p>
        <h3>كيف تُحسب درجة التصنيف</h3>
        <p>الدرجة مزيج موزون من أربعة مكونات:</p>
        <ul>
          <li><strong>معدل الفوز (٤٠٪)</strong> — نسبة التحليلات التي أُغلقت بربح</li>
          <li><strong>متوسط R:R (٣٠٪)</strong> — متوسط نسبة المخاطرة/العائد عبر جميع التحليلات المنشورة</li>
          <li><strong>عدد الصفقات (١٥٪)</strong> — الحد الأدنى ٢٠ تحليلاً مغلقاً للظهور في اللوحة</li>
          <li><strong>عدد المشتركين (١٥٪)</strong> — يعكس ثقة المجتمع</li>
        </ul>
        <h3>فلاتر الفترة الزمنية</h3>
        <p>ثلاثة فلاتر: <strong>كل الأوقات</strong> (الأكثر موثوقية إحصائياً)، <strong>هذا الشهر</strong> (لتحديد من يؤدي بشكل استثنائي الآن)، <strong>هذا الأسبوع</strong> (عينات صغيرة — تفسير بحذر). تُعاد اللوحة الشهرية في أول كل شهر. كل الأوقات تراكمية ولا تُعاد أبداً.</p>
        <h3>تحسين تصنيفك</h3>
        <p>المسار الأكثر موثوقية: نشر المزيد من التحليلات عالية الجودة وبناء علاقات حقيقية مع المشتركين. الطرق المختصرة — كنشر تحليلات منخفضة المخاطر لحماية معدل الفوز — مرئية في البيانات. مكون R:R يعاقب المحللين الذين ينشرون باستمرار إعدادات بنسبة ١:١ أو أقل. ركّز على: انتظار الإعدادات عالية الاقتناع، تحديد وقف خسارة واضح وأهداف واقعية، وتفاعل مع تعليقات المشتركين لتحسين معدل الاحتفاظ.</p>
      </div>
    ),
  },
  'settings-guide': {
    title: 'مرجع الإعدادات وإدارة الحساب',
    summary: 'مرجع كامل لكل قسم في الإعدادات — الحساب والملف الشخصي والإشعارات و Telegram والمظهر والفواتير.',
    readTime: '٦ دقائق قراءة',
    content: (
      <div className="prose-article" dir="rtl">
        <p>منطقة الإعدادات هي لوحة التحكم في حسابك على AnalyzingHub. تغطي كل شيء من ملفك العام إلى حدود الإشعارات إلى إدارة الفواتير.</p>
        <h3>الإعدادات ← الحساب</h3>
        <p><strong>اسم العرض</strong> يظهر عبر جميع تحليلاتك وصفحات الملف الشخصي ورسائل Telegram. اختر اسماً احترافياً يتسق مع علامتك التجارية. <strong>عنوان البريد الإلكتروني</strong> يُستخدم لرموز OTP وإشعارات الحساب المهمة. <strong>حذف الحساب</strong> في أسفل هذا القسم يزيل حسابك وجميع تحليلاتك وصفقاتك وبيانات المشتركين نهائياً بعد فترة تهدئة ١٤ يوماً.</p>
        <h3>الإعدادات ← الملف الشخصي</h3>
        <p><strong>السيرة الذاتية</strong> (حتى ٥٠٠ حرف) تظهر في ملفك العام وتقارير Telegram. <strong>الصورة الشخصية</strong> تظهر على كل بطاقة تحليل تنشرها. <strong>وسوم التخصص</strong> (حتى ٦) تُصنّف خبرتك كفلاتر قابلة للبحث.</p>
        <h3>الإعدادات ← الإشعارات</h3>
        <p>١٢ نوعاً من الإشعارات قابلة للتبديل بشكل مستقل. عتبة حركة السعر (افتراضي ١٪) تتحكم في حساسية تنبيهات الأسعار. يمكن منح أو سحب إذن إشعارات المتصفح هنا.</p>
        <h3>الإعدادات ← المظهر والأمان</h3>
        <p>تبديل بين الوضع الداكن (الافتراضي) والوضع الفاتح. اختيار اللغة (إنجليزي أو عربي) يُبدّل الواجهة بالكامل بما في ذلك الشريط الجانبي والرؤوس والأزرار وتسميات النماذج. AnalyzingHub تستخدم مصادقة OTP — لا كلمة مرور دائمة، مما يجعل الحسابات آمنة بطبيعتها.</p>
      </div>
    ),
  },
};

const AR_CATEGORIES: Record<string, string> = {
  'getting-started': 'البداية والإعداد',
  'dashboard': 'لوحة التحكم',
  'analysis': 'التحليل',
  'trades': 'الصفقات',
  'indices': 'مركز المؤشرات',
  'reports': 'التقارير',
  'rankings': 'التصنيفات',
  'account': 'الحساب والإعدادات',
};

const AR_FAQ = [
  { q: 'ما الفرق بين دور المحلل والمتداول؟', a: 'المحللون (Analyzers) ينشرون تحليلات السوق العامة، ويديرون المشتركين، ويكسبون دخلاً من مستويات الاشتراك المدفوعة. المتداولون (Traders) يتابعون التحليلات، ويديرون مجلة صفقات خاصة، ويشتركون في المحللين. SuperAdmins لديهم وصول كامل للمنصة.' },
  { q: 'كيف يعمل نظام الدخل من الاشتراكات؟', a: 'يُنشئ المحللون مستويات اشتراك مسماة بأسعار شهرية مخصصة. يشترك المتداولون في محللين محددين ويحصلون على التحليلات الحصرية وتنبيهات Telegram. يُتابع الدخل في لوحة التحكم المالية.' },
  { q: 'هل يمكنني استخدام AnalyzingHub بالعربية؟', a: 'نعم. انقر على محوّل اللغة (EN/AR) في الرأس. تتحول الواجهة بالكامل إلى العربية مع تخطيط RTL الصحيح. يمكن أيضاً توليد ملفات PDF وتقارير Telegram بالعربية أو بنسختين.' },
  { q: 'كيف تُتتبع نتائج التحليل تلقائياً؟', a: 'تستطلع المنصة بيانات السوق الحية لكل أداة بها تحليل نشط. عندما يتجاوز السعر الحالي منطقة الدخول أو الهدف أو وقف الخسارة، تتحدث بطاقة التحليل وتُرسل إشعارات لك وللمشتركين.' },
  { q: 'ما هو تعرض غاما (GEX) ولماذا يهم؟', a: 'GEX يقيس مقدار ما يجب على صانعي سوق SPX شراؤه أو بيعه للتحوط مع تحرك الأسعار. GEX الإيجابي يكبت التقلبات؛ السلبي يضخمها. فهم GEX يساعد في التنبؤ بما إذا كان السوق سيتجه أو يتراوح.' },
  { q: 'كيف تعمل تقارير Telegram الآلية؟', a: 'ارتبط بوت Telegram الخاص بك في الإعدادات، ثم هيّئ إعدادات التقرير في مركز المؤشرات ← التقارير. تُولَّد التقارير كملفات PDF وتُرسل تلقائياً إلى قناتك وفق الجدول الذي تحدده — يومياً أو أسبوعياً أو شهرياً.' },
  { q: 'هل بيانات مجلة صفقاتي خاصة؟', a: 'نعم. مجلة صفقاتك خاصة تماماً. أنت وحدك من يرى صفقاتك المسجلة ومراكزك المفتوحة وتحليلات أدائك. التحليلات المنشورة عامة أو للمشتركين فقط؛ إدخالات مجلة الصفقات لا تُكشف أبداً.' },
  { q: 'كيف تُحسب درجة تصنيف لوحة المتصدرين؟', a: 'الدرجة = معدل الفوز (٤٠٪) + متوسط R:R (٣٠٪) + عدد الصفقات (١٥٪) + عدد المشتركين (١٥٪). جميع المكونات تُطبَّع على مقياس ٠-١٠٠ قبل الترجيح. الحد الأدنى ٢٠ تحليلاً مغلقاً للظهور في اللوحة.' },
];

const CATEGORIES = [
  { id: 'getting-started', label: 'Getting Started', icon: GraduationCap, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3, color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' },
  { id: 'analysis', label: 'Analysis', icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  { id: 'trades', label: 'Trades', icon: LineChart, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  { id: 'indices', label: 'Indices Hub', icon: Cpu, color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
  { id: 'reports', label: 'Reports', icon: FileText, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20' },
  { id: 'rankings', label: 'Rankings', icon: Trophy, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  { id: 'account', label: 'Account & Settings', icon: Settings, color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' },
];

const FAQ_ITEMS = [
  { q: 'What is the difference between Analyzer and Trader roles?', a: 'Analyzers publish public market analyses, manage subscribers, and earn revenue from paid subscription tiers. Traders follow analyses, manage a private trade journal, and subscribe to Analyzers. SuperAdmins have full platform access including content moderation.' },
  { q: 'How does the subscription monetisation work?', a: 'Analyzers create named subscription tiers with custom monthly pricing. Traders subscribe to specific Analyzers and gain access to subscriber-only analyses and Telegram alerts. Revenue is tracked in the Financial dashboard.' },
  { q: 'Can I use AnalyzingHub in Arabic?', a: 'Yes. Click the language switcher (EN/AR) in the header. The entire interface switches to Arabic with proper right-to-left (RTL) layout. PDFs and Telegram reports can also be generated in Arabic or dual-language format.' },
  { q: 'How are analysis outcomes tracked automatically?', a: 'The platform polls live market data for every instrument with an active analysis. When the current price crosses your entry zone, a target, or the stop-loss, the analysis card is updated and you and subscribed users receive a notification.' },
  { q: 'What is Gamma Exposure (GEX) and why does it matter?', a: 'GEX measures how much SPX market makers must buy or sell to hedge their options book as prices move. Positive GEX suppresses volatility; negative GEX amplifies it. Understanding GEX helps predict whether the market will trend or range.' },
  { q: 'How do automated Telegram reports work?', a: 'Connect your Telegram bot in Settings → Telegram. Configure report settings in Indices Hub → Reports. Reports are generated as PDFs and sent automatically to your channel on the schedule you set — daily, weekly, or monthly.' },
  { q: 'Is my trade journal data private?', a: 'Yes. Your trade journal is completely private. Only you can see your logged trades, open positions, and performance analytics. Published analyses are public (or subscriber-only); trade journal entries are never exposed.' },
  { q: 'How is the leaderboard ranking score calculated?', a: 'Score = Win Rate (40%) + Average R:R (30%) + Trade Count (15%) + Subscriber Count (15%). All components are normalised to 0–100 before weighting. Minimum 20 closed analyses required to appear on the leaderboard.' },
];

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
═══════════════════════════════════════════════════════════════════ */

export default function HelpTutorialsPage() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [openArticle, setOpenArticle] = useState<Article | null>(null);
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const getAr = (a: Article) => AR_ARTICLES[a.id] ?? { title: a.title, summary: a.summary, readTime: a.readTime, badge: a.badge, content: a.content };

  const filtered = ARTICLES.filter(a => {
    const ar = getAr(a);
    const matchCat = !activeCategory || a.category === activeCategory;
    const searchTitle = isAr ? ar.title : a.title;
    const searchSummary = isAr ? ar.summary : a.summary;
    const matchSearch = !search || searchTitle.toLowerCase().includes(search.toLowerCase()) || searchSummary.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const articlesByCategory = CATEGORIES.map(cat => ({
    ...cat,
    articles: filtered.filter(a => a.category === cat.id),
  })).filter(cat => cat.articles.length > 0);

  /* ── Article Detail View ── */
  if (openArticle) {
    const catMeta = CATEGORIES.find(c => c.id === openArticle.category);
    const sameCategory = ARTICLES.filter(a => a.category === openArticle.category && a.id !== openArticle.id);
    const arData = getAr(openArticle);
    const catLabel = isAr ? (AR_CATEGORIES[openArticle.category] ?? catMeta?.label) : catMeta?.label;
    return (
      <div className="max-w-4xl mx-auto pb-16" dir={isAr ? 'rtl' : 'ltr'}>
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <button
            onClick={() => setOpenArticle(null)}
            className="flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            {isAr ? <ArrowRight className="h-3.5 w-3.5" /> : <ArrowLeft className="h-3.5 w-3.5" />}
            {isAr ? 'المساعدة والدروس' : 'Help & Tutorials'}
          </button>
          <ChevronRight className="h-3.5 w-3.5 opacity-40" />
          <button
            onClick={() => { setActiveCategory(openArticle.category); setOpenArticle(null); }}
            className="hover:text-foreground transition-colors"
          >
            {catLabel}
          </button>
          <ChevronRight className="h-3.5 w-3.5 opacity-40" />
          <span className="text-foreground">{isAr ? arData.title : openArticle.title}</span>
        </div>

        {/* Article header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {catMeta && (
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${catMeta.bg} ${catMeta.color}`}>
                <catMeta.icon className="h-3 w-3" />
                {catLabel}
              </span>
            )}
            {(isAr ? arData.badge : openArticle.badge) && (
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${openArticle.badgeColor}`}>{isAr ? arData.badge : openArticle.badge}</span>
            )}
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />{isAr ? arData.readTime : openArticle.readTime}
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-3 leading-tight">{isAr ? arData.title : openArticle.title}</h1>
          <p className="text-muted-foreground text-base leading-relaxed">{isAr ? arData.summary : openArticle.summary}</p>
        </div>

        {/* Terminal Mockup */}
        <div className="rounded-2xl border border-border overflow-hidden shadow-2xl mb-8">
          {openArticle.mockup}
        </div>

        {/* Article body */}
        <Card className="mb-8">
          <CardContent className="p-6 md:p-8">
            <style jsx global>{`
              .prose-article p { margin-bottom: 1rem; line-height: 1.75; color: hsl(var(--muted-foreground)); font-size: 0.9375rem; }
              .prose-article strong { color: hsl(var(--foreground)); font-weight: 600; }
              .prose-article h3 { font-size: 1.0625rem; font-weight: 700; color: hsl(var(--foreground)); margin-top: 1.75rem; margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid hsl(var(--border)); }
              .prose-article ul { list-style: none; padding: 0; margin-bottom: 1rem; }
              .prose-article ul li { padding-left: 1.25rem; position: relative; margin-bottom: 0.5rem; color: hsl(var(--muted-foreground)); font-size: 0.9375rem; line-height: 1.65; }
              .prose-article ul li::before { content: "›"; position: absolute; left: 0; color: hsl(var(--primary)); font-weight: bold; }
              .prose-article em { font-style: italic; color: hsl(var(--foreground)); }
            `}</style>
            {isAr ? arData.content : openArticle.content}
          </CardContent>
        </Card>

        {/* Related articles */}
        {sameCategory.length > 0 && (
          <div>
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-4">{isAr ? 'مقالات ذات صلة' : 'Related Articles'}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sameCategory.slice(0, 4).map(a => {
                const arA = getAr(a);
                return (
                  <button
                    key={a.id}
                    onClick={() => { setOpenArticle(a); window.scrollTo(0, 0); }}
                    className="text-left p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all group"
                  >
                    <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors mb-1 line-clamp-2">{isAr ? arA.title : a.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                      <Clock className="h-3 w-3" />{isAr ? arA.readTime : a.readTime}
                      <ArrowRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Main Index View ── */
  return (
    <div className="max-w-6xl mx-auto pb-16 space-y-10" dir={isAr ? 'rtl' : 'ltr'}>

      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-violet-500/6 pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
        <div className="relative px-6 py-10 md:px-10 md:py-14 max-w-3xl">
          <div className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-full px-3 py-1 mb-5">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-bold text-primary tracking-wide">AnalyzingHub Documentation v2.0</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3 leading-tight">
            {isAr ? 'مركز المساعدة والدروس' : 'Help Center & Tutorials'}
          </h1>
          <p className="text-muted-foreground text-base md:text-lg leading-relaxed mb-8">
            {isAr
              ? 'أدلة معمّقة لكل ميزة في محطة التداول AnalyzingHub — من تحليلك الأول إلى سير عمل ذكاء SPX المتقدم.'
              : 'Deep-dive guides for every feature of the AnalyzingHub trading terminal — from your first analysis to advanced SPX intelligence workflows.'}
          </p>
          <div className="relative max-w-lg">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={isAr ? 'ابحث في المقالات والميزات والأسئلة الشائعة…' : 'Search articles, features, FAQs…'}
              className="pl-10 pr-4 h-11 bg-background/70 border-border focus:border-primary"
            />
          </div>
          <div className="flex flex-wrap gap-5 mt-7 text-sm text-muted-foreground">
            {(isAr ? [
              { icon: BookOpen, label: `${ARTICLES.length} مقالاً` },
              { icon: GraduationCap, label: '٨ أقسام موضوعية' },
              { icon: Terminal, label: 'محاكاة محطة حية' },
              { icon: HelpCircle, label: 'أسئلة شائعة ودعم' },
            ] : [
              { icon: BookOpen, label: `${ARTICLES.length} Articles` },
              { icon: GraduationCap, label: '8 Topic Sections' },
              { icon: Terminal, label: 'Live Terminal Mockups' },
              { icon: HelpCircle, label: 'FAQ & Support' },
            ]).map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 text-primary" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Category Filter Pills ── */}
      <div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${!activeCategory ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground hover:border-primary/40'}`}
          >
            {isAr ? 'جميع المواضيع' : 'All Topics'}
          </button>
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(active ? null : cat.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${active ? `${cat.bg} ${cat.color} border-current` : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground hover:border-primary/40'}`}
              >
                <Icon className="h-3 w-3" />
                {isAr ? (AR_CATEGORIES[cat.id] ?? cat.label) : cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Quick Start Row ── */}
      {!activeCategory && !search && (
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-primary" /> {isAr ? 'المقالات الأكثر قراءة' : 'Popular Articles'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {['platform-overview', 'creating-analysis', 'trade-journal', 'spx-intelligence'].map(id => {
              const a = ARTICLES.find(x => x.id === id)!;
              const cat = CATEGORIES.find(c => c.id === a.category)!;
              const CatIcon = cat.icon;
              const arA = getAr(a);
              return (
                <button
                  key={id}
                  onClick={() => { setOpenArticle(a); window.scrollTo(0, 0); }}
                  className={`text-left p-4 rounded-xl border transition-all hover:scale-[1.02] hover:shadow-lg group ${cat.bg}`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 bg-background/50 border border-current/20`}>
                    <CatIcon className={`h-4 w-4 ${cat.color}`} />
                  </div>
                  <p className="text-sm font-bold text-foreground mb-1 group-hover:text-primary transition-colors leading-tight">{isAr ? arA.title : a.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{isAr ? arA.summary : a.summary}</p>
                  <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />{isAr ? arA.readTime : a.readTime}
                    <ArrowRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Article Grid by Category ── */}
      {search && filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-semibold">{isAr ? `لا توجد مقالات تطابق "${search}"` : `No articles match "${search}"`}</p>
          <p className="text-sm mt-1">{isAr ? 'جرب كلمة مختلفة أو تصفح حسب الفئة.' : 'Try a different keyword or browse by category.'}</p>
        </div>
      )}

      {articlesByCategory.map(cat => {
        const CatIcon = cat.icon;
        return (
          <div key={cat.id}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${cat.bg}`}>
                <CatIcon className={`h-4 w-4 ${cat.color}`} />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">{isAr ? (AR_CATEGORIES[cat.id] ?? cat.label) : cat.label}</h2>
                <p className="text-xs text-muted-foreground">{isAr ? `${cat.articles.length} مقال` : `${cat.articles.length} article${cat.articles.length !== 1 ? 's' : ''}`}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cat.articles.map(a => {
                const arA = getAr(a);
                const displayBadge = isAr ? (arA.badge ?? a.badge) : a.badge;
                return (
                <button
                  key={a.id}
                  onClick={() => { setOpenArticle(a); window.scrollTo(0, 0); }}
                  className="text-left p-5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/3 transition-all group flex gap-4"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${cat.bg}`}>
                    <CatIcon className={`h-4.5 w-4.5 ${cat.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap mb-1">
                      <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors leading-snug">{isAr ? arA.title : a.title}</p>
                      {displayBadge && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${a.badgeColor}`}>{displayBadge}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-3 line-clamp-2">{isAr ? arA.summary : a.summary}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />{isAr ? arA.readTime : a.readTime}
                      <span className="ml-auto flex items-center gap-0.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity font-semibold text-[11px]">
                        {isAr ? 'اقرأ' : 'Read'} <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ── Keyboard Shortcuts ── */}
      {!search && !activeCategory && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">{isAr ? 'اختصارات لوحة المفاتيح' : 'Keyboard Shortcuts'}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(isAr ? [
                { keys: ['⌘', 'K'], desc: 'لوحة الأوامر' },
                { keys: ['⌘', 'N'], desc: 'تحليل جديد' },
                { keys: ['⌘', '/'], desc: 'بحث عام' },
                { keys: ['⌘', 'D'], desc: 'لوحة التحكم' },
                { keys: ['⌘', 'F'], desc: 'التغذية' },
                { keys: ['⌘', 'T'], desc: 'الصفقات' },
                { keys: ['Esc'], desc: 'إغلاق الحوار' },
                { keys: ['Tab'], desc: 'الحقل التالي' },
              ] : [
                { keys: ['⌘', 'K'], desc: 'Command palette' },
                { keys: ['⌘', 'N'], desc: 'New analysis' },
                { keys: ['⌘', '/'], desc: 'Global search' },
                { keys: ['⌘', 'D'], desc: 'Dashboard' },
                { keys: ['⌘', 'F'], desc: 'Feed' },
                { keys: ['⌘', 'T'], desc: 'Trades' },
                { keys: ['Esc'], desc: 'Close dialog' },
                { keys: ['Tab'], desc: 'Next form field' },
              ]).map(({ keys, desc }) => (
                <div key={desc} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border bg-secondary/20">
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {keys.map((k, i) => (
                      <span key={i} className="flex items-center gap-0.5">
                        <kbd className="px-1.5 py-0.5 text-[11px] font-mono font-bold bg-secondary border border-border rounded">{k}</kbd>
                        {i < keys.length - 1 && <span className="text-muted-foreground text-[10px]">+</span>}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── FAQ ── */}
      {!search && !activeCategory && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">{isAr ? 'الأسئلة الشائعة' : 'Frequently Asked Questions'}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              {(isAr ? AR_FAQ : FAQ_ITEMS).map((item, i) => (
                <AccordionItem key={i} value={`faq-${i}`}>
                  <AccordionTrigger className="text-sm font-semibold text-left hover:text-primary py-4">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* ── Support Footer ── */}
      {!search && !activeCategory && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(isAr ? [
            { icon: LifeBuoy, title: 'تواصل مع الدعم', desc: 'تواصل مع الفريق لمشكلات الحساب أو الإبلاغ عن أخطاء أو استفسارات الفواتير.', action: 'فتح تذكرة دعم', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
            { icon: BookMarked, title: 'ملاحظات الإصدار', desc: 'اطلع على آخر تحديثات المنصة والميزات الجديدة والمشكلات المحلولة.', action: 'عرض سجل التغييرات', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
            { icon: Bookmark, title: 'إعادة جولة المنصة', desc: 'ابدأ الجولة الإرشادية التفاعلية لإعادة زيارة أي ميزة خطوة بخطوة.', action: 'بدء الجولة', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
          ] : [
            { icon: LifeBuoy, title: 'Contact Support', desc: 'Reach the team for account issues, bug reports, or billing questions.', action: 'Open Support Ticket', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
            { icon: BookMarked, title: 'Release Notes', desc: 'See the latest platform updates, new features, and resolved issues.', action: 'View Changelog', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
            { icon: Bookmark, title: 'Restart Platform Tour', desc: 'Launch the interactive guided tour to revisit any feature step-by-step.', action: 'Launch Tour', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
          ]).map(({ icon: Icon, title, desc, action, color, bg }) => (
            <div key={title} className={`rounded-xl border p-5 flex flex-col ${bg}`}>
              <Icon className={`h-6 w-6 ${color} mb-3 flex-shrink-0`} />
              <p className="font-bold text-sm mb-1">{title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed flex-1">{desc}</p>
              <Button variant="outline" size="sm" className="mt-4 w-full text-xs">
                {action} <ArrowRight className="h-3 w-3 ml-1.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* ── Terminal disclaimer ── */}
      {!search && !activeCategory && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-secondary/10 text-xs text-muted-foreground">
          <Terminal className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
          <p><span className="font-bold text-foreground">AnalyzingHub Terminal</span> — {isAr ? 'جميع محتويات المنصة للأغراض التعليمية والمعلوماتية فقط. تحليلات السوق من إنشاء المستخدمين. الأداء السابق لا يضمن النتائج المستقبلية. أجرِ دائماً بحثك المستقل قبل اتخاذ قرارات مالية.' : 'All platform content is for educational and informational purposes only. Market analyses are user-generated. Past performance does not guarantee future results. Always conduct independent research before making financial decisions.'}</p>
        </div>
      )}
    </div>
  );
}
