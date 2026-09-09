# Mode quality playbook — `pinterest-pin`

> A tall 2:3 Pinterest pin with baked overlay text — a discovery-feed still. Backing skill: [`/poster`](../../../.agents/skills/poster/SKILL.md). Route: `intake → art-director → ralphy generate image`.

## Creative objective

Stop the vertical discovery scroll and earn the save. A pin wins on **one readable promise** — a benefit-led headline baked into the image — plus a single strong subject. The reader skims dozens of pins per second; the headline must be legible at thumbnail size and the image must telegraph the topic before a word is read.

## Required inputs

- Topic or product (what the pin is about).

## Reference requirements

No reference required for generic / no-name topics. The reference-required gate fires only for a **named real entity** in the subject (a real person, a recognizable branded product, an IP) — refuse without a ref or a logged `--no-ref-consent`. A fictional brand + a generic subject proceeds without a ref; if a brand glyph appears, state it is ORIGINAL ("NOT any existing brand") so the model does not drift toward a trademark.

## Prompt spine

1. **Aspect:** `--size 1000x1500` (2:3) — the native pin ratio.
2. **Headline-first:** name the exact overlay copy verbatim, its position (usually upper or lower third), and a high-contrast accent color in hex. Reserve a clear text zone the subject does not crowd.
3. **Subject block:** the hero subject described concretely, lit to read at small size.
4. **Hierarchy:** eye lands on the headline → subject → secondary label / CTA. Cap baked text at one headline + one short sub-line.
5. **Finish:** clean, bright, high-key reads best in the feed; keep the palette tight (1 accent).

## Model recommendations

Verify against `MODELS.md` every run.
- **Default — `openai/gpt-5.4-image-2`.** Crisp baked typography is the whole game; the headline and sub-line read sharp. Serialize (1 concurrent) — do not fan out parallel gens on this model.
- **Fallback — `google/gemini-3-pro-image-preview`.** Faster/cheaper for fast composition exploration, but smudges small embedded type — never finalize a typography-heavy pin here.

## Style / visual constraints

- One accent color, stated in hex; it must contrast the background hard or the headline dies.
- Headline legible at thumbnail scale — large weight, generous tracking, no thin script for the primary line.
- No more than two text blocks. A cluttered pin has nowhere for the eye to rest.

## Common failure modes

- **Headline same value as the background** → unreadable in-feed. Lock a contrasting accent hex.
- **Subject crowds the text zone** → reserve the headline band in the prompt.
- **Gemini smudges the sub-line** → finalize on gpt-image.
- **Glyph drifts toward a real trademark** → add "original, NOT any existing brand".

## Evaluation criteria

`scoreImage` gate (refuses, not warns — two fails in a row → stop and report options). Beyond the gate: headline readable at thumbnail size, subject reads the topic instantly, one clean accent, exact copy spelled right, true 2:3 frame.

## Does NOT apply to:

- A wide website / ad hero banner → use [`hero-banner.md`](hero-banner.md).
- A 5-10 slide swipe-through → use [`social-carousel.md`](social-carousel.md).
- A character-driven brand drop poster (massive wordmark + hero collage) → that is the full [`/poster`](../../../.agents/skills/poster/SKILL.md) architecture, not a discovery pin.
- A moving video / animated pin → match a video mode + the editor playbook.
- Reproducing one specific pin → the remix path (`ralphy template use <slug>`), see [`docs/skills-vs-templates.md`](../../skills-vs-templates.md).
