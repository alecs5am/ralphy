# Mode quality playbook — `seo-article`

> A long-form GEO-aware SEO article — a markdown body (+ optional hero / inline images) shaped for BOTH classic search snippets and LLM-answer citation. Not social post copy (that is [`social-copy`](../../../.agents/skills/social-copy/SKILL.md)), not a video VO script (that is the scenarist for a video mode). Backing guideline: [`geo-article`](../../../guidelines/geo-article/) folded into the drafting prompt (#515). Route: `intake → researcher → scenarist (drafting) → deterministic text-quality gate → ralphy unit create --format article`. This is the first NON-media content mode — the deliverable is prose, formed as an `article` Unit.

## Creative objective

Ship a standing article that earns durable, near-zero-media-cost distribution on the two cheapest surfaces for a dev tool: classic search (a snippet extractor lifts the answer) AND generative engines (an LLM answering a user question cites a self-contained claim). The piece wins on **keyword coverage + GEO structure (quotable claims, an explicit FAQ block, clear definitions) + an approachable reading level inside a sensible length window**. It is the anchor node a campaign's videos and shorts link back to (#528).

## Required inputs

- Topic or keyword (the registry declares `requiredInputs: ["topic or keyword"]`). A one-line topic is enough to start; research fills the rest.
- Optional: target keywords, audience, reference sources, a word-count target, a pre-written outline.

## Reference requirements

The reference-required gate (AGENTS #3) does NOT fire for a generic topic — prose about a no-name product / concept proceeds without user refs. It fires only when the article centers a named real entity the model cannot fabricate (a specific person, a recognizable branded product, an IP) and the article would assert facts about it — then demand a source. The article's "references" are its outbound reference LINKS + the research facts every claim traces to, not visual refs.

## Research

`defaultResearchDepth: "deep"` — an article that asserts facts needs grounding, and a low-detail topic auto-triggers research (AGENTS #19). Route the depth to the existing surfaces: `quick` → the site-grounding sub-agent (#15) / a few `ralphy ref pull`; `deep` → `ralphy research run`. Distill into `ProductBrandFacts` at `<project>/artifacts/refs/research-facts.json`. Every number, date, name, and superlative the draft asserts must trace to this research — fabricated specifics fail the claims gate and lose citation trust.

## Prompt spine (the graph route)

The article is produced by a graph route through the existing node executors — no bespoke skill. Author it as `research → outline → draft → gate → unit`:

1. **research (`generate-object`)** — a structured facts object from the topic + sources (schema = the research-facts JSON schema). Deep depth runs `ralphy research run` first and feeds the digest.
2. **outline (`generate-text`)** — a heading skeleton: title + meta-description pair, a definition/direct-answer opening, one-idea-per-heading H2/H3 sections, and an FAQ section of real question headings. Fold in the [`geo-article`](../../../guidelines/geo-article/) guideline (#515) so the structure is GEO-shaped from the outline stage.
3. **draft (`generate-text`)** — the full markdown body from the outline + facts, again with the `geo-article` guideline folded in. Enforce the claim-standalone discipline: each key sentence must read on its own (an LLM lifts it out of context), lead with the claim then qualify, quotable definitions, no invented facts.
4. **gate (`gate` over the deterministic text-quality eval)** — see Evaluation below.
5. **unit (`ralphy unit create --format article`)** — form the `article` Unit from the drafted body.

All LLM traffic goes through `callLLM()` / the `generate-text` / `generate-object` executors (AGENTS invariant #1/#2) — never an ad-hoc provider call.

## Model recommendations

Verify against `MODELS.md` every run.
- **Draft + outline — `anthropic/claude-sonnet-4.6`** (the MODELS.md scenarist / rewrite row): strong long-form structure, holds the claim-standalone discipline, EN/RU parity.
- **Harder synthesis across many sources — `anthropic/claude-opus-4.6`.**
- Optional hero / inline figures — `google/gemini-3-pro-image-preview` (only when the brief asks for images; the article is prose-first).

## Style / visual constraints

- **Title + meta description pair** — front-loaded primary keyword, complete-sentence meta description (~150-160 chars).
- **Definition / direct-answer opening** — answer the core question in one quotable paragraph before any preamble.
- **Scannable H2/H3, one idea per heading** — no wall of text, no heading bundling three ideas.
- **An explicit `## FAQ` block** — 3-5 real question headings with quotable one-paragraph answers. The single highest-leverage GEO structure.
- **Outbound reference links** — anchor every non-obvious claim.
- **Plain register** (Flesch Reading Ease ~45+) and a **~600-2500 word window**. Depth beats padding.

## Common failure modes

- **Prose that reads only in context** → rewrite each key sentence to stand alone; lead with the claim, then qualify.
- **No FAQ block** → add an `## FAQ` section with real question headings — it is the shape answer engines cite from most.
- **Keyword stuffing** → work the target keywords into headings / intro / FAQ naturally; the coverage gate rewards presence, not density.
- **Dense / academic register** → shorten sentences, cut jargon; the reading-level gate warns below the floor.
- **Invented facts** → strip any specific not in the research; reframe qualitatively when the fact is missing.
- **Thin or bloated body** → hit the length window; cut a thin section rather than stretch it.

## Evaluation criteria

The substantive gate is the **deterministic text-quality eval** ([`cli/lib/eval/text-quality.ts`](../../../cli/lib/eval/text-quality.ts), #526) — PURE, zero model calls — wired as workspace-evaluator criteria (`text-keyword-coverage`, `text-structure`, `text-reading-level`, `text-length-window`) so a graph `gate` node consumes the verdict. It scores four axes:

- **Keyword coverage** vs the brief's target keywords (default floor 70%).
- **Structure** — ≥3 headings, an FAQ block present, ≥1 outbound link.
- **Reading level** — Flesch Reading Ease at or above the floor (default 45).
- **Length window** — word count inside `[minWords, maxWords]` (default 600-2500).

`requiresTextQualityGate(mode)` (in `cli/lib/content-modes.ts`) DERIVES that this gate runs for any `article`-format mode. The classic refuse-not-warn slot the mode declares in `qualityGates[]` is `scoreScenario` — it gates the outline/draft structure before the article is formed. The #529 AI-tell / prose-humanization lint joins this gate family later as another derived criterion.

Then form the deliverable: `ralphy unit create <id> --slug <s> --format article --from "artifacts/<draft>.md"` COPIES the body (+ any images) into `units/<slug>/` and writes the `article` frontmatter (title, description, slug, tags, canonical URL slot, hero ref) into `unit.json`. The article's promo snippet (an X-thread teaser) comes from the SAME unit via `ralphy unit caption <id> <slug>` (#403 — the social-copy path is reused, not forked). Do NOT build a parallel export verb.

## Does NOT apply to:

- Short, platform-shaped social post copy / captions / hashtags → that is the [`social-copy`](../../../.agents/skills/social-copy/SKILL.md) skill.
- A video VO script / faceless-explainer narration → the scenarist for the matching video mode ([`podcast-video`](podcast-video.md) / `ugc-review`).
- Ad copy on an image creative → the on-image copy of [`ad-creative-pack.md`](ad-creative-pack.md) / [`amazon-listing.md`](amazon-listing.md).
- A carousel's per-slide text → [`social-carousel.md`](social-carousel.md).
