import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ symbol: string }> }
) {
  try {
    const params = await context.params
    const { symbol: symbolParam } = params
    const symbol = symbolParam.toUpperCase()
    const apiKey = process.env.POLYGON_API_KEY

    if (!apiKey) {
      console.warn('POLYGON_API_KEY not configured')
      return NextResponse.json({ news: [] })
    }

    const response = await fetch(
      `https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=10&order=desc&apiKey=${apiKey}`,
      {
        next: { revalidate: 1800 },
      }
    )

    if (!response.ok) {
      console.error('Polygon News API error:', response.status)
      return NextResponse.json({ news: [] })
    }

    const data = await response.json()

    if (!data.results || data.results.length === 0) {
      return NextResponse.json({ news: [] })
    }

    const news = data.results.map((article: any) => ({
      id: article.id,
      title: article.title,
      publisher: article.publisher.name,
      published_at: article.published_utc,
      article_url: article.article_url,
      image_url: article.image_url,
      description: article.description,
    }))

    return NextResponse.json({ news })
  } catch (error) {
    console.error('Error in GET /api/symbols/[symbol]/news:', error)
    return NextResponse.json({ news: [] })
  }
}
