# Remocn scene port — state and remaining work

The Explore → Visuals library renders 208 components copied from
[Remocn](https://github.com/Remocn/remocn) (MIT, commit `3903a46b`). This document records what the
new scene runtime does, what has been ported, and what is still owed.

## Why this exists

The first port derived a component's look from a regex over its slug and then styled about
twenty-five of the resulting "scenes" by hand. Everything else fell through to a per-group fallback,
so **155 of 222 components rendered one of thirteen identical pictures** — 94 distinct looks in
total. The named symptom was ASCII Dissolve, whose upstream is a per-cell density-ramp dissolve and
whose port was `transform: scale(1.08)` with a hue rotation.

The rebuild replaces guessing with porting: every component is authored from its own embedded
upstream source, and `tests/marketplace-remocn-scenes.test.ts` asserts mechanically that no two
scenes share a body or a rule block.

## The runtime

`src/pages/marketplace/lib/scenes/` — read `types.ts` first; it is the contract.

One CSS clock drives all four states. A scene rule always writes

```css
animation: <name> var(--rv-run) linear infinite both;
animation-delay: var(--rv-seek);
```

where `--rv-seek` is `calc(-1 * var(--rv-t) * var(--rv-run))`. A **paused** animation at a negative
delay renders exactly the frame at `--rv-t`, so a frozen grid card, a hovered card, the detail view
and a frame-accurate export are one set of declarations. Verified in Chrome: scale is invariant
across container sizes, seek is linear, and a scene at `data-playing="false"` runs zero animations.

Two rules that are easy to break and both silent when broken:

* The pause rule carries `!important`. The `animation` shorthand resets `animation-play-state` to
  `running` at equal specificity and later in the sheet, so without it every shard unfreezes the
  grid. Scene CSS may never set `animation-play-state`.
* Inside `.rv-stage`, `1em` is exactly one authored stage pixel (the stage sets `font-size` from a
  container query, because CSS `calc()` cannot divide a length by a length to get a scale factor).
  An element that sets its own `font-size` redefines `em` for its children — so font sizes use
  `calc(var(--rv-u) * N)` and every other length is plain `em`.

`scripts/lint-remocn-scenes.ts` enforces both, plus scoped selectors, namespaced `@keyframes`, no
bare durations, no colour literals in CSS, and the size caps. It runs in `check:desktop`.

### Paint engines

Most components are CSS. Three engines cover what CSS cannot express:

| engine | used by | notes |
|---|---|---|
| `canvas` | cell fields (`ascii-field`, `glyph-density`, `mosaic`, `glyph-lag`) | one shared rAF loop; constant cell count in stage px, so the baked still and the first live frame agree |
| `webgl` | the 23 components that inline their own GLSL | their shader text is extracted to `webgl/glsl.generated.json` by `scripts/remocn/extract-glsl.ts` |
| `paper` | the 19 components whose upstream is a `@paper-design/shaders-react` wrapper | the real package, driven by our own frame |

Both shader families run on one engine: `@paper-design/shaders` exports its fragment shaders as
strings and a vanilla `ShaderMount` class with `setFrame(ms)` / `setSpeed(0)` / `dispose()`.

### Decisions worth not relitigating

* The 14 upstream `guides` entries are `content/docs/guides/*.mdx` prose, not components. They are
  excluded from the catalog, which is why it is 208 and not 222.
* `SceneSpec.palette` holds upstream's literal colours, and scene CSS reads them as `var(--p-*)`.
  Ported scenes are exempt from the marketplace instrument paint guard by path
  (`scripts/instrument-media-sources.mjs`); the four runtime mechanism files are not.
* `motion: { kind: "static" }` is legal and required for components whose upstream has no time term.
  Inventing movement for them is the exact defect this rebuild removes.

## What is ported

**48 of 208**, a pilot of three to five per category chosen to exercise every engine.

| group | ported |
|---|---|
| typography | `blur-out-up` `per-character-rise` `marker-highlight` `typewriter` `rolling-number` |
| ui | `button` `dialog` `dropdown-menu` `toast` `switch` |
| ui-blocks | `animated-bar-chart` `terminal-simulator` `check-list` `polaroid` |
| layout | `backdrop` `drift` `chat-to-preview-layout` `stage` |
| transitions | `ascii-dissolve` `page-turn` `wave-wipe` `whip-pan` `zoom-blur` |
| shaders | `shader-mesh-gradient` `shader-dithering` `shader-caustics` `shader-voronoi` |
| filters | `vhs-filter` `crt-screen` `ascii-render` |
| effects | `confetti` `radial-burst` `ink-arrow` |
| ai | `claude-code` `chat-gpt` `v0` |
| social | `x-follow-card` `github-stars` `logo-enter` |
| templates | `release-teaser` `brand-guidelines` `workflow-console` |
| craft | `brush` `stop-motion` `scene-motion` |
| compositions | `ecosystem-constellation` `infinite-bento-pan` `live-code-compilation` |

The remaining 160 are listed per shard in `src/pages/marketplace/lib/scenes/<shard>.ts`; the shard
plan and per-component motion specs from the source survey are the input for authoring them.

## Remaining work

### 1. Nothing in the UI mounts the new runtime yet — blocking

`ui/MarketplaceVisualPreview.tsx` still renders the **old** `studio-remocn-preview.ts` renderer. No
file outside `lib/scenes/` references `.rv-canvas`, `.rv-gl`, `.rv-paper` or `webgl/host.ts`'s
`mount()`. Until that is wired:

* every ported scene renders as bare markup in the app, with no canvas and no shader;
* the 48 pilot scenes were verified through standalone harnesses, not through the app.

Wiring it needs: `sceneFor(visual.slug)` with a fallback to the old renderer for unported ids,
`sceneRootClass()` on the root, `sceneStyleVariables()` for the clock and palette, a canvas/WebGL
handoff after `dangerouslySetInnerHTML` commits, and `remocn-playback.ts` in place of the per-card
observers.

### 2. Two WebGL host defects found during the pilot — blocking those scenes

* **`u_noiseTexture` never binds.** `webgl/host.ts` drops the still-decoding noise image from the
  uniforms before constructing `ShaderMount`, but `ShaderMount` resolves uniform locations only for
  keys present at construction, so the later `setUniforms` is a no-op forever. Observed: nine
  `Uniform location for u_noiseTexture not found` warnings, and `shader-voronoi` rendering a regular
  single-colour lattice instead of a Voronoi field. Fix: pass a 1×1 placeholder at construction and
  swap it on decode, or await `decode()` first as paper's own React wrapper does. Affects every
  paper shader whose fragment declares `u_noiseTexture`.
* **Post-filter programs link but have nothing to sample.** `vhs-filter`, `crt-screen` and
  `ascii-render` all read `uniform sampler2D u_scene`, and this runtime has no earlier pass to fill
  it. They compile, so the host would mount them, set `data-gl="ready"`, hide the upstream-authored
  CSS fallback, and render solid black — an unbound `sampler2D` reads `(0,0,0,1)`. Fix belongs in
  `host.ts` or `programs.ts`: refuse to mount a program declaring `u_scene`, or bind a scene texture.
  Today nothing imports the host, so the fallback is what renders and the pilot is correct.

### 3. `.rv-paper` collides between the two sheets

`scenes/shared.css` defines `.rv-paper` as the shader host (absolute, inset 0); the legacy
`lib/studio-remocn-preview-css.ts` defines it as a rotated craft field-note. While both sheets load
during a shard-by-shard landing they fight. Rename one before wiring step 1.

### 4. Preview stills are still placeholders

`public/explore/remocn/{motion,foundations}/*.svg` are ~880-byte gradient-and-title placeholders with
no relation to the component. They should be baked from the frozen scene through the same modules the
app uses, so card, detail, still and export are the same image. Not started.

### 5. Grid performance

Measured, not yet fixed: the creative grid mounts every card at once (5 538 DOM nodes, ~67 ms browser
layout, ~135 ms React) and the catalog eagerly builds every artifact string. Frame rate is not the
problem — idle cards are already paused. The fixes are virtualization on the gallery grid, a
module-scope memo on `studioCatalog()`, and dropping the 1.49 MB of upstream TSX that reaches the
renderer bundle only to be pasted into an HTML comment.

### 6. Per-component debt from the pilot

Every port below is faithful in timing and layout; these are the specific things that are not
reproductions. They are recorded in each spec's `fidelity` field and surfaced by CI, not in the UI.

| component | what differs |
|---|---|
| `typewriter` | the reveal is built from the call site — upstream's `useTypewriter` hook body is not in the dataset. The cover steps by an equal share of the line rather than per-glyph advance, and the typing rate drifts with title length |
| `rolling-number` | whole revolutions per place are capped (8/4/2/1/1); the true travel would need a 24 814-cell strip. Every place still lands on the correct digit |
| `github-stars` | 60 scroll rows downsampled to 12, capped wheel revolutions, one continuous roll instead of the per-decade spring snap, avatars fall back to initials |
| `wave-wipe` | the wave plate is a layered gradient in upstream's own colours rather than the `@paper-design` grain-gradient its wrapper mounts |
| `vhs-filter` | Remotion's seeded `random()` is unavailable, so wobble and flicker are step-end keyframes re-rolled 16 and 8 times per loop instead of 64 |
| `crt-screen` | the tube warp becomes a border-radius bulge plus a 0.957 scale; the 5-tap bloom exists only in the GLSL path |
| `ascii-render` | upstream ships a pass-through fallback, so the CSS path resolves the filter analytically against this scene's own plate |
| `confetti` | first 72 of 140 pieces (a prefix of the same fixed draw order); the flutter is a piecewise-linear cosine |
| `radial-burst` | ribbons are capsules carrying the real orbit arithmetic rather than 37-sample curvature-limited outlines |
| `ink-arrow` | the draw-on uncovers a finished ribbon with a growing clip rather than rebuilding the outline from a truncated spine |
| `release-teaser`, `brand-guidelines`, `workflow-console`, `scene-motion`, `stop-motion` | **stand-ins.** Only the orchestrator module is in the dataset; the shot and scene modules are not, so the timing is upstream's and the drawing is ours |
| `backdrop`, `stage` | stand-ins: upstream frames arbitrary children, so the frame holds a CSS-drawn plate |
| `ecosystem-constellation` | the one-shot assembly spring is dropped, because the preview loops rather than playing a 70-frame entrance |
| `infinite-bento-pan` | counters freeze at frame zero — CSS cannot animate digits |
| `live-code-compilation` | the per-line reveal is a continuous clip, so a glyph can be sliced mid-stroke |
| `dropdown-menu` | `dropdown-menu-item` is a declared registry dependency with no entry, so row metrics are chosen |
| `polaroid`, `check-list`, `drift` | upstream declares no defaults for caption, items or wrap behaviour; those are chosen here |

Weakest cards, stated plainly: `workflow-console` and `brand-guidelines` (nothing upstream draws),
`shader-caustics` (correct, and genuinely near-black), `toast` (upstream's default variant has no
description), `typewriter`.

## Authoring another shard

The port recipe, the per-component motion specs and the shard plan were produced by a source survey
and live outside the repo. The short version:

1. Read `types.ts`, `shared.ts`, `shared.css`.
2. Read the component's real upstream source out of `lib/generated/remocn-*.json`.
3. Write the spec — `params` must be real upstream prop defaults; CI checks every key against the
   source text.
4. Write one `/* @scene <id> */ … /* @end */` block, scoped to `.rv-c-<id>`.
5. `bun run lint:remocn-scenes -- --shard <shard>`, `bun run typecheck`,
   `REMOCN_SCENES_EXPECT=<n> bun run test -- marketplace-remocn-scenes`, `bun run test -- marketplace`.
6. Raise `EXPECTED_SCENE_COUNT` in the conformance test once the wave lands — one integrator, once,
   because parallel authors collide on that line.
