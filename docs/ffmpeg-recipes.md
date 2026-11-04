# FFmpeg recipes

Thin wrappers over `ffmpeg` for a production-correct video pipeline. Source: adapted from `browser-use/video-use/helpers/render.py` + `helpers/grade.py`.

Implementation: `cli/lib/ffmpeg-recipes.ts`. Uses the system `ffmpeg` (Homebrew). Every call is auto-logged through `logGeneration()` if `projectId` is passed (provider: `"ffmpeg"`, cost: 0).

## When to use this (and when to use HyperFrames)

| Task | Tool |
|---|---|
| Video composition (scenes + captions + music + transitions) | **HyperFrames** |
| Cut a single clip out of a long source file | `extractSegment` |
| Concatenate already-rendered MP4s without re-encode | `concatLossless` |
| Normalize loudness for TikTok | `loudnorm` |
| Flatten a cue sheet of SFX one-shots into one track | `audioStem` |
| Music under VO with ducking | `sidechainCompress` |
| iPhone HDR video into SDR for shorts | `tonemapHDR` |
| Burn .srt subtitles into a final mp4 (post-render) | `burnSubtitles` |

HyperFrames renders the final MP4 — these recipes are for **pre/post-processing** of the source files or the rendered output for cross-platform compression.

## Recipe 1: `extractSegment`

Lossless or re-encoded cut by timecode.

```ts
import { extractSegment } from "./cli/lib/ffmpeg-recipes.js";

await extractSegment({
  src: ".ralphy/workspaces/<ws>/projects/<id>/source/long-podcast.mp4",
  startSec: 142.5,
  endSec: 167.2,
  dst: ".ralphy/workspaces/<ws>/projects/<id>/clips/clip-01.mp4",
  reencode: true,                // exact frame, default
  projectId: "<id>",
  note: "viral moment 1",
});
```

**Hard rule:** add 30–200ms padding before/after the word so consonants aren't clipped. For viral-moments out of the openshorts pipeline, padding = 200–400ms.

## Recipe 2: `concatLossless`

Concatenate already identically encoded clips without re-encode.

```ts
import { concatLossless } from "./cli/lib/ffmpeg-recipes.js";

await concatLossless({
  srcs: ["clip-01.mp4", "clip-02.mp4", "clip-03.mp4"],
  dst: "combined.mp4",
});
```

**Constraint:** every src must have identical codec / resolution / fps / sample rate. If they differ — re-encode first via `extractSegment`.

## Recipe 3: `loudnorm` (EBU R128)

Loudness normalization for TikTok / Reels / Shorts (target -16 LUFS).

```ts
import { loudnorm } from "./cli/lib/ffmpeg-recipes.js";

await loudnorm({
  src: "voiceover.mp3",
  dst: "voiceover.normalized.mp3",
  target: -16,
  truePeak: -1.5,
  loudnessRange: 11,
});
```

**When:** before the final render, on the mixed audio. ElevenLabs already returns relatively normalized VO, but the music bed out of Lyria2 often drifts — running `loudnorm` on the mixed track yields consistent loudness.

