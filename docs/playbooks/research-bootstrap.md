# Research bootstrap — opinionated default research before the plan (#416)

> **What this is.** Trend / niche / brand research is no longer optional. Before the production plan (contract phase 7), the agent runs a **deterministic depth decision** over the brief and routes to the matching EXISTING research surface. A low-detail or URL-bearing or content-farm brief produces a research-backed plan, not a generic script.
>
> **What this is NOT.** A new crawler. The decision picks a depth; the crawling is done by the surfaces that already exist — the deep research engine (`ralphy research run`) and the site-grounding sub-agent (AGENTS.md #15). Nothing here regenerates `report.md`.

## The decision: `chooseResearchDepth` (deterministic, no LLM)

The testable core is `cli/lib/research-bootstrap.ts → chooseResearchDepth(input)`:

```ts
chooseResearchDepth({ brief, contentMode?, unitCount? }):
  { depth: "none" | "quick" | "deep", triggers: string[], reason: string,
    modeBaseline, contentMode }
```

It composes two inputs and takes the **deeper** of them:

1. **The #412 content-mode baseline.** Each mode in `cli/lib/content-modes.ts` carries a `defaultResearchDepth`. That is the starting depth (e.g. `product-shot` → `none`, `lifestyle-scene` → `quick`, `tv-ad` / `ad-creative-pack` → `deep`). When the agent hasn't classified a mode, the bootstrap classifies the brief itself.
2. **Auto-triggers detected on the brief.** Each fired trigger demands its own depth; the result is `MAX(baseline, every fired trigger)`. `none` survives only when **nothing triggers AND the mode default is none**.

### Quick vs deep

| Depth | What it does | Routes to (no new crawler) |
|---|---|---|
| **none** | Skip research; plan from the brief. | — |
| **quick** | Brand/product/site grounding + 3-5 benchmark references. | Site-grounding sub-agent (AGENTS.md #15, `docs/playbooks/site-grounding.md`) → `artifacts/refs/research.md`; or a few `ralphy ref pull <url>` for benchmark refs. |
| **deep** | Competitor scan + creator/format scan + trend scan + style/offer synthesis. | `ralphy research run "<niche/question>"` (deep engine, `cli/lib/research/orchestrator.ts`) → `workspace/research/<topic>/report.md` + `sources.json`; `ralphy research scrape-profile <handle>` for the creator/format scan. |

### The auto-triggers (when research fires automatically)

| Trigger | Demands | Fires when the brief carries… |
|---|---|---|
| `product-url` | quick | a non-creator URL with a product/checkout path (`/products/…`, `/buy`, `/checkout`). |
| `brand-url` | quick | any other non-creator URL (a brand domain / marketing page). |
| `creator-url` | quick | a creator-platform URL (tiktok/instagram/youtube/x/reddit/facebook/twitch) or a bare `@handle`. |
| `niche-low-detail` | deep | a niche named with too little creative detail (short brief, no URL/handle, no style/look/format markers). |
| `multi-unit-farm` | deep | a content-farm / multi-Unit ask — a count ≥4 (`unitCount` or "32 FB creatives"), or farm wording ("batch of", "at scale", "daily content"). |
| `platform-performance-goal` | deep | a performance goal — "go viral", CTR, ROAS, retention, scroll-stop, cold-traffic, etc. |

**Escalation example:** a brand URL alone → `quick`; a brand URL **plus** a content-farm request → `deep` (the farm trigger escalates). An `ad-creative-pack` brief is already `deep` at the mode baseline.

The decision returns the fired-trigger list and a human `reason` so the agent can explain (and the user can override) why it chose the depth.

## How research feeds the rest of the pipeline

The depth decision runs **before** the production plan; the artifacts it produces are then cited downstream.

1. **Structured facts → `ProductBrandFacts`.** The distillate of either flow is the Zod schema in `cli/lib/schemas/research-facts.ts` (`productFacts`, `brandAssets`, `audience`, `proofPoints`, `claimsToAvoid`, `visualReferences`, `platformFit`, `sources[]`). The agent extracts it from the prose report and persists it to **`<project>/artifacts/refs/research-facts.json`** (`RESEARCH_FACTS_ARTIFACT`). It lives in the `refs` kind (#105) so it composes with `--ref artifacts/refs/…` resolution and the append-only contract (regen → `.v2`, #14). The prose stays where the engine wrote it (`workspace/research/<topic>/report.md` for deep, `artifacts/refs/research.md` for site-grounding) — this JSON is the machine-readable companion.
2. **Content-mode selection (#412).** The depth decision uses the mode baseline, but a deep research pass also informs which mode actually fits (e.g. the brief said "ads" but the competitor scan shows the niche wins with talking-head reviews → `ugc-review`). Re-classify after research if it changes the picture.
3. **Production plan (#407).** The plan's `benchmarkSource` field (`cli/lib/schemas/production-plan.ts`) records the research artifact the plan depends on — a benchmark URL, the topic slug, or the path to `research-facts.json`. The agent fills it after the bootstrap; the plan markdown surfaces it under "Benchmark / style source". **The plan cites the research it was built on.**
4. **STYLE_LOCK (#408).** `STYLE_LOCK.md`'s **Benchmark references** section is seeded from the `visualReferences` + `sources`; the **Do-not-do list** absorbs `claimsToAvoid` (e.g. "REST only — never render an SDK"). The eval deep-vision pass later scores against these same references.
5. **Council review (#415, forward ref).** When council review lands, the reviewers read `research-facts.json` + the report so the critique is grounded in the same facts the plan was built on.

## Reference-gate interaction (AGENTS.md #3)

Research depth and the reference-required gate are **separate axes**:

- **Generic product / lifestyle work proceeds without user-uploaded refs.** "Make a UGC ad for my no-name workout app" needs research (niche grounding) but does **not** require a user-supplied reference image — the model can fabricate a generic product. Research fills the niche context; the gate stays open.
- **Named real entities still gate.** A specific person ("Elon Musk"), a recognizable brand product ("Coca-Cola can", "iPhone 16"), or a recognizable IP ("Pikachu") still requires a reference (or a logged `--no-ref-consent`), no matter how much research ran. The CLI floor is `ralphy ref check <project-id>`.

So: research being `quick`/`deep` does not satisfy the reference gate, and the gate firing does not change the research depth. Run both checks.

## Where this fires in the flow

- **Intake (`docs/playbooks/intake.md`).** Step where the brand-DNA / niche question lands: run `chooseResearchDepth`, then the matching surface, BEFORE drafting the plan.
- **Producer (`docs/playbooks/producer.md`).** The end-to-end wrapper runs the bootstrap after the template match and before `ralphy project plan`, and the plan's `benchmarkSource` cites the artifact.
- **AGENTS.md.** Hard-invariant note that low-detail / URL / farm prompts auto-trigger research; this doc is the discipline.

## Cross-references

- `cli/lib/research-bootstrap.ts` — `chooseResearchDepth` + `DEPTH_ROUTING` (source of truth).
- `cli/lib/schemas/research-facts.ts` — the `ProductBrandFacts` schema + artifact path.
- `cli/lib/content-modes.ts` — `defaultResearchDepth` per mode (the baseline).
- `docs/playbooks/site-grounding.md` — the quick-depth brand crawl (AGENTS.md #15).
- `.agents/skills/researcher/SKILL.md` — the deep-depth research workflow.
- `cli/lib/plan/build.ts` — the production plan's `benchmarkSource` field (#407).
- `cli/lib/style-lock.ts` — STYLE_LOCK benchmark/do-not-do seeding (#408).
- Issue: `notes/issues/416-trend-and-niche-research-bootstrap.md`.
