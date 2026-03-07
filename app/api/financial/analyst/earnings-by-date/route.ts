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

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || 'month'; // day | week | month | year
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let query = supabase
      .from('financial_transactions')
      .select('transaction_date, gross_amount_cents, platform_fee_cents, net_amount_cents, subscriber_id, transaction_type')
      .eq('analyst_id', user.id)
      .eq('status', 'completed')
      .order('transaction_date', { ascending: true });

    if (startDate) {
      query = query.gte('transaction_date', startDate);
    }
    if (endDate) {
      query = query.lte('transaction_date', endDate);
    }

    const { data: transactions, error } = await query;
    if (error) throw error;

    // Group transactions by period
    const grouped = new Map<string, {
      gross: number;
      platformFee: number;
      net: number;
      newSubscribers: Set<string>;
    }>();

    (transactions || []).forEach((txn: any) => {
      const date = new Date(txn.transaction_date);
      let key: string;

      switch (period) {
        case 'day':
          key = date.toISOString().slice(0, 10); // YYYY-MM-DD
          break;
        case 'week': {
          // ISO week: get Monday of the week
          const day = date.getDay();
          const diff = date.getDate() - day + (day === 0 ? -6 : 1);
          const monday = new Date(date);
          monday.setDate(diff);
          key = monday.toISOString().slice(0, 10);
          break;
        }
        case 'year':
          key = String(date.getFullYear());
          break;
        case 'month':
        default:
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
      }

      const current = grouped.get(key) || { gross: 0, platformFee: 0, net: 0, newSubscribers: new Set() };
      current.gross += txn.gross_amount_cents;
      current.platformFee += txn.platform_fee_cents;
      current.net += txn.net_amount_cents;
      if (txn.transaction_type === 'subscription_payment') {
        current.newSubscribers.add(txn.subscriber_id);
      }
      grouped.set(key, current);
    });

    const data = Array.from(grouped.entries()).map(([date, values]) => ({
      date,
      gross: values.gross,
      platformFee: values.platformFee,
      net: values.net,
      newSubscribers: values.newSubscribers.size,
    }));

    return NextResponse.json({ data, period });
  } catch (error: any) {
    console.error('Error fetching earnings by date:', error);
    return NextResponse.json(
      { error: 'Failed to fetch earnings by date' },
      { status: 500 }
    );
  }
}
