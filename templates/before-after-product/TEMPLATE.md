# Before / After Product — vibe reference

**Genre:** classic UGC ad — 5s pain point → 1s product reveal → ~9s demo / transformation.
**Length:** 15-18s.
**Format:** TikTok / Reels / Shorts, 9:16, 30fps, 1080×1920.

> **Reference-required gate.** If the brief mentions a named brand or product, a reference (photo / logo / packaging) MUST exist at `workspace/projects/<id>/assets/uploaded/`. Without it, `/ralph-art-director` refuses (AGENTS.md hard rule #3). AI-improvised packaging on a real brand always reads as fake.

## Why this works

The oldest and most reliably converting UGC ad pattern:

1. **5 seconds of relatable, specific pain.** The viewer recognizes themselves and stops scrolling.
2. **Product / solution lands at the 5s mark.** The reveal is the moment of relief — the emotional payoff.
3. **9 seconds of demo.** Just enough to convince, not so long it overstays.
4. **Tonal arc** in VO and music: frustrated → satisfied. Aural reward for sticking around.

## Vibe anchors

- **Pain point: specific, not abstract.** "The toilet paper rips when you pull it" beats "hygiene problems." Specificity is what makes the viewer recognize themselves.
- **Reveal: a moment, not a long shot.** 0.5-1s of the product appearing clearly, then the demo begins.
- **Don't over-promise.** "It got better" beats "Industry revolution." Hyperbole signals an ad and kills trust.
- **Real environment.** Kitchen, bathroom, bedroom, office — fits the product. Not studio lighting.
- **Reference-anchored visuals.** Product looks exactly like the user's reference. AI must not improvise branding.

## Variation axes

| Axis | Options |
|---|---|
| Product category | cosmetics, food, software, service, fitness, household, fashion |
| Pain point specificity | vague-universal ("I'm always tired") vs niche-specific ("toothpaste leaves spots") |
| Reveal style | gradual (product enters frame) vs dramatic (smash-cut) |
| Voice emotion arc | frustrated→relieved / skeptical→amazed / exhausted→energized |
| VO language | any — English, Russian, Spanish, etc. The visual arc carries regardless. |

## Narrative arc

```
0-2s    → Pain hook. Visual of the problem in action. VO: relatable line.
2-5s    → Pain reinforcement. 1-2 micro-failures or frustrations stack on top.
5-6s    → Reveal. Product appears (product shot or user holding it).
6-12s   → Demo. 2-3 micro-proofs that it works (transformation, before/after split, satisfied reaction).
12-15s  → CTA / outro. Product name, tagline, or happy-user beat.
```

## Required user inputs

1. **Product** — name + category.
2. **Pain point** — what it solves.
3. **Reference** — photo of product / packaging / logo. **REQUIRED.** Without it: refuse.
4. **(Optional) Tone** — frustrated→relieved (default) / skeptical→amazed / exhausted→energized.
5. **(Optional) VO language** — defaults to English; works in any language.

## Reference-required gate (hard refuse)

If the brief mentions a specific brand or product without a file at `workspace/projects/<id>/assets/uploaded/<product-ref>.<ext>`:

> "The brief mentions '<product>'. I need a reference (photo / logo / packaging) — drop one in this chat, or rephrase the brief in generic terms ('this sponge', 'some product'). I can't ship this without a reference — it would come out as AI-slop with hallucinated branding."

## When NOT to use

- Service product without a visual ("legal consultation") — there's nothing to show in the reveal.
- Pure-software (SaaS) without UI screenshots — the reveal lands weakly.
- Brand awareness (not conversion) — this format is built for conversion.
- Length > 25s — the formula loses tension.
- Multiple SKUs in one video — one product per video, always.

## Cost ballpark

| Stage | Detail | Cost |
|---|---|---|
| Keyframes | 5-6 × `gemini-3-pro-image-preview` @ $0.15 | ~$0.90 |
| Video clips | 3-4 × `kling-v3.0-pro` × 5s @ $0.14/s | $2.10 - $2.80 |
| VO | 2 ElevenLabs calls (subscription) | $0 |
| Music | 2 ElevenLabs Music calls (subscription) | $0 |
| Captions | 2 × whisper-1 | ~$0.002 |
| Render | local | $0 |
| **Total** | | **~$3.00 - $3.70** |

Cheap format — short clips + subscription audio.

## Read also

- `fragments.md` — pain-point fragments + product-placement recipes + tonal-arc patterns.
- `model-stack.md` — concrete commands and the reveal-frame quality gate.
- `composition.md` — dual-music split + caption-style split.
- `reference-example.md` — placeholder; fills in after the first real run.
