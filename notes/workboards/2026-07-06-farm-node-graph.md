# Workboard — farm node-graph batch

> **Status:** closed — 2026-07-06
> **Opened:** 2026-07-06
> **Driver:** /dev-loop
> **Slice:** land the farm-mode two-path architecture (#496-#509): invariant carve-out, capability matrix, node-graph schema, node executors (LLM / ingestion / publish), calendar, scheduler-runner, workspace bundle, trust ladder, server deploy, analytics loop, skills refresh, and the tech-news pilot harness.

## Lanes

Lanes are ordered by dependency (foundational first). Each row is ONE existing `notes/issues/` id.

| Lane | Issue | Depends on | Expected gates | Status |
|---|---|---|---|---|
| foundation | [#496](../issues/done/496-vercel-ai-sdk-invariant-carveout.md) | — | `bun test agents-md-invariants` · `lint:agents-md` | landed `2ff87ea7` |
| foundation | [#497](../issues/done/497-provider-capability-matrix.md) | — | `bun test` (registry + coverage) | landed `250a0253` |
| foundation | [#498](../issues/done/498-workflow-node-graph-schema.md) | #497 | `bun test` (workflow schema) · `cli:surface:check` | landed `ecf02ad9` |
| nodes | [#499](../issues/done/499-ai-sdk-llm-nodes.md) | #496, #498 | `bun test` (mocked SDK) · invariant test | landed `1342fd80` |
| nodes | [#500](../issues/done/500-ingestion-trend-watch-nodes.md) | #498 | `bun test` (fixtures, cursor, dedup) | landed `42f08323` |
| nodes | [#504](../issues/done/504-content-calendar-entity.md) | #498 | `bun test` · `lint:out-coverage` | landed `9c337205` |
| nodes | [#501](../issues/done/501-postiz-publish-connector.md) | #498, #504 | `bun test` (mocked Postiz) | landed `b110497f` |
| runtime | [#503](../issues/done/503-farm-scheduler-runner.md) | #498, #499 | `bun test` (fixture graph e2e, park/resume) | landed `a65c322c` |
| runtime | [#502](../issues/done/502-workspace-export-import-bundle.md) | #497, #498 | round-trip test · `workflow lint` green | landed `ca263760` |
| runtime | [#505](../issues/done/505-trust-ladder-auto-publish.md) | #501, #503 | `bun test` (gating, agreement math) | landed `c37a6288` |
| deploy | [#506](../issues/done/506-farm-server-deploy-dashboard-auth.md) | #502, #503, #504, #505 | compose smoke · auth block test | landed `fb4da804` |
| loop | [#507](../issues/done/507-analytics-feedback-loop.md) | #501 | `bun test` (mocked API pull) | landed `df4334dd` |
| skills | [#508](../issues/done/508-skills-refresh-farm-era.md) | #496-#507 | `lint:skills` · `lint:agents-md` | landed `0721402a` |
| pilot | [#509](../issues/509-tech-news-pilot.md) | all above | end-to-end acceptance (user-gated) | deferred (owner-gated training + paid gen; also needs #510) |

## Dependency order

#496 and #497 are independent foundations (invariant text + registry data) and run first; #498 (the node-graph schema) consumes #497's matrix at validation and blocks every node/runtime issue. Node executors (#499, #500, #504, #501) all register against #498's types and run sequentially because they share `cli/lib/schemas/workflow.ts` and the executor registry. #503 (runner) needs the LLM executors; #502 (bundle) needs schema + matrix; #505 sits on publish + runner. #506 packages everything behind auth; #507 closes the loop after publish exists. #508 documents the landed verbs (must be last-but-one); #509 is the integration pilot and pauses for user involvement (training path + paid generation). Nothing is parallelized — every issue touches shared files (workflow schema, executor registry, AGENTS.md).

## Completion notes

- **Landed:** #496 `2ff87ea7` (D-01 AI SDK carve-out) · #497 `250a0253` (coverage matrix, D-02) · #498 `ecf02ad9` (node-graph schema + `workflow lint`, D-03) · #499 `1342fd80` (AI SDK LLM executors + registry seam, D-04) · #500 `42f08323` (ingestion + trend-watch + dedup store) · #504 `9c337205` (calendar entity + `calendar-slot`) · #501 `b110497f` (Postiz publish, D-05, E_PUBLISH_NOT_READY) · #503 `a65c322c` (farm runner, D-06, park/resume) · #502 `ca263760` (workspace bundle export/import) · #505 `c37a6288` (trust ladder L0-L2) · #506 `fb4da804` (docker deploy + auth + farm dashboard; UI built inline per the webapp-inline rule) · #507 `df4334dd` (analytics loop + performance postmortem) · #508 `0721402a` (skills refresh + workspace-export skill). Unit suite grew 2476 → 2999 (0 fail throughout); studio suite 77 → 106.
- **Deferred / carried over:** #509 — every dependency landed, but the training path (style lock, evaluators, four parametrized compositions, paid generation) is owner-gated, and the headless acceptance needs #510. Re-select into the next board alongside #510.
- **New issues filed mid-run:** #510 fan-out subgraph execution (the #503 structured-skip deferral turned out to be a hard dependency of #509's four-branch graph).
- **Gotchas for the next session:** the pre-push hook runs the full unit+integration suite (~2.5 min) — give pushes a long timeout. #492 (workflow-app API contract) is still open; #506 extended the de-facto studio server API without closing it. The generic `http` ingestion node was deliberately deferred inside #500 (allowlisted-hosts design needed). Postiz per-post analytics endpoint verified real (`GET /api/public/v1/analytics/post/{id}`); YouTube retention curves need the OAuth follow-up named in `cli/lib/providers/youtube-analytics.ts`. `recordTrustDecision` has no CLI verb yet (dashboard calls the studio server's hand-copy) — flagged in #506's issue notes.
