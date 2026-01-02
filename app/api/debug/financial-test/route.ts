import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    const debugInfo: any = {
      step: 'initial',
      user: user ? { id: user.id, email: user.email } : null,
      userError: userError?.message
    };

    if (userError || !user) {
      return NextResponse.json({
        success: false,
        debug: debugInfo,
        error: 'No authenticated user'
      });
    }

    debugInfo.step = 'fetching profile';

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role_id, roles(name)')
      .eq('id', user.id)
      .single();

    debugInfo.profile = profile;
    debugInfo.profileError = profileError;

    if (profileError) {
      return NextResponse.json({
        success: false,
        debug: debugInfo,
        error: 'Profile fetch failed',
        details: profileError
      });
    }

    debugInfo.step = 'checking earnings';

    const { data: earnings, error: earningsError } = await supabase
      .from('analyst_earnings_summary')
      .select('*')
      .eq('analyst_id', user.id)
      .maybeSingle();

    debugInfo.earnings = earnings;
    debugInfo.earningsError = earningsError;

    debugInfo.step = 'checking subscriptions';

    const { count: activeCount, error: activeSubError } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('analyst_id', user.id)
      .eq('status', 'active');

    debugInfo.activeCount = activeCount;
    debugInfo.activeSubError = activeSubError;

    const { count: totalCount, error: totalSubError } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('analyst_id', user.id);

    debugInfo.totalCount = totalCount;
    debugInfo.totalSubError = totalSubError;

    return NextResponse.json({
      success: true,
      debug: debugInfo
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}
