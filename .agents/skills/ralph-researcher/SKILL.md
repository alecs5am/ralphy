---
name: ralph-researcher
description: Researches references and discovers patterns. Three sub-tasks — open-ended topic research, website design extraction from URL, social video analysis from URL/handle. Invoke on open research questions, URL drops in reference context, "стиль с <site>", "анализ @handle", "разбери TikTok / Reel".
triggers:
  - "стиль с <url>"
  - "разбери @handle"
  - "анализ TikTok / Reel / Shorts"
  - "what's trending in"
  - "competitor analysis"
  - "найди как делают X"
  - "research <topic>"
  - URL drop in reference context
metadata:
  tags: research, discovery, references, playwright, yt-dlp, gemini-vision, brand, competitor, trends
---

# Researcher

One role, четыре sub-task'а, единая output shape: structured knowledge которую downstream роли могут использовать.

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
- **`MODELS.md`** — vision models через OpenRouter (gemini-2.5-flash default).
- Existing `workspace/research/<slug>/` или `workspace/references/<slug>/` — resume, don't duplicate.
- `.env` — `OPENROUTER_API_KEY` для vision.

## Tooling inventory

- **WebSearch / WebFetch** — broad discovery + quick text-page pull.
- **Playwright** (ad-hoc или `scripts/extract-design.ts`) — interactive / JS-rendered / multi-page targets.
- **yt-dlp** — download videos (1800+ sites).
- **ffmpeg / ffprobe** — keyframes, audio split, trims.
- **Gemini 2.5 flash via OpenRouter `callLLM()`** — frame + audio analysis. Через **`cli/lib/providers/llm.ts`**, не прямой fetch.
- **`ralphy ref scrape-trends`** — TikTok hashtag scraper (Apify-shape без ключа).
- **`ralphy ref create`** — register findings.
- **`ralphy project log-prompt / log-asset`** — context для проекта.

## Hard rules (inherited from AGENTS.md)

1. **Process > scripts.** Helpers в `scripts/` (`extract-design.ts`, `analyze-video.ts`, `cross-analyze.ts`, `find-viral-moments.ts`, `scrape-tiktok-trends.ts`) — для plain-vanilla случаев. Для bespoke target — drive Playwright/yt-dlp/curl/Gemini напрямую turn-by-turn.
2. **Don't over-collect.** Capture только что отвечает на вопрос. 200-image dump CDN'а почти никогда не полезнее 8 well-chosen screenshots.
3. **Log as you go.** Append queries, sources, decisions live в `queries.md` / `sources.jsonl`. Next session resumes from files.
4. **Stop when answered.** Shallow scans stop at synthesis. Don't drift в deep dive если пользователь не просил.
5. **Vision via callLLM().** Не хардкодь URL'ы OpenRouter в скриптах.

## Sub-task routing

- No URL, open question → `topic-research`.
- URL domain ∈ {instagram, tiktok, youtube, youtu.be, x, twitter, reddit, facebook} → `social-analysis`.
- Other URL или "design / landing / site" → `website-extraction`.
- "what's trending in <X>" → `discover-trends`.
- Long-form video → 15-60s clips → `find-viral-moments`.
- Ambiguous → ask once.

## Handoff

- `topic-research` → если synthesis указывает на concrete style/creator → inline pass в `website-extraction` / `social-analysis`. Если пользователь только learn — stop at `notes.md`.
- `website-extraction` / `social-analysis` → **`/ralph-scenarist`** (сценарий по fresh reference data). Если pure research — report + stop.
- `discover-trends` → top-ranked → `social-analysis` для каждого top video.
