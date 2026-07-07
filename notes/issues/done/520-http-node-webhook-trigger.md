# http node and inbound webhook trigger

> **Status:** done — 2026-07-08
> **Filed:** 2026-07-06
> **Folder:** issues
> **Severity:** medium
> **Category:** ingestion / runtime / connectors

## Context

The `http` node type is in the schema (#498) with no executor, and the farm's
only trigger is cron (`schedule` nodes, #503). Two real flows need more: pull
data from an arbitrary allowlisted API the ingestion connectors don't cover
(a niche leaderboard, a product changelog JSON), and react to external events
— "new episode uploaded", "product launched", a Zapier/n8n-style hook — by
firing a tick immediately instead of waiting for the next cron slot.

## What

1. **`http` node executor** — GET/POST with headers/body from params, response
   into a typed port (json -> `object`, else `text`); hosts must match the
   node's `allowed_hosts` param, which the workspace bundle manifest declares
   and import surfaces for user consent (#502).
2. **`webhook-trigger` node type** — the farm app (#506) exposes
   `/hooks/<ws>/<trigger-id>` (auth: per-trigger secret token); an inbound
   POST validates the secret, normalizes the payload into the trigger's
   declared output port type, and starts a tick of the graph rooted at that
   trigger, exactly like a schedule firing.

## Why it matters

Event-driven ticks are the difference between "news farm that posts at 9:00"
and "news farm that posts 20 minutes after the story breaks" — latency is the
whole game in the news niche the pilot targets.

## Scope / acceptance

- `http` executor: allowlist enforcement (refuse + name the host), timeout,
  response size cap, no provider hosts permitted (invariant #1 — provider
  traffic goes through connectors; lint rejects known provider hosts in
  `allowed_hosts`).
- Secrets for http auth headers come from env var REFERENCES in params
  (`$MY_API_TOKEN`), resolved at execution — literal secrets in a graph file
  = lint error (they'd end up in bundles).
- `webhook-trigger`: schema + app endpoint + secret management (`ralphy farm
  trigger token <ws> <id> --rotate`); replay protection (timestamp window);
  payload -> port normalization with a `transform`-style mapping param.
- Rate limit inbound hooks per trigger (config, default conservative);
  budget caps (#481) still gate whatever the tick spends.
- Tests: allowlist refusal, secret-literal lint, webhook auth (bad token,
  stale timestamp), tick-from-hook end to end with mocked executors, rate
  limit.

## Notes

- Sequence after #503 and #506 (endpoint lives in the app).
- Provider-host lint list: reuse the invariant test's host patterns — one
  source of truth.
