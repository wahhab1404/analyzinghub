'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Package, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n/language-context'

interface SubscriptionStatusBadgeProps {
  analyzerId: string
  analyzerName?: string
  isFollowing: boolean
  showButton?: boolean
  onSubscriptionChange?: () => void
}

export function SubscriptionStatusBadge({
  analyzerId,
  analyzerName,
  isFollowing,
  showButton = true,
  onSubscriptionChange,
}: SubscriptionStatusBadgeProps) {
  const { t } = useTranslation()
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hasPlans, setHasPlans] = useState(false)

  useEffect(() => {
    checkSubscriptionStatus()
    checkAvailablePlans()
  }, [analyzerId])

  const checkSubscriptionStatus = async () => {
    try {
      const response = await fetch(`/api/subscriptions/check?analystId=${analyzerId}`)

      if (response.ok) {
        const data = await response.json()
        setIsSubscribed(data.hasActiveSubscription)
      }
    } catch (error) {
      console.error('Failed to check subscription status:', error)
    } finally {
      setLoading(false)
    }
  }

  const checkAvailablePlans = async () => {
    try {
      const response = await fetch(`/api/plans?analystId=${analyzerId}`)
      if (response.ok) {
        const data = await response.json()
        setHasPlans(data.plans && data.plans.length > 0)
      }
    } catch (error) {
      console.error('Failed to check available plans:', error)
    }
  }

  const handleSubscribeClick = () => {
    const subscriptionSection = document.getElementById('subscription-plans')
    if (subscriptionSection) {
      subscriptionSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
      toast.info(t('subscriptions.chooseSubscriptionPlan'))
    } else {
      toast.info(t('subscriptions.visitProfileForPlans').replace('{name}', analyzerName || 'the analyzer'))
    }
  }

  if (loading || !hasPlans) {
    return null
  }

  if (isSubscribed) {
    return (
      <Badge
        variant="default"
        className="gap-1.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
      >
        <Check className="h-3 w-3" />
        {t('subscriptions.subscribed')}
      </Badge>
    )
  }

  if (isFollowing && showButton) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={handleSubscribeClick}
        className="gap-1.5 border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
      >
        <Package className="h-3 w-3" />
        {t('subscriptions.subscribe')}
      </Button>
    )
  }

  return null
}
