'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DollarSign, TrendingUp, Users, CreditCard, ArrowUpRight, ArrowDownRight, Calendar, BarChart2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLanguage } from '@/lib/i18n/language-context'

interface EarningsData {
  earnings: {
    allTime: { gross: number; platformFee: number; net: number }
    thisMonth: { gross: number; platformFee: number; net: number }
    thisYear: { gross: number; platformFee: number; net: number }
  }
  subscribers: {
    active: number
    total: number
    churned: number
  }
  payouts: {
    totalPaidOut: number
    pending: number
    nextPayoutDate: string | null
  }
  currency: string
}

interface Transaction {
  id: string
  date: string
  type: string
  subscriber: { id: string; name: string }
  plan: { id: string; name: string }
  gross: number
  platformFee: number
  net: number
  status: string
}

interface PlanEarnings {
  planId: string
  planName: string
  description?: string
  priceCents: number
  billingInterval: string
  activeSubscribers: number
  totalRevenue: number
  platformFee: number
  netEarnings: number
  averageRevenuePerUser: number
}

interface DateEarnings {
  date: string
  gross: number
  platformFee: number
  net: number
  newSubscribers: number
}

export default function FinancialDashboard() {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [earningsData, setEarningsData] = useState<EarningsData | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [planEarnings, setPlanEarnings] = useState<PlanEarnings[]>([])
  const [dateEarnings, setDateEarnings] = useState<DateEarnings[]>([])
  const [datePeriod, setDatePeriod] = useState<'day' | 'week' | 'month' | 'year'>('month')
  const [loadingPlanEarnings, setLoadingPlanEarnings] = useState(false)
  const [loadingDateEarnings, setLoadingDateEarnings] = useState(false)

  useEffect(() => {
    fetchDashboardData()
    fetchTransactions()
    fetchPlanEarnings()
  }, [])

  useEffect(() => {
    fetchDateEarnings()
  }, [datePeriod])

  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/financial/analyst/dashboard')
      if (response.ok) {
        const data = await response.json()
        setEarningsData(data)
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchTransactions = async () => {
    try {
      const response = await fetch('/api/financial/analyst/transactions?limit=10')
      if (response.ok) {
        const data = await response.json()
        setTransactions(data.transactions || [])
      }
    } catch (error) {
      console.error('Error fetching transactions:', error)
    }
  }

  const fetchPlanEarnings = async () => {
    setLoadingPlanEarnings(true)
    try {
      const response = await fetch('/api/financial/analyst/earnings-by-plan')
      if (response.ok) {
        const data = await response.json()
        setPlanEarnings(data.plans || [])
      }
    } catch (error) {
      console.error('Error fetching plan earnings:', error)
    } finally {
      setLoadingPlanEarnings(false)
    }
  }

  const fetchDateEarnings = async () => {
    setLoadingDateEarnings(true)
    try {
      const response = await fetch(`/api/financial/analyst/earnings-by-date?period=${datePeriod}`)
      if (response.ok) {
        const data = await response.json()
        setDateEarnings(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching date earnings:', error)
    } finally {
      setLoadingDateEarnings(false)
    }
  }

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-6 w-96" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (!earningsData) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Failed to Load Financial Data</CardTitle>
            <CardDescription>
              Unable to retrieve your financial information. Please refresh the page or contact support if the issue persists.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const calculateGrowth = (current: number, previous: number) => {
    if (previous === 0) return 0
    return ((current - previous) / previous) * 100
  }

  const monthGrowth = calculateGrowth(
    earningsData.earnings.thisMonth.net,
    earningsData.earnings.allTime.net - earningsData.earnings.thisMonth.net
  )

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
            {t.financialDashboard.title}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t.financialDashboard.subtitle}
          </p>
        </div>
        <Badge variant="outline" className="text-sm py-2 px-4">
          <Calendar className="h-4 w-4 mr-2" />
          {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-green-200 dark:border-green-900 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t.financialDashboard.totalEarnings}</CardTitle>
            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-full">
              <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(earningsData.earnings.allTime.net)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {t.financialDashboard.fromGross.replace('{amount}', formatCurrency(earningsData.earnings.allTime.gross))}
            </p>
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <span>{t.financialDashboard.platformFee}</span>
              <span className="font-medium">
                {formatCurrency(earningsData.earnings.allTime.platformFee)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 dark:border-blue-900 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t.financialDashboard.thisMonth}</CardTitle>
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-full">
              <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(earningsData.earnings.thisMonth.net)}
            </div>
            {monthGrowth !== 0 && (
              <div className="flex items-center gap-1 mt-2">
                {monthGrowth > 0 ? (
                  <ArrowUpRight className="h-4 w-4 text-green-600" />
                ) : (
                  <ArrowDownRight className="h-4 w-4 text-red-600" />
                )}
                <span className={`text-sm font-medium ${monthGrowth > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {Math.abs(monthGrowth).toFixed(1)}%
                </span>
                <span className="text-xs text-muted-foreground">vs previous</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              {t.financialDashboard.fromGrossAmount.replace('{amount}', formatCurrency(earningsData.earnings.thisMonth.gross))}
            </p>
          </CardContent>
        </Card>

        <Card className="border-purple-200 dark:border-purple-900 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t.financialDashboard.subscribers}</CardTitle>
            <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-full">
              <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
              {earningsData.subscribers.active}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {t.financialDashboard.activeSubscribers}
            </p>
            <div className="flex items-center justify-between mt-2 text-xs">
              <span className="text-muted-foreground">
                {t.financialDashboard.totalSubscribers.replace('{count}', earningsData.subscribers.total.toString())}
              </span>
              {earningsData.subscribers.churned > 0 && (
                <span className="text-orange-600">
                  {t.financialDashboard.churned}: {earningsData.subscribers.churned}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200 dark:border-orange-900 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t.financialDashboard.pendingPayout}</CardTitle>
            <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-full">
              <CreditCard className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
              {formatCurrency(earningsData.payouts.pending)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {t.financialDashboard.awaitingNextPayout}
            </p>
            <div className="mt-2 text-xs text-muted-foreground">
              {t.financialDashboard.totalPaid.replace('{amount}', formatCurrency(earningsData.payouts.totalPaidOut))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="overview">{t.financialDashboard.overview}</TabsTrigger>
          <TabsTrigger value="transactions">{t.financialDashboard.transactions}</TabsTrigger>
          <TabsTrigger value="by-plan">By Plan</TabsTrigger>
          <TabsTrigger value="by-date">By Date</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="shadow-sm">
              <CardHeader className="border-b bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20">
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-600" />
                  All-Time Earnings
                </CardTitle>
                <CardDescription>Complete revenue breakdown since launch</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Gross Revenue</span>
                    <span className="font-semibold text-lg">
                      {formatCurrency(earningsData.earnings.allTime.gross)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Platform Fee</span>
                    <span className="font-semibold text-lg text-orange-600 dark:text-orange-500">
                      -{formatCurrency(earningsData.earnings.allTime.platformFee)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-t-2 pt-4 mt-2">
                    <span className="font-semibold">Net Earnings</span>
                    <span className="font-bold text-2xl text-green-600 dark:text-green-500">
                      {formatCurrency(earningsData.earnings.allTime.net)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  This Year
                </CardTitle>
                <CardDescription>Current year performance ({new Date().getFullYear()})</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Gross Revenue</span>
                    <span className="font-semibold text-lg">
                      {formatCurrency(earningsData.earnings.thisYear.gross)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Platform Fee</span>
                    <span className="font-semibold text-lg text-orange-600 dark:text-orange-500">
                      -{formatCurrency(earningsData.earnings.thisYear.platformFee)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-t-2 pt-4 mt-2">
                    <span className="font-semibold">Net Earnings</span>
                    <span className="font-bold text-2xl text-blue-600 dark:text-blue-500">
                      {formatCurrency(earningsData.earnings.thisYear.net)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm">
            <CardHeader className="border-b bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-purple-600" />
                Subscriber Overview
              </CardTitle>
              <CardDescription>Your subscriber base analytics</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Active Subscribers</p>
                  <p className="text-3xl font-bold text-purple-600 dark:text-purple-500">
                    {earningsData.subscribers.active}
                  </p>
                  <p className="text-xs text-muted-foreground">Currently subscribed</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Total Subscribers</p>
                  <p className="text-3xl font-bold">
                    {earningsData.subscribers.total}
                  </p>
                  <p className="text-xs text-muted-foreground">All-time total</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Churned</p>
                  <p className="text-3xl font-bold text-orange-600 dark:text-orange-500">
                    {earningsData.subscribers.churned}
                  </p>
                  <p className="text-xs text-muted-foreground">Left or expired</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="border-b bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-950/20 dark:to-gray-950/20">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Recent Transactions
              </CardTitle>
              <CardDescription>Your latest financial transactions and payments</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <CreditCard className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">No Transactions Yet</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Your transaction history will appear here once you start receiving payments from subscribers.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {transactions.map((txn) => (
                    <div
                      key={txn.id}
                      className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
                          <DollarSign className="h-5 w-5 text-green-600 dark:text-green-500" />
                        </div>
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{txn.subscriber.name}</span>
                            <Badge variant="secondary" className="text-xs capitalize">
                              {txn.type.replace(/_/g, ' ')}
                            </Badge>
                            {txn.status === 'completed' && (
                              <Badge variant="outline" className="text-xs border-green-600 text-green-600">
                                Completed
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{txn.plan.name}</span>
                            <span>•</span>
                            <span>{new Date(txn.date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <div className="font-bold text-lg text-green-600 dark:text-green-500">
                          +{formatCurrency(txn.net)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          from {formatCurrency(txn.gross)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-plan" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="border-b bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/20 dark:to-blue-950/20">
              <CardTitle className="flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-indigo-600" />
                Earnings by Plan
              </CardTitle>
              <CardDescription>Revenue breakdown across your subscription plans</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {loadingPlanEarnings ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : planEarnings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <BarChart2 className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">No Plans Yet</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Create subscription plans to start tracking earnings per plan.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {planEarnings.map((plan) => (
                    <div key={plan.planId} className="p-4 rounded-lg border bg-card">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-base">{plan.planName}</h4>
                          <p className="text-xs text-muted-foreground capitalize">
                            {formatCurrency(plan.priceCents)} / {plan.billingInterval}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-purple-600 border-purple-300">
                          <Users className="h-3 w-3 mr-1" />
                          {plan.activeSubscribers} active
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-4 pt-3 border-t">
                        <div>
                          <p className="text-xs text-muted-foreground">Total Revenue</p>
                          <p className="font-semibold text-sm">{formatCurrency(plan.totalRevenue)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Platform Fee</p>
                          <p className="font-semibold text-sm text-orange-600">-{formatCurrency(plan.platformFee)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Net Earnings</p>
                          <p className="font-semibold text-sm text-green-600">{formatCurrency(plan.netEarnings)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-date" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="border-b bg-gradient-to-r from-teal-50 to-green-50 dark:from-teal-950/20 dark:to-green-950/20">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-teal-600" />
                    Earnings Over Time
                  </CardTitle>
                  <CardDescription>Revenue trends grouped by time period</CardDescription>
                </div>
                <Select value={datePeriod} onValueChange={(v) => setDatePeriod(v as any)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Daily</SelectItem>
                    <SelectItem value="week">Weekly</SelectItem>
                    <SelectItem value="month">Monthly</SelectItem>
                    <SelectItem value="year">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {loadingDateEarnings ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : dateEarnings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <TrendingUp className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">No Earnings Data</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Earnings data will appear here once you start receiving payments.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {dateEarnings.slice().reverse().map((entry) => (
                    <div key={entry.date} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/20">
                          <Calendar className="h-4 w-4 text-teal-600" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{entry.date}</p>
                          {entry.newSubscribers > 0 && (
                            <p className="text-xs text-muted-foreground">
                              +{entry.newSubscribers} new subscriber{entry.newSubscribers > 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600 dark:text-green-500">{formatCurrency(entry.net)}</p>
                        <p className="text-xs text-muted-foreground">from {formatCurrency(entry.gross)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
