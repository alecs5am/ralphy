# Bundle versioning and deployed-workspace upgrade

> **Status:** todo
> **Filed:** 2026-07-06
> **Folder:** issues
> **Severity:** medium
> **Category:** workspace / distribution / lifecycle

## Context

#502 ships export/import with a version field and never-overwrite semantics.
The lifecycle it doesn't cover: the training workspace keeps improving after
deployment (better prompts, a tuned rubric, a new branch), and the deployed
farm needs to pick up bundle v2 WITHOUT losing its accumulated runtime state —
calendar entries, trust level + agreement history, dedup store, cache,
analytics, quarantine. Today the only path is import-as-new-slug and hand
migration, which in practice means nobody upgrades.

## What

`ralphy workspace upgrade <ws> <bundle.zip>`: validate the bundle targets the
same workspace lineage (bundle id + monotonic version), show a diff of
know-how artifacts (graph, subgraphs, prompts, compositions, evaluators,
calendar DEFAULTS, reroute/lint rules), then apply know-how atomically while
preserving runtime state. Version every replaced artifact (append-only:
`workflow.v<N>.json` etc.), record an upgrade event, and support
`ralphy workspace rollback <ws>` to the prior know-how set.

## Why it matters

The two-path model is a LOOP, not a one-way street: train, deploy, watch
analytics (#507), retrain, redeploy. If redeploying costs runtime-state loss,
the loop breaks at its most valuable iteration — the tuned one.

## Scope / acceptance

- Bundle manifest gains a stable `bundleId` + monotonic `version` (#502 schema
  extension, backward compatible); upgrade refuses on lineage mismatch or
  version regression (rollback is the sanctioned down-path).
- Know-how vs runtime-state boundary DOCUMENTED as a table in
  `docs/architecture/farm-node-graph.md` and enforced by the upgrade code —
  know-how replaced (versioned), runtime state untouched.
- Pre-apply diff report (out() contract): changed/added/removed per artifact
  class; `--dry-run` default OFF but `--yes` required non-interactively.
- Safety: upgrade refuses while a run is active (park or finish first);
  evaluator changes trigger a trust-ladder note — agreement streak resets
  (#505) because the rubric changed.
- Rollback restores the prior versioned set; both upgrade and rollback append
  to a workspace lifecycle log.
- Dashboard: upload-to-upgrade flow next to import (#506), gaps relayed
  verbatim.
- Tests: lineage/version gating, know-how replaced + state preserved
  (fixtures for calendar/trust/dedup), rollback round-trip, active-run
  refusal, trust-streak reset on evaluator change.

## Notes

- Sequence after #502/#505/#506; coordinates with #517 (subgraphs are
  know-how) and #514/#515 (rules are know-how).
