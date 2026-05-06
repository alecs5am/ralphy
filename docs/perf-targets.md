# Performance targets

Hard targets for the chat — report back to the user if the estimate runs >50% over the target BEFORE starting the work. Source of truth for the `/ralph-producer` orchestration rule.

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

Concurrency cap **3** (ElevenLabs starter limit). Above 20 videos — split into batches.

## Latency budgets per call

Realistic expectations for individual API calls:

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

If ETA > target × 1.5 BEFORE starting:

> "This brief is heavier than the template default — estimate ~14 min (target 8). Reason: <reason>. Continue, or trim scope?"

If ETA > target × 2 DURING the run:

> "Already 16 min, target was 8 — something's off. Current step: <step>. Pause to debug or push through?"

## Don't overpromise

These targets are **medians** under normal conditions. Causes of overruns:
- Provider degradation (OpenRouter / ElevenLabs slow). Not under our control — surface it to the user.
- Quality-gate failures → retries. Each retry adds ~50% to its stage.
- User feedback iteration → doesn't count toward the target (human-in-the-loop).
- Custom prompts with long negative blocks → +20% latency on image/video.
- 16:9 source repurposed to 9:16 (smart-crop not in v2) → not covered by these targets.

If a pattern is consistently overrun, update this file.

## Validation

Sprint 1.4 baseline (single ai-vegetables video):
- TBD — fill after the first end-to-end run.

Sprint 4.x baseline (10-batch soviet-nostalgic):
- TBD — fill after the first batch.

Update this file from `generations.jsonl` actuals once the statistics accumulate.
