// Generic Remotion composition for the `brainrot-ai-meme` template.
//
// One composition serves every brainrot project — all paths and counts come
// from props supplied by `composition-props.json`. Adding a new brainrot
// project = scaffolding a props file, never editing this component.
//
// Layout (1080×1920 @ 30fps):
//   - Top half (1080×960 anchored y=0):
//       DEFAULT  — Sequence of N short clips, equally split across duration.
//                  All clips share the same visual style (locked grammar in
//                  the prompts that generated them). Cuts are hard.
//       FALLBACK — Single static image with subtle Ken Burns. Used when
//                  topClips is empty / undefined.
//   - Bottom half (1080×960 anchored y=960):
//       Looped gameplay video at low gain (volume 0.08).
//   - Caption layer on the seam — HormoziCaptions or red-shake variant.
//   - VO audio at full gain.
//   - No on-screen AI-disclosure overlay (template default).
//
// Duration comes from `durationFrames` prop (computed via calculateMetadata
// by the Root.tsx registration, sourced from `durationSec` × fps).

import { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Loop,
  OffthreadVideo,
  Series,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Caption } from "@remotion/captions";
import { HormoziCaptions } from "../components/captions/HormoziCaptions";

export type BrainrotAIMemeProps = {
  /** Project slug — used as the staticFile() prefix. e.g. "test-brainrot-yt-001" → paths resolve under public/project-test-brainrot-yt-001/ */
  projectSlug: string;
  /** Total render duration in seconds. */
  durationSec: number;
  /** VO audio file path relative to project assets (e.g. "voiceover/vo-primary.mp3"). */
  voPath: string;
  /** Word-level caption tokens from Scribe / whisper. Pass directly — no per-project ESM wrapper needed. */
  captions: Caption[];
  /** Bottom-half gameplay loop video, relative to project assets (e.g. "uploaded/gameplay-loop.mp4"). */
  gameplayLoop: string;
  /** Native loop length in seconds — used for Remotion's <Loop> math. */
  gameplayLoopSec: number;
  /**
   * DEFAULT top-half mode — array of 3-5 short clip paths (relative to project assets),
   * each played in sequence across the full duration, equal split. Empty/undefined
   * falls back to topImage with Ken Burns.
   */
  topClips?: string[];
  /** FALLBACK — single static image path. Only used when topClips is empty. */
  topImage?: string;
  /** Caption accent color. Default yellow `#FFEB3B`. */
  accentColor?: string;
  /** Caption font size (px). Default 84. */
  captionFontSize?: number;
  /** Caption combine window in ms (groups tokens into phrases). Default 500. */
  captionCombineMs?: number;
  /** Bottom-half loop volume 0..1. Default 0.08 (low gain — diegetic SFX, doesn't fight VO). */
  gameplayVolume?: number;
};

// `compositionId` is read by render.ts off the props file (top-level field) but
// not used by the React component. Treat as opaque — it lives next to props
// because the same JSON serves both `--composition` and `--props`.

const FPS = 30;

const KenBurnsImage: React.FC<{ src: string; totalFrames: number }> = ({ src, totalFrames }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, totalFrames], [1.0, 1.06], { extrapolateRight: "clamp" });
  const tx = interpolate(frame, [0, totalFrames], [-10, 10], { extrapolateRight: "clamp" });
  return (
    <Img
      src={staticFile(src)}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        transform: `scale(${scale}) translateX(${tx}px)`,
      }}
    />
  );
};

export const BrainrotAIMeme: React.FC<BrainrotAIMemeProps> = (props) => {
  const { fps, durationInFrames } = useVideoConfig();
  const projectPrefix = `project-${props.projectSlug}`;

  // Normalize captions — Scribe v1 word tokens have no leading whitespace; HormoziCaptions
  // concatenates inline, so prepend a space to every non-first token.
  const captions = useMemo(
    () =>
      props.captions.map((c, i) =>
        i === 0 ? c : { ...c, text: c.text.startsWith(" ") ? c.text : ` ${c.text}` },
      ),
    [props.captions],
  );

  // Top half: multi-clip sequence (DEFAULT) or static image (FALLBACK).
  const hasTopClips = props.topClips && props.topClips.length > 0;
  const topClipFrames = hasTopClips ? Math.floor(durationInFrames / props.topClips!.length) : 0;
  const gameplayLoopFrames = Math.max(1, Math.floor(props.gameplayLoopSec * fps));

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Top half — 1080×960 anchored y=0 */}
      <AbsoluteFill style={{ height: 960, top: 0, overflow: "hidden" }}>
        {hasTopClips ? (
          <Series>
            {props.topClips!.map((clipPath, i) => (
              <Series.Sequence
                key={`top-${i}`}
                durationInFrames={
                  // Last clip absorbs any rounding remainder so the series
                  // exactly fills durationInFrames.
                  i === props.topClips!.length - 1
                    ? durationInFrames - topClipFrames * (props.topClips!.length - 1)
                    : topClipFrames
                }
              >
                <OffthreadVideo
                  src={staticFile(`${projectPrefix}/${clipPath}`)}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  muted
                />
              </Series.Sequence>
            ))}
          </Series>
        ) : props.topImage ? (
          <KenBurnsImage
            src={`${projectPrefix}/${props.topImage}`}
            totalFrames={durationInFrames}
          />
        ) : null}
      </AbsoluteFill>

      {/* Bottom half — 1080×960 anchored y=960 (gameplay loop) */}
      <AbsoluteFill style={{ top: 960, height: 960, overflow: "hidden" }}>
        <Loop durationInFrames={gameplayLoopFrames}>
          <OffthreadVideo
            src={staticFile(`${projectPrefix}/${props.gameplayLoop}`)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            volume={props.gameplayVolume ?? 0.08}
          />
        </Loop>
      </AbsoluteFill>

      {/* Captions on the seam */}
      <HormoziCaptions
        captions={captions}
        accentColor={props.accentColor ?? "#FFEB3B"}
        fontSize={props.captionFontSize ?? 84}
        combineMs={props.captionCombineMs ?? 500}
      />

      {/* VO */}
      <Audio src={staticFile(`${projectPrefix}/${props.voPath}`)} volume={1.0} />
    </AbsoluteFill>
  );
};

/**
 * Default props for the Composition registration. `ralphy template use brainrot-ai-meme`
 * writes a `composition-props.json` that overrides these with project-specific paths.
 */
export const BrainrotAIMemeDefaults: BrainrotAIMemeProps = {
  projectSlug: "placeholder",
  durationSec: 45,
  voPath: "voiceover/vo-primary.mp3",
  captions: [],
  gameplayLoop: "uploaded/gameplay-loop.mp4",
  gameplayLoopSec: 56,
  topClips: [],
  topImage: undefined,
  accentColor: "#FFEB3B",
  captionFontSize: 84,
  captionCombineMs: 500,
  gameplayVolume: 0.08,
};

/** Used by Root.tsx `calculateMetadata` to derive `durationInFrames` from `durationSec` in the props. */
export function brainrotMemeCalculateMetadata({ props }: { props: BrainrotAIMemeProps }) {
  return {
    durationInFrames: Math.max(1, Math.round((props.durationSec ?? 45) * FPS)),
  };
}
