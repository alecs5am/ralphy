# Prompt cookbook — Streetwear Drop Poster

One parametric prompt block. Fill the `{{slots}}` and pass to
`ralphy generate image --model openai/gpt-5.4-image-2`. Ask for 9:16; post-crop
if the model returns a square.

## Base prompt

```
Vertical 9:16 mobile-first landing poster for a fictional streetwear brand "{{brand_name}}". Y2K skate-surf streetwear, poster-as-landing-page aesthetic, DIY sticker-collage feel, Awwwards/Behance quality, 4k vertical, subtle film grain + slight vignette + CRT warmth.

BACKGROUND: full-bleed {{bg_gradient}} vertical gradient.

TOP BANNER: small tracked uppercase sans-serif intro line in {{accent_hex}}: "{{intro_line}}". Directly below: a MASSIVE chunky slab-serif wordmark reading "{{wordmark}}" in {{accent_hex}} with a thick 3D bevel shadow, like a 90s cereal box / arcade cabinet. Tightly tracked, slightly tilted with playful misalignment, imperfect hand-drawn terminals, a small chrome highlight on top of each letter.

HERO PHOTO (fills ~60% vertical): {{hero_desc}}. On the chest: {{blob_glyph}}. Head tilted, confident youthful expression, slight motion blur in one hand. Soft rim light matching the bg, warm natural skin tones, film grain.

STICKER OVERLAYS (scattered, DIY peel-off vinyl feel, each with a thin white vinyl border + soft cast shadow): an accent-color star (mid-left, tilted) with a photo clipping of the held prop; an accent-color star (mid-right, tilted, visible tape corner) with the blob glyph; a small accent-color star (upper-right) with pixelated bold "NEW / DROP" text, rotated.

BOTTOM BLOCK: centered medium-bold condensed uppercase sans headline in {{accent_hex}} "{{intro_line}}"; below it 4 lines of small italic serif body copy in cream-white: "{{body_copy}}"; an accent CTA pill with dark text "{{cta_text}}"; a very thin full-width bottom strip in muted accent-cream tracked uppercase: "{{brand_name}} · EST. {{year}} · {{tagline}} · WWW.{{url}}".

PALETTE: {{bg_gradient}} bg, accent {{accent_hex}}, cream #F5EFE3, charcoal #1A1A1A linework.
```

## Worked examples (the three source variants)

### BOOM — LOUD KIDS CLUB
- `accent_hex`: marigold `#F4C542` (bevel shadow `#C98A1E`)
- `bg_gradient`: royal-blue `#2E5BAC` → deep-navy `#1A2D4F`
- `hero_desc`: young person, cream knit beanie pulled low, oversized navy hoodie hood-up, holding a round red lollipop at mouth level
- `blob_glyph`: a rough hand-scrawled bright-yellow egg/oval smiley, two black dot eyes + small curved mouth, lowercase "loud" inside
- `intro_line`: "BECAUSE WE'RE YOUNG & LOUD"

### DANG — DAYGLO DELI
- `accent_hex`: mint-green `#7BE3B5` (bevel shadow deep-teal `#1F7A66`)
- `bg_gradient`: hot coral-orange `#FF6B4A` → deep plum-magenta `#5B2A4F`
- `hero_desc`: young woman, long box braids, lilac bucket hat tipped back, cream-and-coral varsity jacket, holding a half-melted twin-stick orange popsicle (one drip caught mid-fall)
- `blob_glyph`: a wonky mint-green cloud-creature, one big off-center cyclops eye + crooked grin, lowercase "dang" beside it
- `intro_line`: "SQUEEZE THE DAY"

### YIKES — STATIC YOUTH
- `accent_hex`: hot-pink `#FF4FA3` (bevel shadow deep-magenta `#9B1E63`)
- `bg_gradient`: chartreuse-lime `#B6FF3A` → deep forest-green `#143A1E`
- `hero_desc`: young guy, bleached buzzcut, tiny round black sunglasses, black-and-lime retro nylon tracksuit jacket, holding a plain glossy black soda can at mouth level (faint fizz spark)
- `blob_glyph`: a lopsided hot-pink star-creature, two black dot eyes + flat mouth, lowercase "static" on its belly
- `intro_line`: "FULLY CHARGED, NEVER CHILL"

## Notes

- Keep ONE accent across wordmark + stickers + headline + CTA.
- Re-roll the **wordmark legibility** first; that is where gpt-image earns its keep over gemini.
- The blob glyph clause must say "ORIGINAL ... NOT any existing brand" every time.
