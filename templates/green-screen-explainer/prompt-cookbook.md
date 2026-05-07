# Prompt cookbook — green-screen-explainer

Concrete recipes for the keyframe, the Remotion composition, the pointer / circle animation, the zoom cadence, the VO, the captions, and the music bed. Plus six common mistakes and four worked examples (news / Reddit / chart / meme).

> The "green-screen" in this template is **not** a chroma-key trick. It's a Remotion composition: the user-supplied backdrop image fills the frame, and the creator video is matte-cropped (or chroma-keyed if shot against green) and positioned at bottom-right. Everything in this cookbook assumes that layout.

---

## Master prompt template (creator keyframe)

For `gemini-3-pro-image-preview` via `ralphy generate image`. The keyframe is the still that `kling-v3.0-pro` animates into the talking-head clip.

```
A [creator persona description] standing against a plain neutral mid-grey background,
shot from chest up, 9:16 vertical, looking off-camera to the right and pointing
with their right hand toward something off-frame, [tone] expression on face
([outraged: furrowed brow, mouth slightly open] / [calm-explain: relaxed face, eyebrows neutral]
 / [curious: head tilted, slight smile] / [sarcastic: one eyebrow raised, half-smile]).
Casual lighting, soft key from camera-left. Hand and arm in sharp focus —
this is the gesture frame. Background is intentionally plain so it crops cleanly
to a matte. No text, no logos, no graphics in the image. Photorealistic,
shot on iPhone aesthetic. Frame the creator so there is room at top and left
for the matte composition (creator should occupy bottom-right one-third
of the final 1080x1920 frame).
```

**Multi-ref:** if a recurring creator persona is in play, attach the user-supplied creator photo as a reference. The `gemini-3-pro-image-preview` multi-ref keeps face / hair / clothing consistent across the batch.

**Why neutral background:** the keyframe is composited onto the user's backdrop. A busy or matching-color background bleeds through the matte and breaks the illusion.

---

## Composition design (Remotion layout)

The composition is two layers and a few overlays:

```tsx
<AbsoluteFill>
  {/* Layer 1: backdrop, full bleed */}
  <Img src={staticFile(backdropSrc)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />

  {/* Layer 2: creator video, matte-cropped, bottom-right ~1/3 */}
  <AbsoluteFill style={{
    pointerEvents: "none",
    transform: `translate(${creatorX}%, ${creatorY}%) scale(${creatorScale})`,
    transformOrigin: "bottom right",
  }}>
    <Video
      src={staticFile(creatorClipSrc)}
      style={{
        width: "40%",          // ~1/3 of frame width
        position: "absolute",
        bottom: 80,
        right: 40,
        clipPath: "inset(0 round 24px)",  // soft-edge crop; or a chroma-key shader
        filter: "drop-shadow(0 4px 24px rgba(0,0,0,0.35))",
      }}
      muted
    />
  </AbsoluteFill>

  {/* Overlay: spring-in circle / arrow on backdrop region */}
  <Sequence from={ANNOTATION_START} durationInFrames={ANNOTATION_DURATION}>
    <CircleAnnotation x={annotation.x} y={annotation.y} r={annotation.r} />
  </Sequence>

  {/* Overlay: captions ABOVE creator */}
  <Sequence from={0}>
    <MinimalCaptions captions={captions} positionY="55%" />
  </Sequence>

  {/* VO + optional music bed */}
  <Audio src={staticFile(voSrc)} volume={1.0} />
  {musicSrc && <Audio src={staticFile(musicSrc)} volume={0.15} />}
</AbsoluteFill>
```

**Layout numbers (locked):**

| Element | Position | Size |
|---|---|---|
| Backdrop | full frame, `object-fit: cover` | 1080×1920 |
| Creator clip | bottom-right, 40px right margin, 80px bottom margin | 40% width (~432px), aspect-preserved |
| Circle / arrow annotation | over the relevant backdrop region | radius 80-160px |
| Captions | centered horizontally, vertical position ~55% | font ~52-64px |

**Why 40% / bottom-right:** Drew Afualo and most green-screen creators land here empirically. Bottom-right keeps the creator out of the natural reading order (top-left → bottom-right), so the viewer reads the backdrop first, then notices the creator's reaction. Smaller than 40% loses the face; larger covers backdrop.

---

## Pointer / circle animation

Use a Remotion spring for the annotation entrance — fast, then settle.

