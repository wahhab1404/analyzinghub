import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ImageResponse } from 'npm:@vercel/og@0.6.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface GenerateImageRequest {
  report_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const data: GenerateImageRequest = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[Report Image] Fetching report data for:', data.report_id);

    const { data: report, error: reportError } = await supabase
      .from('daily_trade_reports')
      .select('*')
      .eq('id', data.report_id)
      .maybeSingle();

    if (reportError || !report) {
      console.error('[Report Image] Report error:', reportError);
      throw new Error('Report not found');
    }

    console.log('[Report Image] Report found:', report.id, report.report_date);
    console.log('[Report Image] Report details:', {
      author_id: report.author_id,
      generated_by: report.generated_by,
      period_type: report.period_type,
      start_date: report.start_date,
      end_date: report.end_date
    });

    const summary = report.summary || {};
    const totalTrades = summary.total_trades || 0;
    const activeTrades = summary.active_trades || 0;
    const closedTrades = summary.closed_trades || 0;
    const expiredTrades = summary.expired_trades || 0;
    const winningTrades = summary.winning_trades || 0;
    const losingTrades = summary.losing_trades || 0;
    const totalProfit = summary.total_profit_dollars || summary.total_profit || 0;
    const totalLoss = summary.total_loss || 0;
    const netProfit = summary.net_profit || (totalProfit - totalLoss);
    const winRate = (winningTrades + losingTrades) > 0
      ? (winningTrades / (winningTrades + losingTrades) * 100)
      : 0;

    const analystId = report.author_id || report.generated_by;

    const startDate = report.start_date || report.report_date;
    const endDate = report.end_date || report.report_date;
    const startOfPeriod = new Date(startDate + 'T00:00:00.000Z');
    const endOfPeriod = new Date(endDate + 'T23:59:59.999Z');

    console.log('[Report Image] Period query:', {
      startOfPeriod: startOfPeriod.toISOString(),
      endOfPeriod: endOfPeriod.toISOString()
    });

    const { data: allTrades } = await supabase
      .from('index_trades')
      .select('*')
      .eq('author_id', analystId);

    const trades = allTrades?.filter((t: any) => {
      const createdAt = new Date(t.created_at);
      const closedAt = t.closed_at ? new Date(t.closed_at) : null;
      const expiryDate = t.expiry ? new Date(t.expiry) : null;

      const matchCreated = createdAt >= startOfPeriod && createdAt <= endOfPeriod;
      const matchClosed = closedAt && closedAt >= startOfPeriod && closedAt <= endOfPeriod;
      const matchExpiry = expiryDate && expiryDate >= startOfPeriod && expiryDate <= endOfPeriod;
      const matchActive = t.status === 'active' && createdAt <= endOfPeriod;

      return matchCreated || matchClosed || matchExpiry || matchActive;
    }).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8) || [];

    const tradesError = null;

    if (tradesError) {
      console.error('[Report Image] Trades query error:', tradesError);
    }

    console.log('[Report Image] Trades found:', trades?.length || 0);
    if (trades && trades.length > 0) {
      console.log('[Report Image] First trade:', trades[0]);
    }

    const tradesData = (trades || []).map(t => {
      const profit = t.pnl_usd || t.final_profit || 0;
      const status = t.status === 'active' ? '🟢' :
                     t.is_winning_trade ? '✅' :
                     profit < 0 ? '❌' : '⏰';
      const profitStr = profit !== 0 ? `${profit >= 0 ? '+' : ''}$${profit.toFixed(0)}` : '-';
      const displaySymbol = t.underlying_index_symbol || t.symbol || 'N/A';
      const strike = t.strike || 0;
      const entry = t.entry_contract_snapshot?.price || t.entry_contract_snapshot?.mid || t.entry_contract_snapshot?.last || 0;
      const high = t.contract_high_since || t.current_contract || entry;
      return {
        symbol: displaySymbol,
        status,
        profit: profitStr,
        strike: strike.toFixed(0),
        entry: entry.toFixed(2),
        high: high.toFixed(2)
      };
    });

    console.log('[Report Image] Trades data for image:', tradesData);

    const avgProfitPerWinningTrade = summary.avg_profit_per_winning_trade || 0;
    const avgLossPerLosingTrade = summary.avg_loss_per_losing_trade || 0;
    const bestTrade = summary.best_trade || 0;
    const worstTrade = summary.worst_trade || 0;

    const periodTypeTextEn = report.period_type === 'weekly' ? 'Weekly Report' :
                             report.period_type === 'monthly' ? 'Monthly Report' :
                             'Daily Report';

    const dateText = report.period_type === 'custom' || report.period_type === 'weekly' || report.period_type === 'monthly'
      ? `${startDate} - ${endDate}`
      : report.report_date;

    console.log('[Report Image] Generating image with @vercel/og...');

    const imageResponse = new ImageResponse(
      {
        type: 'div',
        props: {
          style: {
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            padding: '80px',
            fontFamily: 'system-ui, sans-serif',
            color: 'white',
          },
          children: [
            {
              type: 'div',
              props: {
                style: {
                  fontSize: '64px',
                  fontWeight: 'bold',
                  marginBottom: '24px',
                  textAlign: 'center',
                },
                children: `📊 ${periodTypeTextEn}`,
              },
            },
            {
              type: 'div',
              props: {
                style: {
                  fontSize: '36px',
                  opacity: 0.9,
                  marginBottom: '60px',
                  textAlign: 'center',
                },
                children: dateText,
              },
            },
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  gap: '40px',
                  marginBottom: '40px',
                },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: {
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        background: 'rgba(255, 255, 255, 0.15)',
                        borderRadius: '20px',
                        padding: '32px',
                      },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: { fontSize: '26px', opacity: 0.8, marginBottom: '12px', textAlign: 'center' },
                            children: 'Net Profit',
                          },
                        },
                        {
                          type: 'div',
                          props: {
                            style: { fontSize: '56px', fontWeight: 'bold', color: netProfit >= 0 ? '#4ade80' : '#f87171', textAlign: 'center' },
                            children: `${netProfit >= 0 ? '+' : ''}$${netProfit.toFixed(0)}`,
                          },
                        },
                      ],
                    },
                  },
                  {
                    type: 'div',
                    props: {
                      style: {
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        background: 'rgba(255, 255, 255, 0.15)',
                        borderRadius: '20px',
                        padding: '32px',
                      },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: { fontSize: '26px', opacity: 0.8, marginBottom: '12px', textAlign: 'center' },
                            children: 'Win Rate',
                          },
                        },
                        {
                          type: 'div',
                          props: {
                            style: { fontSize: '56px', fontWeight: 'bold', textAlign: 'center' },
                            children: `${winRate.toFixed(0)}%`,
                          },
                        },
                      ],
                    },
                  },
                  {
                    type: 'div',
                    props: {
                      style: {
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        background: 'rgba(255, 255, 255, 0.15)',
                        borderRadius: '20px',
                        padding: '32px',
                      },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: { fontSize: '26px', opacity: 0.8, marginBottom: '12px', textAlign: 'center' },
                            children: 'Avg Win',
                          },
                        },
                        {
                          type: 'div',
                          props: {
                            style: { fontSize: '56px', fontWeight: 'bold', textAlign: 'center' },
                            children: `+$${avgProfitPerWinningTrade.toFixed(0)}`,
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  gap: '32px',
                  marginBottom: '40px',
                },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: {
                        flex: 1,
                        background: 'rgba(255, 255, 255, 0.12)',
                        borderRadius: '16px',
                        padding: '28px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px',
                      },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: { fontSize: '28px', opacity: 0.85 },
                            children: 'Winners',
                          },
                        },
                        {
                          type: 'div',
                          props: {
                            style: { fontSize: '48px', fontWeight: 'bold' },
                            children: winningTrades.toString(),
                          },
                        },
                      ],
                    },
                  },
                  {
                    type: 'div',
                    props: {
                      style: {
                        flex: 1,
                        background: 'rgba(255, 255, 255, 0.12)',
                        borderRadius: '16px',
                        padding: '28px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px',
                      },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: { fontSize: '28px', opacity: 0.85 },
                            children: 'Losers',
                          },
                        },
                        {
                          type: 'div',
                          props: {
                            style: { fontSize: '48px', fontWeight: 'bold' },
                            children: losingTrades.toString(),
                          },
                        },
                      ],
                    },
                  },
                  {
                    type: 'div',
                    props: {
                      style: {
                        flex: 1,
                        background: 'rgba(255, 255, 255, 0.12)',
                        borderRadius: '16px',
                        padding: '28px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px',
                      },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: { fontSize: '28px', opacity: 0.85 },
                            children: 'Total',
                          },
                        },
                        {
                          type: 'div',
                          props: {
                            style: { fontSize: '48px', fontWeight: 'bold' },
                            children: totalTrades.toString(),
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '16px',
                  padding: '28px',
                },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: { fontSize: '38px', fontWeight: 'bold', marginBottom: '24px', textAlign: 'center' },
                      children: 'Recent Trades',
                    },
                  },
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                      },
                      children: tradesData.length > 0 ? tradesData.slice(0, 5).map((trade) => ({
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: 'rgba(255, 255, 255, 0.08)',
                            borderRadius: '12px',
                            padding: '16px 20px',
                          },
                          children: [
                            {
                              type: 'div',
                              props: {
                                style: { display: 'flex', gap: '12px', alignItems: 'center', flex: 1 },
                                children: [
                                  {
                                    type: 'div',
                                    props: {
                                      style: { fontSize: '24px' },
                                      children: trade.status,
                                    },
                                  },
                                  {
                                    type: 'div',
                                    props: {
                                      style: { fontSize: '22px', fontWeight: 'bold' },
                                      children: trade.symbol,
                                    },
                                  },
                                ],
                              },
                            },
                            {
                              type: 'div',
                              props: {
                                style: { display: 'flex', gap: '20px', fontSize: '18px', opacity: 0.9 },
                                children: [
                                  {
                                    type: 'div',
                                    props: {
                                      children: `Strike: ${trade.strike}`,
                                    },
                                  },
                                  {
                                    type: 'div',
                                    props: {
                                      children: `Entry: ${trade.entry}`,
                                    },
                                  },
                                  {
                                    type: 'div',
                                    props: {
                                      children: `High: ${trade.high}`,
                                    },
                                  },
                                ],
                              },
                            },
                            {
                              type: 'div',
                              props: {
                                style: { fontSize: '24px', fontWeight: 'bold', minWidth: '100px', textAlign: 'right' },
                                children: trade.profit,
                              },
                            },
                          ],
                        },
                      })) : [
                        {
                          type: 'div',
                          props: {
                            style: { fontSize: '22px', opacity: 0.7, textAlign: 'center', padding: '20px 0' },
                            children: 'No trades',
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            {
              type: 'div',
              props: {
                style: {
                  marginTop: 'auto',
                  fontSize: '24px',
                  opacity: 0.8,
                  textAlign: 'center',
                  paddingTop: '24px',
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '40px',
                },
                children: [
                  {
                    type: 'div',
                    props: {
                      children: `Best Trade: +$${bestTrade.toFixed(0)}`,
                    },
                  },
                  {
                    type: 'div',
                    props: {
                      children: `Worst Trade: ${worstTrade >= 0 ? '+' : ''}$${worstTrade.toFixed(0)}`,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      {
        width: 1200,
        height: 675,
      }
    );

    const arrayBuffer = await imageResponse.arrayBuffer();
    const pngBuffer = new Uint8Array(arrayBuffer);

    console.log('[Report Image] Image generated successfully, size:', pngBuffer.length);

    return new Response(pngBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/png',
      },
    });

  } catch (error: any) {
    console.error('[Report Image] Error:', error);
    console.error('[Report Image] Stack:', error.stack);
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
