# Audio mixing

## Two tracks

UGC video дефолтно имеет два аудио track'а:

1. **Voiceover (VO)** — главный. Volume = 1.0 baseline.
2. **Music bed** — фон. Volume = 0.10–0.15 при активном VO, 0.6–0.8 в паузах (intro/outro).

## Ducking (sidechain compression)

Music duck'ается под VO. В Remotion-композиции — через `interpolate` на `volume`:

```tsx
<Audio
  src={staticFile("music.mp3")}
  volume={(f) => {
    // Duck during VO scenes (frames 30-450)
    const isVoActive = f >= 30 && f <= 450;
    return isVoActive ? 0.12 : 0.7;
  }}
/>
```

Для post-Remotion ducking (если контент уже отрендерен с обычным mix) — `cli/lib/ffmpeg-recipes.ts:sidechainCompress`.

## Loudnorm (TikTok target)

После рендера, перед deliver: EBU R128 normalize до `I=-16:TP=-1.5:LRA=11`. Вызов:

```bash
ralphy render <id> --loudnorm
```

Под капотом — `ffmpeg-recipes:loudnorm`. Это TikTok / Reels target — без него видео звучит тише чем feed-mate'ы.

## Music-fade

- Intro fade-in: 0.5s (15 frames @ 30fps)
- Outro fade-out: 1.0s (30 frames)
- Без fade'ов music режется хирургически — звучит дёшево.

## VO settings

- Mono (не stereo) — VO не нуждается в стерео-картинке.
- 64kbps mp3 для chat / 128kbps mp3 для render-input достаточно.
- Если нужно re-encode для transcribe (≤25MB whisper limit):
  ```bash
  ffmpeg -i input.wav -ac 1 -b:a 64k output.mp3
  ```

## Sync с VO

Word-level captions из whisper-1 синхрят сами по таймштампам. Если VO drift'ит относительно scenario.duration — fix в scenarist (re-time scenes), не в editor.

## Hard rules

См. `rules/hard-rules.md` пункт 1, 6, 7, 8 — относится к VO/audio specifically.