```tsx
const CircleAnnotation: React.FC<{ x: number; y: number; r: number }> = ({ x, y, r }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame, fps, config: { damping: 12, stiffness: 180 } });
  const opacity = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: "clamp" });

  return (
    <svg style={{ position: "absolute", inset: 0, opacity }} viewBox="0 0 1080 1920">
      <circle
        cx={x} cy={y}
        r={r * scale}
        fill="none"
        stroke="#ff3b30"
        strokeWidth={8}
        strokeDasharray="0 0"
        style={{ filter: "drop-shadow(0 0 12px rgba(255,59,48,0.6))" }}
      />
    </svg>
  );
};
```

**Cadence:** annotation enters when the VO references the highlighted region — usually 1-2s after the zoom-in lands. Holds for 2-3s then fades. Don't leave annotations on screen the whole video; they lose meaning.

**Arrow variant:** swap `<circle>` for an `<path>` arrow with the same spring on the path's `pathLength`.

---

## Zoom-in cadence (pull-zoom on backdrop)

The zoom is on the backdrop layer only — the creator stays put (or scales inversely so they don't grow).

```tsx
// Pull-zoom: backdrop scales 1.0 → 1.4 over 18 frames, hold 90 frames, scale back 1.4 → 1.0.
const backdropScale = interpolate(
  frame,
  [zoomIn, zoomIn + 18, zoomOut - 18, zoomOut],
  [1.0, 1.4, 1.4, 1.0],
  { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
);

// Optional: pan to the region of interest while zoomed.
const backdropX = interpolate(
  frame,
  [zoomIn, zoomIn + 18],
  [0, regionOffsetX],
  { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
);
```

**Cadence options:**

| Variant | Timing | Use when |
|---|---|---|
| None | no zoom | calm-explain on a chart that's already legible |
| Once-mid | one zoom at ~50% of clip | default — single key passage to highlight |
| Twice | zooms at ~30% and ~70% | longer videos (35-45s) with two punchlines |

**Pacing rule:** zoom every 8-12s, never more often. Faster zooms feel jittery; slower loses energy.

**Creator scaling during zoom:** keep creator at constant on-screen size. If you scale the backdrop 1.4×, multiply the creator's transform by 1/1.4 — otherwise the creator visually shrinks under the zoomed backdrop and the layout breaks.

---

## VO direction (ElevenLabs)

Single-pass `eleven_multilingual_v2` call. Voice settings tuned per tone:

| Tone | Stability | Similarity | Style | Notes |
|---|---|---|---|---|
| Calm-explain | 0.55 | 0.75 | 0.20 | Slow articulation, news-anchor energy |
| Outraged | 0.30 | 0.70 | 0.65 | Higher style for emotional swings |
| Curious | 0.45 | 0.75 | 0.40 | Slight upward inflections |
| Sarcastic | 0.40 | 0.72 | 0.55 | Drier, slower than outraged |
| Amused | 0.45 | 0.75 | 0.50 | Smile in the voice — pick a voice that supports it |

**Direction in the script:** for outraged or sarcastic takes, write `[laughs]`, `[sighs]`, `[scoffs]` inline — ElevenLabs renders these and they're load-bearing for the format. Calm-explain should stay clean.

**Pacing:** 150-170 wpm for calm-explain, 180-200 wpm for outraged / curious. Don't go faster — captions stop being readable above 200 wpm at 9:16.

---

## Captions (whisper-1 + burn-in)

`MinimalCaptions` for calm-explain / curious. `KaraokeCaptions` for outraged / sarcastic / amused (the word-level highlighting reinforces the rhythm).

Position **above** the creator — vertical position 55% of frame (so the bottom 45% is the creator + backdrop bottom, and the captions sit just above the creator's head).

```tsx
<MinimalCaptions captions={captions} positionY="55%" maxWidthPct={85} />
```

**Captions must not cover the backdrop region the VO is referring to.** If a zoom-in lands on the top-half of the backdrop, captions at 55% are fine. If a zoom lands on the bottom-half (where captions sit), bump captions to 35% for that sequence.

---

## Music bed (optional)

Single ElevenLabs Music call, low-volume bed. Volume 0.15 (~ -16 to -20 dB under VO).

Skip music entirely on:
- News-commentary takes (music undermines authority).
- Outraged takes where the VO is the whole show.

Use music on:
- Curious / amused / cultural-meme takes — the bed adds momentum.

Music should be instrumental, mid-tempo, no melodic peaks that compete with VO syllables.

---

## Six common mistakes

1. **Backdrop too small to read.** Especially text-heavy backdrops (long DMs, dense articles). Crop the backdrop to the relevant excerpt before importing — don't try to fix it with a zoom alone. If the user supplied a 4000-word article and the relevant quote is two lines, crop to the quote.
2. **No zoom-in on a long take.** Anything over 20s without a zoom feels static. Always at least one zoom unless the format is calm-explain on a single-stat chart.
3. **Creator off to the corner not visible.** If the creator is too small (< 30% width) or pushed off-frame by the keyframe pose, the personality side of the double-weave dies. Re-prompt the keyframe with explicit framing instructions.
4. **Pointer / gesture missing in first 2s.** Without the pointing gesture, the viewer doesn't know to read the backdrop — they look at the creator and miss the source. The keyframe MUST have a clear point/gesture.
5. **Captions covering the backdrop.** Captions positioned at 80%+ of frame height end up over the creator's mouth or the bottom of the backdrop. Lock captions to ~55%.
6. **AI-fabricated backdrop.** Generating a fake "screenshot" of a real news headline, fake Reddit post, or fake chart violates AGENTS.md hard rule #3 and is also a disinformation risk. The user-supplied backdrop is a hard requirement, not a suggestion. Refuse if not supplied.

---

## Worked examples

### Example A — News commentary (outraged)

- **Backdrop:** screenshot of a Bloomberg article, masthead + headline + first paragraph cropped to fit 9:16 readably.
- **Hook:** "I cannot believe what I just read."
- **Tone:** outraged.
- **Length:** 35s.
- **Zoom cadence:** twice — once on the headline (5-12s), once on a specific quote in paragraph 1 (22-30s).
- **Annotation:** red circle around the dollar figure in the headline at 8s; second circle around a key quote at 25s.
- **VO direction:** ElevenLabs outraged settings, `[scoffs]` after the first zoom-in.
- **Captions:** KaraokeCaptions, positioned at 55%.
- **Music:** none.

### Example B — Reddit screenshot reaction (sarcastic)

- **Backdrop:** screenshot of an r/AmItheAsshole post, title + first paragraph + score visible.
- **Hook:** "Wait, what?"
- **Tone:** sarcastic.
- **Length:** 28s.
- **Zoom cadence:** once-mid (12-22s), zooming on the most absurd line.
- **Annotation:** circle around the absurd line during the zoom.
- **VO direction:** ElevenLabs sarcastic settings, `[laughs]` at 18s.
- **Captions:** KaraokeCaptions, 55%.
- **Music:** light bed at 0.15, skipped during the zoom.

### Example C — Chart explainer (calm-explain, finance)

- **Backdrop:** chart image (e.g. a stock-price chart with a clear move) — user-supplied or pulled from a public source with a credible attribution visible.
- **Hook:** "[Stat] — and here's why that's significant."
- **Tone:** calm-explain.
- **Length:** 40s.
- **Zoom cadence:** once-mid, zooming on the inflection point of the chart.
- **Annotation:** arrow pointing at the inflection point with a small label rendered as a Remotion text overlay.
- **VO direction:** ElevenLabs calm-explain settings, slow pacing (~155 wpm).
- **Captions:** MinimalCaptions, 55%.
- **Music:** none. Calm-explain on finance reads as more credible without a bed.

### Example D — Meme breakdown (amused, cultural moment)

- **Backdrop:** meme image (user-supplied — copyright-cleared or the user owns it).
- **Hook:** "So this is what we're doing now."
- **Tone:** amused.
- **Length:** 22s.
- **Zoom cadence:** once-mid, on the joke element of the meme.
- **Annotation:** circle on the joke element with a slight wobble (use `Math.sin(frame / 4) * 4` on the rotation).
- **VO direction:** ElevenLabs amused settings, voice with a smile.
- **Captions:** KaraokeCaptions, 55%.
- **Music:** light bed at 0.15 throughout.

---

## CLI cookbook (the only allowed commands)

```bash
# 1. Log the user-supplied backdrop as a reference asset.
ralphy project log-asset <project-id> --path workspace/projects/<id>/assets/uploaded/backdrop.png --kind reference

# 2. Generate the creator keyframe.
ralphy generate image --project <project-id> --slot scene-01-keyframe --prompt-file workspace/projects/<id>/prompts/keyframe.txt

# 3. Animate the keyframe to a talking-head clip.
ralphy generate video --project <project-id> --slot scene-01-clip --image scene-01-keyframe --duration 10

# 4. Voiceover.
ralphy generate voiceover --project <project-id> --slot vo-main --script-file workspace/projects/<id>/scripts/main.txt --tone outraged

# 5. (Optional) Music bed.
ralphy generate music --project <project-id> --slot music-bed --duration 30 --vibe instrumental-mid-tempo

# 6. Render.
ralphy render <project-id>
```

Never reach for `bunx tsx`, `curl`, or raw `ffmpeg` — see AGENTS.md hard rule #2. If a step you need isn't covered by `ralphy`, propose adding the verb and stop.
