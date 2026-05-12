import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  staticFile,
  interpolate,
  useCurrentFrame,
  spring,
  useVideoConfig,
} from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadCaveat } from "@remotion/google-fonts/Caveat";

const { fontFamily: INTER } = loadInter();
const { fontFamily: CAVEAT } = loadCaveat();

export const FPS = 30;
const SCENE_FRAMES = FPS;
const SCENE_COUNT = 14;
export const TOTAL_FRAMES = SCENE_FRAMES * SCENE_COUNT;

const P = "project-ginger-recreate-001";
const vid = (n: string) => `${P}/assets/videos/scene-${n}-anim.mp4`;
const AUDIO = `${P}/assets/original-audio.mp3`;

type WordStyle = "bold" | "italic";

type CardSpec = {
  word: string;
  emoji?: string;
  wordStyle?: WordStyle;
};

type Scene =
  | { id: string; kind: "video"; asset: string }
  | { id: string; kind: "card";  card: CardSpec };

const SCENES: Scene[] = [
  { id: "01", kind: "video", asset: vid("01") },
  { id: "02", kind: "card",  card: { word: "официально", emoji: "🤌", wordStyle: "bold" } },
  { id: "03", kind: "video", asset: vid("03") },
  { id: "04", kind: "video", asset: vid("04") },
  { id: "05", kind: "card",  card: { word: "не добиться", emoji: "💝", wordStyle: "bold" } },
  { id: "06", kind: "video", asset: vid("06") },
  { id: "07", kind: "video", asset: vid("07") },
  { id: "08", kind: "video", asset: vid("08") },
  { id: "09", kind: "card",  card: { word: "жизнь", emoji: "🤍", wordStyle: "bold" } },
  { id: "10", kind: "video", asset: vid("10") },
  { id: "11", kind: "video", asset: vid("11") },
  { id: "12", kind: "video", asset: vid("12") },
  { id: "13", kind: "video", asset: vid("13") },
  { id: "14", kind: "video", asset: vid("14") },
];

// Word-level transcript from captions.json (offsets in ms).
// Style is hand-tuned: bold for emphasis hooks, italic for soft/contextual.
type Word = {
  text: string;
  display?: string;     // override on-screen text (e.g. censor)
  startMs: number;
  endMs: number;
  style: WordStyle;
  size?: "xl" | "l" | "m";  // optional size hint
};

const WORDS: Word[] = [
  { text: "Я",                    startMs: 59,    endMs: 199,   style: "bold",   size: "xl" },
  { text: "официально",           startMs: 539,   endMs: 1120,  style: "bold" },
  { text: "разрешаю",             startMs: 1379,  endMs: 1919,  style: "italic" },
  { text: "себе",                 startMs: 1979,  endMs: 2319,  style: "italic" },
  { text: "нихуя",  display: "НИХ*Я", startMs: 2919, endMs: 3339, style: "bold", size: "xl" },
  { text: "в этой жизни",         startMs: 3379,  endMs: 3959,  style: "italic", size: "m" },
  { text: "не",                   startMs: 4139,  endMs: 4239,  style: "bold" },
  { text: "добиться,",            startMs: 4279,  endMs: 4779,  style: "bold" },
  { text: "прожить",              startMs: 5359,  endMs: 5799,  style: "bold" },
  { text: "обычную",              startMs: 5900,  endMs: 6299,  style: "bold" },
  { text: "среднестатистическую", startMs: 6339,  endMs: 7539,  style: "italic", size: "m" },
  { text: "жизнь",                startMs: 7859,  endMs: 8179,  style: "bold" },
  { text: "и",                    startMs: 8859,  endMs: 9019,  style: "italic" },
  { text: "радоваться,",          startMs: 9479,  endMs: 10059, style: "italic" },
  { text: "просто радоваться",    startMs: 10859, endMs: 11659, style: "italic" },
  { text: "тому что живешь",      startMs: 11719, endMs: 12479, style: "italic", size: "m" },
  { text: "Всё!",                 startMs: 13179, endMs: 13559, style: "bold",   size: "xl" },
];

const CARD_SCENE_INDICES = SCENES.flatMap((s, i) => (s.kind === "card" ? [i] : []));
const isCardFrame = (frame: number): boolean => {
  const sceneIdx = Math.floor(frame / SCENE_FRAMES);
  return CARD_SCENE_INDICES.includes(sceneIdx);
};

export const GingerRecreate001: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Audio src={staticFile(AUDIO)} volume={1} />

      {SCENES.map((scene, i) => (
        <Sequence
          key={scene.id}
          from={i * SCENE_FRAMES}
          durationInFrames={SCENE_FRAMES}
          layout="none"
        >
          <SceneShot scene={scene} />
        </Sequence>
      ))}

      {/* Global word-pop overlay synced to VO timing — suppressed during card scenes */}
      <WordPopLayer />
    </AbsoluteFill>
  );
};

const SceneShot: React.FC<{ scene: Scene }> = ({ scene }) => {
  if (scene.kind === "video") {
    return (
      <AbsoluteFill>
        <OffthreadVideo
          src={staticFile(scene.asset)}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
    );
  }
  return <TextCard spec={scene.card} />;
};

