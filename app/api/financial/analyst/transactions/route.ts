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
      return NextResponse.json({ error: 'Only analysts can access transaction history' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const type = searchParams.get('type');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    let query = supabase
      .from('financial_transactions')
      .select(`
        *,
        subscriber:subscriber_id (
          id,
          full_name
        ),
        plan:plan_id (
          id,
          name
        )
      `, { count: 'exact' })
      .eq('analyst_id', user.id)
      .order('transaction_date', { ascending: false });

    if (startDate) {
      query = query.gte('transaction_date', startDate);
    }
    if (endDate) {
      query = query.lte('transaction_date', endDate);
    }
    if (type) {
      query = query.eq('transaction_type', type);
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching transactions:', error);
      throw error;
    }

    const transactions = (data || []).map((txn: any) => ({
      id: txn.id,
      date: txn.transaction_date,
      type: txn.transaction_type,
      subscriber: {
        id: txn.subscriber?.id,
        name: txn.subscriber?.full_name
      },
      plan: {
        id: txn.plan?.id,
        name: txn.plan?.name
      },
      gross: txn.gross_amount_cents,
      platformFee: txn.platform_fee_cents,
      net: txn.net_amount_cents,
      status: txn.status
    }));

    const { data: summary } = await supabase
      .from('financial_transactions')
      .select('gross_amount_cents, platform_fee_cents, net_amount_cents')
      .eq('analyst_id', user.id)
      .eq('status', 'completed');

    const summaryData = {
      totalGross: summary?.reduce((sum, txn) => sum + txn.gross_amount_cents, 0) || 0,
      totalPlatformFee: summary?.reduce((sum, txn) => sum + txn.platform_fee_cents, 0) || 0,
      totalNet: summary?.reduce((sum, txn) => sum + txn.net_amount_cents, 0) || 0
    };

    return NextResponse.json({
      transactions,
      summary: summaryData,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error: any) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}
