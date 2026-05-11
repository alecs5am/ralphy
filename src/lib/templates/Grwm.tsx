// Generic composition for the `grwm` template (Get Ready With Me + storytime).
//
// The format's load-bearing signature is jump-cut tempo: 6-10 short clips of
// the same persona doing different beats of a routine. Character consistency
// across cuts comes from generating every kling clip with the same persona
// keyframe as `--first-frame`; that's a CLI concern, not a composition concern.
//
// Layout (1080×1920 @ 30fps):
//   - Full-frame video track — sequence of N short clips (typically 4-6s
//     each). Each clip is a different beat of the skincare / makeup / outfit
//     routine, all featuring the same persona.
//   - Storytime VO (ElevenLabs) carries the narrative layer across all cuts.
//   - YellowPop or Hormozi captions overlay (default yellow-pop for the
//     creator/lifestyle tone).
//   - Optional music bed; off by default (VO carries).

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
import { YellowPopCaptions } from "../components/captions/YellowPopCaptions";
import { HormoziCaptions } from "../components/captions/HormoziCaptions";
import {
  type BaseProps,
  calculateMetadataFromDurationSec,
  normalizeCaptions,
  projectPrefix,
} from "./_shared";

export type GrwmProps = BaseProps & {
  /** Routine beat clips — 6-10 short clips of the same persona doing different routine steps. */
  beats: string[];
  /** VO (storytime narration). */
  voPath: string;
  /** Word-level captions. */
  captions: Caption[];
  /** Caption style. Default yellow-pop for creator tone; hormozi for harder edge. */
  captionStyle?: "yellow-pop" | "hormozi";
  /** Hormozi accent color (only when style=hormozi). Default yellow. */
  accentColor?: string;
  /** Optional music bed path. */
  musicPath?: string;
  /** Music bed volume 0..1. Default 0.10 (low; VO is primary). */
  musicVolume?: number;
  /** Per-clip native audio volume — usually 0 (kling clips are silent / room-tone). */
  clipVolume?: number;
};

export const Grwm: React.FC<GrwmProps> = (props) => {
  const { durationInFrames } = useVideoConfig();
  const prefix = projectPrefix(props.projectSlug);
  const captions = useMemo(() => normalizeCaptions(props.captions), [props.captions]);

  const beatFrames = props.beats.length > 0
    ? Math.floor(durationInFrames / props.beats.length)
    : durationInFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill>
        {props.beats.length > 0 ? (
          <Series>
            {props.beats.map((clipPath, i) => (
              <Series.Sequence
                key={`beat-${i}`}
                durationInFrames={
                  i === props.beats.length - 1
                    ? durationInFrames - beatFrames * (props.beats.length - 1)
                    : beatFrames
                }
              >
                <OffthreadVideo
                  src={staticFile(`${prefix}/${clipPath}`)}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  volume={props.clipVolume ?? 0}
                />
              </Series.Sequence>
            ))}
          </Series>
        ) : null}
      </AbsoluteFill>

      {/* Storytime VO */}
      <Audio src={staticFile(`${prefix}/${props.voPath}`)} volume={1.0} />

      {/* Optional music bed */}
      {props.musicPath ? (
        <Audio
          src={staticFile(`${prefix}/${props.musicPath}`)}
          volume={props.musicVolume ?? 0.10}
        />
      ) : null}

      {/* Captions */}
      {props.captionStyle === "hormozi" ? (
        <HormoziCaptions
          captions={captions}
          accentColor={props.accentColor ?? "#FFEB3B"}
          fontSize={84}
          combineMs={500}
        />
      ) : (
        <YellowPopCaptions captions={captions} />
      )}
    </AbsoluteFill>
  );
};

export const GrwmDefaults: GrwmProps = {
  projectSlug: "placeholder",
  durationSec: 45,
  beats: [],
  voPath: "voiceover/vo-primary.mp3",
  captions: [],
  captionStyle: "yellow-pop",
  accentColor: "#FFEB3B",
  musicPath: undefined,
  musicVolume: 0.10,
  clipVolume: 0,
};

export const grwmCalculateMetadata = calculateMetadataFromDurationSec;