const TextCard: React.FC<{ spec: CardSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();

  // Subtle paper grain via CSS — no keyframe needed.
  // Soft pop-in for word + emoji.
  const wordOpacity = interpolate(frame, [0, 4], [0, 1], { extrapolateRight: "clamp" });
  const wordScale = spring({ frame, fps: FPS, durationInFrames: 14, config: { damping: 12 } });
  const emojiOpacity = interpolate(frame, [4, 8], [0, 1], { extrapolateRight: "clamp" });
  const emojiScale = spring({ frame: Math.max(0, frame - 4), fps: FPS, durationInFrames: 14, config: { damping: 11 } });

  const isBold = (spec.wordStyle ?? "bold") === "bold";

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at 30% 25%, #f7f2ea 0%, #ece5d8 60%, #ddd3c1 100%)",
      }}
    >
      {/* faint paper grain via two layered shadows */}
      <AbsoluteFill
        style={{
          background:
            "repeating-linear-gradient(45deg, rgba(0,0,0,0.012) 0 2px, rgba(255,255,255,0.012) 2px 4px)",
          mixBlendMode: "multiply",
        }}
      />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          gap: 18,
          padding: "0 80px",
        }}
      >
        <div
          style={{
            fontFamily: isBold ? INTER : CAVEAT,
            fontWeight: isBold ? 900 : 600,
            fontStyle: "normal",
            fontSize: isBold ? 132 : 184,
            color: "#3b2e2a",
            letterSpacing: isBold ? -2 : 0,
            lineHeight: 1.0,
            textAlign: "center",
            opacity: wordOpacity,
            transform: `scale(${0.9 + wordScale * 0.1})`,
            transformOrigin: "center",
          }}
        >
          {spec.word}
        </div>
        {spec.emoji ? (
          <div
            style={{
              fontSize: 130,
              lineHeight: 1.0,
              marginTop: 6,
              opacity: emojiOpacity,
              transform: `scale(${0.7 + emojiScale * 0.3})`,
              transformOrigin: "center",
              textAlign: "center",
            }}
          >
            {spec.emoji}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const WordPopLayer: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tMs = (frame / fps) * 1000;

  if (isCardFrame(frame)) return null;

  // Active word: the word whose VO range contains the current time,
  // OR the most recently spoken word within a short hold window after endMs.
  const HOLD_MS = 220;
  const FADE_OUT_MS = 180;

  // Find the latest word that has started before now
  let active: Word | null = null;
  for (const w of WORDS) {
    if (w.startMs <= tMs) active = w;
    else break;
  }
  if (!active) return null;
  if (tMs > active.endMs + HOLD_MS + FADE_OUT_MS) return null;

  const inMs = tMs - active.startMs;            // ms since word started
  const tailMs = tMs - active.endMs;            // ms since word ended (negative while speaking)

  // Fade-in: 0 → 1 over first 120ms.
  const fadeIn = Math.min(1, Math.max(0, inMs / 120));
  // Fade-out: starts after HOLD_MS past endMs, lasts FADE_OUT_MS
  const fadeOut =
    tailMs <= HOLD_MS
      ? 1
      : Math.max(0, 1 - (tailMs - HOLD_MS) / FADE_OUT_MS);
  const opacity = fadeIn * fadeOut;
  if (opacity <= 0.001) return null;

  // Pop-scale: 0.88 → 1.04 over first 6 frames (~200ms) then settle to 1.
  const wordFrame = Math.max(0, (frame - (active.startMs / 1000) * fps));
  const popScale = interpolate(wordFrame, [0, 4, 10], [0.88, 1.06, 1.0], {
    extrapolateRight: "clamp",
  });

  const display = active.display ?? active.text;
  const isBold = active.style === "bold";
  const size = active.size ?? "l";
  // Caveat reads visually smaller than Inter at equal px — bump cursive sizes by ~40%.
  const fontSize = isBold
    ? size === "xl" ? 168 : size === "m" ? 82 : 116
    : size === "xl" ? 230 : size === "m" ? 120 : 164;

  const styleObj: React.CSSProperties = isBold
    ? {
        fontFamily: INTER,
        fontWeight: 900,
        fontStyle: "normal",
        fontSize,
        color: "#ffffff",
        letterSpacing: -2,
        lineHeight: 1.0,
        textShadow:
          "0 4px 32px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.45)",
        textAlign: "center",
      }
    : {
        fontFamily: CAVEAT,
        fontWeight: 600,
        fontStyle: "normal",
        fontSize,
        color: "#ffffff",
        letterSpacing: 0,
        lineHeight: 1.0,
        textShadow:
          "0 3px 26px rgba(0,0,0,0.65), 0 1px 4px rgba(0,0,0,0.55)",
        textAlign: "center",
      };

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        padding: "0 80px",
        opacity,
        transform: `scale(${popScale})`,
      }}
    >
      <div style={styleObj}>{display}</div>
    </AbsoluteFill>
  );
};
