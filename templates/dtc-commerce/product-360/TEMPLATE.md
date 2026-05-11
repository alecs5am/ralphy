# Product 360 — Template

> Photorealistic product turntable / multi-angle reveal. 8-15s, 9:16 vertical (or 1:1 square). No VO by default — music + product foley + spec overlays carry the spot. The standard e-commerce conversion clip.

## Header

| Spec | Value |
|---|---|
| Total length | 8-15s (10-12s sweet spot) |
| Aspect | 9:16 (TikTok / Reels / Shorts) — or 1:1 (IG feed / Amazon) |
| Clip count | 2-4 (hook → hero rotation → macro → finale) |
| FPS | 30 |
| Voiceover | **None by default.** Optional 1-line tag at finale ("From $199") only if user explicitly asks. |
| Captions | Spec / feature overlays only — Remotion-rendered, not Whisper-transcribed |
| Music | One track matched to category (cinematic / electronic / piano / percussion) |
| Reference required? | **YES — real product photo / packaging / logo. Hard refuse without it.** |

## Why it works

People scroll past 95% of product ads in 2 seconds. The 360 wins the remaining 5% because:

1. **Motion is information.** A still product image is one POV; a rotation is twelve. Viewers feel they've inspected the object — same psychological payoff as picking it up in a store.
2. **Lighting tells the story before the brand.** Hard rim light = luxury. Soft diffuse = beauty / wellness. Cool clinical = tech. The first half-second of light treatment sets the price tier in the viewer's head.
3. **Hero angle lock at finale.** The eye gets to wander through the rotation, then snaps back to the "best" angle for the CTA — exactly the moment buying intent peaks.
4. **No VO, no acting, no model release.** Pure product. Translates across languages and markets without re-shoots.

## Vibe anchors

The five things that, if any one is broken, make the spot feel cheap:

1. **Turntable smoothness.** Rotation must be jitter-free. Any micro-stutter at 24/30fps reads as AI-glitched. Generate the rotation as a single i2v clip from start-angle keyframe to end-angle keyframe — never stitch multiple short rotations.
2. **Hero angle.** Every product has one view that sells. Watches: front face at 35° tilt. Bags: three-quarter front. Electronics: screen-facing. Shoes: three-quarter profile. Jewelry: light-into-stone. Cosmetics: top-down to side. Identify it BEFORE prompting; the finale always returns to it.
3. **Lighting reveal.** First 0.5s is a lighting move (spotlight snap, halo flare, soft bloom) — not just "camera on, product visible". The reveal is the hook.
4. **Material truth.** Metal must reflect, glass must refract, leather must show grain, fabric must drape. Cool key (5400K+) on metal/glass; warm key (3200-3500K) on leather/wood/skin tones; soft diffuse on cosmetics. Wrong color temp = wrong category positioning.
5. **Single dominant motion.** Either the product rotates and the camera is locked, OR the camera orbits and the product is locked. Doing both at once breaks the illusion — pick one per clip.

## Variation axes (table)

| Axis | Common choices |
|---|---|
| Product category | Jewelry, watches, electronics, cosmetics, footwear, fashion accessories, beverages, home goods, automotive parts |
| Hook style | Spotlight snap, particle materialize, crash & shockwave, peel reveal, macro-to-wide pull, halo light flare, slow lift, half-rotation reveal |
| Rotation pattern | Slow turntable (10-15s/360°, luxury) · Medium (6-8s, fashion) · Fast (2-4s, tech) · Half-spin (180°) · Pendulum (45°↔45°) · Overhead spin · Orbital camera (camera moves, product still) |
| Lighting setup | Single hard key + strong rim (luxury / jewelry) · 3-point soft (cosmetics / beauty) · Cool 3-point clinical (tech) · Grazing warm (leather / wood) · Dramatic spotlight (automotive) |
| Background | Seamless white · Seamless black · Gradient neutral · Reflective surface (mirror/gloss) · Marble / stone / wood · Lifestyle context (desk, hands, outdoor) |
| Music genre | Cinematic strings (luxury) · Ambient electronic (tech) · Soft piano / harp (beauty) · Tight modern percussion (athletic / automotive) |
| Aspect | 9:16 (default, social) · 1:1 (IG feed, Amazon) · 16:9 (product page hero) |

## Narrative arc — the rotation pattern

Four-beat structure. Total 8-15s. Times below assume 12s spot.

**Beat 1 — Hook / Reveal (0-2s).** Lighting move + product enters. Spotlight snaps on in darkness. Particles coalesce. Plastic peels back. Halo flare cascades. The product is NOT yet rotating — it appears, holds for a beat, gleams. Viewer commits.

**Beat 2 — Hero rotation (2-7s).** The 360° turntable. Locked-center camera, product spins on invisible base. Rotation speed = category contract (slow = luxury, fast = tech). Lighting holds steady; the product moves through the light, picking up specular highlights. No cuts in this beat — it's one continuous rotation. Optional: subtle camera push-in during rotation for added dimension.

**Beat 3 — Macro detail (7-10s).** 1-2 quick push-in macros on the highest-value detail surfaces — stitching, engraving, brushed-metal grain, dial face, sole tread, label typography, liquid color. Each macro 1-1.5s. Connected by dissolves or smooth match-cuts, never hard cuts. This is where craftsmanship is "proven".

**Beat 4 — Finale / hero lock + CTA (10-12s).** Return to hero angle, locked center. Lighting subtly shifts warmer (or stronger rim, depending on category). Spec overlays fade in: product name → key feature → price / CTA. Final light flare or sonic chime. Fade out, or freeze on hero with logo.

## Required inputs (read carefully)

This template is **reference-required**. Before any generation, the user MUST provide:

1. **At least one real product photo** at workspace/projects/<id>/assets/uploaded/. Front-facing hero shot is the minimum. The repo's reference-required gate (AGENTS.md hard rule #3) refuses generation otherwise — do not improvise packaging or branding, ever.
2. **Product category** (one of: jewelry, watch, electronics, cosmetics, footwear, fashion accessory, beverage, home good, automotive). Drives lighting, rotation speed, music, and background defaults.
3. **Hero angle nomination** — if the user has a preference, capture it. Otherwise default per category (see Vibe anchors #2).
4. **Final spec / CTA text** — product name (required), 1 key feature (recommended), price or CTA (recommended). All optional but the spot reads stronger with at least name + CTA.

### Multi-angle upload bonus

If the user uploads 3 / 5 / 7 / 9 product photos at different angles, the keyframe generation gets dramatically more reliable. Strategies:

- **3 photos:** front (hero) + side profile + macro detail.
- **5 photos:** front + right side + back + left side + macro/lifestyle.
- **7 photos:** front + 45°R + right + back + 45°L + left + detail/lifestyle.
- **9 photos:** front + every 30° around + detail + lifestyle. Cinematic-grade 360.

More photos = less i2v hallucination on the back / occluded sides. Always recommend at least 3.

## When NOT to use this template

- Naming / featuring a real specific person → use a UGC scenario template instead. 360 is product-only.
- Service / SaaS / digital product with no physical object → 360 is the wrong vibe; use before-after-product or a screen-recording template.
- "Show how it works" / functional demo → 360 shows what it IS, not what it does. Pair with or replace by a demo template.
- Brand-story / founder-narrative spot → 360 is a closer / hero-shot insert, not a standalone narrative.
- Multi-product comparison (this vs. that) → split-screen / comparison template.
- Soft-launch / teaser without a finished product → 360 demands photorealism; concept renders look hollow.
