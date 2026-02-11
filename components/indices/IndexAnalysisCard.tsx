'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Activity,
  Plus,
  FileText,
  Target,
  AlertCircle,
  Eye,
  Zap,
  CheckCircle2
} from 'lucide-react'
import { format } from 'date-fns'

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
  targets?: Array<{ level: number; label: string; reached: boolean; reached_at: string | null }>
  invalidation_price?: number
  activation_enabled?: boolean
  activation_type?: 'PASSING_PRICE' | 'ABOVE_PRICE' | 'UNDER_PRICE'
  activation_price?: number
  activation_timeframe?: 'INTRABAR' | '1H_CLOSE' | '4H_CLOSE' | 'DAILY_CLOSE'
  activation_status?: 'draft' | 'published_inactive' | 'active' | 'completed_success' | 'completed_fail' | 'cancelled' | 'expired'
  activated_at?: string
  activation_met_at?: string
  preactivation_stop_touched?: boolean
  author?: {
    id: string
    full_name: string
    avatar_url?: string
  }
}

interface IndexAnalysisCardProps {
  analysis: IndexAnalysis
  isAnalyzer?: boolean
  onViewDetails: (analysisId: string) => void
  onNewTrade: (analysisId: string, indexSymbol: string) => void
  onFollowUp: (analysisId: string, indexSymbol: string) => void
  onSelectTrade: (tradeId: string) => void
}

