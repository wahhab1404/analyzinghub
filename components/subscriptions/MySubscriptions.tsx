'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Calendar, ExternalLink, Copy, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

interface Subscription {
  id: string
  status: string
  start_at: string
  current_period_end: string
  cancel_at_period_end: boolean
  canceled_at: string | null
  inviteLink: string | null
  analyst: {
    id: string
    full_name: string
    avatar_url: string | null
  }
  analyzer_plans: {
    id: string
    name: string
    description: string | null
    price_cents: number
    billing_interval: string
    features: Record<string, any>
  }
}

export function MySubscriptions() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [canceling, setCanceling] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState<string | null>(null)

  useEffect(() => {
    loadSubscriptions()
  }, [])

  const loadSubscriptions = async () => {
    try {
      const response = await fetch('/api/subscriptions/me')

      if (response.ok) {
        const data = await response.json()
        setSubscriptions(data.subscriptions || [])
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Failed to load subscriptions:', response.status, errorData)
        toast.error(`Failed to load subscriptions: ${errorData.details || errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Failed to load subscriptions:', error)
      toast.error('Failed to load subscriptions. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async (subscriptionId: string, mode: 'end_of_period' | 'immediate') => {
    try {
      setCanceling(subscriptionId)

      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        toast.error('Please log in')
        return
      }

      const response = await fetch('/api/subscriptions/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ subscriptionId, mode }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Failed to cancel subscription')
        return
      }

      toast.success(data.message || 'Subscription canceled')
      await loadSubscriptions()
    } catch (error) {
      console.error('Cancel error:', error)
      toast.error('Failed to cancel subscription')
    } finally {
      setCanceling(null)
    }
  }

  const copyInviteLink = async (link: string, subId: string) => {
    try {
      await navigator.clipboard.writeText(link)
      setCopiedLink(subId)
      toast.success('Invite link copied!')
      setTimeout(() => setCopiedLink(null), 2000)
    } catch (error) {
      toast.error('Failed to copy link')
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-muted animate-pulse rounded-lg" />
        <div className="h-32 bg-muted animate-pulse rounded-lg" />
      </div>
    )
  }

  if (subscriptions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            You don't have any active subscriptions yet
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold">My Subscriptions</h3>
        <p className="text-muted-foreground">
          Manage your active subscriptions
        </p>
      </div>

      <div className="space-y-4">
        {subscriptions.map((sub) => {
          const periodEnd = new Date(sub.current_period_end)
          const isActive = sub.status === 'active'
          const willCancel = sub.cancel_at_period_end

          return (
            <Card key={sub.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <Link href={`/dashboard/profile/${sub.analyst.id}`}>
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={sub.analyst.avatar_url || undefined} />
                        <AvatarFallback>
                          {sub.analyst.full_name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </Link>
                    <div>
                      <CardTitle>{sub.analyzer_plans.name}</CardTitle>
                      <CardDescription>
                        by {sub.analyst.full_name}
                      </CardDescription>
                    </div>
                  </div>

                  <Badge
                    variant={
                      isActive && !willCancel
                        ? 'default'
                        : willCancel
                        ? 'secondary'
                        : 'outline'
                    }
                  >
                    {willCancel
                      ? 'Canceling'
                      : sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {willCancel ? 'Ends' : 'Renews'}{' '}
                    {formatDistanceToNow(periodEnd, { addSuffix: true })}
                  </span>
                </div>

                {sub.inviteLink && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => window.open(sub.inviteLink!, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Join Telegram Channel
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyInviteLink(sub.inviteLink!, sub.id)}
                    >
                      {copiedLink === sub.id ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                )}

                {isActive && !willCancel && (
                  <div className="flex gap-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={canceling === sub.id}
                        >
                          Cancel at Period End
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel Subscription?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Your subscription will remain active until{' '}
                            {periodEnd.toLocaleDateString()}. You won't be charged
                            again.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleCancel(sub.id, 'end_of_period')}
                          >
                            Cancel
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={canceling === sub.id}
                        >
                          Cancel Immediately
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Cancel Subscription Immediately?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Your subscription will end immediately and you'll lose
                            access to subscriber-only content.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleCancel(sub.id, 'immediate')}
                            className="bg-destructive text-destructive-foreground"
                          >
                            Cancel Now
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
