import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { telegram_username, user_id } = await request.json();

    if (!telegram_username || !user_id) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Clean username (remove @ if present)
    const cleanUsername = telegram_username.replace('@', '').toLowerCase().trim();

    if (!cleanUsername) {
      return NextResponse.json(
        { error: 'Invalid username' },
        { status: 400 }
      );
    }

    // Check if username is already being used by another verified link
    const { data: existingVerified } = await supabase
      .from('telegram_username_links')
      .select('user_id')
      .eq('telegram_username', cleanUsername)
      .eq('status', 'verified')
      .maybeSingle();

    if (existingVerified && existingVerified.user_id !== user_id) {
      return NextResponse.json(
        { error: 'This username is already linked to another account' },
        { status: 409 }
      );
    }

    // Check if user already has a linked Telegram account
    const { data: existingAccount } = await supabase
      .from('telegram_accounts')
      .select('id, username')
      .eq('user_id', user_id)
      .is('revoked_at', null)
      .maybeSingle();

    if (existingAccount) {
      return NextResponse.json(
        { error: 'Account already linked to Telegram', linked_username: existingAccount.username },
        { status: 409 }
      );
    }

    // Delete any existing pending links for this user
    await supabase
      .from('telegram_username_links')
      .delete()
      .eq('user_id', user_id)
      .eq('status', 'pending');

    // Create new username link request
    const { data: newLink, error: createError } = await supabase
      .from('telegram_username_links')
      .insert({
        user_id,
        telegram_username: cleanUsername,
        status: 'pending',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id, telegram_username, expires_at')
      .single();

    if (createError) {
      console.error('[Link Username] Error creating link:', createError);
      return NextResponse.json(
        { error: 'Failed to create username link' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      username: newLink.telegram_username,
      expires_at: newLink.expires_at,
      instructions: 'Open Telegram and send /start to @AnalyzingHubBot to complete the linking'
    });

  } catch (error) {
    console.error('[Link Username] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get('user_id');

    if (!user_id) {
      return NextResponse.json(
        { error: 'Missing user_id' },
        { status: 400 }
      );
    }

    // Get pending username link
    const { data: pendingLink } = await supabase
      .from('telegram_username_links')
      .select('telegram_username, status, expires_at, verified_at')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!pendingLink) {
      return NextResponse.json({ pending_link: null });
    }

    // Check if expired
    if (new Date(pendingLink.expires_at) < new Date() && pendingLink.status === 'pending') {
      await supabase
        .from('telegram_username_links')
        .update({ status: 'expired' })
        .eq('user_id', user_id)
        .eq('status', 'pending');

      return NextResponse.json({ pending_link: null, expired: true });
    }

    return NextResponse.json({
      pending_link: pendingLink.status === 'pending' ? pendingLink : null,
      verified: pendingLink.status === 'verified'
    });

  } catch (error) {
    console.error('[Link Username] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get('user_id');

    if (!user_id) {
      return NextResponse.json(
        { error: 'Missing user_id' },
        { status: 400 }
      );
    }

    // Cancel pending username link
    await supabase
      .from('telegram_username_links')
      .delete()
      .eq('user_id', user_id)
      .eq('status', 'pending');

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[Link Username] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
