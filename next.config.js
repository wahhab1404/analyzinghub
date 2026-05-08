/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors. This is safe because we've excluded
    // Supabase Edge Functions (Deno) from tsconfig.json
    ignoreBuildErrors: true,
  },
  images: { unoptimized: true },
  optimizeFonts: false,

  // ── Bundle non-JS assets needed by server-side image generation ─────────────
  // @resvg/resvg-wasm requires its .wasm binary at runtime.
  // @fontsource/inter provides the Inter font WOFF2 files used by satori.
  // Next.js output-file-tracing does NOT automatically include binary/font files
  // from node_modules — this list ensures they are bundled into the Lambda.
  experimental: {
    outputFileTracingIncludes: {
      '/api/indices/trades/[id]/generate-image': [
        './node_modules/@resvg/resvg-wasm/index_bg.wasm',
        './node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2',
        './node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2',
      ],
      '/api/debug/contract-image': [
        './node_modules/@resvg/resvg-wasm/index_bg.wasm',
        './node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2',
        './node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2',
      ],
    },
  },
};

module.exports = nextConfig;
