'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Send } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface TelegramUsernameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (username: string) => void
  isSubmitting?: boolean
}

export function TelegramUsernameDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false
}: TelegramUsernameDialogProps) {
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedUsername = username.trim().replace('@', '')

    if (!trimmedUsername) {
      setError('Please enter your Telegram username')
      return
    }

    if (trimmedUsername.length < 5) {
      setError('Telegram username must be at least 5 characters')
      return
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      setError('Telegram username can only contain letters, numbers, and underscores')
      return
    }

    setError('')
    onSubmit(trimmedUsername)
  }

  const handleUsernameChange = (value: string) => {
    setUsername(value)
    setError('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-blue-500" />
              Telegram Username Required
            </DialogTitle>
            <DialogDescription>
              To receive your private channel invite link, we need your Telegram username.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                The bot will send you a direct message with the channel invite link. Make sure your Telegram privacy settings allow messages from our bot.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="telegram-username">
                Telegram Username
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  @
                </span>
                <Input
                  id="telegram-username"
                  placeholder="username"
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  className="pl-7"
                  disabled={isSubmitting}
                  autoFocus
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Enter your Telegram username without the @ symbol. You can find this in Telegram Settings → Edit Profile.
              </p>
            </div>

            <div className="rounded-lg bg-muted p-3 space-y-2">
              <p className="text-sm font-medium">How it works:</p>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Enter your Telegram username</li>
                <li>Complete your subscription</li>
                <li>Receive channel invite via Telegram bot</li>
                <li>Click the link to join the private channel</li>
              </ol>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !username.trim()}>
              {isSubmitting ? 'Processing...' : 'Continue to Subscribe'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
