# Workspace export/import bundle (the deployable template zip)

> **Status:** done — 2026-07-06
> **Filed:** 2026-07-05
> **Folder:** issues
> **Severity:** high
> **Category:** workspace / templates / distribution

## Context

The two-path model (`docs/architecture/farm-node-graph.md`): a workspace is
trained interactively in Claude Code, then exported as a self-contained bundle
and imported into a server deployment. `ralphy template extract` promotes a
single project; nothing today packages a whole workspace's production know-how
(graph, prompts, compositions, evaluators, calendar, refs) as one artifact.

## What

`ralphy workspace export <ws>` producing a versioned zip:

```
manifest.yaml   # name, version, ralphy-version floor, required connector keys,
                # required (model, capability, provider) coverage, trust default
pipeline.*      # the node-graph spec (#498)
prompts/        # slot-templated prompt files
compositions/   # parametrized HyperFrames engines (+ schedule.json contract)
evaluators/     # STYLE_LOCK.md, evaluators.json, metrics-benchmarks.json
calendar.yaml   # default slots / unit-type mix (#504)
refs/           # frozen style refs, cast masters, brand assets
```

And `ralphy workspace import <zip>`: validates the manifest against installed
connectors/keys and the #497 capability matrix BEFORE accepting, then
materializes a new workspace.

## Why it matters

The bundle is the product's unit of reuse — "clone a fireship-style workspace,
add your keys, get a channel." It is also the boundary that keeps the training
path and the production path honest: everything the farm needs must be IN the
bundle, which forces the export-readiness criterion (no creative code authoring
left at production time).

## Scope / acceptance

- Manifest schema (zod) + export command: collects the listed artifacts from
  `.ralphy/workspaces/<ws>/`, refuses with a concrete list when required
  pieces are missing (no evaluators.json, no workflow, unparametrized
  composition).
- Import: manifest validation (version floor, missing keys named, coverage
  gaps named), collision-safe (existing workspace slug -> refuse or `--as
  <slug>`), never overwrites an existing workspace.
- Round-trip test: export a fixture workspace, import into a clean `.ralphy`
  root, run `ralphy workflow lint` green.
- Media hygiene: refs copied as-is; project artifacts and logs are NOT
  bundled (the bundle is know-how, not history).
- Document the bundle format in `docs/` and cross-link from the design doc.

## Notes

- Sequence after #498 (bundle carries the graph spec) and #497 (import
  validates coverage). #508 adds the agent-facing skill wrapper.
