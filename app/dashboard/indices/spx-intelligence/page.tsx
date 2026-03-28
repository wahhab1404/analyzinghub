/**
 * app/dashboard/indices/spx-intelligence/page.tsx
 *
 * Phase 2 — SPX Options Intelligence Engine page.
 * Server component wrapper that gates access to authenticated users
 * with Analyzer or SuperAdmin roles.
 */

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { SPXIntelligenceHub } from '@/components/spx/SPXIntelligenceHub'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'SPX Intelligence | AnalyzingHub',
  description: 'Real-time SPX options intelligence engine with wall detection, shock analysis, and signal scoring.',
}

export default async function SPXIntelligencePage() {
  const cookieStore = cookies()
  const supabase = createClient(cookieStore)

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login?next=/dashboard/indices/spx-intelligence')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role_id, roles!inner(name)')
    .eq('id', user.id)
    .single()

  const roleName = (profile as any)?.roles?.name
  if (!roleName || !['SuperAdmin', 'Analyzer'].includes(roleName)) {
    redirect('/dashboard')
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#080d17]">
      <SPXIntelligenceHub className="flex-1" />
    </div>
  )
}
