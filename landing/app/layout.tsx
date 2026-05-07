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
  title: "Ralphy — the AI film studio that lives in your terminal",
  description:
    "Open Claude Code, say \"make me a video in style X about Y\", get a finished mp4. A scripted CLI, a Remotion composition library, and a Claude skill stack — wrapped into one tiny pixel slime.",
  metadataBase: new URL("https://ralphy.dev"),
  openGraph: {
    title: "Ralphy — the AI film studio that lives in your terminal",
    description:
      "Talk to it like a producer. Get a finished mp4 in eight minutes.",
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
