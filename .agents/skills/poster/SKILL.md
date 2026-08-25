---
name: poster
namespace: user
description: >-
  How to make a vivid, character-driven brand POSTER — a single still image, not a video. A generalized overlay on the art-director step: supplies the poster-as-landing architecture (top banner → massive beveled wordmark → chest-up hero photo → scattered vinyl-sticker collage → copy block → thin footer strip), the parameterized slot set (brand, exclamation word, hero, product, palette, original blob glyph, aesthetic register), the model stack (gpt-5.4-image-2 for crisp typography, gemini fallback), and the niche's failure modes. Works for ANY brand and ANY aesthetic the user names — Y2K streetwear, vaporwave, grunge zine, clean DTC — the skill supplies the layout know-how, the user supplies the subject + vibe.
  USE WHEN the user asks for a poster / flyer / drop poster / "poster-as-landing-page" / brand key-art / album-cover-style still / hype graphic, with no specific existing poster to reproduce.
  This is a content-niche craft-overlay SKILL (generalized), loaded on top of a poster-format template match — not a remix TEMPLATE (one specific poster). For "remix this exact poster but swap X", that is the remix path in docs/skills-vs-templates.md. For a moving video, match the video format / template and load the matching video craft-overlay skill (ugc-*).
---

## Trigger

**FIRES** on a generic still-poster brief: "make a poster for <brand>", "drop poster", "poster-as-landing-page", "flyer", "key art", "hype graphic", "album-cover style still", "merch drop announcement image". Any subject, any aesthetic — the skill is subject- and style-agnostic.

**DO NOT FIRE** when:
- The user points at one specific poster to reproduce (`@template:<slug>`, "remix this one", names a slug) → that is the **remix path**. See [`docs/skills-vs-templates.md`](../../../docs/skills-vs-templates.md).
- The user wants a moving video (the wordmark animates, the hero talks) → match the video format / template, load the matching video craft-overlay skill (`ugc-*`), and use the editor playbook, not this skill.
- The user pasted `@guideline:<slug>` for a register this poster sits in (photoreal humans, anti-AI-slop) → run `ralphy guideline show <slug>` first and fold its rules into the hero-photo slot.

## What this skill is

A generalized layout overlay, not a finished poster. It does not name a brand, a hero, or a palette — it tells the art-director HOW this class of poster is built so a strong one comes out for whatever the user is promoting. It runs **through** `ralphy generate image`; it does not bypass the reference-required gate or the quality gate.

## Hard invariants

