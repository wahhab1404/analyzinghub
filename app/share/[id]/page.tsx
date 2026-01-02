import { createServerClient } from '@/lib/supabase/server'
import { PublicAnalysisView } from '@/components/analysis/PublicAnalysisView'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supabase = createServerClient()

  const { data: analysis } = await supabase
    .from('analyses')
    .select(`
      title,
      direction,
      post_type,
      summary,
      chart_image_url,
      created_at,
      profiles:analyzer_id (full_name),
      symbols:symbol_id (symbol)
    `)
    .eq('id', params.id)
    .maybeSingle()

  if (!analysis) {
    return {
      title: 'Analysis Not Found - AnalyzingHub',
    }
  }

  const symbol = (analysis.symbols as any)?.symbol || 'N/A'
  const analyzerName = (analysis.profiles as any)?.full_name || 'Analyzer'
  const postType = analysis.post_type || 'analysis'
  const chartImage = analysis.chart_image_url || '/logo.png'

  const typeLabel = postType === 'news' ? 'Market News' : postType === 'article' ? 'Article' : 'Analysis'
  const title = analysis.title || `${symbol} ${analysis.direction || ''} ${typeLabel}`
  const description = analysis.summary || `${typeLabel} by ${analyzerName} on ${symbol} - View detailed analysis and predictions on AnalyzingHub`

  const baseUrl = process.env.APP_BASE_URL || 'https://analyzhub.com'

  return {
    title: `${title} - AnalyzingHub`,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      url: `${baseUrl}/share/${params.id}`,
      siteName: 'AnalyzingHub',
      images: [
        {
          url: chartImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      authors: [analyzerName],
      publishedTime: analysis.created_at,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [chartImage],
      creator: '@analyzinghub',
    },
  }
}

export default async function ShareAnalysisPage({ params }: { params: { id: string } }) {
  const supabase = createServerClient()

  const { data: analysis, error } = await supabase
    .from('analyses')
    .select(`
      id,
      post_type,
      direction,
      stop_loss,
      title,
      summary,
      content,
      source_url,
      chart_image_url,
      created_at,
      status,
      validated_at,
      profiles:analyzer_id (
        id,
        full_name,
        avatar_url,
        bio
      ),
      symbols:symbol_id (
        symbol
      ),
      analysis_targets (
        price,
        expected_time
      ),
      validation_events (
        event_type,
        target_number,
        price_at_hit,
        hit_at
      )
    `)
    .eq('id', params.id)
    .maybeSingle()

  if (error || !analysis) {
    notFound()
  }

  const transformedAnalysis = {
    ...analysis,
    profiles: Array.isArray(analysis.profiles) ? analysis.profiles[0] : analysis.profiles,
    symbols: Array.isArray(analysis.symbols) ? analysis.symbols[0] : analysis.symbols,
  }

  return <PublicAnalysisView analysis={transformedAnalysis} />
}
