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
  const logoSrc = currentTheme === 'dark' ? '/chatgpt_image_dec_28,_2025,_02_14_09_pm_(1).png' : '/new_project_(6).png'

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
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Image
            src={logoSrc}
            alt="AnalyzingHub Logo"
            width={80}
            height={80}
            className="animate-pulse"
          />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">AnalyzingHub</h1>
          <div className="flex gap-2">
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      <Header user={user} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar userRole={user.role} userId={user.id} />
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900">
          <div className="container mx-auto p-4 sm:p-6 pb-20 sm:pb-24">
            {children}
          </div>
          <footer className="border-t bg-white dark:bg-slate-950 mt-auto">
            <div className="container mx-auto px-4 sm:px-6 py-4">
              <p className="text-xs text-center text-muted-foreground leading-relaxed">
                <strong>Disclaimer:</strong> All analyses and market predictions on this platform are for educational purposes only.
                This is not financial advice. Trading and investing involve substantial risk of loss.
                Always conduct your own research and consult with a qualified financial advisor before making investment decisions.
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
