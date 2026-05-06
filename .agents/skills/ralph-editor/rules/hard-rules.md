# Hard rules — FFmpeg / post-render discipline

Применяется при использовании `cli/lib/ffmpeg-recipes.ts` (см. `docs/ffmpeg-recipes.md`) — post-Remotion processing или pre-processing user uploads.

1. **Subtitles last.** `burnSubtitles` — после всех остальных filters (tonemap, loudnorm). Иначе следующий filter resamples letters → artifacts.

2. **Per-segment extract before concat.** Не trim'ай уже concat'нутый файл — extract segments через `extractSegment`, потом `concatLossless`.

3. **30ms fades around cut boundaries.** Raw cut → click-pop в audio. Fade-in/out минимум 1 frame на каждом cut.

4. **PTS-shifted overlays.** При overlay screenshot/text поверх concat'нутого видео — set PTS offset чтобы overlay не "drift'ил" обратно к source timestamp.

5. **Output-timeline SRT offsets.** Если burn subtitles после concat'а нескольких clips — recompute SRT timestamps относительно RESULTING timeline, не source.

6. **Word-boundary cuts only.** При резке VO для viral moments — режь по word boundaries (whisper-1 word-level timestamps дают честные границы). Никогда не cut mid-word.

7. **30–200ms padding around speech.** `extractSegment` для VO clips — добавь 200–400ms padding до и после, иначе consonants теряются.

8. **Word-level ASR only.** Captions приходят ТОЛЬКО из `transcribe.ts` который запрашивает `timestamp_granularities[]=word`. Segment-level → ragged word-pop effect.

9. **Transcript caching.** Не запускай `ralphy generate captions` повторно если `captions.json` свежее audio file. Каждый call = $0.006/audio-min + latency.

10. **MarginV=90 safe-zone.** При `burnSubtitles` дефолтный `marginV: 90` — TikTok bottom-UI safe zone. Не опускай ниже 60.

11. **Strategy confirm before render.** Если pipeline non-trivial (multi-segment, ducking, tonemap) — re-check план с пользователем в чате до launch. Renders дорогие в человеко-времени.

12. **Output dir isolation.** Каждый ffmpeg-recipe пишет в свой `dst` под `workspace/projects/<id>/render/` или `assets/`. **Никогда не overwrite source files.**

## Green-zone (text overlays)

- Universal Green Zone 1080×1920: X 60→960, Y 210→1480.
- Hook text: Y 280-340. Upper-mid: Y 360-440. Supporting: Y 1100. CTA: Y 1380.
- Hard fails: `y<210`, `y>1480`, `x>960`. Burned-in subtitles `marginV: 90` = Y 1830 — внутри universal zone.

См. `docs/green-zone.md` + `src/lib/utils/green-zone.ts:isInGreenZone()` для проверки.

## Не пишем runtime ffmpeg-скрипты

Hard rule из AGENTS.md — никаких `workspace/projects/<id>/scripts/*.ts`. Все ffmpeg-операции — через `cli/lib/ffmpeg-recipes.ts` (создаётся в Sprint 4.1) либо через флаги `ralphy render`. Если нужного recipe нет — добавь в `ffmpeg-recipes.ts`, не пиши inline.
