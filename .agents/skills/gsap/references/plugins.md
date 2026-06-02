# GSAP Plugins for HyperFrames

> Vendored from the official [greensock/gsap-skills](https://github.com/greensock/gsap-skills) `gsap-plugins` skill (MIT, upstream commit `aed9cfd`), adapted for HyperFrames compositions. Interaction-only plugins (Draggable, Inertia, Observer, ScrollTo, ScrollSmoother) are omitted — a HyperFrames render seeks a paused timeline; there is no user input or scrolling.

## HyperFrames adaptation rules (read before any upstream snippet)

- **CDN script tags, not ES imports.** Compositions are single-file HTML. Load plugins from the same CDN pin as core, then register the globals:
  ```html
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/SplitText.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/DrawSVGPlugin.min.js"></script>
  <script>
    gsap.registerPlugin(SplitText, DrawSVGPlugin);
  </script>
  ```
  All plugins are free (post-Webflow-acquisition) — never suggest Club GSAP membership, auth tokens, or the private registry.
- **Everything must end up inside the paused `window.__timelines` timeline.** A plugin call that returns a tween (e.g. `Flip.from()`) is only render-safe if you `tl.add()` it. A plugin that animates outside the registered timeline will not be seeked and will not render.
- **Determinism over autoSplit.** SplitText's `autoSplit: true` re-splits asynchronously on font load / resize — that violates the "build timelines synchronously" contract. Instead: ensure fonts are loaded (inline `@font-face` + `document.fonts.ready` before building, or system fonts), then split once, synchronously, before timeline construction.
- **ScrambleText caution.** Scramble chars are randomized per tick — frames are stable within one render pass but preview and render output may differ visually. Acceptable for noise-like glitch text; do not use where exact glyphs matter.
- **GSDevTools is preview-only.** Useful while iterating in `bunx hyperframes preview`; never leave it in the composition that goes to `ralphy render`.

## Registering Plugins

Register each plugin once so GSAP knows to include it. Use **gsap.registerPlugin()** with every plugin used in the composition (globals from the CDN builds):

```javascript
gsap.registerPlugin(SplitText, DrawSVGPlugin, MorphSVGPlugin);
```

- Register before using the plugin in any tween or API call.

## DOM / UI

### Flip

Capture state with `Flip.getState()`, then apply changes (e.g. layout or class changes), then use `Flip.from()` to animate from the previous state to the new state (FLIP: First, Last, Invert, Play). Use when animating between two layout states (lists, grids, expanded/collapsed).

```javascript
gsap.registerPlugin(Flip);

const state = Flip.getState(".item");
// change DOM (reorder, add/remove, change classes) — synchronously, at build time
const flip = Flip.from(state, { duration: 0.5, ease: "power2.inOut", paused: true });
tl.add(flip, 1.2); // HyperFrames: add the returned tween to the registered timeline
```

**Flip — key config (Flip.from vars):**

| Option | Description |
|--------|-------------|
| `absolute` | Use `position: absolute` during the flip (default: `false`) |
| `nested` | When true, only the first level of children is measured (better for nested transforms) |
| `scale` | When true, scale elements to fit (avoids stretch); default `true` |
| `simple` | When true, only position/scale are animated (faster, less accurate) |
| `duration`, `ease` | Standard tween options |

More: https://gsap.com/docs/v3/Plugins/Flip

## Text

### SplitText

Splits an element's text into characters, words, and/or lines (each in its own element) for staggered or per-unit animation. Returns an instance with **chars**, **words**, **lines** (and **masks** when `mask` is set). API: **SplitText.create(target, vars)**.

```javascript
gsap.registerPlugin(SplitText);

// HyperFrames: split synchronously at build time, fonts already loaded
const split = SplitText.create(".heading", { type: "words, chars" });
tl.from(split.chars, { opacity: 0, y: 20, stagger: 0.03, duration: 0.4 }, 0.5);
```

**SplitText — key config (SplitText.create vars):**

| Option | Description |
|--------|-------------|
| **type** | Comma-separated: `"chars"`, `"words"`, `"lines"`. Default `"chars,words,lines"`. Only split what is needed (e.g. `"words, chars"` if not using lines) for performance. Avoid chars-only without words/lines or use **smartWrap: true** to prevent odd line breaks. |
| **charsClass**, **wordsClass**, **linesClass** | CSS class on each split element. Append `"++"` to add an incremented class (e.g. `linesClass: "line++"` → `line1`, `line2`, …). |
| **mask** | `"lines"`, `"words"`, or `"chars"`. Wraps each unit in an extra element with `overflow: clip` for mask/reveal effects. Access wrappers on the instance's **masks** array. |
| **tag** | Wrapper element tag; default `"div"`. Use `"span"` for inline (note: transforms like rotation/scale may not render on inline elements in some browsers). |
| **deepSlice** | When `true` (default), nested elements (e.g. `<strong>`) that span multiple lines are subdivided so lines don't stretch vertically. Only applies when splitting lines. |
| **ignore** | Selector or element(s) to leave unsplit (e.g. `ignore: "sup"`). |
| **smartWrap** | When splitting **chars** only, wraps words in a `white-space: nowrap` span to avoid mid-word line breaks. Default `false`. |
| **wordDelimiter** | Word boundary: string (default `" "`), RegExp, or `{ delimiter: RegExp, replaceWith: string }` for custom splitting (e.g. non-Latin scripts). |
| **prepareText(text, parent)** | Return modified text before splitting (e.g. to insert break markers for languages without spaces). |
| **propIndex** | When `true`, adds a CSS variable with index on each split element (e.g. `--word: 1`, `--char: 2`). |
| **reduceWhiteSpace** | Collapse consecutive spaces; default `true`. |
| **autoSplit** / **onSplit(self)** | Upstream feature for responsive re-splits on font load / resize. **Do NOT use in HyperFrames** — async re-splits break the synchronous-build contract. Load fonts first, split once. |

**Tips:** Split only what is animated (e.g. skip chars if only animating words). To avoid kerning shift when splitting chars, use CSS `font-kerning: none; text-rendering: optimizeSpeed;`. Avoid `text-wrap: balance`; it can interfere with splitting. SplitText does not support SVG `<text>`.

More: https://gsap.com/docs/v3/Plugins/SplitText/

### ScrambleText

Animates text with a scramble/glitch effect. Use when revealing or transitioning text with a scramble (see determinism caution in the adaptation rules above).

```javascript
gsap.registerPlugin(ScrambleTextPlugin);

tl.to(".text", {
  duration: 1,
  scrambleText: { text: "New message", chars: "01", revealDelay: 0.5 }
}, 2);
```

## SVG

### DrawSVG (DrawSVGPlugin)

Reveals or hides the stroke of SVG elements by animating `stroke-dashoffset` / `stroke-dasharray`. Works on `<path>`, `<line>`, `<polyline>`, `<polygon>`, `<rect>`, `<ellipse>`. Use when "drawing" or "erasing" strokes.

**drawSVG value:** Describes the **visible segment** of the stroke along the path (start and end positions). Format: `"start end"` in percent or length. Examples: `"0% 100%"` = full stroke; `"20% 80%"` = stroke only between 20% and 80%. The tween animates from the element's **current** segment to the **target** segment. Single value (e.g. `0`, `"100%"`) means start is 0.

**Required:** The element must have a visible stroke — set `stroke` and `stroke-width` in CSS or as SVG attributes; otherwise nothing is drawn.

```javascript
gsap.registerPlugin(DrawSVGPlugin);

// draw from nothing to full stroke
tl.from("#path", { duration: 1, drawSVG: 0 }, 0);
// or explicit segment: from 0-0 to 0-100%
tl.fromTo("#path", { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 1 }, 0);
// stroke only in the middle (gaps at ends)
tl.to("#path", { duration: 1, drawSVG: "20% 80%" }, 1);
```

**Caveats:** Only affects stroke (not fill). Prefer single-segment `<path>` elements; multi-segment paths can render oddly in some browsers. Contents of `<use>` cannot be visually changed. **DrawSVGPlugin.getLength(element)** and **DrawSVGPlugin.getPosition(element)** return stroke length and current position.

More: https://gsap.com/docs/v3/Plugins/DrawSVGPlugin

### MorphSVG (MorphSVGPlugin)

Morphs one SVG shape into another by animating the `d` attribute (path data). Start and end shapes do not need the same number of points. Works on `<path>`, `<polyline>`, and `<polygon>`; `<circle>`, `<rect>`, `<ellipse>`, and `<line>` are converted via **MorphSVGPlugin.convertToPath(selector | element)**.

**morphSVG value:** a **selector** (e.g. `"#lightning"`), an **element**, **raw path data**, or for polygon/polyline a **points string**. For full config use the **object form** with **shape** as the only required property.

```javascript
gsap.registerPlugin(MorphSVGPlugin);

// convert primitives to path first if needed:
MorphSVGPlugin.convertToPath("circle, rect, ellipse, line");

tl.to("#diamond", { duration: 1, morphSVG: "#lightning", ease: "power2.inOut" }, 0);
// object form:
tl.to("#diamond", {
  duration: 1,
  morphSVG: { shape: "#lightning", type: "rotational", shapeIndex: 2 }
}, 2);
```

**MorphSVG — key config (morphSVG object):**

| Option | Description |
|--------|-------------|
| **shape** | _(Required.)_ Target shape: selector, element, or raw path string. |
| **type** | `"linear"` (default) or `"rotational"`. Rotational uses angle/length interpolation and can avoid kinks mid-morph; try it when linear looks wrong. |
| **map** | How segments are matched: `"size"` (default), `"position"`, or `"complexity"`. Use when start/end segments don't line up. |
| **shapeIndex** | Offsets which point in the start path maps to the first point in the end path (avoids shape "crossing over"). Number for single-segment paths; **array** for multi-segment. Negative reverses that segment. Use **shapeIndex: "log"** once to log the auto-calculated value, then paste it in. Only applies to closed paths. |
| **smooth** | (v3.14+). Adds smoothing points. Number (e.g. `80`), `"auto"`, or object: `{ points, redraw, persist }`. Use when the default morph looks jagged. |
| **curveMode** | Boolean (v3.14+). Interpolates control-handle angle/length instead of raw x/y to avoid kinks on curves. |
| **origin** | Rotation origin for **type: "rotational"**. `"50% 50%"` (default) or `"20% 60%, 35% 90%"` for different start/end origins. |
| **precision** | Decimal places for output path data; default `2`. |
| **precompile** | Array of precomputed path strings (or **precompile: "log"** once, copy from console). Skips expensive startup calculations for very complex morphs. |

**Utilities:** **MorphSVGPlugin.convertToPath()**, **rawPathToString()**, **stringToRawPath()**. The plugin stores the original `d` on the target (tween back with `morphSVG: "#originalId"`).

More: https://gsap.com/docs/v3/Plugins/MorphSVGPlugin

### MotionPath (MotionPathPlugin)

Animates an element along an SVG path. Use when moving an object along a curve or custom route.

```javascript
gsap.registerPlugin(MotionPathPlugin);

tl.to(".dot", {
  duration: 2,
  motionPath: { path: "#path", align: "#path", alignOrigin: [0.5, 0.5], autoRotate: true }
}, 0);
```

**MotionPath — key config (motionPath object):**

| Option | Description |
|--------|-------------|
| `path` | SVG path element, selector, or path data string |
| `align` | Path element or selector to align the target to |
| `alignOrigin` | `[x, y]` origin (0–1); default `[0.5, 0.5]` |
| `autoRotate` | Rotate element to follow path tangent |
| `curviness` | 0–2; path smoothing |

## Easing

### CustomEase

Custom easing curves (cubic-bezier or SVG path). Use when a built-in ease is not enough.

```javascript
gsap.registerPlugin(CustomEase);
const ease = CustomEase.create("name", ".17,.67,.83,.67");
// or a complex curve as normalized SVG path data:
const hop = CustomEase.create("hop", "M0,0 C0,0 0.056,0.442 0.175,0.442 0.294,0.442 0.332,0 0.332,0 0.332,0 0.414,1 0.671,1 0.991,1 1,0 1,0");
tl.to(".el", { x: 100, ease: ease, duration: 1 }, 0);
```

### EasePack

Adds more named eases (SlowMo, RoughEase, ExpoScaleEase). Register and use the ease names in tweens. SlowMo is excellent for drive-by product shots; RoughEase for jitter/glitch motion.

### CustomWiggle

Wiggle/shake easing — a value oscillates N times. The go-to for camera-shake and impact-shake beats.

### CustomBounce

Bounce-style easing with configurable strength.

## Physics

Physics plugins compute deterministic curves from initial conditions — fully render-safe in HyperFrames.

### Physics2D (Physics2DPlugin)

2D physics (velocity, angle, gravity). Use for projectiles, confetti, particle bursts.

```javascript
gsap.registerPlugin(Physics2DPlugin);

tl.to(".ball", {
  duration: 2,
  physics2D: { velocity: 250, angle: 80, gravity: 500 }
}, 0);
```

### PhysicsProps (PhysicsPropsPlugin)

Applies physics to property values.

```javascript
gsap.registerPlugin(PhysicsPropsPlugin);

tl.to(".obj", {
  duration: 2,
  physicsProps: {
    x: { velocity: 100, end: 300 },
    y: { velocity: -50, acceleration: 200 }
  }
}, 0);
```

## Development

### GSDevTools

UI for scrubbing timelines, toggling animations, and debugging. **Preview-only** — use while iterating in `bunx hyperframes preview`, remove before `ralphy render`.

```javascript
gsap.registerPlugin(GSDevTools);
GSDevTools.create({ animation: tl });
```

## Other

### Pixi (PixiPlugin)

Integrates GSAP with PixiJS for animating Pixi display objects. For canvas-driven compositions; see also the `three` skill for the WebGL determinism contract (hf-seek events).

```javascript
gsap.registerPlugin(PixiPlugin);
tl.to(sprite, { pixi: { x: 200, y: 100, scale: 1.5 }, duration: 1 }, 0);
```

## Best practices

- Register every plugin used with **gsap.registerPlugin()** before first use.
- Add every plugin-returned tween (`Flip.from()`, etc.) to the registered `window.__timelines` timeline — orphan tweens don't render.
- Split text synchronously after fonts load; never `autoSplit` in a composition.

## Do Not

- Use a plugin in a tween or API without registering it first.
- Ship GSDevTools in a render-bound composition.
- Reach for Draggable / Observer / ScrollTo / ScrollSmoother in a composition — there is no user input in a render. If an upstream example uses them, replace the trigger with a timeline position.

## Learn More

https://gsap.com/docs/v3/Plugins/
