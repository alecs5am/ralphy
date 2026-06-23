# Quality flywheel orchestrator — design

> **Status:** built. The merge engine, verdict precedence, and handoffs already exist; #457 added the named gate registry (`gatesForContext`) and the cross-cutting fixtures. This doc describes the flywheel AS IT EXISTS.
> **Tracks:** [`../../notes/issues/done/457-quality-flywheel-orchestrator.md`](../../notes/issues/done/457-quality-flywheel-orchestrator.md) (moves to `notes/issues/done/` on close)
> **Grounded as of:** 2026-06-23 against the live repo. Path/primitive citations below were verified to exist at that time.

Read [`../../AGENTS.md`](../../AGENTS.md) (the hard invariants — especially #4 "quality gates refuse, not warn" and #14 append-only) and [`../../CLAUDE.md`](../../CLAUDE.md) (the `.ralphy/` layout) for the surrounding context.

---

## 1. Goal

Quality cannot depend on an agent remembering every gate. The flywheel runs the gates RELEVANT to a Unit, merges their findings into ONE readiness verdict, and triggers the repair + lesson handoffs when the Unit is not shippable — so a low-tech user gets a polished result and the system learns from concrete failures. It is BOUNDED: explicit retry budgets, a hard paid-spend gate, no endless critique loop.

The flywheel is not one monolith. It is a thin orchestration over primitives that each already exist: a gate registry that NAMES the relevant gates, the per-gate critics that PRODUCE reports, a deterministic AGGREGATOR that MERGES them, and two HANDOFFS (repair, lessons) that consume the merged result.

---

## 2. The loop

```
context (mode / format / platform)
        │
        ▼
  gatesForContext()            ── §3 registry: WHICH gates apply
        │
        ▼
  run the applicable gates     ── §4 critics: persist eval.json / fidelity.json / …
        │
        ▼
  buildScorecard()             ── §5 merge: ONE mode-aware verdict
        │
   ┌────┴─────────────────────────────┐
   ▼          ▼            ▼            ▼
 ship      repair   needs-user-     blocked
            │       decision           │
            ▼                          ▼
   repair-plan (#409)        repair-plan / lessons-route (#425)
```

Every box is a pure / best-effort step that makes ZERO model calls except the per-gate critics (§4) and the lessons router (§6). The merge (§5) and the registry (§3) never spend.

---

## 3. The gate registry (acceptance #1)

`gatesForContext(mode, format, platform)` in [`../../cli/lib/eval/gate.ts`](../../cli/lib/eval/gate.ts) is the SINGLE named source of truth for which gates apply. It returns every gate in `QUALITY_GATES` with an `applicable` flag and a one-line reason, plus the convenience `applicable[]` list.

It is PURE and composes the existing predicates — it re-implements NONE of them, so adding a commercial / baked-text / lock-required mode to the registry updates the applicable set automatically:

| Gate | Applies when | Predicate (existing) |
|---|---|---|
| `native-video` | always (every render) | — |
| `structure` | always (every render) | — |
| `first-frame-hook` (#440) | video formats (`video`, `motion-design`; `null` → treated as video) | `VIDEO_FORMATS` |
| `captions` (#441) | video formats | `VIDEO_FORMATS` |
| `product-fidelity` (#422) | commercial modes | `requiresFidelityGate()` (content-modes.ts) |
| `claims` (#442) | commercial modes | `requiresFidelityGate()` |
| `ocr` (#439) | baked-text modes | `hasBakedText()` (content-modes.ts) |
| `platform-spec` (#443) | a known target platform is declared | `isPlatformKey()` (platform.ts) |
| `distribution-pack` (#423) | advisory — always considered | — |
| `council` (#415) | advisory — always considered | — |

A style-lock requirement (`requiresStyleLock()`, style-lock.ts) is NOT a runnable gate — it is the `styleFit` scorecard dimension keyed off `STYLE_LOCK.md` presence. The registry threads that requirement into the `native-video` gate's reason so the agent still sees a lock is needed for the context.

The registry NAMES the relevant set; it does NOT re-decide ship/repair/blocked. That precedence is the scorecard's (§5), and `gatesForContext` deliberately holds none of it.

---

## 4. The critics (the gates themselves)

Each gate is a focused critic that probes the final media and persists an append-only report into the project dir. They are the source artifacts the merge reads — the flywheel does not re-run them.

| Gate | Verb | Report | Notes |
|---|---|---|---|
| native-video / structure / hook-zone / pacing / audio / caption-density | `ralphy eval video` | `eval.json` (+ `eval-deep-vision.json`) | [`cli/lib/eval/orchestrator.ts`](../../cli/lib/eval/orchestrator.ts); the native full-mp4 mode is the ONLY gate that can mark a Unit polished ([`gate.ts → resolveGate`](../../cli/lib/eval/gate.ts)). |
| product/brand fidelity | `ralphy eval fidelity` | `fidelity.json` | commercial modes only. |
| OCR / text-legibility | `ralphy eval ocr` | `text-legibility.json` | baked-text modes only. |
| first-frame hook | `ralphy eval hook` | `hook.json` | enriches the `hook` dimension. |
| caption sync/readability | `ralphy eval captions` | `captions-gate.json` | enriches the `captions` dimension. |
| claims/policy | `ralphy eval claims` | `claims.json` | commercial modes only. |
| platform upload spec | `ralphy eval platform` | `platform-spec.json` | mostly deterministic; enriches `platformFit`. [`cli/lib/eval/platform.ts`](../../cli/lib/eval/platform.ts). |
| polish council | `ralphy project council --phase polish` | `council-polish.json` | advisory market-fit second opinion. |
| distribution pack | `ralphy unit package` | `distribution-pack.json` | publish-copy readiness. |

A missing report makes its dimension `na` (non-gating), never a crash — the merge is best-effort by design.

---

## 5. The merge + verdict precedence (acceptances #2, #3, #4)

`buildScorecard({ projectId, mode? })` in [`../../cli/lib/scorecard.ts`](../../cli/lib/scorecard.ts) is the single agent-facing entry — surfaced as `ralphy project scorecard <id>` ([`cli/commands/project.ts`](../../cli/commands/project.ts) ~line 1050). It is a PURE, best-effort file read: it ingests the §4 reports + the contract's `polished` determination and merges them into ONE mode-aware [`ReadinessScorecard`](../../cli/lib/schemas/scorecard.ts). It re-runs no gate and makes ZERO model calls.

**Finding merge (acceptance #3).** Each source maps to a named dimension (`SCORECARD_DIMENSIONS`): a `fail` finding → fail (40), any `warn` → warn (70), else pass (95). The focused critics (hook / captions / platform-spec) ENRICH the eval-derived dimension rather than creating a parallel one — worst status wins (`worseStatus`). A leftover finding outside every named dimension surfaces under `residualRisk` so nothing slips through silently.

**Readiness verdict (acceptance #4).** `decide()` is deterministic, first-match-wins, and documented inline:

1. **blocked** — any HARD blocker: `fidelity.blocksShip`, `text-legibility.blocksShip`, `claims.blocksShip`, council `block`, eval `scoring.verdict === "fail"`, OR a required dimension is `fail` (incl. `technicalPolish` fail when a render exists but the native gate hasn't passed).
2. **repair** — a fixable `warn` on any dimension, with no hard blocker.
3. **needs-user-decision** — no blocker, no warn, but a REQUIRED dimension is `na` (unverifiable — e.g. nothing rendered/evaluated yet). The agent must surface this gap, not guess `ship`.
4. **ship** — every required dimension passes.

This satisfies AGENTS.md #4 (gates refuse, not warn): a failed quality gate yields `blocked`, never a soft pass. The mode-aware required set (`requiredDimensionsForMode` + the per-gate `applicable` flags) keeps the gate selection consistent with §3 without the scorecard re-deriving the commercial / baked-text partitions — it reads each gate's own `applicable` flag at merge time.

---

## 6. The handoffs (acceptances #5, #6)

**Repair (#409, acceptance #5).** A `repair` / `blocked` verdict (or any `fail`/`warn` dimension) hands off to `ralphy project repair-plan <id>` ([`cli/lib/repair.ts → buildRepairPlan`](../../cli/lib/repair.ts)). It reads `eval.json` (+ deep-vision `what_to_redo` first), classifies each finding by owner (art-director / scenarist / editor), orders by severity, and emits an ordered plan. Spend rules are preserved STRUCTURALLY: every item is born `approvalState: "pending"`, `costEstimate === 0` for free editor/scenarist fixes and `> 0` for paid art-director re-rolls. The fixer never spends before user approval.

**Per-stage bounded loop (#473).** [`cli/lib/eval/stage-loop.ts → runStageRepairLoop`](../../cli/lib/eval/stage-loop.ts) is the BOUNDED eval → repair → re-eval cycle the universe-studio flow calls per stage. Two hard invariants from the issue: a `retryBudget` (default 3) caps the cycles — NO unbounded loops; and a paid item without `batchApproved` short-circuits BEFORE any `applyFix` (the paid gate, enforced structurally). Free fixes auto-loop; paid regen stops for approval.

**Lesson routing (#425, acceptance #6).** When a failure is durable (not a one-off), `ralphy lessons route <project>` ([`cli/lib/lessons/router.ts → routeFailureLessons`](../../cli/lib/lessons/router.ts)) assembles postmortem files + `eval.json` + `repair-plan.json` + council reports + gen-log error rows into one LLM context and routes each lesson to one of 8 destinations (memory | guideline | MODELS.md | content-mode | template | skill | cli-issue | drop). Only `memory` proposals stage (into `proposed/`, never auto-approve); every other route is report-only. This is the "improve future runs from concrete failures" half of the flywheel — a repeated failure lands in durable knowledge rather than being buried in a one-off report.

---

## 7. Bounded budgets

- **Retry budget.** `runStageRepairLoop` caps eval→repair→re-eval at `retryBudget` (default 3). Budget exhausted → the latest verdict + residual actions surface to the user; never an infinite loop.
- **Paid gate.** Any `costEstimate > 0` item stops for explicit approval unless `batchApproved`. The library never spends directly — it delegates to an injectable `applyFix`, and the gate fires BEFORE that delegate. The planned hard ceiling is the spend ledger (#444).
- **Refuse, not warn.** A twice-failed quality gate is a `blocked` verdict (AGENTS.md #4) — no mp4 ships over a failed gate.

---

## 8. What's wired vs aspirational

**Wired today:**
- The named gate registry — `gatesForContext` ([`gate.ts`](../../cli/lib/eval/gate.ts)).
- The merge + mode-aware verdict — `buildScorecard` ([`scorecard.ts`](../../cli/lib/scorecard.ts)), driven by `ralphy project scorecard`.
- All the per-gate critics in §4 and their append-only reports.
- The repair handoff (`repair-plan`), the bounded per-stage loop (`stage-loop.ts`), and the lesson router (`lessons route`).
- Fixtures-backed coverage: [`tests/unit/scorecard.test.ts`](../../tests/unit/scorecard.test.ts) (the merge) and [`tests/unit/quality-flywheel.test.ts`](../../tests/unit/quality-flywheel.test.ts) (the registry + the three ship/repair/blocked fixtures end-to-end).

**Aspirational / partial:**
- **No single "run all relevant gates" command.** `gatesForContext` NAMES the set, but the agent (or the universe-studio skill) still invokes each `ralphy eval <gate>` and then `ralphy project scorecard`. There is no one verb that fans out the registry's `applicable[]` and runs each critic — the flywheel is composed by the orchestrating skill, not a single CLI entry. Adding one would be a thin wrapper over `gatesForContext` + the existing verbs; it is deliberately NOT added here to avoid a redundant orchestration layer.
- **Lesson-repeat detection is LLM-judged, not counted.** Acceptance #6 says "when the same failure repeats, hand off to #425." The router reads the assembled sources and the model decides durability; there is no deterministic repeat-counter across runs that auto-fires the handoff. The signal is the agent / postmortem invoking `lessons route`, not an automatic trigger.
- **Spend ledger (#444) is the planned hard ceiling.** The paid gate is enforced per-item structurally today; a cumulative per-project/workspace budget cap is the #444 work, consulted by `ralphy generate` rather than the flywheel.

---

## What this does NOT decide

The flywheel does not own gate THRESHOLDS (each critic owns its own), the deep-vision MODEL (MODELS.md), or whether a new top-level "run the whole flywheel" verb should exist (deferred — see §8). The only commitment is: the registry names the gates, the scorecard owns the verdict precedence, and the repair + lesson handoffs consume the merged result — keep those three seams clean and the flywheel stays a composition, not a monolith.
