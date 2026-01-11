'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Clock,
  Activity,
  TrendingUp,
  TrendingDown,
  Target,
  AlertCircle,
  User,
  X,
  ExternalLink,
  Zap,
  CheckCircle2
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface Trade {
  id: string
  status: 'draft' | 'active' | 'tp_hit' | 'sl_hit' | 'closed' | 'canceled'
  instrument_type: 'options' | 'futures'
  direction: 'call' | 'put' | 'long' | 'short'
  strike: number | null
  expiry: string | null
  option_type: string | null
  entry_contract_snapshot: { mid: number; bid?: number; ask?: number }
  current_contract: number
  contract_high_since: number
  contract_low_since: number
  targets: Array<{ price: number, percentage: number, hit?: boolean }>
  stoploss: { price: number, percentage: number } | null
  notes: string | null
  published_at: string
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
  activation_enabled?: boolean
  activation_type?: 'PASSING_PRICE' | 'ABOVE_PRICE' | 'UNDER_PRICE'
  activation_price?: number
  activation_timeframe?: 'INTRABAR' | '1H_CLOSE' | '4H_CLOSE' | 'DAILY_CLOSE'
  activation_status?: 'draft' | 'published_inactive' | 'active' | 'completed_success' | 'completed_fail' | 'cancelled' | 'expired'
  activated_at?: string
  activation_met_at?: string
  preactivation_stop_touched?: boolean
  preactivation_stop_touched_at?: string
  author?: {
    id: string
    full_name: string
    avatar_url?: string
  }
}

interface IndexAnalysisDetailDialogProps {
  analysisId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectTrade: (tradeId: string) => void
}

