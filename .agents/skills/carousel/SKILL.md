---
name: carousel
namespace: user
description: >-
  How to make a multi-style multi-slide social carousel (5-10 slides × N styles) where the deliverable is the baked-text image itself — no HyperFrames compose. A domain overlay on the standard pipeline: supplies the cover-first checkpoint (one cover per style → user review → fill the rest), the dual-ref cohesion rule (`--ref mascot --ref {style}-01` on every fill slide), the mascot-fit rule (a clean cute mascot does NOT survive gritty/grunge styles — build a distressed character variant for those), the JSON prompt schema (reusable STYLE + QUALITY blocks per aesthetic, only scene + ui_elements varies per slide), and the `gpt-5.4-image-2` serialize-with-transient-retry batch shape. Works for ANY mascot / brand + ANY set of aesthetics — zine / club / swiss / riso / punk / acid / vaporwave / clean DTC.
  USE WHEN the user asks for an Instagram / LinkedIn / TikTok carousel, "5-slide deck", "swipe-through", "multi-slide post", "story-style series", "N-style carousel". Multi-slide stills, not video.
  This is a niche SKILL (generalized), not a remix TEMPLATE. For "remix this exact carousel but swap X", use the remix path in docs/skills-vs-templates.md. For a single still, use /poster.
---

## Trigger

**FIRES** on a generic multi-slide carousel brief: "make an IG carousel about X", "5-slide LinkedIn post", "swipe-through deck", "story-style series of N slides", "multi-style carousel with 6 aesthetics", "explainer carousel for our launch". Any subject — the skill is subject-agnostic.

**DO NOT FIRE** when:
- The brief is for ONE still (poster, drop graphic) → use [`/poster`](../poster/SKILL.md) instead.
- The brief is for N static ads across registers (FB / Meta ad pack) → use [`/fb-creatives`](../fb-creatives/SKILL.md) instead.
- The brief is for a video (the slides animate, the mascot moves) → match a `/ralphy-ugc-*` video skill + editor playbook.
- The user points at one specific carousel to reproduce → that is the **remix path**. See [`docs/skills-vs-templates.md`](../../../docs/skills-vs-templates.md).

## What this skill is

A generalized cover-first / dual-ref / mascot-fit overlay, not a finished carousel. It does not name a mascot, a topic, or an aesthetic — it tells the art-director HOW multi-style carousels are built so a strong one comes out for whatever the user is pushing. It runs **through** `ralphy generate image`; no HyperFrames compose stage is needed when the text bakes inside the image.

## Hard invariants

- All generation routes through `ralphy generate image` (no raw API). Read `MODELS.md` before naming any model id.
- **`gpt-5.4-image-2` for baked text on carousel slides.** Validated 30/30 slides on `ralphy-carousel-001` for 1-2-line headlines + small label + sub-line legible and spelled right. gemini smudges small embedded type — don't finalize there.
- **Carousel batches serialize per style, but parallel across styles is fine.** Don't run two bg gen-loops on the same OpenRouter key writing to the same prompt files at once.
- **Never mutate prompt-input files while a background gen-loop is reading them.** The gen loop `cat`s each prompt file per iteration — a mid-flight `rm` or `mv` corrupts the batch. Edit / delete prompt files AFTER background jobs finish (or before they start). See `ralphy-carousel-001` Finding B.
- **Append-only on regen.** Re-rolling a slide writes `.v2.png`; the pre-fix `punk-01.v1.png` and `acid-01.v1.png` stay on disk for A/B.
- The reference-required gate fires when the brief names a real person / branded product / IP in a slide subject. A no-name mascot + a fictional brand proceeds without a ref.
- The quality gate refuses, not warns — two failed `scoreImage` in a row → stop and report options.

## The niche, in one paragraph

A multi-style carousel lives or dies on **per-style cohesion + cross-style identity**. Each 5-slide set must read as one design language (same paper / light / grade / type system), AND the mascot or brand must read as the same entity across every set. Two refs glued together do this work: a permanent **`mascot-ref.png`** anchors identity across the whole deck; the **approved cover** for each style anchors that style's internal cohesion across slides 02-05. A clean cute mascot doesn't survive grunge — for distressed registers, build a dedicated character variant rather than forcing the clean asset.

## The fixed workflow (do not restructure — only fill the slots)

