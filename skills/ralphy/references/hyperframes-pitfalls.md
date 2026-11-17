# HyperFrames pitfalls (render pinned to hyperframes@0.6.31)

The engine rules are in the upstream HyperFrames skills (`bunx hyperframes@0.6.31 skills`). Those
skills follow HyperFrames' main branch and can describe newer behaviour than the pinned renderer;
these are the 0.6.31 traps that cost Ralphy renders. When in doubt, a short test render decides.

## Structure

- One root `index.html` per Content, all scenes inside it as `.clip` elements. In 0.6.31,
  sub-compositions mounted with `data-composition-src` were not bound to time: every scene drew
  from t=0.
- Give `html, body` an explicit size of 1080x1920 (margin 0, overflow hidden); the root keeps its
  `data-width` / `data-height`.
- Put every `<script>` at the end of `<body>`. The bundler merges all local `<script src>` into the
  position of the first one; vendor scripts in `<head>` made the scene script run before the DOM
  existed and the render showed bare HTML.
- When the timeline lives in an external file, add a small inline
  `window.__timelines = window.__timelines || {}` script after it; the static check reads only the
  HTML text.
- Vendor GSAP and fonts into the Content folder (`@font-face` to a local file). No CDN or network
  at render time. Text set at runtime (`el.textContent = ...`) was missing from the font subset and
  fell back to a default face: ship the full font file.
- Keep source images within about 2x the canvas; a 7000x5000 JPEG decodes to ~140 MB per frame and
  ran out of memory.

## Time

- Render workers seek to arbitrary times. Everything visible must be a pure function of time:
  no `Date.now`, no unseeded `Math.random` (use a seeded generator), no state carried between frames.
- Seeks suppress GSAP `onUpdate` and other callbacks: counters, typed text and canvas drawings stayed
  at their first state ("0 x 0"). Drive them from a tween property with a getter/setter
  (`{ t: 0 }` tweened to `{ t: 1 }`, drawing inside the setter).

## Media

- Timing attributes and `id` go on the `<video>` / `<audio>` element itself, not on a wrapper; a
  missing `id` froze the clip. Video is `muted playsinline`; sound is a separate `<audio>`.
- Many short (< 3 s) `<video>` clips on one track: only the first played. Concatenate them with
  ffmpeg into one file, or spread them over tracks.
- Animating `width/height/top/left` of a `<video>` stalled its frames; the framework also forces
  `opacity: 1` on elements with `data-start`. Animate and fade a wrapper instead.
- An opacity crossfade between two `<video>` elements rendered as a hard cut. Bake the crossfade
  with ffmpeg `xfade` into one file. Dips to black and text overlays work.
- Audio comes out about 43-45 ms late in the render (seen with MP3 music and with a reference's AAC
  track). Measure with `ralphy tool compare` against the source, set `data-media-start` to the lag
  (e.g. `0.045`), render, measure again until the lag is under 1 ms.
- The rendered mp4's video stream starts at 0.021 s (an edit list) while audio starts at 0. The
  bundled tools measure from the first frame; account for the 21 ms when you read raw ffprobe times.

## 3D

- In one shared `preserve-3d` context Chrome culls every face after the first to a 1080x1920 box in
  that face's local pixels. Give each face its own wrapper carrying the shared transform (one 3D
  context per face), appended back to front. Four coplanar full-size faces with `clip-path`
  rendered only two; give each clipped face its own tight box.
- Layers under perspective rasterise at their CSS size and scale as bitmaps: shown at 2-40x they turn
  soft. Lay the geometry out at Q = clamp(scale, 1, 4) and put only scale/Q in the transform.
- Two renders of the same 3D scene are not byte-identical; compare frames by PSNR, not by hash.

## Checking

- `hyperframes snapshot` takes one comma-separated list: `--at 0.5,3,7.2`. A repeated `--at` keeps
  only the last value. It writes into `<dir>/snapshots/` and overwrites files with the same time,
  so snapshot a scratch clone (`cp -cR <content> ~/.cache/ralphy/snap-<slug>`), not the Content
  folder (the folder is what `content save` versions).
- A snapshot is a pre-encode preview. Some scenes (grain, glitch, late-loading scripts) froze at
  t=0 in snapshots but not in renders, and the reverse. Judge the rendered mp4:
  `ralphy tool frames render.mp4`.
