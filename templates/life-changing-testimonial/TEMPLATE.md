# Life-Changing Testimonial — vibe style

**Genre:** person-led peer testimony — a relatable speaker tells their personal story directly to camera. The story is the load-bearing element; the product is mentioned but never the visual hero.
**Length:** 30-60s.
**Format:** TikTok / Reels / Shorts, 9:16, 30fps, 1080×1920.

> **Reference-required gate.** When the testimonial names a real branded product, a product reference (logo / packaging / photo) MUST exist at `workspace/projects/<id>/assets/uploaded/`. When the speaker is a real person (not a generic peer), a persona reference (selfie / avatar) is also required. Without these, `/ralph-art-director` refuses (AGENTS.md hard rule #3). AI-improvised branding on a real product always reads as fake; AI-improvised likeness of a real person is worse. Reference-OPTIONAL only when the variant is generic-pain-pain-solution (no specific brand, no specific person).

## Why this works

The most reliably converting DTC ad pattern in 2024-2026:

1. **Peer trust beats brand trust.** A relatable person saying "this worked for me" outperforms any brand-voice claim by 2-4x in measured DTC tests.
2. **Specific numbers beat adjectives.** "I lost 12 pounds in 9 weeks" outperforms "I lost a lot of weight" by a wide margin. Specificity is the signal that the story is real.
3. **Pain articulated first.** The viewer must recognize their own pain in the speaker's first 3 seconds, or they scroll. The pain is the hook, not the product.
4. **Emotional + specific = the highest-converting combo.** Heartfelt delivery alone reads sappy; specific numbers alone read clinical. Together they convert.
5. **Soft CTA outperforms hard CTA.** "You should try it" lands; "Buy now, link in bio" reads as ad and depresses CVR on cold traffic.

## Vibe anchors

- **Speaker = relatable peer.** Looks like the viewer's friend or coworker, not a model. Warm window light, real-feeling environment (couch, kitchen, car), medium-close-up.
- **Specific number outcomes.** Always: a number, a duration, a sensory detail. "12 pounds in 9 weeks" / "3 years of joint pain" / "pillowcase covered in flakes every morning".
- **Pain state articulated first.** The first 15s is the pain. Don't rush to the product.
- **Product mentioned by name once.** Only after the discovery beat. Not in the hook, not in the outcome detail. The story does the selling, not the brand mention.
- **Soft CTA.** "Honestly, you should try it" / "I tell everyone now" — not "Click the link, use code SAVE20".
- **No salesy tone.** The VO is conversational, confiding, slightly under-energized — like the speaker is telling one friend over coffee, not pitching to a camera.

## Variation axes

| Axis | Options |
|---|---|
| Niche | skincare ("acne gone") / nutra ("joint pain") / fitness ("lost N pounds") / software ("saved my business") / service ("changed how I X") / education ("learned X in N days") |
| Tone | heartfelt-emotional / matter-of-fact-relieved / hyped-grateful |
| Pain-state visualization | talking-only / brief b-roll cutaway (3-5s) / split-screen before-after photos |
| CTA strength | soft ("you should try it") / hard ("link in bio") |
| Speaker mode | real-persona reference (user-supplied selfie or avatar) / AI-avatar archetype (age + gender + vibe descriptor) |
| VO language | any — English, Russian, Spanish, etc. The personal-story arc reads in any language. |

## Narrative arc

```
0-3s    → Pain hook. "I struggled with X for Y years…" — speaker straight to camera, warm light, no product visible.
3-15s   → Pain detail. How long, how bad, specific sensory or numerical detail. 1-2 micro-failures of past attempts. Optional brief b-roll cutaway here (3-5s).
15-25s  → Discovery moment. "Then I found X." Product mentioned by name, ONCE. Tone shifts from heavy to lighter.
25-50s  → Outcome. Specific number + specific duration + specific sensory detail. The longest segment — this is the payload. Speaker visibly relieved / grateful, not performative.
50-60s  → Soft CTA. "You should try it" / "I tell everyone now" / "It honestly changed my life". Hold on speaker's face, light fades or holds.
```

## Required user inputs

1. **Speaker persona** — short description (age, gender, vibe) OR a real-person reference (selfie / avatar).
2. **Pain history** — specific. Duration ("3 years"), severity, what they tried before that didn't work.
3. **Product name** — the thing being credited.
4. **Outcome metrics** — specific numbers + specific duration + specific sensory detail. **Cannot be fabricated by the model** (FTC + trust failure). Must come from the user's brief.
5. **CTA tone** — soft (default) or hard.
6. **(Optional) Niche-specific caption style** — defaults to minimal for skincare/nutra, Hormozi-yellow for fitness/software/education.
7. **(Optional) VO language** — defaults to English.

## Reference-required gate (hard refuse)

When the brief names a real branded product without a reference at `workspace/projects/<id>/assets/uploaded/<product-ref>.<ext>`:

> "The brief credits '<product>' for the result. I need a reference (photo / logo / packaging) — drop one in this chat, or rephrase the brief generically ('this serum', 'a supplement I tried'). I can't ship a testimonial naming a real brand without a reference — it would come out as AI-slop with hallucinated packaging, which on a testimonial is a credibility failure, not a stylistic one."

When the brief specifies a real person without a persona reference:

> "The brief specifies a real person ('<name>'). I need a persona reference (selfie or avatar) at `workspace/projects/<id>/assets/uploaded/`. Otherwise rephrase as a generic peer ('a woman in her 30s', 'a guy who works in tech') and I'll generate an AI-avatar archetype."

When the brief specifies outcome numbers the user didn't provide:

> "I won't fabricate numbers in a testimonial. Tell me the specific outcome (how much, how long, what changed) and I'll write it. Otherwise I'll keep the outcome qualitative ('my skin cleared up', 'I felt better') — softer claim, but real."

## When NOT to use

- **No outcome numbers exist.** If the user can't supply a specific number / duration / sensory detail, the testimonial reads vague and won't convert. Use `before-after-product` instead — the visual transformation carries the load when numbers don't exist.
- **Product needs medical-grade authority.** Prescription, regulated category, clinical claim — use `doctor-authority`. A peer testimonial making medical claims is an FTC problem.
- **No personal story exists.** If the brief is "make an ad for X" with no person and no story, use `ecommerce-ad` (product-forward) or `before-after-product` (transformation-forward). Don't fake a story.
- **Length > 75s.** The pacing depends on a tight 30-60s arc. Past 75s the speaker reads self-indulgent and CVR drops.
- **Multiple speakers / interview format.** This template is single-speaker. For multi-speaker testimonials, use a separate template (not yet built — propose it).

## Cost ballpark

| Stage | Detail | Cost |
|---|---|---|
| Keyframe | 1 × `gemini-3-pro-image-preview` @ $0.15 (canonical speaker frame, reused) | ~$0.15 |
| B-roll keyframe (optional) | 1 × `gemini-3-pro-image-preview` @ $0.15 | ~$0.15 |
| Talking-head clips | 2-4 × `veo-3.1` × 8s @ ~$0.40/s OR `kling-v3.0-pro` × 8s @ $0.14/s | $6.40-$12.80 (veo) / $2.24-$4.48 (kling) |
| B-roll clip (optional) | 1 × `kling-v3.0-pro` × 5s @ $0.14/s | $0.70 |
| VO | 1 ElevenLabs call (subscription) | $0 |
| Music | 1 ElevenLabs Music call (subscription) | $0 |
| Captions | 1 × Scribe v1 (subscription) | $0 |
| Render | local | $0 |
| **Total (premium / veo path)** | | **~$6.70 - $13.80** |
| **Total (budget / kling path)** | | **~$2.50 - $5.50** |

Premium path (veo-3.1) is the default for trust-critical testimonials — lip-sync and micro-expression fidelity are what sell the realism. Drop to kling only when cost-sensitive or when the niche tolerates a slightly more stylized look.

## Read also

- `hooks.md` — 12 testimonial pain hooks with niche fit + claim-discipline notes.
- `prompt-cookbook.md` — master prompt, talking-head vocabulary, VO direction, captions/music spec, 8 mistakes, 4 worked examples.
