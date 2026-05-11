# Prompt cookbook — Podcast Clip

The full mechanics of turning a long-form source into 1-4 viral cuts. Read this end-to-end before composing your first clip; the cut discipline and caption-sync rules are not improvisable.

---

## Master template (the pipeline as one mental model)

```
[ source long-form mp4/url ]
        │
        ▼  ralphy ref pull
[ workspace/refs/<slug>/source.mp4 ]
        │
        ▼  ralphy ref transcribe   (ElevenLabs Scribe v1)
[ transcript.json — word-level ts ]
        │
        ▼  find-viral-moments.ts   (Gemini-2.5-flash on transcript + frames)
[ moments.json — 4-8 candidates with hook quotes ]
        │
        ▼  ralphy video extract-segment   (lossless, snap-to-words)
[ clips/cut-NN.mp4 — 9:16-reframable source crop ]
        │
        ▼  Remotion compose
        │     • smart-crop reframe (face-tracker pan)
        │     • karaoke captions (word-level from transcript)
        │     • title-banner overlay (top 12%, hook quote)
        │     • optional B-roll insert
        │     • optional music bed (-18dB, banner only)
        │
        ▼  ralphy render
[ out/cut-NN.mp4 — 1080×1920 @ 30fps ]
```

Six stages, all `ralphy`-driven. Never reach for `yt-dlp` / `ffmpeg` / `curl` directly — the gen-log, asset manifest, and word-snap discipline depend on every step going through the CLI.

---

## Title-banner design (Remotion overlay spec)

Position: **top 12% of frame** (y: 0 → 230 on a 1920-tall canvas; banner sits at y: 60-230).
Width: full frame, 1080px.
Font: **Inter Bold 70px** by default. Hormozi-yellow style uses Inter Black instead.
Color matrix:

| Style | Background | Text | Drop-shadow | Notes |
|---|---|---|---|---|
| Hormozi-yellow | #FFD500 solid | #000000 | 4px / 8px blur, 50% opacity | All-caps optional. Most viral-coded. |
| Quote-card | #FFFFFF solid | #000000 Playfair Display Bold 55-60px | None | Attribution line in 30px gray italic below. |
| Minimal-white | 60% black gradient bar | #FFFFFF Inter Bold 60-65px | 2px / 4px blur, 60% opacity | Cleanest; blends with most source colors. |

Animation:

```ts
// Remotion pseudocode
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';

const frame = useCurrentFrame();
const { fps } = useVideoConfig();

// Slide-in: 0.4s
const slide = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 12 });

// Hold: 1.6s (frames 12-60)
// Fade-out: 0.4s (frames 60-72)
const fadeFrame = Math.max(0, frame - 60);
const opacity = interpolate(fadeFrame, [0, 12], [1, 0], { extrapolateRight: 'clamp' });

const translateY = interpolate(slide, [0, 1], [-100, 0]); // px
```

