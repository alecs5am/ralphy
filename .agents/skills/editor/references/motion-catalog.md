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

Insert items with `ralphy catalog use` (#594); do not paste fragments by hand. One call puts the item into the project's `index.html` and records the use, which the motion eval later joins with hit rate and retention:

```bash
ralphy catalog use flash-white --project <id> --at 2.8 --from "#s1" --to "#s2" --dry-run   # print the plan, write nothing
ralphy catalog use flash-white --project <id> --at 2.8 --from "#s1" --to "#s2" --param peak=4
ralphy catalog use cap-three-word-box --project <id> --at 0 --words artifacts/captions/vo.json
ralphy catalog use cam-punch-in --project <id> --at 5 --target "#shot-3"
ralphy catalog use lower-third --project <id> --at 1.2 --duration 3 --param name="Ada Lovelace"
```

What it does, in order:

1. Snapshots `index.html` first: on a store root the #591 project-tree Composition revision (the one `render` builds), on a tree-only root an append-only `compositions/v<N>.html`.
2. Copies the item to `compositions/catalog/<id>.html` as a HyperFrames sub-composition. Every use of the item shares that copy; if you edited it, the next use writes `<id>.v2.html` instead of overwriting your edit.
3. Validates `--param key=value` against the manifest (type, min / max, enum options, `#rrggbb` colours) and inserts a host `<div data-composition-src>` into the root composition with its own `data-composition-id`, the params in `data-variable-values`, `z-index: 50` above the scenes.
4. Copies the item's SFX from the pack into `artifacts/sfx/` with an `<audio>` clip at the cue (a warning, not a failure, when the pack is missing).
5. Appends the use (item, content hash, params, start, duration, track, snapshot) to `logs/catalog-uses.jsonl`.

Timing: `--at` defaults to the end of the last clip on the target track (0 when it is empty), so uses without `--at` append back to back; `--track` defaults to the first free track above every non-catalog clip. `--duration` defaults to the manifest duration, which for elements is only the entrance: pass `--duration` for the on-screen hold. Captions default to the last word's end plus 0.6 s. A transition's `swapAt` in the output is where the scenes swap.

Host elements: transitions need `--from` / `--to` (scene selectors; the incoming scene starts at `opacity: 0`), camera recipes need `--target` (the layer recipes `cam-parallax` and `cam-dolly-zoom` need `--bind bg=...` instead), captions need `--words` (timings in seconds from the clip start, or `ralphy generate captions` JSON for a voice-over that starts at `--at`). `--bind stage=...` (and `subject` / `bg` / `mid` / `fg` for camera recipes) names any other host element. `cam-follow` needs a point track and is still wired by hand.

### Wiring by hand

Every fragment has three parts: `<style data-catalog-css>`, `<template data-catalog-markup>` and `<script data-catalog-js>` defining `function catalog_<id>(tl, o)`. The function only adds tweens to the timeline you pass; it never builds its own, so it pastes into any composition. Use this only for what `catalog use` does not cover (a point track, a fragment you are rewriting); a hand-pasted item leaves no usage record.

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
