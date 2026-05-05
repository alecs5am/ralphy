import { AbsoluteFill } from "remotion";
import { TikTokCaptions } from "../lib/components/captions/TikTokCaptions";
import { KaraokeCaptions } from "../lib/components/captions/KaraokeCaptions";
import { GlowCaptions } from "../lib/components/captions/GlowCaptions";
import { BoxedCaptions } from "../lib/components/captions/BoxedCaptions";
import { HormoziCaptions } from "../lib/components/captions/HormoziCaptions";
import { MinimalCaptions } from "../lib/components/captions/MinimalCaptions";
import { YellowPopCaptions } from "../lib/components/captions/YellowPopCaptions";
import { TypewriterCaptions } from "../lib/components/captions/TypewriterCaptions";
import { BounceCaptions } from "../lib/components/captions/BounceCaptions";
import { GradientHighlightCaptions } from "../lib/components/captions/GradientHighlightCaptions";
import { LuxuryMinimalCaptions } from "../lib/components/captions/LuxuryMinimalCaptions";
import { DEMO_CAPTIONS } from "../lib/components/captions/data";

export type CaptionsShowcaseProps = {
  style:
    | "tiktok"
    | "karaoke"
    | "glow"
    | "boxed"
    | "hormozi"
    | "minimal"
    | "yellow-pop"
    | "typewriter"
    | "bounce"
    | "gradient"
    | "luxury";
};

const BACKGROUNDS: Record<string, string> = {
  tiktok: "linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)",
  karaoke: "linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 100%)",
  glow: "linear-gradient(180deg, #0F0720 0%, #1A0B2E 100%)",
  boxed: "linear-gradient(180deg, #2d3436 0%, #636e72 100%)",
  hormozi: "linear-gradient(180deg, #1a1a2e 0%, #0d0d1a 100%)",
  minimal: "linear-gradient(180deg, #2c3e50 0%, #34495e 100%)",
  "yellow-pop": "linear-gradient(180deg, #0d0d0d 0%, #1a1a1a 100%)",
  typewriter: "linear-gradient(180deg, #0a0a0a 0%, #111111 100%)",
  bounce: "linear-gradient(180deg, #1a1a2e 0%, #2d1b4e 100%)",
  gradient: "linear-gradient(180deg, #0f0f23 0%, #1a1a3e 100%)",
  luxury: "linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)",
};

export const CaptionsShowcase: React.FC<CaptionsShowcaseProps> = ({ style }) => {
  return (
    <AbsoluteFill style={{ background: BACKGROUNDS[style] || "#111" }}>
      {style === "tiktok" && <TikTokCaptions captions={DEMO_CAPTIONS} />}
      {style === "karaoke" && <KaraokeCaptions captions={DEMO_CAPTIONS} />}
      {style === "glow" && <GlowCaptions captions={DEMO_CAPTIONS} />}
      {style === "boxed" && <BoxedCaptions captions={DEMO_CAPTIONS} />}
      {style === "hormozi" && <HormoziCaptions captions={DEMO_CAPTIONS} />}
      {style === "minimal" && <MinimalCaptions captions={DEMO_CAPTIONS} />}
      {style === "yellow-pop" && <YellowPopCaptions captions={DEMO_CAPTIONS} />}
      {style === "typewriter" && <TypewriterCaptions captions={DEMO_CAPTIONS} />}
      {style === "bounce" && <BounceCaptions captions={DEMO_CAPTIONS} />}
      {style === "gradient" && <GradientHighlightCaptions captions={DEMO_CAPTIONS} />}
      {style === "luxury" && <LuxuryMinimalCaptions captions={DEMO_CAPTIONS} />}
    </AbsoluteFill>
  );
};
