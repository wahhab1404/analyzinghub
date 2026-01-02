import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ symbol: string }> }
) {
  const params = await context.params
  const { symbol: symbolParam } = params
  const symbol = symbolParam.toUpperCase()

  try {
    const apiKey = process.env.POLYGON_API_KEY

    if (!apiKey) {
      console.warn('POLYGON_API_KEY not configured')
      return NextResponse.json({
        name: symbol,
        description: 'Company profile information is currently unavailable.',
      })
    }

    const response = await fetch(
      `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${apiKey}`,
      {
        next: { revalidate: 3600 },
      }
    )

    if (!response.ok) {
      console.error('Polygon API error:', response.status)
      return NextResponse.json({
        name: symbol,
        description: 'Company profile information is currently unavailable.',
      })
    }

    const data = await response.json()

    if (!data.results) {
      return NextResponse.json({
        name: symbol,
        description: 'No company information found.',
      })
    }

    const profile = {
      name: data.results.name || symbol,
      description: data.results.description || '',
      market_cap: data.results.market_cap,
      sector: data.results.sic_description,
      industry: data.results.sic_description,
      employees: data.results.total_employees,
      homepage_url: data.results.homepage_url,
      logo_url: data.results.branding?.logo_url
        ? `${data.results.branding.logo_url}?apiKey=${apiKey}`
        : undefined,
    }

    return NextResponse.json(profile)
  } catch (error: any) {
    console.error('Error in GET /api/symbols/[symbol]/profile:', error)
    return NextResponse.json({
      name: symbol,
      description: 'Company profile information is currently unavailable.',
    })
  }
}
