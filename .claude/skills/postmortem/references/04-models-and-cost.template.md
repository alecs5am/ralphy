# `04-models-and-cost.template.md` — $ rollup & model picks

The financial + technical truth. All numbers derive from `workspace/projects/<id>/logs/generations.jsonl` — if you can't derive a number from the gen-log, mark it `~estimate` and note the basis.

## How to compute (run before writing)

```bash
PROJECT=<id>
LOG=workspace/projects/$PROJECT/logs/generations.jsonl

# Per-kind cost totals
jq -s 'map(select(.kind != null) | {kind, cost: (.cost_usd // .costUsd // 0)}) | group_by(.kind) | map({kind: .[0].kind, total: (map(.cost) | add)})' $LOG

# Per-endpoint success/failure count + cost
jq -s 'map(select(.endpoint != null)) | group_by(.endpoint) | map({endpoint: .[0].endpoint, n: length, ok: (map(select(.status != "error")) | length), err: (map(select(.status == "error")) | length), cost: (map(.cost_usd // .costUsd // 0) | add)})' $LOG

# Slots with >1 generation (regen / variant inventory)
jq -s 'map(select(.slot != null) | .slot) | group_by(.) | map({slot: .[0], n: length}) | map(select(.n > 1))' $LOG
```

Paste the raw output into a scratch comment, then summarize into the template below.

## Template

```markdown
# Models & cost — <project-id>

Derived from `workspace/projects/<id>/logs/generations.jsonl`. Every $ figure traces to a `cost_usd` field in the log. Estimates are flagged `~est`.

## Bottom line

| | $ |
|---|---|
| **Total spend (this session)** | $<total> |
| **Sunk-cost retries** (error status × cost) | $<retries> |
| **Avoidable** (per rules in `02-lessons.md`) | $<avoidable> |
| **Genuine iteration** (real creative cycles) | $<genuine> |
| **Minimum-viable estimate** if rules in `02-lessons.md` had been followed | ~$<min> |

## Per-phase breakdown

| Phase | Items | $ |
|---|---|---|
| Reference pull + vision analyze | 1 video, N frames | ~$0.01 |
| Product shots v1 (`<model-X>`) | 8 shots | $A |
| Product shots v2 (`<model-X>`, after ref drop) | 8 shots | $A' |
| Hero stills | N shots | $B |
| Scene videos (`<model-Y>`) | M clips | $C |
| Voiceover (`<eleven-model>`) | K takes | $D |
| Music bed | N variants | $E |
| Captions | 1 pass | ~$0.01 |
| Render (Remotion local) | — | $0 |
| **TOTAL** | | **~$<total>** |

## Model picks — image generation

| Use case | Model (endpoint) | Why it won in this session | Cost/call | Calls | $ |
|---|---|---|---|---|---|
| Product fidelity (real device / branding / topology) | `openai/gpt-5.4-image-2` | Holds brand text + correct topology | $0.20 | 8 | $1.60 |
| Photoreal humans | `google/gemini-3-pro-image-preview` | Best photoreal — needs "documentary photography, 50mm prime, ISO 1600 grain" cues | $0.15 | 4 | $0.60 |
| ... | ... | ... | ... | ... | ... |

## Model picks — video generation

| Use case | Model | Why | Cost | Notes |
|---|---|---|---|---|
| Default UGC selfie | `kwaivgi/kling-v3.0-pro` | Lifelike face motion + lip-sync from `--audio` | $0.14/s | Prompt cap 2500 chars, music must be explicitly banned |
| Hyper-motion / physics break | `bytedance/seedance-2.0` | Sharp physics — explosions, screen-shake, jump-scare | $0.14/s | Use when default kling looks too static |
| ... | ... | ... | ... | ... |

## Model picks — voice & music

| Slot | Model / voice | Why | $ |
|---|---|---|---|
| Hook VO | `eleven_v3` + voice `<id>` | Best emotion range for high-arousal hook | $X |
| Body VO | `eleven_multilingual_v2` + voice `<id>` | Lower cost, fine for declarative beats | $Y |
| Music bed | `eleven_music_v1` | — | $Z |

## Discovered model breakage

Concrete failure modes hit in this session. Each row should be specific enough that the next agent can recognize the same situation and avoid it.

- **`<model>` + `<flag combo / prompt pattern>` → reliably <error mode>.** Workaround: <fix>. Cited at [01-chat-history.md#turn-N].
- ...

## Slots with >1 generation (regen / variant inventory)

Pulled from the `>1` slot query above. Tells you which slots burned the most iteration cost.

| Slot | # of gens | Cost | Iterations driver | Final version |
|---|---|---|---|---|
| `scene-03-vid` | 4 | $0.42 | user "слишком статично" at turn 9, model swap at turn 11 | `v4` (seedance, prompt rewrite) |
| `hook-vo` | 3 | $0.18 | voice swap + length tweak | `v3` |
| ... | ... | ... | ... | ... |

## Cost-vs-minimum derivation

The "~$<min>" minimum-viable figure assumes:
- 1 image per slot (no v2 redos) — saves $<X>
- 1 video per clip (no model swaps) — saves $<Y>
- 1 VO take per slot (right voice picked on turn 1) — saves $<Z>
- 0 sunk retries (no content moderation refusals, no API hiccups) — saves $<W>

Realistically the next similar project, at 1.5× minimum-viable, costs ~$<min×1.5>. Anything beyond 2× means the rules in `02-lessons.md` are being ignored.

---

*Written <YYYY-MM-DD>. Numbers from generations.jsonl as of the session end. Update on every addendum.*
```

---

## Filling guidance

- **Run the `jq` commands first**, before writing prose. The numbers drive the story.
- **Don't invent costs.** If the gen-log lacks `cost_usd` for a call (older logs, custom endpoints), write `~est` and explain the basis in a footnote.
- **Failed calls cost money too** — they're in `sunk-cost retries`. Don't omit them.
- **Discovered model breakage is gold for the next project.** Be specific — model name, exact flag combo or prompt token that triggered it, exact error message, exact workaround.
- **Slots with >1 generation** table is where the user sees "ah, scene-03 cost me 4 takes". The "iterations driver" column should reference the user feedback that triggered the regen.

## Iteration N addendum

```markdown
---

## Iteration N — <YYYY-MM-DD>

### Updated bottom line (cumulative)

| | This iteration | Cumulative |
|---|---|---|
| Total spend | $<itN> | $<cumulative> |
| Sunk-cost retries | $<itN-r> | $<cum-r> |

### Per-phase delta

<table of new phases only — don't restate phases that didn't run this iteration>

### Model picks revised

<only list models whose pick changed since the previous iteration; otherwise note "no changes">
```
