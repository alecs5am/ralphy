# Poster-collage explainers: `ralphy editor poster` (#598)

A poster-collage explainer is a faceless 9:16 montage cut to a voiceover: big condensed red titles whose letters scatter in, small kicker labels, handwritten notes, collected cut-outs and stickers, emoji and Lottie, stamps, counters, paper clippings, and a micro-effect on almost every beat. `ralphy editor poster` builds the whole composition from one scenes file with an engine embedded in the CLI (`cli/lib/poster/`), so the agent writes data, not HyperFrames code.

```bash
ralphy editor poster <project> --scenes <file.js> --audio <project-relative src> [--duration <sec>] [--lang <code>] [--title <text>] [--no-lint] [--dry-run]
```

- `--scenes` is a JavaScript file that defines `const ASSETS` and `const SCENES` (absolute, or relative to the cwd or the project). Keep it in the project tree, e.g. `<project>/poster-scenes.js`, so every snapshot carries it.
- `--audio` is the single audio track (a voiceover, or the source video whose audio you cut to). Its length is the default `--duration` (ffprobe).
- The verb validates every scene and item against the engine, checks that every `src` is in `ASSETS` and on disk, inlines the JSON of every Lottie the scenes use, copies `fonts/oswald.ttf`, `fonts/caveat.ttf`, `fonts/inter.ttf` and their `fonts/<font>-LICENSE.txt` from the licensed catalog fonts when missing (never over an existing file; run `ralphy catalog fonts sync` once per machine), snapshots the previous `index.html`, writes the new one, and runs the in-repo and upstream HyperFrames lints (a lint error exits 1 with the files written; `--no-lint` skips the upstream one). The snapshot is the same as `ralphy catalog use`: a project-tree Composition revision on a store root, an append-only `compositions/v<N>.html` on a tree-only root. Nothing is deleted.
- `--dry-run` prints the plan (scene and item counts, referenced, missing and unused assets, inlined Lottie bytes, font copies, the snapshot) and exits 1 when an asset is missing. A real build refuses a missing asset by name.

## When to use

- Faceless explainers over a voiceover or a source clip's audio: history, "why X", myth versus fact, rankings, "N facts about".
- The poster-collage look: condensed Oswald titles in red or white, Inter kicker labels, Caveat notes, cut-out subjects with sticker outlines, flat-color or sunburst backgrounds, paper texture.
- Versus formats (A vs B, before and after, myth and verdict).
- Not for edits of live footage, talking heads or product UGC (author a normal HyperFrames composition), or long 16:9 essays ([`audio-explainer`](../../audio-explainer/SKILL.md)).

## Workflow

1. **Transcript first.** Get word timings from local Whisper and time every scene and item from them:

   ```bash
   bunx hyperframes transcribe <project>/artifacts/voiceover/vo.mp3 --model small --language <code>   # -> transcript.json, word-level
   ```

   A scene starts on the word that opens its idea; titles, stamps and impacts land on stressed words. Times in the scenes file are absolute composition seconds.
2. **Collect assets** with `ralphy stock` ([stock-assets.md](./stock-assets.md)), open licenses only for a published cut:

   ```bash
   ralphy stock search "golden retriever" --kind image --license open
   ralphy stock search fire --kind animation --license open      # Noto Lottie for emoji beats
   ralphy stock search "money bag" --kind sticker --license open # Fluent 3D emoji
   ralphy stock search "trending up" --kind icon --license open
   ralphy stock pull <candidate-id...> --project <id> --license open
   ```

   Lottie lands in `artifacts/animations/`, images, stickers and icons in `artifacts/images/`.
3. **Cut-outs.** Matte the subject with BiRefNet (any object; convert JPEG to PNG first), then crop to the alpha bounding box so `x / y / w / h` place the subject, not empty margins:

   ```bash
   ralphy image convert --in artifacts/images/dog.jpg --out artifacts/images/dog.png --project <id>
   ralphy matte subject artifacts/images/dog.png --model birefnet --project <id>   # -> artifacts/images/, PNG with alpha
   ralphy image fit --in <matted.png> --out artifacts/images/dog-cut.png --trim-alpha --project <id>
   ```

   `hyperframes remove-background` (u2net) fails on product shots; prefer BiRefNet. Setup and options: [keying-and-matting.md](./keying-and-matting.md).
