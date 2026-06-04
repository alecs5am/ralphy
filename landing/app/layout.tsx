import type { Metadata } from "next";
import "./reset.css";
import "./globals.css";
import "./shadcn-tokens.css";
import { PostHogProvider } from "./providers";

export const metadata: Metadata = {
  title: "Ralphy · Open-source content factory CLI",
  description: "Turn your coding agent into a one-prompt video marketer. Open-source CLI for TikTok, Reels & YouTube Shorts.",
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
        <PostHogProvider>
          <div id="root">{children}</div>
        </PostHogProvider>
      </body>
    </html>
  );
}
