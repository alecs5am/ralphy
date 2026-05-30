# HyperFrames registry blocks for overlay-driven explainers

> **Status:** idea
> **Filed:** 2026-05-25
> **Folder:** ideas

## Context

Filed during the design pass for the `podcast-explainer-longform` template + `audio-explainer` skill (2026-05-25 chat). The skill needs a small set of overlay blocks that cover the dev-essay / faceless-podcast vocabulary. None of them exist in the upstream HyperFrames registry yet — the skill ships with inline fallbacks, but a proper upstream contribution would let any HyperFrames project reuse them via `bunx hyperframes add <block>`.

The reference video the format targets is at `workspace/references/codex-remotion-podcast/` — see `video-analysis.json` for the empirical recipe.

## What

Contribute the following blocks to the upstream HyperFrames registry via the `/contribute-catalog` skill:

| Block | Purpose | Inputs |
|---|---|---|
| `<code-block>` | Syntax-highlighted code, dev-essay style | `lang`, `theme`, slot content |
| `<terminal-window>` | Stylized terminal with optional typing animation | `theme`, `typing-animation`, slot content (pre-formatted) |
| `<tweet-card>` | X / Twitter post mockup | `author`, `handle`, `text`, `likes`, `timestamp` |
| `<browser-frame>` | Chrome chrome wrapping a screenshot | `url`, `src` (image path) |
| `<quote-card-kinetic>` | Big-text kinetic typography reveal | `text`, `emphasis_word` |
| `<chapter-card>` | Full-screen section divider | `title`, `subtitle`, `chapter_number` |
| `<logo-pop>` | 1-2s logo flash with scale-in | `src`, `brand` |

Each block:
- Uses Shadow DOM so styles don't leak.
- Reads `data-seek` from the HyperFrames runtime for determinism.
- Ships with one default style and one variation (e.g. `dracula` vs `vscode-dark` for code-block; `light` vs `dark` for tweet-card).
- Includes a snapshot test under the upstream HF repo.

## Why

1. **Reusable.** Every dev-content channel needs these primitives — not just `podcast-explainer-longform`. A tutorial template, an interview-recap, a release-announcement video all share the same vocabulary.
2. **Quality.** A proper Shadow-DOM block with snapshot tests beats inline-styled `<div>` fallbacks. Typography stays sharp, no leaking parent CSS.
3. **Discoverability.** `bunx hyperframes add code-block` is faster than copy-pasting a fallback template.

## Open questions

- Should `code-block` ship its own Shiki bundle or rely on a peer-dep? Shiki is ~3MB — too heavy for default ship.
- `tweet-card` needs to handle the recent X redesign — do we ship a v1 (classic Twitter) + v2 (post-Musk X) styles?
- `chapter-card` overlap with the existing `<title-card>` block in HF registry (if it exists) — verify with `bunx hyperframes list` before contributing.
- Determinism of the typing animation in `<terminal-window>`: needs to seed from `data-composition-id` for repeat-renders, not from `Math.random()`.

## Acceptance

- One PR per block to the upstream HF registry repo.
- After all 7 land, the `audio-explainer` skill switches from inline fallbacks to `bunx hyperframes add <block>`.
- The fallback HTML in the skill stays around for one major version cycle as the offline path.

## Promotion path

When the upstream PRs are merged: promote this note to a `roadmap/todo/02-XX-XX-hyperframes-overlay-blocks.md` task, then delete this file.
