import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

    const appBaseUrl = Deno.env.get("APP_BASE_URL") || "https://analyzhub.com";
    const cacheBuster = Date.now();
    const htmlPublicUrl = `${appBaseUrl}/api/reports/${data.report_id}/preview?t=${cacheBuster}`;

    console.log('[Report Image] Generating screenshot for:', htmlPublicUrl);

    const apiflashKey = Deno.env.get('APIFLASH_KEY') || '8daad83fec0948579f899e3c44dea0c4';

    const screenshotParams = new URLSearchParams({
      access_key: apiflashKey,
      url: htmlPublicUrl,
      width: '1280',
      height: '720',
      format: 'png',
      wait_until: 'page_loaded',
      delay: '2',
      fresh: 'true',
    });

    const screenshotUrl = `https://api.apiflash.com/v1/urltoimage?${screenshotParams.toString()}`;
    const screenshotResponse = await fetch(screenshotUrl);

    if (!screenshotResponse.ok) {
      const errorText = await screenshotResponse.text();
      console.error('[Report Image] ApiFlash error:', errorText);
      throw new Error(`ApiFlash failed: ${errorText}`);
    }

    const imageBlob = await screenshotResponse.blob();
    const arrayBuffer = await imageBlob.arrayBuffer();
    const imageBuffer = new Uint8Array(arrayBuffer);

    console.log('[Report Image] Screenshot generated successfully');

    return new Response(imageBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/png'
      }
    });

  } catch (error: any) {
    console.error('[Report Image] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});