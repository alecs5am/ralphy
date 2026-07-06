# Workboard — farm node-graph batch

> **Status:** active
> **Opened:** 2026-07-06
> **Driver:** /dev-loop
> **Slice:** land the farm-mode two-path architecture (#496-#509): invariant carve-out, capability matrix, node-graph schema, node executors (LLM / ingestion / publish), calendar, scheduler-runner, workspace bundle, trust ladder, server deploy, analytics loop, skills refresh, and the tech-news pilot harness.

## Lanes

Lanes are ordered by dependency (foundational first). Each row is ONE existing `notes/issues/` id.

| Lane | Issue | Depends on | Expected gates | Status |
|---|---|---|---|---|
| foundation | [#496](../issues/done/496-vercel-ai-sdk-invariant-carveout.md) | — | `bun test agents-md-invariants` · `lint:agents-md` | landed `2ff87ea7` |
| foundation | [#497](../issues/done/497-provider-capability-matrix.md) | — | `bun test` (registry + coverage) | landed |
| foundation | [#498](../issues/498-workflow-node-graph-schema.md) | #497 | `bun test` (workflow schema) · `cli:surface:check` | todo |
| nodes | [#499](../issues/499-ai-sdk-llm-nodes.md) | #496, #498 | `bun test` (mocked SDK) · invariant test | todo |
| nodes | [#500](../issues/500-ingestion-trend-watch-nodes.md) | #498 | `bun test` (fixtures, cursor, dedup) | todo |
| nodes | [#504](../issues/504-content-calendar-entity.md) | #498 | `bun test` · `lint:out-coverage` | todo |
| nodes | [#501](../issues/501-postiz-publish-connector.md) | #498, #504 | `bun test` (mocked Postiz) | todo |
| runtime | [#503](../issues/503-farm-scheduler-runner.md) | #498, #499 | `bun test` (fixture graph e2e, park/resume) | todo |
| runtime | [#502](../issues/502-workspace-export-import-bundle.md) | #497, #498 | round-trip test · `workflow lint` green | todo |
| runtime | [#505](../issues/505-trust-ladder-auto-publish.md) | #501, #503 | `bun test` (gating, agreement math) | todo |
| deploy | [#506](../issues/506-farm-server-deploy-dashboard-auth.md) | #502, #503, #504, #505 | compose smoke · auth block test | todo |
| loop | [#507](../issues/507-analytics-feedback-loop.md) | #501 | `bun test` (mocked API pull) | todo |
| skills | [#508](../issues/508-skills-refresh-farm-era.md) | #496-#507 | `lint:skills` · `lint:agents-md` | todo |
| pilot | [#509](../issues/509-tech-news-pilot.md) | all above | end-to-end acceptance (user-gated) | todo |

## Dependency order

#496 and #497 are independent foundations (invariant text + registry data) and run first; #498 (the node-graph schema) consumes #497's matrix at validation and blocks every node/runtime issue. Node executors (#499, #500, #504, #501) all register against #498's types and run sequentially because they share `cli/lib/schemas/workflow.ts` and the executor registry. #503 (runner) needs the LLM executors; #502 (bundle) needs schema + matrix; #505 sits on publish + runner. #506 packages everything behind auth; #507 closes the loop after publish exists. #508 documents the landed verbs (must be last-but-one); #509 is the integration pilot and pauses for user involvement (training path + paid generation). Nothing is parallelized — every issue touches shared files (workflow schema, executor registry, AGENTS.md).

## Completion notes

_Filled on close._
