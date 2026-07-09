# Article/text content pipeline (SEO + GEO)

> **Status:** done — 2026-07-09 (article unit format + seo-article content mode, lockstep 21→22 modes / 8→9 formats; deterministic text-quality evals (keyword/structure/reading-level/length) wired as workspace-eval gate criteria with a #529 seam; geo-article guideline; headless reference graph research→outline→draft→gate→unit with mocked LLM; social-copy reuses captionUnit. smoke:modes + mode-guidelines green at 22.)
> **Filed:** 2026-07-06
> **Folder:** issues
> **Severity:** high
> **Category:** content-modes / units / text

## Context

The owner's first campaign shape is "30 articles for SEO/GEO (Medium, GitHub
Pages, ...) + 30 YouTube videos + 30 shorts" occupying the topics "ralphy is a
video studio for AI agents" / "agent-made video earns money and views". The
system has NO text content class: all 20 content modes and all 8 unit formats
(`cli/lib/schemas/unit.ts`) are image/video-shaped. Articles are unrepresented
end to end — no mode, no unit format, no production nodes, no eval gates for
prose.

## What

Make long-form text a first-class content type:

- `article` unit format (markdown body + frontmatter metadata + optional
  hero/inline images produced by the existing image pipeline).
- A `seo-article` content mode (classifier keywords, research depth, expected
  unit shape) — GEO-aware: structured for both search snippets and LLM-answer
  citation (clear claims, quotable definitions, FAQ blocks).
- Production graph shape via existing node types: research (`generate-object`)
  -> outline -> draft (`generate-text`) -> revision passes -> eval gate ->
  unit. New text-eval criteria: keyword coverage vs the brief, structure
  (headings/FAQ/links), reading level, length window, and the #529 AI-tell
  lint as a gate criterion.

## Why it matters

Search + LLM-answer surfaces are the cheapest durable distribution for a dev
tool, and the campaign entity (#528) needs articles as the anchor nodes that
videos and shorts link back to. Text is also the cheapest content class to
farm — high volume at near-zero media spend.

## Scope / acceptance

- `article` added to `UNIT_FORMATS` + unit.json shape (body file ref,
  frontmatter: title, description, slug, tags, canonical URL slot, hero
  ref); `ralphy unit create --format article` works.
- `seo-article` mode registered in `cli/lib/content-modes.ts` (+ the
  supported-count lockstep: mode tests, `docs/content-mode-coverage.md`,
  AGENTS.md) with `templateLookup`, `expectedUnitShape`, keywords.
- Deterministic text evals under `cli/lib/eval/`: keyword coverage, structure
  checks, length window — wired as workspace-evaluator criteria usable in
  graph `gate` nodes.
- A reference article graph (fixture) runs headless through the runner with
  mocked LLM executors: research -> outline -> draft -> gate -> unit.
- Social copy path (#403) produces the article's promo snippets (the X-thread
  teaser) from the same unit.
- Docs: mode entry + a short `docs/playbooks/` section on the article route.

## Notes

- Sequence after #511 (unit executor); publish connectors are #527; campaign
  planning is #528; prose humanization is #529.
- GEO guidance should live as a guideline (`guidelines/`) the drafting prompt
  folds in (#515), not hardcoded in executor code.
