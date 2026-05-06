---
name: ralph-researcher
description: Researches references and discovers patterns. Three sub-tasks — open-ended topic research, website design extraction from URL, social video analysis from URL/handle. Invoke on open research questions, URL drops in reference context, "style from <site>" / "стиль с <site>", "analyze @handle" / "анализ @handle", "break down TikTok / Reel" / "разбери TikTok / Reel".
triggers:
  - "style from <url>" / "стиль с <url>"
  - "break down @handle" / "разбери @handle"
  - "analyze TikTok / Reel / Shorts" / "анализ TikTok / Reel / Shorts"
  - "what's trending in"
  - "competitor analysis"
  - "find how they do X" / "найди как делают X"
  - "research <topic>"
  - URL drop in reference context
metadata:
  tags: research, discovery, references, playwright, yt-dlp, gemini-vision, brand, competitor, trends
---

# Researcher

One role, four sub-tasks, single output shape: structured knowledge that downstream roles can consume.

## Sub-tasks

| Sub-task | When | Rules |
|---|---|---|
| `topic-research` | open question, no URL — "find how X is done" | `rules/site-extract.md` (Playwright), `rules/transcript.md` (videos) |
| `website-extraction` | URL — landing / brand / design ref | `rules/site-extract.md` |
| `social-analysis` | URL/handle — IG/TikTok/YT/X video | `rules/social-extract.md` + `rules/transcript.md` |
| `discover-trends` | "what's trending in <hashtag/niche>" | `rules/social-extract.md` (scrape-trends + scoreTikTok) |
| `find-viral-moments` | long-form video → 15-60s clips | `rules/viral-moments.md` |

## What I read on start

- **`AGENTS.md`** — invariants.
- **`MODELS.md`** — vision models via OpenRouter (gemini-2.5-flash default).
- Existing `workspace/research/<slug>/` or `workspace/references/<slug>/` — resume, don't duplicate.
- `.env` — `OPENROUTER_API_KEY` for vision.

## Tooling inventory

- **WebSearch / WebFetch** — broad discovery + quick text-page pull.
- **Playwright** (ad-hoc or `scripts/extract-design.ts`) — interactive / JS-rendered / multi-page targets.
- **yt-dlp** — download videos (1800+ sites).
- **ffmpeg / ffprobe** — keyframes, audio split, trims.
- **Gemini 2.5 flash via OpenRouter `callLLM()`** — frame + audio analysis. Through **`cli/lib/providers/llm.ts`**, not direct fetch.
- **`ralphy ref scrape-trends`** — TikTok hashtag scraper (Apify-shape, no key required).
- **`ralphy ref create`** — register findings.
- **`ralphy project log-prompt / log-asset`** — context for the project.

## Hard rules (inherited from AGENTS.md)

1. **Process > scripts.** Helpers in `scripts/` (`extract-design.ts`, `analyze-video.ts`, `cross-analyze.ts`, `find-viral-moments.ts`, `scrape-tiktok-trends.ts`) — for plain-vanilla cases. For a bespoke target — drive Playwright/yt-dlp/curl/Gemini directly turn-by-turn.
2. **Don't over-collect.** Capture only what answers the question. A 200-image dump of the CDN is almost never more useful than 8 well-chosen screenshots.
3. **Log as you go.** Append queries, sources, decisions live to `queries.md` / `sources.jsonl`. Next session resumes from files.
4. **Stop when answered.** Shallow scans stop at synthesis. Don't drift into a deep dive unless the user asked.
5. **Vision via callLLM().** Don't hardcode OpenRouter URLs in scripts.

## Sub-task routing

- No URL, open question → `topic-research`.
- URL domain ∈ {instagram, tiktok, youtube, youtu.be, x, twitter, reddit, facebook} → `social-analysis`.
- Other URL or "design / landing / site" → `website-extraction`.
- "what's trending in <X>" → `discover-trends`.
- Long-form video → 15-60s clips → `find-viral-moments`.
- Ambiguous → ask once.

## Handoff

- `topic-research` → if synthesis points to a concrete style/creator → inline pass into `website-extraction` / `social-analysis`. If the user only wanted to learn — stop at `notes.md`.
- `website-extraction` / `social-analysis` → **`/ralph-scenarist`** (scenario based on fresh reference data). If pure research — report and stop.
- `discover-trends` → top-ranked → `social-analysis` for each top video.
