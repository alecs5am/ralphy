# Motion catalog (transitions, motion elements, SFX pack)

> #563 checkpoint. Read when a composition needs a scene transition, an animated overlay (lower third, text pop, counter, callout, CTA), or an SFX for one. Pick from the catalog before writing a new effect from scratch.

## What it is

- **Definitions (repo-tracked):** `catalog/manifest.json` plus one HyperFrames fragment per item under `catalog/items/<kind>/<id>.html`. Kinds today: `transition` (20), `element` (15), `layout` (8, #564: see [`vertical-layouts.md`](./vertical-layouts.md)), `caption` (12, #565: see [`caption-presets.md`](./caption-presets.md)) and `camera` (12, #567: see [`virtual-camera.md`](./virtual-camera.md)).
- **Binaries (gitignored, `.ralphy/catalog/`):** the shared SFX pack (`sfx/<tag>/<id>.mp3` + `sfx/manifest.json`), rendered 9:16 previews (`previews/<id>.mp4`), the assembled standalone compositions (`build/<id>/index.html`), and the static page (`index.html`).

## Query it

```bash
ralphy catalog list --kind transition --mood energetic     # JSON when piped, table on a TTY
ralphy catalog list --kind element --energy calm
ralphy catalog list --sfx whoosh                            # items whose SFX is a whoosh
ralphy catalog show zoom-punch                              # params, use / avoid, sfx cue, fragment + preview paths
ralphy catalog sfx list --tag impact --max-duration 1.5     # the SFX pack
```

Facets: `--kind`, `--mood` (energetic, playful, editorial, dramatic, tech, edgy, warm, premium, clean, retro), `--energy` (calm, medium, high), `--tag`, `--sfx`. Filters AND together.

Browse visually: `ralphy catalog page`, then open `.ralphy/catalog/index.html` in a browser (works from `file://`; hover plays muted, the Sound button plays the SFX).

## Use an item in a composition

Every fragment has three parts: `<style data-catalog-css>`, `<template data-catalog-markup>` and `<script data-catalog-js>` defining `function catalog_<id>(tl, o)`. The function only adds tweens to the timeline you pass; it never builds its own, so it pastes into any composition.

1. Copy the CSS into the composition `<style>`, the markup into the overlay layer (above the scenes), and the function into the main `<script>`.
2. Call it at the beat, with params from `catalog show`:
   - transition: `catalog_whip_pan(tl, { from: "#s2", to: "#s3", stage: "#stage", at: 6.4, duration: 0.32, blur: 60, direction: "left" })`. `at` is the window start; the swap happens at `at + cutAt`. The incoming scene must start at `opacity: 0` (HyperFrames scene rule); the function reveals it.
   - element: `catalog_lower_third(tl, { layer: "#overlay", at: 2.1, name: "...", role: "...", accent: "#ffd166", y: 1180 })`.
3. Add the SFX as its own `<audio>` element at `at + sfx.at` with `data-volume` from the cue (and `data-duration` when the cue has `trim`). The pack copy is already loudness-normalized; copy it into the project (`artifacts/sfx/`) rather than referencing `.ralphy/catalog/` from the composition.
4. A full working example of every item is the generated `build/<id>/index.html` (run `ralphy catalog build-previews --build-only` if it is missing).

## Rules of thumb

- One primary transition for most cuts plus one or two accents; spend the boldest item on the climax. Energy and mood tags map to the table in [`hyperframes/references/transitions.md`](../../hyperframes/references/transitions.md).
- SFX timing: whooshes start a few frames before the visual peak so their loudest part lands on the cut; impacts and hits land on the cut frame; pops land on the first overshoot frame. Mix SFX well under the voice (see [`audio-mixing.md`](./audio-mixing.md)).
- Elements default to positions inside the TikTok green zone ([`green-zone.md`](./green-zone.md)); keep the `y` param inside it.
- Transitions animate scene containers. Between two **video** scenes, an opacity dissolve does not composite at capture time (see [`transitions.md`](./transitions.md)); prefer transitions that cover the cut (flash-white, shutter-blinds, block-dissolve, light-leak, film-burn, zoom-punch) or bake the dissolve with ffmpeg.

## Maintain it

- Two GSAP traps the checkpoint hit (both render wrong without a lint error): a `fromTo` whose from-vars carry `opacity: 1` on the incoming scene renders that state at t=0 and hides the outgoing scene for the whole lead-in, so reveal with `tl.set(o.to, { opacity: 1 }, t)` and pass `immediateRender: false`; and a `filter` tween that starts from `none` interpolates every function from 0 (`brightness(0)` is a black frame), so always give it an explicit neutral start such as `"blur(0px) brightness(1)"`.
- New item: add the fragment, add the manifest entry (schema in `cli/lib/catalog/schema.ts`), run `ralphy catalog build-previews --id <id>`, then `ralphy catalog page`. `tests/unit/catalog-manifest.test.ts` checks the contract. Fonts a fragment names must be in `catalog/fonts.json` (`bun run lint:fonts`); previews declare the vendored files with `@font-face` (#565).
- New SFX from a finished project: `ralphy catalog sfx harvest` (copies only, sources untouched; dedupes by sha256 and an envelope fingerprint; normalizes with the `loudnorm` recipe).
