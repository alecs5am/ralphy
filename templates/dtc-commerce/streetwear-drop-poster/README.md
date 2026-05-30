# Streetwear Drop Poster

One 9:16 image that reads as a full streetwear drop landing page — giant
slab-serif shout-word, cinematic hero portrait, DIY vinyl-sticker collage, and a
bottom copy block. Y2K skate-surf register, single saturated accent on a
full-bleed gradient.

Reproduce:

```bash
ralphy template use streetwear-drop-poster --project <id> --brief "brand <X>, wordmark <SHOUT>, accent <hex>, hero <subject>"
```

- **Format:** poster · **Kind:** vibe-style · **Default model:** `openai/gpt-5.4-image-2`
- **Read first:** `TEMPLATE.md` (architecture + slots), then `prompt-cookbook.md` (the parametric prompt).
- **Source project:** `loud-kids-poster-001` (BOOM / DANG / YIKES variants).

## Why gpt-image, not gemini

The deliverable is mostly **baked typography** — the wordmark, four body lines,
and a footer URL strip all have to render crisp. gpt-5.4-image-2 holds small
rendered text where gemini-3-pro-image smears it. Generate 9:16 directly; if the
model returns a square, post-crop / outpaint rather than letterbox.

## The non-negotiables

- One accent color, locked across wordmark + stickers + headline + CTA.
- The chest blob glyph is **original** (dot-eyed scribble), never an existing logo.
- Film grain + vignette + CRT warmth, or it reads sterile.
