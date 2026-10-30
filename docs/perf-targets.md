# Performance targets

Hard targets for the chat — report back to the user if the estimate runs >50% over the target BEFORE starting the work. Source of truth for the `producer playbook` orchestration rule.

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
| `ralphy generate image` (gemini-3-pro-image) | 15s | 35s |
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

October 2026 harness baseline (#562, 21 production sessions plus 20 subagents, Oct 17-27; full numbers in [`docs/research/harness-baseline-2026-10.md`](research/harness-baseline-2026-10.md)). Every stage missed its custom-brief budget:

| Stage | Median observed | Budget (custom) |
|---|---|---|
| Brief → scenario | 12.5 min | 5 min |
| Scenario → assets ready | 27 min | 10 min |
| Assets → final mp4 | 9 min | 5 min |
| Total per session | 35 min | 20 min |
| Per rendered project (3 sessions) | 1 h 25 min | 20 min |

| Call | Median observed | P95 observed | Budget median / P95 |
|---|---|---|---|
| `ralphy generate image` | 21 s | 55 s | 15 s / 35 s |
| `ralphy generate video` (Seedance 2.x and Kling mix) | 2 min 43 s | — | 60-90 s |
| `ralphy render <id>` | 49 s | 2 min 13 s | 30 s / 90 s |

Stage times include in-session iteration with the user, so they are not single-pass latencies. Render took 33% of agent time; eval ran in 1 session. Re-measure with `bun run session:report -- <transcripts> --ralphy-only` after each fix from #572-#575.

Render budget for longer cuts: plan about 3 s of wall time per output second at 1080x1920 until a per-second baseline is measured.

Update this file from `generations.jsonl` actuals and new `session:report` runs as statistics accumulate.
