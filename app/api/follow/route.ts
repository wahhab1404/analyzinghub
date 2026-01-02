import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/api-helpers'
import { EntitlementsService } from '@/services/entitlements/entitlements.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  console.log('FOLLOW route hit')
  try {
    const json = await req.json().catch(() => null)

    if (!json || !json.followingId) {
      return NextResponse.json({
        ok: false,
        error: 'followingId is required'
      }, { status: 400 })
    }

    const { followingId } = json

    const supabase = createRouteHandlerClient(req)

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({
        ok: false,
        error: 'Unauthorized'
      }, { status: 401 })
    }

    if (user.id === followingId) {
      return NextResponse.json({
        ok: false,
        error: 'Cannot follow yourself'
      }, { status: 400 })
    }

    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', followingId)
      .maybeSingle()

    if (!targetProfile) {
      return NextResponse.json({
        ok: false,
        error: 'User not found'
      }, { status: 404 })
    }

    const { data: existing } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', user.id)
      .eq('following_id', followingId)
      .maybeSingle()

    let following: boolean

    if (existing) {
      const { error: deleteError } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', followingId)

      if (deleteError) {
        console.error('UNFOLLOW_ERROR:', deleteError)
        return NextResponse.json({
          ok: false,
          error: deleteError.message
        }, { status: 400 })
      }
      following = false
    } else {
      // Check follow limit before inserting
      const entitlementCheck = await EntitlementsService.checkCanFollowAnalyzer(user.id)

      if (!entitlementCheck.allowed) {
        return NextResponse.json({
          ok: false,
          error: entitlementCheck.reason,
          limit: entitlementCheck.limit,
          current: entitlementCheck.current,
          upgradePackage: entitlementCheck.upgradePackage
        }, { status: 403 })
      }

      const { error: insertError } = await supabase
        .from('follows')
        .insert({
          follower_id: user.id,
          following_id: followingId,
        })

      if (insertError) {
        console.error('FOLLOW_INSERT_ERROR:', insertError)
        return NextResponse.json({
          ok: false,
          error: insertError.message
        }, { status: 400 })
      }
      following = true
    }

    return NextResponse.json({ ok: true, following }, { status: 200 })
  } catch (err: any) {
    console.error('FOLLOW_ERROR:', err?.message, err)
    return NextResponse.json({
      ok: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

