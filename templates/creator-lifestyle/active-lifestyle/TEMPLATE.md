# Active Lifestyle — vibe style

**Genre:** aspirational-active UGC — a real-feeling person doing a real activity, product visible but not hero.
**Length:** 12-25s.
**Format:** TikTok / Reels / Shorts, 9:16, 30fps, 1080×1920.

> **Reference-required gate.** If the brief mentions a real brand (cycling-shoe brand, smart-watch model, supplement label, branded jersey, named sunglasses), a reference (photo / logo / product shot) MUST exist at `workspace/projects/<id>/assets/uploaded/`. Without it, `/ralph-art-director` refuses (AGENTS.md hard rule #3). AI-improvised branding on athletic apparel reads as fake within one second — wrong logo geometry, wrong typeface, wrong stitching. Override is allowed only with explicit `"generate without reference, I understand the quality will be worse"`; logged as `stage: "no-ref-consent"`.

## Why this works

This is the format that moves athletic apparel, smart watches, supplements, and outdoor gear better than any direct-response ad:

1. **Aspiration sells the lifestyle, not the product.** The viewer doesn't think "I want that bottle"; they think "I want to be the person who rides at 7am with that bottle." Conversion routes through identification, not through feature-comparison.
2. **Subtle product placement avoids 'ad' pattern-recognition.** A bottle in a bike cage reads as life. A bottle held to camera with a logo facing the lens reads as ad — and the scroll instinct kicks in within half a second.
3. **Real-feeling beats real.** The viewer doesn't need a documentary; they need the *texture* of a real ride / set / flow / hike. AI-generated frames can hit this if camera language and lighting stay diegetic.
4. **The satisfaction beat does the closing work.** The smile-after-the-PR, the deep breath at the summit, the refill at the bottle — that's the moment the viewer projects themselves into the frame. Skip this beat and the format flatlines.

## Vibe anchors

- **Real-feeling, not staged.** Loose hair, sweat sheen, slightly off-center framing, breath fogging the lens. Polished is the enemy.
- **Real environment.** A specific road / court / gym / trail / wave. Not a "generic gym." The specificity is what makes it read as a person, not a model.
- **Real activity action.** Cadence, form, follow-through. The motion has to look like *doing the sport*, not *posing as the sport*. Kling motion guidance lives in `prompt-cookbook.md`.
- **Product visible but not hero.** 60-80% of shots have the product in-frame somewhere, but never hero-framed until the optional outro beat. A water bottle lives in the bike cage, not in the cyclist's hand toward camera. A watch lives on a wrist mid-stride, not in a still close-up. A pre-workout shaker sits on the rack, not in the hand toward lens.
- **Satisfaction-payoff at outro.** 18-25s beat: smile at the horizon, breath heavy after the last set, refill at the fountain, recovery sip. This is non-negotiable.

## Variation axes

| Axis | Options |
|---|---|
| Sport | cycling / padel / gym / yoga / running / hiking / surfing / skiing |
| Product visibility | always-on-frame / glimpses-only / hero-at-outro |
| Tone | driven-energetic / serene-flow / community-friends |
| Time-of-day | golden-hour / midday / dusk |
| Environment | urban / coastal / mountain / studio-gym / park / trail |
| Persona archetype | solo-driven / friends-pair / community-group |

## Narrative arc

```
0-3s    → Establishing. Pull-back-to-action: the camera reveals the activity already in motion.
          (Cyclist mid-climb / padel rally already on / lifter mid-rep / runner already on the trail.)
          Diegetic sound + music drop in.
3-18s   → Activity. Person performs. Product naturally in frame: bottle in cage, watch on wrist
          glanced at mid-stride, shoes during the stride, jersey logo as the camera tracks behind,
          shaker on rack between sets, sunglasses worn through the swing.
          2-4 micro-moments of the activity. Cadence, breath, form.
18-25s  → Satisfaction beat. Smile at horizon / heavy breath / refill / recovery sip / fist-bump.
          Optional last 1.5s: brand title-card overlay (Remotion).
```

## Required user inputs

1. **Sport** — cycling / padel / gym / yoga / running / hiking / surfing / skiing.
2. **Product** — name + category (athletic apparel / smart-watch / supplement / water bottle / sunglasses / cycling-shoe / recovery device / sunscreen).
3. **Reference** — photo / logo / packaging / product shot. **REQUIRED if branded.** Without it: refuse, or accept `no-ref-consent`.
4. **Environment description** — specific road / court / gym / trail / coast / mountain. The more specific, the more it reads as real.
5. **Persona archetype** — solo-driven / friends-pair / community-group + age band + gender + body type cue.
6. **Time-of-day** — golden-hour / midday / dusk. Affects light, music BPM, and tone.
7. **(Optional) Tone override** — driven-energetic (default for cycling/running/gym/padel) / serene-flow (default for yoga/hiking/surf) / community-friends.
8. **(Optional) VO** — usually OFF. If used: ONE conversational outro line, language follows the brief.

## Reference-required gate (hard refuse)

If the brief mentions a specific brand without a file at `workspace/projects/<id>/assets/uploaded/<product-ref>.<ext>`:

> "The brief mentions '<brand>'. I need a reference (photo / logo / product shot) — drop one in this chat, or rephrase in generic terms ('a water bottle', 'a smart-watch', 'cycling shoes'). I can't ship this branded — AI-improvised logos on athletic gear always read as fake within a second."

If the user explicitly says "generate without reference, I understand the quality will be worse," continue and log it as `stage: "no-ref-consent"` in `generations.jsonl`.

## When NOT to use

- **Product needs explanation.** A supplement with a unique mechanism, a recovery device with a non-obvious use — the lifestyle frame doesn't carry the message. Use [`tutorial-how-to`](../tutorial-how-to/TEMPLATE.md).
- **Format must be studio-clean.** Catalog-style product hero, white background, rotation. Use [`product-360`](../product-360/TEMPLATE.md).
- **Pure brand-narrative.** Founder story, brand history, mission piece — no specific product moment. Use [`brand-story`](../brand-story/TEMPLATE.md).
- **Pain-point conversion ad.** Frustration → reveal → demo. Use [`before-after-product`](../before-after-product/TEMPLATE.md).
- **Length > 30s.** The aspiration-loop loses tension; viewer projection breaks. Cap at 25s.

## Cost ballpark

| Stage | Detail | Cost |
|---|---|---|
| Keyframes | 4-6 × `gemini-3-pro-image-preview` @ $0.15 | $0.60 - $0.90 |
| Video clips | 3-6 × `kling-v3.0-pro` × 5s @ $0.14/s | $2.10 - $4.20 |
| VO (optional) | 0-1 ElevenLabs call (subscription) | $0 |
| Music | 1 ElevenLabs Music call (subscription) | $0 |
| Captions | usually none; optional 1 × whisper-1 | ~$0.001 |
| Render | local | $0 |
| **Total** | | **~$2.70 - $5.10** |

Mid-tier cost — most expense lives in 5s Kling clips. Trim to 3 clips at the low end of the duration band for budget runs.

## Read also

- `hooks.md` — 12 active-lifestyle openers with sport fit, time-of-day cue, and audio BPM range.
- `prompt-cookbook.md` — master template, per-sport activity vocabulary, product placement discipline, camera language, music profiles, mistakes, and 4 worked examples.
