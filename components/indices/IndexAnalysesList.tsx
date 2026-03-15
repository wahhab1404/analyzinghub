'use client'

import { useEffect, useState } from 'react'
import { Loader2, BarChart2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { IndexAnalysisCard } from './IndexAnalysisCard'
import { IndexAnalysisDetailDialog } from './IndexAnalysisDetailDialog'
import { NewTradeDialog } from './NewTradeDialog'
import { FollowUpAnalysisDialog } from './FollowUpAnalysisDialog'

interface Trade {
  id: string
  status: 'draft' | 'active' | 'tp_hit' | 'sl_hit' | 'closed' | 'canceled'
  instrument_type: 'options' | 'futures'
  direction: 'call' | 'put' | 'long' | 'short'
  strike: number | null
  expiry: string | null
  entry_contract_snapshot: { mid: number }
  current_contract: number
  contract_high_since: number
  contract_low_since: number
  targets: Array<{ price: number, percentage: number, hit?: boolean }>
  stoploss: { price: number, percentage: number } | null
}

interface IndexAnalysis {
  id: string
  index_symbol: string
  title: string
  body: string
  chart_image_url?: string
  chart_embed_url?: string
  status: 'draft' | 'published' | 'archived'
  visibility: string
  created_at: string
  published_at: string
  trades: Trade[]
  trades_count: number
  active_trades_count: number
  author?: {
    id: string
    full_name: string
    avatar_url?: string
  }
}

interface IndexAnalysesListProps {
  status: 'active' | 'closed'
  onSelectContract: (contractId: string) => void
  onManageTrades?: (analysisId: string, indexSymbol: string) => void
}

export function IndexAnalysesList({ status, onSelectContract, onManageTrades }: IndexAnalysesListProps) {
  const [analyses, setAnalyses] = useState<IndexAnalysis[]>([])
  const [loading, setLoading] = useState(true)
  const [isAnalyzer, setIsAnalyzer] = useState(false)

  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null)
  const [showDetailDialog, setShowDetailDialog] = useState(false)

  const [newTradeAnalysisId, setNewTradeAnalysisId] = useState<string | null>(null)
  const [newTradeIndexSymbol, setNewTradeIndexSymbol] = useState<string | null>(null)
  const [showNewTradeDialog, setShowNewTradeDialog] = useState(false)

  const [followUpAnalysisId, setFollowUpAnalysisId] = useState<string | null>(null)
  const [followUpIndexSymbol, setFollowUpIndexSymbol] = useState<string | null>(null)
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false)

  useEffect(() => {
    checkUserRole()
    fetchAnalyses()
  }, [status])

  const checkUserRole = async () => {
    try {
      const response = await fetch('/api/me')
      if (response.ok) {
        const data = await response.json()
        console.log('User data:', data)
        const userRole = data.user?.role || data.role
        console.log('User role:', userRole)
        setIsAnalyzer(userRole === 'Analyzer' || userRole === 'SuperAdmin')
      }
    } catch (error) {
      console.error('Failed to check user role:', error)
    }
  }

  const fetchAnalyses = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/indices/analyses?status=published`)
      if (response.ok) {
        const data = await response.json()
        setAnalyses(data.analyses || [])
      }
    } catch (error) {
      toast.error('Failed to load analyses')
    } finally {
      setLoading(false)
    }
  }

  const handleViewDetails = (analysisId: string) => {
    setSelectedAnalysisId(analysisId)
    setShowDetailDialog(true)
  }

  const handleNewTrade = (analysisId: string, indexSymbol: string) => {
    setNewTradeAnalysisId(analysisId)
    setNewTradeIndexSymbol(indexSymbol)
    setShowNewTradeDialog(true)
  }

  const handleFollowUp = (analysisId: string, indexSymbol: string) => {
    setFollowUpAnalysisId(analysisId)
    setFollowUpIndexSymbol(indexSymbol)
    setShowFollowUpDialog(true)
  }

  const handleTradeComplete = () => {
    fetchAnalyses()
  }

  const handleFollowUpComplete = () => {
    fetchAnalyses()
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        <span className="text-[11px] font-mono text-slate-600">Loading analyses…</span>
      </div>
    )
  }

  if (analyses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div
          className="absolute inset-0 opacity-[0.025] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(#94a3b8 1px, transparent 1px), linear-gradient(90deg, #94a3b8 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="relative z-10 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-[#141d2e] border border-[#1a2840] flex items-center justify-center mb-5">
            <BarChart2 className="w-8 h-8 text-slate-700" />
          </div>
          <h3 className="text-sm font-semibold text-slate-400 mb-2">No Analyses Available</h3>
          <p className="text-[11px] text-slate-600 max-w-xs leading-relaxed mb-6">
            {status === 'active'
              ? 'No published analyses yet. Create your first analysis or subscribe to see others.'
              : 'No archived analyses found.'}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchAnalyses}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#1a2840] hover:border-[#2a3850] text-slate-500 hover:text-slate-300 text-[11px] transition-all"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
            {status === 'active' && (
              <button
                onClick={() => (window.location.href = '/dashboard/subscriptions')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/30 text-[11px] font-medium transition-all"
              >
                Browse Analyzers
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Grid header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold tracking-[0.2em] text-slate-700 uppercase">
            {status === 'active' ? 'Active Analyses' : 'Archive'}
          </span>
          <span className="text-[9px] font-mono text-slate-700 bg-[#141d2e] border border-[#1a2840] px-1.5 py-0.5 rounded">
            {analyses.length}
          </span>
        </div>
        <button
          onClick={fetchAnalyses}
          className="flex items-center gap-1 text-[10px] text-slate-700 hover:text-slate-400 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {analyses.map((analysis) => (
          <IndexAnalysisCard
            key={analysis.id}
            analysis={analysis}
            isAnalyzer={isAnalyzer}
            onViewDetails={handleViewDetails}
            onNewTrade={handleNewTrade}
            onFollowUp={handleFollowUp}
            onSelectTrade={onSelectContract}
          />
        ))}
      </div>

      <IndexAnalysisDetailDialog
        analysisId={selectedAnalysisId}
        open={showDetailDialog}
        onOpenChange={setShowDetailDialog}
        onSelectTrade={onSelectContract}
      />

      <NewTradeDialog
        open={showNewTradeDialog}
        onOpenChange={setShowNewTradeDialog}
        analysisId={newTradeAnalysisId}
        indexSymbol={newTradeIndexSymbol}
        onComplete={handleTradeComplete}
      />

      <FollowUpAnalysisDialog
        open={showFollowUpDialog}
        onOpenChange={setShowFollowUpDialog}
        parentAnalysisId={followUpAnalysisId}
        indexSymbol={followUpIndexSymbol}
        onComplete={handleFollowUpComplete}
      />
    </>
  )
}