export function IndexAnalysisDetailDialog({
  analysisId,
  open,
  onOpenChange,
  onSelectTrade
}: IndexAnalysisDetailDialogProps) {
  const [analysis, setAnalysis] = useState<IndexAnalysis | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (analysisId && open) {
      fetchAnalysisDetails()
    }
  }, [analysisId, open])

  const fetchAnalysisDetails = async () => {
    if (!analysisId) return

    setLoading(true)
    try {
      const response = await fetch(`/api/indices/analyses/${analysisId}`)
      if (response.ok) {
        const data = await response.json()
        setAnalysis({
          ...data.analysis,
          trades: data.trades || []
        })
      } else {
        toast.error('Failed to load analysis details')
      }
    } catch (error) {
      toast.error('Failed to load analysis details')
    } finally {
      setLoading(false)
    }
  }

  const calculatePnL = (trade: Trade) => {
    const entryPrice = trade.entry_contract_snapshot.mid
    const currentPrice = trade.current_contract
    const pnlPercentage = ((currentPrice - entryPrice) / entryPrice) * 100

    const multiplier = trade.direction === 'call' || trade.direction === 'long' ? 1 : -1
    const adjustedPnL = pnlPercentage * multiplier

    return {
      percentage: adjustedPnL,
      isPositive: adjustedPnL > 0,
      value: currentPrice - entryPrice
    }
  }

  const getStatusBadge = (status: Trade['status']) => {
    const config = {
      draft: { variant: 'secondary' as const, label: 'Draft' },
      active: { variant: 'default' as const, label: 'Active' },
      tp_hit: { variant: 'default' as const, label: 'Target Hit', color: 'bg-green-500' },
      sl_hit: { variant: 'destructive' as const, label: 'Stop Loss Hit' },
      closed: { variant: 'outline' as const, label: 'Closed' },
      canceled: { variant: 'secondary' as const, label: 'Canceled' },
    }
    return config[status]
  }

  const getActivationTypeLabel = (type?: string) => {
    switch (type) {
      case 'PASSING_PRICE': return 'Passing Price'
      case 'ABOVE_PRICE': return 'Price Above'
      case 'UNDER_PRICE': return 'Price Under'
      default: return 'Unknown'
    }
  }

  const getActivationStatusLabel = (status?: string) => {
    switch (status) {
      case 'published_inactive': return 'Waiting for Activation'
      case 'active': return 'Active'
      case 'completed_success': return 'Completed Successfully'
      case 'completed_fail': return 'Failed'
      case 'cancelled': return 'Cancelled'
      case 'expired': return 'Expired'
      default: return status
    }
  }

  const isConditionMet = analysis?.activation_enabled &&
    (analysis.activation_status === 'active' ||
     analysis.activation_status === 'completed_success' ||
     analysis.activation_status === 'completed_fail')

  if (!analysis) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0">
        <ScrollArea className="max-h-[90vh]">
          <div className="p-6">
            <DialogHeader className="space-y-4">
              {/* Header with Index Symbol */}
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <Badge className="text-lg font-bold px-4 py-1.5">
                    {analysis.index_symbol}
                  </Badge>
                  <DialogTitle className="text-2xl font-bold leading-tight">
                    {analysis.title}
                  </DialogTitle>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onOpenChange(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Meta Info */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {analysis.author && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    <span>{analysis.author.full_name}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>
                    {analysis.published_at
                      ? format(new Date(analysis.published_at), 'PPP p')
                      : 'Not published'}
                  </span>
                </div>
                <Badge variant={analysis.status === 'published' ? 'default' : 'secondary'}>
                  {analysis.status}
                </Badge>
              </div>
            </DialogHeader>

            <Separator className="my-6" />

            {/* Chart Image */}
            {analysis.chart_image_url && (
              <div className="mb-6 rounded-lg overflow-hidden border bg-muted/20">
                <img
                  src={analysis.chart_image_url}
                  alt={analysis.title}
                  className="w-full h-auto"
                />
              </div>
            )}

            {/* Analysis Body */}
            <div className="mb-6 space-y-2">
              <h3 className="font-semibold text-lg">Analysis</h3>
              <div className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {analysis.body}
              </div>
            </div>

            {/* Activation Condition */}
            {analysis.activation_enabled && (
              <div className="mb-6">
                <div className={`border-2 rounded-lg p-4 ${
                  isConditionMet
                    ? 'border-green-500/50 bg-green-50 dark:bg-green-900/20'
                    : analysis.preactivation_stop_touched
                    ? 'border-orange-500/50 bg-orange-50 dark:bg-orange-900/20'
                    : 'border-amber-500/50 bg-amber-50 dark:bg-amber-900/20'
                }`}>
                  <div className="flex items-start gap-3">
                    {isConditionMet ? (
                      <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <Zap className="h-6 w-6 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 space-y-3">
                      <div>
                        <h4 className="font-semibold text-base mb-1">
                          {isConditionMet ? 'Activation Condition Met ✓' : 'Activation Condition Required'}
                        </h4>
                        <p className="text-sm opacity-90">
                          This analysis will activate when price {getActivationTypeLabel(analysis.activation_type).toLowerCase()} ${analysis.activation_price?.toFixed(2)}
                          {analysis.activation_timeframe && analysis.activation_timeframe !== 'INTRABAR' && (
                            <span> at {analysis.activation_timeframe.replace('_', ' ').toLowerCase()}</span>
                          )}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge variant={isConditionMet ? 'default' : 'outline'} className="text-xs">
                          Status: {getActivationStatusLabel(analysis.activation_status)}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          Condition: {getActivationTypeLabel(analysis.activation_type)}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          Price: ${analysis.activation_price?.toFixed(2)}
                        </Badge>
                        {analysis.activation_timeframe && analysis.activation_timeframe !== 'INTRABAR' && (
                          <Badge variant="outline" className="text-xs">
                            Timeframe: {analysis.activation_timeframe.replace('_', ' ')}
                          </Badge>
                        )}
                      </div>

                      {analysis.preactivation_stop_touched && !isConditionMet && (
                        <div className="flex items-start gap-2 p-2 rounded bg-orange-100 dark:bg-orange-900/30 text-sm">
                          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-orange-600 dark:text-orange-400" />
                          <div>
                            <p className="font-medium">Stop Touched Before Activation</p>
                            <p className="text-xs opacity-80 mt-1">
                              The stop loss was touched at {analysis.preactivation_stop_touched_at && format(new Date(analysis.preactivation_stop_touched_at), 'PPP p')}. This is not counted as a failure since the analysis was not yet active.
                            </p>
                          </div>
                        </div>
                      )}

                      {isConditionMet && analysis.activated_at && (
                        <div className="flex items-start gap-2 p-2 rounded bg-green-100 dark:bg-green-900/30 text-sm">
                          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-green-600 dark:text-green-400" />
                          <div>
                            <p className="font-medium">Analysis Activated</p>
                            <p className="text-xs opacity-80 mt-1">
                              Condition was met on {format(new Date(analysis.activated_at), 'PPP p')}
                              {analysis.activation_met_at && analysis.activation_met_at !== analysis.activated_at && (
                                <span> (first detected at {format(new Date(analysis.activation_met_at), 'PPP p')})</span>
                              )}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <Separator className="my-6" />

            {/* Trades Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Trades ({analysis.trades?.length || 0})
                </h3>
              </div>

              {!analysis.trades || analysis.trades.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>No trades added yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(analysis.trades || []).map((trade) => {
                    const pnl = calculatePnL(trade)
                    const statusConfig = getStatusBadge(trade.status)

                    return (
                      <div
                        key={trade.id}
                        className="border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer hover:border-primary/50"
                        onClick={() => {
                          onSelectTrade(trade.id)
                          onOpenChange(false)
                        }}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {trade.instrument_type.toUpperCase()}
                              </Badge>
                              <Badge variant={statusConfig.variant}>
                                {statusConfig.label}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              {trade.direction === 'call' || trade.direction === 'long' ? (
                                <TrendingUp className="h-4 w-4 text-green-600" />
                              ) : (
                                <TrendingDown className="h-4 w-4 text-red-600" />
                              )}
                              <span className="font-semibold">
                                {trade.direction.toUpperCase()}
                              </span>
                              {trade.strike && (
                                <span className="text-muted-foreground">
                                  Strike: ${trade.strike}
                                </span>
                              )}
                              {trade.expiry && (
                                <span className="text-muted-foreground">
                                  Exp: {format(new Date(trade.expiry), 'MMM d')}
                                </span>
                              )}
                            </div>
                          </div>

                          {trade.status === 'active' && (
                            <div className="text-right">
                              <div className={`text-2xl font-bold ${pnl.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                                {pnl.isPositive ? '+' : ''}{pnl.percentage.toFixed(2)}%
                              </div>
                              <div className="text-xs text-muted-foreground">
                                ${trade.current_contract.toFixed(2)}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Trade Metrics */}
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <div className="text-muted-foreground text-xs">Entry</div>
                            <div className="font-semibold">
                              ${trade.entry_contract_snapshot.mid.toFixed(2)}
                            </div>
                          </div>
                          {trade.status === 'active' && (
                            <>
                              <div>
                                <div className="text-muted-foreground text-xs">High</div>
                                <div className="font-semibold text-green-600">
                                  ${trade.contract_high_since.toFixed(2)}
                                </div>
                              </div>
                              <div>
                                <div className="text-muted-foreground text-xs">Low</div>
                                <div className="font-semibold text-red-600">
                                  ${trade.contract_low_since.toFixed(2)}
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Targets & Stop Loss */}
                        {(trade.targets.length > 0 || trade.stoploss) && (
                          <div className="mt-3 pt-3 border-t space-y-2">
                            {trade.targets.length > 0 && (
                              <div className="flex items-center gap-2 text-xs">
                                <Target className="h-3 w-3 text-green-600" />
                                <span className="text-muted-foreground">Targets:</span>
                                {trade.targets.map((target, idx) => (
                                  <Badge
                                    key={idx}
                                    variant={target.hit ? 'default' : 'outline'}
                                    className="text-xs"
                                  >
                                    ${target.price} ({target.percentage}%)
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {trade.stoploss && (
                              <div className="flex items-center gap-2 text-xs">
                                <AlertCircle className="h-3 w-3 text-red-600" />
                                <span className="text-muted-foreground">Stop Loss:</span>
                                <Badge variant="outline" className="text-xs">
                                  ${trade.stoploss.price} ({trade.stoploss.percentage}%)
                                </Badge>
                              </div>
                            )}
                          </div>
                        )}

                        {trade.notes && (
                          <div className="mt-3 text-xs text-muted-foreground italic">
                            {trade.notes}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
