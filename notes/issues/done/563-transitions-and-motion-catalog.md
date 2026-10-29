# Transitions and motion catalog with a browsable preview page

> **Status:** done — 2026-10-30 (checkpoint: 20 transitions + 15 motion elements with previews and SFX cues, 206-sound SFX pack, catalog page, `ralphy catalog`; gaps listed below, incl. 40+30 target, shader family, video-plate checks, distribution via ralphy-assets)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** feature / craft library

## Context

The owner wants a base of transitions (zoom, cut, mask, blur, whip, glitch and so on) and motion graphics elements with their sound effects, viewable on a page as ready video assets, like https://hyperframes.heygen.com/catalog. Format is the agent's call. There are about 316 SFX files across existing projects under `.ralphy/workspaces/*/projects/*/artifacts/sfx/`. Idea 006 (HyperFrames overlay blocks) overlaps and should be folded in.

## What

1. Inventory what exists: HyperFrames registry blocks, our compositions, recipes in the library.
2. Harvest SFX from past projects: copy (never move) into a shared SFX pack, dedupe by audio fingerprint, tag by use (whoosh, hit, riser, pop, glitch, click), loudness-normalize.
3. Study catalogs of strong motion designers and template marketplaces; break down the patterns (timing, easing, layering, sound sync) and implement our own versions. Do not copy their assets or code.
4. Each catalog item: HyperFrames implementation, parameters, a rendered 9:16 preview mp4 with its SFX, when to use, when not to, and a link to its #558 ledger stats once data exists.
5. A static catalog page (filters by type, mood, energy) built from the item manifest.
6. When the base exists, write a spec of what is still missing.

## Scope / acceptance

- At least 40 transitions and 30 motion elements with previews.
- The catalog page renders locally and lists every item with a playable preview.
- Agents can query it: `ralphy catalog list --kind transition --mood energetic`.
- A gaps spec filed as a follow-up issue.

## Notes

- Sequence before #564 and #565, which add their own items to the same catalog.
- Append-only: SFX harvest copies, source project files stay untouched (AGENTS.md invariant 14).

## Checkpoint (2026-10-30)

Agreed checkpoint scope: 20 transitions and 15 motion elements, all 9:16, each a parametrized HyperFrames fragment with a locally rendered preview mp4 and an SFX cue. The full acceptance numbers (40 + 30) stay open.

**Where things live.** Definitions are repo-tracked under `catalog/` (`manifest.json` + `items/<kind>/<id>.html`), next to `guidelines/`. They are engine-shipped Recipe-type building blocks (the "N Recipes" of a Unit, each with an extractable artifact per the recipe-vs-tag rule), not content templates, so they do not belong in the format-organized template library or in one workspace's `templates/` tier; publishing them onward as library Recipe blocks is the `templater` / `dev-publish-template` path. Binaries stay out of git under the data root: `.ralphy/catalog/{sfx,previews,build,index.html}` (cross-workspace, so beside the global `references/` tier rather than in one workspace's `shared/`).

**Landed.**

- `ralphy catalog list | show | sfx harvest | sfx list | build-previews | page` (`cli/commands/catalog.ts`, `cli/lib/catalog/`). The catalog verbs are scope-free (no Workspace needed).
- Item manifest schema (Zod, `cli/lib/catalog/schema.ts`): id, kind (`transition | element`, with `layout` for #564 and `caption` for #565 reserved), typed params (mirroring `data-composition-variables`), when to use / not to use, SFX cue (id, offset, volume, optional trim), energy, moods, tags, preview path, `ledger` placeholder for #558.
- Fragment contract: `function catalog_<id>(tl, o)` adds tweens to a caller timeline; the preview harness wraps each into a standalone 1080x1920 composition with declared variables and an `<audio>` SFX cue.
- SFX pack: 275 project files scanned (40 untrimmed `.raw` intermediates skipped), 32 exact and 28 fingerprint duplicates collapsed, 206 unique sounds copied and normalized with the `loudnorm` recipe (target -16 LUFS, true peak -1.5 dBTP); 9 corrupt sources reported, not copied. Source project files were only read.
- Research: `docs/research/motion-catalog-study.md` (HyperFrames catalog, Motion Array, Mixkit, Jitter, motion-craft and audio-level references).
- Editor pointer: `.agents/skills/editor/references/motion-catalog.md`.
- Idea 006 (HyperFrames overlay blocks) is folded into this issue; `quote-card` shipped, the other six blocks are listed below.

## Gaps after the checkpoint

- **Count.** 20 more transitions and 15 more elements to reach 40 + 30, including idea 006 blocks: `code-block`, `terminal-window`, `tweet-card` (generic, no real-brand chrome), `browser-frame`, `quote-card-kinetic`, `chapter-card`, `logo-pop`.
- **Shader family.** No WebGL items yet (`@hyperframes/shader-transitions`: domain warp, ridged burn, swirl, true pixelate / mosaic, gooey ink). A composition cannot mix CSS and shader transitions, so they need their own harness variant.
- **Video scenes.** Previews use DOM scenes. Opacity-based items (blur-dissolve, luma-dip, mask-wipe, ink-bleed, light-leak) are unverified over two `<video>` scenes, where the capture engine hard-switches sources; add a video-plate harness and mark each item `videoSafe: true | false`.
- **Fonts in previews.** The pinned HyperFrames compiler (0.6.31) caches Google Fonts by weight and style only, so the first unicode subset it fetches overwrites the rest; the embedded faces lack Latin glyphs (the cached Anton 400 file is a 5 KB non-Latin subset) and previews fall back to system fonts (fragments now list `Impact` / `sans-serif` fallbacks). Fix upstream or vendor Latin woff2 files into a fonts asset and re-render. *Addressed in #565:* `catalog build-previews` now declares full TTFs from `catalog/fonts.json` with `@font-face`; re-render these 35 previews with `--force` to pick it up.
- **SFX pack quality.** Tags come from file names (33 `misc`, only 1 `pop` and 2 `riser`); add an audio-feature or LLM-listen pass and fill thin tags with new free or generated one-shots. Integrated LUFS is undefined for one-shots under about 0.4 s, so add a peak or short-term loudness mode for them. Trimmed cues cut without a fade. The fingerprint is a coarse envelope plus brightness; a chromaprint-style fingerprint would catch trimmed variants.
- **SFX distribution.** The pack and previews exist only on this machine. Publish both to the `ralphy-assets` companion (manifest + SHA-256, auto-pull like template assets) so `catalog build-previews` and the page work on a fresh clone and in the compiled binary, which does not embed `catalog/` yet.
- **Ledger link.** `ledger` is null on every item; wire it when #558 performance-linked eval has data.
- **Agent integration.** No `ralphy catalog use <id> --project <id>` that splices CSS, markup, function call and SFX into a project `index.html` (with `hyperframes save-version` first); agents copy by hand today.
- **Page.** No duration-bucket or has-SFX facets, no extracted poster images (cards seek the video to a mid-effect frame), no per-item copy button; consider publishing as a private Artifact for sharing.
- **Variants.** Each item has one look; add light / dark and brand-token variants (accent, font) and 16:9 / 1:1 aspect support.
- **Lint noise.** `hyperframes lint` reports `overlapping_gsap_tweens` on arrow-callout and cta-pulse because it cannot resolve variable positions; the tweens do not overlap at runtime.
- **CLI surface doc.** `docs/cli-surface.generated.md` was not regenerated in this checkpoint (owner instruction); run `bun run cli:surface:build` when merging.
