import "./index.css";
import { Composition, Folder } from "remotion";
import { CaptionsShowcase } from "./showcase/CaptionsShowcase";
import { PaapaHomographs } from "./videos/paapa-homographs";
import { LyadovEpisode } from "./videos/lyadov-podcast";
import { SolutionsMetal001, TOTAL_FRAMES as SOLUTIONS_METAL_FRAMES } from "./videos/solutions-metal-001";
import { SovietEngineer001, TOTAL_FRAMES as SOVIET_ENGINEER_FRAMES } from "./videos/soviet-engineer-001";
import { BrainrotHistory001, TOTAL_FRAMES as BRAINROT_HISTORY_FRAMES } from "./videos/brainrot-history-001";
import { BrainrotYT001, TOTAL_FRAMES as BRAINROT_YT_FRAMES } from "./videos/brainrot-yt-001";
import { TestGrwmYT001, TOTAL_FRAMES as TEST_GRWM_YT_FRAMES } from "./videos/test-grwm-yt-001";
import { TestTutorialYT001, TOTAL_FRAMES as TEST_TUTORIAL_YT_FRAMES } from "./videos/test-tutorial-yt-001";
import { PodcastClip001, TOTAL_FRAMES as PODCAST_CLIP_FRAMES } from "./videos/test-podcast-yt-001";
import { GingerRecreate001, TOTAL_FRAMES as GINGER_RECREATE_FRAMES } from "./videos/ginger-recreate-001";
import { GlitterCream001, TOTAL_FRAMES as GLITTER_CREAM_FRAMES } from "./videos/glitter-cream-001";
import { FruitDrama001, TOTAL_FRAMES as FRUIT_DRAMA_FRAMES } from "./videos/fruit-drama-001";
import { NothingHP1001, TOTAL_FRAMES as NOTHING_HP1_FRAMES } from "./videos/nothing-hp1-001";
import {
  FlipperHyperMotion001,
  TOTAL_FRAMES as FLIPPER_HYPER_MOTION_FRAMES,
} from "./videos/flipper-hypermotion-001";
import {
  PlaydatePixel001,
  TOTAL_FRAMES as PLAYDATE_PIXEL_FRAMES,
} from "./videos/playdate-pixel-001";
import {
  AppstoreTakeaminute001,
  TOTAL_FRAMES as APPSTORE_TAKEAMINUTE_FRAMES,
} from "./videos/appstore-takeaminute-001";
import { OccultMockumentary001, TOTAL_FRAMES as OCCULT_MOCK_FRAMES } from "./videos/occult-mockumentary-001";
import { VenomDeodorant001, TOTAL_FRAMES as VENOM_DEODORANT_FRAMES } from "./videos/venom-deodorant-001";
import { VenomBodywash001, TOTAL_FRAMES as VENOM_BODYWASH_FRAMES } from "./videos/venom-bodywash-001";
import {
  TokyoY2k001,
  TokyoY2k001Wide,
  TOTAL_FRAMES as TOKYO_Y2K_FRAMES,
  FPS as TOKYO_Y2K_FPS,
} from "./videos/tokyo-y2k-001";
import {
  AnalogHorrorFridge001,
  AnalogHorrorFridge001Noisy,
  AnalogHorrorFridge001Mobius,
  AnalogHorrorFridge001GlitchX,
  AnalogHorrorFridge001GlitchXFull,
  TOTAL_FRAMES as ANALOG_HORROR_FRIDGE_FRAMES,
} from "./videos/analog-horror-fridge-001";
import {
  BrainrotAIMeme,
  BrainrotAIMemeDefaults,
  brainrotMemeCalculateMetadata,
} from "./lib/templates/BrainrotAIMeme";
import { AiAvatar, AiAvatarDefaults, aiAvatarCalculateMetadata } from "./lib/templates/AiAvatar";
import {
  TutorialHowTo,
  TutorialHowToDefaults,
  tutorialHowToCalculateMetadata,
} from "./lib/templates/TutorialHowTo";
import { Grwm, GrwmDefaults, grwmCalculateMetadata } from "./lib/templates/Grwm";
import {
  PodcastClip,
  PodcastClipDefaults,
  podcastClipCalculateMetadata,
} from "./lib/templates/PodcastClip";

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

      <Folder name="Templates">
        {/*
         * Generic, parameterized compositions — one per Top-20 template kind.
         * Render any brainrot project via:
         *   ralphy render <project>     (reads composition-props.json which sets compositionId)
         * The composition-props.json supplies projectSlug + paths + duration; the
         * composition serves every project of this template without per-project edits.
         */}
        <Composition
          id="BrainrotAIMeme"
          component={BrainrotAIMeme}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={BrainrotAIMemeDefaults}
          calculateMetadata={brainrotMemeCalculateMetadata}
        />
        <Composition
          id="AiAvatar"
          component={AiAvatar}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={AiAvatarDefaults}
          calculateMetadata={aiAvatarCalculateMetadata}
        />
        <Composition
          id="TutorialHowTo"
          component={TutorialHowTo}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={TutorialHowToDefaults}
          calculateMetadata={tutorialHowToCalculateMetadata}
        />
        <Composition
          id="Grwm"
          component={Grwm}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={GrwmDefaults}
          calculateMetadata={grwmCalculateMetadata}
        />
        <Composition
          id="PodcastClip"
          component={PodcastClip}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={PodcastClipDefaults}
          calculateMetadata={podcastClipCalculateMetadata}
        />
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
        <Composition
          id="BrainrotYT001"
          component={BrainrotYT001}
          durationInFrames={BRAINROT_YT_FRAMES}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="TestGrwmYT001"
          component={TestGrwmYT001}
          durationInFrames={TEST_GRWM_YT_FRAMES}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="TestTutorialYT001"
          component={TestTutorialYT001}
          durationInFrames={TEST_TUTORIAL_YT_FRAMES}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="PodcastClip001"
          component={PodcastClip001}
          durationInFrames={PODCAST_CLIP_FRAMES}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{
            cutSrc: "",
            captions: [],
            titleLine1: "",
            titleLine2: "",
          }}
        />
        <Composition
          id="GingerRecreate001"
          component={GingerRecreate001}
          durationInFrames={GINGER_RECREATE_FRAMES}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="GlitterCream001"
          component={GlitterCream001}
          durationInFrames={GLITTER_CREAM_FRAMES}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="FruitDrama001"
          component={FruitDrama001}
          durationInFrames={FRUIT_DRAMA_FRAMES}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="NothingHP1001"
          component={NothingHP1001}
          durationInFrames={NOTHING_HP1_FRAMES}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="FlipperHyperMotion001"
          component={FlipperHyperMotion001}
          durationInFrames={FLIPPER_HYPER_MOTION_FRAMES}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="PlaydatePixel001"
          component={PlaydatePixel001}
          durationInFrames={PLAYDATE_PIXEL_FRAMES}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="AppstoreTakeaminute001"
          component={AppstoreTakeaminute001}
          durationInFrames={APPSTORE_TAKEAMINUTE_FRAMES}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="OccultMockumentary001"
          component={OccultMockumentary001}
          durationInFrames={OCCULT_MOCK_FRAMES}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="VenomDeodorant001"
          component={VenomDeodorant001}
          durationInFrames={VENOM_DEODORANT_FRAMES}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="VenomBodywash001"
          component={VenomBodywash001}
          durationInFrames={VENOM_BODYWASH_FRAMES}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="TokyoY2k001"
          component={TokyoY2k001}
          durationInFrames={TOKYO_Y2K_FRAMES}
          fps={TOKYO_Y2K_FPS}
          width={1080}
          height={1920}
        />
        <Composition
          id="TokyoY2k001Wide"
          component={TokyoY2k001Wide}
          durationInFrames={TOKYO_Y2K_FRAMES}
          fps={TOKYO_Y2K_FPS}
          width={1920}
          height={1080}
        />
        <Composition
          id="AnalogHorrorFridge001"
          component={AnalogHorrorFridge001}
          durationInFrames={ANALOG_HORROR_FRIDGE_FRAMES}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="AnalogHorrorFridge001Noisy"
          component={AnalogHorrorFridge001Noisy}
          durationInFrames={ANALOG_HORROR_FRIDGE_FRAMES}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="AnalogHorrorFridge001Mobius"
          component={AnalogHorrorFridge001Mobius}
          durationInFrames={ANALOG_HORROR_FRIDGE_FRAMES}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="AnalogHorrorFridge001GlitchX"
          component={AnalogHorrorFridge001GlitchX}
          durationInFrames={ANALOG_HORROR_FRIDGE_FRAMES}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="AnalogHorrorFridge001GlitchXFull"
          component={AnalogHorrorFridge001GlitchXFull}
          durationInFrames={ANALOG_HORROR_FRIDGE_FRAMES}
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
