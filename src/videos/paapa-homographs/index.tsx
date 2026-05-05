import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  staticFile,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", {
  weights: ["600", "700", "800", "900"],
  subsets: ["latin"],
});

// --- Scene data with image URLs (Unsplash/Pexels-style stock photos) ---
const HOMOGRAPHS = [
  {
    id: "scene-01", file: "scene-01-minute.mp3", dur: 1.70,
    word: "Minute",
    left: { img: "https://images.unsplash.com/photo-1501139083538-0139583c060f?w=300&h=300&fit=crop", desc: "/ˈmɪnɪt/" },
    right: { img: "https://images.unsplash.com/photo-1576086213369-97a306d36557?w=300&h=300&fit=crop", desc: "/maɪˈnjuːt/" },
  },
  {
    id: "scene-02", file: "scene-02-bass.mp3", dur: 1.52,
    word: "Bass",
    left: { img: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=300&h=300&fit=crop", desc: "/bæs/" },
    right: { img: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=300&h=300&fit=crop", desc: "/beɪs/" },
  },
  {
    id: "scene-03", file: "scene-03-lead.mp3", dur: 0.86,
    word: "Lead",
    left: { img: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=300&h=300&fit=crop", desc: "/liːd/" },
    right: { img: "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=300&h=300&fit=crop", desc: "/lɛd/" },
  },
  {
    id: "scene-04", file: "scene-04-object.mp3", dur: 2.09,
    word: "Object",
    left: { img: "https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=300&h=300&fit=crop", desc: "/ˈɒbdʒɪkt/" },
    right: { img: "https://images.unsplash.com/photo-1573497019236-17f8177b81e8?w=300&h=300&fit=crop", desc: "/əbˈdʒɛkt/" },
  },
  {
    id: "scene-05", file: "scene-05-bow.mp3", dur: 0.91,
    word: "Bow",
    left: { img: "https://images.unsplash.com/photo-1607344645866-009c320b63e0?w=300&h=300&fit=crop", desc: "/baʊ/" },
    right: { img: "https://images.unsplash.com/photo-1513884923967-4b182ef167ab?w=300&h=300&fit=crop", desc: "/boʊ/" },
  },
  {
    id: "scene-06", file: "scene-06-row.mp3", dur: 0.91,
    word: "Row",
    left: { img: "https://images.unsplash.com/photo-1472745942893-4b9f730c7668?w=300&h=300&fit=crop", desc: "/raʊ/" },
    right: { img: "https://images.unsplash.com/photo-1502680390548-bdbac40cf977?w=300&h=300&fit=crop", desc: "/roʊ/" },
  },
  {
    id: "scene-07", file: "scene-07-content.mp3", dur: 1.99,
    word: "Content",
    left: { img: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=300&h=300&fit=crop", desc: "/ˈkɒntɛnt/" },
    right: { img: "https://images.unsplash.com/photo-1489710437720-ebb67ec84dd2?w=300&h=300&fit=crop", desc: "/kənˈtɛnt/" },
  },
  {
    id: "scene-08", file: "scene-08-tear.mp3", dur: 1.57,
    word: "Tear",
    left: { img: "https://images.unsplash.com/photo-1516585427167-9f4af9627e6c?w=300&h=300&fit=crop", desc: "/tɪər/" },
    right: { img: "https://images.unsplash.com/photo-1586075010923-2dd4570fb338?w=300&h=300&fit=crop", desc: "/tɛər/" },
  },
  {
    id: "scene-09", file: "scene-09-live.mp3", dur: 1.44,
    word: "Live",
    left: { img: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=300&h=300&fit=crop", desc: "/lɪv/" },
    right: { img: "https://images.unsplash.com/photo-1478147427282-58a87a120781?w=300&h=300&fit=crop", desc: "/laɪv/" },
  },
  {
    id: "scene-10", file: "scene-10-close.mp3", dur: 1.67,
    word: "Close",
    left: { img: "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=300&h=300&fit=crop", desc: "/kloʊz/" },
    right: { img: "https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=300&h=300&fit=crop", desc: "/kloʊs/" },
  },
  {
    id: "scene-11", file: "scene-11-wind.mp3", dur: 2.12,
    word: "Wind",
    left: { img: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=300&h=300&fit=crop", desc: "/wɪnd/" },
    right: { img: "https://images.unsplash.com/photo-1495364141860-b0d03eccd065?w=300&h=300&fit=crop", desc: "/waɪnd/" },
  },
];

const SPEECH_SCENES = [
  { id: "scene-12", file: "scene-12-mythbust.mp3", dur: 6.95, lines: [
    { text: "The BIGGEST LIE", highlight: true },
    { text: "about learning English?", highlight: false },
    { text: "That you need more vocabulary.", highlight: false },
    { text: "You DON'T.", highlight: true },
    { text: "You need to start SPEAKING.", highlight: true },
  ]},
  { id: "scene-13", file: "scene-13-question.mp3", dur: 4.62, lines: [
    { text: "Stacy, what advice would you give", highlight: false },
    { text: "to a beginner who wants to", highlight: false },
    { text: "improve their English speaking?", highlight: false },
  ]},
  { id: "scene-14", file: "scene-14-answer.mp3", dur: 4.73, lines: [
    { text: "Just talk to me every day.", highlight: true },
    { text: "Daily practice with AI tutors", highlight: false },
    { text: "works wonders.", highlight: true },
  ]},
  { id: "scene-15", file: "scene-15-pitch.mp3", dur: 3.94, lines: [
    { text: "That's why Fluently works.", highlight: true },
    { text: "It's like a speaking partner", highlight: false },
    { text: "in your pocket. 📱", highlight: false },
  ]},
  { id: "scene-16", file: "scene-16-cta.mp3", dur: 3.29, lines: [
    { text: "Stop learning English.", highlight: true },
    { text: "Start SPEAKING", highlight: true },
    { text: "with Fluently app.", highlight: false },
  ]},
];

const GAP = 0.4;

// --- Homograph Card (matches original layout: 2 photos above the head area) ---
function HomographCard({ data }: { data: typeof HOMOGRAPHS[0] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scaleLeft = spring({ frame, fps, config: { damping: 12, stiffness: 180 } });
  const scaleRight = spring({ frame: Math.max(0, frame - 6), fps, config: { damping: 12, stiffness: 180 } });

  return (
    <AbsoluteFill style={{
      background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
      justifyContent: "flex-start",
      alignItems: "center",
      paddingTop: 200,
    }}>
      {/* Two image cards side by side — like the original */}
      <div style={{ display: "flex", gap: 30, marginBottom: 20 }}>
        {/* Left image */}
        <div style={{ transform: `scale(${scaleLeft})`, textAlign: "center" }}>
          <div style={{
            width: 240, height: 240, borderRadius: 24, overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}>
            <Img src={data.left.img} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        </div>

        {/* Right image */}
        <div style={{ transform: `scale(${scaleRight})`, textAlign: "center" }}>
          <div style={{
            width: 240, height: 240, borderRadius: 24, overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}>
            <Img src={data.right.img} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        </div>
      </div>

      {/* Word labels under each image */}
      <div style={{ display: "flex", gap: 80, alignItems: "flex-start" }}>
        <div style={{ textAlign: "center", transform: `scale(${scaleLeft})` }}>
          <div style={{ fontFamily, fontSize: 56, fontWeight: 900, color: "#FFFFFF" }}>
            {data.word}
          </div>
          <div style={{ fontFamily, fontSize: 22, fontWeight: 600, color: "#94A3B8", marginTop: 4 }}>
            {data.left.desc}
          </div>
        </div>

        <div style={{ textAlign: "center", transform: `scale(${scaleRight})` }}>
          <div style={{ fontFamily, fontSize: 56, fontWeight: 900, color: "#FFFFFF" }}>
            {data.word}
          </div>
          <div style={{ fontFamily, fontSize: 22, fontWeight: 600, color: "#94A3B8", marginTop: 4 }}>
            {data.right.desc}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// --- Myth Bust Scene (scene 12) — Subtitles style like original ---
// White text with yellow keyword highlights, centered bottom, with emojis
function MythBustScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Timed subtitle blocks matching voiceover
  const blocks = [
    { from: 0, to: 40, text: ["The ", { t: "BIGGEST LIE", hl: true }, " about"], emoji: "😱" },
    { from: 40, to: 75, text: ["learning English"], emoji: "🇺🇸" },
    { from: 75, to: 120, text: ["that you need ", { t: "more", hl: true }], extra: "vocabulary 📚" },
    { from: 120, to: 145, text: ["You ", { t: "DON'T", hl: true }, "."] },
    { from: 145, to: 210, text: ["You need to"], extra: [{ t: "start speaking", hl: true }], emoji: "🗣️🇺🇸" },
  ];

  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg, #1a1a2e 0%, #0f172a 100%)" }}>
      {/* Centered subtitle area */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        {blocks.map((block, i) => {
          if (frame < block.from || frame >= block.to) return null;
          const localFrame = frame - block.from;
          const scale = spring({ frame: localFrame, fps, config: { damping: 14, stiffness: 200 } });

          return (
            <div key={i} style={{
              textAlign: "center",
              maxWidth: "85%",
              transform: `scale(${scale})`,
            }}>
              <div style={{ fontFamily, fontSize: 52, fontWeight: 800, lineHeight: 1.3 }}>
                {block.text.map((part, j) => {
                  if (typeof part === "string") {
                    return <span key={j} style={{ color: "#FFFFFF" }}>{part}</span>;
                  }
                  return (
                    <span key={j} style={{
                      color: "#FFD700",
                      textShadow: "0 0 20px rgba(255,215,0,0.4)",
                    }}>{part.t}</span>
                  );
                })}
              </div>
              {block.extra && (
                <div style={{ fontFamily, fontSize: 48, fontWeight: 700, marginTop: 8 }}>
                  {typeof block.extra === "string" ? (
                    <span style={{ color: "#E2E8F0" }}>{block.extra}</span>
                  ) : (
                    block.extra.map((part: any, j: number) => (
                      <span key={j} style={{
                        color: part.hl ? "#00FF88" : "#E2E8F0",
                        textShadow: part.hl ? "0 0 20px rgba(0,255,136,0.4)" : "none",
                      }}>{part.t}</span>
                    ))
                  )}
                </div>
              )}
              {block.emoji && (
                <div style={{ fontSize: 48, marginTop: 12 }}>{block.emoji}</div>
              )}
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// --- App Demo Scene (scene 13-14) — Phone mockup with "Call with Stacy" ---
function AppDemoScene({ lines, isAnswer }: { lines: typeof SPEECH_SCENES[0]["lines"]; isAnswer?: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const phoneSlide = spring({ frame, fps, config: { damping: 15, stiffness: 120 } });
  const phoneX = interpolate(phoneSlide, [0, 1], [-300, 0]);
  const phoneOpacity = interpolate(phoneSlide, [0, 1], [0, 1]);

  // Pulsing glow around avatar
  const pulse = Math.sin(frame * 0.15) * 0.3 + 0.7;

  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)" }}>
      {/* Phone mockup — bottom left, like original */}
      <div style={{
        position: "absolute",
        bottom: 300,
        left: 60,
        transform: `translateX(${phoneX}px)`,
        opacity: phoneOpacity,
      }}>
        {/* Phone frame */}
        <div style={{
          width: 280,
          height: 380,
          background: "linear-gradient(180deg, #1a1040 0%, #0d0a20 100%)",
          borderRadius: 32,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 30px rgba(139,92,246,0.15)",
          border: "2px solid rgba(139,92,246,0.2)",
        }}>
          {/* Avatar with glow */}
          <div style={{
            width: 100, height: 100, borderRadius: 50,
            background: "linear-gradient(135deg, #8B5CF6, #6366F1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 ${20 + pulse * 20}px rgba(139,92,246,${pulse * 0.6})`,
            fontSize: 48,
          }}>
            👩‍💼
          </div>

          {/* Name */}
          <div style={{
            fontFamily, fontSize: 22, fontWeight: 700, color: "#FFFFFF",
            letterSpacing: 0.5,
          }}>
            Call with Stacy
          </div>

          {/* Hang up button */}
          <div style={{
            width: 60, height: 60, borderRadius: 30,
            background: "#EF4444",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 20px rgba(239,68,68,0.4)",
            marginTop: 12,
            fontSize: 28,
          }}>
            📞
          </div>
        </div>
      </div>

      {/* Subtitles — right side / center, with highlights */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", paddingLeft: 40 }}>
        <div style={{ maxWidth: "80%", textAlign: "center" }}>
          {lines.map((line, i) => {
            const delay = i * 8;
            const f = Math.max(0, frame - delay);
            const opacity = interpolate(f, [0, 6], [0, 1], { extrapolateRight: "clamp" });
            const y = interpolate(f, [0, 8], [20, 0], { extrapolateRight: "clamp" });

            // Highlight keywords like original (yellow on key words)
            const parts = highlightKeywords(line.text, isAnswer);

            return (
              <div key={i} style={{
                fontFamily,
                fontSize: 44,
                fontWeight: 700,
                lineHeight: 1.4,
                opacity,
                transform: `translateY(${y}px)`,
              }}>
                {parts}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// Highlight specific keywords yellow like in the original
function highlightKeywords(text: string, isAnswer?: boolean) {
  const keywords = isAnswer
    ? ["every day", "Daily practice", "AI tutors", "works wonders"]
    : ["advice", "beginner", "improve", "English", "speaking"];

  const result: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    let earliestMatch = -1;
    let matchedKeyword = "";

    for (const kw of keywords) {
      const idx = remaining.toLowerCase().indexOf(kw.toLowerCase());
      if (idx !== -1 && (earliestMatch === -1 || idx < earliestMatch)) {
        earliestMatch = idx;
        matchedKeyword = kw;
      }
    }

    if (earliestMatch === -1) {
      result.push(<span key={`r-${keyIdx++}`} style={{ color: "#FFFFFF" }}>{remaining}</span>);
      break;
    }

    if (earliestMatch > 0) {
      result.push(<span key={`r-${keyIdx++}`} style={{ color: "#FFFFFF" }}>{remaining.substring(0, earliestMatch)}</span>);
    }
    result.push(
      <span key={`h-${keyIdx++}`} style={{ color: "#FFD700" }}>
        {remaining.substring(earliestMatch, earliestMatch + matchedKeyword.length)}
      </span>
    );
    remaining = remaining.substring(earliestMatch + matchedKeyword.length);
  }

  return result;
}

// --- Pitch Scene (scene 15) ---
function PitchScene({ lines }: { lines: typeof SPEECH_SCENES[0]["lines"] }) {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{
      justifyContent: "center", alignItems: "center",
      background: "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)",
    }}>
      <div style={{ maxWidth: "85%", textAlign: "center" }}>
        {lines.map((line, i) => {
          const delay = i * 8;
          const f = Math.max(0, frame - delay);
          const opacity = interpolate(f, [0, 6], [0, 1], { extrapolateRight: "clamp" });
          const y = interpolate(f, [0, 8], [20, 0], { extrapolateRight: "clamp" });

          return (
            <div key={i} style={{
              fontFamily,
              fontSize: line.highlight ? 56 : 46,
              fontWeight: line.highlight ? 900 : 600,
              color: line.highlight ? "#10B981" : "#E2E8F0",
              lineHeight: 1.4,
              opacity,
              transform: `translateY(${y}px)`,
              textShadow: line.highlight ? "0 0 30px rgba(16,185,129,0.3)" : "none",
            }}>
              {line.text}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

// --- CTA Scene (scene 16) ---
function CTAScene({ lines }: { lines: typeof SPEECH_SCENES[0]["lines"] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame: Math.max(0, frame - 20), fps, config: { damping: 10, stiffness: 150 } });

  return (
    <AbsoluteFill style={{
      justifyContent: "center", alignItems: "center",
      background: "linear-gradient(180deg, #1E1B4B 0%, #0f172a 100%)",
    }}>
      <div style={{ textAlign: "center" }}>
        {lines.map((line, i) => {
          const delay = i * 10;
          const f = Math.max(0, frame - delay);
          const scale = spring({ frame: f, fps, config: { damping: 12, stiffness: 180 } });

          return (
            <div key={i} style={{
              fontFamily,
              fontSize: line.highlight ? 64 : 48,
              fontWeight: line.highlight ? 900 : 700,
              color: line.highlight ? "#F59E0B" : "#E2E8F0",
              lineHeight: 1.3,
              transform: `scale(${scale})`,
              textShadow: line.highlight ? "0 0 40px rgba(245,158,11,0.4)" : "none",
            }}>
              {line.text}
            </div>
          );
        })}

        {/* App logo / download prompt */}
        <div style={{
          marginTop: 40,
          transform: `scale(${logoScale})`,
          opacity: logoScale,
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 12,
            background: "linear-gradient(135deg, #4F46E5, #7C3AED)",
            padding: "16px 32px",
            borderRadius: 20,
            boxShadow: "0 8px 32px rgba(79,70,229,0.4)",
          }}>
            <span style={{ fontSize: 32 }}>📱</span>
            <span style={{ fontFamily, fontSize: 28, fontWeight: 800, color: "#FFFFFF" }}>
              Fluently Max
            </span>
          </div>
          <div style={{ fontFamily, fontSize: 20, color: "#94A3B8", marginTop: 12 }}>
            Download now — Free
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// --- Main Composition ---
export const PaapaHomographs: React.FC = () => {
  const { fps } = useVideoConfig();

  let currentFrame = 0;
  const sequences: Array<{ from: number; dur: number; type: "homograph" | "speech"; idx: number }> = [];

  for (let i = 0; i < HOMOGRAPHS.length; i++) {
    const frames = Math.ceil((HOMOGRAPHS[i].dur + GAP) * fps);
    sequences.push({ from: currentFrame, dur: frames, type: "homograph", idx: i });
    currentFrame += frames;
  }

  for (let i = 0; i < SPEECH_SCENES.length; i++) {
    const frames = Math.ceil((SPEECH_SCENES[i].dur + GAP) * fps);
    sequences.push({ from: currentFrame, dur: frames, type: "speech", idx: i });
    currentFrame += frames;
  }

  return (
    <AbsoluteFill style={{ background: "#0f172a" }}>
      {/* Homograph scenes */}
      {sequences.filter(s => s.type === "homograph").map((seq) => {
        const h = HOMOGRAPHS[seq.idx];
        return (
          <Sequence key={h.id} from={seq.from} durationInFrames={seq.dur}>
            <HomographCard data={h} />
            <Audio src={staticFile(`paapa-homographs/voiceover/${h.file}`)} />
          </Sequence>
        );
      })}

      {/* Scene 12: Myth bust — custom subtitled scene */}
      {sequences.filter(s => s.type === "speech" && SPEECH_SCENES[s.idx].id === "scene-12").map((seq) => {
        const s = SPEECH_SCENES[seq.idx];
        return (
          <Sequence key={s.id} from={seq.from} durationInFrames={seq.dur}>
            <MythBustScene />
            <Audio src={staticFile(`paapa-homographs/voiceover/${s.file}`)} />
          </Sequence>
        );
      })}

      {/* Scene 13: App demo — question */}
      {sequences.filter(s => s.type === "speech" && SPEECH_SCENES[s.idx].id === "scene-13").map((seq) => {
        const s = SPEECH_SCENES[seq.idx];
        return (
          <Sequence key={s.id} from={seq.from} durationInFrames={seq.dur}>
            <AppDemoScene lines={s.lines} />
            <Audio src={staticFile(`paapa-homographs/voiceover/${s.file}`)} />
          </Sequence>
        );
      })}

      {/* Scene 14: App demo — answer */}
      {sequences.filter(s => s.type === "speech" && SPEECH_SCENES[s.idx].id === "scene-14").map((seq) => {
        const s = SPEECH_SCENES[seq.idx];
        return (
          <Sequence key={s.id} from={seq.from} durationInFrames={seq.dur}>
            <AppDemoScene lines={s.lines} isAnswer />
            <Audio src={staticFile(`paapa-homographs/voiceover/${s.file}`)} />
          </Sequence>
        );
      })}

      {/* Scene 15: Pitch */}
      {sequences.filter(s => s.type === "speech" && SPEECH_SCENES[s.idx].id === "scene-15").map((seq) => {
        const s = SPEECH_SCENES[seq.idx];
        return (
          <Sequence key={s.id} from={seq.from} durationInFrames={seq.dur}>
            <PitchScene lines={s.lines} />
            <Audio src={staticFile(`paapa-homographs/voiceover/${s.file}`)} />
          </Sequence>
        );
      })}

      {/* Scene 16: CTA */}
      {sequences.filter(s => s.type === "speech" && SPEECH_SCENES[s.idx].id === "scene-16").map((seq) => {
        const s = SPEECH_SCENES[seq.idx];
        return (
          <Sequence key={s.id} from={seq.from} durationInFrames={seq.dur}>
            <CTAScene lines={s.lines} />
            <Audio src={staticFile(`paapa-homographs/voiceover/${s.file}`)} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
