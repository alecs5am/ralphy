# Intake step 1.7: research bootstrap

> Moved out of `SKILL.md` to keep the skill body small (#574). Read on demand.

## Step 1.7 — Research bootstrap (BEFORE the plan, #416)

After the format/template match and before drafting the plan, run the **research bootstrap** — research is an opinionated default, not an afterthought. Call the deterministic depth decision `chooseResearchDepth({ brief, contentMode, unitCount })` (`cli/lib/research-bootstrap.ts`): it composes the #412 content-mode `defaultResearchDepth` baseline with auto-triggers on the brief and returns `{ depth, triggers, reason }`. Then route the depth to the EXISTING surface — never build a new crawl:

- **`quick`** (brand/product/site grounding + 3-5 benchmark refs) → the site-grounding sub-agent (AGENTS #15, [`site-grounding.md`](../../researcher/references/site-grounding.md)) → `artifacts/refs/research.md`, or a few `ralphy ref pull <url>` for benchmarks.
- **`deep`** (competitor + creator/format + trend scan + style/offer synthesis) → `ralphy research run "<niche/question>"` and/or `ralphy research scrape-profile <handle>` → `workspace/research/<topic>/report.md` + `sources.json`.
- **`none`** → skip; plan from the brief.

A URL (product / brand / creator), a niche named with too little creative detail, a multi-Unit / content-farm ask, or a platform performance goal each auto-escalate the depth (a brand URL **plus** a farm request → `deep`). Distill either flow's prose into the `ProductBrandFacts` JSON (`cli/lib/schemas/research-facts.ts`) at `<project>/artifacts/refs/research-facts.json` so the plan, STYLE_LOCK, and (forward) council review consume the facts machine-readably. Full discipline: [`research-bootstrap.md`](../../researcher/references/research-bootstrap.md). **Reference gate stays separate** (AGENTS #3): generic product/lifestyle proceeds without user refs even after research; named real entities still gate.
