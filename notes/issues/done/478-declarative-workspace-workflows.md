# Declarative workspace workflows (ComfyUI-style staged pipelines)

> **Status:** done — 2026-06-23
> **Filed:** 2026-06-22
> **Folder:** issues
> **Severity:** high
> **Category:** orchestration / workspace / studio

## Context

A workspace owner wants to open Studio, type a video idea, and have Ralphy walk
a defined, configurable sequence of steps to produce the video — generating
several variants on some steps, using different models, taking the workspace's
custom evaluators into account, retrying when a gate fails, and stopping for
approval on steps that are flagged manual while auto-advancing the rest. The
mental model the user reached for is "ComfyUI workflows", scoped per workspace
(silent-hill is the worked example).

This is the declarative, configurable, Studio-visible version of what the
`/universe-studio` skill (#474) already does as prose. Most of the runtime
substrate already exists:

- `CONTRACT_PHASES` + `evaluateContract()` (`cli/lib/contract.ts`) — the fixed
  ordered production spine and the `--contract` ledger.
- `stageGates` in `evaluators.json` (`cli/lib/schemas/workspace-evaluators.ts`)
  — already a declarative per-workspace `stage -> phase -> criteria -> severity`
  map. silent-hill has a real one (location/cast -> scenario -> anchors ->
  montage).
- `runStageRepairLoop` (`cli/lib/eval/stage-loop.ts`) — bounded
  assemble/eval/repair with the free-auto / paid-stop split keyed on
  `RepairItem.costEstimate`, and injectable `StageEvalFn` / `ApplyFixFn` seams.
- The job queue + daemon (`ralphy queue`, `submitBatchFromFile`,
  `.ralphy/jobs.db`) — already does a DAG with `depends_on`, parallelism, retry,
  logs. Fan-out (N variants x models) compiles to parallel jobs.
- Studio (`studio/`) — tiny, zero-deps, read-only; today reads only the
  `artifacts/` media tree.

## What

Generalize `stageGates` into a per-workspace `workflow.json`: a named, ordered
list of steps where each step is pinned to a contract phase and carries an
engine, model(s), variant count, eval gate (criteria from `evaluators.json`),
an `auto | approve` mode, and a bounded repair config. A driver-agnostic runner
executes the workflow; a read-only Studio lane visualizes its definition and
live status.

## Decisions (taken with the user 2026-06-22)

- **D-1 Graph model: linear pipeline + fan-out, NOT a free-form node graph.**
  Steps are an ordered list pinned to contract phases; branching exists only at
  variant fan-out points. Studio still renders it as a node chain (the ComfyUI
  *feel*), but the engine stays simple and reuses `stageGates` + the queue.
- **D-2 Studio v1 is a read-only live lane.** Render `workflow.json` + run
  status (current step, variants, gate verdicts, "waiting for approval") from
  `jobs.db` + `workspace-eval.json` + the contract ledger. Run/edit stay in
  chat. A visual node editor is deferred (it breaks Studio's zero-deps + the
  read-only invariant #14).
- **D-3 Driver-agnostic runner; agent-in-chat is the v1 driver.** Creative
  steps (scenario, art direction, picking the best variant) need an LLM in the
  loop, so Claude Code orchestrates today; mechanical fan-out (variants, render,
  eval) is dispatched to the queue/daemon. The runner must keep a clean seam so
  a headless `callLLM()`-backed driver (OpenRouter) can drive the same
  `workflow.json` later for full automation — the user explicitly wants that
  future path.

## Why it matters

Today the staged flow is prose in a skill: a user cannot say "on step 3 give me
3 variants across two models, step 4 auto, step 5 stop for me", and Studio is
blind to production state. A declarative workflow turns the universe into a
reusable, inspectable, partially-automated production line — the core
"turn your coding agent into a content farm" promise, made concrete and visible.

## Scope / acceptance

Phased; each phase ships independently.

### Phase 1 — schema + authoring — LANDED 2026-06-22
`cli/lib/schemas/workflow.ts` (schema + lazy phase refine), `cli/lib/workflow.ts`
(load + gate validation + `deriveDefaultWorkflow`), `cli/commands/workflow.ts`
(`init` / `list` / `show`), `workflowsDir()` in paths, registered in `index.ts`,
`tests/unit/workflow.test.ts`. Full lint + 2510-test suite green. Phases 2-3 open.
1. `cli/lib/schemas/workflow.ts` (Zod, in the style of
   `schemas/workspace-evaluators.ts` / `schemas/production-contract.ts`). A step:
   `{ id, label, phase (pinned to CONTRACT_PHASE_IDS via a lazy .refine() to
   dodge the circular-import trap), owner?, engine
   (llm | generate.image | generate.video | generate.voiceover | generate.music
   | render | eval), model?, models?[], variants (default 1), gate (criteria
   ids), mode (auto | approve, default approve), repair { retryBudget,
   batchApproved } }`. Top-level: `{ version, name, steps[] }`.
2. Storage: `.ralphy/workspaces/<ws>/workflows/<name>.json`. Add
   `workflowsDir(slug)` to `cli/lib/paths.ts`; load via the sibling-file pattern
   of `loadWorkspaceEvaluators`.
3. `cli/commands/workflow.ts` (`workflowCmd()`, registered in `cli/index.ts`,
   modeled on `workspace.ts`: parent + subcommands, `requireRalphyLayout`, `out`
   / `raiseError`, `SLUG_RE`). Verbs: `init` (scaffold a default), `list`,
   `show`.
4. **Default derivation.** When a workspace has no hand-authored workflow,
   derive one from the matched content-mode's `roleChain` +
   `implementationUnit.cliVerbs` + `qualityGates` + the workspace `stageGates`,
   so every workspace gets a sensible default for free.
5. Gate criteria ids must validate against the workspace `evaluators.json`
   criteria; an unknown id is a load error.

### Phase 2 — runner + status ledger — LANDED 2026-06-22
`evaluateWorkflow` in `cli/lib/workflow.ts` (pure derivation over the contract
ledger + workspace-eval.json + jobs.db — mirrors `evaluateContract`, no separate
state file), `ralphy workflow status <project>` + `ralphy workflow run <project>
--idea` (logs the idea, surfaces the current step + next action, NEVER spends —
the agent / a future headless callLLM() driver executes the surfaced step). The
bounded repair loop + queue fan-out are REUSED (existing `runStageRepairLoop` /
`ralphy queue`), not re-implemented. Tests in `tests/unit/workflow.test.ts`.
6. Driver-agnostic runner core: a pure step sequencer with injectable
   `assemble` / `eval` / `apply` seams (reuse `runStageRepairLoop`'s pattern).
   v1 driver = agent-in-chat (a `/workflow-run` skill or an extension of
   `/universe-studio`); the runner library must NOT hardcode "the agent" so a
   `callLLM()` driver can be added without a rewrite.
7. Fan-out steps compile to `BatchSpecJob[]` for `submitBatchFromFile` (variant
   x model -> parallel jobs with `depends_on`), reusing the daemon wholesale
   rather than writing a new executor. Generation steps go through the CLI verb
   / queue (NOT the raw connectors) to preserve gen-log, spend, auto-version,
   and asset-manifest invariants.
8. Gated steps run `runWorkspaceEval` filtered to the step's criteria, then the
   bounded repair loop: free fixes auto-apply, paid regen stops for approval
   (verbatim reuse of the `costEstimate` split). `mode: approve` always stops
   and presents (variant picker on fan-out steps).
9. `ralphy workflow status <project>` — a pure `evaluateWorkflow(...)` mirroring
   `evaluateContract`: per-step `{ status: done | running | waiting | queued |
   blocked, variants, gateVerdict }`, derived from `jobs.db` +
   `workspace-eval.json` + the contract ledger. JSON default, `-p` pretty.

### Phase 3 — Studio read-only lane — LANDED 2026-06-22
`readWorkflowLane` in `studio/server/lib.ts` (self-contained derivation, no cli/
import — same boundary as ARTIFACT_KINDS; reads workflow.json + artifact presence
+ workspace-eval.json; no jobs.db so no transient "running" in Studio), route
`GET /api/projects/:id/workflow`, a vertical node-chain lane in `studio/src/app.js`
+ `app.css` (house style: tint+shadow, no borders, no neon) with an idea box that
copies the `ralphy workflow run` command (preserves read-only), live via the
existing fs.watch WebSocket. Verified rendering against the real silent-hill
workspace. Tests in `studio/test/server.test.ts`.
10. New read function in `studio/server/lib.ts` (e.g. `readWorkflow(dataRoot, ws,
    id)`) + a `GET /api/projects/:id/workflow` route in `studio/server/index.ts`,
    `safeProjectFile`-guarded, following the existing route + fixture-test
    pattern (`studio/test/server.test.ts`). Server stays read-only.
11. A workflow lane view in `studio/src/app.js` + CSS: vertical node chain, each
    node showing engine/model, variant count, gate chips, auto/approve badge,
    and live status; "waiting for your approval" highlighted. Honor the house
    style (no visible 1px borders -> tint+shadow+spacing; no neon). Re-sync
    tokens by hand per the existing `tokens.css` convention. Live updates via the
    existing per-project `fs.watch` WebSocket.
12. Idea entry box in Studio emits the exact `ralphy workflow run ... --idea
    "..."` invocation / chat message (preserves read-only; no write path in v1).

### Tests
13. Schema round-trip + bad-criterion rejection; default-derivation from a
    content mode; `evaluateWorkflow` against a seeded `.ralphy/` fixture (queued
    / running / waiting / done states); Studio route smoke test following
    `studio/test/server.test.ts`.

### Phase 4 — Studio workflow node-canvas + routing — LANDED 2026-06-22
The project's main UI is a ComfyUI-style WORKFLOW BOARD (user overrode the
earlier D-2 "structured grid" after seeing it — a per-project scene-grid was the
wrong abstraction). Hash routing (`#<ws>/<project>`, refresh-safe) remembers the
selection. The board = a pan/zoom canvas where each workflow step (from
`readWorkflowLane`) is a draggable NODE connected by bezier EDGES, with status /
gate / mode on the node. The anchor-generation node (phase `assets`) EXPANDS to
the scene-variant picker: scenes derived live from `artifacts/images/` by the
`scene-NN` convention (no migration), each scene's variants in a row, the chosen
one highlighted, click-to-choose. Two board mutations persist to a project-local
`board.json`, both metadata-only (never media → invariant #14 honored, framing in
`studio/server/*` + CLAUDE.md updated): `POST /board/choose` (`chosen[scene]`)
and `POST /board/layout` (`layout[node]={x,y}`). Topbar `board | files` tabs.
`studio/server/lib.ts` `readBoard`/`writeBoardChoice`/`writeBoardLayout`, routes
in `index.ts`, canvas UI in `studio/src/{app.js,app.css,index.html}`, tests in
`studio/test/server.test.ts` (23 pass). Verified in-browser on real silent-hill
projects: 6 workflow nodes + edges, the assets node expands to 17 scenes / 61
variants, click-choose + node-drag persist. The free-form branch EDGES (yes/no
forks drawn between scenes) remain the Future item below; the canvas + per-node
variant picker is done.

## Future (out of scope, capture only)
- Headless `callLLM()` (OpenRouter) driver that orchestrates creative steps for
  full automation — the second driver behind the same `workflow.json`.
- Studio visual node editor (drag/wire/save) — needs a graph lib (breaks
  zero-deps) and a guarded write path (deliberate departure from invariant #14).

## Dependencies and linked work
- universe-studio orchestrator skill (the prose precursor): #474.
- Quality flywheel orchestrator (shares the gate-merge / readiness vocab): #457.
- Readiness scorecard verdict vocab (#427); repair loop (#409); council (#415).
- Workspace evaluators framework + silent-hill instance: #468-#477, #471.

## Notes
- Lazy / correct path: this is mostly *config + a thin runner over existing
  primitives*, not a new engine. Resist building a general graph runtime —
  D-1 keeps it a pinned-phase pipeline.
- Keep the runner bounded: explicit `retryBudget`, no endless loops, user
  approval before any paid regen (same gate as the fixer / stage loop).
- `workflow.json` is per-workspace and reusable across its projects; a project
  records which workflow + which step it is on so `workflow status` and Studio
  can resume.
