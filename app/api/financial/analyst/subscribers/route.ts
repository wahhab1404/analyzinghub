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
      return NextResponse.json({ error: 'Only analysts can access subscriber data' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || 'all';
    const sortBy = searchParams.get('sortBy') || 'startDate';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    let query = supabase
      .from('subscriptions')
      .select(`
        id,
        subscriber_id,
        plan_id,
        status,
        start_at,
        current_period_end,
        canceled_at,
        profiles!subscriptions_subscriber_id_fkey (
          id,
          full_name,
          email,
          avatar_url,
          created_at
        ),
        analyzer_plans!subscriptions_plan_id_fkey (
          id,
          name,
          price_cents,
          billing_interval,
          description
        )
      `, { count: 'exact' })
      .eq('analyst_id', user.id);

    if (status === 'active') {
      query = query.eq('status', 'active');
    } else if (status === 'canceled') {
      query = query.in('status', ['canceled', 'expired']);
    } else if (status === 'expired') {
      query = query.eq('status', 'expired');
    }

    switch (sortBy) {
      case 'name':
        query = query.order('subscriber_id');
        break;
      default:
        query = query.order('start_at', { ascending: false });
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) throw error;

    const subscriberIds = (data || []).map((item: any) => item.subscriber_id);

    const { data: telegramData } = await supabase
      .from('telegram_accounts')
      .select('user_id, chat_id, username')
      .in('user_id', subscriberIds);

    const telegramMap = new Map(
      (telegramData || []).map((t: any) => [t.user_id, { chatId: t.chat_id, username: t.username }])
    );

    const { data: transactionData } = await supabase
      .from('financial_transactions')
      .select('subscription_id, gross_amount_cents, net_amount_cents, platform_fee_cents, status, transaction_date, transaction_type')
      .in('subscription_id', (data || []).map((item: any) => item.id))
      .eq('status', 'completed')
      .order('transaction_date', { ascending: false });

    const transactionMap = new Map<string, any[]>();
    (transactionData || []).forEach((txn: any) => {
      if (!transactionMap.has(txn.subscription_id)) {
        transactionMap.set(txn.subscription_id, []);
      }
      transactionMap.get(txn.subscription_id)!.push(txn);
    });

    const subscribers = (data || []).map((item: any) => {
      const profile = item.profiles;
      const plan = item.analyzer_plans;
      const priceCents = plan?.price_cents || 0;
      const telegram = telegramMap.get(item.subscriber_id);
      const transactions = transactionMap.get(item.id) || [];

      const totalRevenue = transactions.reduce((sum, t) => sum + (t.net_amount_cents || 0), 0);
      const isExpired = item.status === 'expired' || (item.current_period_end && new Date(item.current_period_end) < new Date());

      return {
        subscriptionId: item.id,
        subscriberId: profile?.id || item.subscriber_id,
        name: profile?.full_name || 'Unknown User',
        email: profile?.email || 'N/A',
        avatarUrl: profile?.avatar_url,
        memberSince: profile?.created_at,
        plan: {
          id: plan?.id || item.plan_id,
          name: plan?.name || 'Unknown Plan',
          price: priceCents,
          interval: plan?.billing_interval || 'month',
          description: plan?.description
        },
        status: item.status,
        startDate: item.start_at,
        endDate: item.current_period_end,
        canceledAt: item.canceled_at,
        isExpired,
        telegram: telegram ? {
          connected: true,
          chatId: telegram.chatId,
          username: telegram.username
        } : {
          connected: false
        },
        transactions: transactions.map((t: any) => ({
          id: t.id,
          type: t.transaction_type,
          gross: t.gross_amount_cents,
          platformFee: t.platform_fee_cents,
          net: t.net_amount_cents,
          status: t.status,
          date: t.transaction_date
        })),
        revenue: {
          total: totalRevenue || priceCents,
          platformFee: Math.floor((totalRevenue || priceCents) * 0.15),
          net: Math.floor((totalRevenue || priceCents) * 0.85)
        },
        renewals: transactions.filter(t => t.transaction_type === 'subscription_renewal').length,
        lifetimeValue: totalRevenue || priceCents
      };
    });

    return NextResponse.json({
      subscribers,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error: any) {
    console.error('Error fetching subscribers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscribers' },
      { status: 500 }
    );
  }
}
