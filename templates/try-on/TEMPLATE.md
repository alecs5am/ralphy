# Try-On — vibe style

**Genre:** virtual try-on / multi-variant product showcase / conversion-first ecommerce reel.
**Length:** 8-25s. (8-12s for 3-variant snap reels; 15-20s for 5-variant looks; 20-25s for 7-variant tier-list-style runs.)
**Format:** 9:16, 30fps, 1080×1920. Vertical only — try-on is mirror / front-cam native.

> **Reference-required gate.** If the brief names a real brand, real garment, or real SKU, a reference (product photo / packaging / lookbook still / fabric swatch / frame shot / lipstick swatch) MUST exist at `workspace/projects/<id>/assets/uploaded/`. Without it, `/ralph-art-director` refuses (AGENTS.md hard rule #3). AI-improvised "Ray-Ban-looking" frames or "MAC-style" lipstick always read as fake and will not match the SKU you're trying to sell. Generic content (no brand, no specific SKU) may proceed without a reference — log as `stage: "no-ref-consent"` and warn the user.

## Why this works

Try-on is the highest-converting UGC format for fashion / beauty / eyewear / accessory ecommerce. Three forces:

1. **Projection.** The viewer sees a model their age / body-type / skin-tone wearing the product and mentally projects "how would this look on me." That projection is the only thing standing between scroll and add-to-cart.
2. **Decision-friction reduction.** A single product shot makes the viewer wonder "but does the next color look better?" — and they leave to check. Multi-variant in the same reel keeps the decision inside the video. They pick a favorite, not whether to keep watching.
3. **Multi-variant in <30s = "decide", not "browse".** The classic carousel says "here are 12 colors." Try-on says "here are 5, the last one is the one." Format implies a recommendation. That cuts decision fatigue in half.

This is not a lookbook (`/13-fashion-lookbook` for editorial slowness). This is conversion. Beat-snap cuts, readable price overlay, decisive winner pose at the end.

## Vibe anchors

- **Face / body consistency across variants.** Same face. Same lighting. Same camera angle. Same pose family. Only the product changes. Drift in any of those between variants reads as "different person each time" and breaks projection. Use ONE seed model image (gemini-3 ref) and generate all variant frames against it.
- **Mirror or front-cam framing.** Mirror selfie (model holding phone, full-body or waist-up) or direct front-cam (selfie-style, head-and-shoulders for makeup / glasses / earrings). Pick one and commit. Mixing framings inside one reel feels like a slideshow, not a try-on.
- **Beat-snap transitions.** Cuts land ON the beat. If the music has BPM 120, every variant change at multiples of 0.5s. Off-beat cuts kill the format faster than anything else.
- **Large readable price / SKU overlay.** Bottom-third, large bold sans-serif, product name + SKU + price. Fades in for each variant, fades out on transition. If the viewer can't read the price in 1.5s, it's not there.
- **Decisive winner at the end.** Final 2-3s holds on ONE variant — the "this one" pick. Pose is more confident, lighting peaks, overlay stays longer. No fadeout into "hope you liked this video" — the format ends on the recommendation.
- **Reference-anchored products.** Real brand → real reference. Hallucinated frames / colors / cuts will not match the SKU and will tank conversion when the viewer clicks through and sees something different.

## Variation axes

| Axis | Options |
|---|---|
| Category | fashion (tops / dresses / pants / outerwear), glasses (sunglasses / optical / readers), makeup (lipstick / eyeshadow / blush / foundation), jewelry (earrings / necklaces / rings / bracelets), hair (color / style / wig / extensions), shoes (sneakers / heels / boots) |
| Transition style | mirror-flash (8-frame white flash), spin (24-frame rotation), snap-cut (1-frame hard cut on snap or finger snap), walk-into-camera (30-frame approach + change at frame 30) |
| Variant count | 3 (8-12s reel), 5 (15-20s reel), 7 (20-25s reel) |
| Price overlay | yes (ecommerce conversion default) / no (pure vibe / brand-aware) |
| Framing | mirror selfie (full-body / waist-up), front-cam direct (head-and-shoulders), full-body wide (whole-room mirror) |
| Model archetype | real reference photo (user provides) / persona archetype (workspace persona) / generic AI model (no real person) |
| Music mood | upbeat pop, hip-hop, electronic / hyperpop, lo-fi chill, trend audio (TikTok-licensed) |

## Narrative arc

### 3-variant snap reel (8-12s)

```
0-2s    → Hook. Establishing shot — model in mirror or front-cam, base look + first variant on. Overlay fades in: "Trying on [N] [category] under $[Y]".
2-4s    → Variant 1 → 2 transition (snap or mirror-flash on beat). Overlay updates.
4-7s    → Variant 2 → 3 transition.
7-10s   → Variant 3 hold (winner). Confident pose. Overlay stays. Optional: "this one ✓" tag.
10-12s  → Brand / link / CTA.
```

### 5-variant cycle (15-20s)

```
0-2s    → Hook. Base + Variant 1.
2-4s    → V1 → V2.
4-6s    → V2 → V3.
6-8s    → V3 → V4.
8-12s   → V4 → V5 (the winner — held longer).
12-18s  → Winner hold + overlay + optional VO tag.
18-20s  → Brand / link.
```

### 7-variant tier-list run (20-25s)

```
0-2s    → Hook ("Rate these 1-10").
2-18s   → 7 × ~2.3s variants on beat. Optional: tier-list overlay (S / A / B / C) appears on each.
18-22s  → "S-tier" winner held — confident pose, overlay locked.
22-25s  → Brand / link / CTA.
```

## Required user inputs

1. **Category** — fashion / glasses / makeup / jewelry / hair / shoes.
2. **Products** — N real products with photos. Min 3, max 7. Each: name + SKU + price + reference photo.
3. **Model reference** — real photo of the person trying on, OR a workspace persona archetype, OR explicit "use a generic AI model." **REQUIRED** if a real person's likeness is used.
4. **Variant count** — 3 / 5 / 7 (defaults to 5).
5. **Transition style** — mirror-flash / spin / snap-cut / walk-into-camera (defaults to snap-cut for speed).
6. **(Optional) Framing** — mirror selfie / front-cam / full-body wide (defaults derived from category — makeup → front-cam, fashion → mirror selfie or full-body).
7. **(Optional) Music mood** — upbeat pop default; or trend-audio tag if uploading TikTok-native.
8. **(Optional) Price overlay** — defaults to yes.
9. **(Optional) Winner pick** — which variant holds at the end. Defaults to last in sequence.

## Reference-required gate (hard refuse)

If the brief mentions a specific brand or named SKU without a file at `workspace/projects/<id>/assets/uploaded/<product-ref>.<ext>`:

> "The brief mentions '<brand / specific SKU>'. I need a reference photo for each product you want me to try on (real garment shot / frame photo / lipstick swatch / earring close-up) — drop them in this chat, or rephrase the brief in generic terms ('a black dress', 'red lipstick'). I can't ship this without references — the AI will hallucinate the products and they won't match what you're actually selling. When the viewer clicks through to your store and sees something different, the conversion you bought with this reel evaporates."

If the brief is generic (no brand, no SKU), proceed and log as `stage: "no-ref-consent"`.

## When NOT to use

- **Editorial slowness / single hero garment** — use `/13-fashion-lookbook`. Try-on is fast and conversion-first; lookbook is mood and brand-first.
- **Single product variant only** — use `/09-product-360` or `/07-ecommerce-ad`. Try-on requires ≥3 variants to justify the format.
- **Pure problem → solution storytelling** — use `/before-after-product`. Try-on has no pain point; it has a choice.
- **Service / SaaS / non-physical** — there is nothing to try on.
- **Length > 30s** — variant fatigue. Either cut variants or split into a series.
- **Variants of fundamentally different products** (a dress + a frying pan + a phone case) — try-on requires same category. Mixed-category showcase = product-grid template, not try-on.

## Cost ballpark

| Stage | Detail | Cost |
|---|---|---|
| Keyframes | 1 seed + N variants × `gemini-3-pro-image-preview` @ $0.15 (5 variants → 6 keyframes) | ~$0.90 |
| Video clips | 5-7 × `kling-v3.0-pro` × 2-3s @ $0.14/s | $1.40 - $2.95 |
| VO | 0-1 ElevenLabs call (subscription) | $0 |
| Music | 1 ElevenLabs Music call (subscription) | $0 |
| Captions | 0 (text overlay only) | $0 |
| Render | local | $0 |
| **Total** | | **~$2.30 - $3.85** |

Cheaper than `/13-fashion-lookbook` because clips are shorter (2-3s vs 5s). The cost driver is variant count — 7-variant tier-list runs hit ~$4.

## Read also

- `hooks.md` — 12 try-on opening patterns (under-$X challenge, rate-1-10, found-at-store, try-with-me, tier-list, X-looks-which-favorite) with niche fit + transition cue per pattern.
- `prompt-cookbook.md` — master prompt template, character-consistency discipline, per-category variant vocabulary (fashion / glasses / makeup / jewelry), transition design (frame counts), price overlay design, common mistakes, 4 worked examples (sunglasses / outfits / lipstick / earrings).
