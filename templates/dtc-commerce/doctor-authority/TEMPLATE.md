# Doctor Authority — vibe / style reference

**Genre:** medical / clinical authority figure explains why a product, ingredient, or approach works. Dominant nutra / supplements / skincare / wellness DTC ad pattern.
**Length:** 20-45s.
**Format:** TikTok / Reels / Shorts, 9:16, 30fps, 1080×1920.
**Tone:** calm authoritative. Not excited. Not salesy.

> **Reference-required gate.** Two flavors apply. (a) If the brief invokes a specific branded product, a product reference (photo / packaging / logo) MUST exist at `workspace/projects/<id>/assets/uploaded/`. (b) If the brief invokes a real-named medical professional, refuse outright unless written consent is supplied. Both are AGENTS.md hard rule #3 enforcement points. AI-improvised branding on a real product reads as fake; impersonating a real-named professional is a defamation and compliance risk.

## Why this works

The white coat is the visual signal. The mechanism explanation is the trust deepener.

1. **Trust shortcut.** White coat / scrubs / stethoscope / clinical background reads as credibility in under 1 second — before the words land. The viewer pre-decides "this person knows what they're talking about" and only then listens.
2. **Mechanism > claim.** "Niacinamide regulates sebum production by signaling to your skin's barrier" beats "this works for acne." The viewer leaves with a tiny piece of science they can repeat — that ownership is what converts.
3. **Calm = expensive.** Excited tone signals "ad." Calm clinical pacing (130 WPM) signals "expert sharing." The same words read very differently at the two tempos.
4. **Soft CTA.** "I usually recommend X" beats "Buy now!" The recommendation is what someone trusted said, not what someone selling told you.

The #1 conversion driver in nutra / supplement / skincare DTC ads in 2024-2026. Also the format with the most regulatory exposure — read the compliance section before generating.

## Vibe anchors

- **White coat or scrubs — visible signal.** Coat lapel, ID badge optional, stethoscope optional, but the coat is non-negotiable. If you can't see the coat, the trust signal evaporates.
- **Clinical or professional background.** Anatomy poster, framed credentials on the wall, clean desk, organized shelves, neutral wall. NOT a kitchen, NOT a car, NOT a bathroom.
- **Calm authoritative tone.** Mid-register voice. Slow cadence (~130 WPM). No exclamation marks. No "GAME-CHANGER!" No "TRUST ME!" If the VO sounds excited, the format breaks.
- **Specific ingredient or mechanism.** Name the molecule. Name the receptor. Name the body system. Vagueness ("supports wellness") reads as a fake doctor.
- **Soft recommendation, not a sale.** "I recommend my patients try…" / "This is what I tell people with…" / "If I had to pick one ingredient…"
- **Reference-anchored product visuals.** Product looks exactly like the user's reference. AI must not improvise branding (same gate as `before-after-product`).

## Variation axes

| Axis | Options |
|---|---|
| Profession | dermatologist, nutritionist, dentist, pharmacist, cardiologist, GP, sleep specialist |
| Setting | clinical office, home office with credentials wall, pharmacy counter, neutral studio with anatomy poster |
| Real-vs-AI | real licensed actor with usage consent / AI-avatar (synthetic doctor) |
| Claim type | mechanism-explainer, ingredient-recommendation, lifestyle-advice, protocol-walkthrough |
| VO language | any — English, Russian, Spanish, Portuguese. The white-coat visual carries the trust signal regardless. |

## Narrative arc

```
0-3s    → Authority hook. Cold open on the figure (mid-shot, white coat visible).
          VO: "As a dermatologist, I tell every patient…"
3-15s   → Problem framing in clinical language.
          VO: "If you have [pain state], here's what's actually happening at the cellular level."
15-30s  → Mechanism. Cause → mechanism → outcome. Three sentences, clinically structured.
          Optional cutaway b-roll: ingredient close-up, microscope abstraction, lab beaker, anatomical diagram.
30-40s  → Ingredient / product name + recommendation. Held shot of the figure for trust transfer.
          VO: "That's why I usually recommend [ingredient/product] to my patients."
40-45s  → Soft CTA. Often a one-liner referral.
          VO: "If you want the brand I trust, it's in my bio." or "Look for [ingredient] on the label."
```

## Required user inputs

