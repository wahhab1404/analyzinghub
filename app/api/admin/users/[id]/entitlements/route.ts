import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/api-helpers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createRouteHandlerClient(request);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin/super_admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role_id, roles(name)')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'super_admin'].includes((profile.roles as any)?.name)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { package_key, status, expires_at, notes } = body;

    if (!package_key) {
      return NextResponse.json(
        { error: 'package_key is required' },
        { status: 400 }
      );
    }

    const targetUserId = id;

    // Get existing entitlement
    const { data: existingEntitlement } = await supabase
      .from('user_entitlements')
      .select('package_key')
      .eq('user_id', targetUserId)
      .maybeSingle();

    // Determine action
    let action = 'assign';
    if (existingEntitlement) {
      if (status === 'suspended') {
        action = 'suspend';
      } else if (existingEntitlement.package_key !== package_key) {
        action = 'upgrade'; // Or downgrade, can be determined by package hierarchy
      }
    }

    // Upsert entitlement
    const { error: upsertError } = await supabase
      .from('user_entitlements')
      .upsert({
        user_id: targetUserId,
        package_key,
        status: status || 'active',
        expires_at: expires_at || null,
        assigned_by: user.id,
        assign_reason: notes,
        updated_at: new Date().toISOString(),
      });

    if (upsertError) {
      console.error('Error upserting entitlement:', upsertError);
      return NextResponse.json(
        { error: 'Failed to assign entitlement' },
        { status: 500 }
      );
    }

    // Insert audit record
    await supabase.from('user_entitlement_audit').insert({
      user_id: targetUserId,
      old_package_key: existingEntitlement?.package_key || null,
      new_package_key: package_key,
      action,
      performed_by: user.id,
      notes,
    });

    // Refresh cache
    await supabase.rpc('refresh_user_limits_cache', {
      p_user_id: targetUserId,
    });

    return NextResponse.json({
      success: true,
      message: 'Entitlement assigned successfully',
    });
  } catch (error) {
    console.error('Error assigning entitlement:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createRouteHandlerClient(request);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin/super_admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role_id, roles(name)')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'super_admin'].includes((profile.roles as any)?.name)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const targetUserId = id;

    // Get entitlement
    const { data: entitlement, error } = await supabase
      .from('user_entitlements')
      .select('*')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching entitlement:', error);
      return NextResponse.json(
        { error: 'Failed to fetch entitlement' },
        { status: 500 }
      );
    }

    // Get audit history
    const { data: auditHistory } = await supabase
      .from('user_entitlement_audit')
      .select('*')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      entitlement: entitlement || null,
      auditHistory: auditHistory || [],
    });
  } catch (error) {
    console.error('Error fetching entitlement:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
