// @ts-nocheck
// Edge function: triggers the Next.js company contract-deals price/peak updater.
// Mirrors trades-price-tracker — invoked on a schedule by pg_cron and forwards
// to the app route which does the Polygon snapshot fetch + DB update. Acts as
// the fallback for the Fly.io CompanyContractTracker live stream.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const APP_URL = Deno.env.get('APP_URL') || Deno.env.get('APP_BASE_URL') || 'https://www.analyzinghub.com'
    const url = `${APP_URL}/api/companies/contract-trades/update-prices`
    const cronSecret = Deno.env.get('CRON_SECRET') || ''

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cronSecret}`,
      },
    })

    const data = await res.json()

    return new Response(JSON.stringify({ success: res.ok, result: data }), {
      status: res.ok ? 200 : 500,
      headers: corsHeaders,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
