import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./reset.css";
import "./globals.css";
import "./shadcn-tokens.css";
import { PostHogProvider } from "./providers";
import { JsonLd } from "@/components/JsonLd";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_REPO,
  SITE_URL,
  siteUrl,
} from "@/lib/site";

// GA4 measurement ID. Public by design (ships in the client bundle), so we
// hard-code the production id as the default — exactly like the PostHog key in
// instrumentation-client.ts — and let an env var win for a different property.
// Set NEXT_PUBLIC_GA_ID="" to disable GA entirely (clean no-op, no script).
const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "G-RW66JP59SS";

export const metadata: Metadata = {
  // metadataBase makes every relative og:image / canonical resolve to an
  // absolute URL. Without it Next warns and emits relative social URLs that
  // most crawlers and link-unfurlers reject.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Ralphy · Open-source content factory CLI",
    // Per-page `title: "Library"` renders as "Library · Ralphy". Pages that
    // need a fully custom title set `title: { absolute: "…" }`.
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "AI video generator",
    "UGC video",
    "open source CLI",
    "TikTok video maker",
    "Reels generator",
    "YouTube Shorts",
    "coding agent",
    "AI content factory",
    "faceless video",
    "Claude Code",
  ],
  authors: [{ name: "Ralphy", url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: "Ralphy · Open-source content factory CLI",
    description: SITE_DESCRIPTION,
    locale: "en_US",
    // Default social card, set EXPLICITLY (not via the file convention). The
    // root app/opengraph-image.tsx only attaches to "/" — which permanently
    // redirects to /ralphy — so the home page never inherited it. Declaring
    // images on the layout openGraph propagates the card to every page that
    // doesn't override it (home, etc.); metadataBase makes the path absolute.
    // The bytes are still served by the app/opengraph-image.tsx route.
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Ralphy — open-source content factory CLI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@alecs5am",
    creator: "@alecs5am",
    title: "Ralphy · Open-source content factory CLI",
    description: SITE_DESCRIPTION,
    images: ["/opengraph-image"],
  },
  icons: {
    icon: "/icon.svg",
  },
};

const BRAND_PRELOADS = [
  "claude-icon.svg",
  "claude-text.svg",
  "cursor-icon.svg",
  "cursor-text.svg",
  "codex-icon.svg",
  "codex-text.svg",
  "gemini-icon.svg",
  "gemini-text.svg",
  "openclaw-icon.svg",
  "openclaw-text.svg",
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      style={
        {
          // Override the WHOLE orange accent family — not just --vio. The :root
          // defaults for --vio-2/-3/-ink are dusty rose; if only --vio is
          // overridden, every hover / secondary accent (button hover, code
          // pills, lightbox labels) renders pink. Mirror the prototype's orange
          // ramp so the accent is consistently orange everywhere.
          "--vio": "#FFA630",
          "--vio-2": "#FFC074",
          "--vio-3": "#E08A1E",
          "--vio-ink": "#5C3A06",
        } as React.CSSProperties
      }
    >
      <head>
        {BRAND_PRELOADS.map((f) => (
          <link key={f} rel="preload" as="image" href={`/assets/brands/${f}`} />
        ))}
      </head>
      <body suppressHydrationWarning>
        <JsonLd
          data={[
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              name: SITE_NAME,
              url: SITE_URL,
              logo: siteUrl("icon.svg"),
              sameAs: [SITE_REPO],
            },
            {
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: SITE_NAME,
              url: SITE_URL,
              description: SITE_DESCRIPTION,
              potentialAction: {
                "@type": "SearchAction",
                target: {
                  "@type": "EntryPoint",
                  urlTemplate: `${SITE_URL}/library?q={search_term_string}`,
                },
                "query-input": "required name=search_term_string",
              },
            },
          ]}
        />
        <PostHogProvider>
          <div id="root">{children}</div>
        </PostHogProvider>
      </body>
      {GA_ID ? <GoogleAnalytics gaId={GA_ID} /> : null}
    </html>
  );
}
