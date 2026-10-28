---
name: hyperframes
description: Create video compositions, animations, title cards, overlays, captions, voiceovers, audio-reactive visuals, and scene transitions in HyperFrames HTML. Use when asked to build any HTML-based video content, add captions or subtitles synced to audio, generate text-to-speech narration, create audio-reactive animation (beat sync, glow, pulse driven by music), add animated text highlighting (marker sweeps, hand-drawn circles, burst lines, scribble, sketchout), or add transitions between scenes (crossfades, wipes, reveals, shader transitions). Covers composition authoring, timing, media, and the full video production workflow. For dev-loop CLI commands (init, lint, inspect, preview, render) see the hyperframes-cli skill; for asset preprocessing commands (tts, transcribe, remove-background) see the hyperframes-media skill.
---

# HyperFrames

> **Minimal re-read set after context compaction:** "Approach" Steps 1-3 and the HARD-GATE, "Data Attributes", "Composition Structure", "Video and Audio" (HARD RULES #047), "Timeline Contract", "Rules (Non-Negotiable)", "Scene Transitions", and the "Output Checklist" in this file. Load `references/` files only for the technique in hand, with a bounded read for any file over 20k characters.

HTML is the source of truth for video. A composition is an HTML file with `data-*` attributes for timing, a GSAP timeline for animation, and CSS for appearance. The framework handles clip visibility, media playback, and timeline sync.

## Approach

### Discovery (exploratory requests only)

Open-ended request ("make me a product launch video") with no committed direction: ask audience, platform, priority, and whether the user wants variations before picking colors ([`references/discovery.md`](./references/discovery.md)). Specific requests ("add a title card") skip discovery.

### Step 1: Design system

If `design.md` or `DESIGN.md` exists in the project, read it first (check both casings — they're different files on Linux). It's the source of truth for brand colors, fonts, and constraints. Use its exact values — don't invent colors or substitute fonts. Any format works (YAML frontmatter, prose, tables — just extract the values).

If it names fonts you can't find locally (no `fonts/` directory with `.woff2` files, not a built-in font), warn the user before writing HTML: "design.md specifies [font name] but no font files found. Please add .woff2 files to `fonts/` or I'll fall back to [closest built-in alternative]."

If no `design.md` exists, offer the user a choice:

1. **User named a style or mood?** → Read [visual-styles.md](./visual-styles.md) for the 8 named presets. Pick the closest match.
2. **Want to browse options visually?** → Run the design picker: read [references/design-picker.md](references/design-picker.md) for the full workflow. This serves a visual picker page. The user configures mood, palette, typography, and motion in the browser, then copies the generated design.md and pastes it back into the conversation.
3. **Want to skip and go fast?** → Ask: mood, light or dark, any brand colors/fonts? Then pick a palette from [house-style.md](./house-style.md).

**design.md defines the brand. It does not define video composition rules.** Those come from [references/video-composition.md](references/video-composition.md) and [house-style.md](./house-style.md). Use brand colors at video-appropriate scale — not at web-UI opacity.

### Step 2: Prompt expansion

Always run on every composition (except single-scene pieces and trivial edits). This step grounds the user's intent against `design.md` and `house-style.md` and produces a consistent intermediate that every downstream agent reads the same way.

Read [references/prompt-expansion.md](references/prompt-expansion.md) for the full process and output format.

### Step 3: Plan

Before writing HTML, think at a high level:

1. **What** — what should the viewer experience? Identify the narrative arc, key moments, and emotional beats.
2. **Structure** — how many compositions, which are sub-compositions vs inline, what tracks carry what (video, audio, overlays, captions).
3. **Rhythm** — declare your scene rhythm before implementing. Which scenes are quick hits, which are holds, where do shaders land, where does energy peak. Name the pattern: fast-fast-SLOW-fast-SHADER-hold. Read [references/beat-direction.md](references/beat-direction.md) for rhythm templates.
4. **Timing** — which clips drive the duration, where do transitions land, what's the pacing.
5. **Layout** — build the end-state first. See "Layout Before Animation" below ([`references/layout-before-animation.md`](./references/layout-before-animation.md)).
6. **Animate** — then add motion using the rules below.

**Build what was asked.** A request for "a title card" is not a request for "a title card + 3 supporting scenes + ambient music + captions." Every scene, every element, every tween should earn its place. If additional scenes or elements would genuinely improve the piece, propose them — don't add them.

For small edits (fix a color, adjust timing, add one element), skip straight to the rules.

<HARD-GATE>
Before writing ANY composition HTML — verify you have a visual identity from Step 1. If you're reaching for `#333`, `#3b82f6`, or `Roboto`, you skipped it.
</HARD-GATE>

## Layout Before Animation

Build each scene's **hero frame** (its most-visible moment) as static HTML+CSS first, then add `gsap.from()` entrances that land on that ground truth (exits only where "Scene Transitions" below allows them). `.scene-content` fills the scene with `width: 100%; height: 100%; padding: Npx;` flex column + `box-sizing: border-box` — never `position: absolute; top: Npx` on a content container (absolute is for decoratives only). The full process, a worked example, and the shared-space / intentional-overlap rules: [`references/layout-before-animation.md`](./references/layout-before-animation.md).

## Data Attributes

### All Clips

| Attribute          | Required                          | Values                                                 |
| ------------------ | --------------------------------- | ------------------------------------------------------ |
| `id`               | Yes                               | Unique identifier                                      |
| `data-start`       | Yes                               | Seconds or clip ID reference (`"el-1"`, `"intro + 2"`) |
| `data-duration`    | Required for img/div/compositions | Seconds. Video/audio defaults to media duration.       |
| `data-track-index` | Yes                               | Integer. Same-track clips cannot overlap.              |
| `data-media-start` | No                                | Trim offset into source (seconds)                      |
| `data-volume`      | No                                | 0-1 (default 1)                                        |

`data-track-index` does **not** affect visual layering — use CSS `z-index`.

### Composition Clips

| Attribute                    | Required | Values                                                            |
| ---------------------------- | -------- | ----------------------------------------------------------------- |
| `data-composition-id`        | Yes      | Unique composition ID                                             |
| `data-start`                 | Yes      | Start time (root composition: use `"0"`)                          |
| `data-duration`              | Yes      | Takes precedence over GSAP timeline duration                      |
| `data-width` / `data-height` | Yes      | Pixel dimensions (1920x1080 or 1080x1920)                         |
| `data-composition-src`       | No       | Path to external HTML file                                        |
| `data-variable-values`       | No       | JSON object of per-instance variable overrides on a sub-comp host |

On the root `<html>` element:

| Attribute                    | Required | Values                                                                                                                         |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `data-composition-variables` | No       | JSON array of declared variables (id/type/label/default) — drives Studio editing UI and provides defaults for `getVariables()` |

## Composition Structure

Sub-compositions loaded via `data-composition-src` use a `<template>` wrapper. **Standalone compositions (the main index.html) do NOT use `<template>`** — they put the `data-composition-id` div directly in `<body>`. Using `<template>` on a standalone file hides all content from the browser and breaks rendering.

Sub-composition structure:

```html
<template id="my-comp-template">
  <div data-composition-id="my-comp" data-width="1920" data-height="1080">
    <!-- content -->
    <style>
      [data-composition-id="my-comp"] {
        /* scoped styles */
      }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      // tweens...
      window.__timelines["my-comp"] = tl;
    </script>
  </div>
</template>
```

Load in root: `<div id="el-1" data-composition-id="my-comp" data-composition-src="compositions/my-comp.html" data-start="0" data-duration="10" data-track-index="1"></div>`

## Variables (Parametrized Compositions)

Render one composition with different content (title, theme color, prices, captions) by declaring `data-composition-variables` on the `<html>` root (`id`, `type` = string | number | color | boolean | enum, `label`, `default`; enum adds `options`). Declaration, reading values in scripts, and render-time overrides: [`references/variables.md`](./references/variables.md).

## Video and Audio

Video must be `muted playsinline`. Audio is always a separate `<audio>` element:

```html
<video
  id="el-v"
  data-start="0"
  data-duration="30"
  data-track-index="0"
  src="video.mp4"
  muted
  playsinline
></video>
<audio
  id="el-a"
  data-start="0"
  data-duration="30"
  data-track-index="2"
  src="video.mp4"
  data-volume="1"
></audio>
```

### HARD RULES for timed media (#047)

Both rules below are enforced by `cli/lib/render/hyperframes-lint.ts` before
every `ralphy render` call. Violating either causes a silent freeze at capture
time, not a clean error — that is why they are pre-render gates.

1. **Timed media carries `id` + `data-start` on the element itself, never on a
   wrapper.** A `<div data-start="0" data-track-index="0"><video src="..."></video></div>`
   wrapper is invisible to the HyperFrames media scheduler — the runtime reads
   timing from the `<video>` / `<audio>` element directly. The render-time
   lint codes `media_missing_id` and `media_missing_data_start` are now author-
   time errors that block render.

   ```html
   <!-- WRONG — wrapper owns the timing attrs -->
   <div data-start="0" data-track-index="0" data-duration="6">
     <video src="clip.mp4" muted playsinline></video>
   </div>

   <!-- RIGHT — attrs on the element itself -->
   <video
     id="clip-1"
     data-start="0"
     data-track-index="0"
     data-duration="6"
     src="clip.mp4"
     muted
     playsinline
   ></video>
   ```

2. **For a montage of N short clips on one track, concat them into a single
   video.** The HyperFrames runtime cannot reliably switch between many short
   same-track video clips during capture — typically only the first plays and
   the rest render as a static frame. When `> 4` `<video>` elements share a
   `data-track-index` AND each `data-duration` is `< 3` seconds, the pre-render
   lint warns with a concat-fix suggestion. Either:

   - Concat the clips with `ffmpeg -f concat -i list.txt -c copy out.mp4` and
     reference the single resulting video, OR
   - Put each clip on its own `data-track-index` if they really must remain
     separate (e.g. for per-clip animation), OR
   - Add `data-allow-short-stack="true"` to any of the affected `<video>` tags
     once you have verified the composition renders correctly (override).

   Origin: `ralphy-vs-higgsfield-001` postmortem — 6×2s clips on track 0
   rendered only the first, others frozen / blank.

## Timeline Contract

- All timelines start `{ paused: true }` — the player controls playback
- Register every timeline: `window.__timelines["<composition-id>"] = tl`
- Framework auto-nests sub-timelines — do NOT manually add them
- Duration comes from `data-duration`, not from GSAP timeline length
- Never create empty tweens to set duration

## Rules (Non-Negotiable)

**Deterministic:** No `Math.random()`, `Date.now()`, or time-based logic. Use a seeded PRNG if you need pseudo-random values (e.g. mulberry32).

**GSAP:** Only animate visual properties (`opacity`, `x`, `y`, `scale`, `rotation`, `color`, `backgroundColor`, `borderRadius`, transforms). Do NOT animate `visibility`, `display`, or call `video.play()`/`audio.play()`.

**Animation conflicts:** Never animate the same property on the same element from multiple timelines simultaneously.

**No `repeat: -1`:** Infinite-repeat timelines break the capture engine. Calculate the exact repeat count from composition duration: `repeat: Math.ceil(duration / cycleDuration) - 1`.

**Synchronous timeline construction:** Never build timelines inside `async`/`await`, `setTimeout`, or Promises. The capture engine reads `window.__timelines` synchronously after page load. Fonts are embedded by the compiler, so they're available immediately — no need to wait for font loading.

**Never do:**

1. Forget `window.__timelines` registration
2. Use video for audio — always muted video + separate `<audio>`
3. Nest video inside a timed div — use a non-timed wrapper. The runtime reads `id` + `data-start` + `data-track-index` + `data-duration` from the `<video>` / `<audio>` element ITSELF, never from a parent. See "HARD RULES for timed media" below. Enforced by `cli/lib/render/hyperframes-lint.ts` (#047)
4. Use `data-layer` (use `data-track-index`) or `data-end` (use `data-duration`)
5. Animate video element dimensions — animate a wrapper div
6. Call play/pause/seek on media — framework owns playback
7. Create a top-level container without `data-composition-id`
8. Use `repeat: -1` on any timeline or tween — always finite repeats
9. Build timelines asynchronously (inside `async`, `setTimeout`, `Promise`)
10. Use `gsap.set()` on clip elements from later scenes — they don't exist in the DOM at page load. Use `tl.set(selector, vars, timePosition)` inside the timeline at or after the clip's `data-start` time instead.
11. Use `<br>` in content text — forced line breaks don't account for actual rendered font width. Text that wraps naturally + a `<br>` produces an extra unwanted break, causing overlap. Let text wrap via `max-width` instead. Exception: short display titles where each word is deliberately on its own line (e.g., "THE\nIMMORTAL\nGAME" at 130px).

## Scene Transitions (Non-Negotiable)

Every multi-scene composition MUST follow ALL of these rules. Violating any one of them is a broken composition.

1. **ALWAYS use transitions between scenes.** No jump cuts. No exceptions.
2. **ALWAYS use entrance animations on every scene.** Every element animates IN via `gsap.from()`. No element may appear fully-formed. If a scene has 5 elements, it needs 5 entrance tweens.
3. **NEVER use exit animations** except on the final scene. This means: NO `gsap.to()` that animates opacity to 0, y offscreen, scale to 0, or any other "out" animation before a transition fires. The transition IS the exit. The outgoing scene's content MUST be fully visible at the moment the transition starts.
4. **Final scene only:** The last scene may fade elements out (e.g., fade to black). This is the ONLY scene where `gsap.to(..., { opacity: 0 })` is allowed.

**WRONG — exit animation before transition:**

```js
// BANNED — this empties the scene before the transition can use it
tl.to("#s1-title", { opacity: 0, y: -40, duration: 0.4 }, 6.5);
tl.to("#s1-subtitle", { opacity: 0, duration: 0.3 }, 6.7);
// transition fires on empty frame
```

**RIGHT — entrance only, transition handles exit:**

```js
// Scene 1 entrance animations
tl.from("#s1-title", { y: 50, opacity: 0, duration: 0.7, ease: "power3.out" }, 0.3);
tl.from("#s1-subtitle", { y: 30, opacity: 0, duration: 0.5, ease: "power2.out" }, 0.6);
// NO exit tweens — transition at 7.2s handles the scene change
// Scene 2 entrance animations
tl.from("#s2-heading", { x: -40, opacity: 0, duration: 0.6, ease: "expo.out" }, 8.0);
```

## Animation Guardrails

- Offset first animation 0.1-0.3s (not t=0)
- Vary eases across entrance tweens — use at least 3 different eases per scene
- Don't repeat an entrance pattern within a scene
- Avoid full-screen linear gradients on dark backgrounds (H.264 banding — use radial or solid + localized glow)
- 60px+ headlines, 20px+ body, 16px+ data labels for rendered video
- `font-variant-numeric: tabular-nums` on number columns

If no `design.md` exists, follow [house-style.md](./house-style.md) for aesthetic defaults.

## Typography and Assets

- **Built-in fonts:** Write the `font-family` you want in CSS — the compiler embeds supported fonts automatically.
- **Custom fonts:** If design.md names a font that isn't built-in, the user must provide `.woff2` files in a `fonts/` directory. If missing, warn before writing HTML. When files exist, add `@font-face` declarations pointing to the local files.
- Add `crossorigin="anonymous"` to external media
- For dynamic text overflow, use `window.__hyperframes.fitTextFontSize(text, { maxWidth, fontFamily, fontWeight })`
- All files live at the project root alongside `index.html`; sub-compositions use `../`

## Editing Existing Compositions

- **Read actual files, don't guess.** When editing, extending, or creating companion compositions, read the existing source. Don't reconstruct hex codes from memory. Don't guess GSAP easing patterns. The composition IS the spec — extract exact values from it.
- Match existing fonts, colors, animation patterns from what you read
- Only change what was requested
- Preserve timing of unrelated clips

## Output Checklist

**Fast (run immediately, block on results):**

- [ ] `npx hyperframes lint` and `npx hyperframes validate` both pass
- [ ] Design adherence verified if design.md exists

**Slow (run in parallel while presenting the preview to the user):**

- [ ] `npx hyperframes inspect` passes, or every reported overflow is intentionally marked
- [ ] Contrast warnings addressed (see Quality Checks below / [`references/quality-checks.md`](./references/quality-checks.md))
- [ ] Animation choreography verified (see Quality Checks below)

## Quality Checks

After `lint` and `validate`, before hand-off: `npx hyperframes inspect` (layout overflow with timestamps and fix hints), the WCAG contrast audit in `hyperframes validate`, a design-adherence read against `design.md` (no invented colors, no lazy defaults), and the animation map for choreography. Commands, flags, and how to fix each failure: [`references/quality-checks.md`](./references/quality-checks.md).

## References (loaded on demand)

- **[references/captions.md](references/captions.md)** — Captions, subtitles, lyrics, karaoke synced to audio. Tone-adaptive style detection, per-word styling, text overflow prevention, caption exit guarantees, word grouping. Read when adding any text synced to audio timing.
- **[references/audio-reactive.md](references/audio-reactive.md)** — Audio-reactive animation: map frequency bands and amplitude to GSAP properties. Read when visuals should respond to music, voice, or sound.
- **[references/css-patterns.md](references/css-patterns.md)** — CSS+GSAP marker highlighting: highlight, circle, burst, scribble, sketchout. Deterministic, fully seekable. Read when adding visual emphasis to text.
- **[references/video-composition.md](references/video-composition.md)** — Video-medium rules: density, color presence, scale, frame composition, design.md as brand not layout. **Always read** — these override web instincts.
- **[references/beat-direction.md](references/beat-direction.md)** — Beat planning: concept, mood, choreography verbs, rhythm templates, transition decisions, depth layers. **Always read for multi-scene compositions.**
- **[references/typography.md](references/typography.md)** — Typography: font pairing, OpenType features, dark-background adjustments, font discovery script. **Always read** — every composition has text.
- **[references/motion-principles.md](references/motion-principles.md)** — Motion design principles, image motion treatment, load-bearing GSAP rules. **Always read** — every composition has motion.
- **[references/techniques.md](references/techniques.md)** — 11 visual techniques with code patterns: SVG drawing, Canvas 2D, CSS 3D, kinetic type, Lottie, video compositing, typing effect, variable fonts, MotionPath, velocity transitions, audio-reactive. Read when planning techniques per beat.
- **[references/narration.md](references/narration.md)** — Pacing, tone, script structure, number pronunciation, opening line patterns. Read when the composition includes voiceover or TTS.
- **[references/design-picker.md](references/design-picker.md)** — Create a design.md via visual picker. Read when no design.md exists and the user wants to create one.
- **[visual-styles.md](visual-styles.md)** — 8 named visual styles with hex palettes, GSAP easing signatures, and shader pairings. Read when user names a style or when generating design.md.
- **[house-style.md](house-style.md)** — Default motion, sizing, and color palettes when no design.md is specified.
- **[patterns.md](patterns.md)** — PiP, title cards, slide show patterns.
- **[data-in-motion.md](data-in-motion.md)** — Data, stats, and infographic patterns.
- **[references/transcript-guide.md](references/transcript-guide.md)** — Caption-side transcript handling: input formats, mandatory quality check, cleaning JS, OpenAI/Groq API fallback, "if no transcript exists" flow. (For the `transcribe` CLI invocation, model selection rules, and the `.en` gotcha, see the `hyperframes-media` skill.)
- **[references/dynamic-techniques.md](references/dynamic-techniques.md)** — Dynamic caption animation techniques (karaoke, clip-path, slam, scatter, elastic, 3D).

- **[references/transitions.md](references/transitions.md)** — Scene transitions: crossfades, wipes, reveals, shader transitions. Energy/mood selection, CSS vs WebGL guidance. **Always read for multi-scene compositions** — scenes without transitions feel like jump cuts.
  - [transitions/catalog.md](references/transitions/catalog.md) — Hard rules, scene template, and routing to per-type implementation code.
  - Shader transitions are in `@hyperframes/shader-transitions` (`packages/shader-transitions/`) — read package source, not skill files.

GSAP patterns and effects are in the `/gsap` skill.
