'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, TrendingUp, TrendingDown, Activity, ArrowLeft } from 'lucide-react'
import { CreateIndexAnalysisForm } from '@/components/indices/CreateIndexAnalysisForm'
import { IndexAnalysesList } from '@/components/indices/IndexAnalysesList'
import { AddTradeForm } from '@/components/indices/AddTradeForm'
import { TradesList } from '@/components/indices/TradesList'
import { TradeMonitor } from '@/components/indices/TradeMonitor'
import { useLanguage } from '@/lib/i18n/language-context'

type View = 'list' | 'manage-trades' | 'monitor-trade'

export default function IndicesHubPage() {
  const { t } = useLanguage()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [currentView, setCurrentView] = useState<View>('list')
  const [showAddTradeForm, setShowAddTradeForm] = useState(false)
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null)
  const [selectedIndexSymbol, setSelectedIndexSymbol] = useState<string>('SPX')
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null)

  const handleManageTrades = (analysisId: string, indexSymbol: string) => {
    setSelectedAnalysisId(analysisId)
    setSelectedIndexSymbol(indexSymbol)
    setCurrentView('manage-trades')
    setShowAddTradeForm(false)
  }

  const handleSelectTradeForMonitoring = (tradeId: string) => {
    setSelectedTradeId(tradeId)
    setCurrentView('monitor-trade')
  }

  const handleBackToList = () => {
    setCurrentView('list')
    setSelectedAnalysisId(null)
    setSelectedTradeId(null)
    setShowAddTradeForm(false)
  }

  const handleBackToTrades = () => {
    if (selectedAnalysisId) {
      setCurrentView('manage-trades')
      setSelectedTradeId(null)
    } else {
      handleBackToList()
    }
  }

  const handleTradeAdded = () => {
    setShowAddTradeForm(false)
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {currentView === 'list' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">{t.indicesHub.title}</h1>
              <p className="text-muted-foreground">
                {t.indicesHub.subtitle}
              </p>
            </div>
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t.indicesHub.createAnalysis}
            </Button>
          </div>

          {showCreateForm && (
            <Card>
              <CardHeader>
                <CardTitle>{t.indicesHub.createAnalysis}</CardTitle>
                <CardDescription>
                  {t.indicesHub.subtitle}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CreateIndexAnalysisForm onComplete={() => setShowCreateForm(false)} />
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="analyses" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="analyses">
                <Activity className="h-4 w-4 mr-2" />
                {t.indicesHub.myAnalyses}
              </TabsTrigger>
              <TabsTrigger value="archive">
                <TrendingDown className="h-4 w-4 mr-2" />
                {t.indicesHub.archive}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="analyses" className="space-y-4">
              <IndexAnalysesList
                status="active"
                onSelectContract={handleSelectTradeForMonitoring}
                onManageTrades={handleManageTrades}
              />
            </TabsContent>

            <TabsContent value="archive" className="space-y-4">
              <IndexAnalysesList
                status="closed"
                onSelectContract={handleSelectTradeForMonitoring}
                onManageTrades={handleManageTrades}
              />
            </TabsContent>
          </Tabs>

        </>
      )}

      {currentView === 'manage-trades' && selectedAnalysisId && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleBackToList}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back to Analyses
              </Button>
              <div>
                <h1 className="text-3xl font-bold">Manage Trades</h1>
                <p className="text-muted-foreground">
                  Add and monitor trades for this analysis
                </p>
              </div>
            </div>
            {!showAddTradeForm && (
              <Button onClick={() => setShowAddTradeForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Trade
              </Button>
            )}
          </div>

          {showAddTradeForm && (
            <Card>
              <CardHeader>
                <CardTitle>Add New Trade</CardTitle>
                <CardDescription>
                  Add a new contract/trade to this analysis with live tracking
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AddTradeForm
                  analysisId={selectedAnalysisId}
                  indexSymbol={selectedIndexSymbol}
                  onComplete={handleTradeAdded}
                  onCancel={() => setShowAddTradeForm(false)}
                />
              </CardContent>
            </Card>
          )}

          <TradesList
            analysisId={selectedAnalysisId}
            onSelectTrade={handleSelectTradeForMonitoring}
          />
        </>
      )}

      {currentView === 'monitor-trade' && selectedTradeId && (
        <TradeMonitor
          tradeId={selectedTradeId}
          onBack={handleBackToTrades}
        />
      )}
    </div>
  )
}
