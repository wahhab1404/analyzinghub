'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Header } from '@/components/dashboard/Header'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { TutorialOverlay } from '@/components/tutorial/TutorialOverlay'
import { SessionUser } from '@/lib/auth/types'
import { useTheme } from 'next-themes'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { theme, resolvedTheme } = useTheme()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [showTutorial, setShowTutorial] = useState(false)

  const currentTheme = resolvedTheme || theme
  const logoSrc = '/analyzer-logo.png'

  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) {
          router.push('/login')
        } else {
          setUser(d.user)
          if (d.user.tutorial_completed === false) {
            setTimeout(() => setShowTutorial(true), 500)
          }
        }
      })
      .catch(() => {
        router.push('/login')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [router])

  const handleTutorialComplete = async () => {
    setShowTutorial(false)
    try {
      await fetch('/api/profile/tutorial-complete', {
        method: 'POST',
      })
      if (user) {
        setUser({ ...user, tutorial_completed: true })
      }
    } catch (error) {
      console.error('Failed to update tutorial status:', error)
    }
  }

  const handleTutorialSkip = async () => {
    setShowTutorial(false)
    try {
      await fetch('/api/profile/tutorial-complete', {
        method: 'POST',
      })
      if (user) {
        setUser({ ...user, tutorial_completed: true })
      }
    } catch (error) {
      console.error('Failed to update tutorial status:', error)
    }
  }

  if (loading || !user) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Image
            src={logoSrc}
            alt="AnalyzingHub Logo"
            width={160}
            height={160}
            className="opacity-90"
          />
          <div className="flex items-center gap-2 mt-2">
            <div className="h-1 w-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="h-1 w-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="h-1 w-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <p className="text-xs text-muted-foreground tracking-widest uppercase mt-1">Loading terminal…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden w-full">
      <Header user={user} />
      <div className="flex flex-1 overflow-hidden w-full">
        <Sidebar userRole={user.role} userId={user.id} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-background w-full min-w-0">
          <div className="p-4 sm:p-6 pb-16 max-w-full">
            {children}
          </div>
          <footer className="border-t border-border bg-card mt-auto">
            <div className="px-4 sm:px-6 py-3 max-w-full">
              <p className="text-[10px] text-center text-muted-foreground leading-relaxed">
                <span className="font-bold text-muted-foreground">DISCLAIMER:</span> All analyses and market predictions are for educational purposes only and do not constitute financial advice.
                Trading and investing involve substantial risk of loss. Always conduct your own research and consult a qualified financial advisor.
              </p>
            </div>
          </footer>
        </main>
      </div>
      {showTutorial && (
        <TutorialOverlay
          onComplete={handleTutorialComplete}
          onSkip={handleTutorialSkip}
        />
      )}
    </div>
  )
}
