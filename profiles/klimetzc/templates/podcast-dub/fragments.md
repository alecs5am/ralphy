# Config fragments

Reusable style and behavior knobs for podcast-dub projects. These aren't prompt fragments (no AI generation here) — they're default values for the Remotion composition and the transcript-conversion step.

## Title banner

```ts
const TITLE_DURATION_FRAMES = 105;   // ~3.5s at 30fps. Lyadov default.
const TITLE_ACCENT = "#FE2B02";      // Lyadov red. Change per brand.
const TITLE_BOTTOM_PADDING = 534;    // px from bottom. Adjust per reference edit.
const TITLE_FONT_SIZE = 56;          // px. Fits 2-line English on 1080 wide at weight 900.
const TITLE_SLIDE_FROM = -120;       // px. Negative = slides down from above the frame.
const TITLE_SLIDE_FRAMES = 10;       // entry slide duration in frames
const TITLE_FADE_IN_FRAMES = 6;
const TITLE_FADE_OUT_FRAMES = 12;    // tail fade before banner disappears
```

Layout pattern: bottom-anchored (`justifyContent: "flex-end"`), full-bleed (`alignItems: "stretch"`). Slides down from `translateY(-120px)` and fades in, sits, fades out.

## Karaoke line

```ts
const WORDS_PER_LINE = 3;            // Lyadov default. Drop to 2 if words are consistently long.
const KARAOKE_ACTIVE = "#FE0100";    // Lyadov red. Slight difference from title red is intentional.
const KARAOKE_BOTTOM_PADDING = 288;  // px. Higher than title so they don't overlap.
const KARAOKE_FONT_SIZE = 62;
const KARAOKE_GAP_PX = 10;
const KARAOKE_MAX_WIDTH = "92%";     // container max-width
const KARAOKE_UPPERCASE = true;      // `word.toUpperCase()`
```

Active-word detection: `word.startMs <= currentTimeMs && word.endMs > currentTimeMs`. If no word is active (pause between words), nothing highlights — the line still shows.

Group display window: from the current group's first-word `startMs` until the *next* group's first-word `startMs` (not the current group's `endMs`). Keeps captions on-screen across short silences. Last group adds a 6-frame tail.

## Filler-word strip list

```ts
const FILLER_WORDS = new Set(["uh", "um", "huh", "hmm", "ah"]);
```

Applied at transcript→captions conversion (`type === "word" && !FILLER_WORDS.has(w.text.toLowerCase())`). Extend per project if you see consistent non-word tokens slip through (e.g. `"..."`, `"mhm"`).

**Do not strip mid-sentence short words** like `"a"`, `"I"`, `"it"` — they carry real meaning.

## ElevenLabs Dubbing defaults

```
source_lang:   ru
target_lang:   en
num_speakers:  1          # bump for multi-speaker podcasts
watermark:     false      # requires paid plan
voice_id:      <omit>     # omit = auto-clone source speaker; set to override with a library voice
```

Poll every 10s on `/v1/dubbing/{id}` until `status === "dubbed"`. Typical wait: 1–5 minutes per minute of source.

## ElevenLabs STT defaults (fallback)

```
model_id:               scribe_v1
timestamps_granularity: word
language_code:          en
```

Use only if the dubbing job's `/transcript/en` endpoint returns a misaligned timeline (>200ms visible drift from the dubbed audio).

## Font loading

```ts
import { loadFont } from "@remotion/google-fonts/Inter";
const { fontFamily } = loadFont("normal", {
  weights: ["700", "800", "900"],
  subsets: ["latin"],
});
```

Swap to a non-Latin subset (`cyrillic`, `greek`, etc.) if the dub target isn't English. Swap the font family entirely if the brand wants a specific typeface — make sure it's available on Google Fonts or load locally.

## File naming convention

Within a project:

```
workspace/projects/{id}/assets/
  source/         ep{NN}_ru_raw.mp4          # user-provided raw RU video
  reference/      ep{NN}_ru_edited.mp4       # user-provided edited RU short (style ref)
  voiceover/
    ep{NN}_en_dubbed.mp4                     # raw ElevenLabs dubbing output
    ep{NN}_audio.m4a                         # extracted audio-only, used by Remotion
    ep{NN}_en_transcript.json                # word-timestamp transcript

src/videos/{id}/
  captions-{NN}.ts                           # one file per episode
  index.tsx                                  # the shared PodcastDubEpisode component

public/{id}/
  ep{NN}_video.mp4   → symlink to assets/source/ep{NN}_ru_raw.mp4
  ep{NN}_audio.m4a   → symlink to assets/voiceover/ep{NN}_audio.m4a
```

The `setup-all.ts` script extracts/copies into the public directory in one pass. See [composition.md](composition.md) for the symlink alternative.
