# Site / topic extraction (Playwright)

## When to use which

- **Generic landing, plain DOM** → pre-built `bunx tsx scripts/extract-design.ts --url <URL> --output workspace/references/<slug>`.
- **SPA / gated content / non-standard design / WebGL / canvas / data-URLs / brand-critical detail matters** → bespoke Playwright session inline. Don't force it through the canned script.

## Bespoke Playwright recipe

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
  // ... write content.md, collect outbound links, etc.
  await b.close();
'
```

Adapt per target — that's the whole point of bespoke.

## What to capture (website-extraction)

Working dir: `workspace/references/<site-slug>/`.

1. **Design tokens** — `:root` CSS custom properties + computed styles of representative elements (h1, primary button, body) → `design-tokens.json`.
2. **Color palette** — sample `color` + `background-color` across the first ~500 visible elements, rank by frequency → into `design-tokens.json`.
3. **Typography** — `font-family`, `font-weight`, `font-size` distributions.
4. **Copy** — titles, meta/OG, headings, primary button text, hero copy → `site-content.json`.
5. **Screenshots** — desktop 1440px + mobile 390px full-page for each important page. 2-5 pages is usually enough.
6. **Assets** — raster images, SVG icons, videos, fonts → `assets/{images,icons,videos,fonts}/`.

## After extraction

```bash
ralphy brand create --name "<Brand Name>" --url <URL>
ralphy ref create --url <URL> --type design --brand <brand-id>
ralphy project log-asset <project-id> --kind reference \
  --source workspace/references/<site-slug> --purpose design-ref
```

## Limitations

- No auth/login flow.
- SPAs with gated content may require extra clicks.
- CDN images with a specific referer / auth header may 403.

## Topic-research method (open-ended question)

Working dir: `workspace/research/<topic-slug>/`.

### Iterate, don't march

1. **Map** — 3-6 complementary `WebSearch` queries (general / technical / community / platform-specific). Log to `queries.md`.
2. **Log candidates** to `sources.jsonl`: `{url, title, platform, relevance: "high|medium|low|skip", note}`. Shortlist 5-12 typical.
3. **Classify** — social URL → `social-analysis`. Dense tutorial → Playwright dig. Pure text → `WebFetch`. Low-value → `skip`.
4. **Deep-browse dense pages** via bespoke Playwright (see recipe above).
5. **Download guide videos** — `yt-dlp -f "best[ext=mp4]/best" --no-playlist -o "workspace/research/<slug>/videos/<name>.mp4" "<URL>"`.
6. **Analyze each guide video** — for tutorial content call Gemini directly via `callLLM()` with a method-extraction prompt (NOT the default `analyze-video.ts`, which is for reproduction blueprints). Write the result to `videos/<name>-analysis.json`.
7. **Synthesize** in `notes.md`:
   - one-line topic statement
   - one-paragraph state-of-the-space
   - dominant techniques / tools (bulleted with specifics)
   - concrete examples with links
   - recommended reproduction path
   - open questions / gaps
   Hold to ≤800 words unless the user asked for depth. Also `findings.json` (machine-readable).
8. **Register winners** via `ralphy ref create`.
9. **Handoff or stop** — concrete style ref → inline `website-extraction` / `social-analysis`. Otherwise report.

## Depth control

- **Shallow** (default): 3-6 queries, 3-5 deep-browses, 2-4 videos, ~30-45 min. Goal: pointed synthesis.
- **Deep dive** (user asks): 10+ queries, 8-15 browses, 5-10 videos, cross-pattern. Goal: authoritative write-up.
- Don't over-run a shallow scan. "just a quick look" → stop after ~5 sources.
