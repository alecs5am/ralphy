# Universal intelligence pack — design

> **Status:** schema + composer + required-intelligence matrix shipped (`cli/lib/schemas/intelligence-pack.ts`). The planning / eval / persistence wiring named in §6-§7 is the seam, not yet built.
> **Tracks:** [`../../notes/issues/done/455-universal-intelligence-pack.md`](../../notes/issues/done/455-universal-intelligence-pack.md)
> **Grounded as of:** 2026-06-23 against the live repo. Every path / export cited below was verified to exist at that time.

Read [`../../CLAUDE.md`](../../CLAUDE.md) (the `.ralphy/` layout) and [`../../AGENTS.md`](../../AGENTS.md) (invariant #3 reference gate, #14 append-only, #19 research-is-the-default) for the surrounding context. The intelligence pack is the unified context layer the production contract assembles before generation; it composes three artifacts that already exist — research facts (#416), the typed reference pack (#426), and the golden benchmark set (#419) — rather than re-deriving any of them.

---

## 1. Goal

Strong production starts with context: product, brand, audience, competitors, references, platform conventions, benchmarks, and claims. Today those facts are scattered across `research-facts.json`, `ref-pack.json`, `benchmarks/<slug>/`, and free prose, and every downstream phase re-parses them. The intelligence pack is the ONE typed artifact every non-trivial project builds before generation so planning, generation, eval, and repair all read a single object. Reference quality is the floor of output quality (#3); the pack is where that floor is made checkable.

---

## 2. Schema

`IntelligencePackSchema` (`cli/lib/schemas/intelligence-pack.ts`) is a Zod object in the house style (inline-doc comments, `z.infer` exports, `.default()`s, a `parseIntelligencePack()`). It has three layers:

1. **Provenanced facts the composed artifacts do NOT already own** — `brand`, `product`, `audience`, `competitors`, `claims`, `platformConstraints`, `openRisks`. Each leaf is an `IntelligenceFactSchema` (see §3). `competitors[]` and `platformConstraints[]` wrap a fact (`takeaway` / `note`) plus their own structured fields (name/url, platform/aspect/durationBand).
2. **The composed existing artifacts, embedded verbatim and OPTIONAL** — `research` (`ProductBrandFactsSchema`), `refPack` (`RefPackSchema`), `benchmark` (`BenchmarkSetSchema`). Embedding the resolved snapshot means a consumer reads one object; the pack is still additive (an absent artifact is simply omitted).
3. **Pointers to the on-disk sources** — `researchFactsRef`, `refPackRef`, `benchmarkSlug`, `contactSheetRef`. The pack POINTS at the files it snapshotted so a reader can re-resolve or diff.

Top-level shape:

| field | type | layer | notes |
|---|---|---|---|
| `version` | `1` | — | bumps when a field becomes required |
| `projectId`, `mode`, `generatedAt` | strings | — | `mode` is the content-mode id the pack was built for |
| `brand`, `product`, `audience`, `claims`, `openRisks` | `IntelligenceFact[]` | facts | provenanced leaves (§3) |
| `competitors` | `Competitor[]` | facts | `{ name, url?, takeaway: IntelligenceFact }` |
| `platformConstraints` | `PlatformConstraint[]` | facts | `{ platform, aspect?, durationBand?, note: IntelligenceFact }` |
| `research` | `ProductBrandFacts?` | composed | embedded #416 distillate |
| `refPack` | `RefPack?` | composed | embedded #426 typed ref index |
| `benchmark` | `BenchmarkSet?` | composed | embedded #419 golden set |
| `researchFactsRef`, `refPackRef`, `benchmarkSlug`, `contactSheetRef` | strings | pointers | on-disk sources the snapshots came from |

The pack persists to `<project>/INTELLIGENCE_PACK.json` (the `INTELLIGENCE_PACK_ARTIFACT` constant), a top-level project artifact beside `ref-pack.json` — it is a project INDEX, not a reference file. The issue's readable-Markdown report (acceptance #1) is a rendering of this object, deferred to the CLI verb that owns persistence (§7).

---

## 3. Source provenance (acceptance #2)

Every fact carries `{ value, source, provenance, confidence, origin }`:

- `value` — the human-readable claim.
- `source` — the cited source (a URL, a `research-facts` source id, `"user upload"`, `"intake"`).
- `provenance` — the free-form trail of how the fact was obtained.
- `confidence` — `0.0-1.0`, bounded by the schema.
- `origin` — the load-bearing enum `user | crawled | inferred` (`FactOrigins`). This is what makes a **user-provided fact distinguishable from a crawled one** — the exact item #2 requires. `origin` has **no default**: a fact must declare where it came from, so a malformed fact (origin omitted) fails parse rather than silently defaulting to a trusted origin.

`originsPresent(pack)` and `allFacts(pack)` (which flattens facts nested inside `competitors` / `platformConstraints`) support a quick provenance audit.

---

## 4. Required-intelligence matrix (acceptance #3)

`requiredIntelligenceFor(mode)` maps a content-mode id (#412) to the `IntelligenceField`s it requires before its plan may proceed at full spend, and `missingRequirements(pack, mode)` returns the unmet ones. A non-empty result is what planning **blocks or downgrades** on — the issue's default-deny policy: no large paid generation until required intelligence exists or the user approves a bypass with a reason.

The lists are deliberately SMALL and **derived from the content-mode registry** so they never drift from #412 (no hand-kept parallel table):

- Commercial modes (a real product/brand anchor — `requiresFidelityGate(mode)` is true) require `product` facts + a non-empty `refPack`.
- Modes declaring a `brand` required ref type also require `brand` facts.
- Modes whose `defaultResearchDepth` is `deep` also require `research`.
- Unknown / generic-craft modes require nothing.

Worked output (a representative slice; full table is whatever the registry yields):

| mode | required fields |
|---|---|
| `product-shot`, `ugc-review`, `amazon-listing`, `tutorial-ugc` | `product`, `refPack` |
| `ad-creative-pack` | `brand`, `product`, `research`, `refPack` |
| `tv-ad` | `product`, `research`, `refPack` |
| `typography-animation`, `motion-design`, `social-carousel`, `restyle` | (none) |

`fieldPresent()` defines "satisfied": an array field must be non-empty, `research` / `benchmark` must be present, and `refPack` must be present **and** carry at least one entry (an empty ref pack does not clear the bar). The returned list is always a subset of `INTELLIGENCE_FIELDS` in that stable order.

---

## 5. Ref-pack + research integration (acceptance #4/#5)

- **Ref pack (#426).** The pack embeds the parsed `RefPack` on `refPack` and records its path on `refPackRef`. The reference floor is enforced through the existing ref-pack helpers (`missingRequiredRefTypes`, the fidelity gate #422) — the intelligence pack's `refPack` requirement is the coarser "is there a locked reference set at all" check that sits on top. When the ref-pack contact sheet / lint output (#449) is produced, its path goes on `contactSheetRef`.
- **Research (#416).** The pack embeds the parsed `ProductBrandFacts` on `research` and records `researchFactsRef`. The deep-research requirement in §4 reads exactly this — a `deep` mode is not plan-ready until the research distillate is composed in. The free-text research sections (`productFacts`, `brandAssets`, `audience`, `platformFit`, …) stay where #416 put them; the pack does not re-type them as `IntelligenceFact`s. They remain the prose distillate; the pack's own provenanced `brand`/`product`/`audience` arrays are the curated, individually-sourced facts the agent promotes when origin/confidence matters (e.g. a user-corrected fact vs. a crawled one).
- **Benchmark (#419).** The pack embeds the parsed `BenchmarkSet` on `benchmark` and derives `benchmarkSlug` from the set itself.

---

## 6. Planning integration seam (acceptance #5)

`buildIntelligencePack(input)` is the composer: **pure, injectable, no filesystem / network / LLM**. The caller does the IO (read + parse `research-facts.json`, `ref-pack.json`, the benchmark set) and hands the parsed objects plus any intake-supplied facts in; the composer wires them into one validated pack (defaults filled, slug derived, output re-parsed). This keeps the schema layer testable without a project on disk and keeps the CLI/agent the only thing that touches the wire (AGENTS.md #1/#2).

The intended consumer is the production plan (#407) + the mode compiler (#412): instead of re-parsing scattered research files, they read `INTELLIGENCE_PACK.json` and call `missingRequirements(pack)`. A non-empty result drives the block/downgrade decision and the `benchmarkSource` (#407) cites the pack's pointers. Wiring the plan grader to consume the pack is the follow-up to this schema.

---

## 7. Eval integration seam (acceptance #6)

The product-fidelity (#422), claims (#442), platform (#443), and readiness gates should reference the **same pack** rather than re-reading research prose:

- Fidelity reads `pack.product` + `pack.refPack` (the locked references it must match).
- Claims reads `pack.claims` — both the proof points to feature and the `origin: inferred` / guardrail claims to avoid (the sotaocr "REST only, no Python SDK" failure-mode class).
- Platform reads `pack.platformConstraints` (typed aspect / duration / hook timing, each provenanced).
- Readiness reads `missingRequirements(pack)` as the pre-ship floor.

The schema and `parseIntelligencePack()` are in place; pointing each gate at the pack is the wiring step that follows.

---

## 8. Fixtures (acceptance #7)

The composer makes fixtures cheap — each scenario is a `buildIntelligencePack(...)` call, no disk needed. `tests/unit/intelligence-pack.test.ts` exercises the five scenarios the issue names:

- **Brand URL** — brand + competitor facts with `origin: crawled` (site-grounding) and a composed ref pack.
- **Product URL** — `product` facts + a locked `product` ref-pack entry; the commercial-mode requirement clears.
- **Generic niche** — a craft mode (`typography-animation`) with no required fields and an empty pack that still validates.
- **Source video** — covered by composing a `BenchmarkSet` / source-video ref into the pack.
- **Open-world unknown** — a pack with `origin: inferred`, low-confidence facts in `openRisks`, surfacing the unknowns before spend.

The tests also lock the defaults, the origin-required rule, the round-trip (including provenance/origin survival through `JSON.stringify`), the matrix derivation, and the empty-ref-pack-does-not-satisfy edge.

---

## What this does NOT decide

The Markdown-report renderer, the `ralphy intelligence` CLI verb (build / show / persist to `INTELLIGENCE_PACK.json`), and the concrete edits to the plan grader (#407) and the eval gates (#422/#442/#443) are all the wiring layer above this schema — deferred to the verb that owns persistence. The schema, the provenance contract, the required-intelligence matrix, and the pure composer are the committed surface; everything downstream wraps them without reshaping them.
