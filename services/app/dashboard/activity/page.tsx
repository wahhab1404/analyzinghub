'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Loader2,
  Heart,
  MessageCircle,
  Repeat2,
  UserPlus,
  FileText,
  Star,
  TrendingUp,
  Ban
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n/language-context'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  is_read: boolean
  created_at: string
  analysis_id: string | null
  actor_id: string | null
  comment_id: string | null
  analyses?: {
    id: string
    direction: string
    symbols: {
      symbol: string
    }
  } | null
  actor?: {
    id: string
    full_name: string
    avatar_url: string | null
  } | null
}

const notificationIcons: Record<string, any> = {
  new_follower: UserPlus,
  new_analysis: FileText,
  comment: MessageCircle,
  reply: MessageCircle,
  like: Heart,
  repost: Repeat2,
  new_rating: Star,
  target_hit: TrendingUp,
  stop_hit: Ban,
  follow: UserPlus
}

const notificationColors: Record<string, string> = {
  new_follower: 'text-blue-600',
  new_analysis: 'text-green-600',
  comment: 'text-purple-600',
  reply: 'text-purple-600',
  like: 'text-red-600',
  repost: 'text-cyan-600',
  new_rating: 'text-yellow-600',
  target_hit: 'text-green-600',
  stop_hit: 'text-red-600',
  follow: 'text-blue-600'
}

export default function ActivityPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [filteredNotifications, setFilteredNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('all')

  useEffect(() => {
    fetchNotifications()
  }, [])

  useEffect(() => {
    filterNotifications(activeFilter)
  }, [notifications, activeFilter])

  useEffect(() => {
    // Auto-mark notifications as read after they're loaded
    const markVisibleAsRead = async () => {
      const unreadIds = notifications
        .filter(n => !n.is_read)
        .map(n => n.id)

      if (unreadIds.length > 0) {
        try {
          await fetch('/api/notifications/mark-all-read', {
            method: 'PATCH',
          })
          // Update local state without refetching
          setNotifications(notifications.map(n => ({ ...n, is_read: true })))
        } catch (error) {
          console.error('Error auto-marking notifications as read:', error)
        }
      }
    }

    if (notifications.length > 0 && !loading) {
      // Small delay to ensure user sees them before marking as read
      const timer = setTimeout(markVisibleAsRead, 1000)
      return () => clearTimeout(timer)
    }
  }, [notifications.length, loading])

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/notifications')
      if (response.ok) {
        const data = await response.json()
        setNotifications(data.notifications || [])
      } else {
        if (response.status === 401) {
          router.push('/login')
        }
      }
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterNotifications = (filter: string) => {
    if (filter === 'all') {
      setFilteredNotifications(notifications)
    } else if (filter === 'unread') {
      setFilteredNotifications(notifications.filter(n => !n.is_read))
    } else if (filter === 'comment') {
      setFilteredNotifications(notifications.filter(n => n.type === 'comment' || n.type === 'reply'))
    } else {
      setFilteredNotifications(notifications.filter(n => n.type === filter))
    }
  }

  const markAsRead = async (id: string) => {
    try {
      const response = await fetch(`/api/notifications/${id}`, {
        method: 'PATCH',
      })

      if (response.ok) {
        setNotifications(notifications.map(n =>
          n.id === id ? { ...n, is_read: true } : n
        ))
        toast.success(t.dashboard.activity.toast.markedAsRead)
      }
    } catch (error) {
      console.error('Error marking notification as read:', error)
      toast.error(t.dashboard.activity.toast.failedToMark)
    }
  }

  const markAllAsRead = async () => {
    try {
      const response = await fetch('/api/notifications/mark-all-read', {
        method: 'PATCH',
      })

      if (response.ok) {
        setNotifications(notifications.map(n => ({ ...n, is_read: true })))
        toast.success(t.dashboard.activity.toast.allMarkedAsRead)
      }
    } catch (error) {
      console.error('Error marking all as read:', error)
      toast.error(t.dashboard.activity.toast.failedToMarkAll)
    }
  }

  const deleteNotification = async (id: string) => {
    try {
      const response = await fetch(`/api/notifications/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setNotifications(notifications.filter(n => n.id !== id))
        toast.success(t.dashboard.activity.toast.deleted)
      }
    } catch (error) {
      console.error('Error deleting notification:', error)
      toast.error(t.dashboard.activity.toast.failedToDelete)
    }
  }

  const getNotificationLink = (notification: Notification) => {
    if (notification.analysis_id) {
      return `/dashboard/analysis/${notification.analysis_id}`
    }
    if (notification.actor_id) {
      return `/dashboard/profile/${notification.actor_id}`
    }
    return null
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-muted-foreground">{t.dashboard.activity.loadingActivity}</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t.dashboard.activity.title}</h1>
          <p className="text-muted-foreground">{t.dashboard.activity.subtitle}</p>
        </div>
        {unreadCount > 0 && (
          <Button onClick={markAllAsRead} variant="outline">
            <CheckCheck className="h-4 w-4 mr-2" />
            {t.dashboard.activity.markAllRead}
          </Button>
        )}
      </div>

      <Tabs defaultValue="all" onValueChange={setActiveFilter}>
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="all">
            {t.dashboard.activity.tabs.all}
            {notifications.length > 0 && (
              <Badge variant="secondary" className="ml-2">{notifications.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="unread">
            {t.dashboard.activity.tabs.unread}
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2">{unreadCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="new_follower">
            <UserPlus className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger value="comment">
            <MessageCircle className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger value="like">
            <Heart className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger value="repost">
            <Repeat2 className="h-4 w-4" />
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeFilter} className="space-y-3 mt-6">
          {filteredNotifications.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Bell className="h-16 w-16 mx-auto text-muted-foreground opacity-50 mb-4" />
                <h3 className="text-lg font-semibold mb-2">{t.dashboard.activity.empty.noNotifications}</h3>
                <p className="text-muted-foreground">
                  {activeFilter === 'unread'
                    ? t.dashboard.activity.empty.allCaughtUp
                    : t.dashboard.activity.empty.noNotificationsYet}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredNotifications.map((notification) => {
              const Icon = notificationIcons[notification.type] || Bell
              const iconColor = notificationColors[notification.type] || 'text-gray-600'
              const link = getNotificationLink(notification)

              return (
                <Card
                  key={notification.id}
                  className={`transition-all hover:shadow-md ${
                    !notification.is_read ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900' : ''
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {notification.actor && (
                        <Link href={`/dashboard/profile/${notification.actor.id}`}>
                          <Avatar className="h-12 w-12 border-2 border-background">
                            <AvatarImage src={notification.actor.avatar_url || undefined} />
                            <AvatarFallback>
                              {notification.actor.full_name[0]?.toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </Link>
                      )}
                      {!notification.actor && (
                        <div className={`h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center ${iconColor}`}>
                          <Icon className="h-6 w-6" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className={`h-4 w-4 ${iconColor}`} />
                          <p className="font-semibold text-sm">{notification.title}</p>
                          {!notification.is_read && (
                            <div className="h-2 w-2 rounded-full bg-blue-500" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {notification.message}
                        </p>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(notification.created_at), {
                              addSuffix: true,
                            })}
                          </span>
                          {link && (
                            <Link
                              href={link}
                              className="text-xs text-primary hover:underline font-medium"
                            >
                              {t.dashboard.activity.actions.view}
                            </Link>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-1">
                        {!notification.is_read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => markAsRead(notification.id)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => deleteNotification(notification.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
