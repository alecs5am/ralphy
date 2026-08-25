# Site-grounding — fan-out Playwright crawl before any brand-derived creative

> **When this fires:** the user names a brand URL (sotaocr.com / linear.app / their own startup) and asks for content derived from it — a poster, an FB-creative pack, a landing-derived video, a brand-style video, a competitor breakdown. **Before** drafting any prompt, brand-DNA, or paid generation, run the discipline below.

## Why this exists (the failure mode it prevents)

`sotaocr-fb-001` (2026-05-29) shipped 32 creatives. Two defects traced to **insufficient site-grounding**:

1. **Brand DNA invented from memory** — agent drafted a fictional deep-black + orange palette for a brand whose real site is white + blue. v1 of 6 creatives ($1.20, 12 min) had to be re-rendered. *Cause: only the home page was fetched (WebFetch summary), and CSS hex values were not extracted before prompts were written.*
2. **Hallucinated Python SDK** — agent rendered `import sotaocr` / `sotaocr.parse(pdf)` on 5/32 creatives. The brand documents ONLY a REST API (`curl -X POST https://sotaocr.com/v1/extract`). *Cause: agent didn't visit `/docs` or any second page, so the API surface was guessed from training-corpus pattern-match ("dev tool → must have Python SDK").*

Both defects share a single root cause: **the agent stopped at the hero page**. A single WebFetch is not enough. The fix is a **fan-out crawl** — multiple pages, captured visually and structurally, before any prompt is drafted.

## The discipline

### Step 1 — Dispatch a sub-agent for the crawl

Don't crawl inline (clutters the main agent's context with 50KB of HTML / CSS dumps). Dispatch via the `Agent` tool with `general-purpose` subagent type and a focused prompt. The sub-agent returns a structured digest; the main agent reads that digest.

```
Agent(subagent_type: "general-purpose", description: "Site-grounding crawl", prompt: ...)
```

The prompt to the sub-agent should be (template):

```
Run a fan-out crawl of <URL> and produce a structured digest at
.ralphy/workspaces/<ws>/projects/<id>/artifacts/refs/research.md.

Use Playwright (bun /tmp/playwright-script.js with chromium.launch()).
Visit at minimum these pages (auto-detect from the sitemap / nav menu if a
path doesn't exist):

  1. Home / landing                          (artifacts/refs/home.png)
  2. /docs or /documentation or /api         (artifacts/refs/docs.png + extract API surface)
  3. /pricing                                (artifacts/refs/pricing.png + extract price points)
  4. /features or /product                   (artifacts/refs/features.png)
  5. /examples or /showcase or /customers    (artifacts/refs/examples.png)
  6. /blog or /changelog                     (artifacts/refs/blog.png — recent claims)
  7. /about (optional — team, location)

For EACH page, capture:
  - A 1440×900 deviceScaleFactor=2 hero screenshot → artifacts/refs/<slug>.png
  - The visible body copy (text content of <main>, dump as artifacts/refs/<slug>.txt)
  - Computed CSS custom properties + hex colors used → artifacts/refs/tokens.json
  - Page title + meta description

Then write artifacts/refs/research.md with these sections:

  ## Brand DNA
  - Background color(s) + hex
  - Primary CTA color + hex
  - Accent / success / error colors + hex
  - Typography stack (display, body, code)
  - Logo style (wordmark / mark / both)

  ## Documented API surfaces (CRITICAL — drives every code-creative)
  - List every documented surface: curl examples / Python SDK / TS SDK /
    GUI / CLI / GraphQL / REST. Cite the exact import path or curl command.
  - If only curl is documented, say so explicitly. This is the #1 source of
    hallucinated SDKs in code creatives.

  ## Product claims (hard numbers anchored to specific pages)
  - Accuracy %, latency ms, price/unit, customer count, supported languages,
    integrations. Each with the page it appears on.

  ## Audience signals
  - Job titles named (AI engineer / data engineer / founder / etc)
  - Use-cases named (RAG / invoice parsing / contract review / etc)
  - Customer logos visible

  ## Direct copy worth reusing
  - Hero headline (verbatim)
  - Subhead (verbatim)
  - Top 2-3 testimonial quotes if any
  - Footer claim if any

Do NOT generate creatives. Do NOT write prompts. Just return the digest.
Estimated cost: 0 (Playwright is local), wall-clock ~3-5 min.
```

### Step 2 — Read `artifacts/refs/research.md` BEFORE writing brand-dna.md

