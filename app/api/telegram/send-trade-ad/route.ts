import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

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

    if (!supabaseServiceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

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
      const errorText = await response.text();
      let errorMessage = 'Failed to send advertisement';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
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
