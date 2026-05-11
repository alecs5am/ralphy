// Generic composition for the `tutorial-how-to` template.
//
// Hoyos-method 3-step tutorial. Critical pacing rule from
// docs/render-test-2026-05-11.md §1.3: use hard <Series.Sequence> swaps for
// step boundaries (NOT @remotion/transitions gradient blends) AND split each
// step's clip into two sub-cuts via OffthreadVideo startFrom/endAt so the
// scene-cut detector sees ≤2s between cuts.
//
// Layout (1080×1920 @ 30fps):
//   - Hook beat (0-3s)        — single video clip + power-word overlay
//   - Foreshadow beat (3-5s)  — single video clip + result-tease overlay
//   - Step 1 (5-20s)          — clip A split (5-12s + 12-20s) + 1/3 counter chip
//   - Step 2 (20-35s)         — clip B split + 2/3 counter chip
//   - Step 3 (35-50s)         — clip C split + 3/3 counter chip
//   - Payoff (50-60s)         — payoff clip + final-line overlay
//   - VO audio + HormoziCaptions burned across the whole video.

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
import {
  type BaseProps,
  calculateMetadataFromDurationSec,
  normalizeCaptions,
  projectPrefix,
} from "./_shared";

export type TutorialBeat = {
  /** Path under public/project-<slug>/ — typically `videos/<beat>.mp4`. */
  clipPath: string;
  /** Beat length in seconds. */
  durationSec: number;
  /** Optional sub-cut at fraction (0..1) of the clip — splits into two hard sub-cuts. */
  subCutAt?: number;
  /** Overlay text (step label / power word / payoff line). */
  overlay?: string;
  /** Step counter chip ("1/3", "2/3", "3/3") — only on step beats. */
  stepCounter?: string;
};

export type TutorialHowToProps = BaseProps & {
  /** Ordered beats: hook → foreshadow → step1 → step2 → step3 → payoff. */
  beats: TutorialBeat[];
  voPath: string;
  captions: Caption[];
  accentColor?: string;
  captionFontSize?: number;
  /** Optional music bed; -22dB under VO when present. */
  musicPath?: string;
  musicVolume?: number;
};

const OverlayCard: React.FC<{ text: string; counter?: string }> = ({ text, counter }) => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    {/* Step counter chip — top-left, persists the whole beat per template rule */}
    {counter ? (
      <div
        style={{
          position: "absolute",
          top: 280,
          left: 60,
          padding: "12px 24px",
          backgroundColor: "#FFEB3B",
          color: "#000",
          fontFamily: "Inter, sans-serif",
          fontWeight: 900,
          fontSize: 56,
          borderRadius: 18,
          boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
        }}
      >
        {counter}
      </div>
    ) : null}
    {/* Text card — bottom-third, above caption safe-zone (y ≤ 700) */}
    {text ? (
      <div
        style={{
          position: "absolute",
          top: 480,
          left: 60,
          right: 60,
          padding: "20px 28px",
          backgroundColor: "rgba(0,0,0,0.78)",
          color: "#FFEB3B",
          fontFamily: "Inter, sans-serif",
          fontWeight: 800,
          fontSize: 64,
          lineHeight: 1.1,
          textAlign: "left",
          borderRadius: 18,
        }}
      >
        {text}
      </div>
    ) : null}
  </AbsoluteFill>
);

export const TutorialHowTo: React.FC<TutorialHowToProps> = (props) => {
  const { fps } = useVideoConfig();
  const prefix = projectPrefix(props.projectSlug);
  const captions = useMemo(() => normalizeCaptions(props.captions), [props.captions]);

  // Render beats sequentially; each beat optionally splits into two sub-cuts
  // for the pacing target (≤2s between hard cuts).
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill>
        <Series>
          {props.beats.map((beat, i) => {
            const beatFrames = Math.round(beat.durationSec * fps);
            if (beat.subCutAt && beat.subCutAt > 0 && beat.subCutAt < 1) {
              // Two sub-cuts from the same clip — gives the cut-detector two real boundaries
              const cutA = Math.round(beatFrames * beat.subCutAt);
              const cutB = beatFrames - cutA;
              return (
                <Series.Sequence key={`beat-${i}-a`} durationInFrames={beatFrames}>
                  <Series>
                    <Series.Sequence durationInFrames={cutA}>
                      <OffthreadVideo
                        src={staticFile(`${prefix}/${beat.clipPath}`)}
                        endAt={cutA}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        muted
                      />
                    </Series.Sequence>
                    <Series.Sequence durationInFrames={cutB}>
                      <OffthreadVideo
                        src={staticFile(`${prefix}/${beat.clipPath}`)}
                        startFrom={cutA}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        muted
                      />
                    </Series.Sequence>
                  </Series>
                  <OverlayCard text={beat.overlay ?? ""} counter={beat.stepCounter} />
                </Series.Sequence>
              );
            }
            return (
              <Series.Sequence key={`beat-${i}`} durationInFrames={beatFrames}>
                <OffthreadVideo
                  src={staticFile(`${prefix}/${beat.clipPath}`)}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  muted
                />
                <OverlayCard text={beat.overlay ?? ""} counter={beat.stepCounter} />
              </Series.Sequence>
            );
          })}
        </Series>
      </AbsoluteFill>

      {/* VO + optional music bed */}
      <Audio src={staticFile(`${prefix}/${props.voPath}`)} volume={1.0} />
      {props.musicPath ? (
        <Audio
          src={staticFile(`${prefix}/${props.musicPath}`)}
          volume={props.musicVolume ?? 0.12}
        />
      ) : null}

      {/* Captions */}
      <HormoziCaptions
        captions={captions}
        accentColor={props.accentColor ?? "#FFEB3B"}
        fontSize={props.captionFontSize ?? 84}
        combineMs={500}
      />
    </AbsoluteFill>
  );
};

export const TutorialHowToDefaults: TutorialHowToProps = {
  projectSlug: "placeholder",
  durationSec: 60,
  beats: [],
  voPath: "voiceover/vo-primary.mp3",
  captions: [],
  accentColor: "#FFEB3B",
  captionFontSize: 84,
  musicPath: undefined,
  musicVolume: 0.12,
};

export const tutorialHowToCalculateMetadata = calculateMetadataFromDurationSec;
