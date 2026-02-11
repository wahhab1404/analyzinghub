import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
}

function formatExpiry(expiry: string): string {
  const date = new Date(expiry);
  return date.toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !supabaseKey) {
      return new Response('Configuration error', { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const params = await context.params;
    const tradeId = params.id;
    const { searchParams } = new URL(request.url);
    const isNewHigh = searchParams.get('isNewHigh') === 'true';
    const newHighPriceParam = searchParams.get('newHighPrice');
    const newHighPrice = newHighPriceParam ? parseFloat(newHighPriceParam) : null;

    const { data: trade, error: tradeError } = await supabase
      .from('index_trades')
      .select(`
        *,
        author:profiles!author_id(id, full_name)
      `)
      .eq('id', tradeId)
      .single();

    if (tradeError || !trade) {
      return new Response('Trade not found', { status: 404 });
    }

    let analysis = null;
    if (trade.analysis_id) {
      const { data: analysisData } = await supabase
        .from('index_analyses')
        .select('id, title, index_symbol')
        .eq('id', trade.analysis_id)
        .maybeSingle();
      analysis = analysisData;
    }

    const entryPrice = trade.entry_contract_snapshot?.price ||
                        trade.entry_contract_snapshot?.mid ||
                        trade.entry_contract_snapshot?.last || 0;
    const currentPrice = trade.current_contract || entryPrice;
    const priceChange = currentPrice - entryPrice;
    const priceChangePercent = entryPrice > 0 ? (priceChange / entryPrice) * 100 : 0;

    const highSinceEntry = trade.contract_high_since || currentPrice;
    const lowSinceEntry = trade.contract_low_since || currentPrice;

    const qty = trade.qty || 1;
    const multiplier = trade.contract_multiplier || 100;
    const netPnl = priceChange * multiplier * qty;

    const underlyingPrice = trade.current_underlying || trade.entry_underlying_snapshot?.price || 0;
    const underlyingEntryPrice = trade.entry_underlying_snapshot?.price || underlyingPrice;
    const underlyingChange = underlyingPrice - underlyingEntryPrice;
    const underlyingChangePercent = (underlyingChange / underlyingEntryPrice) * 100;

    const currentSnapshot = trade.current_contract_snapshot || trade.entry_contract_snapshot;
    const bid = currentSnapshot?.bid || 0;
    const ask = currentSnapshot?.ask || 0;
    const volume = currentSnapshot?.volume || 0;

    const now = new Date();
    const timestamp = `Open, ${now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })} ${now.toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
    })} ET`;

    const isPriceUp = priceChange > 0;
    const priceColor = isPriceUp ? '#10b981' : (priceChange < 0 ? '#ef4444' : '#8e8e93');
    const priceArrow = isPriceUp ? '▲' : (priceChange < 0 ? '▼' : '');
    const priceSign = isPriceUp ? '+' : '';
    const isUnderlyingUp = underlyingChange >= 0;

    const strike = trade.strike || 0;
    const expiry = trade.expiry || new Date().toISOString();
    const optionType = trade.option_type === 'call' ? 'Call' : 'Put';
    const underlyingSymbol = analysis?.index_symbol || trade.underlying_index_symbol || 'SPX';

    let cleanSymbol = underlyingSymbol;
    if (trade.polygon_option_ticker) {
      const parts = trade.polygon_option_ticker.split(':');
      if (parts.length > 1) {
        const tickerPart = parts[1];
        cleanSymbol = tickerPart.replace(/\d{6}[CP]\d{8}$/, '');
      }
    }

    const pnlColor = netPnl >= 0 ? '#10b981' : '#ef4444';
    const pnlSign = netPnl >= 0 ? '+' : '';

    if (isNewHigh) {
      const displayHighPrice = newHighPrice || highSinceEntry;
      const displayGainPercent = ((displayHighPrice - entryPrice) / entryPrice * 100);
      const displayPnl = (displayHighPrice - entryPrice) * multiplier * qty;

      return new ImageResponse(
        (
          <div
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              width: '1280px',
              height: '720px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: '40px',
                right: '60px',
                fontSize: '28px',
                fontWeight: 800,
                color: 'white',
                textShadow: '0 2px 12px rgba(0,0,0,0.3)',
              }}
            >
              AnalyzingHub
            </div>
            <div
              style={{
                background: 'white',
                borderRadius: '32px',
                padding: '60px',
                width: '1100px',
                boxShadow: '0 25px 80px rgba(0,0,0,0.4)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  padding: '16px 40px',
                  borderRadius: '50px',
                  fontSize: '32px',
                  fontWeight: 800,
                  marginBottom: '32px',
                  textTransform: 'uppercase',
                  letterSpacing: '2px',
                  boxShadow: '0 8px 24px rgba(16, 185, 129, 0.4)',
                }}
              >
                🚀 NEW HIGH ALERT! 🚀
              </div>
              <div
                style={{
                  fontSize: '36px',
                  color: '#6b7280',
                  fontWeight: 600,
                  marginBottom: '16px',
                  textTransform: 'uppercase',
                  letterSpacing: '3px',
                }}
              >
                New High Price
              </div>
              <div
                style={{
                  fontSize: '180px',
                  fontWeight: 900,
                  color: '#10b981',
                  lineHeight: 1,
                  margin: '32px 0',
                  letterSpacing: '-5px',
                }}
              >
                ${displayHighPrice.toFixed(2)}
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '48px',
                  margin: '40px 0',
                  padding: '32px',
                  background: '#f9fafb',
                  borderRadius: '20px',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ fontSize: '18px', color: '#9ca3af', fontWeight: 600, marginBottom: '8px' }}>
                    ENTRY
                  </div>
                  <div style={{ fontSize: '32px', color: '#1f2937', fontWeight: 700 }}>
                    ${entryPrice.toFixed(2)}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ fontSize: '18px', color: '#9ca3af', fontWeight: 600, marginBottom: '8px' }}>
                    CURRENT
                  </div>
                  <div style={{ fontSize: '32px', color: '#1f2937', fontWeight: 700 }}>
                    ${currentPrice.toFixed(2)}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ fontSize: '18px', color: '#9ca3af', fontWeight: 600, marginBottom: '8px' }}>
                    GAIN
                  </div>
                  <div style={{ fontSize: '36px', color: '#10b981', fontWeight: 700 }}>
                    +{displayGainPercent.toFixed(2)}%
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ fontSize: '18px', color: '#9ca3af', fontWeight: 600, marginBottom: '8px' }}>
                    P/L
                  </div>
                  <div style={{ fontSize: '36px', color: '#10b981', fontWeight: 700 }}>
                    +${displayPnl.toFixed(2)}
                  </div>
                </div>
              </div>
              <div
                style={{
                  marginTop: '32px',
                  paddingTop: '28px',
                  borderTop: '3px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                }}
              >
                <div style={{ fontSize: '24px', color: '#4b5563', fontWeight: 600 }}>
                  {cleanSymbol} ${strike.toLocaleString()} {optionType} • {formatExpiry(expiry)}
                </div>
                <div style={{ fontSize: '22px', color: '#6b7280', fontWeight: 500 }}>
                  {trade.author.full_name}
                </div>
              </div>
            </div>
          </div>
        ),
        {
          width: 1280,
          height: 720,
        }
      );
    }

    return new ImageResponse(
      (
        <div
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            width: '1280px',
            height: '720px',
            padding: '40px',
            position: 'relative',
            display: 'flex',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '32px',
              right: '48px',
              fontSize: '24px',
              fontWeight: 700,
              color: 'white',
              textShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            AnalyzingHub
          </div>
          <div
            style={{
              background: 'white',
              borderRadius: '24px',
              padding: '48px',
              width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '40px',
                paddingBottom: '32px',
                borderBottom: '3px solid #f0f0f5',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    fontSize: '52px',
                    fontWeight: 700,
                    color: '#1a1a1a',
                    marginBottom: '8px',
                    letterSpacing: '-1px',
                  }}
                >
                  {cleanSymbol} ${strike.toLocaleString()}
                </div>
                <div style={{ fontSize: '24px', color: '#8e8e93', fontWeight: 500 }}>
                  {formatExpiry(expiry)} • {optionType} • {trade.author.full_name}
                </div>
              </div>
              <div
                style={{
                  background: priceColor,
                  color: 'white',
                  padding: '12px 24px',
                  borderRadius: '12px',
                  fontSize: '20px',
                  fontWeight: 600,
                }}
              >
                {priceArrow} {priceSign}{Math.abs(priceChangePercent).toFixed(2)}%
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '48px',
                flex: 1,
                marginBottom: '32px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  flex: 1,
                }}
              >
                <div
                  style={{
                    fontSize: '120px',
                    fontWeight: 800,
                    color: priceColor,
                    lineHeight: 1,
                    marginBottom: '20px',
                    letterSpacing: '-3px',
                  }}
                >
                  ${currentPrice.toFixed(2)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div
                    style={{
                      fontSize: '36px',
                      fontWeight: 600,
                      color: priceColor,
                    }}
                  >
                    {priceArrow} {priceSign}${Math.abs(priceChange).toFixed(2)}
                  </div>
                  <div
                    style={{
                      fontSize: '32px',
                      fontWeight: 700,
                      color: pnlColor,
                    }}
                  >
                    P/L: {pnlSign}${Math.abs(netPnl).toFixed(2)}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '24px',
                  flex: 1,
                }}
              >
                {[
                  { label: 'Entry Price', value: `$${entryPrice.toFixed(2)}`, color: '#1a1a1a' },
                  { label: 'Quantity', value: `${qty}x`, color: '#1a1a1a' },
                  { label: 'High Since Entry', value: `$${highSinceEntry.toFixed(2)}`, color: '#10b981' },
                  { label: 'Low Since Entry', value: `$${lowSinceEntry.toFixed(2)}`, color: '#ef4444' },
                  { label: 'Bid / Ask', value: `${bid.toFixed(2)} / ${ask.toFixed(2)}`, color: '#1a1a1a' },
                  { label: 'Volume', value: formatNumber(Math.abs(volume)), color: '#1a1a1a' },
                ].map((stat, i) => (
                  <div
                    key={i}
                    style={{
                      background: '#f8f9fa',
                      padding: '20px',
                      borderRadius: '16px',
                      border: '2px solid #e9ecef',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '18px',
                        color: '#8e8e93',
                        fontWeight: 500,
                        marginBottom: '8px',
                        textTransform: 'uppercase',
                      }}
                    >
                      {stat.label}
                    </div>
                    <div style={{ fontSize: '32px', color: stat.color, fontWeight: 700 }}>
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '28px',
                borderTop: '3px solid #f0f0f5',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: '32px',
                  alignItems: 'center',
                  background: '#f8f9fa',
                  padding: '16px 28px',
                  borderRadius: '12px',
                }}
              >
                <div style={{ fontSize: '28px', color: '#1a1a1a', fontWeight: 700 }}>
                  {underlyingSymbol}
                </div>
                <div
                  style={{
                    fontSize: '28px',
                    color: isUnderlyingUp ? '#10b981' : '#ef4444',
                    fontWeight: 700,
                  }}
                >
                  ${underlyingPrice.toFixed(2)}{' '}
                  {underlyingChangePercent >= 0 ? '▲' : '▼'}
                  {Math.abs(underlyingChangePercent).toFixed(2)}%
                </div>
              </div>
              <div style={{ fontSize: '22px', color: '#8e8e93', fontWeight: 500 }}>
                {timestamp}
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1280,
        height: 720,
      }
    );
  } catch (error: any) {
    console.error('Error generating image:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
