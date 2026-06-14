# Mode quality playbook — `hero-banner`

> A wide website / ad hero banner with a headline plus a product or hero subject. Backing skill: [`/poster`](../../../.agents/skills/poster/SKILL.md). Route: `intake → art-director → ralphy generate image`.

## Creative objective

Carry the value proposition above the fold. A hero banner wins on **one headline + one hero subject** in a wide frame, with the brand's real palette and type holding it together. The reader decides in under a second whether the page is for them — the headline states the promise, the hero subject shows it, the CTA tells them what to do next.

## Required inputs

- Headline or value prop (the one line the banner must land).

## Reference requirements

No reference required when the brand is the user's own / fictional and the subject is generic. The reference-required gate fires for a **named real entity** (a real person, a recognizable branded product, an IP). **Real-brand pre-flight:** when the banner targets a real brand URL, dispatch a Playwright site-grounding sub-agent (AGENTS #15) to crawl home + `/docs` + `/pricing` + `/features` + `/examples` BEFORE drafting brand-DNA — read `artifacts/refs/research.md`, and every `{{palette}}` hex must trace to `artifacts/refs/tokens.json`. Pass `artifacts/refs/hero.png` as `--ref` to hold palette + type. Full discipline: [`docs/playbooks/site-grounding.md`](../site-grounding.md).

## Prompt spine

1. **Aspect:** wide — `--size 1920x1080` (16:9) or `--size 1456x816` for a web hero band; state the exact ratio.
2. **Headline + CTA:** exact copy verbatim, position (usually left or center), accent color in hex from the real tokens.
3. **Hero subject:** product / character / scene placed off the text axis so copy and subject do not fight.
4. **Layout discipline:** clear text zone, breathing room, one filled CTA pill, optional thin footer/nav strip.
5. **Brand fidelity:** real type stack + CTA color from `brand-dna.md`, not invented.

## Model recommendations

Verify against `MODELS.md` every run.
- **Default — `openai/gpt-5.4-image-2`.** Crisp headline + CTA + any small label. `--size` is honored (lands on nearest native bucket). Serialize (1 concurrent).
- **Fallback — `google/gemini-3-pro-image-preview`.** Fast palette/composition exploration only; smudges small type — finalize the winner on gpt-image.

## Style / visual constraints

- Headline accent must contrast the background; brand palette stated in hex.
- One CTA, one headline, optional sub-line — no competing focal points.
- Hero subject and copy occupy separate zones; reserve the text band in the prompt.

## Common failure modes

- **Brand-DNA invented from memory** (wrong palette / dark-bg when site is light) — cost a real burn on `sotaocr-fb-001`. Prevention: site-grounding + `--ref hero.png`.
- **Headline lost in a busy background** → contrasting accent hex, reserved text zone.
- **Gemini smudges the CTA / sub-line** → finalize on gpt-image.

## Evaluation criteria

`scoreImage` gate (refuses, not warns). Beyond the gate: headline + CTA crisp and on-brand, palette traces to real tokens, hero subject reads the offer, true wide frame, copy spelled right.

## Does NOT apply to:

- A tall 2:3 discovery pin → use [`pinterest-pin.md`](pinterest-pin.md).
- A character-driven drop poster (massive wordmark + sticker collage) → the full [`/poster`](../../../.agents/skills/poster/SKILL.md) architecture.
- A batch of N≥4 performance ad creatives → use [`ad-creative-pack.md`](ad-creative-pack.md).
- An animated / video hero → match a video mode + the editor playbook.
- A brief with no named brand URL — site-grounding does not fire; proceed with the brief's stated palette.
