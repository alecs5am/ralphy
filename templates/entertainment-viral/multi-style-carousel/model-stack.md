# model-stack — multi-style-carousel

Extracted from `workspace/projects/ralphy-carousel-001/logs/generations.jsonl` (36 entries: 34 billed, 2 transient errors at $0) + postmortem section 04.

## Cost ballpark

| Phase | Min-viable run | Source actual | Why source overspent |
|---|---|---|---|
| Style covers (1 per style, first pass) | $1.20 (6 covers) | $1.20 | — |
| Cover re-rolls (mascot-fit fix) | $0.00 | $0.40 | punk + acid clean-mascot mismatch; a gritty ref would have avoided it |
| Abandoned style direction (proof-then-pivot) | $0.00 | $0.20 | committed a dark direction past a single proof |
| Fill slides 02-05 (× N styles) | $4.80 (24 slides) | $4.00 | — |
| Transient retries | $0.00 | $0.00 | TLS/socket blips return before billing |
| Contact sheets (ffmpeg hstack) | $0 | $0 | local, free |
| **TOTAL** | **~$6.0** | **~$6.8** | ~$0.60 avoidable |

Round figure for a new 6-style × 5-slide set: **~$6.8** (30 slides × $0.20 + a couple of cover re-rolls). Follow the cover-first checkpoint + a gritty mascot variant and it drops to ~$6.0.

## Model picks

| Use case | Model (endpoint) | Why | $/call |
|---|---|---|---|
| **Every slide** (baked headline + labels must read crisp) | `openai/gpt-5.4-image-2` | Typography-grade — bakes 1-2-line headlines + small UI labels legibly and spelled-right across N styles; honors `--size 1080x1350` (4:5) via `image_config` | $0.20 |

**Only one model.** The entire concept is *baked text* — every slide carries a headline. gpt-5.4-image-2 is the only image model in `MODELS.md` that holds embedded typography; gemini smudges it. Re-check MODELS.md before naming ids — training memory is stale.

## The gemini tradeoff (not used — note for next time)

`google/gemini-3-pro-image-preview` ($0.15, ≥4 concurrent, stronger *multi-ref* identity) was NOT used because it smudges baked typography. BUT for the grunge styles that failed on mascot-fit, the headlines are sparse and the real problem was *character consistency in a gritty medium* — gemini's strength. **Untested hypothesis:** for grunge styles with a dedicated gritty character ref and minimal baked text, gemini multi-ref might hold the character better and run ~4× faster/cheaper. Worth an A/B next time.

## What broke (carry-forward warnings)

| Attempt | What broke | Lesson |
|---|---|---|
| Forced the clean mascot into punk/acid grunge | Geometry fought the distressed register; weaker covers + a re-roll | Build a pre-distressed mascot ref for grunge styles, or redraw the mascot IN the medium (cookbook) |
| `rm prompts/slide-0?.txt` while a background gen-loop read them | The loop re-reads each prompt file per iteration → `--prompt arg missing` killed 3 slots | Sequence all file edits/deletes AFTER background jobs finish |
| Queued a 2nd gpt-image bg loop while the 1st ran | `403 key limit exceeded` (1 concurrent per key) | Serialize; queue the next style's loop behind the current one |
| Committed a dark cinematic direction past a single proof | $0.20 unused (slide-02) | Decide the style direction before generating beyond a single proof |
| Transient TLS/socket exit-1 mid-batch (3×) | A hole in the batch, no auto-retry | Re-run the single slot — clears at $0 every time |

## What we did NOT need

No video / VO / music / SFX / HyperFrames / render. This is a pure baked-text still-image-set format. The only non-model tool is `ffmpeg hstack` for contact sheets.
