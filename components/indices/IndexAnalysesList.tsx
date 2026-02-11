'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
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
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (analyses.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center space-y-3">
            <p className="text-muted-foreground">
              No indices analyses available yet.
            </p>
            <p className="text-sm text-muted-foreground">
              Subscribe to analyzers to see their indices analyses here.
            </p>
            <Button
              variant="default"
              onClick={() => window.location.href = '/dashboard/subscriptions'}
            >
              Browse Analyzers
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
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
