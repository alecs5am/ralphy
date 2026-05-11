// Generic composition for the `podcast-clip` template.
//
// Repurposes a 16:9 (or arbitrary aspect) long-form podcast cut into a 9:16
// TikTok-ready clip. Smart-crop reframes the source by following the detected
// speaker face(s) — no letterbox bars. Title-banner reveals at 0-2s, fades
// out; karaoke captions burn across the bottom third. Optional music bed at
// low gain duck behind the speaker.
//
// Layout (1080×1920 @ 30fps):
//   - SmartReframe layer — re-projects the source video via virtual camera
//     using face-bboxes.json (produced by `ralphy video smart-crop`).
//   - Title banner — top 12% of frame, slides in 0-0.4s, holds to 2.0s, fades.
//   - KaraokeCaptions — bottom 18%, word-by-word fill.
//   - Optional music bed at low gain.

import { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Caption } from "@remotion/captions";
import type { FrameBboxes } from "../utils/smart-crop";
import { SmartReframe } from "../components/layouts/SmartReframe";
import { KaraokeCaptions } from "../components/captions/KaraokeCaptions";
import {
  type BaseProps,
  calculateMetadataFromDurationSec,
  normalizeCaptions,
  projectPrefix,
} from "./_shared";

export type PodcastClipProps = BaseProps & {
  /** Cut source video relative to project assets. Typically the output of `ralphy video extract-segment`. */
  cutPath: string;
  /** Source dimensions (typically 1920×1080 for a 16:9 YouTube source). */
  sourceWidth: number;
  sourceHeight: number;
  sourceFps?: number;
  /** Face bboxes from `ralphy video smart-crop`. Empty array falls back to center-crop. */
  bboxes: FrameBboxes[];
  /** Word-level captions from ElevenLabs Scribe. */
  captions: Caption[];
  /** Title banner top line — "hook quote" pulled from the picker. */
  titleLine1?: string;
  /** Title banner bottom line — usually shorter / context. */
  titleLine2?: string;
  /** Optional music bed path. */
  musicPath?: string;
  /** Music bed volume — only audible during the banner reveal (auto-ducked). Default 0.18. */
  musicVolume?: number;
};

const TitleBanner: React.FC<{ line1?: string; line2?: string }> = ({ line1, line2 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // 0-0.4s slide-in, 0.4-2.0s hold, 2.0-2.4s fade
  const slide = spring({ frame, fps, config: { damping: 12, stiffness: 100, mass: 0.6 } });
  const fade = interpolate(frame, [fps * 2.0, fps * 2.4], [1, 0], { extrapolateRight: "clamp" });
  const opacity = Math.min(slide, fade);
  const ty = (1 - slide) * -120;
  return (
    <div
      style={{
        position: "absolute",
        top: 230,
        left: 60,
        right: 60,
        padding: "24px 32px",
        backgroundColor: "rgba(0,0,0,0.78)",
        borderRadius: 22,
        transform: `translateY(${ty}px)`,
        opacity,
        fontFamily: "Inter, sans-serif",
      }}
    >
      {line1 ? (
        <div style={{ color: "#FFEB3B", fontWeight: 800, fontSize: 64, lineHeight: 1.1 }}>
          {line1}
        </div>
      ) : null}
      {line2 ? (
        <div style={{ color: "#fff", fontWeight: 600, fontSize: 44, lineHeight: 1.2, marginTop: 8 }}>
          {line2}
        </div>
      ) : null}
    </div>
  );
};

export const PodcastClip: React.FC<PodcastClipProps> = (props) => {
  const { fps } = useVideoConfig();
  const prefix = projectPrefix(props.projectSlug);
  const captions = useMemo(() => normalizeCaptions(props.captions), [props.captions]);

  const bannerEnd = Math.round(fps * 2.4);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Smart-reframe / center-crop fallback */}
      <SmartReframe
        src={staticFile(`${prefix}/${props.cutPath}`)}
        bboxes={props.bboxes}
        source={{ width: props.sourceWidth, height: props.sourceHeight }}
        sourceFps={props.sourceFps ?? 30}
      />

      {/* Title banner — only visible 0-2.4s */}
      {(props.titleLine1 || props.titleLine2) ? (
        <Sequence from={0} durationInFrames={bannerEnd}>
          <TitleBanner line1={props.titleLine1} line2={props.titleLine2} />
        </Sequence>
      ) : null}

      {/* Karaoke captions across the bottom third */}
      <KaraokeCaptions captions={captions} />

      {/* Optional music bed — primarily during the banner reveal, low gain throughout */}
      {props.musicPath ? (
        <Audio src={staticFile(`${prefix}/${props.musicPath}`)} volume={props.musicVolume ?? 0.18} />
      ) : null}
    </AbsoluteFill>
  );
};

export const PodcastClipDefaults: PodcastClipProps = {
  projectSlug: "placeholder",
  durationSec: 45,
  cutPath: "cuts/cut-01.mp4",
  sourceWidth: 1920,
  sourceHeight: 1080,
  sourceFps: 30,
  bboxes: [],
  captions: [],
  titleLine1: "",
  titleLine2: "",
  musicPath: undefined,
  musicVolume: 0.18,
};

export const podcastClipCalculateMetadata = calculateMetadataFromDurationSec;
