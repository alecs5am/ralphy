// Generic composition for the `ai-avatar` template.
//
// Layout (1080×1920 @ 30fps):
//   - Full-frame video track — sequence of N chained veo-3.1-fast clips
//     (each 6-8s; veo's cap). The persona keyframe is the same across
//     every clip so the avatar stays consistent.
//   - Optional B-roll cutaways layered in between via the cutaways prop.
//   - VO audio at full gain (ElevenLabs `eleven_multilingual_v2`).
//   - Captions burned in — HormoziCaptions for punchy ad reads, or the
//     minimal style for educational tone (default).
//   - No on-screen AI-disclosure overlay (template default).

import { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Series,
  staticFile,
  useVideoConfig,
} from "remotion";
import type { Caption } from "@remotion/captions";
import { HormoziCaptions } from "../components/captions/HormoziCaptions";
import { MinimalCaptions } from "../components/captions/MinimalCaptions";
import {
  type BaseProps,
  calculateMetadataFromDurationSec,
  normalizeCaptions,
  projectPrefix,
} from "./_shared";

export type AiAvatarProps = BaseProps & {
  /** Avatar talking-head video clips, in order. Each is a veo-3.1-fast 6-8s render with the persona keyframe. */
  avatarClips: string[];
  /** VO audio (ElevenLabs). Mixed at full gain over the silent avatar video. */
  voPath: string;
  /** Word-level captions (Scribe / whisper). */
  captions: Caption[];
  /**
   * Optional B-roll cutaways inserted in between avatar clips. Pass as
   * `[{ atSec: 25, durationSec: 3, path: "videos/scene-broll-01.mp4" }]`. Empty
   * array (default) renders talking-head only.
   */
  cutaways?: Array<{ atSec: number; durationSec: number; path: string }>;
  /** Caption style. Default minimal (educational tone); hormozi for e-commerce hard sell. */
  captionStyle?: "minimal" | "hormozi";
  /** Hormozi accent color. Default yellow `#FFEB3B`. Ignored when style="minimal". */
  accentColor?: string;
  /** Avatar clip volume — set 0 if model-native audio drifts on non-EN langs (default 0). */
  avatarVolume?: number;
};

export const AiAvatar: React.FC<AiAvatarProps> = (props) => {
  const { fps, durationInFrames } = useVideoConfig();
  const prefix = projectPrefix(props.projectSlug);
  const captions = useMemo(() => normalizeCaptions(props.captions), [props.captions]);

  // Avatar clips fill the full duration. If their summed length doesn't match
  // durationInFrames, the last clip stretches/clamps via Series math.
  const clipFrames = props.avatarClips.length > 0
    ? Math.floor(durationInFrames / props.avatarClips.length)
    : durationInFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Avatar track — full frame */}
      <AbsoluteFill>
        {props.avatarClips.length > 0 ? (
          <Series>
            {props.avatarClips.map((clipPath, i) => (
              <Series.Sequence
                key={`avatar-${i}`}
                durationInFrames={
                  i === props.avatarClips.length - 1
                    ? durationInFrames - clipFrames * (props.avatarClips.length - 1)
                    : clipFrames
                }
              >
                <OffthreadVideo
                  src={staticFile(`${prefix}/${clipPath}`)}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  volume={props.avatarVolume ?? 0}
                />
              </Series.Sequence>
            ))}
          </Series>
        ) : null}
      </AbsoluteFill>

      {/* B-roll cutaways layered on top — when active, cover the avatar */}
      {(props.cutaways ?? []).map((cut, i) => {
        const startFrame = Math.round(cut.atSec * fps);
        const cutDurFrames = Math.round(cut.durationSec * fps);
        return (
          <AbsoluteFill
            key={`cutaway-${i}`}
            style={{
              display: "none",
              animationName: `cut-${i}`,
              animationDuration: `${durationInFrames / fps}s`,
            }}
          >
            <Series>
              <Series.Sequence durationInFrames={startFrame} layout="none">
                <></>
              </Series.Sequence>
              <Series.Sequence durationInFrames={cutDurFrames}>
                <OffthreadVideo
                  src={staticFile(`${prefix}/${cut.path}`)}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  muted
                />
              </Series.Sequence>
            </Series>
          </AbsoluteFill>
        );
      })}

      {/* VO — primary audio carries the whole video */}
      <Audio src={staticFile(`${prefix}/${props.voPath}`)} volume={1.0} />

      {/* Captions */}
      {props.captionStyle === "hormozi" ? (
        <HormoziCaptions
          captions={captions}
          accentColor={props.accentColor ?? "#FFEB3B"}
          fontSize={84}
          combineMs={500}
        />
      ) : (
        <MinimalCaptions captions={captions} />
      )}
    </AbsoluteFill>
  );
};

export const AiAvatarDefaults: AiAvatarProps = {
  projectSlug: "placeholder",
  durationSec: 60,
  avatarClips: [],
  voPath: "voiceover/vo-primary.mp3",
  captions: [],
  cutaways: [],
  captionStyle: "minimal",
  accentColor: "#FFEB3B",
  avatarVolume: 0,
};

export const aiAvatarCalculateMetadata = calculateMetadataFromDurationSec;
