# Performance targets

Hard targets для chat'а — отчитывайся пользователю если оценка >50% над таргетом ДО старта работы. Source for `/ralph-producer` orchestration rule.

## Single video

| Stage | Cold-start template | Custom from brief |
|---|---|---|
| Brief → scenario | ≤ 1 min | ≤ 5 min |
| Scenario → assets ready | ≤ 3 min | ≤ 10 min |
| Assets → final mp4 | ≤ 4 min | ≤ 5 min |
| **Total per video** | **≤ 8 min** | **≤ 20 min** |

**Cost ballpark per 15s video**:
- Cold-start template: $7-10 (4× keyframes × $0.15 + 4× video × ~$1.5 + VO subscription + music subscription)
- Custom: $10-15 (typically more iterations, possibly premium models)

## Batch

| Size | Wall time (parallel where possible) |
|---|---|
| 5 videos | ≤ 15 min |
| 10 videos | ≤ 25 min |
| 20 videos | ≤ 45 min |

Concurrency cap **3** (ElevenLabs starter limit). Above 20 видео — split на batches.

## Latency budgets per call

Реалистичные ожидания на отдельные API:

| Operation | Median | P95 |
|---|---|---|
| `ralphy generate image` (gemini-3-pro-image-preview) | 15s | 35s |
| `ralphy generate video` (kling-v3.0-pro 5s) | 60s | 120s |
| `ralphy generate video` (veo-3.1 5s) | 90s | 180s |
| `ralphy generate voiceover` (eleven_multilingual_v2, 1 sentence) | 4s | 8s |
| `ralphy generate music` (ElevenLabs Music, 30s) | 10s | 25s |
| `ralphy generate captions` (whisper-1, 30s audio) | 8s | 15s |
| `ralphy render <id>` (15s video) | 30s | 90s |
| `scoreImage` / `scoreVideo` (Gemini-2.5-flash) | 4s | 8s |

## Overrun behavior

Если ETA > target × 1.5 ДО старта:

> "Этот brief тяжелее template default'а — оценка ~14 min (target 8). Причина: <reason>. Продолжаем или сократим scope?"

Если ETA > target × 2 ВО ВРЕМЯ работы:

> "Уже 16 мин, target 8 — что-то идёт не так. Текущий step: <step>. Прерываем чтобы дебажить или дожимаем?"

## Не overpromise

Эти таргеты — **median** в нормальных условиях. Causes для отклонений:
- Provider degradation (OpenRouter / ElevenLabs slow). Не в нашем контроле — сообщи user'у.
- Quality gate fails → retry'и. Каждый retry = +50% к стейджу.
- User feedback iteration → не считается в target (human-in-the-loop).
- Custom prompts с длинными negative blocks → +20% latency на image/video.
- 16:9 source > 9:16 reframing (smart-crop не в v2) → не в этих таргетах.

Если pattern постоянно overrun — обнови этот файл.

## Validation

Sprint 1.4 baseline (single ai-vegetables video):
- TBD — заполнить после первого end-to-end запуска.

Sprint 4.x baseline (10-batch soviet-nostalgic):
- TBD — заполнить после первого batch'а.

Update этот файл из `generations.jsonl` actuals когда накопится статистика.
