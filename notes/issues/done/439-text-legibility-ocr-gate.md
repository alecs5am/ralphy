# Text legibility and OCR quality gate

> **Status:** done — 2026-06-16
> **Filed:** 2026-06-15
> **Folder:** issues

## Context

Many content modes bake text into images or video frames: App Store screenshots, Amazon listings, carousels, posters, motion design, captions, and end cards. Existing eval catches broad visual quality but not reliably whether the text is readable and correct.

## What

Add a text legibility/OCR gate for stills and sampled video frames. It should detect typos, unreadable small text, wrong emphasis, clipped copy, and forbidden markdown artifacts.

## Why it matters

Text defects are high-visibility and often require a full regeneration. Catching them before Unit formation saves cost and protects commercial quality.

## Scope / acceptance

- Add an OCR/check function for images and selected video frames.
- Compare detected text against expected copy where available.
- Report unreadable text regions, clipped text, and unexpected symbols.
- Integrate into image-pack, carousel, poster, Amazon listing, and motion-design modes.
- Add fixtures with good text, garbled text, clipped text, and literal markdown artifacts.
- Keep the gate optional for modes that intentionally have no baked text.

## Notes

- Related: #429 image-pack workflow and #427 readiness scorecard.
