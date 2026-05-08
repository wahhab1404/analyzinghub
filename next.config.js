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

  // ── WASM support ─────────────────────────────────────────────────────────────
  // @resvg/resvg-wasm's ESM entry has `import * as wasm from './index_bg.wasm'`.
  // Without asyncWebAssembly, webpack fails to compile it. asyncWebAssembly lets
  // webpack parse the static .wasm import without crashing.
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    // Place WASM chunks where Next.js/Netlify can serve them server-side.
    if (isServer) {
      config.output.webassemblyModuleFilename = 'chunks/[id].wasm';
    }
    return config;
  },

  // ── Bundle non-JS assets needed by server-side image generation ─────────────
  // @resvg/resvg-wasm requires its .wasm binary at runtime (loaded via readFileSync
  // inside the initWasm() call). @fontsource/inter provides Inter WOFF2 fonts for
  // satori. Next.js output-file-tracing skips binary/font files from node_modules,
  // so we explicitly list them here to ensure they land in the Netlify Lambda bundle.
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
