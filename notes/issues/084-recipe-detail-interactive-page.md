# Recipe detail page — described + copyable artifact + live-runnable demo

> **Status:** todo
> **Filed:** 2026-06-04
> **Folder:** issues

## Context

The block detail page (`/library/b/[kind]/[id]`) renders the same schematic
placeholder for every kind — recipes show nothing about what they are or how to
use them (the "tag cloud" the user dislikes). With #082/#083 the recipe blocks
now carry body + artifact + demo.

## What

Specialize the Recipe branch of the block detail page (and keep the others intact):
- **What it is** — render `body` (markdown how-to).
- **How to use it standalone** — the `artifact` (ffmpeg filtergraph / HyperFrames
  snippet / prompt template) as a copyable code block (copy-to-clipboard).
- **Visual preview** — before/after media for ffmpeg/grade/prompt recipes.
- **Live-runnable demo** — for `recipeKind: hyperframes`, embed the HF snippet so it
  PLAYS in-browser (the HF runtime is HTML+GSAP; an iframe/embedded player of the
  `demo.html`/`storageUrl`). For runnable code snippets, an embedded runnable view.
- Tags do NOT get a detail page — render them as plain filter chips elsewhere
  (link to the feed filtered by tag), never as a clickable block page.

## Acceptance

- Clicking "Chroma Split" shows what it is + the copyable artifact + a preview.
- A HyperFrames recipe (e.g. play-freeze-fork / smpte-countdown-disc) shows a
  live, playing embedded demo.
- `next build` passes; no hairline borders (tint+shadow+spacing only).

## Notes

- Depends on #082, #083. Heaviest piece is the live HF embed.
