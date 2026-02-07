'use client'

import Image from 'next/image'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { LanguageSwitcher } from '@/components/ui/language-switcher'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RegisterPage() {
  const router = useRouter()

  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          window.location.href = '/dashboard'
        }
      })
      .catch(() => {})
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
      <div className="absolute top-4 end-4 flex gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="text-center mb-8 flex flex-col items-center">
          <Image
            src="/analyzer-logo.png"
            alt="AnalyzingHub Logo"
            width={280}
            height={93}
            className="mb-6 h-24 w-auto"
            priority
          />
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-50 mb-2">
            AnalyzingHub
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Join the Market Analysis Community
          </p>
        </div>
        <RegisterForm />
      </div>
    </div>
  )
}
