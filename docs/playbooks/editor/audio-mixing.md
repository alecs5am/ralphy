# Audio mixing

## Two tracks

A UGC video has two audio tracks by default:

1. **Voiceover (VO)** — primary. Volume = 1.0 baseline.
2. **Music bed** — background. Volume = 0.10–0.15 while VO is active, 0.6–0.8 in pauses (intro/outro).

## Ducking (sidechain compression)

Music ducks under VO. In the HyperFrames composition, gate music with a GSAP-keyframed `data-volume` schedule, or set per-scene `<audio data-volume="0.12">` while VO is active. For post-render ducking (if content is already rendered with a flat mix) use `ralphy audio sidechain` → `cli/lib/ffmpeg-recipes.ts:sidechainCompress`.

## SFX: one pre-mixed stem, never N `<audio>` tags

A sound-design pass produces dozens of short one-shots (clicks, thuds, risers) that overlap. **Do not put them in the composition as individual `<audio>` elements.** Same-track clips cannot overlap, and short same-track media is unreliable during capture (#047) — you would need one track per overlapping cue.

Flatten the cue sheet into ONE stem on ONE track:

```bash
ralphy audio stem --project <id> --cues cues.json --out sfx-stem --duration 30 --target-lufs -20
```

`cues.json` is either a bare cue array or `{ fps, cues }`. Author cue times in **frames** when the composition timeline is in frames — that is where the accuracy comes from; the recipe converts to `adelay` milliseconds:

```json
{ "fps": 30, "cues": [
  { "frame": 0,   "slot": "click-01", "gainDb": -9 },
  { "frame": 160, "slot": "thud-02" },
  { "at": 12.4,   "slot": "riser-03", "gainDb": -3 }
] }
```

`slot` resolves against `<project>/artifacts/sfx/<slot>.mp3`; a missing slot fails the whole run rather than silently dropping the cue. The stem is auditionable outside the render, so mix it before you touch the composition. Under the hood — `ffmpeg-recipes:audioStem` (per-cue `adelay` + `volume`, `amix` with `normalize=0` so authored gains survive, `alimiter` for stacked transients, `apad`/`atrim` to pin the duration, then the loudness pass). Re-running the same `--out` slot auto-versions (`sfx-stem.v1.mp3`) — never overwrites.

## Loudnorm (TikTok target)

After render, before delivery: EBU R128 normalize to `I=-16:TP=-1.5:LRA=11`. Call:

```bash
ralphy render <id> --loudnorm
```

Under the hood — `ffmpeg-recipes:loudnorm`. This is the TikTok / Reels target — without it the video sounds quieter than its feed-mates.

`loudnorm` runs **two passes** by default (measure, then apply the measured `I` / `TP` / `LRA` in linear mode). Single-pass loudnorm normalizes in dynamic mode and misses the target on transient-dense material — a sparse SFX stem asked for `-30` LUFS came out at `-27.2`, where the two-pass run landed at `-30.2`. `--single-pass` restores the old one-shot behaviour when the extra analysis pass is not worth it.

## Music-fade

- Intro fade-in: 0.5s (15 frames @ 30fps)
- Outro fade-out: 1.0s (30 frames)
- Without fades, music gets surgically chopped — sounds cheap.

## VO settings

- Mono (not stereo) — VO doesn't need a stereo image.
- 64kbps mp3 for chat / 128kbps mp3 for render-input is enough.
- If you need to re-encode for transcription (≤25MB whisper limit):
  ```bash
  ffmpeg -i input.wav -ac 1 -b:a 64k output.mp3
  ```

## Sync with VO

Word-level captions from whisper-1 sync themselves via timestamps. If VO drifts relative to scenario.duration — fix in scenarist (re-time scenes), not in editor.

## Hard rules

See [`hard-rules.md`](hard-rules.md) items 1, 6, 7, 8 — they specifically apply to VO/audio.
