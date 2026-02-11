'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, RefreshCw } from 'lucide-react'
import { CreateCompanyTradeDialog } from './CreateCompanyTradeDialog'
import { CompanyTradesList } from './CompanyTradesList'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface StockContractTradesTabProps {
  analysisId: string
  symbol: string
  userId: string
  isOwner: boolean
}

export function CompanyContractTradesTab({
  analysisId,
  symbol,
  userId,
  isOwner
}: StockContractTradesTabProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [trades, setTrades] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    loadTrades()
  }, [analysisId, refreshKey])

  async function loadTrades() {
    setLoading(true)
    try {
      const response = await fetch(`/api/companies/trades?analysis_id=${analysisId}`)
      if (response.ok) {
        const data = await response.json()
        setTrades(data.trades || [])
      }
    } catch (error) {
      console.error('Failed to load trades:', error)
    }
    setLoading(false)
  }

  function handleRefresh() {
    setRefreshKey(prev => prev + 1)
  }

  function handleTradeCreated() {
    setShowCreateDialog(false)
    handleRefresh()
  }

  const activeTrades = trades.filter(t => t.status === 'ACTIVE')
  const closedTrades = trades.filter(t => t.status !== 'ACTIVE')

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Options Trades</CardTitle>
              <CardDescription>
                Track contract trades for {symbol}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              {isOwner && (
                <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Trade
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
              <p className="mt-4 text-muted-foreground">Loading trades...</p>
            </div>
          ) : trades.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                No contract trades yet
              </p>
              {isOwner && (
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Trade
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {activeTrades.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Active Trades</h3>
                  <CompanyTradesList
                    trades={activeTrades}
                    isOwner={isOwner}
                    onTradeUpdated={handleRefresh}
                  />
                </div>
              )}

              {closedTrades.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Closed Trades</h3>
                  <CompanyTradesList
                    trades={closedTrades}
                    isOwner={isOwner}
                    onTradeUpdated={handleRefresh}
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {showCreateDialog && (
        <CreateCompanyTradeDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          analysisId={analysisId}
          symbol={symbol}
          onTradeCreated={handleTradeCreated}
        />
      )}
    </div>
  )
}
