import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" style={{ "--vio": "#FFA630" } as React.CSSProperties}>
      <head>
        {BRAND_PRELOADS.map((f) => (
          <link key={f} rel="preload" as="image" href={`/assets/brands/${f}`} />
        ))}
      </head>
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
