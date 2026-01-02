'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProfileSettings } from '@/components/settings/ProfileSettings'
import { SecuritySettings } from '@/components/settings/SecuritySettings'
import { NotificationSettings } from '@/components/settings/NotificationSettings'
import { TelegramSettings } from '@/components/settings/TelegramSettings'
import { ChannelSettings } from '@/components/settings/ChannelSettings'
import { PlanManagement } from '@/components/settings/PlanManagement'
import { AdminSettings } from '@/components/settings/AdminSettings'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    fetchUserData()
  }, [])

  const fetchUserData = async () => {
    try {
      const response = await fetch('/api/me')
      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login')
          return
        }
        throw new Error('Failed to fetch user data')
      }
      const data = await response.json()
      if (!data.user) {
        router.push('/login')
        return
      }
      setUser(data.user)
    } catch (error) {
      console.error('Error fetching user:', error)
      router.push('/login')
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  const isAnalyzer = user.role?.toLowerCase() === 'analyzer'
  const isAdmin = user.role?.toLowerCase() === 'admin'

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account settings and preferences
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <div className="w-full overflow-x-auto">
          <TabsList className="inline-flex w-full min-w-max md:w-full md:min-w-0 md:grid md:grid-cols-4 lg:grid-cols-6">
            <TabsTrigger value="profile" className="flex-shrink-0">Profile</TabsTrigger>
            <TabsTrigger value="security" className="flex-shrink-0">Security</TabsTrigger>
            <TabsTrigger value="notifications" className="flex-shrink-0">Notifications</TabsTrigger>
            <TabsTrigger value="telegram" className="flex-shrink-0">Telegram</TabsTrigger>
            {isAnalyzer && <TabsTrigger value="channel" className="flex-shrink-0">Channel</TabsTrigger>}
            {isAnalyzer && <TabsTrigger value="plans" className="flex-shrink-0">Plans</TabsTrigger>}
            {isAdmin && <TabsTrigger value="admin" className="flex-shrink-0">Admin</TabsTrigger>}
          </TabsList>
        </div>

        <TabsContent value="profile">
          <ProfileSettings user={user} onUpdate={fetchUserData} />
        </TabsContent>

        <TabsContent value="security">
          <SecuritySettings user={user} />
        </TabsContent>

        <TabsContent value="notifications">
          <NotificationSettings />
        </TabsContent>

        <TabsContent value="telegram">
          <TelegramSettings />
        </TabsContent>

        {isAnalyzer && (
          <TabsContent value="channel">
            <ChannelSettings />
          </TabsContent>
        )}

        {isAnalyzer && (
          <TabsContent value="plans">
            <PlanManagement />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="admin">
            <AdminSettings />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
