/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: { unoptimized: true },
  optimizeFonts: false,

  experimental: {
    // ── Keep @resvg/resvg-wasm out of the webpack bundle ───────────────────────
    // The package's ESM entry has `import * as wasm from './index_bg.wasm'`.
    // Webpack in Next.js 13 cannot handle that static WASM import even with
    // asyncWebAssembly:true (layer conflicts in RSC mode). Marking it external
    // tells Next.js to emit require('@resvg/resvg-wasm') instead of bundling it,
    // so webpack never touches the .wasm import. The package is then loaded by
    // Node.js at runtime from node_modules (included via outputFileTracingIncludes).
    serverComponentsExternalPackages: ['@resvg/resvg-wasm'],

    // ── Bundle non-JS assets into the Netlify Lambda ───────────────────────────
    // Output-file-tracing does not automatically pick up binary/font files from
    // node_modules. We include the entire @resvg/resvg-wasm package (so the .wasm
    // binary + CJS files are present at runtime) plus the Inter WOFF2 fonts.
    outputFileTracingIncludes: {
      '/api/indices/trades/[id]/generate-image': [
        './node_modules/@resvg/resvg-wasm/**',
        './node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2',
        './node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2',
      ],
      '/api/debug/contract-image': [
        './node_modules/@resvg/resvg-wasm/**',
        './node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2',
        './node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2',
      ],
      // Company contract-deal alert image
      '/api/companies/contract-trades/[id]/generate-image': [
        './node_modules/@resvg/resvg-wasm/**',
        './node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2',
        './node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2',
      ],
      // Company contract-deal create path renders the alert card at publish time
      '/api/companies/contract-trades': [
        './node_modules/@resvg/resvg-wasm/**',
        './node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2',
        './node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2',
      ],
      // Trade broadcast renders an alert card for option trades
      '/api/trades/[id]/broadcast': [
        './node_modules/@resvg/resvg-wasm/**',
        './node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2',
        './node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2',
      ],
    },
  },
};

module.exports = nextConfig;
