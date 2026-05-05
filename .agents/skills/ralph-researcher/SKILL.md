---
name: ralph-researcher
description: >
  Research role. Owns all reference and discovery work. Three sub-tasks:
  (1) open-ended topic research — start from a question, search the web, drive
  Playwright to dig into sites, download guide videos from YouTube/TikTok/
  Instagram, analyze them with Gemini vision, synthesize findings;
  (2) website design capture from a known URL — navigate with Playwright, pull
  tokens, screenshots, brand assets; (3) social video analysis from a known URL
  or handle — download, extract frames and audio, build a reproduction blueprint,
  optionally cross-analyze multiple videos from the same creator. Invoke on open
  research questions ("how to make AI videos with vegetables"), URL drops in a
  reference context, "grab design from [site]", "analyze this TikTok / Reel /
  Shorts", "look at what [@handle] is doing", "videos like this", "how do people
  make X", "competitor analysis", or when a brief mentions an unfamiliar genre
  that needs to be learned before scenario writing.
metadata:
  tags: research, discovery, references, playwright, yt-dlp, web-search, gemini-vision, brand, competitor, topic-research
---

# Researcher

One role, three sub-tasks, one output shape: structured knowledge the downstream
roles can actually use.

- **`topic-research`** — open-ended discovery. No URL yet. Map the space, dig in,
  synthesize.
- **`website-extraction`** — known URL, style/brand reference. Playwright session
  that produces tokens + screenshots + assets.
- **`social-analysis`** — known video URL or handle. Download, analyze, build a
  reproduction blueprint.

**Prefer process over scripts.** This skill describes *methods*: which tools to
reach for, what to capture, how to decide when you're done. It deliberately does
**not** mandate a fixed wrapper script for each sub-task — rigid scripts lock
you into one shape and miss everything the script's author didn't anticipate.
Drive Playwright, `yt-dlp`, `curl`, `WebSearch`, `WebFetch`, and Gemini vision
directly, iteratively, per target. Adapt per site: some pages need scroll to
reveal lazy content, some hide things behind interaction, some serve different
HTML to headless. You're the agent — use the turn loop.

There are a few pre-built helper scripts in `scripts/` (`extract-design.ts`,
`analyze-video.ts`, `cross-analyze.ts`) — treat them as opinionated shortcuts
for the easy cases, **not** the default path. Reach for them only when the
target is plain-vanilla and you're sure the script's shape fits. Otherwise
drive the tools directly.

## When to invoke me

- User asks an **open research question** with no URL yet — "find how to make AI
  videos with vegetables", "research era-flip TikTok edits", "what's trending in
  UGC ads for skincare", "how do creators do this glitch transition" →
  `topic-research`.
- User pastes a **website URL** in a brand/reference context → `website-extraction`.
- User pastes an **Instagram / TikTok / YouTube Shorts / X / Reddit** video URL
  or handle → `social-analysis`.
- User says "look at this site", "grab the design from", "use the style of
  [site]", "palette from", "brand audit", "extract from [url]" →
  `website-extraction`.
- User says "analyze this reel", "study this TikTok", "what makes @handle's
  content work", "copy this style", "reproduce this video", "competitor
  analysis" → `social-analysis`.
- Multi-video comparison across a handle or channel → run `social-analysis`
  several times, then merge the blueprints (manually or via the
  `cross-analyze.ts` helper).
- Scenarist hands off a brief that references an unfamiliar genre/technique →
  `topic-research` first, then the URL-driven sub-tasks on the best candidates.

## What I read on start

- `MODELS.md` — current vision / analysis model defaults (do not hardcode from
  memory).
- Existing `workspace/research/<slug>/` and `workspace/references/<slug>/` —
  resume if the topic or URL was already investigated; don't start fresh and
  duplicate work.
- `.env` — needs `OPENROUTER_API_KEY` for vision analysis (Gemini via OpenRouter).

## Tooling inventory (pick what fits the target)

- **`WebSearch`** (your tool) — broad discovery, map the space.
- **`WebFetch`** (your tool) — quick pull + summarize of text-heavy pages
  without a browser.
