# Prompt cookbook — Podcast Explainer (long-form, faceless)

Mechanics for turning one audio file into a long-form overlay-driven essay. The cadence and overlay-vocabulary rules here are the editorial brain — improvising them produces empty frames or visual chaos.

---

## Master pipeline

```
[ audio source (file or URL) ]
        │
        ▼  ralphy ref pull --audio-only  /  cp file
[ workspace/projects/<id>/refs/source.mp3 ]
        │
        ▼  ralphy generate captions --audio source.mp3
[ captions.json — Caption[] with word-level start/end ]
        │
        ▼  ralphy ref audio-describe
[ audio-analysis.json — tone, energy, music, VO style ]
        │
        ▼  Skill: claim segmentation (LLM over captions)
[ overlay-plan.json — [{ id, chapter, start, end, vo_text, type, content }] ]
        │
        ▼  Skill: per-overlay asset prep (only for types that need pre-generation)
        │       • screenshots via Playwright
        │       • memes via ralphy generate image
        │       • logos from a local set or generate image
        │
        ▼  ralphy generate music   (one long instrumental bed)
        ▼  ralphy generate sfx     (whoosh / pop / hit set)
        │
        ▼  Skill: compose index.html + chapter sub-compositions
[ workspace/projects/<id>/index.html + compositions/chapter-NN.html ]
        │
        ▼  ralphy editor preflight && ralphy render
[ render/final.mp4 — 1920×1080 @ 30fps ]
```

Every step is `ralphy`-driven except the LLM segmentation passes and the HTML emit — those live in the skill body (`.agents/skills/audio-explainer/SKILL.md`).

---

## Claim segmentation (the editorial brain)

The single most important step. Turning a 17-minute monologue into 200-300 four-second overlay slots is the whole format. The rules:

### Step 1 — group word-stream into claim blocks

A **claim block** is the smallest editorially-meaningful unit: one assertion the speaker makes. Rules:

- **Duration window:** 2-8 seconds. Below 2s the eye can't read an overlay; above 8s the frame goes stale.
- **Boundary signals (in priority order):**
  1. Full-stop or question mark in transcript punctuation.
  2. Pause > 350ms between words (read from `captions.json`).
  3. Discourse markers in the source language (English examples: "so", "but", "and then", "the thing is", "now", "alright"; the segmenter prompt receives the source language and is expected to know the equivalents).
  4. Topic shift (heuristic: noun-overlap between adjacent sentences < 30%).
- **Soft target:** 4 seconds. Bias toward 4s when boundaries are ambiguous.

### Step 2 — group claims into chapters

A **chapter** is 60-180 seconds of thematically-coherent claims. Boundaries:

- Long pause (> 1.5s) — the speaker is breathing between sections.
- Discourse meta-cue: "alright, let's talk about X", "the next thing", "moving on" (and equivalents in the source language).
- Topic shift detected by the LLM pass (instructed to mark `chapter_break: true` when noun-overlap to previous chapter drops below 20%).

Each chapter gets a name (3-5 words, the LLM coins it from the claims inside) and becomes a `chapter-card` overlay before its first claim.

### Step 3 — assign overlay type to each claim

This is the **vocabulary mapping**. Apply rules in priority order — first match wins:

| Priority | Trigger in claim text | Overlay type |
|---|---|---|
| 1 | Code keyword (`function`, `const`, `def`, `class`, `import`, `await`, a literal snippet quoted in VO) | `code-block` |
| 2 | CLI / terminal verb (`run`, `install`, `git`, `npm`, `bun`, `ls`, an error message like "command not found") | `terminal` |
| 3 | Quoted social post ("X tweeted that…", "someone wrote on Reddit") | `tweet-card` |
| 4 | URL or domain mentioned by name ("on docs.anthropic.com", "the GitHub README") | `browser-frame` (wrap a screenshot) |
| 5 | Brand / tool name mentioned in passing (Claude, Cursor, GitHub, Notion) | `logo-pop` (1-2s) |
| 6 | Process / comparison / architecture described ("there are three steps", "X versus Y", "the system has these parts") | `diagram` |
| 7 | Joke / reaction / callback ("which is hilarious", "imagine that", "guess what") | `meme` |
| 8 | Punchline or thesis statement (LLM-rated as high-emphasis, or VO loudness peak from audio-describe) | `quote-card-kinetic` |
| 9 | (None of the above match) | `screenshot` with a generic context prompt |

