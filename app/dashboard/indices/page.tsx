'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, TrendingUp, TrendingDown, Activity } from 'lucide-react'
import { CreateIndexAnalysisForm } from '@/components/indices/CreateIndexAnalysisForm'
import { IndexAnalysesList } from '@/components/indices/IndexAnalysesList'
import { RealtimePriceMonitor } from '@/components/indices/RealtimePriceMonitor'

export default function IndicesHubPage() {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null)

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Indices Hub</h1>
          <p className="text-muted-foreground">
            Track and analyze indices with real-time options data
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Analysis
        </Button>
      </div>

      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Index Analysis</CardTitle>
            <CardDescription>
              Start tracking an index with real-time options data from Polygon
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateIndexAnalysisForm onComplete={() => setShowCreateForm(false)} />
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="analyses" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="analyses">
            <Activity className="h-4 w-4 mr-2" />
            My Analyses
          </TabsTrigger>
          <TabsTrigger value="monitor">
            <TrendingUp className="h-4 w-4 mr-2" />
            Live Monitor
          </TabsTrigger>
          <TabsTrigger value="archive">
            <TrendingDown className="h-4 w-4 mr-2" />
            Archive
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analyses" className="space-y-4">
          <IndexAnalysesList
            status="active"
            onSelectContract={setSelectedContractId}
          />
        </TabsContent>

        <TabsContent value="monitor" className="space-y-4">
          {selectedContractId ? (
            <RealtimePriceMonitor contractId={selectedContractId} />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  Select a contract from your analyses to monitor real-time prices
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="archive" className="space-y-4">
          <IndexAnalysesList
            status="closed"
            onSelectContract={setSelectedContractId}
          />
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>About Indices Hub</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Real-Time Data
              </h3>
              <p className="text-sm text-muted-foreground">
                Live options data from Polygon.io updates every second
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                Track Trades
              </h3>
              <p className="text-sm text-muted-foreground">
                Publish trades with entry/exit snapshots for full transparency
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-blue-500" />
                Performance
              </h3>
              <p className="text-sm text-muted-foreground">
                Automatic P&L calculation and performance tracking
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
