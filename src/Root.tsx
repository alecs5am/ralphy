import "./index.css";
import { Composition, Folder } from "remotion";
import { CaptionsShowcase } from "./showcase/CaptionsShowcase";
import { PaapaHomographs } from "./videos/paapa-homographs";
import { LyadovEpisode } from "./videos/lyadov-podcast";
import { SolutionsMetal001, TOTAL_FRAMES as SOLUTIONS_METAL_FRAMES } from "./videos/solutions-metal-001";
import { SovietEngineer001, TOTAL_FRAMES as SOVIET_ENGINEER_FRAMES } from "./videos/soviet-engineer-001";
import { BrainrotHistory001, TOTAL_FRAMES as BRAINROT_HISTORY_FRAMES } from "./videos/brainrot-history-001";

const CAPTION_STYLES = [
  { id: "TikTokCaptions", style: "tiktok" as const, label: "TikTok — green word highlight" },
  { id: "KaraokeCaptions", style: "karaoke" as const, label: "Karaoke — one word, colored box" },
  { id: "GlowCaptions", style: "glow" as const, label: "Glow — neon pulse" },
  { id: "BoxedCaptions", style: "boxed" as const, label: "Boxed — word pills" },
  { id: "HormoziCaptions", style: "hormozi" as const, label: "Hormozi — giant bold uppercase" },
  { id: "MinimalCaptions", style: "minimal" as const, label: "Minimal — clean blur bg" },
  { id: "YellowPopCaptions", style: "yellow-pop" as const, label: "Yellow Pop — podcast style" },
  { id: "TypewriterCaptions", style: "typewriter" as const, label: "Typewriter — character by character" },
  { id: "BounceCaptions", style: "bounce" as const, label: "Bounce — staggered colorful" },
  { id: "GradientHighlightCaptions", style: "gradient" as const, label: "Gradient — fill wipe" },
  { id: "LuxuryMinimalCaptions", style: "luxury" as const, label: "Luxury Minimal — weight shift" },
] as const;

const LYADOV_EPISODES = [
  { ep: "01", frames: 1213 },
  { ep: "02", frames: 1215 },
  { ep: "03", frames: 1253 },
  { ep: "04", frames: 1075 },
  { ep: "05", frames: 1070 },
  { ep: "06", frames: 1277 },
  { ep: "07", frames: 1223 },
  { ep: "08", frames: 945 },
  { ep: "09", frames: 1160 },
  { ep: "10", frames: 1180 },
];

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="Library">
        <Folder name="Captions">
          {CAPTION_STYLES.map(({ id, style }) => (
            <Composition
              key={id}
              id={id}
              component={CaptionsShowcase}
              durationInFrames={270}
              fps={30}
              width={1080}
              height={1920}
              defaultProps={{ style }}
            />
          ))}
        </Folder>
      </Folder>

      <Folder name="Videos">
        <Composition
          id="PaapaHomographs"
          component={PaapaHomographs}
          durationInFrames={1350}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="SolutionsMetal001"
          component={SolutionsMetal001}
          durationInFrames={SOLUTIONS_METAL_FRAMES}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="SovietEngineer001"
          component={SovietEngineer001}
          durationInFrames={SOVIET_ENGINEER_FRAMES}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="BrainrotHistory001"
          component={BrainrotHistory001}
          durationInFrames={BRAINROT_HISTORY_FRAMES}
          fps={30}
          width={1080}
          height={1920}
        />
        <Folder name="LyadovPodcast">
          {LYADOV_EPISODES.map(({ ep, frames }) => (
            <Composition
              key={ep}
              id={`LyadovPodcast-EP${ep}`}
              component={LyadovEpisode}
              durationInFrames={frames}
              fps={30}
              width={1080}
              height={1920}
              defaultProps={{ episode: ep }}
            />
          ))}
        </Folder>
      </Folder>
    </>
  );
};
