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

    const { data: rules, error } = await supabase
      .from('platform_fee_rules')
      .select(`
        *,
        analyst:analyst_id (
          id,
          full_name
        ),
        plan:plan_id (
          id,
          name
        ),
        created_by_profile:created_by (
          id,
          full_name
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formattedRules = (rules || []).map((rule: any) => ({
      id: rule.id,
      ruleType: rule.rule_type,
      analyst: rule.analyst ? {
        id: rule.analyst.id,
        name: rule.analyst.full_name
      } : null,
      plan: rule.plan ? {
        id: rule.plan.id,
        name: rule.plan.name
      } : null,
      feeType: rule.fee_type,
      feeValue: parseFloat(rule.fee_value),
      isActive: rule.is_active,
      effectiveFrom: rule.effective_from,
      effectiveUntil: rule.effective_until,
      createdBy: {
        id: rule.created_by_profile?.id,
        name: rule.created_by_profile?.full_name
      },
      reason: rule.change_reason
    }));

    return NextResponse.json({ rules: formattedRules });
  } catch (error: any) {
    console.error('Error fetching fee rules:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fee rules' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();

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

    const body = await request.json();
    const { ruleType, analystId, planId, feeType, feeValue, effectiveFrom, effectiveUntil, reason } = body;

    const { data: rule, error } = await supabase
      .from('platform_fee_rules')
      .insert({
        rule_type: ruleType,
        analyst_id: analystId || null,
        plan_id: planId || null,
        fee_type: feeType,
        fee_value: feeValue,
        effective_from: effectiveFrom || new Date().toISOString(),
        effective_until: effectiveUntil || null,
        created_by: user.id,
        change_reason: reason
      })
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from('financial_audit_log')
      .insert({
        action_type: 'fee_rule_created',
        entity_type: 'platform_fee_rule',
        entity_id: rule.id,
        new_values: rule,
        performed_by: user.id,
        reason
      });

    return NextResponse.json({
      ruleId: rule.id,
      status: 'created',
      effectiveFrom: rule.effective_from
    });
  } catch (error: any) {
    console.error('Error creating fee rule:', error);
    return NextResponse.json(
      { error: 'Failed to create fee rule' },
      { status: 500 }
    );
  }
}
