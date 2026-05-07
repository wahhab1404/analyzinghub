'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  BookOpen, Search, ChevronRight, Play, Terminal,
  BarChart3, TrendingUp, LineChart, Trophy, Settings,
  Bell, User, Package, FileText, Building2, Shield,
  CheckCircle2, Info, Lightbulb, Zap, Star, Clock,
  ArrowRight, Command, Keyboard, MousePointer2, HelpCircle,
  DollarSign, Activity, Filter, SortAsc, Eye, Share2,
  MessageSquare, Users, Send, Download, RefreshCw,
  PieChart, Target, Layers, Globe, Lock, Mail,
  AlertTriangle, LifeBuoy, BookMarked, GraduationCap,
  MonitorPlay, Bookmark, Cpu, Database
} from 'lucide-react';
import Image from 'next/image';

/* ─────────────────────────────────────────────
   DATA
───────────────────────────────────────────── */

const CATEGORIES = [
  { id: 'getting-started', label: 'Getting Started', icon: BookOpen, count: 5 },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3, count: 6 },
  { id: 'analysis', label: 'Analysis', icon: TrendingUp, count: 7 },
  { id: 'trades', label: 'Trades', icon: LineChart, count: 6 },
  { id: 'indices', label: 'Indices Hub', icon: Cpu, count: 5 },
  { id: 'reports', label: 'Reports', icon: FileText, count: 4 },
  { id: 'rankings', label: 'Rankings', icon: Trophy, count: 3 },
  { id: 'account', label: 'Account', icon: Settings, count: 5 },
];

const QUICK_ACTIONS = [
  {
    icon: Play,
    title: 'Quick Start Guide',
    desc: 'New to AnalyzingHub? Start here — 5-minute platform walkthrough.',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    badge: 'Beginner',
    badgeColor: 'bg-blue-500/20 text-blue-300',
    tab: 'getting-started',
  },
  {
    icon: TrendingUp,
    title: 'Create Your First Analysis',
    desc: 'Publish a professional market analysis with charts and targets.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    badge: 'Popular',
    badgeColor: 'bg-emerald-500/20 text-emerald-300',
    tab: 'analysis',
  },
  {
    icon: LineChart,
    title: 'Open & Track a Trade',
    desc: 'Learn how to log trades, set stops and monitor live P&L.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
    badge: 'Core Skill',
    badgeColor: 'bg-amber-500/20 text-amber-300',
    tab: 'trades',
  },
  {
    icon: Cpu,
    title: 'Indices & SPX Intelligence',
    desc: 'Discover AI-powered SPX signals and options-flow analytics.',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10 border-violet-500/20',
    badge: 'Advanced',
    badgeColor: 'bg-violet-500/20 text-violet-300',
    tab: 'indices',
  },
];

const KEYBOARD_SHORTCUTS = [
  { keys: ['⌘', 'K'], desc: 'Open command palette' },
  { keys: ['⌘', '/'], desc: 'Search the platform' },
  { keys: ['⌘', 'N'], desc: 'New analysis' },
  { keys: ['⌘', 'D'], desc: 'Go to Dashboard' },
  { keys: ['⌘', 'F'], desc: 'Go to Feed' },
  { keys: ['⌘', 'T'], desc: 'Go to Trades' },
  { keys: ['Esc'], desc: 'Close dialog / overlay' },
  { keys: ['Tab'], desc: 'Navigate form fields' },
];

const FAQ_ITEMS = [
  {
    q: 'What is the difference between Analyzer and Trader roles?',
    a: 'Analyzers can publish public market analyses, manage subscribers and earn revenue from paid subscriptions. Traders can follow analyses, manage their own private trades, and subscribe to Analyzers. SuperAdmins have full platform access including content moderation.',
  },
  {
    q: 'How do I switch between dark and light mode?',
    a: 'Click the sun/moon icon in the top-right header bar. Your preference is saved in your browser and persists across sessions.',
  },
  {
    q: 'Can I use AnalyzingHub in Arabic?',
    a: 'Yes. Click the language switcher (EN/AR) in the header. The interface fully switches to Arabic with right-to-left (RTL) layout. PDFs and Telegram reports are also generated in the selected language.',
  },
  {
    q: 'How does the Subscription system work?',
    a: 'Analyzers set up paid subscription tiers with custom pricing. Traders subscribe to specific Analyzers. Subscribed Traders gain access to premium analyses and can receive automated Telegram alerts when new content is published.',
  },
  {
    q: 'What are the Indices Hub and SPX Intelligence features?',
    a: 'Indices Hub is a professional-grade terminal for tracking and analysing major indices (SPX, NDX, DJI, VIX). SPX Intelligence provides AI-generated signals, options-flow heatmaps and gamma exposure charts specifically for the S&P 500.',
  },
  {
    q: 'How do automated Telegram reports work?',
    a: 'Connect your Telegram channel in Settings → Telegram. You can schedule daily/weekly/monthly performance reports that are automatically sent as PDF documents to your channel at a time you configure.',
  },
  {
    q: 'Is my data secure?',
    a: 'All data is stored in Supabase (PostgreSQL) with row-level security. Authentication uses secure OTP codes and session cookies. Passwords are never stored — only verified through Supabase Auth.',
  },
  {
    q: 'How is the Leaderboard score calculated?',
    a: 'The ranking score combines: win rate, average profit percentage, number of completed trades, and subscriber count. The algorithm is designed to reward consistent, high-quality performance rather than single lucky trades.',
  },
];

