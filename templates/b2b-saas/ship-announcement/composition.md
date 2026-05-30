# composition — ship-announcement

The deliverable is a HyperFrames `index.html` rendered to a 1080×1080 silent mp4. This file captures the beat structure and the variables-first build workflow, generalized off the source brand.

## Slots

```
{{wordmark}}       — the brand / wordmark typed out in the hero beat
{{accent}}         — brand accent HEX (highlighted chip + tail color)
{{copy}}           — the one-line manifesto under the wordmark
{{rows}}           — JSON array of feature/model rows {k, v} (5 rows)
{{finalRowIndex}}  — index of the row that stays during the reverse-out beat
{{url}}            — end-slate URL + request line
{{logo_asset}}     — optional brand logo (pre-rasterized PNG if it scales >2x)
{{duration_s}}     — 8-12s
```

## Beat structure (source: 8.5s)

```
Beat 0  (0.0-0.05s) logo pops in just before the wordmark types
Beat 1  (0.05-1.3s) PARALLEL TYPEWRITER reveal — wordmark + copy + 5 rows type
                    in simultaneously at different per-char speeds, all done ~1.3s
Beat HOLD (1.5-4.4s) hold for reading (wordmark + 2 lines copy + 5 rows)
Beat 2  (4.4-6.0s)  everything reverse-typewriters out EXCEPT {{finalRowIndex}}
Beat 3  (6.0-8.5s)  end-slate: {{url}} + request line type in, brand lockup, hold
```

The cube-grid background runs CONTINUOUSLY under every beat (see `motion-stack.md`). Adapt the beat count to the brand's story — the parallel-typewriter primitive and the variables-first markup are the discipline, not the literal beat list.

## The variables-first, opacity-gated single-composition pattern (load-bearing)

ONE composition, ONE paused timeline. Brand values are declared in `data-composition-variables` from the FIRST render so the card is template-ready with no refactor. Beats are z-layered, gated by `autoAlpha`. **No sub-compositions, no `data-composition-src`** — they do not time-gate reliably (per the multi-scene gating memory).

```html
<html lang="en" data-composition-variables='[
  {"id":"wordmark","type":"string","label":"Wordmark","default":"OpenRouter"},
  {"id":"copy","type":"string","label":"Manifesto line","default":"..."},
  {"id":"rows","type":"string","label":"Rows JSON","default":"[]"},
  {"id":"finalRowIndex","type":"number","label":"Row kept in beat 2","default":4},
  {"id":"url","type":"string","label":"End-slate URL","default":"openrouter.ai"},
  {"id":"accent","type":"color","label":"Brand accent","default":"#818df8"}
]'>
  <div id="root" data-composition-id="root" data-start="0" data-duration="8.5"
       data-width="1080" data-height="1080">
    <!-- bg cube grid (continuous) ... -->
    <!-- main scene: .wordmark / .copy / .row-N (typewriter targets) -->
    <!-- end slate: #endUrl / #endReq -->
  </div>
  <script>
    const vars = window.__hyperframes?.variables ?? {};
    const wordmark = vars.wordmark ?? "OpenRouter";
    const accent   = vars.accent   ?? "#818df8";
    const rows     = JSON.parse(vars.rows ?? "[]");
    // ...
    window.__timelines = window.__timelines || {};
    window.__timelines["root"] = tl;   // paused GSAP timeline
  </script>
</html>
```

## The parallel-typewriter primitive (the signature move)

The cleanest typewriter in HyperFrames is NOT per-character span manipulation but a clip-path inset tweened with `ease: steps(N)`, N = the line's char count:

```js
function typewrite(tl, selector, startTime, speedPerChar) {
  const el = document.querySelector(selector);
  const chars = el.textContent.length;
  const dur = Math.max(chars * speedPerChar, 0.12);
  tl.fromTo(selector,
    { clipPath: "inset(0 100% 0 0)" },
    { clipPath: "inset(0 0% 0 0)", duration: dur, ease: "steps(" + chars + ")", immediateRender: false },
    startTime);
  return dur;
}
```

Multiple streams type in PARALLEL at different speeds (wordmark slower ~0.07s/char, body copy faster ~0.025s/char) so they finish at staggered times. The reverse-out is the same tween direction-flipped (`inset(0 0% 0 0)` → `inset(0 100% 0 0)`).

## Build workflow

```
1. Source-read (5 min) — if remixing a reference, extract frames at 2-4 fps for
   the FIRST 0.5s to ID the intro primitive (typewriter / slide / fade).
2. Brief lock (5 min) — wordmark, accent HEX, manifesto line, 5 rows, url, format
   (1:1), duration (8-12s), silent (yes). Get explicit "go".
3. Variables-first scaffold — declare every brand value as a
   data-composition-variables entry BEFORE writing motion. No hardcoded copy.
4. Comparison harness — set up cmp.sh (or its equivalent) that hstacks
   source/mine at 4s + 7s and writes to /tmp. Run after every render. Read before
   responding.
5. Build primitives one at a time, render after each, Read the cmp.png. Declare a
   named motion pattern per layer in a comment before tweening.
6. Legibility gate — after every contrast change, downscale 100x100 then back up
   and confirm both wordmark + grid read. Stop when it passes.
7. QA & render — ralphy render <id> (HyperFrames → 1080x1080 silent mp4); extract
   verify frames at hero + end and re-review.
```

## Render

`ralphy render <id>` is the only path. The source used `bunx hyperframes render` directly because the ralphy HyperFrames wrapper didn't exist yet (logged in that project's `postmortem/03-cli-issues.md`); use the ralphy verb.
