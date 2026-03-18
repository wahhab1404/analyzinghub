/**
 * Public AI Analysis Page  — /public/analysis/[slug]
 *
 * No authentication required.
 * Fetches the AI result by slug and renders the premium page component.
 */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { AIAnalysisPage } from '@/components/public/AIAnalysisPage';

interface PageProps {
  params: { slug: string };
}

async function getAnalysis(slug: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('ai_analysis_results')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !data) return null;
  return data as any;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const analysis = await getAnalysis(params.slug);
  if (!analysis) return { title: 'Analysis Not Found — AnalyzingHub' };

  const r          = analysis.result;
  const ticker     = analysis.ticker || '';
  const company    = analysis.company_name || ticker;
  const type       = analysis.analysis_type === 'technical' ? 'Technical Analysis' :
                     analysis.analysis_type === 'compare'   ? 'Company Comparison'  :
                     analysis.analysis_type === 'quick_summary' ? 'Investment Summary' :
                                                                  'Financial Analysis';

  const title       = `${company} — AI ${type} | AnalyzingHub`;
  const description = r?.executive_summary || r?.telegram_preview ||
                      `AI-powered ${type} for ${ticker} on AnalyzingHub`;

  const baseUrl = process.env.APP_BASE_URL || 'https://analyzinghub.com';

  return {
    title,
    description,
    robots: 'noindex',     // optional: keep AI pages un-indexed
    openGraph: {
      title,
      description,
      type: 'article',
      url:  `${baseUrl}/public/analysis/${params.slug}`,
      siteName: 'AnalyzingHub',
    },
    twitter: {
      card:        'summary',
      title,
      description,
      creator:     '@analyzinghub',
    },
  };
}

export default async function PublicAnalysisPage({ params }: PageProps) {
  const analysis = await getAnalysis(params.slug);
  if (!analysis) notFound();
  return <AIAnalysisPage analysis={analysis} />;
}
