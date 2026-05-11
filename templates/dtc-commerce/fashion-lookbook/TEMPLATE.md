# Fashion Lookbook — vibe style

**Genre:** editorial fashion lookbook / model showcase / collection launch.
**Length:** 15-30s. (15s for single-platform vertical lookbook; 25-30s for campaign films / multi-look reels.)
**Format:** 9:16, 30fps, 1080×1920 (default — TikTok / Reels / Shorts). 16:9 1920×1080 for YouTube / campaign films.

> **Reference-required gate.** If the brief names a real brand or shows a specific garment, a reference (garment photo / lookbook still / fabric swatch / logo) MUST exist at `workspace/projects/<id>/assets/uploaded/`. Without it, `/ralph-art-director` refuses (AGENTS.md hard rule #3). AI-improvised "Prada-looking" coats always read as fake. Generic fashion (no brand, fictional collection) may proceed without a reference — log as `stage: "no-ref-consent"` and warn the user.

## Why this works

Fashion video is governed by three forces, in this order:

1. **Movement.** A static garment is a still photo. A walking model wearing the same garment is a video. Every fashion video must have movement — walk, sway, spin, fabric wind. Stationary poses are death.
2. **Lighting.** Fashion lives and dies by light. Golden hour is universally flattering. Studio flash is editorial-crisp. Neon is edge. Backlight is silhouette-drama. Pick one and commit.
3. **Rhythm.** Cuts every 3-5s for energy. Music BPM drives the cut points. Hook in 0-2s or the viewer scrolls. Final beat is a held pose, a brand reveal, or a fade — never a fadeout that runs out of music.

Fashion lookbooks are vibe-driven, not problem-solution-driven. There is no "pain point." There is a garment, a model, an environment, and a feeling. Your job is to make a stranger want to wear the clothes.

## Vibe anchors

- **Editorial lighting.** Choose your light deliberately. Golden hour for romantic / casual / sustainable. Studio flash for haute couture / formal / accessories. Neon for streetwear / contemporary. Backlight for silhouette drama. Mixing lighting types within one 15s reel is amateur hour.
- **Location storytelling.** A white cyc says "luxury minimalism." A brick alley says "streetwear." A garden says "sustainable / romantic." A rooftop says "aspirational urban." The location is not background — it is context that sells the aesthetic.
- **Fabric drape and movement.** Specify how the fabric moves: silk ripples, denim creases, chiffon floats, leather glints, sequins throw light. Fabric in motion is half the value of the format. Static drape is a still photo.
- **Model as character.** Direct the model's energy. Confident strut vs uncertain walk fundamentally changes how viewers read the outfit. Specify walk type, attitude, expression, hand placement.
- **Reference-anchored garments.** Real brand → real reference. The garment in frame must look like the user's reference, not a Gemini hallucination of "luxury fashion."
- **Restraint on text.** No HormoziCaptions. No screaming hooks. Brand name + collection tag, on-screen text only, late in the cut. Fashion sells through visuals; text is decoration.

## Variation axes

| Axis | Options |
|---|---|
| Category | haute couture, streetwear, athleisure, formal/business, casual, swimwear, accessories (shoes/bags/jewelry), sustainable, vintage, evening/party, kids |
| Era / aesthetic | Y2K, 90s minimalism, dark academia, cottagecore, futurism, archival, gorpcore, balletcore |
| Season | spring/summer (light, airy, golden hour, gardens), fall/winter (layers, leather, knit, urban grit) |
| Location | studio white-cyc, urban street, rooftop skyline, lush garden, beach, industrial warehouse, gallery, luxury hotel, desert, water/reflective |
| Lighting | golden hour, studio flash, bright daylight, neon night, soft window, dramatic backlight, gel-color |
| Fabric focus | silk, denim, leather, chiffon, knit, velvet, sequins, lace, technical/performance, fur |
| Look count | 1 look × 15s (focus) / 3 looks × 5s each / 5+ looks rapid-fire (lookbook reel) |
| Music mood | cinematic-orchestral, hip-hop, indie/alt, pop-dance, lo-fi/chill, electronic/synth, acoustic/organic, retro/vintage |

## Narrative arc

### Single look (15s)

```
0-2s    → Hook. Macro fabric / silhouette / mirror reveal / power-walk approach. Camera moves once, decisively.
2-7s    → Approach + fit. Model walks toward camera or rotates 90°. Fabric in motion. Key garment detail visible.
7-12s   → Detail beat. Cut to medium or macro — accessory close-up, fabric texture, hand-on-collar. Lighting peaks.
12-15s  → Final pose. Model held in confident stance. Brand name + collection tag fades in last 2s. Music resolves.
```

### Multi-look (15s, 3 looks)

```
0-2s    → Hook (often Look 1's most striking angle).
2-6s    → Look 1 — walk + 1 turn.
6-7s    → Transition (spin / flash cut / zoom-cut / curtain wipe).
7-10s   → Look 2 — quick showcase, 2 angles max.
10-11s  → Transition.
11-15s  → Look 3 (the signature look) — final pose + brand.
```

### Campaign film (25-30s)

```
0-3s    → Hook (cinematic — silhouette, fabric macro, environmental establish).
3-12s   → Look 1 — full beat: approach, rotation, detail.
12-14s  → Cinematic transition (light shift, environment cut, slow-mo).
14-22s  → Look 2 — full beat.
22-27s  → Final wide — model in environment, fabric flows, golden hour or hero light.
27-30s  → Brand card. Music tail.
```

## Required user inputs

1. **Garment(s)** — what is being shown. Name + category + key details (color, silhouette, fabric).
2. **Reference** — photo of the real garment / brand mood-board / fabric swatch. **REQUIRED** if a real brand is named. Optional but strongly recommended for fictional / generic looks.
3. **Category** — pick from variation-axes table (haute couture, streetwear, athleisure, …).
4. **(Optional) Era / aesthetic** — defaults to "contemporary."
5. **(Optional) Location** — defaults derived from category (e.g. streetwear → urban street, sustainable → garden).
6. **(Optional) Music mood** — defaults derived from category.
7. **(Optional) Look count** — defaults to 1 look × 15s.
8. **(Optional) Voiceover** — defaults to none. Specify if the brief calls for narration.

## Reference-required gate (hard refuse)

If the brief mentions a specific brand or named garment without a file at `workspace/projects/<id>/assets/uploaded/<garment-ref>.<ext>`:

> "The brief mentions '<brand / specific piece>'. I need a reference (product photo / lookbook still / fabric swatch) — drop one in this chat, or rephrase the brief in generic terms ('a black trench coat', 'a knit sweater'). I can't ship this without a reference — the AI will hallucinate the garment and it won't match the real product."

If the brief is generic (no brand, fictional collection), proceed and log as `stage: "no-ref-consent"`.

## When NOT to use

- **Pure product macro** with no model — use `/before-after-product` or a product-only style template instead.
- **Service businesses** with no physical garment — there is nothing to put on a model.
- **Brand-story documentary** — fashion lookbook is mood, not narrative arc. Use a different template.
- **Length > 45s** — the format loses tension. Cut it down or split into a series.
- **More than 5 looks** in 15s — visual fatigue. Either lengthen the video or cut looks.
- **Comedy / skit / character-driven** content — wrong format. Lookbook is editorial, not narrative.

## Cost ballpark

| Stage | Detail | Cost |
|---|---|---|
| Keyframes | 5-6 × `gemini-3-pro-image-preview` @ $0.15 | ~$0.90 |
| Video clips | 4-6 × `kling-v3.0-pro` × 5s @ $0.14/s | $2.80 - $4.20 |
| VO | 0-1 ElevenLabs call (subscription) | $0 |
| Music | 1 ElevenLabs Music call (subscription) | $0 |
| Captions | 0-1 × whisper-1 | ~$0.001 |
| Render | local | $0 |
| **Total** | | **~$3.70 - $5.10** |

Slightly more expensive than `/before-after-product` because lookbooks favor longer cuts and higher clip count. Music is free (subscription). VO is usually omitted.

## Read also

- `hooks.md` — 12 fashion-specific opening shots (mirror reveal, slow-mo turn, fabric macro, power-walk) with model-direction notes.
- `prompt-cookbook.md` — master prompt template, model-direction vocabulary (walks, poses, expressions), location × lighting matrix, fabric showcase recipes, common mistakes, 4 worked examples.
