# Streetwear Drop Poster (streetwear-drop-poster)

A single high-impact **9:16 key-art poster** that reads as a full product-drop landing page in one image. Derived from `loud-kids-poster-001` — three fictional-brand variants (BOOM / DANG / YIKES), each the same fixed architecture re-skinned with a different accent + hero + brand voice.

- **Kind:** vibe-style — the recipe IS the deliverable. No HyperFrames composition; the output is the still.
- **Category:** dtc-commerce (a consumer brand product drop).
- **Format:** poster.
- **Count:** 1 still (re-skin the slots for N variants). **Output:** 9:16 PNG/WebP.

## How to use

```bash
ralphy template use streetwear-drop-poster --project <new-project-id> --brief "<your brand + accent + hero>"
```

There is no render/compose stage — the poster IS the deliverable. Route through `ralphy generate image`.

## The fixed architecture (top → bottom)

1. **Intro line** — small tracked uppercase sans, in the accent color.
2. **Wordmark** — MASSIVE chunky slab-serif shout-word, 3D bevel shadow, chrome highlight, playful misalignment.
3. **Hero photo** (~60% vertical) — cinematic chest-up portrait, wardrobe, an ORIGINAL scribbled blob mascot on the chest, a prop held at mouth level.
4. **Sticker collage** — scattered vinyl stars (thin white border + tape corner + soft shadow) carrying photo clippings, the mascot, and pixel "NEW / DROP" labels.
5. **Copy block** — centered headline + 4 italic serif body lines + accent CTA pill + a thin tracked footer strip (`BRAND · EST. YEAR · TAGLINE · WWW.URL`).

## Required inputs (slots)

| Slot | Required | What |
|---|---|---|
| `brand_name` | yes | Brand name (footer + body). |
| `wordmark` | yes | The giant shout-word (3-5 letters). |
| `accent_hex` | yes | The single saturated accent locked across the whole poster. |
| `bg_gradient` | yes | Full-bleed gradient endpoints. |
| `hero_desc` | yes | Portrait subject, wardrobe, prop, expression. |
| `blob_glyph` | yes | Original hand-scrawled mascot + its lowercase word. |
| `intro_line` | yes | Tracked intro line above the wordmark. |
| `body_copy` | no | 4 italic serif body lines. |
| `cta_text` | no | CTA pill text. |

## Files

| File | What's in it |
|---|---|
| `prompt-cookbook.md` | The full parametric prompt block with `{{slots}}`, plus the three source variants as worked examples. Read this first. |
| `README.md` | Quick orientation + key rules. |

## Cost ballpark

**~$0.6** — one poster on gpt-5.4-image-2 (~$0.20/image) plus 2-3 wordmark/palette re-rolls. Cheap; the cost is iteration on the wordmark legibility, not the gen.

## Key rules

1. **gpt-5.4-image-2 is the default** — baked typography (wordmark, body lines, footer URL) is the whole deliverable, and gpt-image holds small rendered text where gemini smears it.
2. **Lock ONE accent.** Wordmark, stickers, headline, CTA all share the single saturated accent against the gradient. Two accents reads as clip-art.
3. **The blob glyph is ORIGINAL, never an existing logo.** Describe a hand-scrawled shape (egg/cloud/star creature) with dot eyes and the brand word scrawled on it.
4. **Ask for 9:16 directly.** If the model returns a 1024-square, post-crop / outpaint to 9:16 — do not letterbox.
5. **Y2K texture is mandatory:** film grain + slight vignette + CRT warmth. Without it the poster reads sterile-AI, not zine-printed.

## Do not copy literally

LOUD KIDS CLUB / DAYGLO DELI / STATIC YOUTH are fictional placeholders. Reuse the ARCHITECTURE and the register; supply your own brand, accent, hero, and mascot.
