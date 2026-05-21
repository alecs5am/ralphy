import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    // landing has no local ESLint config; without this, `next build` walks up
    // and applies the repo-root `@remotion/eslint-config-flat` rules to landing
    // components, which is wrong (this is a Next.js app, not a Remotion video).
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/ralphy",
        permanent: true,
      },
    ];
  },
  /* Force-include the OG image's font + bg assets in the serverless
   * function bundle on Vercel. Next's automatic file tracing can miss
   * binary files referenced via `new URL("./og-assets/X", import.meta.url)`
   * inside a dynamic-route folder; without these globs the deployed
   * function 500s on missing fonts. Local dev resolves them via fs
   * regardless. */
  outputFileTracingIncludes: {
    "/blog/[slug]/opengraph-image": [
      "./app/blog/[slug]/og-assets/**/*",
    ],
  },
};

export default nextConfig;
