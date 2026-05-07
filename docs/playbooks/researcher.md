# Researcher playbook

**Read this when:** open research questions, URL drops in reference context, "style from <site>", "analyze @handle", "break down TikTok / Reel", "what's trending in <X>", competitor analysis, "find how X is done".

One role, four sub-tasks, single output shape: structured knowledge that downstream roles can consume.

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

1. **Process > scripts.** Helpers in `.agents/skills/ralph-researcher/scripts/` (`extract-design.ts`, `analyze-video.ts`, `cross-analyze.ts`, `find-viral-moments.ts`, `scrape-tiktok-trends.ts`) — for plain-vanilla cases. For a bespoke target — drive Playwright/yt-dlp/curl/Gemini directly turn-by-turn.
2. **Don't over-collect.** Capture only what answers the question. A 200-image dump of the CDN is almost never more useful than 8 well-chosen screenshots.
3. **Log as you go.** Append queries, sources, decisions live to `queries.md` / `sources.jsonl`. Next session resumes from files.
4. **Stop when answered.** Shallow scans stop at synthesis. Don't drift into a deep dive unless the user asked.
5. **Vision via callLLM().** Don't hardcode OpenRouter URLs in scripts.
6. **Never give up on a video URL because WebFetch returned a JS shell.** That's the expected response. Use yt-dlp to get the file, then ffmpeg/Gemini for analysis. Asking the user to "send me the file" is a failure mode unless yt-dlp also fails.

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
