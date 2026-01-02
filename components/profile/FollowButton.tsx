'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useAnalytics } from '@/hooks/use-analytics'
import { useTranslation } from '@/lib/i18n/language-context'

interface FollowButtonProps {
  profileId: string
  initialIsFollowing: boolean
  onFollowChange?: () => void
}

export function FollowButton({ profileId, initialIsFollowing, onFollowChange }: FollowButtonProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing)
  const [isLoading, setIsLoading] = useState(false)
  const analytics = useAnalytics()

  const handleToggleFollow = async () => {
    setIsLoading(true)

    try {
      const res = await fetch('/api/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followingId: profileId }),
      })

      const text = await res.text()
      let data: any = null

      try {
        data = text ? JSON.parse(text) : null
      } catch (parseError) {
        console.error('Failed to parse response:', text)
        throw new Error(`Invalid response: ${text}`)
      }

      if (!res.ok) {
        const errorMessage = data?.error || `HTTP ${res.status}: ${text || '[empty]'}`
        throw new Error(errorMessage)
      }

      if (data?.following !== undefined) {
        setIsFollowing(data.following)

        if (data.following) {
          analytics.trackAnalyzerFollow(profileId)
        } else {
          analytics.trackAnalyzerUnfollow(profileId)
        }
      }

      if (onFollowChange) {
        onFollowChange()
      } else {
        router.refresh()
      }
    } catch (error: any) {
      console.error('Follow error:', error?.message || error)
      alert(error?.message || 'Failed to update follow status')
    } finally {
      setIsLoading(false)
    }
  }

  const [isHovered, setIsHovered] = useState(false)

  return (
    <Button
      onClick={handleToggleFollow}
      disabled={isLoading}
      size="sm"
      variant={isFollowing ? 'outline' : 'default'}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={isFollowing
        ? 'rounded-full hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors'
        : 'rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-colors'
      }
    >
      {isLoading ? t('followButton.loading') : isFollowing ? (isHovered ? t('followButton.unfollow') : t('followButton.following')) : t('followButton.follow')}
    </Button>
  )
}