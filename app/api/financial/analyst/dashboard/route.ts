import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role_id, roles(name)')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return NextResponse.json({ error: 'Failed to fetch user profile', details: profileError.message }, { status: 500 });
    }

    if (!profile || (profile.roles as any)?.name !== 'Analyzer') {
      return NextResponse.json({ error: 'Only analysts can access financial data' }, { status: 403 });
    }

    const { data: earnings, error: earningsError } = await supabase
      .from('analyst_earnings_summary')
      .select('*')
      .eq('analyst_id', user.id)
      .maybeSingle();

    if (earningsError) {
      console.error('Error fetching earnings:', earningsError);
    }

    const { data: activeSubscriptions, count: activeCount, error: activeSubError } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('analyst_id', user.id)
      .eq('status', 'active');

    if (activeSubError) {
      console.error('Error fetching active subscriptions:', activeSubError);
    }

    const { data: allSubscriptions, count: totalCount, error: totalSubError } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('analyst_id', user.id);

    if (totalSubError) {
      console.error('Error fetching all subscriptions:', totalSubError);
    }

    const response = {
      earnings: {
        allTime: {
          gross: earnings?.total_gross_cents || 0,
          platformFee: earnings?.total_platform_fee_cents || 0,
          net: earnings?.total_net_cents || 0
        },
        thisMonth: {
          gross: earnings?.month_gross_cents || 0,
          platformFee: earnings?.month_platform_fee_cents || 0,
          net: earnings?.month_net_cents || 0
        },
        thisYear: {
          gross: earnings?.year_gross_cents || 0,
          platformFee: earnings?.year_platform_fee_cents || 0,
          net: earnings?.year_net_cents || 0
        }
      },
      subscribers: {
        active: activeCount || 0,
        total: totalCount || 0,
        churned: (totalCount || 0) - (activeCount || 0)
      },
      payouts: {
        totalPaidOut: earnings?.total_paid_out_cents || 0,
        pending: earnings?.pending_payout_cents || 0,
        nextPayoutDate: null
      },
      currency: earnings?.currency || 'USD'
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error fetching analyst dashboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
