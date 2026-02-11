'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Filter, TrendingUp, TrendingDown, ArrowRight, Calendar, User } from 'lucide-react'
import Link from 'next/link'
import { AnalysisCard } from '@/components/analysis/AnalysisCard'
import { Badge } from '@/components/ui/badge'

export default function CompanyAnalysesPage() {
  const router = useRouter()
  const [analyses, setAnalyses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [directionFilter, setDirectionFilter] = useState<string>('all')

  useEffect(() => {
    loadAnalyses()
  }, [])

  async function loadAnalyses() {
    setLoading(true)
    try {
      const response = await fetch('/api/analyses?type=global')
      if (response.ok) {
        const data = await response.json()
        const stockAnalyses = (data.analyses || []).filter((a: any) =>
          a.post_type === 'analysis' && !a.is_index_analysis
        )
        setAnalyses(stockAnalyses)
      } else if (response.status === 401) {
        router.push('/login')
      }
    } catch (error) {
      console.error('Failed to load analyses:', error)
    }
    setLoading(false)
  }

  const filteredAnalyses = analyses.filter(analysis => {
    if (statusFilter !== 'all' && analysis.status !== statusFilter) return false
    if (directionFilter !== 'all' && analysis.direction !== directionFilter) return false

    if (!searchQuery) return true
    const search = searchQuery.toLowerCase()
    return (
      analysis.symbols?.symbol?.toLowerCase().includes(search) ||
      analysis.symbols?.name?.toLowerCase().includes(search) ||
      analysis.profiles?.full_name?.toLowerCase().includes(search)
    )
  })

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Stock Analyses</h1>
        <p className="text-muted-foreground">
          Browse and explore stock analyses from analysts
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium mb-2 block">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Symbol or analyst..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="TARGET_HIT">Target Hit</SelectItem>
                  <SelectItem value="STOP_LOSS_HIT">Stop Loss Hit</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Direction</label>
              <Select value={directionFilter} onValueChange={setDirectionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All directions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Directions</SelectItem>
                  <SelectItem value="BULLISH">Bullish</SelectItem>
                  <SelectItem value="BEARISH">Bearish</SelectItem>
                  <SelectItem value="NEUTRAL">Neutral</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
            <p className="mt-4 text-muted-foreground">Loading analyses...</p>
          </div>
        ) : filteredAnalyses.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <p className="text-muted-foreground">No stock analyses found</p>
              <Link href="/dashboard/create-analysis">
                <Button className="mt-4">Create Your First Analysis</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          filteredAnalyses.map((analysis) => (
            <AnalysisCard key={analysis.id} analysis={analysis} />
          ))
        )}
      </div>

      {!loading && filteredAnalyses.length > 0 && (
        <div className="mt-6 text-center text-sm text-muted-foreground">
          Showing {filteredAnalyses.length} stock {filteredAnalyses.length === 1 ? 'analysis' : 'analyses'}
        </div>
      )}
    </div>
  )
}