- **Playwright** — the primary driver for anything interactive, JS-rendered,
  multi-page, or asset-heavy. Two common ways to use it:
  - *Ad-hoc Node REPL*: write a short script in-turn with `bunx playwright` or
    by spawning `bunx tsx -e '<code>'`, tuned to this specific site. Prefer this
    when the navigation plan is bespoke.
  - *Pre-built helper*: `bunx tsx .agents/skills/ralph-researcher/scripts/extract-design.ts --url <URL> --output <dir>`
    when the target is a generic landing page and the canned extraction shape
    fits.
- **`yt-dlp`** — download videos from 1800+ sites (IG Reels, TikTok, YT/Shorts,
  X/Twitter, FB, Reddit, generic `<video>` tags). One-liner, no wrapper needed.
- **`ffmpeg` / `ffprobe`** — keyframe extraction, audio split, trims.
- **Gemini 2.5 flash via OpenRouter** — frame + audio analysis. Call it directly
  with `curl` or via the `analyze-video.ts` helper if the canonical
  blueprint shape is what you need. For bespoke analysis prompts (e.g. "extract
  a how-to step list from this tutorial"), call the API inline and write the
  result yourself — the helper's prompt is tuned for *reproduction* blueprints,
  not for *tutorial* synthesis.
- **`curl`** — any HTTP pull that doesn't need a browser (RSS, sitemaps, JSON
  APIs, pasted `<script>` data, JSON-LD).
- **`ralph` CLI** — register findings as refs/brands so downstream roles can
  cite them: `bun run ralph -- ref create …`, `brand create …`.

## Sub-task: discover-trends

- **When:** "what's trending in [niche]", "find viral in [hashtag]", "which
  videos are blowing up in category X". Replacement for the Apify flow (no
  key), driven manually via Playwright.
- **Working directory:** `workspace/references/trends-<date>/`.

- **Method:**
  1. Run the Playwright scraper through the CLI:
     ```bash
     bun run ralph -- ref scrape-trends \
       --hashtags "ai,productivity,startuplife" \
       --limit 15
     ```
     The script visits `tiktok.com/tag/<hashtag>` without logging in,
     parses the hydration script (`__UNIVERSAL_DATA_FOR_REHYDRATION__`),
     and dumps Apify-compatible JSON.

  2. The script automatically runs each video through `scoreTikTok()` from
     `cli/lib/score.ts` and returns the ranked top-20 to chat
     (engagement-ratio thresholds: like 5/10/15%, comment 0.5/1/2%, share
     0.3/1/3%, view-tier 10K/100K/1M).

  3. For top videos (`tier: "viral"` / `"great"`) — dig deeper via
     `social-analysis`:
     ```bash
     yt-dlp -f "best[ext=mp4]" -o "workspace/references/trends-<date>/<name>.mp4" "<webVideoUrl>"
     bunx tsx .agents/skills/ralph-researcher/scripts/analyze-video.ts \
       --video workspace/references/trends-<date>/<name>.mp4 \
       --output workspace/references/trends-<date>/blueprints/<name>
     ```

- **Caveats:**
  - TikTok rotates anti-bot tokens. If the scraper hits captcha — wait a
    day, run from a different IP.
  - Without login TikTok may hide numbers — the script falls back to
    URL+text only. Useless for scoring; in that case re-check the
    selectors / hydration script by hand.
  - The output schema is identical to Apify clockworks/tiktok-scraper, so
    once a key shows up you can switch over without touching consumers.

- **Outputs:**
  - `workspace/references/trends-<date>/results.json` — Apify-shape array
  - `workspace/references/trends-<date>/blueprints/<name>/` — per-video deep
    analysis (только для top-ranked)

## Sub-task: topic-research

- **When:** user asks an open research question with no pre-selected URL, or a
  brief implies unfamiliar techniques/genres the team needs to understand before
  scenario work.
- **Inputs:** a topic/question. If vague, ask ONCE for scope, desired depth
  (shallow scan vs deep dive), and whether they want actionable reproduction
  steps or just inspiration.
