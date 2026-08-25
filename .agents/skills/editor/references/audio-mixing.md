# Audio mixing

## Two tracks

A UGC video has two audio tracks by default:

1. **Voiceover (VO)** — primary. Volume = 1.0 baseline.
2. **Music bed** — background. Volume = 0.10–0.15 while VO is active, 0.6–0.8 in pauses (intro/outro).

## Ducking (sidechain compression)

Music ducks under VO. In the HyperFrames composition, gate music with a GSAP-keyframed `data-volume` schedule, or set per-scene `<audio data-volume="0.12">` while VO is active. For post-render ducking (if content is already rendered with a flat mix) use `ralphy audio sidechain` → `cli/lib/ffmpeg-recipes.ts:sidechainCompress`.

## Loudnorm (TikTok target)

After render, before delivery: EBU R128 normalize to `I=-16:TP=-1.5:LRA=11`. Call:

```bash
ralphy render <id> --loudnorm
```

Under the hood — `ffmpeg-recipes:loudnorm`. This is the TikTok / Reels target — without it the video sounds quieter than its feed-mates.

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

See [`hard-rules.md`](./hard-rules.md) items 1, 6, 7, 8 — they specifically apply to VO/audio.
