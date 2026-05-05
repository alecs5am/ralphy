# FFmpeg recipes

Thin wrappers over `ffmpeg` for a production-correct video pipeline. Source: adapted from `browser-use/video-use/helpers/render.py` + `helpers/grade.py`.

Implementation: `cli/lib/ffmpeg-recipes.ts`. Uses the system `ffmpeg` (Homebrew). Every call is auto-logged through `logGeneration()` if `projectId` is passed (provider: `"ffmpeg"`, cost: 0).

## When to use this (and when to use Remotion)

| Task | Tool |
|---|---|
| Video composition (scenes + captions + music + transitions) | **Remotion** |
| Cut a single clip out of a long source file | `extractSegment` |
| Concatenate already-rendered MP4s without re-encode | `concatLossless` |
| Normalize loudness for TikTok | `loudnorm` |
| Music under VO with ducking | `sidechainCompress` |
| iPhone HDR video into SDR for shorts | `tonemapHDR` |
| Burn .srt subtitles into a final mp4 (post-Remotion) | `burnSubtitles` |

Remotion renders the final MP4 — these recipes are for **pre/post-processing** of the source files or the rendered output for cross-platform compression.

## Recipe 1: `extractSegment`

Lossless or re-encoded cut by timecode.

```ts
import { extractSegment } from "./cli/lib/ffmpeg-recipes.js";

await extractSegment({
  src: "workspace/projects/<id>/source/long-podcast.mp4",
  startSec: 142.5,
  endSec: 167.2,
  dst: "workspace/projects/<id>/clips/clip-01.mp4",
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

**Alternative:** do the ducking directly in Remotion via `<Audio volume={interpolate(...)} />`. Works if you know exact VO intervals. Sidechain — automatic detection.

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

**When:** on ANY user-uploaded iPhone footage in `assets/uploaded/`. Before that footage hits Remotion.

## Recipe 6: `burnSubtitles`

Burn-in `.srt` over the video — final step after Remotion (if subtitles aren't part of the composition).

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

**In our stack:** captions are normally embedded in the Remotion composition through `@remotion/captions` components (12 styles in `src/lib/components/captions/`). `burnSubtitles` is needed only for legacy `.srt` flows.

## Anti-patterns

- **Re-encode while concatenating identical files** — wastes time and quality. Use `concatLossless`.
- **`extractSegment` without padding** — clips word starts/ends. Add 200ms.
- **Loudnorm each track independently then mix** — final can come out super-quiet or peak. Mix → then loudnorm.
- **Subtitles before other filters** — they get rescaled during tonemap and become unreadable. Subtitles **last**.
