import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(req)

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { full_name, bio, avatar_url } = body

    if (!full_name || full_name.trim().length === 0) {
      return NextResponse.json({ error: 'Full name is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        full_name: full_name.trim(),
        bio: bio?.trim() || null,
        avatar_url: avatar_url || null,
      })
      .eq('id', user.id)
      .select()
      .maybeSingle()

    if (error) {
      console.error('UPDATE_PROFILE_ERROR:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ profile: data }, { status: 200 })
  } catch (err: any) {
    console.error('PROFILE_UPDATE_ERROR:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(req)

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const updates: any = {}

    if (body.feed_tab_preference !== undefined) {
      if (!['recommended', 'global', 'following'].includes(body.feed_tab_preference)) {
        return NextResponse.json({ error: 'Invalid feed tab preference' }, { status: 400 })
      }
      updates.feed_tab_preference = body.feed_tab_preference
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .maybeSingle()

    if (error) {
      console.error('PATCH_PROFILE_ERROR:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ profile: data }, { status: 200 })
  } catch (err: any) {
    console.error('PROFILE_PATCH_ERROR:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
