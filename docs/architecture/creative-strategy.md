# Creative strategy and the variant market

> **Status:** schema + bridge shipped (`cli/lib/schemas/creative-strategy.ts`); no CLI verb yet (the artifact is agent-authored for now). This doc names the strategy layer that sits ABOVE generation and how it lowers into the existing #421 variant tournament.
> **Tracks:** [`../../notes/issues/done/456-creative-strategy-and-variant-market.md`](../../notes/issues/done/456-creative-strategy-and-variant-market.md)
> **Grounded as of:** 2026-06-23 against the live repo. Every code/path citation below was verified to exist (or noted as absent/planned) at that time.

Read [`../../CLAUDE.md`](../../CLAUDE.md) (the `.ralphy/` layout), [`../../AGENTS.md`](../../AGENTS.md) (the content-mode classifier + the hard invariants — especially #14 append-only), and [`../../cli/lib/schemas/variant-matrix.ts`](../../cli/lib/schemas/variant-matrix.ts) (the #421 tournament) for the surrounding context.

The thesis from #456: **the content-farm goal is not one perfect output — it is many controlled, purposeful attempts with a system for choosing winners.** #421 already owns the tournament (rank variants, pick a champion, preserve losers). What was missing is the layer that says WHY we are spending money. Without it, variants are random volume instead of experiments.

---

## 1. The strategy artifact

`CreativeStrategy` (`cli/lib/schemas/creative-strategy.ts`) is the plan-of-intent written BEFORE generation. It carries the fields a creative experiment needs to be purposeful:

- **audience** — one or more `AudienceSegment`s (label, pain point, platform). First is primary; the farm allocates budget across segments.
- **offer** — the value proposition being communicated.
- **hypothesis** — the testable, batch-level claim the experiment exists to validate ("a problem-mirror hook beats a benefit hook for cold devs"). This is the spine: winning variants prove or refute it.
- **angle / hook / proof / objection / cta** — the creative through-line and its parts.
- **contentMode** — the `CONTENT_MODES_LIST` id (#412) this strategy produces for. Free-form string so the schema does not import the mode registry; #5 below lists the supported set.
- **variantAxes** — the axes to vary (see §3), each with its own hypothesis and slot count.
- **successCriteria** — the bar variants clear before a champion is declared; maps onto the readiness verdict vocabulary in `scorecard.ts` (#427).
- **history** — accumulated `WinnerFeedback` from prior batches, newest-first (see §4). Append-only.

Schema style mirrors `cli/lib/schemas/{workflow,variant-matrix,scorecard}.ts`: a Zod object with inline-doc comments, exported `z.infer` types, sane `.default()`s so a partial capture still parses, and `parseCreativeStrategy()`. English-only-on-disk. The durable filename is `creative-strategy.json` (`CREATIVE_STRATEGY_FILENAME`), persisted project- or batch-side under the append-only contract (#14).

---

## 2. The variant-matrix bridge

`strategyToVariantMatrix(strategy, perSlotCostUsd)` lowers a strategy into a VALID #421 `VariantMatrix` the tournament (`ralphy batch tournament`) executes. This is the §"variant matrix" seam: it does NOT duplicate the #421 schema — it EMITS it.

Each strategy `variantAxis` becomes one matrix `VariantAxis`, mapped onto the REAL field names in `variant-matrix.ts`:

| Strategy field | → `VariantAxis` field | How |
|---|---|---|
| `kind` | `axis` | the closed-vocabulary axis kind, written as the matrix's free-form `axis` label |
| `hypothesis` | `hypothesis` | per-axis claim; falls back to the strategy's top-level `hypothesis` |
| `slots` (a count) | `slots` (string names) | generated `<baseId>-<axis>-<n>` slot names, 1-based, one per intended variant |
| — | `expectedCostUsd` | `slots.length × perSlotCostUsd` (the #421 estimate idiom) |

The matrix top level fills `baseId`, `generatedAt`, `axes`, and `totalExpectedCostUsd` (the sum across axes). The output is parsed THROUGH `VariantMatrixSchema.parse(...)`, so the function provably returns a valid matrix — the unit test re-parses it through the real schema to prove compatibility.

`successCriteria` is NOT a field on the #421 schema, so the bridge does not invent one; the agent reads `strategy.successCriteria` alongside the matrix when it sets up the tournament's eval pass.

---

## 3. Variant axes (the controlled-variation vocabulary)

`VARIANT_AXIS_KINDS` is the closed set of axes a batch may vary: `hook`, `persona`, `style`, `cta`, `first-frame`, `music`, `platform`. The strategy layer constrains axes to this vocabulary (where #421's matrix accepts any free-form label) so:

- the pre-generation review (§5) can reason about coverage — "you are varying hook and style but the hypothesis is about persona";
- the bridge emits predictable slot names the tournament and the batch-review (#410) can attribute wins to;
- `WinnerFeedback.winningAxis` can name where the champion's edge came from from the same vocabulary.

An axis carries `slots` (how many variants to fan into; default 2) and optional `options` (the concrete values, when known up front).

---

## 4. The winner-feedback loop

`applyWinnerFeedback(strategy, feedback)` is a PURE update (returns a new strategy, never mutates — AGENTS.md #14 spirit) that closes the loop after a tournament runs:

- `WinnerFeedback` carries the `champion`, the `winningAxis`, a one-line `winRationale`, the preserved `losers` (each a `LosingRationale` with `variantId` + `axis` + the reason it lost — mirroring the #421 `TournamentLoser`), and `nextBatchSuggestions`.
- The update **prepends** the feedback to `strategy.history` (newest-first), **annotates** the winning axis's hypothesis as `confirmed: <winRationale>` so the next batch can double down, and **folds** `nextBatchSuggestions` into `successCriteria` (additive, deduped) so the next planning pass inherits them.

It deliberately does NOT re-roll axes or change slot counts — that is the next planning pass's call, made by reading `history`. This function only RECORDS the learning. The loop is: strategy → `strategyToVariantMatrix` → #421 tournament → `TournamentResult` → distil into `WinnerFeedback` → `applyWinnerFeedback` → next strategy.

---

## 5. Mode support

The strategy is mode-aware via `contentMode`. The five modes #456 §5 requires are covered — each is a real `CONTENT_MODES_LIST` id (`cli/lib/content-modes.ts`) and each has a natural axis emphasis:

| Mode | Primary axes the strategy tends to vary |
|---|---|
| `ad-creative-pack` | `hook`, `style`, `cta` — the FB 5-set scaffold is itself a style axis |
| `ugc-review` | `persona`, `hook` — the creator archetype and the problem-mirror open |
| `social-carousel` | `style`, `hook` — the cover aesthetic and the swipe-one hook |
| `product-shot` | `style`, `first-frame` — background / lighting register and the lead still |
| `personal-clipper` | `hook`, `platform` — the clip's cold-open and the target placement |

`personal-clipper` is an UNSUPPORTED first-class route today (`isModeSupported("personal-clipper") === false`, no clipper verb yet). The strategy schema still ACCEPTS it as a `contentMode` so the agent can author a strategy for it, but the same #413 promise gate applies downstream: do not promise a `personal-clipper` deliverable until the route lands (#058). The schema does not import the mode registry, so adding a mode there is automatically authorable here.

---

## 6. Pre-generation review seam

#456 §3 wants a weak strategy rejected BEFORE media spend. The strategy artifact is the input to the two review primitives that already exist — no new gate is introduced:

- **Council preflight** (`ralphy project council <id> --phase preflight`, #415) fans bounded `callLLM()` roles over the production plan before paid generation and emits a `ship | revise | block` verdict. A `CreativeStrategy` is the natural extra input: the strategist / performance-marketer roles grade the hypothesis and axis coverage, and a `block` stops the spend.
- **Plan grader** (the production-plan benchmark/grader path, #407) is the deterministic counterpart — it can assert a strategy has a non-empty hypothesis, at least one variant axis, and success criteria before the matrix is generated.

Both read the same `successCriteria` and map onto the `scorecard.ts` verdict vocabulary (`ship | repair | needs-user-decision | blocked`, #427), so the strategy review and the post-render readiness call speak one language. The review is advisory-with-a-hard-block, exactly as council is today (AGENTS.md #4 — gates refuse, not warn).

---

## 7. Performance-extension seam

#456 §6 asks WHERE future platform metrics would be imported, without requiring any platform integration now. The seam is the winner-feedback loop (§4), not a new schema:

- Today `WinnerFeedback` is sourced from the in-house `TournamentResult` (eval / council scores). The `champion` + `winningAxis` + `winRationale` are filled from the scorer.
- A future platform-metrics importer (real CTR / hold-rate / CPA per published variant, #424 telemetry territory) lands at exactly the same seam: it produces a `WinnerFeedback` from observed performance instead of from the eval scorer, and `applyWinnerFeedback` folds it back with no schema change. The `LosingRationale.rationale` becomes "lost on CPA" instead of "lost on eval clarity".
- This keeps the first pass purely local + eval-driven while the metric-fed loop is a drop-in replacement for the feedback SOURCE, not a reshape of the strategy. The managed-cloud seam (`cloud-factory-design-seam.md` §4 Spend/Artifact) is where that importer would eventually live; the artifact contract here is already storage-agnostic enough to carry it.

---

## What this does NOT decide

No CLI verb, no auto-generation of the strategy from a brief, no platform API, no spend-ledger enforcement (#444), and no change to the #421 tournament schema. The only commitments are: keep the strategy a parseable append-only artifact, keep the bridge emitting the REAL `VariantMatrix`, keep the feedback loop pure, and keep the review/metric seams pointed at council/plan-grader and the feedback source respectively.
