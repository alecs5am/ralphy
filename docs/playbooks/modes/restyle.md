# Mode quality playbook — `restyle`

> Re-skin an existing image into a new aesthetic while keeping the subject — style transfer of a supplied reference. Backing skill: [`/json-prompt-engine`](../../../.agents/skills/json-prompt-engine/SKILL.md). Route: `intake → art-director → ralphy generate image` (source as `--ref`).

## Creative objective

Change the look, keep the subject. A restyle wins on **the target aesthetic landing hard while the subject's identity / pose / layout survives**. The target style IS the deliverable — so the register (target aesthetic, fidelity, what-not-to-touch) is locked up front, not discovered mid-roll. The reader should recognize the same subject in a new world.

## Required inputs

- Source image to restyle (passed as `--ref`).
- Target style description (the aesthetic to convert into).

## Reference requirements

The source image is required and is itself the ref — pass it on every gen with `--ref <source>`. An optional style-reference image can be passed as a second `--ref` to anchor the target aesthetic. The reference-required gate fires when the source depicts a named real person / branded product / IP — the source ref satisfies it. The target style is the **locked register** (`guidelineOrStyleLock.required: true`): state the target aesthetic, the fidelity / strength, and an explicit do-not-touch list before generating.

## Prompt spine

Use the [`/json-prompt-engine`](../../../.agents/skills/json-prompt-engine/SKILL.md) schema, anchored on the source:
1. **Preserve clause** — name what must survive verbatim (subject identity, pose, framing, key layout).
2. **`style` + `technical`** — the full target aesthetic (medium, palette, grade, texture, linework).
3. **Strength / fidelity** — how far to push (light recolor vs full medium change).
4. **`quality.avoid`** — kill the source's original register tokens so the model commits to the target.
5. Pass `--ref <source>` (+ optional `--ref <style-ref>`).

## Model recommendations

Verify against `MODELS.md` every run.
- **Default — `google/gemini-3-pro-image-preview`.** Strongest multi-ref consistency — holds the source subject while applying the new style; supports the source + style-ref dual-ref.
- **Premium — `openai/gpt-5.4-image-2`.** Use when the target aesthetic carries legible baked typography.

## Style / visual constraints

- Commit fully to the target register — a half-applied restyle reads as a filter, not a re-skin.
- Preserve the subject's identity and core composition; the new look rides on the same bones.
- Name the source's original register in `avoid` so the model does not blend back toward it.

## Common failure modes

- **Subject identity drifts** → explicit preserve clause + source `--ref`.
- **Target style only half-lands** → raise strength, put source-register tokens in `avoid`.
- **Blends source + target into mush** → pick one target register and lock it before generating.

## Evaluation criteria

`scoreImage` gate (refuses, not warns). Beyond the gate: the target aesthetic is fully committed, the source subject / pose / layout is preserved and recognizable, no residual source-register tokens.

## Does NOT apply to:

- Generating a fresh concept image from a brief (no source to re-skin) → use [`conceptual-product.md`](conceptual-product.md) or `product-shot`.
- Recovering the prompt from a reference without generating → [`/json-prompt-engine`](../../../.agents/skills/json-prompt-engine/SKILL.md) image-to-prompt only.
- Swapping the on-camera person in a video clip → `/ugc-model-swap`.
- Restyling a video / sequence (not a single still) → match a video mode + the editor playbook.
