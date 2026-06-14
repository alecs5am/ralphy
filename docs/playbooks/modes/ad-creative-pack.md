# Mode quality playbook — `ad-creative-pack`

> A batch of N≥4 static performance creatives for a single brand — FB / Meta ad pack / creative matrix. Backing skills: [`/fb-creatives`](../../../.agents/skills/fb-creatives/SKILL.md) + [`/researcher`](../../../.agents/skills/researcher/SKILL.md). Route: `intake → researcher → art-director → producer`.

## Creative objective

Feed the Ads-Manager A/B engine with N visually-distinct creatives that all read as the **same brand at thumb-stop speed**. The pack wins on **brand consistency across distinct registers**: 5 register-buckets (A real-people · B graphic/typography · C proof/data-viz · D meme · E niche-audience), each with 2-8 concepts, glued by the real palette + a hero screenshot ref.

## Required inputs

- Brand site or brand reference (the URL — REQUIRED).
- Hero / product reference.

## Reference requirements

**Site-grounding before ANY prompt is mandatory** (AGENTS #15): dispatch a Playwright sub-agent to crawl home + `/docs` + `/pricing` + `/features` + `/examples` + `/blog`, returning `artifacts/refs/research.md` (digest), `artifacts/refs/tokens.json` (CSS hex), `artifacts/refs/hero.png` (screenshot), and a "Documented API surfaces" list. Then `--ref artifacts/refs/hero.png` on EVERY gen to hold palette + type across the pack. Every palette hex in a prompt must trace to `tokens.json`; every named API symbol in a code-creative must trace to the documented surfaces. The reference-required gate also fires for named real persons / IPs in the A or D set.

## Prompt spine

1. **Aspect per placement:** `--size 1080x1350` (FB feed 4:5), `1080x1080` (IG 1:1), `1080x1920` (Stories) — fan out per placement, never auto-crop.
2. **5-set matrix:** draft the A/B/C/D/E scaffold; surface it in chat; get explicit "go". Default 32-pack mix: A=9, B=8, C=7, D=4, E=4.
3. **Anchor on a specific number:** every headline cites one verifiable lander claim from `brand-dna.md` ("$0.003", "5× cheaper") — generic "Better X for Y" copy dies cold.
4. **Per-slot prompt:** cites brand-DNA hex verbatim, a photographic spec for A-set portraits (camera/lens/grain + "naturalistic, NOT glossy" + a named imperfection), a syntax-color spec for code-cards, and a ban-negative for the slot's known failure.
5. **Deliverable:** numbered PNGs + `ads-copy.md` (primary text · headline · description · CTA × N) + a `README.md` with the Ads-Manager grouping.

## Model recommendations

Verify against `MODELS.md` every run.
- **Default — `openai/gpt-5.4-image-2`.** Production-grade true-parallel (validated 23-concurrent via bash `&`) and crisp typography for wordmarks / price stacks / code-cards. Use for all 5 sets.
- **Fallback — `google/gemini-3-pro-image-preview`.** Fast palette exploration only; smudges small type.

## Style / visual constraints

- One brand palette (real hex) across all 5 registers; the hero ref holds type + color.
- A-set portraits: photoreal candid, real-camera spec, no beauty-filter glaze.
- Price stacks: state the row-by-row strikethrough policy + an anti-token ("no strikethrough on the brand row").
- Code-creatives: only documented API symbols; curl is the strictly-safe fallback for HTTP APIs.

## Common failure modes

- **Brand-DNA invented from memory** → wrong palette burn. Prevention: site-grounding sub-agent + `--ref hero.png`.
- **Hallucinated SDK in code-creatives** → verify every symbol against the documented surfaces; fall back to curl.
- **Generic cold-traffic copy** → anchor each headline on one lander number.
- **Beauty-filter A-set / missing strikethrough policy** → explicit specs + negatives per slot.
- **`ralphy queue` daemon idle** → use bash `&` fan-out for ad-hoc N-image batches.

## Evaluation criteria

`scoreImage` gate (refuses, not warns). Beyond the gate: every creative reads as the same brand at thumbnail speed, palette traces to real tokens, copy anchored on real claims, code symbols verified, full set is visually distinct enough to A/B. Optional `/evaluator` pass before delivery.

## Does NOT apply to:

- A single still / hero / drop poster → use [`/poster`](../../../.agents/skills/poster/SKILL.md) or [`hero-banner.md`](hero-banner.md).
- A swipe-through carousel (one narrative across ordered slides) → use [`social-carousel.md`](social-carousel.md).
- A moving video ad (UGC / unboxing / talking-head) → match the video mode.
- A brief with no concrete brand URL — refuse and ask, the matrix needs a grounded brand.
