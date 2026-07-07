# Auto-generated node reference docs

> **Status:** todo
> **Filed:** 2026-07-06
> **Folder:** issues
> **Severity:** low
> **Category:** docs / workflow / dx

## Context

The node taxonomy now spans ~35 types across seven categories, with per-type
params, port contracts, and executor status (registered vs schema-only) — and
its only documentation is the design doc's prose tables
(`docs/architecture/farm-node-graph.md`), which drift the moment a schema
field changes. The repo already solves this class of problem for CLI verbs:
`bun run docs:cli` generates `docs-mintlify/reference/cli/*.mdx` from source,
with a `:check` freshness gate in CI.

## What

The same treatment for nodes: a generator that walks the workflow schema
(`cli/lib/schemas/workflow.ts`) + the executor registry
(`cli/lib/workflow/executors/index.ts`) and emits a node reference — one page
per category with, per node type: description (from schema JSDoc), param
table (name, type, default, required), port contract (in/out types), executor
status (executable vs schema-only), spend class (paid/free), and a minimal
graph-snippet example. Plus a freshness check wired into CI.

## Why it matters

Graph authors are agents in the training path: their authoring quality is
bounded by what they can read. A generated, always-fresh node reference is
also the honest inventory of the executor gap (schema-only types are visible
instead of discovered at runtime as `no-executor` skips).

## Scope / acceptance

- `scripts/build-node-docs.ts` + `bun run docs:nodes` / `docs:nodes:check`;
  output under `docs-mintlify/reference/nodes/` (respect
  `docs-mintlify/.styleguide.md`).
- Source of truth is the zod schema + registry — the generator introspects,
  it does not keep its own tables; JSDoc on schema fields becomes the docs,
  so missing descriptions surface as generator warnings.
- Executor status derived from the live registry (registered / override-only
  / none).
- Examples validated: every emitted graph snippet parses through
  `workflow lint` in the generator's test.
- CI: `docs:nodes:check` added to the lint suite + `.github/workflows/`;
  `docs/developing-ralphy.md` auto-generated table gains the row.
- Update the design doc's node tables to POINT at the generated reference
  instead of duplicating params (prose keeps the rationale, reference keeps
  the facts).

## Notes

- Sequence LAST in the tranche (documents whatever landed); cheap to re-run
  after #511/#512/#517 change the registry.