4. **Write the scenes file** (schema below), then build:

   ```bash
   ralphy editor poster <id> --scenes poster-scenes.js --audio artifacts/voiceover/vo.mp3 --dry-run
   ralphy editor poster <id> --scenes poster-scenes.js --audio artifacts/voiceover/vo.mp3 --title "Dogs vs cats"
   ```

5. **Check frames** with the QA loop below, fix the scenes file, build again (each build snapshots the previous page).
6. **Render** with `ralphy render <id>`, then sample frames from the master.
7. **Credits:** paste `ralphy stock credits --project <id> --markdown` into the post copy whenever a pulled item requires attribution.

## The scenes file

```js
// poster-scenes.js: plain JavaScript; helpers and constants are allowed.
const ASSETS = {
  paper: "artifacts/images/paper.jpg",            // optional: texture for paper / white backgrounds and paper sheets
  dog: "artifacts/images/dog-cut.png",
  cat: "artifacts/images/cat-cut.png",
  "lot-fire": "artifacts/animations/lot-fire.json"
};
const INK = "#1A1A1A", WHITE = "#FFFFFF";
const SCENES = [
  { t: 0, bg: "red", shake: [0.62], flash: [0.62], items: [
    { type: "kick", text: "the oldest friendship", x: 80, y: 260, w: 920, at: 0.1 },
    { type: "title", lines: ["DOGS"], x: 60, y: 320, w: 960, size: 260, color: WHITE, z: 1 },
    { type: "img", src: "dog", x: 160, y: 560, w: 760, h: 900, anim: "drop", land: 0.6, cls: "sticker", z: 2 },
    { type: "lottie", src: "lot-fire", x: 760, y: 420, w: 200, h: 200, at: 0.9, jelly: 1.3 }
  ]},
  { t: 2.4, bg: "paper", enter: "slide", items: [
    { type: "script", text: "about", x: 300, y: 380, color: INK, at: 2.5 },
    { type: "counter", to: 16000, suffix: " YEARS", x: 80, y: 470, w: 920, size: 180, at: 2.8, jelly: 3.8 },
    { type: "stamp", text: "TRUE", x: 330, y: 1100, at: 4.0 }
  ]}
];
```

- `ASSETS` maps a key to a project-relative path; items name assets by key (`src`). Every key an item uses must be in `ASSETS` and on disk. `ASSETS.paper`, when present, is the texture for `paper` / `white` backgrounds and `paper` sheets.
- `SCENES` is sorted by `t`. A scene lasts until the next scene's `t` (the last one until the duration). Item times are absolute seconds.
- The CLI runs the file to validate it, with only `COMP_ID` and `DURATION` defined: no DOM, no `gsap`. Do not write `</script` in it.
- Positions and sizes are composition pixels on the 1080x1920 frame (`x`, `y` = top-left, `w`, `h`), `z` is the CSS z-index inside the scene. Children of `group`, `paper` and `scroll` use their container's coordinates.

### Scene fields

| Field | Meaning |
|---|---|
| `t` | Start, seconds. Required, ascending. |
| `bg` | `red`, `blue`, `black`, `navy`, `paper`, `white`, `beige`, `sunset`. Red, black, beige and blue get rotating sunburst rays; paper and white get the `ASSETS.paper` texture. |
| `rays`, `raySpin` | Force rays on any background; rotation over the scene in degrees (default 8). |
| `grain` | `false` turns off the film grain. |
| `blueprint` | Faint concentric circles and guide lines over the background. |
| `push` | Camera scale at the scene end (default 1.05, a slow push-in). |
| `pan` | `[{ at, to: { x, y, scale, rotation } }]` camera moves (1.2 s each, `to.duration` overrides). |
| `shake` | `[times]` impact jitter, 0.24 s. |
| `punch` | `[times]` punch-in to 1.08 and back. |
| `flash` | `[times]` white flash, 0.25 s. |
| `shatter` | `[{ target, at, cols, rows }]`: the item with `id: target` (img, card, box, paper or group) breaks into triangle shards that fall away (default 5x6). |
| `enter` | Transition into the scene: `zoomcut` (default, 0.14 s scale cut), `iris` (circle opening from `iris: { x, y }`, starts 0.3 s early), `push` (from below), `slide` (from the right), `glitch` (RGB jitter). |
| `items` | The items, drawn in order (later items paint on top unless `z` says otherwise). |

