import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: trade, error } = await supabase
      .from('contract_trades')
      .select('*')
      .eq('id', params.id)
      .eq('author_id', user.id)
      .single()

    if (error) throw error

    return NextResponse.json({ trade })
  } catch (error) {
    console.error('Error fetching trade:', error)
    return NextResponse.json(
      { error: 'Failed to fetch trade' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const updates: any = {}

    if (body.status) {
      updates.status = body.status
      if (body.status !== 'ACTIVE') {
        updates.close_time = new Date().toISOString()
      }
    }

    if (body.close_reason) {
      updates.close_reason = body.close_reason
    }

    if (body.max_price_since_entry !== undefined) {
      updates.max_price_since_entry = body.max_price_since_entry
    }

    if (body.notes !== undefined) {
      updates.notes = body.notes
    }

    updates.updated_at = new Date().toISOString()

    const { data: trade, error } = await supabase
      .from('contract_trades')
      .update(updates)
      .eq('id', params.id)
      .eq('author_id', user.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ trade })
  } catch (error) {
    console.error('Error updating trade:', error)
    return NextResponse.json(
      { error: 'Failed to update trade' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('contract_trades')
      .delete()
      .eq('id', params.id)
      .eq('author_id', user.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting trade:', error)
    return NextResponse.json(
      { error: 'Failed to delete trade' },
      { status: 500 }
    )
  }
}
