import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Search, TrendingUp, Building2, BarChart3, Activity } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

async function getPopularCompanies() {
  const supabase = await createClient()

  const { data: symbols } = await supabase
    .from('symbols')
    .select(`
      id,
      symbol,
      name,
      analyses:analyses(count)
    `)
    .order('symbol')
    .limit(50)

  return symbols || []
}

async function getRecentAnalyses() {
  const supabase = await createClient()

  const { data: analyses } = await supabase
    .from('analyses')
    .select(`
      id,
      created_at,
      direction,
      status,
      symbols:symbol_id (
        id,
        symbol,
        name
      ),
      profiles:analyzer_id (
        id,
        full_name,
        avatar_url
      )
    `)
    .eq('post_type', 'analysis')
    .order('created_at', { ascending: false })
    .limit(10)

  return analyses || []
}

export default async function CompaniesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const popularCompanies = await getPopularCompanies()
  const recentAnalyses = await getRecentAnalyses()

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Building2 className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Stocks</h1>
        </div>
        <p className="text-muted-foreground">
          Explore stocks, view analyses, and track options trades
        </p>
      </div>

      <div className="mb-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search stocks (e.g., AAPL, TSLA, MSFT)..."
            className="pl-10 h-12 text-lg"
          />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              Stock Analyses
            </CardTitle>
            <CardDescription>
              Browse all stock analyses
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/companies/analyses">
              <Button className="w-full">
                View All Analyses
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              Create Analysis
            </CardTitle>
            <CardDescription>
              Share your stock analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/create-analysis">
              <Button className="w-full" variant="default">
                Create New Analysis
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-purple-500" />
              My Analyses
            </CardTitle>
            <CardDescription>
              View your stock analyses
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`/dashboard/profile/${user.id}`}>
              <Button className="w-full" variant="outline">
                View My Profile
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Popular Stocks</CardTitle>
            <CardDescription>
              Most analyzed stocks on the platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {popularCompanies.slice(0, 15).map((company: any) => (
                <Link
                  key={company.id}
                  href={`/dashboard/symbol/${company.symbol}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-bold text-primary">
                        {company.symbol.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <div className="font-semibold">{company.symbol}</div>
                      <div className="text-sm text-muted-foreground">
                        {company.name}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {company.analyses?.[0]?.count || 0} analyses
                  </div>
                </Link>
              ))}
              {popularCompanies.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No stocks found
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Stock Analyses</CardTitle>
            <CardDescription>
              Latest analyses posted by analysts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentAnalyses.map((analysis: any) => (
                <Link
                  key={analysis.id}
                  href={`/dashboard/analysis/${analysis.id}`}
                  className="block p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">
                        {analysis.symbols?.symbol}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        analysis.direction === 'BULLISH'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : analysis.direction === 'BEARISH'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                      }`}>
                        {analysis.direction}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>by {analysis.profiles?.full_name}</span>
                    <span>•</span>
                    <span>{new Date(analysis.created_at).toLocaleDateString()}</span>
                  </div>
                </Link>
              ))}
              {recentAnalyses.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No recent analyses
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