### Fields every item takes

`type`; `at` (seconds; a scene-level item defaults to the scene start + 0.05, an item inside a group, paper or scroll needs its own); `x`, `y`, `w`, `h`, `z`; `id` (an img, card, box, paper or group can be a shatter target); `anim`, the entrance: `pop` (default for most), `drop`, `left`, `right`, `rise`, `zoom`, `fade`, `slam`, `tilt`, `flipY`, `flipX`, `none`.

Deformation fields (img, lottie, icon; `jelly` also on title, counter, box): `land` (time: squash on landing, the drop / rise follow-up), `jelly` (time or times: a squish), `wobble` (degrees: rocking for the rest of the scene), `warp` (`[{ at, amp, dur }]`: a displacement ripple), `spin` (degrees over the rest of the scene).

### Item types

| Type | Fields | What it draws |
|---|---|---|
| `title` | `lines` (strings, or `{ t, at, size }` per line), `size` (default 200), `color` (default red `#D0231D`), `w` (fit width), `align`, `rot`, `reveal`, `glow`, `glitch`, `strike`, `jelly` | Uppercase Oswald 700, stretched 1.24 tall. Each line is fitted into 95% of `w`. `reveal`: `scatter` (default; letters fly in in random order), `drop` (letters bounce down), `type` (typewriter), or any entrance preset for the whole line. `glow`: red glow. `glitch`: time of an RGB-split jitter. `strike`: time a black strike-through bar draws. |
| `kick` | `text`, `size` (default 40), `color` (default white), `align`, `rot`, `marker`, `markerColor` | Inter 600 label that fades up. `marker`: time a yellow highlighter sweeps behind it. |
| `script` | `text`, `size` (default 76), `color` (default ink), `rot`, `dur` (write-on, default 0.45), `marker`, `markerColor` | Caveat handwritten note that writes on left to right; shrinks to end before x 1000. |
| `img` | `src`, `cls` (`sticker`: white outline and shadow; `print`: photo border; `cut`: drop shadow), `fit` (`contain` default, `cover`), `flip`, `filter` (CSS, e.g. a duotone), `radius`, `rot`, `drift` (`false` stops the slow 1.05 zoom), `exit` (`{ at, to: { ...GSAP vars } }`), deformation fields | A picture, cut-out or sticker. |
| `lottie` | `src` (Lottie JSON), deformation fields | An animated emoji or Lottie that loops from its own `at` to the scene end. |
| `card` | `src`, `ih` (image height, default `h`), `bg` (default beige), `caption`, `grayAt`, `badge` (icon name; `check` is green, others red), `badgeAt`, `filter`, `rot` | A rounded card with an image and an optional white caption strip. `grayAt`: the image turns gray and dark (a "ruled out" beat). |
| `icon` | `name`, `size` (default 120), `color` (default white), `label`, `turn` (`{ at, color }`), deformation fields | A built-in flat SVG icon: `person`, `bowl`, `house`, `shield`, `bow`, `stopwatch`, `chart`, `heart`, `cross`, `check`, `star`, `dogface`, `paw`, `catface`, `skull`, `bubble`, `spark`. |
| `bubbles` | `list: [{ text, x, y, at, color, size }]` | Chat bubbles that pop from their lower-left corner and float. |
| `grid` | `x`, `y`, `cols`, `cell`, `gap`, `tiles: [{ src, bg, fg, at, flash }]` | Square tiles that flip in, each showing its image as a black silhouette (`fg: "light"`: a light one); `flash`: time a tile flashes white. |
| `counter` | `to`, `prefix`, `suffix`, `size` (default 200), `color` (default red), `dur` (roll, default 0.9), `jelly` | An odometer: every digit column rolls from 0 to its digit; the last three digits spin extra turns and settle later. Thousands are space-separated. |
| `people` | `n`, `size`, `lit`, `litAt` | A row of `n` person icons dropping in; the first `lit` turn white from `litAt`, 0.07 s apart (a "7 in 10" beat). |
| `line` | `w`, `color` (default ink) | A 5 px rule drawing left to right. |
| `arcs` | `paths: [{ d, at, len }]`, `color` | Dashed connectors (SVG path data in frame coordinates) that draw on, e.g. from a subject to its labels. |
| `burst` | `x`, `y`, `n` (10), `icon` (`paw`), `size` (60), `color`, `dist` (360) | Icons that fly out from a point and fade (an impact accent). |
| `orbit` | `cx`, `cy`, `r`, `icons`, `color` | A dashed ring with icons popping in around it; the ring turns 60 degrees over the scene (a list of N things). |
| `box` | `cls` (`vs`: yellow VS badge; `crack`: glowing white split line; `qcard`: question card; `glowblue`: blue glow), `color`, `radius`, `clip`, `text`, `jelly` | A plain block; the classes above make the versus and quiz pieces. Default entrance `fade`. |
| `stamp` | `text`, `size` (default 120), `color` (default red), `rot` (default -10), `light` | A rubber stamp that slams down (verdicts: TRUE, MYTH, NO). Multiply-blended for light backgrounds; set `light: true` on dark ones. |
| `bar` | `w`, `h`, `color`, `label`, `labelColor`, `value` | A bar that grows from the left with a label above and a value inside. |
| `paper` | `w`, `h`, `folds` (3), `step` (0.18), `sheetColor`, `items` | A sheet that unfolds like an accordion, strip by strip; its `items` draw on the sheet (clippings, timelines). |
| `scroll` | `w`, `h`, `dur` (0.9), `items` | A scroll that unrolls down between two wooden rods (hanging art, old documents). |
| `group` | `w`, `h`, `bg`, `clip` (CSS clip-path), `rays`, `cls`, `anim` (default `none`), `moves` (`[{ at, to }]`), `items` | A clipped container; `moves` tween the whole group (slide a half away, zoom a panel). |

