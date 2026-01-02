'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  Search,
  TrendingUp,
  Users,
  Calendar,
  DollarSign,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  Receipt,
  MessageCircle,
  User
} from 'lucide-react'

interface Transaction {
  id: string
  type: string
  gross: number
  platformFee: number
  net: number
  status: string
  date: string
}

interface Subscriber {
  subscriptionId: string
  subscriberId: string
  name: string
  email: string
  avatarUrl?: string
  memberSince: string
  plan: {
    id: string
    name: string
    price: number
    interval: string
    description?: string
  }
  status: string
  startDate: string
  endDate?: string
  canceledAt?: string
  isExpired: boolean
  telegram: {
    connected: boolean
    chatId?: string
    username?: string
  }
  transactions: Transaction[]
  revenue: {
    total: number
    platformFee: number
    net: number
  }
  renewals: number
  lifetimeValue: number
}

export default function SubscribersManagement() {
  const [loading, setLoading] = useState(true)
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [filteredSubscribers, setFilteredSubscribers] = useState<Subscriber[]>([])
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSubscriber, setSelectedSubscriber] = useState<Subscriber | null>(null)

  useEffect(() => {
    fetchSubscribers()
  }, [])

  useEffect(() => {
    filterSubscribers()
  }, [subscribers, activeTab, searchQuery])

  const fetchSubscribers = async () => {
    try {
      const response = await fetch('/api/financial/analyst/subscribers?limit=100')
      if (response.ok) {
        const data = await response.json()
        setSubscribers(data.subscribers || [])
      }
    } catch (error) {
      console.error('Error fetching subscribers:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterSubscribers = () => {
    let filtered = subscribers

    if (activeTab === 'active') {
      filtered = filtered.filter(s => s.status === 'active' && !s.isExpired)
    } else if (activeTab === 'expired') {
      filtered = filtered.filter(s => s.isExpired || s.status === 'expired' || s.status === 'canceled')
    }

    if (searchQuery) {
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.telegram?.username?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    setFilteredSubscribers(filtered)
  }

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusBadge = (subscriber: Subscriber) => {
    if (subscriber.isExpired || subscriber.status === 'expired') {
      return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Expired</Badge>
    }
    if (subscriber.status === 'canceled') {
      return <Badge variant="secondary" className="gap-1"><AlertCircle className="h-3 w-3" />Canceled</Badge>
    }
    return <Badge variant="default" className="gap-1 bg-green-600"><CheckCircle2 className="h-3 w-3" />Active</Badge>
  }

  const getDaysRemaining = (endDate?: string) => {
    if (!endDate) return null
    const days = Math.ceil((new Date(endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    return days > 0 ? days : 0
  }

  const stats = {
    total: subscribers.length,
    active: subscribers.filter(s => s.status === 'active' && !s.isExpired).length,
    expired: subscribers.filter(s => s.isExpired || s.status === 'expired' || s.status === 'canceled').length
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading subscribers...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            Subscriber Management
          </h1>
          <p className="text-muted-foreground mt-2">
            Comprehensive overview of your subscriber base and revenue
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-blue-200 dark:border-blue-900 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Subscribers</CardTitle>
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-full">
              <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">All-time subscribers</p>
          </CardContent>
        </Card>

        <Card className="border-green-200 dark:border-green-900 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-full">
              <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">{stats.active}</div>
            <p className="text-xs text-muted-foreground mt-1">Currently subscribed</p>
          </CardContent>
        </Card>

        <Card className="border-orange-200 dark:border-orange-900 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expired/Canceled</CardTitle>
            <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-full">
              <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">{stats.expired}</div>
            <p className="text-xs text-muted-foreground mt-1">Past subscribers</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg">
        <CardHeader className="border-b bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-950/20 dark:to-gray-950/20">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Subscribers</CardTitle>
              <CardDescription className="mt-1">Detailed subscriber information and analytics</CardDescription>
            </div>
            <div className="relative w-72">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="all">All ({subscribers.length})</TabsTrigger>
              <TabsTrigger value="active" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
                Active ({stats.active})
              </TabsTrigger>
              <TabsTrigger value="expired" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white">
                Expired ({stats.expired})
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="space-y-4 mt-6">
              {filteredSubscribers.length === 0 ? (
                <div className="text-center py-16">
                  <div className="rounded-full bg-muted p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                    <Users className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">No Subscribers Found</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    {searchQuery ? 'No subscribers match your search criteria' : 'You don\'t have any subscribers yet'}
                  </p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {filteredSubscribers.map((subscriber) => {
                    const daysRemaining = getDaysRemaining(subscriber.endDate)
                    const isNearExpiry = daysRemaining !== null && daysRemaining > 0 && daysRemaining <= 7

                    return (
                      <Card
                        key={subscriber.subscriptionId}
                        className="group hover:shadow-md transition-all duration-200 cursor-pointer border-l-4"
                        style={{
                          borderLeftColor: subscriber.isExpired || subscriber.status === 'expired' ? '#f97316' :
                                          subscriber.status === 'canceled' ? '#64748b' : '#10b981'
                        }}
                        onClick={() => setSelectedSubscriber(subscriber)}
                      >
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between gap-6">
                            <div className="flex items-start gap-4 flex-1">
                              <Avatar className="h-14 w-14 border-2 border-background shadow-md">
                                <AvatarImage src={subscriber.avatarUrl} />
                                <AvatarFallback className="text-lg font-semibold">
                                  {getInitials(subscriber.name)}
                                </AvatarFallback>
                              </Avatar>

                              <div className="flex-1 space-y-3">
                                <div>
                                  <div className="flex items-center gap-3 mb-1">
                                    <h3 className="font-bold text-lg">{subscriber.name}</h3>
                                    {getStatusBadge(subscriber)}
                                    {isNearExpiry && (
                                      <Badge variant="outline" className="gap-1 border-orange-600 text-orange-600">
                                        <Clock className="h-3 w-3" />
                                        {daysRemaining}d left
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground">{subscriber.email}</p>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Receipt className="h-3 w-3" />
                                      Plan
                                    </p>
                                    <p className="font-semibold text-sm">{subscriber.plan.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatCurrency(subscriber.plan.price)}/{subscriber.plan.interval}
                                    </p>
                                  </div>

                                  <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      Start Date
                                    </p>
                                    <p className="font-semibold text-sm">{formatDate(subscriber.startDate)}</p>
                                    <p className="text-xs text-muted-foreground">
                                      Member: {formatDate(subscriber.memberSince)}
                                    </p>
                                  </div>

                                  <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {subscriber.canceledAt ? 'Canceled' : 'Renewal Date'}
                                    </p>
                                    <p className="font-semibold text-sm">
                                      {subscriber.canceledAt
                                        ? formatDate(subscriber.canceledAt)
                                        : subscriber.endDate
                                          ? formatDate(subscriber.endDate)
                                          : 'N/A'
                                      }
                                    </p>
                                    {!subscriber.canceledAt && daysRemaining !== null && daysRemaining > 0 && (
                                      <p className="text-xs text-muted-foreground">
                                        {daysRemaining} days remaining
                                      </p>
                                    )}
                                  </div>

                                  <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Send className="h-3 w-3" />
                                      Telegram
                                    </p>
                                    {subscriber.telegram.connected ? (
                                      <>
                                        <p className="font-semibold text-sm flex items-center gap-1">
                                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                                          Connected
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          @{subscriber.telegram.username || 'N/A'}
                                        </p>
                                      </>
                                    ) : (
                                      <>
                                        <p className="font-semibold text-sm flex items-center gap-1">
                                          <XCircle className="h-3 w-3 text-orange-600" />
                                          Not Connected
                                        </p>
                                        <p className="text-xs text-muted-foreground">No account linked</p>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="text-right space-y-2">
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Total Revenue</p>
                                <p className="text-2xl font-bold text-green-600 dark:text-green-500">
                                  {formatCurrency(subscriber.revenue.net)}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2 group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                              >
                                View Details
                                <ArrowRight className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={!!selectedSubscriber} onOpenChange={(open) => !open && setSelectedSubscriber(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start gap-4">
              <Avatar className="h-16 w-16 border-2 border-background shadow-md">
                <AvatarImage src={selectedSubscriber?.avatarUrl} />
                <AvatarFallback className="text-xl font-semibold">
                  {selectedSubscriber && getInitials(selectedSubscriber.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <DialogTitle className="text-2xl">{selectedSubscriber?.name}</DialogTitle>
                  {selectedSubscriber && getStatusBadge(selectedSubscriber)}
                </div>
                <DialogDescription className="text-base">
                  {selectedSubscriber?.email}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedSubscriber && (
            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Subscriber Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Member Since</span>
                      <span className="font-semibold">{formatDate(selectedSubscriber.memberSince)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subscriber ID</span>
                      <span className="font-mono text-xs">{selectedSubscriber.subscriberId.slice(0, 8)}...</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Telegram</span>
                      <span className="font-semibold">
                        {selectedSubscriber.telegram.connected
                          ? `@${selectedSubscriber.telegram.username}`
                          : 'Not Connected'}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Receipt className="h-4 w-4" />
                      Subscription Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Plan</span>
                      <span className="font-semibold">{selectedSubscriber.plan.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Price</span>
                      <span className="font-semibold">
                        {formatCurrency(selectedSubscriber.plan.price)}/{selectedSubscriber.plan.interval}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Started</span>
                      <span className="font-semibold">{formatDate(selectedSubscriber.startDate)}</span>
                    </div>
                    {selectedSubscriber.endDate && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {selectedSubscriber.canceledAt ? 'Ends' : 'Renews'}
                        </span>
                        <span className="font-semibold">{formatDate(selectedSubscriber.endDate)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Revenue Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-6">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Lifetime Value</p>
                      <p className="text-2xl font-bold">{formatCurrency(selectedSubscriber.lifetimeValue)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Net Revenue</p>
                      <p className="text-2xl font-bold text-green-600">
                        {formatCurrency(selectedSubscriber.revenue.net)}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Renewals</p>
                      <p className="text-2xl font-bold">{selectedSubscriber.renewals}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Receipt className="h-5 w-5" />
                    Transaction History
                  </CardTitle>
                  <CardDescription>
                    {selectedSubscriber.transactions.length} completed transaction(s)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedSubscriber.transactions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Receipt className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No transactions recorded yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedSubscriber.transactions.map((txn, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold capitalize">
                                {txn.type.replace(/_/g, ' ')}
                              </p>
                              <Badge variant="outline" className="text-xs border-green-600 text-green-600">
                                {txn.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {formatDateTime(txn.date)}
                            </p>
                          </div>
                          <div className="text-right space-y-1">
                            <p className="font-bold text-lg text-green-600">
                              +{formatCurrency(txn.net)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              from {formatCurrency(txn.gross)} (fee: {formatCurrency(txn.platformFee)})
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
