# Podcast Explainer (long-form, faceless) — vibe reference

**Genre:** audio-first long-form essay / explainer / podcast monologue → faceless overlay-driven video.
**Length:** 5-30 minutes (default 10-20 min). The template scales by adding chapter sub-compositions, not by stretching scenes.
**Format:** 16:9, 30fps, 1920×1080. Square (1:1) and 9:16 variants are opt-in (see [Variation axes](#variation-axes)).
**Engine:** HyperFrames. Composition lives at `workspace/projects/<id>/index.html` with chapter sub-compositions in `workspace/projects/<id>/compositions/chapter-NN.html`.

> **No reference-required gate by default.** The format does not need a real-entity ref (per AGENTS.md hard rule #3). If the audio names a specific person, brand, or product (e.g. "Anthropic shipped Claude 4.7"), the gate re-engages for any generated imagery referencing those names — drop the official logo / packaging or rephrase generically.

## Why this format works

The faceless dev-essay format has been the dominant YouTube AI/tech genre since mid-2025 (Fireship, Theo, Coding with Lewis, Russian dev channels like Deploy la Deploy). The mechanics:

1. **Audio carries the watch-time.** A confident narrator with a clear thesis holds attention through 15-20 minutes that no talking-head can. The viewer is half-watching, half-listening.
2. **Every claim has a visual.** Empty-frame audio is a retention killer past 90 seconds. The overlay vocabulary (code, terminal, tweet, screenshot, meme) keeps the eye busy without demanding focus.
3. **No production cost beyond the script.** No camera, no studio, no editor. The overlay decisions are the editing — and they are mechanical enough for an LLM to plan from a transcript.
4. **Search + algorithm + repurposing.** Long-form indexes on YouTube search and feeds the algorithm with watch-time; the same audio repurposes into Shorts via the `podcast-clip` template.

## Vibe anchors

Authoritative recipe — verified against the dev-essay reference at `workspace/references/codex-hyperframes-podcast/` (a 17-minute Russian tech-essay produced with Codex + HyperFrames, analyzed via `ralphy ref analyze-video` with `gemini-3.1-pro`). Numbers come from that analysis.

- **Faceless, no talking head.** Every frame is an overlay — never a webcam, never a presenter shot. If the brief implies a presenter, this is the wrong template (use `yap-talking-head`).
- **Captions: centered, full-sentence chunks, white Inter Bold.** Position: vertical middle (not bottom-thirds — bottom is for 9:16 short-form). 8-15 words per chunk, breaking on punctuation + breath. Fade in / fade out, no karaoke word-pop, no per-word highlight. White on dark background; if the overlay is light, a subtle 60% black gradient pad behind the caption block.
- **B-roll density: heavy (every-claim, ~4s avg).** Every meaningful sentence (a "claim") gets a fullscreen overlay. Average shot length ~4 seconds (range 2-8s). Overlay vocabulary is fixed — see [Overlay types](#overlay-types) below.
- **Music bed: constant, medium energy, ducked under VO.** ElevenLabs Music, instrumental, lo-fi or ambient electronic. Sidechain compress music by -8 to -12 dB when VO is active. Music stays present even between sentences (no full mute).
- **SFX on transitions and emphasis.** Whoosh on chapter cuts, pop/click on overlay swaps inside a chapter, optional sub-bass hit on punchlines. ElevenLabs Sound Generation, ≤22s each.
- **Cuts on silence, zoom punch-ins on emphasis.** Dead air > 600ms is removed (`ralphy audio remove-silence` once shipped; until then, the skill uses an inline ffmpeg recipe via `cli/lib/ffmpeg-recipes.ts`). Emphasis words trigger a 1.0 → 1.06 scale punch on the active overlay.
- **Dark mode, high-contrast UI, soft glow accents.** The reference palette is near-black background (#0a0a0a) with cyan / amber / red accents. Avoid pastels — they read as "AI brand video" in this genre.
- **Chapter cards every 60-180 seconds.** A 2-3s full-screen title card breaks the audio essay into named sections. The card is also the seek-handle for repurposing into shorts later.

## Overlay types

This is the entire vocabulary the planner picks from. Adding a new type means updating both the HyperFrames registry blocks AND `prompt-cookbook.md`.

| Type | When the planner picks it | HyperFrames block | Asset source |
|---|---|---|---|
| `code-block` | VO mentions a function, snippet, config | `<code-block lang theme>` (Shiki under the hood) | Composition-time render — no PNG bake |
| `terminal` | VO references a CLI command, output, error message | `<terminal-window>` with typing animation | Composition-time |
| `tweet-card` | VO quotes / references a tweet, social post | `<tweet-card author text>` | Composition-time mockup |
| `browser-frame` | VO references a URL, docs page, GitHub README | `<browser-frame url>` wraps a screenshot | Screenshot via Playwright (skill workflow) |
| `screenshot` | VO references software UI not on the web (IDE, app) | `<img>` inside a `<scene>` | `ralphy generate image` + manual ref drop |
| `meme` | VO lands a joke, reaction, callback | `<img>` with `meme-reaction` CSS class | `ralphy generate image` with meme prompt OR curated catalog |
| `diagram` | VO describes a process, comparison, architecture | `<diagram>` with named layout (flow / compare / arch) | Mermaid / Excalidraw via composition-time render |
| `quote-card-kinetic` | VO lands a punchline that deserves a typographic moment | `<quote-card-kinetic>` (big-text reveal) | Composition-time, text-only |
| `chapter-card` | Section break every 60-180s | `<chapter-card title>` | Composition-time, text-only |
| `logo-pop` | VO names a brand / tool — quick 1-2s logo flash | `<logo-pop src>` | Repo-provided logo set OR `ralphy generate image` |

The skill maps each transcript claim to exactly one of these types using the rules in `prompt-cookbook.md`.

## Variation axes

| Axis | Options |
|---|---|
| Aspect | **16:9** (default, YouTube native) / 1:1 (LinkedIn cross-post) / 9:16 (Shorts repurpose — but for that, prefer `podcast-clip` template) |
| Duration | 5 / 10 / 17 / 25 min (chapter count scales 3 / 5 / 8 / 12) |
| Source language | en / ru / es / pt / de / fr — captions follow source. VO model: ElevenLabs Scribe v1 handles word-level for all listed languages |
| Music bed | lo-fi / ambient electronic / cinematic / off (constant medium energy by default) |
| Theme | **dark-mode** (default, near-black bg) / light-mode (rare; only for design-focused content) |
| Caption style | **centered-fade** (default) / karaoke-word-pop (only when audience expects TikTok-style) |
| Chapter cadence | tight (every 60s) / **medium** (every 90-120s, default) / loose (every 180s) |

## Narrative arc

The structure is dictated by the audio, not the template. The template imposes *cadence* and *overlay vocabulary*, not story shape. That said, well-performing long-form essays share this skeleton:

```
0-15s    → Hook claim (audio carries; visual = quote-card-kinetic of the thesis line).
15-45s   → Setup: who's talking, why this topic now. Visual: chapter-card "INTRO" + one or two screenshots that establish the subject.
45s-end  → Per-chapter loop:
              chapter-card (2-3s) → claim-by-claim overlays (~4s each) → punchline (quote-card-kinetic) → next chapter-card
End      → Outro chapter-card with CTA / next-video link. 5-10s.
```

For a 17-minute reference, this resolves to ~5-8 chapters with ~25-40 overlay swaps each.

## Required user inputs

1. **Audio source** — local path (`.mp3` / `.wav` / `.m4a`) OR a YouTube/podcast URL the skill can pull with `ralphy ref pull --audio-only`. **Required.** Without audio, this template does not apply — use `faceless-voiceover` (script-first, ≤90s).
2. **Topic gloss** — one sentence describing what the audio is about. Helps the planner pick the right overlay vocabulary (a finance essay calls for tweet-cards + line-charts; a dev essay calls for code-block + terminal).
3. **(Optional) Source language** — auto-detected from audio. Override only when the audio is multi-lingual.
4. **(Optional) Aspect / duration / theme** — defaults are 16:9, audio-length, dark-mode.
5. **(Optional) Branding** — logo + accent color. The skill threads brand into chapter cards + outro only.

## When NOT to use

- **Short-form (< 5 min).** Use `faceless-voiceover` — its 3-act structure and 5-8s b-roll cadence is tuned for ≤90s; that pacing inside a 3-minute video reads as cramped. For 3-5 min, the planner can run this template with `--chapters 2` but the cost-of-overlays ratio gets worse below 5 min.
- **Talking-head essay.** If the user wants their face on screen, use `yap-talking-head` or `green-screen-explainer`. The faceless format wastes the asset.
- **Music-driven content (no speech).** Use `music-video` — captions and overlay-per-claim assume a speech-carried narrative.
- **The audio is a multi-speaker debate / interview.** Use `podcast-clip` (cut viral moments) or `interview-dialog` (split-screen). Long-form overlay treatment of a 2-speaker interview produces visual chaos.
- **Source language not covered by the transcriber.** ElevenLabs Scribe v1 handles 99 languages, but rare dialects may drop word-level timestamps. Run `ralphy generate captions --audio <mp3>` first and verify the JSON has per-word `start` / `end` before committing to this template.

## Cost ballpark (17-min video, 250 overlay slots)

| Stage | Detail | Cost |
|---|---|---|
| Audio pull | `ralphy ref pull --audio-only` (yt-dlp, free) | $0 |
| Transcription | ElevenLabs Scribe v1 (subscription) | $0 (or ~$0.07 if billed) |
| Audio describe | Gemini-2.5-flash on the mp3 | ~$0.02 |
| Overlay planner | Sonnet 4.6 over transcript + audio analysis | ~$0.40 |
| Code / terminal / tweet / quote / chapter blocks | Composition-time render, no API | $0 |
| Browser frames (screenshots) | Playwright local | $0 |
| Memes / diagrams (when generated) | `ralphy generate image` × 20-40 @ $0.15 | ~$3-6 |
| Music bed | ElevenLabs Music (subscription, one call) | $0 |
| SFX library | ElevenLabs SFX × 15-25 (whoosh / pop / hit) | $0 |
| VO ducking + loudnorm | `ralphy audio sidechain` + `loudnorm` | $0 |
| Render | local HyperFrames | $0 |
| **Total** | | **~$3-7** |

Long-form is cheap because the bulk of overlays are composition-time renders (code / terminal / quote / chapter / tweet cards), not generated imagery. The ~$3-7 spread is entirely the meme + diagram generation budget.

## CLI cookbook

The skill orchestrates this end-to-end. Manual operators can run the chain step-by-step:

```bash
# 1. Create the project
ralphy new "audio podcast longform explainer about <topic>"

# 2. Drop or pull the audio into refs
ralphy ref pull "<youtube-or-podcast-url>" --slug <ref-slug> --audio-only
# or, for a local file:
cp /path/to/podcast.mp3 workspace/projects/<id>/refs/source.mp3

# 3. Transcribe (word-level)
ralphy generate captions --audio workspace/projects/<id>/refs/source.mp3 \
  --out workspace/projects/<id>/captions.json

# 4. Audio describe (tone, music, VO style — informs overlay vocabulary choice)
ralphy ref audio-describe <ref-slug>

# 5. Plan overlays (skill workflow — runs LLM over captions.json + audio-analysis.json)
#    Writes workspace/projects/<id>/overlay-plan.json
#    Schema: [{ id, start, end, type, content, chapter }]

# 6. Generate variable assets (memes, diagrams, screenshots)
#    Driven by overlay-plan.json — only types that need pre-generation
ralphy generate image --project <id> --slot scene-NN-meme-X --prompt "<...>"

# 7. Music bed (one long instrumental)
ralphy generate music --project <id> --duration <seconds> --style "lo-fi ambient electronic" \
  --instrumental

# 8. SFX library
ralphy generate sfx --project <id> --label whoosh --prompt "fast tape whoosh transition"
ralphy generate sfx --project <id> --label pop    --prompt "soft UI pop click"

# 9. Compose index.html with chapter sub-compositions (skill writes the HTML)
#    See composition.md for the skeleton.

# 10. Preflight + render
ralphy editor preflight <id>
ralphy render <id> --aspect 16:9
```

## Read also

- `prompt-cookbook.md` — overlay vocabulary, per-type prompt recipes, claim-segmentation rules, common mistakes.
- `hooks.md` — opening-line patterns + thesis-quote card recipes for the first 15 seconds.
- `composition.md` — HyperFrames `index.html` skeleton + chapter sub-composition pattern.
- `../../../docs/playbooks/hyperframes.md` — composition rules, GSAP, registry blocks.
- `.agents/skills/ralphy-audio-explainer/SKILL.md` — the orchestrator skill that runs this end-to-end.

## Reference example

`workspace/references/codex-hyperframes-podcast/` — a 17-minute Russian tech-essay produced upstream with Codex + HyperFrames, ingested via `ralphy ref pull` + `ralphy ref analyze-video`. The `video-analysis.json` in that folder is the empirical source for every number in this template. Read it before deviating from the recipe.