## Effect recipes

- **Versus split.** Two full-frame groups clipped to a top and a bottom polygon (`clip: "polygon(0 0,100% 0,100% 42%,0 58%)"` and `"polygon(0 62%,100% 46%,100% 100%,0 100%)"`), entering `left` and `right`, each with its own `bg`, title and cut-out. On the seam: a `box` with `cls: "crack"` (x -60, w 1200, h 10, across the middle), a collision Lottie, a `box` with `cls: "vs"` (220x220, `anim: "slam"`, `jelly` a beat later), and a `burst`. Add `shake` and `flash` on the collision time. Wrap it in a helper function that takes the labels and times and returns the items, then spread it into the scene.
- **Text behind the subject.** Title at `z: 1`, cut-out at `z: 2`, placed so the cut-out overlaps the lower part of the title. The first letters must stay readable.
- **Shatter on a card.** Give the card (or a `qcard` box) an `id`, add `shatter: [{ target: "<id>", at, cols: 5, rows: 3 }]` to the scene, and slam the answer title in at the same time with `glitch` and a scene `flash`.
- **Paper unfold for timelines and clippings.** A `paper` item with `folds: 3`, and inside it a `script` date, a `title`, a `counter` and `line` / `icon` rows, each with its own `at`.
- **Scroll for hanging art.** A `scroll` with an `img` (`fit: "cover"`) and a caption inside.
- **Iris from an icon.** End a scene on an icon, start the next with `enter: "iris"` and `iris: { x, y }` at that icon's center.
- **Orbit for lists.** One `orbit` with the N icons, the list title above, a `kick` per item if the voice names them.
- **Stamps for verdicts.** `stamp` on the word that delivers the verdict; `light: true` on dark backgrounds.
- **Squash on landing.** `anim: "drop"` (or `rise`) plus `land` about 0.45 s later; `jelly` on the stressed word after that.
- **Counters.** `counter` on the number word, `jelly` when the roll settles, `script` units around it.

