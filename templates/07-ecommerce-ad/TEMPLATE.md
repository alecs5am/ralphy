# E-commerce Ad — vibe-style template

**Genre:** conversion-first product advertisement — hook, showcase, lifestyle, CTA.
**Length:** 15-30s (sweet spot 18-22s).
**Format:** 9:16 default (TikTok Shop / Reels / Shorts). 1:1 for IG Feed / Amazon. 16:9 for YouTube. 30fps, 1080×1920 (or platform-equivalent).

> **Reference-required gate.** If the brief mentions a named brand, SKU, or specific product, a reference (photo / logo / packaging) MUST exist at `workspace/projects/<id>/assets/uploaded/`. Without it, `/ralph-art-director` refuses (AGENTS.md hard rule #3). AI-improvised packaging on a real brand always reads as fake and kills conversion — viewers can smell hallucinated logos in under a second.

## Why this works

E-commerce ads are not brand films. They are conversion machines with four jobs, in order:

1. **Stop the scroll (2s).** A specific visual hook — drop, texture macro, before/after, unboxing, etc. Not a slow build. Not a logo card. The viewer decides in under a second.
2. **Make the product the hero (6-12s).** Isolated shot + at least one rotation OR macro detail pass. The viewer needs to "see themselves owning it." E-commerce buyers can't touch — tactile detail through the camera does that work.
3. **Show it in life (3-6s).** Person wearing / using / enjoying it in a relatable setting. Aspirational beats sterile, but authentic-relatable beats both. Lifestyle is what converts the "nice product" reaction into "I want this."
4. **Give a clear next step (2-3s).** Action word + price + urgency. "Shop Now $49 — 48hr flash sale" outperforms "Learn More."

Skip any of the four and the ad underperforms regardless of production polish.

## Vibe anchors

- **Hero shots are non-negotiable.** Every ad needs one moment where the product is the star, isolated, perfectly lit, no distractions. This is the money shot.
- **Multi-angle storytelling.** Front, side, back, detail, top-down. 2-3 angles minimum. Rotations work better than jump-cuts for premium products.
- **Tactile detail.** Macro on fabric weave, metal grain, ingredient shimmer, packaging texture. Buyers compensate for not being able to touch by zooming in mentally — give them the close-up.
- **Lifestyle ≠ studio.** The "in-context" beat must look like a real moment, not a stock photo. Hand reaching for the mug. Earbuds visible during a real workout. The jumpsuit at a real event.
- **Text overlays earn their pixels.** Max 8 words per overlay. One key message per 5 seconds. Benefit > feature > price > urgency.
- **CTA in the final 3 seconds, always.** No CTA = no conversion. Action word + price + urgency.
- **Reference-anchored visuals.** Product looks exactly like the user's reference. AI must not improvise branding. If the user's product is a navy hoodie with a small white logo on the chest, every frame must show a navy hoodie with that exact logo placement — never a black hoodie with a different mark.

## Variation axes

| Axis | Options |
|---|---|
| Category | fashion, beauty, electronics, food, jewelry, home, fitness, toys, automotive, pet |
| Hook type | hero-drop, ASMR-texture, before-after, stop-scroll, unboxing, variant-cascade, ingredient-explosion, problem-solution, in-hand-tease, lifestyle-flash, scarcity, creator-reaction (full menu in `hooks.md`) |
| Platform | TikTok Shop (9:16), Reels (9:16), YouTube Shorts (9:16), Amazon Marketing (1:1 or 16:9), IG Feed (1:1) |
| Color grade | luxury warm-gold / tech cool-blue / wellness soft-natural / food golden-hour / fashion editorial |
| CTA tone | flash-sale urgency / premium pre-order / soft "shop now" / subscription save / scarcity drop |
| Length | 15s (TikTok punchy) / 20s (sweet spot) / 25-30s (story-driven, jewelry / fashion) |

## Narrative arc (default 20s)

```
0-2s    → Hook. One of the 12 patterns from hooks.md. Visual, not text-led.
2-4s    → Product reveal. Hero shot, isolated, clean lighting. First clear look.
4-10s   → Showcase. Multi-angle: rotation OR detail-macro OR variant cascade.
                Optional: ingredient/material callout text.
10-15s  → Lifestyle. Product in real-feeling context. Person, hand, environment.
                Benefit text overlay ("Hydrates. Brightens. Glows.")
15-18s  → Social proof / spec beat. Rating, review count, key feature.
18-20s  → CTA. Price, action verb, urgency. Animated button or underline.
```

For 15s tighten lifestyle; for 25-30s extend lifestyle and add a creator-reaction or testimonial beat.

## Required user inputs

1. **Product** — name, category (one of the 10 in the cookbook), and what it actually does.
2. **Reference** — photo of product / packaging / logo (clean angle, good light). **REQUIRED.** Without it: refuse.
3. **Target platform** — TikTok / IG Reels / YouTube Shorts / Amazon / IG Feed. Drives aspect ratio + cut pace.
4. **Price + offer** — exact number for CTA. With or without discount.
5. **(Optional) Hook preference** — pick from `hooks.md` or let art-director choose by category.
6. **(Optional) Lifestyle context** — who's the buyer, where would they use it. If absent, art-director picks the category default.
7. **(Optional) VO** — most top-performing product ads run music + on-screen text only. VO adds cost and rarely converts better unless the creator-voice is the brand.

## Reference-required gate (hard refuse)

If the brief mentions a specific brand or SKU without a file at `workspace/projects/<id>/assets/uploaded/<product-ref>.<ext>`:

> "The brief mentions '<product>'. I need a reference (photo / logo / packaging) — drop one in this chat, or rephrase the brief in generic terms ('a phone case', 'some skincare serum'). I can't ship a product ad without a reference — AI-hallucinated branding kills conversion and looks fake within the first frame."

If the user explicitly opts out: "generate without reference, I understand the quality will be worse" → log as `stage: "no-ref-consent"` in generations.jsonl and proceed with generic-product framing (no logos, no specific packaging, no readable text on the product).

## When NOT to use

- **Service products** with no physical artifact ("legal consultation", "coaching") — there's nothing to show in a hero shot. Use `talking-head-rant` or `talking-character` instead.
- **Pure SaaS** without strong UI screenshots — the product reveal lands weakly.
- **Brand awareness / mood films** — this template is built for direct conversion. For brand stories use `01-cinematic`.
- **Multiple SKUs in one video** — one product per video. The variant-cascade hook handles color/size of one SKU; it does not handle multiple SKUs.
- **Complex / multi-step demos** — fitness equipment that needs 6 steps to explain. Use a longer-form template or a series.
- **Length > 35s** — conversion drops sharply. Split into two ads.

## Cost ballpark (20s, 5 clips, 9:16)

| Stage | Detail | Cost |
|---|---|---|
| Keyframes | 6-7 × `gemini-3-pro-image-preview` @ $0.15 | ~$1.00 |
| Video clips | 4-5 × `kling-v3.0-pro` × 5s @ $0.14/s | $2.80 - $3.50 |
| VO (optional) | 1-2 ElevenLabs calls (subscription) | $0 |
| Music | 1 ElevenLabs Music call (subscription) | $0 |
| Captions / overlays | composed in Remotion | $0 |
| Render | local | $0 |
| **Total** | | **~$3.80 - $4.50** |

Add ~$1 for jewelry / fashion 25-30s versions (extra clips for rotation + lifestyle).

## Read also

- `hooks.md` — 12 hook patterns with setup, why-it-works, and example.
- `prompt-cookbook.md` — master template, 10 category playbooks, text/CTA strategy, common mistakes, worked examples.
