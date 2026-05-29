# Missing verbs: `render --grade`, `video vhs`, `audio mix-music`, `video compress`

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** cli

## Context

Color grading, VHS post-processing, music-bed mixing, and final social-compress are reinvented per project as raw ffmpeg chains. All four are stable recipes that should live in `cli/lib/ffmpeg-recipes.ts`.

## What

- `venom-bodywash-001`: #8 + workflow-fixes #6 — 30+ min on regrade across one session.
- `ralphy-vs-higgsfield-001`: #3 + #7 + Section C of lessons — entire VHS chain (chroma shift, mirage sine-drift, grain, vignette, eq) raw; no final-compress verb (raw `x264 CRF23 +faststart` for 76→31MB deliverable).
- `glitter-cream-001`: A/B/C music preview requires three full Remotion re-renders instead of three ffmpeg mixes.
- `analog-horror-fridge-001`: default Remotion CRF 18 produced 190 MB / 30s for noise-heavy compositions, unsharable until manually re-encoded.

## Why it matters

Each ad-hoc ffmpeg invocation is a violation of invariant #2 and a missed opportunity to standardize the deliverable.

## Suggested fix

- `ralphy render <id> --grade <preset>` with presets: `tv-commercial-soft`, `tv-commercial-strong`, `cinematic-teal-orange`, `analog-horror`.
- `ralphy video vhs --in <mp4> --out <mp4> [--drift --grain --chroma]` — chroma shift, mirage drift, grain, vignette, eq.
- `ralphy audio mix-music --in <mp4> --music <mp3> --volume 0.18 --out <out.mp4>` — single-call music-bed overlay.
- `ralphy video compress --in <mp4> [--crf 23 --social]` — x264 CRF23 + faststart for social deliverables.
- `ralphy render --quality web|print|archive` mapping to CRF 23/18/12 — auto-tune on canvas-noise detection.
- Recipes in `cli/lib/ffmpeg-recipes.ts`.

## Sources

- `workspace/projects/venom-bodywash-001/postmortem/03-cli-issues.md` — #8
- `workspace/projects/venom-bodywash-001/postmortem/05-workflow-fixes.md` — #6
- `workspace/projects/ralphy-vs-higgsfield-001/postmortem/03-cli-issues.md` — #3, #7
- `workspace/projects/ralphy-vs-higgsfield-001/postmortem/02-lessons.md` — Section C
- `workspace/projects/glitter-cream-001/POSTMORTEM.md` — music mix
- `workspace/projects/analog-horror-fridge-001/POSTMORTEM.md` — render quality