## Layout rules

- Frame 1080x1920. Text (titles, kicks, scripts, stamps, counters) stays inside x 80-960 and y 220-1450: above and below sit the TikTok / Reels / Shorts UI (check with `ralphy editor lint-safe-zones <id>`).
- Cut-outs may cross the bottom edge; a subject standing on the frame edge reads as a poster.
- A cut-out never hides the first letters of a title. Overlap the end or the lower part.
- Light stamps (`light: true`) on dark backgrounds; the default multiply stamp vanishes on black.
- One idea per scene, one title per idea; two lines at most. Let the fit shrink a long line rather than wrapping words by hand.

## QA loop

`hyperframes snapshot` writes its PNGs into the directory it reads, so do not point it at the project. Build with the verb, then mirror the project into a scratch folder with links to its media:

```bash
QA=<scratch>/poster-qa; P=.ralphy/workspaces/<ws>/projects/<id>
mkdir -p "$QA" && ln -sfn "$PWD/$P/artifacts" "$QA/artifacts" && ln -sfn "$PWD/$P/fonts" "$QA/fonts"
cp "$P/index.html" "$QA/index.html"
bunx hyperframes snapshot "$QA" --at 0.6,2.9,5.2,9.9,13.5     # one time per beat you changed
```

Tile the PNGs into one sheet (or read them in order) and check every beat: titles fitted and readable, nothing hidden behind a cut-out, Lottie playing, counters settled, no item peeking in before its time. Fix the scenes file and build again. After `ralphy render <id>`, sample frames from the master into the same scratch folder (`ralphy hyperframes extract-frames <id> --in render/<file>.mp4 --at 2.1 8.4 30 --out-dir "$QA/master"`) and look at them the same way.

Render pipeline facts for these projects: `ralphy render --loudnorm` and `--from-clip` are not supported on store projects; normalize the audio first with `ralphy audio loudnorm --in <src> --out <dst> --project <id>` (the output is recorded in the store) and point `--audio` at it.

## Lessons (why the engine is built this way)

Each rule fixed a broken render; the engine keeps them, so a scenes file does not need to work around them.

- **Lottie timing.** The HyperFrames lottie adapter finds every player through `window.lottie.getRegisteredAnimations()` and seeks it to absolute composition time, which blanks a short emoji loop that starts late. The engine keeps a private handle (`const LOT = window.lottie`), drives each player's frame from its own start with a GSAP tween on an accessor property, and sets `window.lottie = undefined` at the end.
- **Inline Lottie data.** A `path` load is async and can miss early frames in parallel render workers, so the verb inlines the JSON (`animationData`, one copy per instance). Use Lottie JSON; a `.lottie` file is not inlined.
- **Synchronous title fit.** Render workers capture before web fonts finish loading, so titles are fitted synchronously from an Oswald 700 advance-width table; the fit after `document.fonts.ready` only refines.
- **Odometer counter.** `onUpdate` callbacks do not fire under `hyperframes snapshot` seeks, so the counter is digit columns tweened by `yPercent`.
- **`immediateRender: false`.** Tweens that must stay invisible until their time (flash, burst) set it. Entrance presets that move far (`drop`, `left`, `right`, `rise`) also fade from opacity 0, so an element away from its position never peeks in.
- **Flip.** A flipped image is set with `gsap.set(scaleX: -1)` and drifts on `scaleX` and `scaleY` separately; GSAP parses an inline `scaleX(-1)` as rotation 180.
- **Shatter clones** clear the copied entrance state (opacity, transform) on every descendant.
- **Paper strips** reset the random seed per strip, so the copies of the sheet scatter identically.
- **Scene layers.** `.sc` (transition) > `.cam` (push, pans) > `.fx` (shake, punch). Never tween one property of one element from two places; put the second effect on another layer.
- **Render pipeline.** `ralphy render --loudnorm / --from-clip` are unsupported on store projects; normalize with `ralphy audio loudnorm`. `hyperframes remove-background` (u2net) fails on product shots; prefer BiRefNet.