The digest is the single source of truth for the brand-DNA file. Every hex value in `brand-dna.md` must trace to a token in `artifacts/refs/tokens.json` or a screenshot in `artifacts/refs/`. No invented colors. No invented API symbols. No invented claims.

### Step 3 — Pass `artifacts/refs/home.png` (or the most representative page) as `--ref` on every gen

For visual consistency across N creatives, every `ralphy generate image` call gets `--ref artifacts/refs/home.png` (or whichever page best represents the brand at-a-glance). This was the discipline that made 32 distinct sotaocr-fb-001 creatives feel cross-consistent.

## Hard rules

1. **No prompt without research.md.** If `artifacts/refs/research.md` doesn't exist for a brand-derived project, the next paid `ralphy generate` is forbidden. Period.
2. **Code creatives must cite the documented surface.** If `research.md` "Documented API surfaces" lists ONLY `curl`, code-on-screen creatives must show curl. Never invent an SDK on top of a curl-only API. See [[feedback_verify_sdk_before_code_creative]].
3. **Brand-DNA hex values must match `artifacts/refs/tokens.json`.** No memory-sourced palette guesses. See [[feedback_site_grounding_before_brand_dna]].
4. **The sub-agent crawls — the main agent doesn't.** Keep the crawl out of the main context. The digest is the deliverable.

## What "good research.md" looks like

```markdown
# Site research — sotaocr.com — 2026-05-29

## Brand DNA
- Background: pure white `#FFFFFF` (body), warm off-white `#FAFAFA` (cards)
- Primary CTA: blue `#3B82F6` (Tailwind blue-500)
- Hover / strong-blue: `#2563EB`
- Success / win: emerald `#10B981`
- Text primary: slate-900 `#0F172A`
- Text muted: slate-400 `#9CA3AF`
- Code-card / dark accent: navy `#0F172A`
- Typography: Inter (display + body), JetBrains Mono (code)
- Shadcn / Tailwind canonical aesthetic

## Documented API surfaces
- **REST only** (no Python SDK, no TS SDK).
- Hero shows: `curl -X POST https://sotaocr.com/v1/extract -H "Authorization: Bearer YOUR_API_KEY" -F "file=@document.pdf"`
- Docs at /docs (when implemented): same curl shape across all endpoints.
- **DO NOT render `import sotaocr` / `pip install sotaocr` in any creative.**

## Product claims
- 95% accuracy (homepage hero, comparison strip)
- $0.003 per page, no setup fee (pricing section)
- 100+ languages (features section)
- Integrations named: Claude / Codex / Cursor
- Competitor benchmark numbers: Google Vision 82%, Azure 79%, Tesseract 61%

## Audience signals
- "AI agents and LLM pipelines" (hero meta-description)
- Implicit: RAG developers, document-pipeline engineers, indie AI builders

## Direct copy worth reusing
- Hero headline: "Online PDF recognition service for AI agents and LLM pipelines"
- CTA pill: "TRY IT FREE"
- Reassurance: "No credit card required"
```

## When to skip this

- **The brief is a generic UGC / video request** with no specific brand site named (e.g. "make a TikTok about coffee aesthetics"). Then no site-grounding needed.
- **The user explicitly provided refs** (uploaded screenshots, dropped a press kit URL). Then read those refs directly; don't re-crawl.
- **The brief is a remix of a specific video** (`@template:<slug>`, "remix this exact one"). The template encodes the brand context; no extra crawl needed unless the swap introduces a new brand.

## Cross-references

- `docs/playbooks/intake.md` step 1 — first turn where this discipline must fire if the brief is brand-derived
- `.agents/skills/poster/SKILL.md` — single-poster path; site-grounding is the pre-flight
- `.agents/skills/researcher/SKILL.md` — for video-style research (TikToks, Reels). This playbook is its sibling for brand-site research.
- AGENTS.md hard invariant #15 — the route-level enforcement
- Memory: [[feedback_site_grounding_before_brand_dna]], [[feedback_verify_sdk_before_code_creative]]
- Postmortem of origin: `.ralphy/workspaces/<ws>/projects/sotaocr-fb-001/postmortem/02-lessons.md` rule #1 + Iteration 2 rule #8

---

*Written 2026-05-29 after sotaocr-fb-001 caught two hallucination defects traceable to insufficient site-grounding. If this playbook saves another session $1+ or one re-render cycle, it has paid for itself.*
