'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreateAnalysisForm } from '@/components/analysis/CreateAnalysisForm'

export default function CreateAnalysisPage() {
  const router = useRouter()
  const [canCreate, setCanCreate] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(data => {
        if (!data.user) {
          router.push('/login')
          return
        }
        if (data.user.role !== 'Analyzer') {
          router.push('/dashboard')
          return
        }
        setCanCreate(true)
      })
      .catch(() => {
        router.push('/login')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!canCreate) {
    return null
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <CreateAnalysisForm />
    </div>
  )
}
