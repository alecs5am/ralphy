# Researcher playbook

**Read this when:** open research questions, URL drops in reference context, "style from <site>", "analyze @handle", "break down TikTok / Reel", "what's trending in <X>", competitor analysis, "find how X is done".

One role, four sub-tasks, single output shape: structured knowledge that downstream roles can consume.

> **STOP rule.** Reaching for `bunx tsx` / `curl` / ad-hoc `ffmpeg` → stop. Either there's a `ralphy` verb (see cookbook below), or propose adding one. Don't paste raw API code into research scripts. AGENTS invariant #2.

## CLI cookbook

**Default to these. Don't write `bunx tsx` / `curl` ad-hoc — every operation below is a `ralphy` verb.** If something you need isn't here, stop and propose adding it (see [hard rules](#hard-rules-inherited-from-agentsmd)).

```bash
# Pull a TikTok / IG / YT / Reels URL → mp4 + meta + mp3 (mono 64k for transcribe)
ralphy ref pull <url> [--slug <name>] [--audio-only] [--meta-only]

# Sample frames from a pulled video → frames/frame-NN.jpg
ralphy ref frames <slug> [--max 12] [--fps 0.16] [--width 540]

# Transcribe the ref's audio → transcript.json (Caption[]). Default backend ElevenLabs Scribe v1.
ralphy ref transcribe <slug> [--language ru|en|auto] [--backend elevenlabs|openrouter|gemini]

# Vision LLM over the ref's frames → analysis.json (default prompt = UGC blueprint extractor)
ralphy ref analyze <slug> [--prompt "..." | --prompt-file <md>] [--model <id>]

# Gemini-audio LLM over the ref's mp3 → audio-analysis.json (tone, music, VO style)
ralphy ref audio-describe <slug>

# Synthesize {meta + analysis + audio-analysis + transcript} → blueprint.md
ralphy ref blueprint <slug>

# Register the finding so it shows up in the project
ralphy ref create <url> --type social --name <slug>
ralphy ref attach <refId> --to <projectId>

# Trends (no API key — Playwright scrapes public hashtag pages, ranks via scoreTikTok)
ralphy ref scrape-trends --hashtags ai,fitness --limit 15

# Inspect / debug
ralphy ref show <id>
ralphy ref paths <slug>      # print every file path for the ref's research dir
```

The standard chain is `pull → frames → transcribe → analyze → audio-describe → blueprint`. Each step is idempotent and writes to `workspace/references/<slug>/state.json` so re-runs skip what's already done.

## Sub-docs (read on demand)

| File | When to read it |
|---|---|
| [researcher/site-extract.md](researcher/site-extract.md) | URL is a website / landing / brand reference — Playwright extraction |
| [researcher/social-extract.md](researcher/social-extract.md) | URL/handle is IG/TikTok/YT/X/Reddit — social video analysis or trend scrape |
| [researcher/transcript.md](researcher/transcript.md) | Video has speech and you need the words — whisper-1 via OpenRouter |
| [researcher/viral-moments.md](researcher/viral-moments.md) | Long-form video → 15-60s clips with hooks |
| [researcher/yt-dlp.md](researcher/yt-dlp.md) | Need to download a video file from a URL (TikTok/YT/IG/etc.) — **read before reaching for WebFetch** |

## Sub-tasks

| Sub-task | When | Sub-docs |
|---|---|---|
| `topic-research` | open question, no URL — "find how X is done" | site-extract (Playwright), transcript (videos) |
| `website-extraction` | URL — landing / brand / design ref | site-extract |
| `social-analysis` | URL/handle — IG/TikTok/YT/X video | social-extract + transcript + yt-dlp |
| `discover-trends` | "what's trending in <hashtag/niche>" | social-extract (scrape-trends + scoreTikTok) |
| `find-viral-moments` | long-form video → 15-60s clips | viral-moments |

## What I read on start

- **`AGENTS.md`** — invariants.
- **`MODELS.md`** — vision models via OpenRouter (gemini-2.5-flash default).
- Existing `workspace/research/<slug>/` or `workspace/references/<slug>/` — resume, don't duplicate.
- `.env` — `OPENROUTER_API_KEY` for vision.

## Tooling inventory

- **WebSearch / WebFetch** — broad discovery + quick text-page pull. **Won't work on JS-heavy SPAs (TikTok/IG/YT) — they return shells. For those, reach for yt-dlp / Playwright.**
- **Playwright** (ad-hoc or `.agents/skills/ralph-researcher/scripts/extract-design.ts`) — interactive / JS-rendered / multi-page targets.
- **yt-dlp** — download videos (1800+ sites including TikTok, IG, YT, X, Reddit). See [researcher/yt-dlp.md](researcher/yt-dlp.md).
- **ffmpeg / ffprobe** — keyframes, audio split, trims.
- **Gemini 2.5 flash via OpenRouter `callLLM()`** — frame + audio analysis. Through **`cli/lib/providers/llm.ts`**, not direct fetch.
- **`ralphy ref scrape-trends`** — TikTok hashtag scraper (Apify-shape, no key required).
- **`ralphy ref create`** — register findings.
- **`ralphy project log-prompt / log-asset`** — context for the project.

## Hard rules (inherited from AGENTS.md)

1. **`ralphy ref` first.** The 6-step chain (pull → frames → transcribe → analyze → audio-describe → blueprint) covers ~95% of social/website refs. Helpers in `.agents/skills/ralph-researcher/scripts/` (`extract-design.ts`, `cross-analyze.ts`, etc.) exist for bespoke shapes the CLI doesn't model yet — but if you're tempted to grep them just to call yt-dlp / Gemini / whisper, check the cookbook first.
2. **Don't over-collect.** Capture only what answers the question. A 200-image dump of the CDN is almost never more useful than 8 well-chosen screenshots.
3. **Log as you go.** `ralphy ref pull` + `state.json` already track what you have. For free-form notes inside a project, `ralphy project log-prompt`. Don't append to JSONL by hand.
4. **Stop when answered.** Shallow scans stop at synthesis. Don't drift into a deep dive unless the user asked.
5. **Vision / audio LLM via `ralphy ref analyze` / `ralphy ref audio-describe`** — those wrap `callLLM()` and log automatically. Custom prompt? `--prompt-file <md>`. Don't hardcode OpenRouter URLs.
6. **Never give up on a video URL because WebFetch returned a JS shell.** That's the expected response. Use `ralphy ref pull` (yt-dlp under the hood) to get the file. Asking the user to "send me the file" is a failure mode unless `ref pull` also fails.

## Sub-task routing

- No URL, open question → `topic-research`.
- URL domain ∈ {instagram, tiktok, youtube, youtu.be, x, twitter, reddit, facebook} → `social-analysis`.
- Other URL or "design / landing / site" → `website-extraction`.
- "what's trending in <X>" → `discover-trends`.
- Long-form video → 15-60s clips → `find-viral-moments`.
- Ambiguous → ask once.

## Handoff

- `topic-research` → if synthesis points to a concrete style/creator → inline pass into `website-extraction` / `social-analysis`. If the user only wanted to learn — stop at `notes.md`.
- `website-extraction` / `social-analysis` → **scenarist playbook** (scenario based on fresh reference data). If pure research — report and stop.
- `discover-trends` → top-ranked → `social-analysis` for each top video.
