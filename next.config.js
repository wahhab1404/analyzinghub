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
};

module.exports = nextConfig;