- All generation routes through `ralphy generate image` (no raw API). Read `MODELS.md` before naming any model id — the stack below is a default, not a hardcode.
- The reference-required gate still fires for a **named real entity** in the hero or product slot (a real person, a recognizable branded product, an IP). A fictional brand + an original glyph + a generic product proceeds **without** a ref. Make the brand glyph explicitly ORIGINAL in the prompt ("NOT any existing brand") so the model does not drift toward a trademarked mark.
- The quality gate refuses, not warns — two failed `scoreImage` in a row → stop and report options.
- **Real-brand pre-flight: site-grounding before any prompt.** If the poster targets a real brand (user's own startup, a customer's site, any URL given), **dispatch a Playwright sub-agent** to crawl home + `/docs` + `/pricing` + `/features` + `/examples` BEFORE drafting the brand-DNA or prompt. Read `artifacts/refs/research.md` (the sub-agent's digest), not just a WebFetch of the home page. Every `{{palette}}` hex must trace to `artifacts/refs/tokens.json`; every named API symbol in body copy or code-creative slots must trace to "Documented API surfaces" in `research.md`. Full discipline + sub-agent prompt template: [`.agents/skills/researcher/references/site-grounding.md`](../../../.agents/skills/researcher/references/site-grounding.md). Skipping this cost `sotaocr-fb-001` $1.20 + 5/32 hallucinated-SDK creatives.

## The niche, in one paragraph

A poster-as-landing lives or dies on **one massive readable wordmark** plus **a single character making eye-or-near-eye contact**, glued together by **DIY sticker-collage energy**. The eye should land on the word, then the face, then bounce around 2-3 sticker accents, then read the copy. Crisp typography is the whole game — a smudged wordmark kills it instantly, which is why the model pick is typography-first, not consistency-first.

## The fixed architecture (do not restructure — only fill the slots)

Top to bottom, every poster in this niche keeps this stack:

| Band | Fixed role | Slot(s) to fill |
|---|---|---|
| 1. Top banner | small tracked uppercase intro line | `{{tagline}}`, accent color |
| 2. Wordmark | MASSIVE chunky slab-serif, 3D bevel shadow, chrome highlight per letter, slight playful tilt + imperfect terminals | `{{exclamation}}` (short punchy word: BOOM / DANG / YIKES / WOW / OOPS) |
| 3. Hero photo (~60% height) | cinematic chest-up portrait, gaze up, casual-cool, original blob glyph on the chest, a product held at mouth level, soft rim light, film grain | `{{hero}}`, `{{product}}`, `{{blob_glyph}}` |
| 4. Sticker collage | 3 vinyl stickers (thin white border + soft cast shadow + tape corner), scattered at playful angles | star w/ product macro · star w/ blob face · small star w/ pixel "NEW DROP"-type label |
| 5. Copy block | condensed uppercase headline + 4 lines italic-serif body + filled CTA pill | `{{headline}}`, `{{body_copy}}`, `{{cta}}` |
| 6. Footer strip | very thin full-width tracked uppercase | `{{brand}} · EST. YYYY · <process tagline> · WWW.<domain>` |

Finish layer (always on): subtle film grain + slight vignette + faint CRT warmth + vintage screen-print feel.

## Slots (the only things that change between posters)

- `{{brand}}` + `{{tagline}}` + `{{domain}}` — the fictional (or user-owned) label.
- `{{exclamation}}` — the wordmark word. One short shoutable token.
- `{{hero}}` — person + wardrobe + expression. Vary age/gender/styling freely.
- `{{product}}` — the prop held at mouth level (lollipop, popsicle, soda can, mic, …). Keep it generic/unbranded unless the user owns the brand.
- `{{palette}}` — full-bleed background gradient (2 hex) + accent color (wordmark/headline) + bevel-shadow color + cream body color + linework charcoal + product color. Always state explicit hex.
- `{{blob_glyph}}` — an ORIGINAL hand-scrawled friendly creature (smiley blob, cyclops cloud, lopsided star). Lowercase brand word written inside it. State "NOT any existing brand."
- `{{aesthetic}}` — the register (Y2K skate-surf streetwear is the validated default; vaporwave, grunge zine, clean-DTC, arcade-90s all work on the same scaffold).

## Model stack (verify against MODELS.md every run)

- **Default — `openai/gpt-5.4-image-2`.** Premium typography / label accuracy: the beveled wordmark, the small footer strip, and the 4 lines of body copy all read crisp. This is the whole reason it beats the consistency-first default for posters. **Caps at 1 concurrent** — serialize batches (`--concurrency 1`), never fire parallel poster gens on this model.
- **Fallback — `google/gemini-3-pro-image-preview`.** ~½ the latency and cheaper, tolerates ≥4 concurrent, but **smudges small embedded typography** (flipper postmortem; confirmed again on loud-kids-poster-001 — the 4-line body copy went soft). Use only for fast palette/composition exploration, then finalize the chosen variant on gpt-image.

## Aspect ratio — solved, use `--size`

`gpt-5.4-image-2` historically returned 1024² regardless of `--size`. As of the loud-kids-poster-001 session, `ralphy generate image` forwards `image_config.aspect_ratio` (derived from `--size`) to OpenRouter, and gpt-image **honors it**: `--size 1080x1920` → a real 9:16 portrait (720×1280 native bucket). Pass `--size 1080x1920` for a vertical landing poster, `--size 1080x1080` for a square social post. Output lands on the model's nearest native bucket, not pixel-exact — pad/scale downstream if you need an exact frame.

## Failure modes

- **Parallel gpt-image gens → `403 "Key limit exceeded"`.** Serialize (the 1-concurrent cap). Each gen also runs ~2.5-4 min.
- **Gemini smudges the body copy + footer strip.** Don't finalize a typography-heavy poster on gemini.
- **Glyph drifts toward a real trademark** (smiley brands, etc.) if you don't say "original, NOT any existing brand" — always include that clause.
- **Too many stickers** → the eye has nowhere to rest. Cap at 3, keep them at the edges of the hero.
- **Wordmark + headline same color as a busy background** → readability dies. The wordmark accent must contrast the gradient hard.

## Worked example (validated 2026-05-27)

`.ralphy/workspaces/<ws>/projects/loud-kids-poster-001/` holds three palette/hero/product variants built on this exact scaffold (BOOM/royal-blue+lollipop, DANG/coral-plum+popsicle, YIKES/lime-forest+soda) plus a 9:16 A/B (gpt-image vs gemini). The three prompt files (`prompt-v1-boom.txt` …) are the canonical filled-slot reference — read one before drafting a new poster prompt.

## CLI cookbook

```bash
# Default poster, vertical 9:16, crisp typography
ralphy generate image --project <id> --slot poster-01 \
  --model openai/gpt-5.4-image-2 --size 1080x1920 --prompt "<filled scaffold>"

# Fast palette/composition exploration (finalize the winner on gpt-image after)
ralphy generate image --project <id> --slot poster-explore --variants 3 \
  --model google/gemini-3-pro-image-preview --size 1080x1920 --prompt "<...>"

# Square social-post cut of the same poster
ralphy generate image --project <id> --slot poster-01-sq \
  --model openai/gpt-5.4-image-2 --size 1080x1080 --prompt "<filled scaffold>"
```

Long prompts: write the filled scaffold to a `.txt` in the project dir and pass `--prompt "$(cat file.txt)"` — apostrophes in body copy break inline single-quoted shell strings.
