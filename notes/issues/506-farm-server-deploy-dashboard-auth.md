# Server deployment and authenticated farm dashboard

> **Status:** todo
> **Filed:** 2026-07-05
> **Folder:** issues
> **Severity:** high
> **Category:** studio / deployment / operations

## Context

The production path runs on a user's server: deploy, open a port, log into a
dashboard, import a bundle, press start (`docs/architecture/farm-node-graph.md`,
"Runtime & dashboard"). Studio (#482, #488-#491) already has the run dashboard,
approval inbox, annotations, and safe config patches — but it is a local dev
server with zero auth, and there is no packaged deployment.

## What

One-command server deployment: a docker-compose that runs the farm daemon
(#503) + the workflow app/Studio behind authentication, with `.ralphy/` as the
mounted durable volume. Dashboard additions on top of the existing run
surfaces: bundle import (upload the #502 zip), farm start/stop controls, trust
ladder controls (#505), the calendar view (#504), and node-graph rendering of
the #498 schema on the existing canvas (#490).

## Why it matters

"Clone a workspace, `docker compose up`, get a channel" is the adoption hook —
the entry cost decides whether anyone runs the farm at all. Auth is
non-negotiable the moment the dashboard leaves localhost: it holds approval
power over paid generation and account publishing.

## Scope / acceptance

- `docker/` (or `deploy/`) with a compose file: farm daemon + app + optional
  Postiz (per #501's decision); documented env (provider keys via env, never
  baked into the image).
- Auth on every app route: minimal viable scheme (single admin token or
  user/pass session) — record the choice; no unauthenticated mutating endpoint,
  including the existing inbox/patch/approval writes.
- Bundle import flow in the dashboard: upload zip -> #502 import validation ->
  errors surfaced verbatim.
- Farm controls: start/stop per workspace, tick-now, trust level, budget caps —
  all through the workflow-app API boundary (#492), each mapped to an existing
  CLI/state path (no second engine).
- Studio media-safety rule holds: no endpoint deletes/moves/overwrites media.
- Smoke tests: compose boots on a clean host with a fixture bundle; auth
  blocks anonymous access; import + start + approve round-trip against mocked
  executors.

## Notes

- Sequence after #502, #503; integrates #504, #505.
- Builds on #492 (API boundary) — extend it, don't bypass it.
- Cloud seam (`docs/architecture/cloud-factory-design-seam.md`) stays design-
  only; this is self-hosted single-tenant.
