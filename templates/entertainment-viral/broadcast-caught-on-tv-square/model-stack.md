# Model stack — Broadcast Caught-On-TV (Square)

The whole template is a two-call chain. Get the model picks right and the template runs at minimum-viable cost (~$2.25–2.30 / clip).

## The chain

```
user selfie (.jpg/.png)
        │
        │  --ref
        ▼
openai/gpt-5.4-image-2         ← 1024x1024 SQUARE still (~$0.20, ~3 min)
        │
        │  --first-frame
        ▼
kwaivgi/kling-v3.0-pro --audio ← 15s 960x960 clip + diegetic ambient (~$2.10, ~3 min)
        │
        ▼
final mp4 — ship raw, no Remotion composition needed
```

## Stage 1 — Image (square broadcast-capture still)

| Use case | Model | Why it won (or didn't) | Cost/call | Notes |
|---|---|---|---|---|
| **Default — broadcast realism > strict aspect** | `openai/gpt-5.4-image-2` | Clean broadcast-capture aesthetic on first try, holds identity from selfie via `--ref` well, naturally produces 1024² square (the desired aesthetic). | $0.20 | ~3.3 min latency. Silently rounds `--size 1080x1920` to 1024² — feature, not bug, for this template. |
| **Alternative — platform-strict 9:16 from origin** | `google/gemini-3-pro-image-preview` | Honors `--size` hints (768×1376 strict 9:16). Faster when it works (~36s). | $0.15 nominal | **Known transient null-skeleton failure mode** (`content:null, refusal:null, finish_reason:null`) — retry up to 5×. OR does not bill on this mode. Hit 4× in the source project before 5th try succeeded. |

### Picks at a glance

- **Default to `openai/gpt-5.4-image-2`.** Square is the aesthetic; this model gives it for free.
- **Switch to `gemini-3-pro-image-preview` only when** platform-strict 9:16 is hard-required at origin (rare for this template — you'd normally crop/pad at composition time instead).
- **Never use a multi-ref image model here.** One selfie ref is enough; multi-ref dilutes identity.

### What we tried and dropped (from kbo-broadcast-001)

- **Heavy identity-preservation prompts on gemini-3-pro** → soft-refused via skeleton-null responses 4× before a tame-prompt retry succeeded. Lesson: let `--ref` carry identity, describe scene only.
- **`--size 1080x1920` on gpt-5.4-image-2 to force 9:16** → silently rounded to 1024² anyway. We learned to embrace it.

## Stage 2 — Video (i2v 15s with ambient audio)

| Use case | Model | Why it won | Cost | Notes |
|---|---|---|---|---|
| **Default — 9:16ish audience-cam, identity-locked, 15s, diegetic audio** | `kwaivgi/kling-v3.0-pro` | Held identity across 15s on top of a `--first-frame` still. Generated clean ambient stadium audio (crowd + Korean announcer + bat crack) despite CLI help text saying "Veo 3 only" for `--audio`. Honors the square first-frame's aspect over the `--aspect-ratio` flag (960×960 output from a 1024² input). | $0.14/s × 15 = $2.10 | Beat-by-beat timeline in prompt prevents motion compression into first 5s. Pronoun-swap the prompt before submit — Kling honors pronouns even with a male/female first-frame. |

### Did not exercise (and why)

- **`google/veo-3.1`** — capped at 8s, wanted 15s. Native speech is best on Veo 3 but this template doesn't use speech.
- **`bytedance/seedance-2.0`** — no audio output, and the privacy filter blocks realistic-people i2v anchors. Wrong tool for this template.

### Known model breakage

- **Kling honors `--first-frame` aspect over `--aspect-ratio` flag.** With a 1024² first-frame and `--aspect-ratio 9:16`, Kling outputs 960×960 square. Workaround: pre-crop the still if you need strict 9:16, OR (default for this template) let the square through.
- **Kling honors gendered pronouns over `--first-frame` identity.** Pasted "she blinks, she smiles" prompts with a male first-frame produce subtly softened features. Pronoun-swap before submit.

## Cost per stage (minimum-viable single-clip)

| Stage | Calls | Cost |
|---|---|---|
| Identity-anchor still | 1× `gpt-5.4-image-2` | $0.20 |
| Video i2v 15s + audio | 1× `kling-v3.0-pro` @ 15s | $2.10 |
| Voiceover | 0 (Kling produces diegetic audio) | $0.00 |
| Music | 0 (template anti-pattern — never add) | $0.00 |
| Captions | 0 (template uses no caption layer; add at composition time if posting with a hot-take overlay) | $0.00 |
| Render | 0 (ship raw Kling mp4 — no Remotion composition) | $0.00 |
| **Total — minimum-viable** | | **$2.30** |

## Cost ballpark for a typical session

| Cost level | When | Spend |
|---|---|---|
| **Minimum-viable** | Right model first try, no retries | ~$2.30 |
| **1.5×** | One retry buffer on either stage (gemini transient OR Kling re-roll for motion) | ~$3.45 |
| **2×** | Two image variants + one video re-roll, or one slot-reuse overwrite | ~$4.60 |
| **2.3× (source project actual)** | Two image variants + two video clips, slot-reuse overwrite cost a $0.70 5s clip | ~$5.25 |

Anything beyond 2× means the rules in `TEMPLATE.md` are being ignored — most often pronoun-swap skipped, or `--aspect-ratio 9:16` forced on the image stage producing a less-believable still that triggers a re-roll.

## Slot discipline (the cost-control rule)

`scene-01-vid` (5s, no audio) and `scene-01-vid-15s-audio` are different artifacts and need different slots. The CLI does not yet enforce `.vN.ext` auto-versioning despite the AGENTS.md invariant. **Always pick a descriptive new slot per param change** — `scene-NN-vid-15s`, `scene-NN-vid-audio`, `scene-NN-still-square`. Reusing a slot silently overwrites and the previous file is lost (workspace is gitignored).
