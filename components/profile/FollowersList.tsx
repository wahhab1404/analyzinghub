'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Users, UserPlus, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'

interface Follower {
  follower_id: string
  follower_name: string
  follower_avatar: string | null
  follower_role: string
  followed_at: string
}

interface Following {
  following_id: string
  following_name: string
  following_avatar: string | null
  following_role: string
  followed_at: string
}

interface FollowersListProps {
  profileId: string
  isOwnProfile: boolean
}

export function FollowersList({ profileId, isOwnProfile }: FollowersListProps) {
  const [followers, setFollowers] = useState<Follower[]>([])
  const [following, setFollowing] = useState<Following[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'followers' | 'following'>('followers')

  useEffect(() => {
    fetchData()
  }, [profileId])

  const fetchData = async () => {
    try {
      const [followersRes, followingRes] = await Promise.all([
        fetch(`/api/profiles/${profileId}/followers`),
        fetch(`/api/profiles/${profileId}/following`)
      ])

      if (followersRes.ok) {
        const data = await followersRes.json()
        setFollowers(data.followers || [])
      }

      if (followingRes.ok) {
        const data = await followingRes.json()
        setFollowing(data.following || [])
      }
    } catch (error) {
      console.error('Failed to fetch followers/following:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('followers')}
              className={`flex items-center gap-2 pb-2 border-b-2 transition-colors ${
                activeTab === 'followers'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Users className="h-4 w-4" />
              <span className="font-medium">Followers</span>
              <Badge variant="secondary">{followers.length}</Badge>
            </button>
            <button
              onClick={() => setActiveTab('following')}
              className={`flex items-center gap-2 pb-2 border-b-2 transition-colors ${
                activeTab === 'following'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <UserPlus className="h-4 w-4" />
              <span className="font-medium">Following</span>
              <Badge variant="secondary">{following.length}</Badge>
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {activeTab === 'followers' ? (
          <div className="space-y-3">
            {followers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-3" />
                <p className="text-muted-foreground">
                  {isOwnProfile ? "You don't have any followers yet" : "No followers yet"}
                </p>
              </div>
            ) : (
              followers.map((follower) => (
                <Link
                  key={follower.follower_id}
                  href={`/dashboard/profile/${follower.follower_id}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={follower.follower_avatar || undefined} />
                    <AvatarFallback>
                      {follower.follower_name[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{follower.follower_name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs">
                        {follower.follower_role}
                      </Badge>
                      <span>•</span>
                      <span>Followed {format(new Date(follower.followed_at), 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {following.length === 0 ? (
              <div className="text-center py-8">
                <UserPlus className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-3" />
                <p className="text-muted-foreground">
                  {isOwnProfile ? "You're not following anyone yet" : "Not following anyone yet"}
                </p>
              </div>
            ) : (
              following.map((followingUser) => (
                <Link
                  key={followingUser.following_id}
                  href={`/dashboard/profile/${followingUser.following_id}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={followingUser.following_avatar || undefined} />
                    <AvatarFallback>
                      {followingUser.following_name[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{followingUser.following_name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs">
                        {followingUser.following_role}
                      </Badge>
                      <span>•</span>
                      <span>Following since {format(new Date(followingUser.followed_at), 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
