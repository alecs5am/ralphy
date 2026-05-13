import type { Metadata, Viewport } from "next";
import { Instrument_Serif, JetBrains_Mono, Onest, VT323 } from "next/font/google";
import "./globals.css";

const onest = Onest({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-onest",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const vt323 = VT323({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-vt323",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ralphy — open-source content factory for marketers, founders, operators",
  description:
    "Turn Claude, Cursor, or Codex into a one-prompt video marketer. Watch trends, clone any style, render through Remotion, iterate from the analytics. Open-source CLI, MIT, your keys, your files.",
  metadataBase: new URL("https://ralphy.dev"),
  openGraph: {
    title: "Ralphy — open-source content factory for builders",
    description:
      "Your coding agent is now a marketing team. Trend-watch, style-clone, render, iterate — until your numbers move.",
    images: ["/bg/hero.png"],
  },
  icons: {
    icon: "/bg/hero.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#06090f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${onest.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} ${vt323.variable}`}
    >
      <body>
        <div className="atmosphere" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