- **Working directory:** `workspace/research/<topic-slug>/` (kebab-case, e.g.
  `ai-vegetable-videos`). Create it at the start.

- **Method (iterate, don't march):**
  1. **Map the space.** Fire 3–6 complementary `WebSearch` queries — general,
     technical, community (Reddit, HN, Discord mentions), platform-specific
     (TikTok / YouTube handles). Append every query to `queries.md` as you go
     so the next session can resume.
  2. **Log every candidate** in `sources.jsonl`, one line per URL:
     `{url, title, platform, relevance: "high|medium|low|skip", note}`.
     Keep the shortlist tight — typically 5–12 items, widen only if the
     synthesis has holes.
  3. **Classify.** Social video URL → queue for sub-task `social-analysis`.
     Dense tutorial page → queue for Playwright dig. Pure text summary → maybe
     `WebFetch` is enough. Low-value → `skip` and move on.
  4. **Deep-browse the dense pages with Playwright.** For each shortlisted
     site, drive a short bespoke Playwright session:
     - Navigate, wait for content, scroll to bottom to trigger lazy loads.
     - Screenshot the interesting regions (not the whole page unless useful).
     - Extract cleaned article text into `pages/<slug>/content.md`.
     - Note outbound links worth following, creator handles mentioned,
       embedded video URLs — append them back into `sources.jsonl` as new
       candidates.
     - If the page requires an interaction (click "show more", open a tab,
       etc.), scripted interactive Playwright is exactly what it's for.
     Example shape for a quick session (adapt per target):
     ```bash
     bunx tsx -e '
       import { chromium } from "playwright";
       const b = await chromium.launch();
       const p = await b.newPage();
       await p.goto(process.env.URL!, { waitUntil: "networkidle" });
       await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
       await p.waitForTimeout(800);
       await p.screenshot({ path: process.env.OUT + "/screenshot.png", fullPage: true });
       const text = await p.evaluate(() => document.body.innerText);
       // ...write content.md, collect links, etc.
       await b.close();
     '
     ```
     Don't be shy about rewriting the snippet per target — that's the point.
  5. **Download guide videos.** `yt-dlp -f "best[ext=mp4]/best" --no-playlist -o
     "workspace/research/<topic-slug>/videos/<name>.mp4" "<URL>"`.
  6. **Analyze each guide video.** For tutorial content (the kind that teaches
     a technique), call Gemini directly with a prompt focused on *method
     extraction* — tools named, step sequence, visual techniques used, software
     demonstrated, creator's stated shortcuts. Write the result as
     `videos/<name>-analysis.json`. Do **not** default to the
     `analyze-video.ts` helper for this — its prompt is tuned for reproduction
     blueprints (what makes a video viral, frame timings), which is orthogonal
     to tutorial synthesis.
  7. **Synthesize.** Write `notes.md` — human-readable, in the project's working
     language, structured as:
     (a) one-line topic statement,
     (b) one-paragraph state-of-the-space,
     (c) dominant techniques / tools (bulleted, with specifics: which models,
         which software, which effects),
     (d) concrete examples with links,
     (e) recommended reproduction path for *this* project,
     (f) open questions / gaps.
     Keep it tight — under 800 words unless the user asked for depth. Also emit
     `findings.json` (same content, machine-readable).
  8. **Register winners** as refs so downstream roles can cite them:
     ```bash
     bun run ralph -- ref create --url <VIDEO_URL> --type social \
       --note "from research/<topic-slug>"
     bun run ralph -- ref create --url <SITE_URL>  --type design \
       --note "from research/<topic-slug>"
     ```
  9. **Handoff or stop.** If a site or video from the shortlist is a direct
     style reference the project will build on, pass it to the appropriate
     sub-task (`website-extraction` / `social-analysis`) inline — those produce
     the structured reference shape downstream roles expect. If the user only
     wanted to *learn* the space, stop at `notes.md` and summarize.

- **Outputs** (under `workspace/research/<topic-slug>/`):
  - `notes.md`, `findings.json`, `queries.md`, `sources.jsonl`
  - `pages/<slug>/{content.md, screenshot.png}` per deep-browsed site
  - `videos/<name>.mp4` + `videos/<name>-analysis.json` per analyzed guide

- **Depth control:**
  - *Shallow scan* (default): 3–6 queries, 3–5 deep-browses, 2–4 videos,
    ~30–45 min. Goal: pointed synthesis + a shortlist.
  - *Deep dive* (user asks): 10+ queries across angles, 8–15 deep-browses,
    5–10 videos, cross-video pattern detection. Goal: authoritative write-up.
  - Don't over-run a shallow scan. If the user said "just a quick look", stop
    after ~5 sources even if there's more material.

- **Logging in project context:**
  ```bash
  bun run ralph -- project log-prompt <project-id> \
    --text "<user question>" --stage research-trigger
  bun run ralph -- project log-asset <project-id> --kind research \
    --source workspace/research/<topic-slug> --purpose topic-synthesis
  ```

## Sub-task: website-extraction

- **When:** user supplies a site URL as a style/brand reference.
- **Working directory:** `workspace/references/<site-slug>/`.

- **Method — Playwright session, bespoke per site:**
  1. Load the URL, wait for networkidle + a scroll to trigger lazy content.
  2. Capture what actually matters — don't default to "grab everything":
     - **Design tokens:** `:root` CSS custom properties, computed styles of a
       handful of representative elements (headings, primary button, body text)
       → `design-tokens.json`.
     - **Color palette:** sample `color` + `background-color` across the first
       ~500 visible elements, rank by frequency → included in `design-tokens.json`.
     - **Typography:** `font-family`, `font-weight`, `font-size` distributions.
     - **Copy:** titles, meta/OG tags, headings, primary button text, hero
       copy → `site-content.json`.
     - **Screenshots:** desktop (1440px) + mobile (390px) full-page per page
       that matters. If it's a multi-page site, walk the top-nav and repeat
       — but don't crawl 100 pages, usually 2–5 is enough.
     - **Assets:** raster images (resized / full), SVG icons (inline + linked),
       videos, fonts → `assets/{images,icons,videos,fonts}/`.
  3. **Pick the level of bespoke:**
     - Generic marketing landing, straightforward DOM → the pre-built helper
       `scripts/extract-design.ts --url <URL> --output workspace/references/<slug>`
       is fine. It does approximately the above.
     - SPA with gated content, non-standard design system, unusual asset pipe
       (data-URLs, WebGL, background-image grids, canvas), or the site is the
       primary brand reference and detail matters → write a bespoke Playwright
       session. Don't force it through the canned script.
  4. Register as a ref and (if a brand) create the brand entry:
     ```bash
     bun run ralph -- brand create --name "<Brand Name>" --url <URL>
     bun run ralph -- ref create --url <URL> --type design --brand <brand-id>
     ```

- **Limitations to watch:** no auth/login flow, SPAs that gate content behind
  interaction may need extra clicks, CDN images that require a specific referer
  / auth header may 403.

- **Logging in project context:**
  ```bash
  bun run ralph -- project log-asset <project-id> --kind reference \
    --source workspace/references/<site-slug> --purpose design-ref
  ```

## Sub-task: social-analysis

- **When:** user drops a social video URL (IG / TikTok / YT / X / Reddit) or a
  handle to study.
- **Working directory:** `workspace/references/<handle>/`.

- **Method:**
  1. **Download** with `yt-dlp`:
     ```bash
     yt-dlp -f "best[ext=mp4]/best" --no-playlist \
       -o "workspace/references/<handle>/reels/<name>.mp4" "<VIDEO_URL>"
     ```
  1b. **Long video → viral moments.** If the source is long (podcast,
     stream, webinar), find viral clips first:
     ```bash
     bunx tsx .agents/skills/ralph-researcher/scripts/find-viral-moments.ts \
       --video workspace/references/<handle>/source.mp4 \
       --output workspace/references/<handle>/moments.json \
       --language ru
     ```
     Pipeline: transcribe through local whisper.cpp + sample frames every 5s →
     Gemini-2.5-flash via OpenRouter finds 3–15 clips of 15–60s, each with
     `viral_hook_text` (≤10 words) + `angle` (gatekeep/skeptic/fail/visual-shock).
     Cut on silence, never mid-word. 0.2–0.4s lead-in before the hook.
     This is input for the downstream `cli/lib/ffmpeg-recipes.ts → extractSegment`.
  2. **Analyze.** For a standard *reproduction blueprint* (what makes it work,
     how to copy it) the pre-built helper fits:
     ```bash
     export $(grep -v '^#' .env | xargs)
     bunx tsx .agents/skills/ralph-researcher/scripts/analyze-video.ts \
       --video workspace/references/<handle>/reels/<name>.mp4 \
       --output workspace/references/<handle>/blueprints/<name>
     ```
     For a bespoke question ("extract just the captioning style", "compare hook
     timing against this other reel"), call Gemini directly with `curl` and a
     tailored prompt, and write the result yourself. Don't let the canned
     blueprint shape constrain the question.
  3. **Register as a ref:**
     ```bash
     bun run ralph -- ref create --url <VIDEO_URL> --type social
     ```
  4. **Cross-analyze** multiple videos from one creator — run the per-video
     analysis, then merge manually or via the helper:
     ```bash
     bunx tsx .agents/skills/ralph-researcher/scripts/cross-analyze.ts \
       --handle <handle>
     ```
     This produces `<handle>-pattern.json` — recurring hooks, editing
     signatures, format rules. The helper is fine for standard patterns; for
     bespoke questions ("do all of these rely on a whip-pan transition?"),
     inspect the per-video blueprints directly or re-prompt Gemini.

- **Outputs** (under `workspace/references/<handle>/`):
  - `reels/<name>.mp4`
  - `blueprints/<name>/blueprint.json`, `frames/`, `audio.mp3`
  - `<handle>-pattern.json` (optional, cross-video)

- **Blueprint shape** (from the standard helper): duration / resolution /
  aspect, category, language, format type, subtitle style, hook text + why it
  works, per-scene timestamps + description + on-screen text + transition +
  camera angle, editing pace, color grading, audio (VO / music / mood / tone),
  viral factors, reproduction guide (difficulty, assets, steps, variation
  ideas).

- **Logging in project context:**
  ```bash
  bun run ralph -- project log-asset <project-id> --kind blueprint \
    --source workspace/references/<handle>/blueprints/<name> \
    --purpose social-ref
  ```

## Deciding which sub-task

- **No URL yet**, user asks an open question → `topic-research`. This sub-task
  often spawns the other two on the best candidates it finds.
- URL domain matches `instagram.com | tiktok.com | youtube.com | youtu.be |
  x.com | twitter.com | reddit.com | facebook.com` → `social-analysis`.
- URL domain is anything else, or user says "site / landing / design" →
  `website-extraction`.
- Ambiguous (e.g. `linkedin.com/posts/...` with a video embed) → ask once which
  they mean; don't start both.

## Principles

- **Process > scripts.** The helpers in `scripts/` exist for the easy cases.
  For anything that isn't vanilla, drive the raw tools (Playwright, yt-dlp,
  curl, Gemini) yourself, turn-by-turn. Rigid scripts miss what the script's
  author didn't anticipate.
- **Don't over-collect.** Capture what answers the question. A 200-image dump
  of a site's CDN is rarely more useful than 8 well-chosen screenshots and the
  color palette.
- **Log as you go.** Append queries, sources, and decisions live. The next
  session (or another agent) resumes from those files, not from your memory.
- **Stop when answered.** Shallow scans stop at synthesis. Don't drift into
  deep dive unless the user asked.

## Handoff

- After `topic-research` — if the synthesis points to a concrete style / creator
  worth reproducing, hand off to `website-extraction` / `social-analysis` inline
  in the same turn. If the user only wanted to learn the space, stop at
  `notes.md` and summarize.
- After `website-extraction` / `social-analysis` — pass control to
  **`/ralph-scenarist`** so the scenario can be written against the fresh
  reference data. If the user wanted pure research with no downstream video,
  just report and stop.
