'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AdminSettings } from '@/components/settings/AdminSettings'

export default function SystemSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>System Settings</CardTitle>
        <CardDescription>Configure platform settings and preferences</CardDescription>
      </CardHeader>
      <CardContent>
        <AdminSettings />
      </CardContent>
    </Card>
  )
}