1. **Profession** — dermatologist / nutritionist / dentist / pharmacist / cardiologist / GP / etc.
2. **Claim or mechanism** — what they're explaining (e.g. "niacinamide regulates sebum"). Specific. Not "wellness."
3. **Ingredient or product name** — the soft-recommendation payload.
4. **Real-vs-AI choice** — real licensed actor (with consent) OR AI-avatar (synthetic doctor).
5. **(Optional) Setting** — clinical office (default) / home office / pharmacy / studio.
6. **(Optional) VO language** — defaults to English; works in any.
7. **Product reference** — REQUIRED if a branded product is being recommended on-screen.

## Compliance (read before generating)

This format walks a regulatory line. Two hard rules:

1. **No real-named medical professional impersonation.** "As Dr. Jane Doe, dermatologist at X clinic, I tell patients…" → REFUSE unless the user supplies written consent from the named professional. This is an AGENTS.md hard rule #3 enforcement and a defamation / right-of-publicity issue. Generic "a dermatologist" with an AI face is fine.

2. **No therapeutic / curative claims.** "Cures acne", "reverses diabetes", "treats depression", "prevents Alzheimer's" → REFUSE. Therapeutic claims require regulatory backing this template does not produce. Reframe as mechanism / support language: "may support healthy skin barrier function," "associated with calmer cortisol response in studies." If the user insists on a curative claim, refuse and offer the mechanism reframe.

Platform-side C2PA provenance metadata is emitted automatically by `ralphy render` with `genai: true`. No visible on-screen AI-disclosure overlay — viewers consistently react negatively to visible AI labels and retention drops.

The reference-required gate copy:

> "The brief mentions '<product>'. I need a product reference (photo / packaging / logo) — drop one in this chat, or rephrase the brief in generic terms ('a magnesium supplement', 'a niacinamide serum'). I can't ship this without a reference — it would come out as AI-slop with hallucinated branding, and on a medical-authority format that's a regulatory issue, not just an aesthetic one."

The real-named-professional refusal copy:

> "The brief invokes '<Dr. Real Name>'. Impersonating a real-named medical professional in an AI-generated video is a hard refuse — both AGENTS.md rule #3 and a defamation / right-of-publicity issue. Either supply written consent from the named professional, or rephrase as a generic figure ('a dermatologist', 'a board-certified nutritionist') with an AI-generated face."

## When NOT to use

- **Claim requires hard medical evidence.** Curing-disease claims, prescription-drug comparisons, anti-vaccine narratives — the format amplifies regulatory risk. Do not use.
- **Product has no clinical mechanism story.** Fashion items, generic lifestyle products, novelty SKUs — there's nothing for the doctor to explain. Use [`life-changing-testimonial`](../life-changing-testimonial/) instead.
- **Audience is anti-establishment.** Some demos (alt-health, "big pharma is lying") actively distrust the white coat. The format inverts and hurts. Use [`life-changing-testimonial`](../life-changing-testimonial/) or [`talking-head-rant`](../talking-head-rant/) instead.
- **Brand awareness, not conversion.** This format is engineered for conversion via authority transfer. For top-of-funnel awareness, use [`brand-story`](../brand-story/) or trend-led formats.
- **Length > 60s.** Authority signal fatigues fast. The pattern peaks at 30-40s.

## Cost ballpark

| Stage | Detail | Cost |
|---|---|---|
| Authority keyframe | 1-2 × `gemini-3-pro-image-preview` @ $0.15 | $0.15 - $0.30 |
| Talking-head clip | 1 × `veo-3.1` × 8-12s @ ~$0.40/s | $3.20 - $4.80 |
| Optional cutaway b-roll | 1-2 × `kling-v3.0-pro` × 5s @ $0.14/s | $0 - $1.40 |
| VO | 1 ElevenLabs call (subscription) | $0 |
| Music | 0-1 ElevenLabs Music call (subscription) | $0 |
| Captions | 1 × ElevenLabs Scribe | ~$0.001 |
| Render | local | $0 |
| **Total** | | **~$3.35 - $6.50** |

Premium-tier i2v (`veo-3.1`) is the cost driver — trust depends on micro-expression realism and lip-sync, which the cheaper models break.

## Read also

- `hooks.md` — 12 doctor-authority hooks per profession + niche + claim-discipline notes.
- `prompt-cookbook.md` — keyframe prompts, VO direction, caption style, music, mechanism-explainer pattern, common mistakes, 4 worked examples.
