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
      {
        // /templates folded into /library (issue 054 — one discovery surface,
        // no overlap). Next preserves the incoming query string on a redirect
        // by default, so a bookmarked `/templates?...` lands on the equivalent
        // library view.
        source: "/templates",
        destination: "/library",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
