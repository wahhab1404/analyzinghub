import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/api-helpers';
import { EntitlementsService } from '@/services/entitlements/entitlements.service';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient(request);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entitlements = await EntitlementsService.getUserEntitlements(user.id);

    if (!entitlements) {
      return NextResponse.json(
        { error: 'Failed to fetch entitlements' },
        { status: 500 }
      );
    }

    return NextResponse.json({ entitlements });
  } catch (error) {
    console.error('Error fetching entitlements:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
