# Composition skeleton — Podcast Explainer (long-form, faceless)

HyperFrames composition layout for a 5-30 minute audio-driven essay. The shape is one root `index.html` that loads chapter sub-compositions via `data-composition-src`, plus a single audio track (the original VO) and one music-bed track that runs the full length.

---

## File layout

```
workspace/projects/<id>/
├── index.html                         ← root composition
├── compositions/
│   ├── chapter-01.html                ← one file per chapter
│   ├── chapter-02.html
│   └── ...
├── assets/
│   ├── audio/
│   │   ├── vo.mp3                     ← original VO (silence-removed)
│   │   ├── music.mp3                  ← ElevenLabs Music bed
│   │   ├── whoosh.mp3                 ← SFX set
│   │   ├── pop.mp3
│   │   └── hit.mp3
│   ├── screenshots/                   ← Playwright captures
│   ├── memes/                         ← generated images
│   ├── logos/                         ← brand marks
│   └── images/                        ← misc context images
├── captions.json                      ← ElevenLabs Scribe v1 word-level
├── overlay-plan.json                  ← skill-written
├── refs/                              ← original audio source
└── render/                            ← final.mp4 lands here
```

---

## Root `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Podcast Explainer — Long-form</title>
    <style>
      :root {
        --bg: #0a0a0a;
        --fg: #ffffff;
        --accent-1: #00d4ff;
        --accent-2: #ffb800;
        --accent-warn: #ff4757;
        --font-display: "Inter", system-ui, sans-serif;
        --font-mono: "JetBrains Mono", "Roboto Mono", monospace;
      }
      html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg); }
      body { font-family: var(--font-display); }
      .scene-content { width: 100%; height: 100%; padding: 80px; box-sizing: border-box; }
      .caption-chunk {
        position: absolute; left: 50%; top: 50%;
        transform: translate(-50%, -50%);
        font-family: var(--font-display); font-weight: 700;
        font-size: 64px; color: #ffffff; text-align: center;
        max-width: 1500px; line-height: 1.25;
      }
      .caption-chunk[data-pad="true"] {
        background: rgba(0, 0, 0, 0.6); padding: 16px 32px; border-radius: 12px;
      }
    </style>
  </head>
  <body>
    <div id="root"
         data-composition-id="podcast-explainer-longform"
         data-width="1920"
         data-height="1080"
         data-start="0">

      <!-- Audio tracks: VO + music bed run the full duration -->
      <audio class="clip"
             data-start="0" data-duration="AUDIO_DURATION_PLACEHOLDER"
             data-volume="1.0" data-track-index="0"
             src="assets/audio/vo.mp3"></audio>
      <audio class="clip"
             data-start="0" data-duration="AUDIO_DURATION_PLACEHOLDER"
             data-volume="0.35" data-track-index="1"
             src="assets/audio/music.mp3"></audio>

      <!-- Chapters: each one is a sub-composition -->
      <div class="clip" data-start="0"      data-duration="CHAPTER_01_DUR"
           data-composition-src="compositions/chapter-01.html"></div>
      <div class="clip" data-start="CHAPTER_02_START" data-duration="CHAPTER_02_DUR"
           data-composition-src="compositions/chapter-02.html"></div>
      <!-- ... -->

      <!-- Caption layer: reads window.__captions and renders the active chunk -->
      <div id="caption-layer"></div>

      <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
      <script>
        // Load captions.json at composition init.
        // The runtime exposes the current seek time on each frame; the caption
        // layer reads that and renders the matching chunk.
        window.__captions = []; // populated from captions.json by the skill
        window.__overlayPlan = []; // populated from overlay-plan.json by the skill
        window.__timelines = window.__timelines || {};
        const tl = gsap.timeline({ paused: true });
        // Caption chunks are emitted as GSAP set() ticks for determinism.
        // The skill expands captions.json → chunks and writes the tl.set calls inline.
        window.__timelines["podcast-explainer-longform"] = tl;
      </script>
    </div>
  </body>
