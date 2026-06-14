# Mode quality playbook — `social-carousel`

> A 5-10 slide swipe-through deck with baked text — IG / LinkedIn / TikTok carousel. Backing skill: [`/carousel`](../../../.agents/skills/carousel/SKILL.md). Route: `intake → art-director → ralphy generate image`.

## Creative objective

Earn the swipe and hold cohesion across the set. A carousel wins on **per-slide cohesion + cross-slide identity**: every slide reads as one design language (same paper / light / grade / type system), and the mascot or brand reads as the same entity across the whole deck. The cover does the scroll-stop work; slides 02-N deliver the payload one beat per slide. The deliverable is the baked-text image itself — no compose stage.

## Required inputs

- Topic or narrative (what the deck teaches / sells).

## Reference requirements

No reference required for a no-name mascot + fictional brand. The reference-required gate fires for a named real person / branded product / IP in a slide subject. The carousel's own cohesion refs are mandatory craft, not the gate: a permanent `mascot-ref.png` anchors identity across the deck, and the approved cover (`<style>-01.png`) anchors that style's cohesion across 02-N. Every fill slide passes BOTH (`--ref mascot-ref --ref <style>-01`).

## Prompt spine

1. **Aspect:** `--size 1080x1350` (4:5 IG/LinkedIn default), `1080x1080` (1:1), `1080x1920` (Stories).
2. **Cover-first checkpoint (hard gate):** generate ONE cover per style → show in chat → user approves before filling the rest. Catching a mismatch here costs one cover, not the whole set.
3. **Locked JSON blocks:** one reusable `style` + `technical` + `quality` block per aesthetic; only `scene` + `composition.ui_elements` (the per-slide baked text) varies per slide. This is what makes the set read as one design.
4. **Single-accent lock:** name the ONE accent color in hex AND add the source hue to AVOID, or gpt-image drifts into rainbow chrome.
5. **Dual-ref on every fill slide:** `--ref mascot-ref.png --ref <style>-01.png`.

## Model recommendations

Verify against `MODELS.md` every run.
- **Default — `openai/gpt-5.4-image-2`.** Best baked text (validated 30/30 slides spelled right). Serialize per style (1 concurrent inside a style); parallel ACROSS styles is fine — never run two gen-loops on one key writing the same prompt files.
- **Fallback — `google/gemini-3-pro-image-preview`.** Fast cover exploration only; smudges small type — finalize on gpt-image.

## Style / visual constraints

- Mascot-fit rule: a clean / cute mascot does NOT survive gritty registers (xerox, halftone, grunge, acid) — build a dedicated distressed character variant for those, or reinterpret it in the medium. Decide at the cover-first checkpoint.
- One accent hex per style + the AVOID hue; consistent paper/light/grade across a set.
- Cap baked text per slide at one headline + one label + one sub-line.

## Common failure modes

- **Forcing a clean mascot into gritty styles** → "sticker pasted on a poster". Prevention: distressed variant at the cover gate.
- **Mutating prompt files while a background gen-loop reads them** → corrupts the batch (the loop `cat`s lazily). Edit prompt files only after jobs finish (AGENTS #17).
- **Missing AVOID hue** → model drifts toward the source aesthetic's color.
- **Abandoning a style after slide-02** → decide direction at the cover gate, not mid-set.

## Evaluation criteria

`scoreImage` gate (refuses, not warns). Beyond the gate: each style reads as one design across its slides, the mascot/brand is one entity across all styles, baked copy spelled right, single accent held, cover stops the scroll. Review per style as a horizontal contact sheet.

## Does NOT apply to:

- A single still / drop poster → use [`/poster`](../../../.agents/skills/poster/SKILL.md) or [`pinterest-pin.md`](pinterest-pin.md).
- N static performance ads across registers → use [`ad-creative-pack.md`](ad-creative-pack.md).
- A video where the slides animate / the mascot moves → match a video mode + the editor playbook.
- Reproducing one specific carousel → the remix path, see [`docs/skills-vs-templates.md`](../../skills-vs-templates.md).
