'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Upload, User } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/language-context'

interface ProfileSettingsProps {
  user: any
  onUpdate: () => void
}

export function ProfileSettings({ user, onUpdate }: ProfileSettingsProps) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [formData, setFormData] = useState({
    full_name: user.profile?.full_name || '',
    bio: user.profile?.bio || '',
    avatar_url: user.profile?.avatar_url || '',
  })
  const { toast } = useToast()

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: t.forms.validation.fileTypeInvalid,
        description: t.forms.validation.uploadJpgPngWebp,
        variant: 'destructive',
      })
      return
    }

    const maxSize = 2 * 1024 * 1024
    if (file.size > maxSize) {
      toast({
        title: t.forms.validation.fileTooLarge,
        description: t.forms.validation.maxFileSize,
        variant: 'destructive',
      })
      return
    }

    setIsUploadingAvatar(true)
    const formDataUpload = new FormData()
    formDataUpload.append('file', file)

    try {
      const response = await fetch('/api/upload-avatar', {
        method: 'POST',
        body: formDataUpload,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || t.forms.messages.failedToUpload)
      }

      const { url } = await response.json()
      setFormData({ ...formData, avatar_url: url })

      toast({
        title: t.forms.profile.avatarUploaded,
        description: t.forms.profile.avatarUploadedSuccess,
      })
    } catch (error: any) {
      toast({
        title: t.forms.messages.uploadFailed,
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || t.forms.messages.updateFailed)
      }

      toast({
        title: t.forms.profile.profileUpdated,
        description: t.forms.profile.profileUpdatedSuccess,
      })

      onUpdate()
    } catch (error: any) {
      toast({
        title: t.forms.messages.updateFailed,
        description: error.message,
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.forms.profile.profileInfo}</CardTitle>
        <CardDescription>
          {t.forms.profile.updateProfileInfo}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center space-x-6">
            <Avatar className="h-24 w-24">
              <AvatarImage src={formData.avatar_url} alt={formData.full_name} />
              <AvatarFallback>
                <User className="h-12 w-12" />
              </AvatarFallback>
            </Avatar>
            <div>
              <Label htmlFor="avatar-upload" className="cursor-pointer">
                <div className="flex items-center space-x-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors">
                  {isUploadingAvatar ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  <span className="text-sm font-medium">
                    {isUploadingAvatar ? t.forms.profile.uploadingAvatar : t.forms.profile.uploadAvatar}
                  </span>
                </div>
              </Label>
              <Input
                id="avatar-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
                disabled={isUploadingAvatar}
              />
              <p className="text-xs text-muted-foreground mt-2">
                {t.forms.profile.imageFormats}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="full_name">{t.forms.profile.fullName}</Label>
            <Input
              id="full_name"
              name="full_name"
              value={formData.full_name}
              onChange={handleInputChange}
              placeholder={t.forms.profile.enterFullName}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t.auth.email}</Label>
            <Input
              id="email"
              type="email"
              value={user.email}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              {t.forms.profile.emailCannotChange}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">{t.dashboard.admin.role}</Label>
            <Input
              id="role"
              value={user.role || user.profile?.role?.name || 'N/A'}
              disabled
              className="bg-muted"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">{t.profile.bio}</Label>
            <Textarea
              id="bio"
              name="bio"
              value={formData.bio}
              onChange={handleInputChange}
              placeholder={t.forms.profile.tellAboutYourself}
              rows={4}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">
              {t.forms.profile.charactersCount.replace('{count}', formData.bio.length.toString()).replace('{max}', '500')}
            </p>
          </div>

          <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t.forms.messages.saving}
              </>
            ) : (
              t.settings.saveChanges
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
