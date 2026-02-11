import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: channels, error } = await supabase
      .from('telegram_ad_channels')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ channels: channels || [] });
  } catch (error) {
    console.error('Error fetching ad channels:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch ad channels' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { channelId, channelName } = await request.json();

    if (!channelId || !channelName) {
      return NextResponse.json(
        { error: 'Channel ID and name are required' },
        { status: 400 }
      );
    }

    const { data: channel, error } = await supabase
      .from('telegram_ad_channels')
      .insert({
        user_id: user.id,
        channel_id: channelId,
        channel_name: channelName,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ channel });
  } catch (error) {
    console.error('Error creating ad channel:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create ad channel' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, channelName, isActive } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Channel ID is required' }, { status: 400 });
    }

    const updates: any = {};
    if (channelName !== undefined) updates.channel_name = channelName;
    if (isActive !== undefined) updates.is_active = isActive;

    const { data: channel, error } = await supabase
      .from('telegram_ad_channels')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ channel });
  } catch (error) {
    console.error('Error updating ad channel:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update ad channel' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Channel ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('telegram_ad_channels')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting ad channel:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete ad channel' },
      { status: 500 }
    );
  }
}