/* ─────────────────────────────────────────────
   SUB-COMPONENTS
───────────────────────────────────────────── */

function StepCard({
  number, title, description, tip,
}: {
  number: number; title: string; description: string; tip?: string;
}) {
  return (
    <div className="flex gap-4 group">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0 group-hover:bg-primary/30 transition-colors">
          {number}
        </div>
        <div className="w-px flex-1 bg-border mt-2" />
      </div>
      <div className="pb-6 flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground mb-1">{title}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        {tip && (
          <div className="mt-2 flex items-start gap-2 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
            <Lightbulb className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>{tip}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mt-4">
      <Info className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-blue-300 leading-relaxed">{children}</p>
    </div>
  );
}

function WarningBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mt-4">
      <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-amber-300 leading-relaxed">{children}</p>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle, badge }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  badge?: string;
}) {
  return (
    <div className="flex items-start gap-4 mb-6">
      <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          {badge && <Badge variant="secondary" className="text-[10px] font-semibold">{badge}</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function FeatureChip({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-secondary/60 border border-border rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
      <Icon className="h-3 w-3 text-primary" />
      {label}
    </div>
  );
}

/* ─────────────────────────────────────────────
   TAB CONTENT SECTIONS
───────────────────────────────────────────── */

function GettingStartedTab() {
  return (
    <div className="space-y-8">
      {/* Overview */}
      <Card>
        <CardHeader className="pb-3">
          <SectionHeader
            icon={GraduationCap}
            title="Welcome to AnalyzingHub"
            subtitle="A professional trading intelligence platform built for market analysts and active traders."
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative rounded-xl overflow-hidden border border-border bg-card">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-violet-500/5" />
            <div className="relative p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { icon: TrendingUp, label: 'Publish Analyses', desc: 'Create professional market analyses with entry/exit targets, charts and real-time price tracking.' },
                { icon: LineChart, label: 'Manage Trades', desc: 'Log and monitor live trades, track P&L, win rate, and overall portfolio performance.' },
                { icon: Cpu, label: 'Indices Terminal', desc: 'Access SPX intelligence, options flow, gamma exposure and real-time index data in one terminal.' },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm mb-1">{label}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Platform setup */}
      <Card>
        <CardHeader className="pb-3">
          <SectionHeader
            icon={BookOpen}
            title="Initial Setup"
            subtitle="Complete these steps once to configure your account correctly."
            badge="Start Here"
          />
        </CardHeader>
        <CardContent>
          <StepCard
            number={1}
            title="Complete your profile"
            description="Navigate to My Profile → Edit Profile. Add a professional photo, bio, and trading specialisation. A complete profile builds trust with potential subscribers."
            tip="Profiles with photos and a bio receive 3× more subscriber inquiries."
          />
          <StepCard
            number={2}
            title="Set your role preferences"
            description="Go to Settings → Account. Confirm your role (Analyzer or Trader). Analyzers unlock the ability to publish analyses and manage paid subscriptions."
          />
          <StepCard
            number={3}
            title="Configure notifications"
            description="Open Settings → Notifications. Enable browser notifications and set alert thresholds for trade price targets, analysis likes, and new subscriber events."
          />
          <StepCard
            number={4}
            title="Connect Telegram (optional)"
            description="Visit Settings → Telegram Integration. Link your Telegram channel so your subscribers receive instant alerts and automated performance reports."
            tip="Telegram is free and dramatically improves subscriber engagement."
          />
          <StepCard
            number={5}
            title="Take the interactive tour"
            description="Click Help & Tutorials in the sidebar, then press 'Launch Platform Tour'. An interactive overlay walks you through every major feature while you use the live platform."
          />
        </CardContent>
      </Card>

      {/* Role guide */}
      <Card>
        <CardHeader className="pb-3">
          <SectionHeader icon={Users} title="Understanding Your Role" subtitle="Permissions differ by role — choose the path that matches you." />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                role: 'Analyzer',
                color: 'border-blue-500/40 bg-blue-500/5',
                badgeClass: 'bg-blue-500/20 text-blue-300',
                features: [
                  'Publish public market analyses',
                  'Create paid subscription tiers',
                  'Send reports to Telegram channels',
                  'Access subscriber revenue dashboard',
                  'Full indices + SPX intelligence access',
                ],
              },
              {
                role: 'Trader',
                color: 'border-emerald-500/40 bg-emerald-500/5',
                badgeClass: 'bg-emerald-500/20 text-emerald-300',
                features: [
                  'Follow and subscribe to Analyzers',
                  'Manage private trade journal',
                  'Access feed and community analyses',
                  'View rankings leaderboard',
                  'Receive Telegram analysis alerts',
                ],
              },
            ].map(({ role, color, badgeClass, features }) => (
              <div key={role} className={`rounded-lg border p-4 ${color}`}>
                <div className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold mb-3 ${badgeClass}`}>
                  <Shield className="h-3 w-3" />
                  {role}
                </div>
                <ul className="space-y-1.5">
                  {features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <TipBox>
            Your role is assigned by a SuperAdmin. If you need a role change, contact platform administration via the Settings page.
          </TipBox>
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardTab() {
  return (
    <div className="space-y-8">
      <Card>
        <CardHeader className="pb-3">
          <SectionHeader icon={BarChart3} title="Dashboard Overview" subtitle="Your command centre — all key metrics at a glance." />
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border overflow-hidden mb-6">
            <div className="bg-secondary/40 border-b border-border px-4 py-2 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
              </div>
              <span className="text-[11px] text-muted-foreground font-mono ml-2">dashboard — AnalyzingHub Terminal</span>
            </div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Total P&L', value: '+$12,840', color: 'text-emerald-400' },
                { label: 'Win Rate', value: '73.2%', color: 'text-blue-400' },
                { label: 'Active Trades', value: '8', color: 'text-amber-400' },
                { label: 'Subscribers', value: '142', color: 'text-violet-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-card border border-border rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
                  <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {[
              {
                title: 'Performance Metrics Panel',
                icon: PieChart,
                desc: 'The top row shows your aggregated performance: total P&L, win rate, average gain/loss, and active trade count. These update in real time as trades close.',
              },
              {
                title: 'Recent Analyses Feed',
                icon: FileText,
                desc: 'The feed section shows latest analyses from Analyzers you follow, sorted by publish date. Use the filter chips to narrow by asset class, timeframe or status.',
              },
              {
                title: 'Active Trades Monitor',
                icon: Activity,
                desc: 'Live trade cards display the current price vs. your entry, showing real-time unrealised P&L. Red/green colouring updates as market prices change.',
              },
              {
                title: 'Market Snapshot Bar',
                icon: Globe,
                desc: 'The global market bar at the top of the Indices pages shows SPX, NDX, DJI, VIX, and selected equities with live price tickers.',
              },
            ].map(({ title, icon: Icon, desc }) => (
              <div key={title} className="flex gap-3 p-3 rounded-lg border border-border bg-secondary/20 hover:bg-secondary/40 transition-colors">
                <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold mb-0.5">{title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <SectionHeader icon={Bell} title="Notification Centre" subtitle="Stay informed of price targets, new subscribers and platform events." />
        </CardHeader>
        <CardContent>
          <StepCard number={1} title="Open the notification panel" description="Click the bell icon in the top-right header to slide open the notification drawer. Unread alerts are highlighted with a blue dot." />
          <StepCard number={2} title="Filter by type" description="Use the tabs inside the panel to filter: All, Price Alerts, Subscriber Events, and System messages." />
          <StepCard number={3} title="Configure alert thresholds" description="Go to Settings → Notifications to customise which events trigger alerts and at what price movement percentage." tip="Set a 2% price movement threshold to avoid noise on volatile assets." />
          <StepCard number={4} title="Mark as read / clear all" description="Click 'Mark all as read' at the top of the panel. Individual notifications can be dismissed with the × button." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <SectionHeader icon={Search} title="Global Search" subtitle="Find any analysis, company, symbol or user instantly." />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <div className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-secondary/40 text-sm text-muted-foreground">
                Search analyses, symbols, users…
              </div>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded border border-border bg-secondary/40 text-xs text-muted-foreground">
              <Command className="h-3 w-3" />K
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { label: 'Symbol Search', desc: 'Type any ticker (e.g. AAPL, SPX) to see all analyses for that symbol.' },
              { label: 'User Search', desc: 'Find Analyzers by name. View their public profile and analysis history.' },
              { label: 'Analysis Search', desc: 'Full-text search across all published analysis titles and content.' },
            ].map(({ label, desc }) => (
              <div key={label} className="p-3 rounded-lg border border-border bg-card text-sm">
                <p className="font-semibold mb-1">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AnalysisTab() {
  return (
    <div className="space-y-8">
      <Card>
        <CardHeader className="pb-3">
          <SectionHeader icon={TrendingUp} title="Creating a Market Analysis" subtitle="Publish professional, structured analyses with price targets and supporting charts." badge="Analyzer Only" />
        </CardHeader>
        <CardContent>
          <StepCard
            number={1}
            title="Navigate to Create Analysis"
            description="In the sidebar expand 'Companies' and click 'Create Company Analysis', or press ⌘N. This opens the analysis creation form."
          />
          <StepCard
            number={2}
            title="Select the symbol and asset type"
            description="Start typing the ticker symbol (e.g. NVDA, AAPL). The platform auto-fetches the current price and company data. Select the correct exchange if multiple listings appear."
            tip="Supported assets: US equities, major ETFs, indices (SPX, NDX, DJI), crypto pairs."
          />
          <StepCard
            number={3}
            title="Set your trade direction"
            description="Choose Long (bullish) or Short (bearish). This determines which price target fields are displayed — upside targets for longs, downside for shorts."
          />
          <StepCard
            number={4}
            title="Define entry, targets and stop-loss"
            description="Enter your entry price zone, 1–3 profit targets, and a stop-loss level. The platform calculates risk-reward ratios automatically and displays them on the analysis card."
            tip="A minimum 1:2 risk-reward ratio is recommended. Analyses with clear stops generate more subscriber trust."
          />
          <StepCard
            number={5}
            title="Write your thesis"
            description="Use the rich-text editor to write your analysis. Include timeframe, key levels, catalysts, and chart patterns. The editor supports bold, bullet points, and inline code blocks for levels."
          />
          <StepCard
            number={6}
            title="Upload supporting charts"
            description="Drag and drop PNG/JPG chart images. Up to 4 images per analysis are supported. Images are auto-compressed and CDN-hosted."
          />
          <StepCard
            number={7}
            title="Set visibility and publish"
            description="Choose Public (visible to all users) or Subscribers Only. Hit Publish. The analysis immediately appears in the feed and Telegram alerts are dispatched to your subscribers."
          />
          <TipBox>
            Analyses receive significantly more engagement when published during pre-market hours (6:00–9:30 AM ET) or after the US market opens. Schedule accordingly.
          </TipBox>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <SectionHeader icon={Eye} title="Viewing & Engaging with Analyses" subtitle="Interact with the community's published market content." />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {[
              { icon: Filter, label: 'Filter by Status', desc: 'Filter the feed to show: Active, Closed (profit), Closed (loss), or Expired analyses.' },
              { icon: SortAsc, label: 'Sort Options', desc: 'Sort by newest, oldest, highest win rate, or most liked.' },
              { icon: Star, label: 'Likes & Saves', desc: 'Like analyses to boost their visibility. Save analyses to your personal watchlist for easy reference.' },
              { icon: Share2, label: 'Share Analysis', desc: 'Each analysis has a unique public URL for sharing outside the platform.' },
              { icon: MessageSquare, label: 'Comments', desc: 'Engage with the Analyzer via the comments section below each analysis.' },
              { icon: Bell, label: 'Price Alerts', desc: 'Subscribe to price alerts on any analysis to be notified when targets are hit.' },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex gap-3 p-3 rounded-lg border border-border bg-secondary/10">
                <Icon className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold mb-0.5">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <SectionHeader icon={Target} title="Analysis Status Lifecycle" subtitle="Understand how analyses progress from open to closed." />
        </CardHeader>
        <CardContent>
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
            {[
              { status: 'Active', color: 'bg-blue-500', desc: 'Analysis is live. Price tracking is active and targets have not yet been hit.' },
              { status: 'Target Hit', color: 'bg-emerald-500', desc: 'One or more profit targets have been reached. The analysis is auto-updated.' },
              { status: 'Stop Hit', color: 'bg-red-500', desc: 'Stop-loss price was breached. The platform records this as a loss.' },
              { status: 'Closed (Manual)', color: 'bg-violet-500', desc: 'The Analyzer manually closed the analysis with a custom outcome note.' },
              { status: 'Expired', color: 'bg-slate-500', desc: 'The analysis passed its set time horizon without hitting targets or stop.' },
            ].map(({ status, color, desc }) => (
              <div key={status} className="flex gap-4 pl-8 pb-5 relative">
                <div className={`absolute left-2 top-1.5 w-4 h-4 rounded-full border-2 border-background ${color} flex-shrink-0`} />
                <div>
                  <p className="text-sm font-semibold">{status}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TradesTab() {
  return (
    <div className="space-y-8">
      <Card>
        <CardHeader className="pb-3">
          <SectionHeader icon={LineChart} title="Opening a Trade" subtitle="Log and monitor trades with real-time P&L tracking." />
        </CardHeader>
        <CardContent>
          <StepCard
            number={1}
            title="Go to Trades"
            description="Click 'Trades' in the sidebar. This opens your private trade journal. Unlike analyses, trades are always private to your account."
          />
          <StepCard
            number={2}
            title="Click 'New Trade'"
            description="Press the + button or 'New Trade' button. A dialog opens with the trade creation form."
          />
          <StepCard
            number={3}
            title="Select symbol and direction"
            description="Enter the ticker symbol. Select Long or Short. The current market price is auto-populated as a suggested entry."
            tip="You can override the auto-populated price if you entered the trade at a different level."
          />
          <StepCard
            number={4}
            title="Set position size"
            description="Enter the number of shares (or contracts for options). The platform uses this to calculate dollar-denominated P&L in addition to percentage returns."
          />
          <StepCard
            number={5}
            title="Define stop-loss and targets"
            description="Set your stop-loss and up to 3 profit targets. The risk-reward ratio and maximum loss dollar amount are shown automatically."
          />
          <StepCard
            number={6}
            title="Link to an analysis (optional)"
            description="If this trade corresponds to a published analysis, link it here. This syncs the trade outcome with the analysis performance metrics."
          />
          <StepCard
            number={7}
            title="Monitor and close"
            description="Live P&L updates as market prices move. When you exit the trade, click 'Close Trade', enter the exit price, and the final result is recorded in your performance history."
          />
          <WarningBox>
            AnalyzingHub tracks performance for educational and journaling purposes only. This does not constitute brokerage functionality — trades are not executed through the platform.
          </WarningBox>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <SectionHeader icon={PieChart} title="Trade Performance Analytics" subtitle="Understand your historical performance statistics." />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            {[
              { metric: 'Win Rate', formula: 'Winning Trades ÷ Total Closed', tip: 'Target: > 55%' },
              { metric: 'Avg R:R', formula: 'Avg Profit ÷ Avg Loss', tip: 'Target: > 1.5' },
              { metric: 'Profit Factor', formula: 'Total Profits ÷ Total Losses', tip: 'Target: > 1.5' },
              { metric: 'Max Drawdown', formula: 'Peak-to-Trough equity decline', tip: 'Keep below 15%' },
              { metric: 'Expectancy', formula: '(Win% × Avg Win) – (Loss% × Avg Loss)', tip: 'Should be positive' },
              { metric: 'Sharpe Ratio', formula: 'Return ÷ Volatility of Returns', tip: 'Target: > 1.0' },
            ].map(({ metric, formula, tip }) => (
              <div key={metric} className="p-3 rounded-lg border border-border bg-card">
                <p className="text-sm font-bold text-foreground mb-1">{metric}</p>
                <p className="text-[11px] text-muted-foreground font-mono mb-2">{formula}</p>
                <div className="flex items-center gap-1 text-[10px] text-emerald-400">
                  <Target className="h-2.5 w-2.5" />
                  {tip}
                </div>
              </div>
            ))}
          </div>
          <TipBox>
            Access your full performance analytics report at Dashboard → Financial. Charts show monthly P&L curves, win/loss streaks and symbol-level breakdowns.
          </TipBox>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <SectionHeader icon={Activity} title="Trade Monitor" subtitle="Real-time overview of all open positions." />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { label: 'Live P&L Column', desc: 'Updates every 15 seconds with the latest quote. Green = profit, Red = loss.' },
              { label: 'Distance to Stop', desc: 'Shows how far current price is from your stop-loss, expressed as % and dollar amount.' },
              { label: 'Distance to Target', desc: 'Shows how far current price is from your nearest profit target.' },
              { label: 'Trade Age', desc: 'Shows how many days the trade has been open to help monitor time decay risk.' },
              { label: 'Quick Close', desc: 'Click the close button on any trade row to immediately record the exit at current market price.' },
            ].map(({ label, desc }) => (
              <div key={label} className="flex items-start gap-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">{label}: </span>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function IndicesTab() {
  return (
    <div className="space-y-8">
      <Card>
        <CardHeader className="pb-3">
          <SectionHeader icon={Cpu} title="Indices Hub Terminal" subtitle="Professional-grade terminal for major indices — SPX, NDX, DJI, VIX and more." />
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border overflow-hidden mb-6">
            <div className="bg-secondary/40 border-b border-border px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
                </div>
                <span className="text-[11px] text-muted-foreground font-mono ml-2">indices-hub — Live Terminal</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-400 font-mono">LIVE</span>
              </div>
            </div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                { sym: 'SPX', val: '5,847.21', chg: '+1.24%', bull: true },
                { sym: 'NDX', val: '20,941.5', chg: '+1.87%', bull: true },
                { sym: 'DJI', val: '43,112.0', chg: '+0.54%', bull: true },
                { sym: 'VIX', val: '14.83', chg: '-8.2%', bull: false },
                { sym: 'NVDA', val: '878.40', chg: '+3.14%', bull: true },
              ].map(({ sym, val, chg, bull }) => (
                <div key={sym} className="bg-card border border-border rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground font-mono mb-1">{sym}</p>
                  <p className="text-sm font-bold font-mono text-foreground">{val}</p>
                  <p className={`text-[11px] font-mono font-semibold ${bull ? 'text-emerald-400' : 'text-red-400'}`}>{chg}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <StepCard
              number={1}
              title="Navigate to Indices Hub"
              description="Click 'Indices Hub' in the sidebar to expand it, then select 'Indices Feed'. The terminal loads with a global market bar showing live index prices."
            />
            <StepCard
              number={2}
              title="Explore the Overview tab"
              description="The Overview tab shows aggregated market data: sector performance, market breadth indicators, and recent index analyses from all Analyzers."
            />
            <StepCard
              number={3}
              title="Create an index analysis"
              description="Analyzers can publish index-specific analyses. Select 'Create Index Analysis' in the sidebar. The form is optimised for indices with fields for contract type (futures, cash) and expiry."
            />
            <StepCard
              number={4}
              title="Use the right panel"
              description="The terminal right panel shows an analysis detail view. Click any analysis row in the feed to load its full content, targets and comments without leaving the terminal."
              tip="Pin the right panel to keep it visible while browsing the list."
            />
            <StepCard
              number={5}
              title="Access SPX Intelligence"
              description="In the sidebar under Indices Hub, click 'SPX Intelligence'. This opens the dedicated SPX terminal with AI signals, options flow and gamma exposure charts."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <SectionHeader icon={Star} title="SPX Intelligence Dashboard" subtitle="AI-generated signals, options flow and gamma exposure for S&P 500 options traders." badge="Advanced" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {[
              { icon: Zap, label: 'AI Signals', desc: 'Machine-learning generated bullish/bearish signals based on options positioning, put/call ratios and volatility surface analysis.' },
              { icon: Layers, label: 'Gamma Exposure (GEX)', desc: 'Visualises dealer gamma positioning across strike prices. Positive GEX = suppressed volatility. Negative GEX = amplified moves.' },
              { icon: BarChart3, label: 'Options Flow', desc: 'Real-time unusual options activity: large block trades, sweeps and repeat buyers that indicate institutional positioning.' },
              { icon: Database, label: 'Historical Signals', desc: 'Review past SPX signals with outcome annotations. Use this to calibrate your own reading of the AI output.' },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex gap-3 p-4 rounded-lg border border-violet-500/20 bg-violet-500/5">
                <Icon className="h-5 w-5 text-violet-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold mb-1">{label}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <WarningBox>
            SPX Intelligence signals are generated from quantitative models and are intended as one input among many. They do not constitute trading advice. Always apply your own analysis before making decisions.
          </WarningBox>
        </CardContent>
      </Card>
    </div>
  );
}

function ReportsTab() {
  return (
    <div className="space-y-8">
      <Card>
        <CardHeader className="pb-3">
          <SectionHeader icon={FileText} title="Automated Performance Reports" subtitle="Generate and distribute professional PDF reports to your Telegram subscribers." badge="Analyzer Only" />
        </CardHeader>
        <CardContent>
          <StepCard
            number={1}
            title="Connect your Telegram channel"
            description="Go to Settings → Telegram. Enter your bot token and channel ID. The platform verifies the connection and shows a confirmation message."
            tip="Create a dedicated Telegram channel for your subscribers. Keep it separate from personal chats."
          />
          <StepCard
            number={2}
            title="Configure report settings"
            description="Navigate to Indices Hub → Daily Reports → Settings. Set your preferred language (English, Arabic, or both), schedule time, and timezone."
          />
          <StepCard
            number={3}
            title="Choose report type and period"
            description="Select Daily, Weekly or Monthly. Daily reports auto-include all trades closed that day. Weekly/monthly compile aggregate statistics over the period."
          />
          <StepCard
            number={4}
            title="Preview before sending"
            description="Click 'Generate Preview'. A PDF is rendered showing exactly what your subscribers will receive. Review it carefully before enabling auto-send."
          />
          <StepCard
            number={5}
            title="Enable automatic dispatch"
            description="Toggle 'Auto-send' on. Reports will be generated and sent to your Telegram channel at the scheduled time without any manual action required."
          />
          <TipBox>
            Reports include your branding (display name, profile image) and all key performance statistics: win rate, net P&L, trade breakdown table, and a monthly equity curve chart.
          </TipBox>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <SectionHeader icon={Download} title="Manual Report Generation" subtitle="Generate and download reports on demand for any time period." />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {[
              { icon: FileText, format: 'PDF', desc: 'Full branded PDF with charts, tables and equity curve. Best for sharing with subscribers.' },
              { icon: Globe, format: 'HTML', desc: 'Interactive web report. Can be shared as a link or embedded in emails.' },
              { icon: Download, format: 'Image (PNG)', desc: 'Single-image summary card. Ideal for posting directly to social media.' },
            ].map(({ icon: Icon, format, desc }) => (
              <div key={format} className="p-4 rounded-lg border border-border bg-card text-center">
                <Icon className="h-6 w-6 text-primary mx-auto mb-2" />
                <p className="font-bold text-sm mb-1">{format}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <FeatureChip icon={RefreshCw} label="Auto-regenerate on close" />
            <FeatureChip icon={Send} label="One-click Telegram send" />
            <FeatureChip icon={Globe} label="Bilingual EN/AR" />
            <FeatureChip icon={Download} label="Download to device" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RankingsTab() {
  return (
    <div className="space-y-8">
      <Card>
        <CardHeader className="pb-3">
          <SectionHeader icon={Trophy} title="Leaderboard & Rankings" subtitle="Discover top-performing Analyzers and track your competitive standing." />
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border overflow-hidden mb-6">
            <div className="bg-gradient-to-r from-amber-500/10 to-amber-600/5 border-b border-border px-4 py-3 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-semibold">Top Analyzers — This Month</span>
            </div>
            <div className="divide-y divide-border">
              {[
                { rank: 1, name: 'Analyzer Example A', wr: '82%', pnl: '+$48,200', badge: '🥇' },
                { rank: 2, name: 'Analyzer Example B', wr: '76%', pnl: '+$31,800', badge: '🥈' },
                { rank: 3, name: 'Analyzer Example C', wr: '71%', pnl: '+$27,400', badge: '🥉' },
              ].map(({ rank, name, wr, pnl, badge }) => (
                <div key={rank} className="flex items-center gap-4 px-4 py-3">
                  <span className="text-lg">{badge}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{name}</p>
                    <p className="text-xs text-muted-foreground">Win Rate: {wr}</p>
                  </div>
                  <p className="text-sm font-bold text-emerald-400 font-mono">{pnl}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {[
              { title: 'Ranking Score Formula', desc: 'Score = (Win Rate × 0.4) + (Avg R:R × 0.3) + (Trade Count × 0.15) + (Subscriber Count × 0.15). All components are normalised on a 0–100 scale.' },
              { title: 'Time Periods', desc: 'Toggle between All Time, This Month, This Week. Rankings reset monthly for the monthly leaderboard. All-time is cumulative.' },
              { title: 'Filter by Specialisation', desc: 'Filter the leaderboard by asset class: Equities, Indices, Crypto, or All. Find top performers in your area of interest.' },
            ].map(({ title, desc }) => (
              <div key={title} className="p-4 rounded-lg border border-border bg-secondary/10">
                <p className="text-sm font-semibold mb-1">{title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <SectionHeader icon={Users} title="Subscriptions & Community" subtitle="Build your audience as an Analyzer or follow top traders as a subscriber." />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">For Analyzers</p>
              {[
                'Create subscription tiers with custom names and pricing',
                'Set monthly or annual billing cycles',
                'Restrict specific analyses to paid subscribers only',
                'View subscriber count and monthly revenue in Financial dashboard',
                'Send direct Telegram alerts to all active subscribers',
              ].map(f => (
                <div key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
                  {f}
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">For Traders</p>
              {[
                'Browse Analyzers by specialisation and win rate',
                'Subscribe with one click from any Analyzer profile',
                'Manage all active subscriptions in one dashboard',
                'Receive instant Telegram alerts for new analyses',
                'Cancel or pause subscriptions at any time',
              ].map(f => (
                <div key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  {f}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AccountTab() {
  return (
    <div className="space-y-8">
      <Card>
        <CardHeader className="pb-3">
          <SectionHeader icon={User} title="Profile Management" subtitle="Build a professional presence that attracts subscribers." />
        </CardHeader>
        <CardContent>
          <StepCard number={1} title="Edit profile information" description="Go to My Profile → click 'Edit Profile'. Update your display name, bio (up to 500 characters), and trading specialisations." tip="Write your bio in third person for a more professional tone." />
          <StepCard number={2} title="Upload a profile photo" description="Click the avatar to upload. Supported formats: JPEG, PNG, WebP. Recommended size: 400×400px. The image is auto-cropped to a circle." />
          <StepCard number={3} title="Set your trading style tags" description="Add tags like 'Swing Trader', 'Options', 'Technical Analysis' to your profile. These appear on your public profile and improve discoverability." />
          <StepCard number={4} title="View your public profile" description="Click 'View Public Profile' to see exactly what subscribers see. Your win rate, total analyses, and subscriber count are displayed publicly." />
          <TipBox>Your follower count and performance stats are updated in real time. High-quality, consistent analyses are the most effective way to grow your subscriber base.</TipBox>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <SectionHeader icon={Lock} title="Security & Authentication" subtitle="Keep your account secure with OTP-based login." />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {[
              { icon: Mail, label: 'OTP Login', desc: 'AnalyzingHub uses one-time password (OTP) codes sent to your email. No passwords are stored — your account cannot be compromised by a password leak.' },
              { icon: Lock, label: 'Session Security', desc: 'Sessions use secure HTTP-only cookies managed by Supabase Auth. Sessions expire after 30 days of inactivity.' },
              { icon: Shield, label: 'Role-Based Access', desc: 'RBAC controls what each role can see and do. Attempting to access restricted routes redirects to the dashboard with an access-denied notice.' },
              { icon: Bell, label: 'Login Notifications', desc: 'You receive an email notification whenever a new session is started from an unrecognised device or location.' },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex gap-3 p-3 rounded-lg border border-border bg-secondary/10">
                <Icon className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold mb-0.5">{label}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <SectionHeader icon={Settings} title="Settings Reference" subtitle="A map of every settings section and what it controls." />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { path: 'Settings → Account', desc: 'Display name, email, role, account deletion' },
              { path: 'Settings → Profile', desc: 'Bio, photo, trading tags, social links' },
              { path: 'Settings → Notifications', desc: 'Alert types, thresholds, email frequency' },
              { path: 'Settings → Telegram', desc: 'Bot token, channel ID, alert preferences' },
              { path: 'Settings → Appearance', desc: 'Theme (dark/light), language (EN/AR)' },
              { path: 'Settings → Billing', desc: 'Subscription plan, payment history, invoices' },
            ].map(({ path, desc }) => (
              <div key={path} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                <code className="text-xs bg-secondary border border-border rounded px-2 py-0.5 text-primary font-mono whitespace-nowrap">{path}</code>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────── */

export default function HelpTutorialsPage() {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('getting-started');

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">

      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-violet-500/8 pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-32 translate-x-32 pointer-events-none" />
        <div className="relative px-6 py-10 md:px-10 md:py-14">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-xs font-semibold text-primary tracking-wide">Documentation v2.0</span>
            </div>
          </div>
          <div className="max-w-2xl">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3 leading-tight">
              Help & Tutorials
            </h1>
            <p className="text-muted-foreground text-base md:text-lg leading-relaxed mb-8">
              Everything you need to master AnalyzingHub — from your first login to advanced SPX intelligence workflows.
            </p>
            <div className="relative max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search tutorials, features, FAQs…"
                className="pl-10 pr-4 py-2.5 h-11 bg-background/60 border-border focus:border-primary"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 mt-8">
            {[
              { icon: BookOpen, label: '8 Tutorial Sections' },
              { icon: GraduationCap, label: '41 Step-by-step Guides' },
              { icon: HelpCircle, label: '8 FAQ Answers' },
              { icon: Keyboard, label: 'Keyboard Shortcuts' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="h-3.5 w-3.5 text-primary" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Platform Image Banner ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative rounded-xl overflow-hidden border border-border aspect-video bg-secondary/40 flex items-center justify-center group">
          <Image
            src="/image.png"
            alt="AnalyzingHub Dashboard"
            fill
            className="object-cover opacity-70 group-hover:opacity-90 transition-opacity"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4">
            <p className="text-sm font-semibold text-white">Main Dashboard</p>
            <p className="text-xs text-white/70">Performance overview and live feed</p>
          </div>
        </div>
        <div className="relative rounded-xl overflow-hidden border border-border aspect-video bg-secondary/40 flex items-center justify-center group">
          <Image
            src="/image copy.png"
            alt="Indices Terminal"
            fill
            className="object-cover opacity-70 group-hover:opacity-90 transition-opacity"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4">
            <p className="text-sm font-semibold text-white">Indices Hub Terminal</p>
            <p className="text-xs text-white/70">Professional-grade index analytics</p>
          </div>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="text-base font-bold">Quick Start</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {QUICK_ACTIONS.map(({ icon: Icon, title, desc, color, bg, badge, badgeColor, tab }) => (
            <button
              key={title}
              onClick={() => setActiveTab(tab)}
              className={`text-left p-4 rounded-xl border transition-all hover:scale-[1.02] hover:shadow-lg ${bg} group`}
            >
              <div className="flex items-start justify-between mb-3">
                <Icon className={`h-6 w-6 ${color}`} />
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
              </div>
              <p className="text-sm font-bold text-foreground mb-1 group-hover:text-primary transition-colors">{title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground group-hover:text-primary transition-colors">
                Read guide <ArrowRight className="h-3 w-3" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main Tutorial Tabs ── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <BookMarked className="h-4 w-4 text-primary" />
          <h2 className="text-base font-bold">Deep Tutorials</h2>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto pb-1 -mx-1 px-1">
            <TabsList className="flex w-max gap-1 bg-secondary/40 p-1 h-auto mb-6">
              {CATEGORIES.map(({ id, label, icon: Icon, count }) => (
                <TabsTrigger
                  key={id}
                  value={id}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Icon className="h-3 w-3" />
                  {label}
                  <span className="opacity-60 text-[10px]">{count}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="getting-started"><GettingStartedTab /></TabsContent>
          <TabsContent value="dashboard"><DashboardTab /></TabsContent>
          <TabsContent value="analysis"><AnalysisTab /></TabsContent>
          <TabsContent value="trades"><TradesTab /></TabsContent>
          <TabsContent value="indices"><IndicesTab /></TabsContent>
          <TabsContent value="reports"><ReportsTab /></TabsContent>
          <TabsContent value="rankings"><RankingsTab /></TabsContent>
          <TabsContent value="account"><AccountTab /></TabsContent>
        </Tabs>
      </div>

      {/* ── Keyboard Shortcuts ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Keyboard Shortcuts</CardTitle>
          </div>
          <CardDescription>Speed up your workflow with these shortcuts.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {KEYBOARD_SHORTCUTS.map(({ keys, desc }) => (
              <div key={desc} className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-secondary/20">
                <div className="flex items-center gap-0.5">
                  {keys.map((k, i) => (
                    <span key={i} className="flex items-center gap-0.5">
                      <kbd className="px-1.5 py-0.5 text-[11px] font-mono font-semibold bg-secondary border border-border rounded text-foreground">
                        {k}
                      </kbd>
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

      {/* ── Additional Platform Screenshots ── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <MonitorPlay className="h-4 w-4 text-primary" />
          <h2 className="text-base font-bold">Platform Screenshots</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { src: '/image copy copy.png', label: 'Analysis Creation', desc: 'Rich analysis editor with price targets' },
            { src: '/image copy copy copy.png', label: 'Trade Monitor', desc: 'Live P&L tracking across positions' },
            { src: '/new_project_(6).png', label: 'Performance Reports', desc: 'Automated PDF reports for subscribers' },
          ].map(({ src, label, desc }) => (
            <div key={label} className="relative rounded-xl overflow-hidden border border-border aspect-[4/3] bg-secondary/40 group">
              <Image
                src={src}
                alt={label}
                fill
                className="object-cover opacity-65 group-hover:opacity-90 transition-opacity duration-300"
                sizes="(max-width: 768px) 100vw, 33vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
              <div className="absolute bottom-3 left-3 right-3">
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="text-xs text-white/70">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FAQ ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Frequently Asked Questions</CardTitle>
          </div>
          <CardDescription>Common questions answered by the AnalyzingHub team.</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-sm font-semibold text-left hover:text-primary transition-colors">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* ── Support Footer ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            icon: LifeBuoy,
            title: 'Contact Support',
            desc: 'Reach the AnalyzingHub team directly for account or technical issues.',
            action: 'Open Support',
            color: 'text-blue-400',
            bg: 'bg-blue-500/10 border-blue-500/20',
          },
          {
            icon: BookOpen,
            title: 'Release Notes',
            desc: 'Read the latest platform updates, new features and bug fixes.',
            action: 'View Changelog',
            color: 'text-violet-400',
            bg: 'bg-violet-500/10 border-violet-500/20',
          },
          {
            icon: Bookmark,
            title: 'Restart Platform Tour',
            desc: 'Launch the interactive guided tour to re-familiarise yourself with any feature.',
            action: 'Start Tour',
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10 border-emerald-500/20',
          },
        ].map(({ icon: Icon, title, desc, action, color, bg }) => (
          <div key={title} className={`rounded-xl border p-5 ${bg} flex flex-col`}>
            <Icon className={`h-6 w-6 ${color} mb-3`} />
            <p className="font-bold text-sm mb-1">{title}</p>
            <p className="text-xs text-muted-foreground leading-relaxed flex-1">{desc}</p>
            <Button variant="outline" size="sm" className="mt-4 w-full text-xs">
              {action} <ArrowRight className="h-3 w-3 ml-1.5" />
            </Button>
          </div>
        ))}
      </div>

      {/* ── Terminal Disclaimer ── */}
      <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-secondary/20 text-xs text-muted-foreground">
        <Terminal className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
        <p>
          <span className="font-bold text-foreground">AnalyzingHub Terminal</span> — All platform content is for educational and informational purposes only.
          Market analyses and trade records are user-generated. Past performance does not guarantee future results.
          Always conduct independent research before making financial decisions.
        </p>
      </div>
    </div>
  );
}
