# Y2K streetwear drop poster

> **For the LLM writing the next image prompt.** When the brief says "drop
> poster", "streetwear poster", "poster-as-landing-page", "merch-drop image",
> "hype graphic", "album-cover-style still", or anything that needs a *bold
> character-driven brand poster with one huge readable word* — the rules below
> are the register. This guideline is the prompt reference; the
> [`/poster`](../../.agents/skills/poster/SKILL.md) skill is the
> end-to-end workflow.

## When to apply

Single still images that announce a brand or a drop: a giant exclamation
wordmark, one chest-up character, sticker-collage accents, a vivid gradient.
Works for any aesthetic on the same skeleton — Y2K skate-surf is the validated
default, but vaporwave / grunge-zine / arcade-90s / clean-DTC all ride it.

Do **not** apply to: photoreal human portraits with no poster framing (use
`photoreal-studio-portraits`), product-only renders (`cgi-product-renders`),
or anything that should read as a quiet editorial photo rather than loud
key-art.

## Model picks

| Goal | Model | Why |
|---|---|---|
| Final poster (the wordmark + small copy must read crisp) | `openai/gpt-5.4-image-2` | Premium typography: the beveled wordmark, the footer strip, and the 4-line body copy all stay sharp. Caps at 1 concurrent — serialize batches. |
| Fast palette / composition exploration | `google/gemini-3-pro-image-preview` | Cheaper, ~half the latency, tolerates 4+ concurrent — but smudges small embedded text, so finalize the chosen variant on gpt-image. |

**Aspect ratio:** pass `--size 1080x1920` for a vertical landing poster or
`--size 1080x1080` for a square social post. `ralphy generate image` forwards
this as OpenRouter `image_config.aspect_ratio`, which gpt-image honors — the
in-prompt hint alone is ignored (it would default to 1024²). The square cut is
the strongest feed format for this layout; the vertical cut is the landing cut.

## The fixed architecture (do not restructure — only fill the slots)

Every poster in this register keeps this top-to-bottom stack:

1. **Top banner** — small tracked uppercase intro line in the accent color.
2. **Wordmark** — a MASSIVE chunky slab-serif word with a thick 3D bevel
   shadow and a small chrome highlight per letter, tightly tracked, slightly
   tilted with imperfect hand-drawn terminals. One short shoutable token
   (BOOM / DANG / YIKES / WOW / OOPS).
3. **Hero photo (~60% of height)** — cinematic chest-up portrait, gaze
   slightly up, casual-cool. An **original** hand-scrawled blob glyph on the
   chest (lowercase brand word inside it), and a product held at mouth level
   (lollipop / popsicle / soda can / mic). Soft rim light matching the
   background, warm skin tones, film grain.
4. **Sticker collage** — exactly 3 vinyl stickers, each with a thin white
   border + soft cast shadow + tape corner, scattered at playful angles: one
   star with a product macro, one with the blob face, one small star with a
   pixel "NEW DROP"-type label. More than 3 and the eye has nowhere to rest.
5. **Copy block** — condensed uppercase headline + 4 lines of italic-serif
   body copy in cream + a filled CTA pill.
6. **Footer strip** — very thin, full-width, tracked uppercase:
   `BRAND · EST. YYYY · <process tagline> · WWW.<domain>`.

Finish layer, always on: subtle film grain + slight vignette + faint CRT
warmth + vintage screen-print feel.

## Swap slots (the only things that change between posters)

- **brand / tagline / domain** — the fictional or user-owned label.
- **exclamation** — the wordmark word.
- **hero** — person + wardrobe + expression (vary age / gender / styling).
- **product** — the prop at mouth level. Keep it generic/unbranded unless the
  user owns the brand (otherwise the reference-required gate fires).
- **palette** — background gradient (2 hex) + accent (wordmark/headline) +
  bevel-shadow color + cream body + charcoal linework + product color. Always
  state explicit hex.
- **blob glyph** — an ORIGINAL friendly creature (smiley blob, cyclops cloud,
  lopsided star). Always write "original, NOT any existing brand" or the model
  drifts toward a trademarked smiley mark.
- **aesthetic** — the register (Y2K streetwear default; others ride the same
  scaffold).

## Failure modes

- **Smudged wordmark or body copy** → you finalized on gemini; redo the keeper
  on gpt-5.4-image-2.
- **`403 "Key limit exceeded"`** → parallel gpt-image calls; serialize (cap 1).
- **Glyph looks like a real brand** → you dropped the "original, NOT any
  existing brand" clause.
- **Word unreadable** → the wordmark accent does not contrast the gradient
  hard enough.
- **Apostrophes break the shell** → write the prompt to a `.txt` and pass
  `--prompt "$(cat file.txt)"` instead of inline single quotes.

The three examples here (BOOM / DANG / YIKES) are the same scaffold with three
hard palette / hero / product swaps — read one alongside the source prompt in
`.ralphy/workspaces/<ws>/projects/loud-kids-poster-001/` before drafting a new one.
