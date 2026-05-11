# Podcast Clip — vibe reference

**Genre:** repurposed long-form → viral short. 1-4 cuts from a 60-90 min podcast / interview / panel / talk.
**Length:** 15-60s per cut (default 30-45s).
**Format:** TikTok / Reels / Shorts, 9:16, 30fps, 1080×1920.

> **Reference-required gate.** A source long-form video MUST exist — URL or file. Without it, the whole pipeline refuses (AGENTS.md hard rule #3). There is no way to invent podcast content; "AI-generated podcast footage" is never acceptable as a substitute. If the user wants translation/dubbing, that's the separate `podcast-dub` workspace template — different pipeline.

## Why this format works

Long-form is a goldmine. Every 60-minute podcast contains 2-4 viral moments waiting to be cut:

1. **Parasocial trust transfer.** The viewer already knows (or recognizes) the host or guest. The first 1.5s of "Joe Rogan said this thing" buys retention that a fresh-character video has to earn from zero.
2. **The moment is real, not produced.** Audiences can smell scripted content. A clipped real reaction, hot take, or live argument lands as authentic — because it is.
3. **The source has done the storytelling work.** A 50-second cut from a 90-minute conversation is the result of someone setting up tension, building context, and delivering payoff. The cut just isolates the peak.
4. **Title-banner front-loads the promise.** "X tells Y something INSANE" at the top of the frame is the hook. The viewer commits to 30 seconds in exchange for a payoff that looks specific.

This pattern is dominant in 2024-2026 short-form: Joe Rogan clips, Lex Fridman cuts, Modern Wisdom shorts, Diary of a CEO highlights, late-night talkshow moments. The style discipline below is what separates a viral cut from a flat one.

## Vibe anchors

- **Title-banner with a provocative quote** — top 12% of frame, Inter Bold 70px, max 2 lines, animated slide-in at clip start. The banner is the hook; it must promise something specific.
- **Karaoke captions sync'd to speech** — bottom 18% of frame, word-by-word highlight on each spoken word. Inter Bold 50px, white with drop-shadow. Word timestamps come from ElevenLabs Scribe v1.
- **Smart-crop on the active speaker** — for single-speaker moments, a face-tracker keeps the speaker centered as the 9:16 viewport pans across the 16:9 source. For 2-speaker exchanges (debate / hot take), vertical split-screen with both speakers on top of each other.
- **Lossless cut with 30-200ms padding** — `ffmpeg -c copy` style cut snapped to word boundaries from the transcript. Default: 150ms before the first word, 100ms after the last word. Never clip a syllable.
- **Music typically OFF.** Diegetic voice carries. Optional low instrumental bed (-18dB) under the title-banner reveal only — never under speech.
- **Occasional B-roll cuts (optional).** A 1-2s static image of the topic (book cover, news headline, place mentioned) breaks visual monotony in 50+ second cuts. Use sparingly — the speaker's face is the product.

## Variation axes

| Axis | Options |
|---|---|
| Source language | en / ru / es / pt / de / fr / etc. Captions follow source. Translation is `podcast-dub`, not this. |
| Title-banner style | Hormozi-yellow (yellow bg, black text, drop-shadow) / quote-card (white bg, black serif text, attribution line) / minimal-white (white text on transparent bg with shadow) |
| Caption style | karaoke-word-fill (default) / Hormozi-impact (large all-caps) / TikTok-white (smaller, multi-line) |
| Reframe style | smart-crop active speaker / split-screen 2-speakers / static center (rarely — only when source is already vertical or single-shot) |
| Moment type | talkshow guest reveal / interview hot take / panel debate peak / one-liner punchline |

## Narrative arc

```
0-2s     → Title-banner reveal. Slide-in 0.4s, hold 1.6s. Speaker is mid-sentence
            in the source — banner front-loads what they're about to say.
2-50s    → The moment plays out. Smart-crop tracks the active speaker. Karaoke
            captions sync word-by-word. Optional 1-2s B-roll insert if the moment
            is >40s and visual variety helps.
50-60s   → Outro: either a clean payoff line, or a hard cut on the punchline
            for cliffhanger effect (drives "go to source" comments).
```

For sub-30s cuts: collapse to `0-2s banner → 2-28s moment → 28-30s hard cut on the punchline`. The shorter the cut, the harder the cliffhanger should land.

## Required user inputs

1. **Source video** — URL (YouTube / TikTok / Instagram / X / Vimeo) OR a local mp4 file. **REQUIRED.** Without it: refuse.
2. **Moment list** (optional) — one of:
   - User-supplied list: `[{start: "00:12:34", end: "00:13:08", hook: "..."}]`.
   - Or run `find-viral-moments.ts` to auto-pick 4-8 candidates with Gemini-vision; user picks.
3. **Title-banner style** (optional) — defaults to Hormozi-yellow.
4. **Caption style** (optional) — defaults to karaoke-word-fill.
5. **Reframe style** (optional) — auto-detected from speaker count in the moment (1 → smart-crop, 2 → split-screen).

## When NOT to use

- **Source has copyright issues.** If the source is Spotify-exclusive, behind a paywall, or has explicit "no clips" terms, refuse and ask the user to use their own podcast or a CC-licensed source. Document under `workspace/projects/<id>/notes/copyright.md`.
- **Source language ≠ audience language.** If the user's audience is English and the source is Russian, this template will produce a Russian clip with Russian captions. For translation/dubbing pipelines, use the internal `podcast-dub` workspace template instead — different toolchain (LLM translation + ElevenLabs voice cloning + lip-resync).
- **Solo podcast with talking-head-only source already in 9:16.** Useful but smart-crop is wasted; the value is just karaoke captions + banner. Still works, just lower lift.
- **The moment requires context not in the cut.** If a 30s extract makes no sense without 5 minutes of setup, either pick a different moment or extend the cut with a 3-4s text-card setup before the banner.
- **Multiple unrelated moments stitched into one video.** Each viral moment gets its own cut. One moment per clip, always.

## Cost ballpark per cut

| Stage | Detail | Cost |
|---|---|---|
| Source pull | yt-dlp (free, local) | $0 |
| Transcription | ElevenLabs Scribe v1 (subscription) | $0 |
| Viral-moment picking | Gemini-2.5-flash, ~$0.02-0.06 per 60-min source — amortized across 4 cuts | ~$0.01 / cut |
| Lossless cut | local ffmpeg | $0 |
| Reframe | local (smart-crop runs on CPU/GPU) | $0 |
| Captions | already in transcription | $0 |
| Music (optional bed) | ElevenLabs Music (subscription, optional) | $0 |
| Render | local Remotion | $0 |
| **Total per cut** | | **~$0.01** |

By far the cheapest format in the pack — almost everything is local + subscription. Picking and rendering 4 cuts from one 90-min podcast costs less than a quarter.

## CLI cookbook (the load-bearing part — copy-paste runnable)

This is the full chain for one source → 1-4 cuts. Replace `<url>`, `<slug>`, `<project-id>`.

```bash
# 0. (one-time) verify keys + ffmpeg + yt-dlp
ralphy doctor

# 1. Pull the source video (yt-dlp under the hood; cached in workspace/refs/<slug>/)
ralphy ref pull --url "<youtube-or-tiktok-or-ig-url>" --slug "rogan-2284"

# 2. Transcribe with word-level timestamps (ElevenLabs Scribe v1)
ralphy ref transcribe rogan-2284
# → workspace/refs/rogan-2284/transcript.json with [{ word, start, end, speaker? }]

# 3. Auto-pick 4-8 viral moments (Gemini-2.5-flash on transcript + sampled frames)
bunx tsx .agents/skills/ralph-researcher/scripts/find-viral-moments.ts \
  --ref rogan-2284 \
  --max 6 \
  --min-len 20 \
  --max-len 55 \
  > workspace/refs/rogan-2284/moments.json
# → [{ start, end, hook_quote, why_it_works, speaker_count }]

# 4. Create the project (one project = one batch of cuts from one source)
ralphy project create \
  --slug rogan-2284-clips \
  --template podcast-clip \
  --ref rogan-2284

# 5. For each picked moment, lossless-cut into the project (snap to word boundaries
#    from transcript.json; default padding 150ms before / 100ms after)
ralphy video extract-segment rogan-2284 \
  --start 00:12:34.200 \
  --end   00:13:08.450 \
  --pad-before 0.15 \
  --pad-after  0.10 \
  --snap-to-words workspace/refs/rogan-2284/transcript.json \
  --out workspace/projects/rogan-2284-clips/clips/cut-01.mp4
# Repeat for cut-02, cut-03, ...

# 6. Compose each cut in Remotion (banner + karaoke + reframe).
#    The template ships a composition skeleton; ralphy wires it.
ralphy generate composition \
  --project rogan-2284-clips \
  --cut cut-01 \
  --banner-style hormozi-yellow \
  --caption-style karaoke \
  --reframe smart-crop

# 7. Render to mp4
ralphy render rogan-2284-clips --cut cut-01
# → workspace/projects/rogan-2284-clips/out/cut-01.mp4

# 8. (optional) batch-render all cuts in the project
ralphy render rogan-2284-clips --all
```

Every step writes to `workspace/projects/<id>/logs/generations.jsonl` for cost rollup and replay. The `ralphy doctor` and `ralphy status` commands show pipeline health at any point.

## Read also

- `hooks.md` — 10-12 title-banner hook patterns from real viral podcast clips, with banner-design notes.
- `prompt-cookbook.md` — master template, banner + caption + smart-crop specs, cut discipline, music defaults, common mistakes, 3 worked examples.
