import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tradeId, channelIds } = await request.json();

    if (!tradeId) {
      return NextResponse.json({ error: 'Trade ID is required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const response = await fetch(
      `${supabaseUrl}/functions/v1/send-trade-advertisement`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          tradeId,
          channelIds,
          userId: user.id
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send advertisement');
    }

    const result = await response.json();

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error sending trade ad:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send advertisement' },
      { status: 500 }
    );
  }
}
