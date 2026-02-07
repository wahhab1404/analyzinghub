import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role_id, roles(name)')
      .eq('id', user.id)
      .single();

    if (!profile || (profile.roles as any)?.name !== 'Admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const sortBy = searchParams.get('sortBy') || 'revenue';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    let orderColumn = 'total_gross_cents';
    if (sortBy === 'subscribers') orderColumn = 'active_subscribers_count';
    if (sortBy === 'name') orderColumn = 'analyst_id';

    const { data: analysts, error, count } = await supabase
      .from('analyst_earnings_summary')
      .select(`
        *,
        profiles (
          id,
          full_name,
          email
        )
      `, { count: 'exact' })
      .order(orderColumn, { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const analystIds = analysts?.map(a => a.analyst_id) || [];

    const { data: feeRules } = await supabase
      .from('platform_fee_rules')
      .select('analyst_id, fee_type, fee_value')
      .in('analyst_id', analystIds)
      .eq('is_active', true);

    const feeRuleMap = new Map();
    feeRules?.forEach(rule => {
      feeRuleMap.set(rule.analyst_id, {
        type: rule.fee_type,
        value: parseFloat(rule.fee_value)
      });
    });

    const formattedAnalysts = (analysts || []).map((analyst: any) => ({
      analystId: analyst.analyst_id,
      name: analyst.profiles?.full_name,
      email: analyst.profiles?.email,
      earnings: {
        total: analyst.total_gross_cents,
        platformFee: analyst.total_platform_fee_cents,
        net: analyst.total_net_cents
      },
      subscribers: {
        active: analyst.active_subscribers_count,
        total: analyst.total_subscribers_all_time
      },
      feeRule: feeRuleMap.get(analyst.analyst_id) || {
        type: 'percentage',
        value: 20.00
      },
      pendingPayout: analyst.pending_payout_cents
    }));

    return NextResponse.json({
      analysts: formattedAnalysts,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error: any) {
    console.error('Error fetching analysts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analysts' },
      { status: 500 }
    );
  }
}
