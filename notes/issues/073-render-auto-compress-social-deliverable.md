# `ralphy render` should auto-emit a compressed social deliverable

> **Status:** issue
> **Filed:** 2026-06-03
> **Folder:** issues
> **Severity:** medium
> **Category:** cli / UX

## Context

`ralphy video compress` exists (shipped via #036) but it is a MANUAL second step. On `choose-silenthill-001` the user had to explicitly ask "compress the video" after every render — `ralphy render` emitted a 151 MB `final.mp4` (h264, 12 Mbps, 104 s, 1080×1920) and nothing smaller. The user asked to bake the compress knowledge into ralphy itself so they don't have to request it on every project — the compress step should be part of render, not a per-project ask.

#036 even listed "`ralphy render --quality web|print|archive` mapping to CRF 23/18/12 — auto-tune on canvas-noise detection" as a suggested fix, but that render-integrated piece was not implemented (only the standalone `video compress` verb landed). This issue tracks just that missing auto/integrated half.

## What

Make `ralphy render <id>` produce a share-ready compressed deliverable automatically, alongside the master, so no manual `video compress` call is needed. Default ON, with an opt-out.

Proposed shape:
- `ralphy render <id>` writes `render/final.mp4` (the master, as today) **and** `render/final-social.mp4` (x264 faststart, CRF ~20–22 default — visually-near-lossless for grainy content), automatically.
- `--no-compress` to skip the social pass; `--social-crf <n>` to override.
- Reuse the existing `cli/lib/ffmpeg-recipes.ts` compress recipe (#036) — this is wiring, not new ffmpeg.
- Log the social-deliverable line + size to the gen-log like other render outputs.
- Append-only safe: writes a NEW file, never overwrites `final.mp4`.

## Why it matters

Every social/UGC project ends in a share step; the master is too heavy to upload (151 MB on this project). Forcing a manual compress per project is exactly the kind of repeated boilerplate the user is asking to remove. Auto-emitting the social cut makes "render → upload" a one-command flow and standardizes the deliverable (invariant #2 spirit).

## Scope / acceptance

- `cli/commands/render.ts` (or the render lib) calls the compress recipe after a successful HyperFrames render, writing `render/final-social.mp4`, unless `--no-compress`.
- Flags: `--no-compress`, `--social-crf <n>` (default ~20). `--loudnorm` continues to apply to the master; the social cut inherits the master's audio (no double loudnorm).
- Grainy content note: default CRF ~20 (not 23) because PS1/VHS grain is high-entropy; document the size-vs-grain tradeoff in `--help`.
- Gen-log gets a `render-social`/compress line with output bytes.
- Smoke: `bunx tsx cli/index.ts render <id>` on a fixture project produces both `final.mp4` and `final-social.mp4`; `--no-compress` produces only `final.mp4`.
- Does NOT overwrite or delete `final.mp4` (auto-version invariant).

## Notes

- Related: #036 (shipped the standalone `ralphy video compress` verb; this is the render-integrated/auto half it left open). Cross-link, don't duplicate — #036 stays `done`.
- Consider whether `--quality web|print|archive` (also proposed in #036) should be the knob instead of `--social-crf`; pick one surface. Sequence: trivial, depends only on the existing compress recipe.
- Origin: `choose-silenthill-001` session, 2026-06-03.