export function IndexAnalysisCard({
  analysis,
  isAnalyzer = false,
  onViewDetails,
  onNewTrade,
  onFollowUp,
  onSelectTrade
}: IndexAnalysisCardProps) {
  const [imageError, setImageError] = useState(false)

  const calculatePnL = (trade: Trade) => {
    const entryPrice = trade.entry_contract_snapshot.mid

    // For CALL/LONG: best profit is at highest price
    // For PUT/SHORT: best profit is at lowest price
    const bestPrice = (trade.direction === 'call' || trade.direction === 'long')
      ? trade.contract_high_since
      : trade.contract_low_since

    const pnlPercentage = ((bestPrice - entryPrice) / entryPrice) * 100

    const multiplier = trade.direction === 'call' || trade.direction === 'long' ? 1 : -1
    const adjustedPnL = pnlPercentage * multiplier

    return {
      percentage: adjustedPnL,
      isPositive: adjustedPnL > 0,
    }
  }

  const getStatusColor = (status: Trade['status']) => {
    switch (status) {
      case 'active': return 'bg-blue-500'
      case 'tp_hit': return 'bg-green-500'
      case 'sl_hit': return 'bg-red-500'
      case 'closed': return 'bg-gray-500'
      default: return 'bg-gray-400'
    }
  }

  const getDirectionIcon = (direction: Trade['direction']) => {
    return direction === 'call' || direction === 'long' ?
      <TrendingUp className="h-3 w-3" /> :
      <TrendingDown className="h-3 w-3" />
  }

  const getActivationTypeLabel = (type?: string) => {
    switch (type) {
      case 'PASSING_PRICE': return 'Passing'
      case 'ABOVE_PRICE': return 'Above'
      case 'UNDER_PRICE': return 'Under'
      default: return 'Unknown'
    }
  }

  const getActivationStatusLabel = (status?: string) => {
    switch (status) {
      case 'published_inactive': return 'Waiting for Activation'
      case 'active': return 'Active'
      case 'completed_success': return 'Completed'
      case 'completed_fail': return 'Failed'
      default: return status
    }
  }

  const isConditionMet = analysis.activation_enabled &&
    (analysis.activation_status === 'active' ||
     analysis.activation_status === 'completed_success' ||
     analysis.activation_status === 'completed_fail')

  return (
    <Card
      className="group overflow-hidden hover:shadow-xl transition-all duration-300 border-2 hover:border-primary/50 cursor-pointer"
      onClick={() => onViewDetails(analysis.id)}
    >
      {/* Chart Image Section */}
      {analysis.chart_image_url && !imageError ? (
        <div className="relative h-48 bg-gradient-to-br from-gray-900 to-gray-800 overflow-hidden">
          <img
            src={analysis.chart_image_url}
            alt={analysis.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImageError(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

          {/* Index Symbol Badge */}
          <div className="absolute top-3 left-3">
            <Badge className="text-lg font-bold px-4 py-1 bg-primary/90 backdrop-blur-sm">
              {analysis.index_symbol}
            </Badge>
          </div>

          {/* Status Badge */}
          <div className="absolute top-3 right-3">
            <Badge variant={analysis.status === 'published' ? 'default' : 'secondary'} className="backdrop-blur-sm">
              {analysis.status}
            </Badge>
          </div>

          {/* Stats Overlay */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-white text-sm">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full">
                <Activity className="h-4 w-4" />
                <span className="font-semibold">{analysis.trades_count}</span>
                <span className="text-xs opacity-80">trades</span>
              </div>
              {analysis.active_trades_count > 0 && (
                <div className="flex items-center gap-1.5 bg-green-500/40 backdrop-blur-sm px-3 py-1.5 rounded-full">
                  <div className="h-2 w-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="font-semibold">{analysis.active_trades_count}</span>
                  <span className="text-xs opacity-80">active</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-xs bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full">
              <Clock className="h-3 w-3" />
              {analysis.published_at ? format(new Date(analysis.published_at), 'MMM d, HH:mm') : 'Draft'}
            </div>
          </div>
        </div>
      ) : (
        <div className="h-48 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
          <div className="text-center space-y-2">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
            <Badge className="text-lg font-bold px-4 py-1">
              {analysis.index_symbol}
            </Badge>
          </div>
        </div>
      )}

      <CardContent className="p-0">
        {/* Analysis Content */}
        <div className="p-4 space-y-3">
          <h3 className="font-semibold text-lg leading-tight line-clamp-2 group-hover:text-primary transition-colors">
            {analysis.title}
          </h3>

          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {analysis.body}
          </p>

          {/* Targets & Invalidation */}
          {(analysis.targets && analysis.targets.length > 0) || analysis.invalidation_price ? (
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {analysis.targets && analysis.targets.slice(0, 3).map((target, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                    target.reached
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  }`}
                >
                  <Target className="h-3 w-3" />
                  <span>{target.label}: ${target.level.toFixed(2)}</span>
                  {target.reached && <span className="ml-1">✓</span>}
                </div>
              ))}
              {analysis.invalidation_price && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                  <AlertCircle className="h-3 w-3" />
                  <span>Invalid: ${analysis.invalidation_price.toFixed(2)}</span>
                </div>
              )}
            </div>
          ) : null}

          {/* Activation Condition */}
          {analysis.activation_enabled && (
            <div className="pt-2 border-t mt-2">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
                isConditionMet
                  ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                  : analysis.preactivation_stop_touched
                  ? 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
              }`}>
                {isConditionMet ? (
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                ) : (
                  <Zap className="h-4 w-4 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold mb-0.5">
                    {isConditionMet ? 'Condition Met' : 'Activation Required'}
                  </div>
                  <div className="text-xs opacity-90">
                    {getActivationTypeLabel(analysis.activation_type)} ${analysis.activation_price?.toFixed(2)}
                    {analysis.activation_timeframe && analysis.activation_timeframe !== 'INTRABAR' &&
                      ` (${analysis.activation_timeframe.replace('_', ' ')})`}
                  </div>
                  {analysis.preactivation_stop_touched && !isConditionMet && (
                    <div className="text-xs opacity-75 mt-1">
                      ⚠️ Stop touched before activation
                    </div>
                  )}
                  {isConditionMet && analysis.activated_at && (
                    <div className="text-xs opacity-75 mt-1">
                      Activated: {format(new Date(analysis.activated_at), 'MMM d, HH:mm')}
                    </div>
                  )}
                </div>
                <Badge variant={isConditionMet ? 'default' : 'outline'} className="text-xs">
                  {getActivationStatusLabel(analysis.activation_status)}
                </Badge>
              </div>
            </div>
          )}
        </div>

        {/* Trades Section */}
        {analysis.trades.length > 0 && (
          <div className="px-4 pb-4">
            <div className="border rounded-lg overflow-hidden bg-muted/20">
              <div className="px-3 py-2 bg-muted/50 border-b flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Recent Trades
                </span>
                {analysis.active_trades_count > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {analysis.active_trades_count} Active
                  </Badge>
                )}
              </div>

              <div className="p-2 space-y-1.5 max-h-32 overflow-y-auto">
                {analysis.trades.slice(0, 3).map((trade) => {
                  const pnl = calculatePnL(trade)
                  return (
                    <div
                      key={trade.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectTrade(trade.id)
                      }}
                      className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 transition-colors cursor-pointer group/trade"
                    >
                      <div className={`h-2 w-2 rounded-full ${getStatusColor(trade.status)}`} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <Badge variant="outline" className="text-xs px-1.5 py-0">
                            {trade.instrument_type}
                          </Badge>
                          {getDirectionIcon(trade.direction)}
                          <span className="font-medium">
                            {trade.direction.toUpperCase()}
                          </span>
                          {trade.strike && (
                            <>
                              <span className="text-muted-foreground">@</span>
                              <span>${trade.strike}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {trade.status === 'active' && (
                        <div className={`text-xs font-semibold ${pnl.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                          {pnl.isPositive ? '+' : ''}{pnl.percentage.toFixed(1)}%
                        </div>
                      )}

                      <Eye className="h-3 w-3 text-muted-foreground opacity-0 group-hover/trade:opacity-100 transition-opacity" />
                    </div>
                  )
                })}

                {analysis.trades.length > 3 && (
                  <div className="text-center py-1">
                    <span className="text-xs text-muted-foreground">
                      +{analysis.trades.length - 3} more trades
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="p-4 pt-2 flex gap-2 border-t bg-muted/20">
          {isAnalyzer && (
            <>
              <Button
                size="sm"
                variant="default"
                className="flex-1"
                onClick={(e) => {
                  e.stopPropagation()
                  onNewTrade(analysis.id, analysis.index_symbol)
                }}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                New Trade
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={(e) => {
                  e.stopPropagation()
                  onFollowUp(analysis.id, analysis.index_symbol)
                }}
              >
                <FileText className="h-4 w-4 mr-1.5" />
                Follow-up
              </Button>
            </>
          )}

          {!isAnalyzer && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation()
                onViewDetails(analysis.id)
              }}
            >
              View Details
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
