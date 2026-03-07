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

    if (!profile || (profile.roles as any)?.name !== 'Analyzer') {
      return NextResponse.json({ error: 'Only analysts can access earnings data' }, { status: 403 });
    }

    // Fetch all active plans for this analyst
    const { data: plans, error: plansError } = await supabase
      .from('analyzer_plans')
      .select('id, name, price_cents, billing_interval, description')
      .eq('analyst_id', user.id);

    if (plansError) throw plansError;

    const planIds = (plans || []).map((p: any) => p.id);

    if (planIds.length === 0) {
      return NextResponse.json({ plans: [] });
    }

    // Get active subscription counts per plan
    const { data: activeSubs } = await supabase
      .from('subscriptions')
      .select('plan_id')
      .eq('analyst_id', user.id)
      .eq('status', 'active')
      .in('plan_id', planIds);

    const activeSubsMap = new Map<string, number>();
    (activeSubs || []).forEach((s: any) => {
      activeSubsMap.set(s.plan_id, (activeSubsMap.get(s.plan_id) || 0) + 1);
    });

    // Get completed transactions grouped by plan
    const { data: transactions } = await supabase
      .from('financial_transactions')
      .select('plan_id, gross_amount_cents, platform_fee_cents, net_amount_cents')
      .eq('analyst_id', user.id)
      .eq('status', 'completed')
      .in('plan_id', planIds);

    // Aggregate revenue per plan
    const revenueMap = new Map<string, { gross: number; platformFee: number; net: number }>();
    (transactions || []).forEach((txn: any) => {
      const current = revenueMap.get(txn.plan_id) || { gross: 0, platformFee: 0, net: 0 };
      revenueMap.set(txn.plan_id, {
        gross: current.gross + txn.gross_amount_cents,
        platformFee: current.platformFee + txn.platform_fee_cents,
        net: current.net + txn.net_amount_cents,
      });
    });

    const result = (plans || []).map((plan: any) => {
      const revenue = revenueMap.get(plan.id) || { gross: 0, platformFee: 0, net: 0 };
      const activeSubscribers = activeSubsMap.get(plan.id) || 0;
      const averageRevenuePerUser = activeSubscribers > 0
        ? Math.round(revenue.gross / activeSubscribers)
        : plan.price_cents || 0;

      return {
        planId: plan.id,
        planName: plan.name,
        description: plan.description,
        priceCents: plan.price_cents,
        billingInterval: plan.billing_interval,
        activeSubscribers,
        totalRevenue: revenue.gross,
        platformFee: revenue.platformFee,
        netEarnings: revenue.net,
        averageRevenuePerUser,
      };
    });

    return NextResponse.json({ plans: result });
  } catch (error: any) {
    console.error('Error fetching earnings by plan:', error);
    return NextResponse.json(
      { error: 'Failed to fetch earnings by plan' },
      { status: 500 }
    );
  }
}