**Two passes by default (#599).** The recipe measures first, then applies the measured `I` / `TP` / `LRA` / threshold in linear mode. Single-pass loudnorm runs in dynamic mode and misses the target on transient-dense material: a sparse SFX stem asked for -30 LUFS landed at -27.2 in one pass and -30.2 in two. `twoPass: false` (CLI `--single-pass`) restores the one-shot filter; a silent or unparseable measurement degrades to one pass instead of failing.

## Recipe 3c: `audioStem` (#599)

Flatten N short SFX one-shots into ONE pre-mixed stem on ONE track. HyperFrames cannot overlap clips on the same track, and short same-track media is unreliable during capture (#047), so a sound-design pass with 80+ overlapping cues has to become a stem, not 80 `<audio>` elements.

```bash
ralphy audio stem --project <id> --cues cues.json --out sfx-stem.mp3 --duration 30 --target-lufs -20
```

```ts
import { resolveCueSheet, audioStem } from "./cli/lib/ffmpeg-recipes.js";

const cues = resolveCueSheet(
  { fps: 30, cues: [{ frame: 160, slot: "click-01", gainDb: -9 }] },
  (ref) => ("slot" in ref ? lookUpAudioArtifact(ref.slot) : ref.path),
);
await audioStem({ cues, dst: "sfx-stem.mp3", durationSec: 30, targetLufs: -20 });
```

Cue times are authored in **seconds** (`at`) or **frames** (`frame` + a top-level `fps`, the form to use when the composition timeline is in frames). Each cue names its source with exactly one of `slot` (a Project audio Artifact; the CLI reads its newest Revision from the store) or `path` (a file relative to the cue sheet). The graph is one `adelay=<ms>|<ms>,volume=<g>dB` chain per cue → `amix=inputs=N:normalize=0` (authored gains survive) → `alimiter` with auto-level off (stacked transients) → `apad,atrim` (exact duration) → the two-pass loudness pass. An empty cue sheet, a cue with no time, or a source that does not resolve fails the run instead of emitting a half-silent stem. The stem is a new audio Artifact Revision; re-running the same `--out` adds a Revision, never overwrites.

## Recipe 4: `sidechainCompress` (music ducking)

Music auto-quiets when VO speaks.

```ts
import { sidechainCompress } from "./cli/lib/ffmpeg-recipes.js";

await sidechainCompress({
  voice: "voiceover.mp3",
  music: "lyria2-bed.mp3",
  dst: "mixed-with-duck.mp3",
  threshold: 0.05,    // when VO is louder — duck
  ratio: 8,           // how hard
  mix: [1, 0.6],      // pre-duck volumes [voice, music]
});
```

**Alternative:** do the ducking directly in the HyperFrames composition by scheduling `data-volume` on the music `<audio>` element. Works if you know exact VO intervals. Sidechain — automatic detection.

## Recipe 5: `tonemapHDR`

iPhone shoots HDR (HLG / Dolby Vision). TikTok / Reels often mishandle HDR — colors flat or overblown. Forced SDR conversion fixes it:

```ts
import { tonemapHDR } from "./cli/lib/ffmpeg-recipes.js";

await tonemapHDR({
  src: "raw-iphone-clip.mov",
  dst: "raw-iphone-clip.sdr.mp4",
  algorithm: "hable",   // best for skin tones
});
```

**When:** on ANY user-uploaded iPhone footage in `artifacts/refs/`. Before that footage hits the HyperFrames composition.

## Recipe 6: `burnSubtitles`

Burn-in `.srt` over the video — final step after the HyperFrames render (if subtitles aren't part of the composition).

```ts
import { burnSubtitles } from "./cli/lib/ffmpeg-recipes.js";

await burnSubtitles({
  src: "render/final.mp4",
  srt: "captions.srt",
  dst: "render/final-burned.mp4",
  marginV: 90,             // TikTok safe zone (default)
  fontSize: 36,
  fontName: "Inter",
  primaryColor: "&HFFFFFF&",
  outlineColor: "&H000000&",
});
```

**Hard rule (Editor Hard Rules #1):** subtitles **last**, after every video filter. If you do tonemap or loudnorm — first; subtitles at the end.

**In our stack:** captions are normally embedded in the HyperFrames composition via registry caption-style blocks (`bunx hyperframes add <slug>`). `burnSubtitles` is needed only for legacy `.srt` flows.

## Anti-patterns

- **Re-encode while concatenating identical files** — wastes time and quality. Use `concatLossless`.
- **`extractSegment` without padding** — clips word starts/ends. Add 200ms.
- **Loudnorm each track independently then mix** — final can come out super-quiet or peak. Mix → then loudnorm.
- **Subtitles before other filters** — they get rescaled during tonemap and become unreadable. Subtitles **last**.