| Step | What it does | Output |
|---|---|---|
| 1. Concept + copy | Lock the Visual System (palette, type stack, accent, mood) per style + per-slide headline/body | `STORYBOARD.md` + user "go" |
| 2. Mascot ref | Rasterize mascot SVG → `artifacts/refs/mascot-ref.png`. For gritty styles, ALSO make a pre-distressed character ref | `artifacts/refs/mascot-ref.png` (+ `artifacts/refs/mascot-gritty-ref.png` if applicable) |
| 3. JSON prompts | One STYLE+QUALITY block per aesthetic. Only `scene` + `composition.ui_elements` (per-slide bake text) varies per slide | `prompts/<style>-NN.json` × N |
| 4. **Cover-first checkpoint** | Generate ONE cover per style, in parallel across styles. Show all covers in chat. User approves / re-rolls. | `artifacts/images/<style>-01.png` × N styles |
| 5. Fill slides 02-05 | For each approved style, fill 02-05 serialized (`gpt-5.4-image-2` = 1 concurrent per style). Pass BOTH refs: `--ref mascot --ref <style>-01.png` | `artifacts/images/<style>-{02..05}.png` × N styles |
| 6. Contact sheets | One horizontal row per style (ffmpeg hstack) for review-as-a-unit | `contact/<style>-row.png` × N styles |

The cover-first checkpoint is the hard gate. Catching a mascot-fit failure here costs 1 cover ($0.20); catching it after the full set burns ~$1.60 of blind gens.

## The dual-ref cohesion rule

Every fill-slide gen passes BOTH refs:

```bash
ralphy generate image --project <id> --slot <style>-NN \
  --model openai/gpt-5.4-image-2 --size 1080x1350 \
  --ref artifacts/refs/mascot-ref.png \
  --ref artifacts/images/<style>-01.png \
  --prompt "$(cat prompts/<style>-NN.json)"
```

- **`mascot-ref.png`** holds the mascot's identity across the deck (no drift in geometry / color / character).
- **`<style>-01.png`** (the approved cover) holds the style's internal cohesion (same paper / light / grade / type) across slides 02-05.

Without both, either the mascot drifts across styles OR the style drifts across slides — usually both.

## The mascot-fit rule

A clean / cute / friendly brand mascot **does not survive** gritty registers (xerox photocopy, halftone, grunge, acid). Forcing the clean asset into them produces a "sticker pasted on a poster" mismatch — the user will reject it.

Two valid moves:
1. **Reinterpret in the medium** (passable). Prompt-token verbatim: *"the <mascot> REDRAWN ENTIRELY IN THE POSTER'S OWN MEDIUM — a 1-bit photocopied duotone screen-print … rough torn edges … NOT a clean 3D object, NOT a glossy sticker cut-out — it must look printed and distressed, fully part of the page"*.
2. **Dedicated distressed character variant** (better). Build `artifacts/refs/mascot-gritty-ref.png` once; pass it instead of the clean ref on punk / acid / xerox slides.

Decide at the cover-first checkpoint, not after the full set.

## JSON prompt schema (one STYLE + QUALITY block per aesthetic)

```json
{
  "scene": "<the per-slide subject — varies per slide>",
  "style": "<reused per style — paper, light, grade, type system, accent>",
  "technical": "<reused per style — printing medium, halftone settings, grain>",
  "composition": {
    "ui_elements": [
      "<headline text baked on slide, exact spelling>",
      "<small label baked on slide>",
      "<one sub-line baked on slide>"
    ]
  },
  "quality": "<reused per style — fidelity tokens + negatives>"
}
```

Locking `style + technical + quality` per aesthetic and only swapping `scene + ui_elements` per slide is what makes a 5-slide set read as one design.

## Single-accent lock

In every prompt body, name the ONE accent color in hex AND add the source hue to AVOID. Example for a brand-orange recolor: `bright Ralphy-ORANGE #FFA630 — NOT green` in description + `"green color"` in the AVOID list. Without this, gpt-image drifts into rainbow chrome and the style identity collapses.

## Default model stack (verify against MODELS.md)

- **Default — `openai/gpt-5.4-image-2`.** Best at baked text (30/30 slides spelled right). Serialize per style (1 concurrent per key for the loop on that style); parallel across styles is fine. Aspect via `--size 1080x1350` (4:5 IG / LinkedIn carousel default), `--size 1080x1080` for 1:1, `--size 1080x1920` for Stories.
- **Fallback — `google/gemini-3-pro-image-preview`.** Faster, but smudges small embedded typography. Use ONLY for fast palette / cover exploration; finalize on gpt-image.

