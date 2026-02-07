import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const supabase = createServerClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*, role:roles!inner(name)')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || (profile.role as any)?.name !== 'SuperAdmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, created_at, is_active, role:roles(name)')
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ users })
  } catch (error) {
    console.error('Admin users error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*, role:roles!inner(name)')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || (profile.role as any)?.name !== 'SuperAdmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { email, full_name, password, role } = body

    if (!email || !full_name || !password || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const validRoles = ['SuperAdmin', 'Analyzer', 'Trader']
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existingUser) {
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 400 })
    }

    const { data: roleData } = await supabase
      .from('roles')
      .select('id')
      .eq('name', role)
      .maybeSingle()

    if (!roleData) {
      return NextResponse.json({ error: 'Role not found' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY is not configured')
      return NextResponse.json({
        error: 'Server configuration error: Service role key not found'
      }, { status: 500 })
    }

    console.log('Creating user with service role key...')
    console.log('Supabase URL:', supabaseUrl)
    console.log('Service key exists:', !!supabaseServiceKey)
    console.log('Service key length:', supabaseServiceKey.length)

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        role,
      }
    })

    if (authError) {
      console.error('Auth create user error:', authError)
      console.error('Error details:', JSON.stringify(authError, null, 2))
      return NextResponse.json({
        error: `Failed to create user: ${authError.message}. Please check your SUPABASE_SERVICE_ROLE_KEY in .env file.`
      }, { status: 500 })
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
    }

    await new Promise(resolve => setTimeout(resolve, 500))

    const { data: createdProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, role:roles(name)')
      .eq('id', authData.user.id)
      .maybeSingle()

    return NextResponse.json({
      user: createdProfile || {
        id: authData.user.id,
        email: authData.user.email,
        full_name,
        role: { name: role }
      }
    }, { status: 201 })
  } catch (error) {
    console.error('Admin create user error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
