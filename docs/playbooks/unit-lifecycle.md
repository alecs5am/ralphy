# The Unit production lifecycle — chat request to packaged Unit

> **The single canonical lifecycle (#414).** This is the SUPERSET that integrates every landed piece into one opinionated path from a vague chat request to a polished, reusable Unit. It is **not a fork** — its phase backbone IS the [agent production contract](agent-production-contract.md) (`CONTRACT_PHASES` in `cli/lib/contract.ts`). The contract owns the phase order + per-phase artifacts; this doc is where producer / templater / evaluator / unit docs converge on ONE vocabulary so quality stops depending on the agent's taste and memory.

> **Agent-facing, machine-followable.** Chat is the user interface; `ralphy` is the runtime. The machine-readable half is `evaluateContract(projectId)` (alias `lifecycleStatus(projectId)`), surfaced as `ralphy project status <id> --contract` (alias `--lifecycle`). Self-check progress with it before claiming a project is done, and use its resume model to pick a project up mid-flight.

> **Integrated issues:** #406 (contract backbone) · #407 (production plan) · #408 (style/benchmark grounding) · #409 (eval→repair loop) · #411 (native-video validation + ship gate) · #412/#413 (content modes + supported bar) · #415 (council reviews) · #416 (research bootstrap) · #069 (Unit formation) · #117 (memory capture).

## Why one lifecycle

The raw ingredients already exist: intake, research, scenarios, generation, render, eval, repair, council, postmortem, templates, Unit packaging. The missing piece was a single lifecycle that says exactly how to move from a vague request to a polished Unit. Without it, the same prompt yields a weak one-off render, a strong reusable Unit, or an unfinished pile of assets depending on who handled it. This lifecycle gives every agent the same rails so the failure modes are structurally prevented, not re-learned per project.

## The phases (the contract backbone)

The 18 phases below are `CONTRACT_PHASES[].id` verbatim. Required artifacts, gates, and stop conditions per phase live in [`agent-production-contract.md`](agent-production-contract.md#the-phases-in-order); this table is the lifecycle map + the cheap-vs-native and stop-condition overlay.

| # | Phase id | Required artifact | Validation | Stop conditions it can raise |
|---|---|---|---|---|
| 1 | `intake` | `BRIEF.md` | — (chat) | — |
| 2 | `content-mode` | — (agent-driven) | `classifyContentMode()` | `mode-unsupported` (when the plan records an unsupported mode) |
| 3 | `format-template-match` | — (recorded in plan) | `ralphy template suggest --format <f>` | — |
| 4 | `memory-recall` | — (agent-driven) | `ralphy memory recall` | — |
| 5 | `reference-gate` | refs in `artifacts/refs/` | `ralphy ref check <id>` (offline) | `reference-required` |
| 6 | `research` | `artifacts/refs/research-facts.json` (or `research/report.md`) | `chooseResearchDepth` (deterministic) | — |
| 7 | `style-lock` | `STYLE_LOCK.md` | `ralphy project style-lock <id> --check` | — |
| 8 | `production-plan` | `PRODUCTION_PLAN.md` | `ralphy project plan` + **wait-for-go** | `user-approval-needed`, `estimate-exceeds-target` |
| 9 | `council-preflight` | `council-preflight.json` | `ralphy project council <id> --phase preflight` | — (a `block` verdict is surfaced in the verdict, not as a state stop) |
| 10 | `scenario` | `scenario.json` | `scoreScenario` (refuse-not-warn) | — |
| 11 | `prompts` | `prompts.json` | `scoreImage` / `scoreVideo` (draft) | — |
| 12 | `assets` | `asset-manifest.json` + `artifacts/<kind>/` | per-slot `scoreImage` / `scoreVideo` | — |
| 13 | `render` | `render/final.mp4` | `ralphy editor preflight` → `ralphy render` | — |
| 14 | `eval` | `eval.json` (+ `eval-report.md`) | **native-video gate** (`gate.shipReady`) | `quality-gate-failed`, `native-gate-required` |
| 15 | `repair` | `repair-plan.json` | `ralphy project repair-plan` (zero model calls) + approval | — |
| 16 | `council-polish` | `council-polish.json` | `ralphy project council <id> --phase polish` | — |
| 17 | `unit` | `units/<slug>/` + `unit.json` | `ralphy unit create` (gated on `polished`) | `native-gate-required` (until the gate is ship-ready) |
| 18 | `postmortem` | `postmortem/` | `/postmortem` → `ralphy memory distill` | — |

`scenario.json` is **not** required for `image-pack` projects (posters, carousels, fb-creative packs, sticker packs) — `evaluateContract()` relaxes it when it detects the image-pack shape.

## Cheap checks vs native-video validation (#411)

The lifecycle uses cheap, deterministic checks at every gate up to the render, then a **native** gate once an mp4 exists.

- **Cheap / deterministic (no paid model call where possible):** `classifyContentMode` and `chooseResearchDepth` (pure), `ralphy ref check` (offline classifier), `scoreScenario` / `scoreImage` / `scoreVideo` draft gates, `ralphy editor preflight`, and the `structure` / `keyframe` eval modes. The council passes are bounded text-only `callLLM()` reviews — no media, no browsing.
- **Native-video (the ship gate):** the `native-video` full-mp4 model pass (or `deep-style` when a style lock / brief exists) is the ONLY validation strong enough to mark a Unit polished. A `keyframe` / `structure` eval is a **diagnostic** — `eval.json` → `gate.shipReady` is hard-false on it (`cli/lib/eval/gate.ts`). Keyframe slicing misses temporal continuity, audio-picture alignment, pacing, and caption sync. The default final gate (no `--mode`) is native.

**A Unit is not polished/publishable unless `polished === true`** — i.e. the render passed the native-video gate (`gate.shipReady === true`) OR a logged user-approved bypass exists (#414 Acceptance #3).

## Stop conditions (derived from state, never chat memory)

`evaluateContract()` derives `stopConditions[]` from artifacts on disk. Each names the phase it gates, a `severity` (`block` | `warn`), and an agent-actionable `detail`:

| Stop id | Severity | Fires when |
|---|---|---|
| `reference-required` | block | The plan declares `requiredRefs` but `artifacts/refs/` is empty and no `--no-ref-consent` is logged (named-real-entity gate, AGENTS.md #3). |
| `mode-unsupported` | block | The plan's `contentMode.mode` is not a first-class route (`!isModeSupported`, #412/#413). Route to the closest supported mode or say it is not yet supported. |
| `estimate-exceeds-target` | warn | The plan's `estimate.wallClockMin` runs >50% over the single-video target (`docs/perf-targets.md`). Report to the user before starting. |
| `user-approval-needed` | block | The plan is written but no paid asset has run and no `skip:production-plan` waiver is logged — the wait-for-go spend gate is still open. |
| `quality-gate-failed` | block | `eval.json` verdict is `fail`. Run `ralphy project repair-plan`, get approval, re-roll, re-evaluate. |
| `native-gate-required` | block | A render exists but `polished !== true` — the native-video final gate has not passed (no eval, a cheap-mode eval, or a non-ship native verdict). |

A stop the user did NOT waive is not optional: clear it or refuse with a concrete ask. Bypasses are logged to `user-prompts.jsonl` / the plan's `bypasses[]` — see [contract bypass handling](agent-production-contract.md#bypass-handling-mandatory).

## The resume model

`ralphy project status <id> --contract` (alias `--lifecycle`) returns, alongside the per-phase ledger:

- `currentPhase` — the furthest satisfied phase (deepest on-disk trail point), or `null`.
- `nextPhase` / `nextStep` — the first unsatisfied artifact-bearing phase (the resume cursor) + a one-line instruction.
- `stopConditions[]` — the blocking / advisory conditions above.
- `polished` — `true` (native gate passed or user-approved bypass), `false` (render exists, gate not passed), or `null` (no eval yet).

This is what lets an agent resume after a context reset without re-reading the whole tree, and what the content-farm loop (#410) drives the next action from. It is guidance, not a wizard — it never prompts the user.

## Who owns which phase (one vocabulary)

Each role / skill executes a slice of this lifecycle; none defines a divergent sequence:

- [`intake`](../../.agents/skills/intake/SKILL.md) — phases 1-8 craft (clarifying questions, the plan, wait-for-go).
- [`research-bootstrap.md`](../../.agents/skills/researcher/references/research-bootstrap.md) — phase 6 (the depth decision + routing).
- [`producer`](../../.agents/skills/producer/SKILL.md) — the end-to-end wrapper that sequences the role phases + batch + cost rollup.
- [`scenarist`](../../.agents/skills/scenarist/SKILL.md) — phase 10. [`art-director`](../../.agents/skills/art-director/SKILL.md) — phases 11-12. [`editor`](../../.agents/skills/editor/SKILL.md) — phase 13.
- [`.agents/skills/evaluator/SKILL.md`](../../.agents/skills/evaluator/SKILL.md) — phase 14 (and the native-gate rule).
- [`.agents/skills/fixer/SKILL.md`](../../.agents/skills/fixer/SKILL.md) — phase 15.
- [`.agents/skills/templater/SKILL.md`](../../.agents/skills/templater/SKILL.md) — reads `units/*/unit.json` (phase 17) to extract + publish.
- [`.agents/skills/postmortem/SKILL.md`](../../.agents/skills/postmortem/SKILL.md) — phase 18.

## Cross-references

- [`agent-production-contract.md`](agent-production-contract.md) — the phase backbone (sequence, artifacts, bypass logging). This lifecycle reads it; the contract wins on order.
- [`docs/content-modes.md`](../content-modes.md) — the mode taxonomy phase 2 emits.
- `cli/lib/contract.ts` — `CONTRACT_PHASES` + `evaluateContract()` / `lifecycleStatus()`.
- `cli/lib/eval/gate.ts` — `report.gate.shipReady` (the native-video ship gate).
- `cli/lib/research-bootstrap.ts` · `cli/lib/council.ts` · `cli/lib/repair.ts` · `cli/lib/content-modes.ts` · `cli/lib/plan/build.ts` — the integrated landed pieces.
