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

    const { data: allTransactions } = await supabase
      .from('financial_transactions')
      .select('gross_amount_cents, platform_fee_cents, net_amount_cents, transaction_date')
      .eq('status', 'completed');

    const totalRevenue = allTransactions?.reduce((sum, txn) => sum + txn.gross_amount_cents, 0) || 0;
    const platformFees = allTransactions?.reduce((sum, txn) => sum + txn.platform_fee_cents, 0) || 0;
    const analystPayouts = allTransactions?.reduce((sum, txn) => sum + txn.net_amount_cents, 0) || 0;

    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthTransactions = allTransactions?.filter((txn: any) =>
      new Date(txn.transaction_date) >= firstOfMonth
    ) || [];

    const monthRevenue = monthTransactions.reduce((sum, txn) => sum + txn.gross_amount_cents, 0);
    const monthFees = monthTransactions.reduce((sum, txn) => sum + txn.platform_fee_cents, 0);

    const { data: pendingPayouts } = await supabase
      .from('payouts')
      .select('amount_cents')
      .in('status', ['pending', 'processing']);

    const totalPendingPayouts = pendingPayouts?.reduce((sum, p) => sum + p.amount_cents, 0) || 0;

    const { data: topAnalysts } = await supabase
      .from('analyst_earnings_summary')
      .select(`
        analyst_id,
        total_gross_cents,
        active_subscribers_count,
        profiles (
          id,
          full_name
        )
      `)
      .order('total_gross_cents', { ascending: false })
      .limit(5);

    const { data: topPlans } = await supabase
      .from('plan_performance_metrics')
      .select(`
        plan_id,
        total_revenue_cents,
        active_subscriptions,
        analyzer_plans (
          id,
          name
        )
      `)
      .order('total_revenue_cents', { ascending: false })
      .limit(5);

    return NextResponse.json({
      platform: {
        totalRevenue,
        platformFees,
        analystPayouts,
        pendingPayouts: totalPendingPayouts
      },
      thisMonth: {
        revenue: monthRevenue,
        platformFees: monthFees,
        growth: 0
      },
      topAnalysts: (topAnalysts || []).map((a: any) => ({
        analystId: a.analyst_id,
        name: a.profiles?.full_name,
        revenue: a.total_gross_cents,
        subscribers: a.active_subscribers_count
      })),
      topPlans: (topPlans || []).map((p: any) => ({
        planId: p.plan_id,
        name: p.analyzer_plans?.name,
        revenue: p.total_revenue_cents,
        subscribers: p.active_subscriptions
      }))
    });
  } catch (error: any) {
    console.error('Error fetching admin financial overview:', error);
    return NextResponse.json(
      { error: 'Failed to fetch overview' },
      { status: 500 }
    );
  }
}