### Step 4 — emit `overlay-plan.json`

Schema:

```json
[
  {
    "id": "scene-001-overlay-01",
    "chapter": 1,
    "chapter_name": "Why this matters",
    "start": 0.0,
    "end": 4.2,
    "vo_text": "the actual transcript chunk",
    "type": "quote-card-kinetic",
    "content": {
      "text": "the line as it should appear on the card",
      "emphasis_word": "matters"
    }
  }
]
```

Per-type `content` shapes:

```jsonc
// code-block
{ "lang": "ts", "code": "function foo() { return 42; }", "theme": "dracula" }

// terminal
{ "lines": ["$ ralphy render my-project", "✔ rendered in 4.2s"], "theme": "vscode-dark" }

// tweet-card
{ "author": "@karpathy", "handle": "karpathy", "text": "...", "likes": "12k", "timestamp": "2026-05-20" }

// browser-frame
{ "url": "https://docs.anthropic.com/...", "screenshot_path": "assets/screenshots/anthropic-docs.png" }

// screenshot
{ "image_prompt": "a screenshot of the Cursor IDE showing ...", "asset_path": "assets/images/cursor-shot.png" }

// meme
{ "image_prompt": "drake meme: top panel says X, bottom says Y", "asset_path": "assets/memes/drake-01.png" }

// diagram
{ "layout": "flow", "nodes": [...], "edges": [...] }   // or mermaid source

// quote-card-kinetic
{ "text": "the punchline", "emphasis_word": "punchline" }

// chapter-card
{ "title": "Chapter 3 — Why this matters", "chapter_number": 3 }

// logo-pop
{ "brand": "claude", "asset_path": "assets/logos/claude.svg" }
```

---

## Caption rendering

Captions are produced from `captions.json` by a HyperFrames block, not by pre-baked text. The block reads the word-stream and re-chunks at render time. Rules:

