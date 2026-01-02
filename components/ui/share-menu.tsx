'use client'

import { useState } from 'react'
import { Share2, Copy, Check, Facebook, Twitter, Send, MessageCircle, Download, Image as ImageIcon } from 'lucide-react'
import { Button } from './button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu'
import { toast } from 'sonner'

interface ShareMenuProps {
  url: string
  title: string
  description?: string
  onDownloadImage?: () => void
  onDownloadSnapshot?: () => void
}

export function ShareMenu({ url, title, description, onDownloadImage, onDownloadSnapshot }: ShareMenuProps) {
  const [copied, setCopied] = useState(false)

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}${url}` : url
  const encodedUrl = encodeURIComponent(shareUrl)
  const encodedTitle = encodeURIComponent(title)
  const encodedDescription = description ? encodeURIComponent(description) : ''

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      toast.success('Link copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast.error('Failed to copy link')
    }
  }

  const handleShare = (platform: string) => {
    let shareLink = ''

    switch (platform) {
      case 'whatsapp':
        shareLink = `https://wa.me/?text=${encodedTitle}%0A${encodedUrl}`
        break
      case 'telegram':
        shareLink = `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`
        break
      case 'twitter':
        shareLink = `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`
        break
      case 'facebook':
        shareLink = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
        break
      case 'linkedin':
        shareLink = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
        break
    }

    if (shareLink) {
      window.open(shareLink, '_blank', 'width=600,height=400,noopener,noreferrer')
    }
  }

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: description,
          url: shareUrl,
        })
      } catch (error) {
        console.error('Error sharing:', error)
      }
    }
  }

  const hasNativeShare = typeof navigator !== 'undefined' && navigator.share

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <Share2 className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {hasNativeShare && (
          <>
            <DropdownMenuItem onClick={handleNativeShare} className="cursor-pointer">
              <Share2 className="h-4 w-4 mr-2" />
              Share via...
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuItem onClick={() => handleShare('whatsapp')} className="cursor-pointer">
          <MessageCircle className="h-4 w-4 mr-2 text-green-600" />
          WhatsApp
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => handleShare('telegram')} className="cursor-pointer">
          <Send className="h-4 w-4 mr-2 text-blue-500" />
          Telegram
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => handleShare('twitter')} className="cursor-pointer">
          <Twitter className="h-4 w-4 mr-2 text-sky-500" />
          X (Twitter)
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => handleShare('facebook')} className="cursor-pointer">
          <Facebook className="h-4 w-4 mr-2 text-blue-600" />
          Facebook
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer">
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-2 text-green-600" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-2" />
              Copy Link
            </>
          )}
        </DropdownMenuItem>

        {(onDownloadImage || onDownloadSnapshot) && <DropdownMenuSeparator />}

        {onDownloadImage && (
          <DropdownMenuItem onClick={onDownloadImage} className="cursor-pointer">
            <Download className="h-4 w-4 mr-2" />
            Download Chart
          </DropdownMenuItem>
        )}

        {onDownloadSnapshot && (
          <DropdownMenuItem onClick={onDownloadSnapshot} className="cursor-pointer">
            <ImageIcon className="h-4 w-4 mr-2" />
            Download Snapshot
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
