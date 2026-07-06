---
name: workspace-export
namespace: user
description: >-
  Agent-facing wrapper for the workspace bundle (#502): package a TRAINED workspace as a deployable zip a farm server can import and run. Checks export-readiness FIRST (`evaluators.json` present, at least one #498 graph workflow, `ralphy workflow lint <ws>` green, compositions parametrized where the graph references them), then runs `ralphy workspace export <ws>`. When export refuses, relays the structured gap list verbatim (one `{id, detail, fix}` per gap) and drives the fixes. Also owns the import side — `ralphy workspace import <zip> [--as <slug>]` with its validation semantics (`--allow-missing-keys` / `--allow-coverage-gaps`) — and the #506 server handoff (import on the docker host or via the dashboard, then `ralphy farm start`).
  USE WHEN the user says "export the workspace", "make it deployable", "package the template for the server", "make a bundle", "bundle the workspace", "ship my workspace to the farm", "import this bundle", "deploy my channel to a server".
  See body for ALSO FIRE / DO NOT FIRE / HARD INVARIANTS.
---

# workspace-export — the deployable workspace bundle (#502)

A trained workspace is know-how: graph workflows, slot-templated prompts, parametrized compositions, the evaluator rubric, recurring calendar slots, shared refs. The bundle zips exactly that — and nothing else — so a farm server (or another user) can `ralphy workspace import` it and `ralphy farm start` it. **Your input is a workspace slug; your output is a validated `*-bundle-v*.zip` (or the concrete gap list standing between the workspace and one).** Format doc: [`docs/workspace-bundle.md`](../../../docs/workspace-bundle.md).

## ALSO FIRE

- After a farm-mode training run stabilizes ("the last three units all cleared the rubric") and the user wants to move production off their laptop — offer the export.
- When the user hands you a `*.zip` bundle and asks to "set it up" / "run this template" — that is the import side of this same skill.

## DO NOT FIRE

- **Publishing units / blocks to the content library** — that is [`templater`](../templater/SKILL.md) → `landing/scripts/publish-entity.ts` (#056). The library makes know-how browsable; the bundle makes a channel runnable. Two different exits — see templater's "Two exits" section.
- **Forming a deliverable** — that is `ralphy unit create` (#069).
- **Promoting one project into a workspace-tier template** — that is `ralphy template extract`.
- **Starting / stopping the farm itself** — that is `ralphy farm start|status|stop` (#503, producer playbook farm section); this skill only hands off to it.

## HARD INVARIANTS

1. **`ralphy` is the only entry-point.** Export via `ralphy workspace export`, import via `ralphy workspace import` — never hand-zip a workspace dir or hand-unpack a bundle into `.ralphy/` (AGENTS.md #2).
2. **Export is read-only over the source workspace** and never overwrites an existing `--out` zip (`E_ALREADY_EXISTS` — the system `zip` would update in place, so a fresh path is required).
3. **Import never overwrites an existing workspace.** A slug collision refuses; `--as <new-slug>` is the only path. Never delete a workspace to make room.
4. **Media hygiene: project artifacts and logs are NEVER bundled.** The bundle is know-how, not history. Do not try to smuggle project media into `refs/`; dated calendar entries (production state) are never bundled either — only recurring slots travel.

## Workflow

### 1. Check export-readiness FIRST (free, before running anything)

The CLI enforces the hard gaps, but check them up front so you can present a plan instead of a refusal:

- **Evaluators present** — the workspace has `<ws>/evaluators.json` (plus `STYLE_LOCK.md` / `metrics-benchmarks.json` when the rubric uses them). No rubric → the bundle has no quality bar; author one first ([`docs/workspace-evaluators.md`](../../../docs/workspace-evaluators.md)).
- **At least one graph workflow** — a #498 node-graph workflow under `<ws>/workflows/*.json`. A linear-only (#478) workspace refuses: the bundle's pipeline IS the production graph.
- **Workflows lint green** — `ralphy workflow lint <ws>` (omit the name to lint every workflow; ZERO model calls). Fix every error (DAG, edge resolution, port typing, #497 coverage hard-fails) before exporting.
- **Compositions parametrized (agent-side judgment)** — where the graph references HyperFrames compositions, they should be parametrized machines (slots, not hardcoded one-offs); producing one more unit must not require creative code authoring. The CLI does not enforce this — you do.

### 2. Export

```bash
ralphy workspace export <ws>                              # → ./<ws>-bundle-v1.0.0.zip
ralphy workspace export <ws> --out <path> --bundle-version 1.1.0
```

The manifest's `requiredConnectorKeys` and `requiredCoverage` are auto-derived from the graph's nodes; `trustDefault` starts imports at L0.

### 3. When export refuses — relay the gaps verbatim

A non-ready workspace returns `{ exportable: false, gaps: [{id, detail, fix}] }` + `E_VALIDATION_FAILED`. Show the user the EXACT gap list (ids: `missing-evaluators`, `no-graph-workflow`, `workflow-lint-error` — one per lint error), then drive each `fix`. Do not paraphrase the gaps into vague advice; the structured output is the checklist.

### 4. Import (the receiving side)

```bash
ralphy workspace import <zip>                 # slug = manifest name
ralphy workspace import <zip> --as <slug>     # rename; the ONLY path past a collision
```

Validation runs BEFORE any file is materialized; refusals come back as `{ imported: false, refusals: [{id, detail, fix}] }`. In order: `manifest-invalid` → `version-floor` (upgrade ralphy) → `missing-keys` (every unset connector key NAMED, `E_ENV_KEY_MISSING`; `--allow-missing-keys` downgrades to warnings — the farm can't run those nodes until keys are set) → `coverage-gap` (unknown #497 triples NAMED; `--allow-coverage-gaps` downgrades) → `pipeline-invalid` (bundled pipeline must lint green) → slug collision (`E_ALREADY_EXISTS`). On a clean pass it materializes `workspace.json` (with bundle provenance), `workflows/`, the evaluator files, `calendar.json` (slots only, entries empty), `shared/refs/`, `prompts/`, `compositions/`.

### 5. Server handoff (#506)

On the deployment host the flow is the same two verbs: `ralphy workspace import <zip> --as <slug>` (via the CLI in the container, or through the dashboard's import surface), set the named connector keys, then `ralphy farm start --workspace <slug>` — foreground; the user backgrounds or dockerizes it. `ralphy farm status --workspace <slug>` verifies the scheduler is live; the trust ladder starts at the manifest's `trustDefault` (L0 unless the author raised it) — see `ralphy workspace trust <slug>`.

## References

- [`docs/workspace-bundle.md`](../../../docs/workspace-bundle.md) — bundle tree, manifest fields, the full export/import semantics (#502).
- [`docs/architecture/farm-node-graph.md`](../../../docs/architecture/farm-node-graph.md) — "Template bundle (the zip)", the trust ladder, D-02/D-03/D-06.
- `cli/lib/schemas/bundle.ts` — the manifest Zod schema.
- `cli/commands/workspace.ts` — the `export` / `import` / `trust` subcommands.
- [`docs/playbooks/producer.md`](../../../docs/playbooks/producer.md) — farm mode: calendar, scheduler, trust, publish, analytics (#501-#507).
- [`../templater/SKILL.md`](../templater/SKILL.md) — the sibling exit: project → library entities.
