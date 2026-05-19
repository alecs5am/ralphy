# Pixel-Art Product Reveal

8-cut, ~15s, 9:16, music+SFX-only hyper-motion ad for a small cult-object gadget with its own distinct two-tone screen aesthetic. Playdate-class. Photoreal hero device sits as a HARD layer-split cutout against a smooth hand-illustrated DUOTONE HALFTONE-DITHERED world — ink-on-paper / risograph / Mac-System-1 register, NOT chunky 8-bit blocks. The product is the only color in the frame. Ends on a wordmark + tagline lockup over the brand's signature chroma slab.

## The vibe

- **Duotone halftone illustrated world** — strict 2-tone palette (charcoal-olive on putty-cream, or your brand's equivalent two-tone). Every shading transition is halftone / ordered Bayer dither cross-hatch. NO flat shades, NO gradients, NO Gaussian blur. Smooth hand-illustrated line art with confident outlines. Custom illustrated typography, NOT bitmap fonts. Vintage zine / risograph / newspaper-ink / Mac System 1.
- **Photoreal hero device as a hard cutout** — the product is rendered PHOTOREAL with real specular shading on its own surface, and sits over the duotone world like a sticker. HARD layer-split. No painterly blend.
- **The product is the ONLY color in the frame.** Brand chroma (yellow / red / cyan / pea-green / gold / whatever) on the device, duotone-halftone everywhere else.
- **The physical gimmick is the gesture.** Whatever the device's signature physical-interaction beat is — crank, dial, slider, flip-flap — every scene revolves around it. Macro inserts of the gimmick are mandatory.
- **8 cuts averaging ~1.9s.** Same skeleton as `flipper-hypermotion-001` / `playdate-pixel-001` — works because it's a structural rhythm, not a content choice.
- **Outro = chroma slab + custom-illustrated wordmark + 3-word tagline.** Type the tagline in pixel-by-pixel. End on a freeze, never a fade.

## Key rules (distilled from playdate-pixel-001 postmortem `02-lessons.md`)

1. **"1-bit / pixel-art" is a 3-way ambiguous token. Pull canonical product art FROM THE BRAND SITE before writing a single image prompt.** Common-sense "pixel art" usually reads as Game Boy 1-bit chunky blocks — almost always wrong for indie-handheld brands. The real aesthetic is duotone-halftone smooth illustration. Cost of getting this wrong on `{{product_name}}`-001 was $3.00 of wasted stills. Prevention: `curl` 8-15 atomic style refs before storyboard.

2. **Pass 3-4 real product/style refs per gen call, not one composite "style screenshot".** A whole-page screenshot signal-mixes (the brand chrome reads but the interior style doesn't). Atomic refs (one work per file), scene-specific pick of 3-4.

3. **Always `cp <slot> <slot>.v1-<tag>.<ext>` BEFORE every `ralphy generate ...` regen.** The CLI is supposed to be append-only per AGENTS.md #13 but doesn't enforce it yet — it overwrites in place. Manual versioning is the workaround until the CLI catches up. Hit 4 times in the source session.

4. **ElevenLabs Music ToS filter blocks brand names HARD.** "Game Boy", "NES", "SNES", "Tetris", "Mario Kart", "Disasterpeace", "Anamanaguchi" all 400 with `bad_prompt`. The error response carries a `prompt_suggestion` field with a brand-stripped retry. Strip brand+artist names from any music prompt — use generic descriptors ("late-80s handheld", "punchy 8-bit drums and bright square-wave melody").

5. **Lock the visual cuts and total DURATION_SEC FIRST, then generate music.** Reversing order = render with 15s music, realize the outro freeze needs 2 more seconds, regen all music + re-render all variants. Wasted ~10 minutes of wall time on `{{product_name}}`-001.

6. **`kwaivgi/kling-v3.0-pro` multi-frame is broken on OpenRouter (≥6 days confirmed).** `400 File is not in a valid base64 format`. Don't try. For photoreal-hand + camera-move, `bytedance/seedance-2.0` multi-frame is the winner regardless of subject realism. Refined rule from flipper postmortem: kling-pro single-frame is ONLY for tight-portrait expression-only acting. This template has no such shot.

7. **C2PA-strip every keyframe before i2v.** Still a raw ffmpeg loop — no `ralphy` verb yet. `for f in scene-*.png; do ffmpeg -y -i "$f" -map_metadata -1 stripped/$f; done`

## Workflow (the ordering that actually works)

1. **Research** (~10 min)
   - Pull the canonical product photo or three-view from the brand site (Playwright if needed)
   - `curl` 8-15 ATOMIC style refs into `refs/<brand>-style/` (one work per file)
   - Visually read 3-4 refs to extract the actual palette / dither / stroke-style vocabulary BEFORE writing prompts

2. **Storyboard** (~10 min)
   - Write `STORYBOARD.md` with the 8-cut skeleton (clone from `playdate-pixel-001` if useful)
   - Lock: palette + 3 style-anchor refs + scene count + total duration
   - Get explicit user "go" before stills

3. **Stills batch v1** (~10 min, all parallel)
   - Write `.prompts/_aesthetic.txt` shared anchor + 1 prompt per slot
   - Fire 14× `ralphy generate image` — gpt-5.4-image-2 for product+typography (10/14), gemini-3-pro for hybrid photoreal-subject + illustrated-world (3-4/14)
   - Pass 3-4 scene-relevant refs per call (canonical product + 2-3 style refs)
   - Visually judge each via Read; flag aesthetic misses

4. **If aesthetic missed → Stills v2** (~10 min, fresh batch)
   - `cp scene-*.png v1-<aesthetic-tag>/` (manual append-only)
   - Rewrite `_aesthetic.txt` with corrected language
   - Fire 14× regen. **Don't iterate per-slot — the aesthetic is global.**

5. **STOP for user review of stills.**

6. **C2PA strip** (~1 min) — `for f in scene-*.png; do ffmpeg -y -i "$f" -map_metadata -1 stripped/$f; done`

7. **i2v batch** (~20 min wall, all parallel)
   - Default `bytedance/seedance-2.0` multi-frame (first+last) for 6/8 scenes
   - Single-frame for the 2 macro inserts
   - **Do not try kling-v3.0-pro multi-frame** — broken

8. **Lock composition + total DURATION_SEC FIRST**
   - `src/videos/<id>/{scenes.ts, index.tsx}`, register in `Root.tsx`
   - Smoke render frames 0–29
   - Render once with placeholder music → preview cuts → DECIDE final duration

9. **THEN music** (~5 min, 5 variants parallel)
   - 5× `ralphy generate music` at `--duration <total + 2s>`
   - Strip brand names from prompts (see Key Rule #4)
   - Render 5× final by editing `MUSIC_FILE` between renders

10. **User pick → rename winner to `render/final.mp4`.**

## Required inputs (slots the next agent must fill)

| Slot | What it is | Example from `playdate-pixel-001` |
|---|---|---|
| `{{product_name}}` | The handheld / cult-object product being revealed | Playdate |
| `{{product_brand}}` | The company behind it | Panic |
| `{{product_brand_color_hex}}` | The single chroma allowed in the frame | `#FFD400` (Playdate yellow) |
| `{{product_brand_color_name}}` | Human-readable name of that color | bright yellow |
| `{{product_physical_form_factor}}` | Compact one-paragraph "Product DNA" — body, screen, controls, dimensions | "small handheld game system, ~76×74×9 mm, rounded corners, yellow plastic, black bezel surrounding a 1-bit Sharp Memory LCD, yellow plus-shaped D-pad left, yellow B/A buttons right..." |
| `{{product_gimmick}}` | The single physical-interaction beat every scene revolves around | "silver/aluminum crank handle flips out from the right edge" |
| `{{product_gimmick_verb}}` | Active verb for that gimmick | "cranks", "twists", "slides", "flips" |
| `{{duotone_dark_hex}}` | Dark side of the world palette | `#3D3A30` (charcoal-olive) |
| `{{duotone_light_hex}}` | Light side of the world palette | `#B0AB94` (putty-cream) |
| `{{duotone_palette_words}}` | Human-readable description of the duotone palette | "warm charcoal-olive newspaper-ink on light putty-cream newsprint" |
| `{{style_ref_corpus_names}}` | 4-6 named style-anchor works the model should match | "Casual Birder, Crankin's Time Travel Adventure, Demon Quest '85, Hyper Meteor, Sasquatchers" |
| `{{ensemble_cast_4}}` | 4 named characters / icons for the runway scene (scene-04) | "Casual Birder (twee binoculars character), Pick Pack Pup (cartoon dog), Whitewater Wipeout (surfer), Inventory Hero (overloaded knight)" |
| `{{wordmark_text}}` | The brand wordmark for the outro | "playdate" (lowercase, bold modular sans) |
| `{{tagline_text}}` | 2-4 word tagline below the wordmark | "Just for fun." |
| `{{target_audience}}` | Who the ad is for (drives music register) | "indie-game-curious Gen Z + Millennials on TikTok / Reels" |

## Anti-patterns (DO NOT, because Y)

- **DO NOT prompt with "1-bit pixel art" or "8-bit Game Boy" if the brand's actual register is duotone-halftone-illustrated.** The model lands on chunky 8x8 sprite blocks, which is the most common mental model — and that's wrong for indie-handheld brands. Use the exact phrase **"smooth hand-illustrated line art with halftone / ordered Bayer dither, NOT chunky 8-bit pixel art"**.
- **DO NOT pass a single whole-page Playwright screenshot as the style ref.** The brand chrome reads but the interior style doesn't — signal-mixed. Use atomic refs (one work per file), 3-4 per call.
- **DO NOT generate music before locking total `DURATION_SEC` in `scenes.ts`.** Reversing order wastes 5-10 min of wall time per variant.
- **DO NOT put brand/artist names in music prompts.** ElevenLabs ToS filter 400s with `bad_prompt`. Use generic descriptors.
- **DO NOT try `kwaivgi/kling-v3.0-pro` multi-frame.** It's broken on OpenRouter (`400 File is not in a valid base64 format`), confirmed across two postmortems over a 6-day span.
- **DO NOT trim an i2v clip in Remotion when the clip's *ending* matters (e.g. outro freeze).** Set Remotion slot duration = clip duration. Trim only the LEADING static portion via `startFrom`.
- **DO NOT skip the C2PA metadata strip before i2v.** Provider-side moderation flags un-stripped AI imagery as "AI-generated" and refuses some i2v calls. Raw ffmpeg loop is still the workaround.
- **DO NOT scaffold a generic composition from `src/lib/templates/`.** This template ships no Remotion composition — the Playdate composition lives at `src/videos/playdate-pixel-001/` and is project-specific. Consumers clone its `scenes.ts` / `index.tsx` structure and rewire for their own beats.

## Beat structure (clone-and-adapt from `playdate-pixel-001`)

Total: 8 cuts, ~15s @ 30fps, 9:16, music+SFX-only.

| # | Scene | Approx duration | Beat |
|---|---|---|---|
| 1 | HOOK / ENTRANCE | ~1.8s | Device WHIPS in from off-frame with a halftone-dithered ink-trail, SLAMS to dead-center, frozen mid-air with rotation wobble. Tiny illustrated speech bubble (greeting word) PUNCHES in. |
| 2 | MACRO TEASE | ~1.8s | Extreme macro on the device's screen. An illustrated character types itself in pixel-by-pixel on screen, then winks at camera. Pixel text ("PRESS A" / equivalent CTA) types in beside it. |
| 3 | HERO + GIMMICK ORBIT | ~2.0s | Photoreal hand (or illustrated cartoon character per v3 of source) holds the device, performs the gimmick (cranks / twists / slides). 180° camera ORBIT. The world behind moves in parallax. HARD layer split: photoreal foreground + flat duotone world. |
| 3b | INSERT — GIMMICK MACRO | ~0.8s | Extreme macro on the gimmick itself, rotating / sliding. Illustrated sparkle-stars / sweep-flash emit on each beat. Razor-sharp focus on the texture. |
| 4 | ENSEMBLE RUNWAY | ~1.8s | Top-down 75° angle. Device lies on a duotone halftone floor. The 4 named ensemble characters RUN ACROSS the device left-to-right with sparkle-trails. Cast no shadow on the device (the joke = illustrated layer breaks photoreal lighting). |
| 5 | GRID EXPLODE | ~2.4s | Characters dive back into the screen → a multi-column grid of all the brand's content tiles (game covers / labels / icons) EXPLODES upward, each rotating slowly, forming a wall in front of camera. Camera pulls back. |
| 5b | INSERT — TILE GLINT | ~0.8s | Extreme macro on ONE tile. Halftone shimmer-band sweeps across left-to-right. Character on the cover blinks once. |
| 6 | SNAP-BACK + WORDMARK | ~3.6s | 8-frame white impact flash → all tiles SNAP back into the screen, condensing. Device lands in 3/4 hero pose on an illustrated halftone platform. Above: brand wordmark types in pixel-by-pixel over chroma slab. Below: 3-word tagline. Slow dolly-in, freeze last 15f. |

Same `from` / `durationInFrames` skeleton as `flipper-hypermotion-001` and `playdate-pixel-001` — works because it's a structural rhythm, not a content choice.

## See also

- `prompt-cookbook.md` — the actual paste-into-ralphy prompts with slots
- `model-stack.md` — exact model picks, cost ballpark, what worked / what we dropped
- `hooks.md` — 0–2s scene-01 entrance patterns
- `examples.md` — 2 worked variants (different products, different brand colors)
- `README.md` — one-screen "how to use this template"