- **Chunk size:** 8-15 words. Break on punctuation (`.`, `?`, `!`, `,`) when the chunk has ≥ 5 words. Force-break at 15 words even mid-sentence.
- **Position:** vertical middle of frame (50% from top). For 9:16 variant only, drop to bottom 22%.
- **Style:** Inter Bold, 64px on 1920×1080 (scales to 48px on 1080×1920). White (#FFFFFF) text. No stroke. Optional subtle dark gradient pad behind the chunk if the overlay underneath is light.
- **Animation:** fade in 0.15s, hold for chunk duration, fade out 0.15s. No per-word highlight.
- **Safe zone:** never on top of an overlay's primary content area. The `<chapter-card>` and `<quote-card-kinetic>` blocks already include their own typography — captions stay hidden during those (skill emits `data-hide-captions="true"` on those scenes).

---

## Music bed + SFX

### Music bed

One ElevenLabs Music call. Duration = audio length + 5s tail. Stays at -16 dBFS baseline. Sidechain ducked to -28 dBFS when VO is active (threshold detection on the VO track, not the captions timing).

Prompt template (no artist names — ToS):

```
Lo-fi ambient electronic instrumental, slow tempo (75-85 BPM), warm analog
synth pads, light vinyl crackle, no drums or minimal soft kicks, no melodic
hooks, mood: contemplative + focused. Cinematic background for a long-form
narrated essay. Stays in the background — never demands attention.
```

Variation tags (override `style` axis):
- `ambient electronic` → above default.
- `cinematic` → orchestral pads + sparse piano, 60-70 BPM.
- `lo-fi` → jazz-hop chords + brushed snare, 80-85 BPM.

### SFX set

Three reusable clips, generated once per project:

```bash
ralphy generate sfx --label whoosh \
  --prompt "fast tape whoosh transition, 0.4s, dark and short"
ralphy generate sfx --label pop \
  --prompt "soft UI pop click, 0.1s, glassy and dry"
ralphy generate sfx --label hit \
  --prompt "deep sub-bass hit, 0.6s, cinematic punchline"
```

Placement (skill-driven):
- `whoosh` on every chapter-card swap + every overlay type swap when the previous overlay was on screen ≥ 5s.
- `pop` on each in-chapter overlay swap when previous overlay was < 5s.
- `hit` on `quote-card-kinetic` reveals only.

All three sit at -12 dBFS baseline. SFX bus does not duck the music.

---

## Common mistakes

1. **Captions in bottom-third on 16:9.** That's a 9:16 / TikTok convention; on a 16:9 frame it leaves the upper 70% feeling empty. Center the chunks.
2. **Karaoke per-word highlight in this format.** Karaoke is a short-form convention. In long-form essays it reads as twitchy and TikTok-coded. Use centered-fade chunks.
3. **One overlay per sentence regardless of length.** A 12-second sentence is two claims, not one. Split. Two 4-second overlays beat one 12-second overlay every time.
4. **No music bed because "the audio is dry".** Dry audio in long-form reads as "amateur podcast clip". Always include the music bed, even at -18 dBFS.
5. **Logo-pop for every brand mention.** The skill should rate-limit logo-pop to ≤ 1 per chapter unless the brand is the topic. Otherwise the video turns into a sponsor reel.
6. **Generating screenshots from text prompts when a real screenshot exists.** A real Playwright screenshot of `docs.anthropic.com` always beats a generated "AI-mockup of docs page". The planner should prefer a `browser-frame` with a real screenshot over a `screenshot` from `ralphy generate image`.
7. **Forgetting to remove silence.** Raw podcast audio has 5-15% dead air. Without `silenceremove`, the pacing reads as a podcast cut, not a montage. Skill must run silence-removal before generating `captions.json` (so the timestamps match the trimmed audio).
8. **Animating `width / height` on chapter-card text.** HyperFrames hard kill #1 — animate the wrapper, not the child. Use the `<chapter-card>` block as-is.
9. **Long quote-card text.** A `quote-card-kinetic` is a 1-line moment, ≤ 12 words. Anything longer becomes a wall of text that doesn't read in 3 seconds.

---

## Worked example — 4-second claim → overlay

Input (from `captions.json`, claim block 47):

```json
{
  "start": 187.4,
  "end": 191.6,
  "words": [
    {"text": "you", "start": 187.4, "end": 187.55},
    {"text": "can", "start": 187.55, "end": 187.7},
    {"text": "literally", "start": 187.7, "end": 188.0},
    {"text": "run", "start": 188.0, "end": 188.2},
    {"text": "ralphy", "start": 188.2, "end": 188.5},
    {"text": "render", "start": 188.5, "end": 188.9},
    {"text": "and", "start": 188.9, "end": 189.05},
    {"text": "it", "start": 189.05, "end": 189.15},
    {"text": "just", "start": 189.15, "end": 189.35},
    {"text": "produces", "start": 189.35, "end": 189.85},
    {"text": "the", "start": 189.85, "end": 189.95},
    {"text": "mp4", "start": 189.95, "end": 190.25}
  ]
}
```

LLM segmenter output (one entry in `overlay-plan.json`):

```json
{
  "id": "scene-047",
  "chapter": 4,
  "chapter_name": "The CLI surface",
  "start": 187.4,
  "end": 191.6,
  "vo_text": "you can literally run ralphy render and it just produces the mp4",
  "type": "terminal",
  "content": {
    "lines": [
      "$ ralphy render my-project",
      "▶ composing index.html",
      "▶ rendering 1024 frames @ 30fps",
      "✔ render/final.mp4 (12.4 MB)"
    ],
    "theme": "vscode-dark",
    "typing_animation": false
  }
}
```

Composed scene in HyperFrames:

```html
<div class="clip" data-start="187.4" data-duration="4.2" data-overlay-type="terminal">
  <terminal-window theme="vscode-dark">
    <pre>$ ralphy render my-project
▶ composing index.html
▶ rendering 1024 frames @ 30fps
✔ render/final.mp4 (12.4 MB)</pre>
  </terminal-window>
  <!-- captions block reads window.__captions and renders the chunk for this time range -->
</div>
```

(The `<terminal-window>` and `<chapter-card>` blocks must exist in the HyperFrames registry — see `notes/ideas/` for the upstream-contribution work. Until they ship, the skill falls back to inline CSS-styled `<div>` blocks with the same look.)