## Failure modes

- **Forcing a clean mascot into gritty styles.** Cost on `ralphy-carousel-001`: $0.40 cover re-rolls + weaker result. Prevention: cover-first checkpoint → reinterpret-in-medium OR dedicated distressed character ref.
- **`rm prompts/<slot>.txt` during a running bg loop.** The loop `cat`s lazily — delete corrupts the batch. Prevention: edit / delete prompt files only after bg jobs finish.
- **Transient TLS / socket exit-1 mid-batch.** ~10 min sunk on `ralphy-carousel-001` (3 slots). No auto-retry in CLI today. Prevention: re-run only the affected slot; the rest of the batch is intact.
- **Abandoning a style direction after slide-02.** Decide direction before generating past one proof. Prevention: cover-first checkpoint is the decision gate.
- **Trying to fan out 2 gpt-image loops in parallel on one key → 403.** Serialize per style; parallel across styles uses different prompts but only as many concurrent calls as the key tolerates (probe-test before fanning out beyond 1 / style).
- **"Use our colors" missing the AVOID hue.** The model defaults toward the source aesthetic's hue; explicit AVOID negates it.

## Aspect ratio

- IG carousel default → `--size 1080x1350` (4:5).
- LinkedIn document-style carousel → same or `--size 1080x1080` (1:1).
- TikTok / Stories carousel → `--size 1080x1920` (9:16).

## CLI cookbook

```bash
# Step 2 — rasterize mascot SVG into a ref PNG (use playwright or a designed render).
# Output: artifacts/refs/mascot-ref.png (and artifacts/refs/mascot-gritty-ref.png for distressed styles).

# Step 4 — cover-first checkpoint — fan out one cover per style in parallel.
for style in zine club swiss riso punk acid; do
  ralphy generate image --project <id> --slot "${style}-01" \
    --model openai/gpt-5.4-image-2 --size 1080x1350 \
    --ref artifacts/refs/mascot-ref.png \
    --prompt "$(cat prompts/${style}-01.json)" &
done
wait
# Show all covers in chat, get user approval per style. Re-roll only mismatches.

# Step 5 — fill 02-05 per approved style (serialized inside a style, parallel across styles).
for style in zine club swiss riso; do
  (
    for slide in 02 03 04 05; do
      ralphy generate image --project <id> --slot "${style}-${slide}" \
        --model openai/gpt-5.4-image-2 --size 1080x1350 \
        --ref artifacts/refs/mascot-ref.png \
        --ref "artifacts/images/${style}-01.png" \
        --prompt "$(cat prompts/${style}-${slide}.json)"
    done
  ) &
done
wait

# Step 6 — contact sheet per style (one row of 5 slides)
for style in zine club swiss riso punk acid; do
  ffmpeg -i "artifacts/images/${style}-01.png" -i "artifacts/images/${style}-02.png" \
         -i "artifacts/images/${style}-03.png" -i "artifacts/images/${style}-04.png" \
         -i "artifacts/images/${style}-05.png" \
         -filter_complex "hstack=inputs=5" "contact/${style}-row.png"
done

# Re-roll a single transient-network failure
ralphy generate image --project <id> --slot riso-01 \
  --model openai/gpt-5.4-image-2 --size 1080x1350 \
  --ref artifacts/refs/mascot-ref.png \
  --prompt "$(cat prompts/riso-01.json)"
```

At ~$0.20 / slide on gpt-image, a **6-style × 5-slide carousel = ~$6.00 minimum** (the `ralphy-carousel-001` reference ran $6.80 / 1.15×).

## See also

- [`docs/skills-vs-templates.md`](../../../docs/skills-vs-templates.md) — why this is a skill and not a template.
- [`.agents/skills/art-director/SKILL.md`](../../../.agents/skills/art-director/SKILL.md) — ref-anchor flow and model picks.
- [`.agents/skills/intake/SKILL.md`](../../../.agents/skills/intake/SKILL.md) — the multi-slide branch.
- `MEMORY.md` — append-only-on-generations, anti-ai-slop image prompts.
- Reference postmortem: `.ralphy/workspaces/<ws>/projects/ralphy-carousel-001/postmortem/` — the cover-first / dual-ref / mascot-fit rules this skill codifies.