</html>
```

The skill rewrites every `*_PLACEHOLDER` and `CHAPTER_NN_*` value when it composes the project. Durations come from the chapter boundaries in `overlay-plan.json`.

---

## Chapter sub-composition `compositions/chapter-NN.html`

```html
<div class="chapter" data-chapter-id="3" data-start="0">

  <!-- Chapter card: 2.4s -->
  <div class="clip" data-start="0" data-duration="2.4"
       data-overlay-type="chapter-card" data-hide-captions="true">
    <chapter-card title="Why this matters" chapter_number="3"></chapter-card>
  </div>

  <!-- Per-claim overlays: one <div class="clip"> per overlay-plan entry -->
  <div class="clip" data-start="2.4" data-duration="4.2"
       data-overlay-type="terminal">
    <terminal-window theme="vscode-dark">
      <pre>$ ralphy render my-project
▶ composing index.html
✔ render/final.mp4 (12.4 MB)</pre>
    </terminal-window>
  </div>

  <div class="clip" data-start="6.6" data-duration="3.8"
       data-overlay-type="code-block">
    <code-block lang="ts" theme="dracula">
function render(project) {
  return composeHtml(project) |> renderMp4;
}
    </code-block>
  </div>

  <!-- ...continue with one clip per overlay-plan entry inside this chapter... -->

  <!-- Closing punchline -->
  <div class="clip" data-start="LAST_START" data-duration="3.0"
       data-overlay-type="quote-card-kinetic" data-hide-captions="true">
    <quote-card-kinetic
      text="And that's the entire pipeline."
      emphasis_word="entire"></quote-card-kinetic>
  </div>

  <!-- SFX track for this chapter -->
  <audio class="clip" data-start="0" data-duration="0.4" data-volume="0.6"
         data-track-index="2" src="../assets/audio/whoosh.mp3"></audio>
  <!-- The skill emits one SFX clip per overlay swap per the placement rules in prompt-cookbook.md -->
</div>
```

---

## HyperFrames block dependencies

The composition uses these registry blocks. **None of them are upstream yet** — see `notes/ideas/006-hyperframes-overlay-blocks.md` for the contribution plan. Until they ship, the skill emits inline-styled fallback HTML with the same look:

| Block | Status | Fallback |
|---|---|---|
| `<chapter-card>` | not-yet-upstream | inline `<div class="chapter-card-fallback">` with the same CSS |
| `<quote-card-kinetic>` | not-yet-upstream | inline `<div>` with GSAP stagger reveal in the timeline |
| `<terminal-window>` | not-yet-upstream | `<pre class="terminal-fallback">` with monospace font + chrome rectangle |
| `<code-block>` | not-yet-upstream | Shiki SSR'd at compose-time → static HTML |
| `<tweet-card>` | not-yet-upstream | inline `<div class="tweet-fallback">` with avatar + text + meta |
| `<browser-frame>` | not-yet-upstream | inline `<div class="browser-frame-fallback">` with chrome bar + screenshot |
| `<logo-pop>` | not-yet-upstream | `<img>` with a 0.4s scale-in via GSAP |

The fallback CSS lives in the skill's references folder and gets inlined into `index.html` at compose time so the project is self-contained.

---

## Render

```bash
ralphy editor preflight <id>          # validate every clip's source file + duration
ralphy render <id>                    # auto-detects HyperFrames (index.html present)
```

The render output is `workspace/projects/<id>/render/final.mp4` at 1920×1080 @ 30fps. Use `--fps 60 --quality high` for higher-quality renders. Loudnorm pass is applied to the final mp4 via `--loudnorm`.

---

## Determinism guarantees

Per HyperFrames hard invariants:

- No `Date.now()` / `Math.random()` in any composition script. If a meme placement needs randomness, the skill seeds it from the project id.
- No `async` / `await` inside the timeline build script.
- No manual `video.play()` / `audio.play()` — the runtime owns playback via `data-start`.
- Timeline duration = composition duration. The root `data-duration` on each chapter clip matches the chapter's last claim end time exactly.
- All assets reference via relative paths (`assets/...`, `compositions/...`). No absolute paths, no network fetches at render time.