Hold can extend to 3.0s for the "wait for it..." cliffhanger pattern (#11 in `hooks.md`).

Copy rules (also see `hooks.md`): max 2 lines, max 60 chars, no "?" endings, no "amazing / incredible / you won't believe", specificity over intensity.

---

## Karaoke caption design (word-by-word fill)

Position: **bottom 18% of frame** (y: 1574 → 1920 on a 1920-tall canvas; captions sit at y: 1620-1820).
Font: **Inter Bold 50px**, white #FFFFFF.
Drop-shadow: 3px / 6px blur, 70% opacity, near-black.
Line layout: **2 lines max**, centered, max 28 chars per line.

Source: ElevenLabs Scribe v1 word-level timestamps in `workspace/refs/<slug>/transcript.json`:

```json
[
  { "word": "I", "start": 12.412, "end": 12.519 },
  { "word": "lost", "start": 12.520, "end": 12.781 },
  { "word": "forty", "start": 12.782, "end": 13.014 },
  ...
]
```

Per word: while `currentTime ∈ [start, end]`, render that word with **active style** (yellow #FFD500 fill, 1.05× scale). All other words in white. Past words remain white (not greyed-out — greyed words read as "subtitles" not "captions").

```ts
const isActive = currentSec >= word.start && currentSec <= word.end;
const isPast = currentSec > word.end;
const color = isActive ? '#FFD500' : '#FFFFFF';
const scale = isActive ? 1.05 : 1.0;
```

Group words into 2-line "phrases" of 4-7 words each. New phrase appears every ~1.5-2.5s; old phrase crossfades out 100ms before. Don't cram more than ~14 chars into one rendered moment — phones can't read it.

For Hormozi-impact captions: same logic but Inter Black 65px all-caps, yellow active word, larger 5px drop-shadow, 1 line max. For TikTok-white captions: smaller 38px, 3 lines allowed, no active-color highlight (white throughout), pulses scale only.

---

## Smart-crop reframe (single-speaker tracker)

The source is 16:9 (1920×1080 typically). The output is 9:16 (1080×1920). The middle 23% of the source horizontally fills the output — but that 23% must follow the speaker's face, not stay static.

Pipeline (`src/lib/utils/smart-crop.ts`):

1. **Sample frames** at 4-8fps from the cut clip.
2. **Detect face bbox** per frame (mediapipe or equivalent). For multi-speaker frames, pick the largest bbox or the one nearest to the speaker-diarization label from the transcript.
3. **Smooth the x-center trajectory** with a 0.4s moving average — raw bbox jitter at 30fps causes visible shake.
4. **Constrain to source bounds**: `x ∈ [crop_w/2, source_w - crop_w/2]`.
5. **Output the crop as a per-frame `translateX` offset** to a Remotion `<OffthreadVideo>` scaled to fit-height.

Smoothing is critical. A jittery crop is the #1 viewer-noticeable defect; viewers can't articulate why the clip "feels off" but it cuts retention by ~15%.

For 2-speaker debates / hot exchanges:

- Run face detection. If 2 distinct faces are stably present for >60% of the clip, switch to **vertical split-screen**: top half is speaker A's face crop, bottom half is speaker B's. Both crops smart-cropped within their half.
- Use transcript speaker-diarization to highlight which half is currently speaking (subtle 1.02× scale on the active speaker, 0.95× brightness on the muted speaker).

For static-center fallback (rare): only when the source is already vertical or single-shot static, OR when smart-crop detection confidence is below 0.6 across the whole clip. Use the source's native horizontal center.

---

## Cut discipline (this is the load-bearing rule)

The ONE rule: **cuts snap to word boundaries from the transcript, with 30-200ms padding either side.**

Defaults: 150ms before the first word, 100ms after the last word.

Why padding asymmetric: human ear tolerates a slightly long lead-in (feels natural — speaker about to say something). It does NOT tolerate a clipped tail (reads as "the video glitched"). Bias the padding toward the tail being safe.

What the snap looks like:

```bash
# Picker says: moment is from 12:34.080 to 13:08.510
# Transcript shows the nearest word boundaries:
#   word at 12:34.412 → 12:34.519  ("I")
#   word at 13:08.215 → 13:08.450  ("fine.")
# Snap: start = 12:34.412 - 0.15s = 12:34.262
#       end   = 13:08.450 + 0.10s = 13:08.550

ralphy video extract-segment <ref-slug> \
  --start 00:12:34.262 \
  --end   00:13:08.550 \
  --pad-before 0.0 \    # already applied above
  --pad-after  0.0 \
  --snap-to-words workspace/refs/<ref-slug>/transcript.json \
  --out workspace/projects/<id>/clips/cut-01.mp4
```

The `--snap-to-words` flag tells `extract-segment` to round each timestamp to the nearest word boundary in the transcript. With it, you can pass approximate timestamps and it auto-snaps. Without it, you must compute the snap manually as above.

This rule is restated and enforced in [`docs/playbooks/editor/hard-rules.md`](../../docs/playbooks/editor/hard-rules.md) — the editor playbook will refuse to render any cut with a clipped first or last syllable.

`-c copy` (codec copy / lossless) is mandatory. Re-encoding adds 1-2 visible frames of compression artifacts at the cut, which read as "this is a re-uploaded clip" and tank credibility.

---

## Music defaults

**Default: OFF.** Diegetic voice is the product. Music under speech competes with the karaoke captions for attention, kills the parasocial intimacy, and makes the cut feel like an ad.

Optional: low instrumental bed under the title-banner reveal only (frames 0-72 = 0-2.4s). ElevenLabs Music with `force_instrumental: true`, `volume: 0.10` (-18dB), `prompt: "subtle cinematic tension build, no melody, just bass and ambient pads"`. Cross-fade out at frame 60 (0.4s before banner fade completes).

```bash
ralphy generate music \
  --project <id> \
  --prompt "subtle cinematic tension build, no melody, just bass and ambient pads, instrumental, 3 seconds" \
  --duration 3 \
  --instrumental \
  --out workspace/projects/<id>/audio/banner-bed.mp3
```

Never under the speaking moment itself. Never above -18dB. Never with melodic content (steals attention from the captions).

---

## Eight common mistakes (refuse to ship if you spot these)

1. **Banner copy too long.** >2 lines or >60 chars. Shrinks below 60px font, becomes unreadable on phones in <1s. Either rewrite shorter or drop the framing wrapper ("Why X thinks").
2. **Cut clips a word.** First or last syllable is half-spoken. The `--snap-to-words` flag prevents this; if you bypassed it, re-cut. Always re-cut.
3. **Captions out of sync.** Word-level timestamps drift >120ms from the audio. Usually means the transcript was generated from a different source file (e.g., the original 16:9 mp4 vs. the cut). Always transcribe from the same file you're rendering against.
4. **Smart-crop jitters.** Bbox trajectory was not smoothed (or smoothing window <0.3s). Re-run smart-crop with `--smooth-window 0.4`. Visible shake is a retention killer.
5. **No payoff inside the 60s window.** The clip teases something that doesn't resolve before the cut ends. Either extend the cut to capture the payoff, or pick a different moment. Cliffhanger pattern (`hooks.md` #11) is the only acceptable "no resolution" cut, and it must explicitly promise the unresolved tension in the banner.
6. **Multiple unrelated moments stitched.** One viral moment per clip, always. Stitching = the clip has no through-line, retention collapses around the second moment.
7. **Music under speech.** Even at -18dB, melodic music under captions kills retention. Bed only under the banner window (0-2.4s).
8. **Banner style ≠ caption style.** Hormozi-yellow banner with minimal captions (or vice versa) reads as two different videos. Match the styles or pick neutral combinations (quote-card + karaoke is a safe pair).

---

## Worked examples

### Example A — Talkshow guest reveal (45s)

Source: 90-min late-night talkshow episode. Guest is a recently-controversial public figure.

**Picker output (one moment):**

```json
{
  "start": "00:34:12.700",
  "end":   "00:34:57.300",
  "hook_quote": "I haven't told anyone this before.",
  "why_it_works": "Guest signals a first-time admission, then delivers a 30-second story arc with a clear payoff line at 00:34:51. Visible host reaction shot at 00:34:53 sells it.",
  "speaker_count": 1
}
```

**Composition:**
- Banner style: Hormozi-yellow.
- Banner copy: `"[Guest] reveals what really happened on [event] night"` (pattern #1).
- Caption style: karaoke-word-fill (default).
- Reframe: smart-crop active speaker.
- Music: off.
- Cut: snap to word boundaries, 150ms / 100ms padding.

**Cost:** ~$0.01 (amortized picker cost).

### Example B — Interview hot take (28s)

Source: 70-min business podcast interview with a famous founder.

**Picker output:**

```json
{
  "start": "01:02:18.110",
  "end":   "01:02:46.480",
  "hook_quote": "Most VCs are just expensive secretaries.",
  "why_it_works": "Punchy contrarian one-liner with a 25s supporting argument. The line itself is a quotable artifact.",
  "speaker_count": 1
}
```

**Composition:**
- Banner style: Quote-card. The banner IS the quote (pattern #5).
- Banner copy:
  > "Most VCs are just expensive secretaries."
  > — Founder Name
- Caption style: karaoke (matches quote-card better than Hormozi).
- Reframe: smart-crop active speaker.
- Music: off.
- Cut: 28s, snap to word boundaries.

**Cost:** ~$0.01.

### Example C — Panel debate peak (55s)

Source: 2-hour panel debate, 2 panelists arguing on AI policy.

**Picker output:**

```json
{
  "start": "00:48:02.300",
  "end":   "00:48:57.900",
  "hook_quote": "You're factually wrong.",
  "why_it_works": "55-second peak of a 7-minute argument. Both speakers visible and animated. Clear winner moment at 00:48:52.",
  "speaker_count": 2
}
```

**Composition:**
- Banner style: Hormozi-yellow with two-tone split (pattern #8).
- Banner copy: `"[Panelist A] disagrees with [Panelist B] on AI"`.
- Caption style: Hormozi-impact (matches the banner energy).
- Reframe: **vertical split-screen 2-speakers.** Top half = Panelist A, bottom half = Panelist B. Active speaker scales 1.02× via transcript diarization.
- Music: off.
- Cut: 55s, snap to word boundaries. 150ms padding both sides (debates need slightly more lead-in — the listener needs a moment to register WHO is speaking before the karaoke kicks in).

**Cost:** ~$0.01.

---

## Read also

- `TEMPLATE.md` — overview, narrative arc, when-not-to-use, full CLI cookbook.
- `hooks.md` — 12 title-banner patterns with banner-design specs.
- [`docs/playbooks/editor/hard-rules.md`](../../docs/playbooks/editor/hard-rules.md) — word-boundary cut discipline, render gates.
- [`docs/playbooks/researcher.md`](../../docs/playbooks/researcher.md) — `find-viral-moments.ts` invocation, transcript handling, source-pull workflow.
