'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Users, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useTranslation } from '@/lib/i18n/language-context'

interface Plan {
  id: string
  name: string
  description: string | null
  price_cents: number
  billing_interval: 'month' | 'year'
  features: Record<string, any>
  telegram_channel_id: string | null
  subscriberCount: number
  max_subscribers: number | null
}

interface SubscriptionPlansProps {
  analystId: string
  analystName: string
}

export function SubscriptionPlans({ analystId, analystName }: SubscriptionPlansProps) {
  const { t } = useTranslation()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [currentSubscriptions, setCurrentSubscriptions] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadPlans()
    checkSubscriptions()
  }, [analystId])

  const loadPlans = async () => {
    try {
      const response = await fetch(`/api/plans?analystId=${analystId}`)
      if (response.ok) {
        const data = await response.json()
        setPlans(data.plans || [])
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Failed to load plans:', response.status, errorData)
        toast.error(`${t.subscriptions.failedToLoadPlans}: ${errorData.details || errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Failed to load plans:', error)
      toast.error(`${t.subscriptions.failedToLoadPlans}. ${t.subscriptions.tryAgain}`)
    } finally {
      setLoading(false)
    }
  }

  const checkSubscriptions = async () => {
    try {
      const response = await fetch('/api/subscriptions/me')

      if (response.ok) {
        const data = await response.json()
        const activePlanIds = new Set<string>(
          data.subscriptions
            .filter((sub: any) => sub.status === 'active' && sub.analyst_id === analystId)
            .map((sub: any) => sub.plan_id as string)
        )
        setCurrentSubscriptions(activePlanIds)
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('Failed to check subscriptions:', response.status, errorData)
      }
    } catch (error) {
      console.error('Failed to check subscriptions:', error)
    }
  }

  const handleSubscribe = async (planId: string) => {
    try {
      setSubscribing(planId)

      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        toast.error(t.subscriptions.loginToSubscribe)
        return
      }

      const response = await fetch('/api/subscriptions/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ planId }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || t.subscriptions.failedToSubscribe)
        return
      }

      toast.success(t.subscriptions.subscriptionActivated)

      if (data.inviteLink) {
        toast.info(t.subscriptions.telegramInviteAvailable)
      }

      await checkSubscriptions()
      await loadPlans()
    } catch (error) {
      console.error('Subscription error:', error)
      toast.error(t.subscriptions.failedToSubscribe)
    } finally {
      setSubscribing(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-48 bg-muted animate-pulse rounded-lg" />
        <div className="h-48 bg-muted animate-pulse rounded-lg" />
      </div>
    )
  }

  if (plans.length === 0) {
    return null
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold">{t.subscriptions.subscriptionPlans}</h3>
        <p className="text-muted-foreground">
          {t.subscriptions.subscribeToGet.replace('{name}', analystName)}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {plans.map((plan) => {
          const isSubscribed = currentSubscriptions.has(plan.id)
          const isFull =
            plan.max_subscribers !== null &&
            plan.subscriberCount >= plan.max_subscribers

          return (
            <Card key={plan.id} className={isSubscribed ? 'border-primary' : ''}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl">{plan.name}</CardTitle>
                    <CardDescription className="mt-2">
                      {plan.description}
                    </CardDescription>
                  </div>
                  {isSubscribed && (
                    <Badge variant="default">{t.subscriptions.active}</Badge>
                  )}
                </div>

                <div className="mt-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold">
                      ${(plan.price_cents / 100).toFixed(2)}
                    </span>
                    <span className="text-muted-foreground">
                      / {plan.billing_interval}
                    </span>
                  </div>
                  {plan.price_cents === 0 && (
                    <Badge variant="secondary" className="mt-2">
                      {t.subscriptions.freeTesting}
                    </Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {plan.features && typeof plan.features === 'object' && (
                  <ul className="space-y-2">
                    {Object.entries(plan.features).map(([key, value]) => (
                      <li key={key} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm">
                          {typeof value === 'string' ? value : key}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {plan.telegram_channel_id && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-primary" />
                    <span>{t.subscriptions.includesTelegramAccess}</span>
                  </div>
                )}

                <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2">
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    <span>
                      {plan.subscriberCount}
                      {plan.max_subscribers && ` / ${plan.max_subscribers}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {t.subscriptions.daysCount.replace('{count}', plan.billing_interval === 'month' ? '30' : '365')}
                    </span>
                  </div>
                </div>

                <Button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={isSubscribed || subscribing === plan.id || isFull}
                  className="w-full"
                >
                  {subscribing === plan.id
                    ? t.subscriptions.subscribing
                    : isSubscribed
                    ? t.subscriptions.subscribed
                    : isFull
                    ? t.subscriptions.planFull
                    : t.subscriptions.subscribeNow}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
