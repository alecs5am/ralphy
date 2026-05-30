# model-stack — dev-tool-fb-creative-pack

Extracted from `workspace/projects/sotaocr-fb-001/logs/generations.jsonl` (40 image calls, all `jq`-verified) + postmortem section 04.

## Cost ballpark

| Phase | Min-viable run | Source actual | Why source overspent |
|---|---|---|---|
| Smoke / aspect-ratio test | $0.20 | $0.20 | useful — proved 4:5 honors `image_config` |
| Wrong-palette v1 burn | $0.00 | $1.20 | invented dark+orange DNA for a white+blue site (a1-v1 + 5 killed-seq) |
| Concurrency probes | $0.40 | $0.40 | cheap-but-decisive: disproved the 1-concurrent cap |
| Final pack (32 creatives, parallel) | $6.40 | $6.20 | the real deliverable |
| **TOTAL** | **~$6.4-6.8** | **$8.00** | ~$1.20 avoidable (15%) |

Round figure for a new 32-pack: **~$8.0** as run, **~$6.4** if site-grounded from turn 1. Budget `$0.20/creative × N + ~$0.40` for probes/re-rolls. Add ~$2 for 1:1 + 9:16 cuts of the same matrix (~16 extra gens).

## Wall-clock

| Mode | 40 gens at ~3 min each | Actual |
|---|---|---|
| Pure serial | ~120 min | — |
| Actual (parallel batches) | — | ~13-15 min active |
| **Speedup** | **~9×** | — |

## Model picks

| Use case | Model (endpoint) | Why | $/call |
|---|---|---|---|
| **Every creative** (headlines, code cards, percentages, strikethrough pricing, photoreal portraits, multi-script grids) | `openai/gpt-5.4-image-2` | Typography-grade — crisp embedded type incl. small body copy, monospace, multi-script (Cyrillic/CJK/Arabic/Devanagari), strikethrough lines, chart numbers; honors `--size 1080x1350` | $0.20 |

**Only one model.** Typography crispness is the dominant requirement for an ad pack (headlines, code, percentages). gpt-5.4-image-2 is the documented typography-first default; gemini smudges small embedded type. 40/40 outputs had crisp typography. Re-check MODELS.md before naming ids.

## Concurrency (corrects stale memory)

- **The "gpt-5.4-image-2 cap of 1 concurrent" is wrong.** 2-parallel probe succeeded (~158s), 9-parallel (max 199s), 23-parallel (max 254s). No 403/429, no retries. Memory updated → `feedback_openrouter_parallel_gpt_image.md`.
- **Latency tail grows mildly with batch size** (~1.6× from 2 → 23). Upstream has fair queuing, not a hard cap.
- **`ralphy queue` daemon sat idle** with 13 pending jobs (running:0). Hand-roll the `&`-parallel loop for ad-hoc batches; don't rely on the daemon.

## When to reach for gemini instead (note for next time)

`google/gemini-3-pro-image-preview` ($0.15, ≥4 parallel, stronger multi-ref) for **scene/persona consistency across N gens** when face-lock matters more than typography crispness. NOT for small embedded typography (it smudges). Skip `gemini-2.5-flash-image` ($0.02, quality dip) and `gpt-5-image-mini` ($0.08, exploration only).

## What broke (carry-forward warnings)

| Attempt | What broke | Lesson |
|---|---|---|
| Wrote brand-dna.md from memory (dark+orange) for a white+blue site | $1.20 + ~12 min v1 re-render | Curl the site CSS + Playwright-screenshot the hero in turn 1, before any prompt |
| Designed a serial loop around "cap=1 concurrent" memory | ~25 min of serial time avoided only by a late catch | Probe stale concurrency claims with 2 cheap parallel gens first |
| Relied on `ralphy queue` daemon for the batch | Daemon idle, 13 jobs stuck | Hand-roll `for slot; do ... & done; wait` |
| Rendered `import <brand>` / `<brand>.parse(...)` in 5/32 creatives | Brand only documents a REST curl API — SDK invented from a training prior; `pip install` clickers bounce | Verify every named API symbol vs the site/docs, OR fall back to curl (always exists for HTTP) |
| `--size 1080x1350` returned the nearest native bucket | Cosmetic (~1024×1350-ish) | Pad/scale downstream if pixel-exact matters |
| Minor garbled text in deep background details (e.g. an IDE corner) | Cosmetic; only at 200% zoom | Accept as single-shot cost; re-roll only if the user flags it |

## What we did NOT need

No video / VO / music / SFX / HyperFrames / render. This is a stills-only pack. The only non-model tools are `curl` + Playwright for site-grounding (both $0).
