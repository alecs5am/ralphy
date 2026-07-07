# Node-level content-hash caching

> **Status:** todo
> **Filed:** 2026-07-06
> **Folder:** issues
> **Severity:** medium
> **Category:** runtime / cost / content-farm

## Context

The node envelope declares `cache: content-hash | none` (#498) but the runner
(`cli/lib/farm/runner.ts`) never consults it — every re-run re-executes every
node. For paid nodes this is real money: a resumed run that re-enters a
completed-but-unjournaled branch, or a graph edit downstream of an expensive
generate, re-bills identical work.

## What

Implement the `content-hash` cache policy: hash the node's resolved inputs +
params + (model, provider) binding; before executing, look up a
workspace-scoped cache index mapping hash -> prior output artifact(s); on hit,
reuse the artifact reference and journal a `node-cached` event instead of
executing. Paid nodes default to `content-hash`, free/control-flow nodes to
`none` (schema default change).

## Why it matters

Cache turns iteration on a production graph from "re-bill the whole pipeline"
into "re-bill the delta" — the same property that makes the training path
affordable must hold on the farm, or graph edits at L1/L2 get expensive and
users stop tuning.

## Scope / acceptance

- Deterministic input hashing: port artifact content hashes (not paths),
  canonicalized params, model+provider; document what is deliberately
  EXCLUDED (timestamps, run ids).
- Cache index at `.ralphy/workspaces/<ws>/cache/node-cache.json(l)` —
  append-only entries {hash, node type, artifact refs, cost saved, ts};
  artifacts themselves stay where they were written (the cache stores refs,
  never copies media).
- Runner integration: check before execute; `node-cached` journal event with
  the reused artifact + estimated cost saved; `--no-cache` run flag forces
  execution.
- Invalidation: a missing/deleted referenced artifact = cache miss (verify
  existence on hit); cap the index (LRU or max-entries) with a documented
  policy.
- `ralphy farm status` / run summary surfaces cache hits + cost saved.
- Tests: hit/miss on param change, ref-content change, model swap; missing
  artifact fallback; `--no-cache`; journal event shape.

## Notes

- Sequence after #511 (paid executors are the beneficiaries).
- Interplay with append-only versioning: a cache hit reuses the EXISTING
  version, it never writes a new one.
