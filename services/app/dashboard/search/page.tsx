'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Loader2, Filter } from 'lucide-react'
import { AnalysisCard } from '@/components/analysis/AnalysisCard'

export default function SearchPage() {
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(searchParams?.get('q') || '')
  const [analyzer, setAnalyzer] = useState('')
  const [symbol, setSymbol] = useState('')
  const [status, setStatus] = useState('all')
  const [analyses, setAnalyses] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  useEffect(() => {
    const initialQuery = searchParams?.get('q')
    if (initialQuery) {
      performSearch()
    }
  }, [])

  const performSearch = async () => {
    setIsLoading(true)
    setHasSearched(true)
    try {
      const params = new URLSearchParams()
      if (query) params.append('q', query)
      if (analyzer) params.append('analyzer', analyzer)
      if (symbol) params.append('symbol', symbol)
      if (status && status !== 'all') params.append('status', status)

      const response = await fetch(`/api/search?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setAnalyses(data.analyses || [])
      }
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    performSearch()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Search Analyses</h1>
        <p className="text-muted-foreground mt-1">
          Search by symbol, analyzer, or analysis content
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="Search analyses..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full"
            />
          </div>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Filter by symbol (e.g., AAPL)"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Filter by analyzer name"
              value={analyzer}
              onChange={(e) => setAnalyzer(e.target.value)}
            />
          </div>
          <div className="w-[180px]">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="target_hit">Target Hit</SelectItem>
                <SelectItem value="stop_hit">Stop Hit</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </form>

      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !hasSearched ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-semibold mb-2">Start Searching</h3>
            <p className="text-muted-foreground max-w-md">
              Enter a search term or use filters to find analyses by symbol, analyzer, or content
            </p>
          </div>
        ) : analyses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Filter className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No Results Found</h3>
            <p className="text-muted-foreground max-w-md">
              Try adjusting your search terms or filters to find what you're looking for
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Found {analyses.length} {analyses.length === 1 ? 'result' : 'results'}
            </p>
            <div className="space-y-4">
              {analyses.map((analysis) => (
                <AnalysisCard
                  key={analysis.id}
                  analysis={analysis}
                  onFollowChange={performSearch}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
