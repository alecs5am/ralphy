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
};

export default nextConfig;
