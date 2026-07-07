# Workspace bundle format (#502)

The bundle is the deployable unit of a trained workspace: everything the farm
needs to reproduce the channel — graph, prompts, compositions, evaluators,
calendar slots, refs — packaged as one zip. `ralphy workspace export <ws>`
produces it; `ralphy workspace import <zip>` validates it against the
installed connectors/keys and the #497 coverage matrix BEFORE materializing a
new workspace. Design context: [`docs/architecture/farm-node-graph.md`](architecture/farm-node-graph.md)
("Template bundle (the zip)", decisions D-02/D-03).

## Bundle tree

```
bundle.zip
  manifest.yaml          # see "Manifest fields" below
  pipeline.json          # the #498 graph workflow (JSON storage per D-03)
  pipeline.<name>.json   # additional graph workflows, one file each
  subgraphs/             # reusable named subgraphs (#517) — the workspace's
                         # whole subgraphs/ tier, verbatim; pipelines ship in
                         # AUTHORED form and re-expand on the import side
  prompts/               # slot-templated prompt files the graph references
  compositions/          # parametrized HyperFrames engines (when present)
  evaluators/            # STYLE_LOCK.md, evaluators.json, metrics-benchmarks.json
  reroute-rules.json     # workspace filter-reroute rules (#514, optional) —
                         # merged OVER the built-in set at runtime, never a replace
  calendar.yaml          # recurring slots ONLY (unit-type mix); dated entries
                         # are per-workspace production state — never bundled
  refs/                  # shared/refs copied as-is (style refs, cast masters)
```

Media hygiene: **project artifacts and logs are never bundled** — the bundle
is know-how, not history. Export is read-only over the source workspace.

Zip mechanism: the system `zip` / `unzip` binaries (same decision as
`cli/lib/unpack-zip.ts` — zero new deps; present by default on macOS, one
`apt-get install zip unzip` in a docker image). A missing binary refuses with
`E_DEP_MISSING`.

## Manifest fields (`manifest.yaml`)

Schema: `cli/lib/schemas/bundle.ts` (Zod).

| Field | Type | Meaning |
|---|---|---|
| `name` | string | Bundle name; the default workspace slug at import (`--as` overrides). |
| `version` | semver-ish | Bundle version, bumped by the author on re-export (`--bundle-version`). |
| `ralphyVersionFloor` | semver-ish | Minimum ralphy version that can import (export stamps the current version). |
| `requiredConnectorKeys` | string[] | Connector env-var names the graph needs (`OPENROUTER_API_KEY`, …). Auto-derived from the graph's nodes: media/LLM nodes via their provider's connector, ingestion/publish nodes via their backend (`web-scrape` → `FIRECRAWL_API_KEY`, `actor` → `APIFY_TOKEN`, `publish`/`x-post` → `POSTIZ_API_KEY` + `POSTIZ_BASE_URL`). |
| `requiredCoverage` | {model, capability, provider}[] | The #497 coverage-matrix triples the graph's media nodes bind to. Auto-derived. |
| `trustDefault` | `L0` \| `L1` \| `L2` | Trust-ladder starting level for the imported workspace (default `L0`). |

## Export-readiness criteria

`ralphy workspace export <ws>` refuses — naming EVERY gap in structured output
(`{ exportable: false, gaps: [{id, detail, fix}] }` + `E_VALIDATION_FAILED`) —
when any of these hold:

- **`missing-evaluators`** — no sibling `<ws>/evaluators.json` (the bundle
  must carry the workspace's hard quality bar; see
  [`docs/workspace-evaluators.md`](workspace-evaluators.md)).
- **`no-graph-workflow`** — the workspace has no #498 node-graph workflow
  under `workflows/*.json`. A linear-only (#478) workspace refuses: a bundle's
  pipeline is the production graph.
- **`workflow-lint-error`** — one gap per `ralphy workflow lint` error on any
  graph workflow (#517 subgraph expansion — missing refs, unknown overrides,
  boundary port mismatches, nested subgraphs — then DAG, edge resolution,
  port typing, coverage hard-fails).
- **`subgraph-lint-error`** — one gap per broken authored subgraph
  (`subgraphs/*.json` that fails the schema or its entry/exit/param
  declarations). The whole tier ships with the bundle, so even an UNUSED
  broken subgraph refuses export; requirement derivation
  (`requiredConnectorKeys` / `requiredCoverage`) runs over the EXPANDED
  graphs, so inner-node models and connectors are counted.
- **`prompt-lint-error`** — one gap per error-level #515 prompt-lint violation
  on any graph workflow: a per-model prompt-char cap breach (the #445
  constraints table — kling's 2500 included), an ElevenLabs Music artist-name
  reference, or an unknown `params.guidelines` slug. Each gap names the file,
  the rule, and the fix. Warn-level findings (kling no-music clause, photoreal
  negative cluster) do NOT block export. Standalone surface:
  `ralphy prompt lint <ws>`.

Export also never overwrites an existing `--out` zip (the system `zip` would
update it in place — refused as `E_ALREADY_EXISTS`).

## Import validation semantics

`ralphy workspace import <zip> [--as <slug>]` extracts to scratch and runs the
full validation pass BEFORE any workspace file is materialized. Refusals come
back as a structured list (`{ imported: false, refusals: [{id, detail, fix}] }`)
plus the mapped error code:

1. **`manifest-invalid`** — `manifest.yaml` missing / malformed / fails the
   schema (`E_VALIDATION_FAILED`).
2. **`version-floor`** — `ralphyVersionFloor` > the current ralphy version
   (`E_VALIDATION_FAILED`; fix: upgrade ralphy).
3. **`missing-keys`** — every unset `requiredConnectorKeys` entry is NAMED;
   refuse with `E_ENV_KEY_MISSING`. `--allow-missing-keys` downgrades to a
   warning and proceeds (the farm cannot run those nodes until keys are set).
4. **`coverage-gap`** — every `requiredCoverage` triple unknown to
   `coverageFor()` is NAMED; refuse with `E_VALIDATION_FAILED`.
   `--allow-coverage-gaps` downgrades to a warning.
5. **`subgraph-invalid`** — a bundled `subgraphs/*.json` is unreadable, fails
   the subgraph schema, or breaks a definition rule (a nested `subgraph` node
   included — one level only) (`E_VALIDATION_FAILED`).
6. **`pipeline-invalid`** — no `pipeline*.json`, a non-graph pipeline, or any
   `ralphy workflow lint` error on a bundled pipeline (`E_VALIDATION_FAILED`).
   Subgraph refs resolve against the BUNDLE's own `subgraphs/` tier (#517), so
   a pipeline referencing a subgraph the bundle does not carry refuses here.
7. **Collision** — the target slug (manifest `name`, or `--as`) already exists
   → `E_ALREADY_EXISTS`. Import **never overwrites an existing workspace**;
   `--as <new-slug>` is the only path.

On a clean pass, import materializes: `workspace.json` (with bundle
provenance), `workflows/<name>.json` per pipeline, the evaluator files at the
workspace top level, `calendar.json` (slots from `calendar.yaml`, `entries`
start empty), `shared/refs/`, and `subgraphs/` / `prompts/` /
`compositions/` / `reroute-rules.json` (plus any other bundle dirs) verbatim
under the workspace dir.
