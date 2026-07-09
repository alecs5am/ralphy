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
| `bundleId` | string (uuid) | #521 lineage id — stable across re-exports of the same bundle (minted on first export, stored in the workspace's `workspace.json` `bundle` block). `workspace upgrade` refuses a bundle whose `bundleId` does not match the deployed workspace's. OPTIONAL for backward compat — a pre-#521 bundle without it still imports; upgrade then needs `--allow-unknown-lineage`. |
| `version` | semver-ish | Bundle version, bumped by the author on re-export (`--bundle-version`). `workspace upgrade` requires it to be strictly greater than the deployed version (monotonic). |
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

## Upgrade + rollback (#521)

`ralphy workspace upgrade <ws> <bundle.zip>` picks up a newer version of the
SAME bundle lineage on a deployed workspace without losing runtime state.
Gating (all refuse before touching anything):

1. **Validation** — the full import validation pass runs first (manifest,
   version floor, keys, coverage, pipeline lint). `--allow-missing-keys` /
   `--allow-coverage-gaps` downgrade to warnings, same as import.
2. **Lineage** — the bundle's `bundleId` must match the deployed workspace's.
   A missing id on either side is "unknown lineage" — refused unless
   `--allow-unknown-lineage`.
3. **Monotonic version** — the bundle version must be strictly greater than
   the deployed version. A regression is refused (rollback is the down-path).
4. **No active run** — a `running` / `parked-approval` run OR a live farm
   daemon refuses the upgrade (park or finish first).

`--dry-run` (default OFF) prints the know-how diff only; a non-interactive
apply requires `--yes`. On apply: know-how is replaced atomically (a
scratch-clone swap), each changed artifact is versioned append-only
(`workflows/episode.v2.json`, …), the prior tree is kept as `<ws>.prev`, and an
evaluator change resets the #505 trust agreement streak (the rubric moved).
Both upgrade and rollback append an event to `<ws>/lifecycle.jsonl`.

`ralphy workspace rollback <ws>` restores the `<ws>.prev` know-how set; runtime
state accrued since the upgrade is carried forward untouched.

The **know-how vs runtime-state boundary** (what the upgrade replaces vs. what
it preserves) is the table in
[`docs/architecture/farm-node-graph.md`](architecture/farm-node-graph.md)
"Bundle lineage + upgrade (#521)"; the enforcement is `RUNTIME_STATE_PATHS` +
`upgradeWorkspace` / `rollbackWorkspace` in `cli/lib/bundle.ts`.

## State backup + restore (#540) — disaster recovery

The bundle is **know-how**; it is reproducible from the training path and
re-exportable at any time. What is NOT reproducible is a deployed farm's
accumulated **runtime state** — the publish ledger, quota usage, calendar
entries, trust history, selection weights, dedup store, run journals. A disk
loss or a bad `rm` loses months of learned history, and — via the lost publish
ledger — reintroduces the #531 double-post risk. `ralphy workspace backup` /
`restore` is the recovery path for exactly that state.

### The three-way boundary

Every workspace-relative path is exactly one of three classes. The manifest is
`STATE_PATHS` / `MEDIA_PATHS` / `KNOWHOW_PATHS` in
[`cli/lib/workspace-backup.ts`](../cli/lib/workspace-backup.ts):

| Class | What | In backup? | In bundle? |
|---|---|---|---|
| **STATE** | `publish-ledger.jsonl` (#531), `publish-quota.jsonl` (#534), `calendar.json` entries + `calendar-events.jsonl` (#504), `trust-audit.jsonl` + `trust-agreement.jsonl` (#505), `selection-weights.jsonl` (#532), `ingestion/` dedup (#500), `cache/` node-cache, `farm/` (dead-letter, webhook tokens), `runs/` journals (#503), `publish-mode-audit.jsonl`, `lifecycle.jsonl`, `workspace.json` | **Yes** (always) | No |
| **MEDIA** | `projects/`, `batches/`, `ideas/` artifacts + logs | Only with `--include-media` | No |
| **KNOW-HOW** | `workflows/`, `subgraphs/`, `prompts/`, `compositions/`, `evaluators.json`, `STYLE_LOCK.md`, `metrics-benchmarks.json`, `reroute-rules.json`, `golden/`, `shared/` | No — re-export the **bundle** instead | Yes |

The STATE set is a documented subset of the upgrade's `RUNTIME_STATE_PATHS`
(`cli/lib/bundle.ts`) with the media paths split out to the MEDIA axis, plus
the top-level ledger/quota/selection files upgrade preserves implicitly.
`bundle.ts` behavior is unchanged — backup only reads its boundary.

**Extension seam (honest):** the #540 spec names analytics snapshots (#507),
quarantine (#519), and a topic-index (#541). None yet has a workspace-relative
store in code — analytics is project-scoped, the review flow reuses
`publish-mode-audit.jsonl` (already backed up), and #541 is not built. When any
lands as a workspace-relative file, add it to `STATE_PATHS`.

### backup

`ralphy workspace backup <ws> [--out <path>] [--include-media]` writes a
versioned, timestamped zip (`backup-manifest.json` carries the schema version,
the ralphy version, the workspace, the timestamp, and the archived path list).
It is **safe on a live farm**: each state path is snapshot-**copied** into a
scratch dir first, then the scratch dir is archived — the live tree is never
mutated and a concurrent JSONL append (a publish, a calendar event) either
lands wholly in the point-in-time copy or not at all, so the archive never
tears. Never overwrites `--out`. Uses the system `zip` binary.

### restore

`ralphy workspace restore <archive> [--as <slug>] [--force]` rehydrates the
STATE (and MEDIA, when the archive carried it) onto a target workspace. It
validates the archive schema version, then **refuses to clobber** a target
whose live state is newer than the archive unless `--force` is passed (the
override is recorded in the payload). `--as <slug>` restores into a different
or brand-new workspace — the path for host migration or cloning a channel to a
second server. Restore writes only STATE — never know-how, never media the
archive did not include. It then runs a `farm doctor` (#530) subset: the
publish ledger parses and the calendar resolves. Restoring the ledger
**re-establishes #531 exactly-once** — a re-publish of an already-posted
(unit, target) idempotent-skips again.

### Scheduled backup + off-host push

Backup writes a local zip; getting it off the host is your choice (the hook,
not a hosted service). A cron example that keeps 14 daily snapshots and pushes
each to object storage:

```bash
# /etc/cron.daily/ralphy-backup  (or `crontab -e`: 0 4 * * *)
set -euo pipefail
WS=tech-news
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="/var/backups/ralphy/${WS}-${STAMP}.zip"

ralphy workspace backup "$WS" --out "$OUT"

# Off-host push — pick your destination (S3 / B2 / rsync / restic …):
aws s3 cp "$OUT" "s3://my-bucket/ralphy-backups/"      # or:
# rclone copy "$OUT" b2:my-bucket/ralphy-backups/
# rsync -a "$OUT" backup-host:/srv/ralphy-backups/

# Retention: keep the last 14 local snapshots.
ls -1t /var/backups/ralphy/${WS}-*.zip | tail -n +15 | xargs -r rm --
```

Inside a running farm you can also drive it from a `schedule`-node tick that
shells the same `ralphy workspace backup` before the day's run. Recovery on a
fresh host: `ralphy workspace restore <archive> --as <ws>` after importing the
bundle (know-how first, then state).
