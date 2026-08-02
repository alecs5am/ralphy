# Ralphy Farm SQLite Consumer Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `ralphy-farm` from its copied filesystem/core runtime to an independently buildable automation consumer of the released SQLite-backed Ralphy CLI/bridge, preserve Farm-owned automation history under an ID-based namespace, and install that migrated state safely during the coordinated core cutover.

**Architecture:** The released `ralphy` binary is the only owner of Workspaces, Projects, Documents, Objects, Artifacts, Runs/provider attempts/cost, Compositions/Builds, evaluations, Units/presentations, Publications, Metrics, campaigns, and calendar entries. Farm keeps only workflow orchestration state as JSON/JSONL below `.ralphy/farm/workspaces/<workspace-id>/` and talks to core through one typed adapter in `src/ralphy-cli.ts`; Studio uses the same adapter, core activity feed, and scoped locator boundary. A resumable Farm migrator prepares and verifies an external staged `farm/` tree before core cutover, then installs it into the verified v2 root only after the live `storeId` matches.

**Tech Stack:** Bun 1.3.11, TypeScript, Commander, Zod, Node/Bun filesystem and child-process APIs, released `@alecs5am/ralphy`, JSON/JSONL, Vite/React Studio, Docker Compose, `bun:test`

## Global Constraints

- Execute this plan in `/Users/maximovchinnikov/github/ralphy/ralphy-farm` only after the core domain/CLI/bridge contract is released. Do not import from a sibling checkout or make Farm depend on relative paths such as `../ralphy/cli`.
- Before editing, read the workspace and Farm `AGENTS.md`, inspect `git status --short`, and preserve every pre-existing modification and untracked file. Never stash or reset user work. If the checkout is dirty, use `superpowers:using-git-worktrees` to create an isolated Farm worktree from the current `HEAD` and leave the dirty checkout untouched.
- `src/ralphy-cli.ts` is the sole installed-core boundary. No other Farm or Studio file may spawn `ralphy`, speak bridge JSONL, open `ralphy.db`, import core source, or resolve core bucket paths.
- Farm never uses `bun:sqlite` and never creates a second database. Its authoritative namespace is `.ralphy/farm/`; core remains authoritative for every domain/provider entity.
- The canonical root argument is the data root that directly contains `ralphy.db`, `buckets/`, `tmp/`, and `farm/`. Repository cwd and data root are distinct.
- Workspace, Project, Artifact revision, Composition revision, Build, Unit revision, Publication, Metric, and core Run identities are stable core IDs. Workspace/project slugs are display aliases only and never directory keys or persisted references.
- Farm-generated IDs are opaque and immutable. New IDs use `crypto.randomUUID()` with a type prefix; legacy IDs are deterministically mapped once and recorded in the migration ledger.
- Farm authenticates once per bridge connection with its mode-0600 consumer token, creates immutable consumer-owned Agent Sessions for mutation scopes, and never claims an arbitrary consumer/system identity. The token exists only at `.ralphy/farm/auth.token`; it is excluded from DTOs, events, bundles, reports, logs, and migration evidence.
- Every operation-starting core mutation carries `{ system: "ralphy-farm", runId, nodeId, attempt, operation }` and a deterministic idempotency key. Core derives `system` from the authenticated consumer Session, indexes the complete tuple/key on the core Run, and exposes tuple lookup for crash replay. Short entity mutations carry that consumer Session plus their own optimistic contract but do not invent a Run. A Farm workflow run is not a core Run.
- Persist only stable entity refs and Farm-relative intermediate keys. Absolute paths, core bucket/key/original-name fields, secret refs/values, provider payloads, raw argv, and local locators are forbidden in Farm journals, caches, activity, API DTOs, and browser state.
- `locator.resolve` is absent from the generic Farm method union. It is last-mile only behind a private capability inside `src/ralphy-cli.ts` and the authenticated Studio media streamer. Never return its absolute path to a browser, executor result, cache, event, error, or log.
- Provider/model/render/transcription/publish/analytics operations and their credentials, attempts, costs, outputs, and errors are core-owned. Farm owns graph policy, schedules, retries/reroutes, approvals, inbox, dead letters, node cache, canvas layout, notifications, and automation trust/publish policy.
- Farm bundle code may orchestrate a core-owned portable export/import, but it may not read core buckets or serialize core rows itself.
- Workflow and subgraph definitions are immutable Farm revisions with a selected pointer. Every Farm Run binds an immutable expanded graph snapshot and digest, so edits, upgrades, and rollback cannot change an in-flight or historical run.
- The legacy Farm-state source remains untouched. Audit is read-only; staging is external and resumable; installation occurs only after verified core cutover and exact `storeId`/contract matching. Recovery roots and journals are never deleted automatically.
- Keep source, tests, docs, fixtures, and commits English-only. Use Bun, do not create npm lockfiles, and run `gitleaks protect --staged --redact` before each commit.

## Ownership Split

| Concern | Owner after migration | Persistence / access |
|---|---|---|
| Workspace/Project identity and metadata | Core | SQLite through bridge DTOs |
| Documents, media, references, working diagnostics | Core | SQLite + buckets; IDs in Farm |
| Provider/model calls, transforms, rendering, evaluation, repair | Core | core Runs/attempts/Objects/Artifacts/Builds |
| Units, presentations, publishing, metrics, campaigns, dated calendar entries | Core | SQLite through bridge methods |
| Workflow/subgraph definitions and schedule-node policy | Farm | `.ralphy/farm/workspaces/<workspace-id>/` |
| Ingestion cursor/seen/topic index and selection weights/lifecycle | Farm | append-only/optimistic state below the Farm Workspace namespace |
| Farm run journal, node retry/cache/dead letter | Farm | ID-based JSON/JSONL namespace |
| Approvals, inbox, canvas layout, config patches | Farm | ID-based JSON/JSONL namespace |
| Trust ladder, publish kill switch, quota/cadence policy, notifications | Farm | Farm policy snapshots + append-only audit |
| Provider/Postiz credentials | Core | encrypted core secret store; Farm sees configured status only |
| Inbound webhook bearer tokens | Farm | return-once plaintext; persist only SHA-256 digest and metadata |
| Studio domain data/media | Core | bridge DTOs plus private scoped locator resolution |
| Studio workflow control data | Farm | Farm store and Farm activity journal |

## Target File Map

- `src/ralphy-cli.ts`: one typed installed-core bridge/CLI adapter, handshake, cancellation, subscriptions, locator use, and safe error mapping.
- `core-contract.json`: exact released core/package/protocol/contract/schema capability pin captured after release.
- `cli/lib/farm/{ids,paths,refs,store}.ts`: stable Farm identities, ID-only refs, namespace layout, atomic snapshots, append-only events, and locking.
- `cli/lib/farm/{definitions,ingestion,selection,annotations}.ts`: immutable workflow/subgraph revisions, exact run snapshots, dedup/topic/weight/lifecycle state, and Farm-owned annotations/layout.
- `cli/lib/migration/{farm-state,journal,legacy}.ts`: isolated legacy readers, coverage ledger, staging, verification, install/recovery.
- `cli/lib/farm/runner.ts` and `cli/lib/workflow/executors/*.ts`: orchestration over stable refs and core operation calls.
- `cli/lib/publish/*.ts`, `cli/lib/analytics/*.ts`, and policy consumers: scheduling/trust/quota decisions over core Publication/Metric/Run DTOs.
- `cli/lib/bundle.ts`: compound Farm/core portable bundle orchestration without core storage reads.
- `studio/server/*.ts` and `studio/client/src/*.tsx`: ID-based Studio API/UI, core/farm activity streams, and private media tickets.
- `scripts/lint-consumer-boundary.ts`: reachable-source ownership gate.
- `docker/{Dockerfile,docker-compose.yml,README.md}`: released-core installation pin, shared root, and startup handshake.

---

### Task 0: Freeze the released core contract and protect the Farm baseline

**Files:**
- Create: `core-contract.json`
- Create: `scripts/capture-core-contract.ts`
- Replace: `tests/fixtures/fake-ralphy`
- Create: `tests/fixtures/fake-core-contract.ts`
- Modify: `tests/ralphy-cli.test.ts`
- Test: `tests/core-contract.test.ts`

**Interfaces:**
- Consumes: the installed released `ralphy` binary and a disposable v2 test root
- Produces: a checked-in exact compatibility pin and a deterministic fake stdio bridge used by all later tests

- [ ] **Step 1: Record the repository baseline without touching user work**

Run in the Farm checkout/worktree:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
```

If status is non-empty, create the implementation worktree from that `HEAD` with `superpowers:using-git-worktrees`; do not stage, stash, rewrite, or clean the original tree. Record the original status path set in the task ledger and recheck it before handoff.

- [ ] **Step 2: Turn the fake binary into a real protocol fixture first**

The fixture must accept `bridge --stdio --root <root>`, parse newline-delimited requests, answer `system.hello`, record requests, emit controllable activity events, and simulate a protocol error or abrupt exit. Its hello result is generated from one constant:

```ts
export const FAKE_CORE_CONTRACT = {
  protocolVersion: 1,
  contractVersion: 1,
  schemaVersion: 3,
  coreVersion: "9.9.9-test",
  storeId: "store_test",
  rootId: "root_test",
  consumerNamespaces: ["farm"],
  consumers: {
    farm: {
      namespace: "farm",
      state: "ready",
      coreMigrationRunId: "run_test_migration",
      migrationId: "fmig_test",
      stageDigest: "a".repeat(64),
      readyRecordDigest: "b".repeat(64),
      identityDigest: "c".repeat(64)
    }
  },
  methods: [
    "system.hello", "consumer.authenticate", "consumer.session.start",
    "consumer.session.end", "workspace.list", "workspace.show", "workspace.overview",
    "workspace.account.list", "workspace.account.upsert",
    "project.list", "project.show", "project.status", "project.overview",
    "document.list", "document.show", "document.revisions", "document.revise",
    "media.list", "media.show", "media.revisions", "media.select", "media.review",
    "generation.start", "transform.start", "transcription.start",
    "composition.show", "composition.build", "evaluation.list",
    "evaluation.create", "feedback.add", "repair.start", "unit.list",
    "unit.show", "unit.revise", "unit.preview",
    "publication.list", "publication.publish", "publication.reconcile", "publication.refresh",
    "metric.list", "metric.totals", "campaign.list", "campaign.show", "campaign.update",
    "calendar.list", "calendar.update", "run.list", "run.show", "run.cancel",
    "operation.find",
    "agent.providers", "agent.credential.status", "agent.turn.start",
    "agent.turn.status", "activity.list",
    "activity.subscribe", "activity.unsubscribe", "locator.resolve",
    "workspace.export", "workspace.import", "migration.consumer.map"
  ]
} as const;
```

Write failing tests for partial frames, concurrent out-of-order responses, activity events, child exit, stderr-only diagnostics, and a hello response missing one required method.

Run: `bun test tests/ralphy-cli.test.ts tests/core-contract.test.ts`

Expected: FAIL until the adapter in Task 1 exists; the old echo fixture cannot satisfy the tests.

- [ ] **Step 3: Capture the actual released contract, not a guessed version**

`scripts/capture-core-contract.ts` launches the installed binary against a disposable v2 root, performs `system.hello`, verifies every required method above plus external-run/idempotency support, then writes canonical sorted JSON containing:

```ts
type CoreContractPin = {
  package: "@alecs5am/ralphy";
  coreVersion: string;
  protocolVersion: 1;
  contractVersion: number;
  schemaVersion: number;
  methods: string[];
  consumerNamespaces: ["farm"];
  externalRunSystem: "ralphy-farm";
  farmConsumerStates: ["pending", "ready"];
};
```

The script refuses prerelease/local/sibling binaries and refuses to write when a required capability is absent. `core-contract.json` must contain the actual release values produced by this script; no wildcard, range, `latest`, or development path is allowed.

- [ ] **Step 4: Add one released-binary compatibility test**

The test launches the configured installed binary, compares hello field-for-field with `core-contract.json`, authenticates the fixture Farm token, creates a consumer Session, performs a scoped Workspace list, starts/cancels a fixture operation using external provenance, and proves tuple lookup plus a duplicate idempotency key return the original operation. It separately validates exact pending and ready `consumers.farm` DTOs; nullable store-wide activity scope is accepted. It skips only when explicitly running the isolated fake-contract unit suite; CI and Docker validation must supply the pinned released binary.

- [ ] **Step 5: Commit only the contract harness after review**

```bash
bun test tests/ralphy-cli.test.ts tests/core-contract.test.ts
git add core-contract.json scripts/capture-core-contract.ts tests/fixtures/fake-ralphy tests/fixtures/fake-core-contract.ts tests/ralphy-cli.test.ts tests/core-contract.test.ts
gitleaks protect --staged --redact
git commit -m "test(farm): pin the released core contract"
```

### Task 1: Build the sole typed installed-core adapter

**Files:**
- Modify: `src/ralphy-cli.ts`
- Modify: `src/program.ts`
- Modify: `tests/ralphy-cli.test.ts`
- Modify: `tests/program.test.ts`

**Interfaces:**
- Consumes: protocol v1 JSONL, `core-contract.json`, explicit data root, and safe core DTOs
- Produces: `createRalphyClient`, `invokeRalphyCli`, typed requests, activity subscription, operation cancellation, and internal-only locator resolution

```ts
export type CoreContext =
  | { sessionId: string }
  | { workspaceId: string; projectId?: string };

export type FarmExternalRun = {
  system: "ralphy-farm";
  runId: string;
  nodeId: string;
  attempt: number;
  operation: string;
  idempotencyKey: string;
};

export type PublicCoreMethod = Exclude<
  (typeof REQUIRED_CORE_METHODS)[number],
  "locator.resolve"
>;
export type CoreHello = {
  protocolVersion: 1;
  contractVersion: number;
  schemaVersion: number;
  coreVersion: string;
  storeId: string;
  rootId: string;
  consumerNamespaces: readonly ["farm"];
  consumers: {
    farm: null | {
      namespace: "farm";
      state: "pending" | "ready";
      coreMigrationRunId: string;
      migrationId: string;
      stageDigest: string;
      readyRecordDigest: string;
      identityDigest: string | null;
    };
  };
  methods: Array<PublicCoreMethod | "locator.resolve">;
};
export type CoreActivityEvent = {
  sequence: number;
  entityType: string;
  entityId: string;
  workspaceId: string | null;
  projectId: string | null;
  action: string;
  createdAt: number;
};

export interface RalphyClient {
  hello(): Promise<CoreHello>;
  authenticateConsumer(token: Uint8Array): Promise<void>;
  startConsumerSession(scope: { workspaceId: string; projectId?: string }): Promise<{ sessionId: string }>;
  request<T>(method: PublicCoreMethod, params: unknown, signal?: AbortSignal): Promise<T>;
  subscribeActivity(afterSequence: number, onEvent: (event: CoreActivityEvent) => void): Promise<() => Promise<void>>;
  close(): Promise<void>;
}
```

`src/ralphy-cli.ts` also owns a non-exported `LocatorResolver`. The only
exported last-mile seam is `createStudioMediaSource(...)`, which resolves and
opens a core locator internally and returns a byte stream plus MIME/length—no
path. `scripts/lint-consumer-boundary.ts` permits that symbol at exactly
`studio/server/media.ts`; no executor/control/library module can import or call
it.

- [ ] **Step 1: Make the adapter tests fail on the old one-shot wrapper**

Assert one long-lived child serves multiple requests, request IDs correlate out-of-order replies, every pending request rejects on exit, abort sends the matching cancellation method, stdout accepts JSONL only, stderr is bounded/redacted, and `locator.resolve` is rejected by the generic typed/runtime request mapper. A source scan must prove that only `src/ralphy-cli.ts` contains the literal method and only `studio/server/media.ts` imports `createStudioMediaSource`.

- [ ] **Step 2: Implement one bridge client with a bounded Buffer framer**

Spawn `[RALPHY_BIN, "bridge", "--stdio", "--root", dataRoot]` without a shell. Parse bytes by newline, enforce the limits returned by hello, serialize writes with backpressure, and cap pending requests/events. Validate hello against `core-contract.json`, including the reserved `farm` consumer namespace and exact nullable/pending/ready DTO, before exposing the client. Normal startup requires `state: "ready"`, reads `.ralphy/farm/auth.token` only after checking regular-file/no-symlink ownership and mode 0600, sends its bytes through bridge stdin to `consumer.authenticate`, zeroes the Buffer, and deletes no file. A mismatch or failed auth returns one actionable redacted `CoreContractError` and terminates the child.

For each mutation scope the adapter creates/caches one authenticated consumer
Session in memory and supplies `{ sessionId }`; it never persists the Session
ID as authority and a reconnect creates a new Session. Graceful `close()` ends
idle cached Sessions; an abrupt disconnect revokes their connection authority,
and terminal-operation cleanup ends them when no Run remains active. Read-only calls may use
explicit scope. Every Farm operation request contains the full external tuple
and key, while core derives the system from that Session. On a lost response,
the adapter first calls `operation.find` by tuple/key and returns the recorded
Run/results rather than starting work again.

The bridge process may inherit environment-owned core credential variables because core captures and clears its allowlist at startup; Farm must never inspect, copy into journal data, or forward that environment to any other child.

`createMigrationRalphyClient(grantPath)` is a separate maintenance-only adapter
used only from `cli/lib/migration/**`. It requires a regular, owner-readable
mode-0600 grant, validates its canonical shape/digest and exact
`consumers.farm.state: "pending"`, and may call only
`system.hello`/`migration.consumer.map`. It sends the Run ID, lock nonce, grant
digest, source identity ID, and inventory digest from that grant; it never
accepts those values from ordinary command flags, returns grant contents, or
falls through to the normal authenticated client.

- [ ] **Step 3: Keep one-shot CLI invocation inside the same file**

`invokeRalphyCli(args, { root })` exists only for core-owned portable export/import and migration commands that intentionally return a derived export path. It always adds `--root <data-root> --json`, parses one JSON value, caps stdout/stderr, validates the result, and never exposes argv/env/path data to Farm activity or Studio.

- [ ] **Step 4: Replace root mutation in the Commander program**

Remove `setRoot()` from `src/program.ts`. Add required/derived `--root <path-to-.ralphy>` and pass a `FarmRuntime` containing `dataRoot` plus a lazily created `RalphyClient` to commands. `--cwd` may remain only as a deprecated discovery input delegated to core; it never chooses Workspace scope.

- [ ] **Step 5: Verify and commit the adapter**

```bash
bun test tests/ralphy-cli.test.ts tests/program.test.ts tests/core-contract.test.ts
git add src/ralphy-cli.ts src/program.ts tests/ralphy-cli.test.ts tests/program.test.ts
git commit -m "refactor(farm): use the installed core bridge"
```

### Task 2: Move Farm-owned state into an ID-based namespace

**Files:**
- Create: `cli/lib/farm/ids.ts`
- Create: `cli/lib/farm/paths.ts`
- Create: `cli/lib/farm/refs.ts`
- Create: `cli/lib/farm/store.ts`
- Create: `cli/lib/farm/definitions.ts`
- Create: `cli/lib/farm/ingestion.ts`
- Create: `cli/lib/farm/selection.ts`
- Create: `cli/lib/farm/annotations.ts`
- Modify: `cli/lib/farm/runner.ts`
- Modify: `cli/lib/farm/node-cache.ts`
- Modify: `cli/lib/farm/dead-letter.ts`
- Modify: `cli/lib/farm/publish-mode.ts`
- Modify: `cli/lib/farm/webhook.ts`
- Modify: `cli/lib/trust.ts`
- Modify: `cli/lib/agent-inbox.ts`
- Modify: `cli/lib/config-patches.ts`
- Modify: `cli/lib/run.ts`
- Modify: `cli/commands/farm.ts`
- Modify: `cli/commands/run.ts`
- Test: `tests/unit/farm-store.test.ts`
- Modify: `tests/unit/farm-node-cache.test.ts`
- Modify: `tests/unit/farm-dead-letter.test.ts`
- Modify: `tests/unit/farm-webhook.test.ts`
- Modify: `tests/unit/run-status.test.ts`

**Interfaces:**
- Consumes: core `storeId`, stable Workspace/Project IDs, and one canonical data root
- Produces: the only Farm storage API, opaque Farm IDs, path-free refs, and replayable Farm activity

```text
.ralphy/farm/
  identity.json
  auth.token
  global/policy.json
  locks/<workspace-id>.lock/
  workspaces/<workspace-id>/
    policy.json
    workflows/<workflow-id>/identity.json
    workflows/<workflow-id>/revisions/<workflow-revision-id>.json
    subgraphs/<subgraph-id>/identity.json
    subgraphs/<subgraph-id>/revisions/<subgraph-revision-id>.json
    ingestion/cursors.json
    ingestion/seen.jsonl
    ingestion/topic-index.jsonl
    selection/weights.jsonl
    selection/lifecycle.jsonl
    runs/<farm-run-id>/run.json
    runs/<farm-run-id>/definition.json
    runs/<farm-run-id>/state.json
    runs/<farm-run-id>/events.jsonl
    runs/<farm-run-id>/intermediate/<node-id>/<key>
    approvals.jsonl
    inbox/<inbox-id>.json
    config-patches.jsonl
    dead-letter.jsonl
    node-cache.jsonl
    activity.jsonl
    annotations.jsonl
    canvas/runs/<farm-run-id>.json
    canvas/projects/<project-id>.json
    trust-audit.jsonl
    trust-agreement.jsonl
    publish-policy-audit.jsonl
    webhook-token-digests.json
```

- [ ] **Step 1: Write failing namespace and identity tests**

Create a Workspace whose slug is renamed through fake core while its ID stays fixed. Assert every Farm path and reference remains unchanged, no directory contains the slug, and no write appears under `.ralphy/workspaces`, a Project bucket, or `ralphy.db`. Revise/select one workflow and subgraph while an older Farm Run is parked; resume must read its unchanged `definition.json`/digest while a new Run uses the newly selected revisions. Exercise cursor monotonicity and append-only seen/topic/weight/lifecycle/annotation records.

- [ ] **Step 2: Define the stable reference vocabulary**

```ts
export type CoreEntityRef = {
  source: "core";
  type: "document-revision" | "artifact-revision" | "composition-revision" |
    "build" | "evaluation" | "unit-revision" | "presentation" |
    "publication" | "metric-snapshot" | "run" | "social-account" |
    "campaign" | "calendar-entry";
  id: string;
};

export type FarmIntermediateRef = {
  source: "farm";
  type: "intermediate";
  runId: string;
  nodeId: string;
  key: string;
  sha256: string;
  bytes: number;
};

export type JsonValue = null | boolean | number | string | JsonValue[] |
  { [key: string]: JsonValue };

export type FarmActivityEvent = {
  sequence: number;
  id: string;
  workspaceId: string;
  entityType: "workflow" | "subgraph" | "farm-run" | "approval" | "inbox" |
    "policy" | "ingestion" | "selection" | "annotation" | "layout";
  entityId: string;
  action: string;
  createdAt: string;
};

export type FarmWorkflowIdentity = {
  id: string;
  workspaceId: string;
  slug: string;
  selectedRevisionId: string;
  rowVersion: number;
};
export type FarmWorkflowRevision = {
  id: string;
  workflowId: string;
  revisionNo: number;
  parentRevisionId: string | null;
  graph: WorkflowGraph;
  digest: string;
  createdAt: string;
};
export type FarmRunDefinition = {
  workflowRevisionId: string;
  subgraphRevisionIds: string[];
  expandedGraph: WorkflowGraph;
  expandedGraphDigest: string;
};
export type FarmRun = {
  id: string;
  workspaceId: string;
  workflowId: string;
  workflowRevisionId: string;
  expandedGraphDigest: string;
  state: "running" | "parked-approval" | "halted-budget" |
    "halted-failure" | "complete" | "cancelled";
  version: number;
};
export type FarmRunEvent = {
  id: string;
  sequence: number;
  kind: string;
  nodeId?: string;
  attempt?: number;
  refs?: Array<CoreEntityRef | FarmIntermediateRef>;
  createdAt: string;
};
export type PutFarmIntermediateInput = {
  workspaceId: string;
  runId: string;
  nodeId: string;
  key: string;
  sourcePath: string;
};
export type FarmActivityPage = {
  items: FarmActivityEvent[];
  nextSequence: number | null;
};

export interface FarmStore {
  readWorkflow(workspaceId: string, workflowId: string): FarmWorkflowIdentity;
  readWorkflowRevision(workspaceId: string, revisionId: string): FarmWorkflowRevision;
  reviseWorkflow(workspaceId: string, workflowId: string, graph: WorkflowGraph, expectedSelectedRevisionId: string | null): FarmWorkflowRevision;
  selectWorkflowRevision(workspaceId: string, workflowId: string, revisionId: string, expectedSelectedRevisionId: string): FarmWorkflowIdentity;
  readRun(workspaceId: string, farmRunId: string): FarmRun;
  readRunDefinition(workspaceId: string, farmRunId: string): FarmRunDefinition;
  appendRunEvent(workspaceId: string, farmRunId: string, event: FarmRunEvent): void;
  putIntermediate(input: PutFarmIntermediateInput): Promise<FarmIntermediateRef>;
  readIngestionCursor(workspaceId: string, topic: string): string | null;
  advanceIngestionCursor(workspaceId: string, topic: string, iso: string): void;
  appendSeenItems(workspaceId: string, rows: JsonValue[]): void;
  appendTopicRecords(workspaceId: string, rows: JsonValue[]): void;
  appendSelectionWeights(workspaceId: string, row: JsonValue): void;
  appendLifecycleEvent(workspaceId: string, row: JsonValue): void;
  listActivity(workspaceId: string, afterSequence: number, limit: number): FarmActivityPage;
}
```

Validate IDs and POSIX-relative intermediate keys at every read/write boundary. No union member contains a local path.
`FarmSubgraphIdentity`/`FarmSubgraphRevision` mirror the workflow identity and
immutable-revision shape with typed entry/exit ports and a canonical digest.

- [ ] **Step 3: Implement one locked Farm store**

`identity.json` binds the namespace to core `storeId` and Farm schema version. JSON snapshots use sibling temp + fsync + atomic rename. JSONL uses one append write. A per-Workspace lock is an atomic `mkdir`; a lock is never silently reclaimed after a crash, and `farm doctor` reports the exact safe recovery command/nonce. Mutations append a path-free `FarmActivityEvent` with a monotonic per-Workspace sequence while holding the same lock.

`identity.json` additionally carries the installed Farm migration/stage and the
SHA-256 digest of `auth.token`, never its value. The token is 32 random bytes,
created once at mode 0600 with the staged namespace and preserved byte-for-byte
on install/recovery. A changed/missing token or digest is blocking; it is never
regenerated over an existing identity.

Workflow/subgraph identity files are optimistic selected pointers only.
Revision files are create-once canonical JSON whose digest covers the complete
graph/ports/params and parent; existing revision bytes can never be replaced or
deleted. Creating a Farm Run resolves the selected workflow and every selected
subgraph, expands once, writes immutable `definition.json` with exact revision
IDs plus canonical expanded digest, and only then writes mutable operational
state. Resume/evaluation reads that snapshot, never the current pointer.
Selecting an older revision is legal only with the exact current selected ID.

Reads tolerate only a torn final JSONL line; malformed earlier lines are errors. Add optimistic `expectedVersion` to policy/snapshot changes. Keep intermediate bytes only under the named Farm run and record hash/size before a ref is journaled.

Ingestion cursors are monotonic per topic; seen/topic/weight/lifecycle and
annotations are append-only. Lifecycle preserves upgrade, rollback, pin,
retire, unpin, and unretire variants. Project board choices are not Farm state:
an exact media choice becomes core Artifact selection. Project/run canvas
layout and workflow-node/Farm-run annotations remain Farm rows keyed only by
stable IDs.

- [ ] **Step 4: Move policy and execution state behind the store**

Rewrite the listed modules to receive `{ store, workspaceId }`; remove slug/path helpers and `workspace.json` reads. Trust, publish mode, quota/cadence, notifications, webhook metadata, dead letters, node cache, approvals, inbox, patches, ingestion cursors/seen/topic index, selection weights/lifecycle, immutable definitions, annotations/layout, and run journals remain Farm-owned. Core evaluation/Unit/Publication facts are refs, never copied fields.

Webhook creation/rotation returns a 256-bit token once, stores only `sha256(token)` plus timestamps, and `studio/server/hooks.ts` later uses `timingSafeEqual` on digests. Existing plaintext tokens are handled only by Task 3 migration.

- [ ] **Step 5: Verify and commit the Farm store**

```bash
bun test tests/unit/farm-store.test.ts tests/unit/farm-node-cache.test.ts tests/unit/farm-dead-letter.test.ts tests/unit/farm-webhook.test.ts tests/unit/run-status.test.ts
git add cli/lib/farm/ids.ts cli/lib/farm/paths.ts cli/lib/farm/refs.ts cli/lib/farm/store.ts cli/lib/farm/definitions.ts cli/lib/farm/ingestion.ts cli/lib/farm/selection.ts cli/lib/farm/annotations.ts cli/lib/farm/runner.ts cli/lib/farm/node-cache.ts cli/lib/farm/dead-letter.ts cli/lib/farm/publish-mode.ts cli/lib/farm/webhook.ts cli/lib/trust.ts cli/lib/agent-inbox.ts cli/lib/config-patches.ts cli/lib/run.ts cli/commands/farm.ts cli/commands/run.ts tests/unit/farm-store.test.ts tests/unit/farm-node-cache.test.ts tests/unit/farm-dead-letter.test.ts tests/unit/farm-webhook.test.ts tests/unit/run-status.test.ts
gitleaks protect --staged --redact
git commit -m "refactor(farm): store automation state by stable id"
```

### Task 3: Add a resumable legacy Farm-state migration before core cutover

**Files:**
- Create: `cli/lib/migration/legacy.ts`
- Create: `cli/lib/migration/journal.ts`
- Create: `cli/lib/migration/farm-state.ts`
- Create: `cli/commands/migrate.ts`
- Modify: `src/program.ts`
- Test: `tests/unit/farm-state-migration.test.ts`
- Test: `tests/integration/farm-migrate.test.ts`
- Create: `tests/fixtures/farm-migration/build-legacy-farm.ts`

**Interfaces:**
- Consumes: untouched legacy `.ralphy`, the exact mode-0600 core `MigrationConsumerGrant`, a queryable core migration stage, and core `migration.consumer.map`
- Produces: `ralphy-farm migrate audit|run|resume|status|verify|install|recover`, a complete coverage ledger, a verified staged `farm/` tree, and the canonical core `ConsumerReadyRecord`

- [ ] **Step 1: Build a fixture and failing coverage test**

The fixture includes two Workspace slugs, a renamed Workspace, workflows/subgraphs/schedules, active/completed/parked runs, events, node cache, dead letters, approvals, inbox packs, project board choice/layout, run canvas layout, project/run/workflow-node annotations, config patches, trust/publish/quota history, ingestion cursor/seen/topic index, selection-weight history, mixed lifecycle upgrade/rollback/pin/retire events, cadence/notifications, referenced prompt files, calendar schedule plus dated entries, campaign and social-account links, a plaintext webhook token, malformed JSONL, one absolute Artifact path, one symlink, an empty file, and a crash after every journal phase.

Assert audit changes no source file/listing/mtime, creates no stage/lock/journal, and counts every file/directory/link exactly once.

- [ ] **Step 2: Define the external stage and journal**

```text
<source-parent>/.ralphy-farm-staging/<migration-id>/farm/
<source-parent>/.ralphy-farm-staging/<migration-id>/entries.jsonl
<source-parent>/.ralphy-farm-migration-<migration-id>.journal.json
<source-parent>/.ralphy-farm-ready-<migration-id>.json
```

Journal phases are `audited -> inventoried -> mapped -> transformed -> verified -> ready -> installed`; errors leave the last resumable phase. Every transition is an atomic mode-0600 write plus fsync. Record source device/inode/mode/count/bytes/digest, core-stage Run ID/`storeId`/contract, maintenance-grant digest, mapping digest, staged digest, and target identity. At `ready`, atomically write the mode-0600 canonical `ConsumerReadyRecord` containing namespace `farm`, Farm/core migration IDs, target `storeId`, maintenance-grant/source-inventory/mapping/stage digests, and creation time; a retry returns the byte-identical record. Never infer a root from cwd or follow symlinks.

- [ ] **Step 3: Map ownership and stable IDs without opening core SQLite**

Require `--core-grant <path>` and query the core migration stage only through the maintenance client in `src/ralphy-cli.ts`. Validate the grant's mode/digest, Run/store/contract, source identity list and inventory/mapping digests before the first query. `migration.consumer.map` receives the matching grant digest/nonce/source identity ID and returns maintenance-only mappings from inventoried legacy Workspace/Project/control/media locators to stable IDs; Farm persists only source-path hashes and target IDs. A missing, extra, stale, or ambiguous mapping is blocking. No Farm code reads a core journal or SQLite file to obtain the nonce.

Use these terminal dispositions:

| Disposition | Result |
|---|---|
| `farm-policy` | normalized policy snapshot/audit |
| `farm-definition` | Workflow/Subgraph/schedule-node definition with stable ID refs |
| `farm-run` | run/state/events/intermediate refs |
| `farm-approval` | approval/inbox/patch/layout state |
| `farm-ingestion` | cursor/seen/topic-index state keyed by Workspace ID |
| `farm-selection` | weight snapshots plus lifecycle upgrade/rollback/flag events |
| `farm-annotation` | workflow-node/Farm-run annotations and project/run canvas layout |
| `farm-cache` | node-cache/dead-letter/notification evidence |
| `core-owned` | exact core entity ID already imported by core |
| `secret-digest` | webhook token replaced by digest; plaintext remains only in recovery |
| `recovery-only` | system/unsupported entry retained in legacy recovery |
| `issue` | explicit blocking ambiguity or malformed evidence |

Calendar cadence/schedule policy stays Farm; dated Unit/Publication entries are `core-owned`. Campaign/domain facts are `core-owned`; Farm crosslink/run events retain only mapped IDs. Prompt, composition, Artifact, generation, evaluation, publish-ledger, analytics, spend, and Unit files are never copied into Farm state.

Legacy workflow/subgraph files become immutable revision 1 with selected
pointers. Resolve referenced prompt files into that revision or a stable core
Document revision before hashing. Each migrated Run gets an immutable expanded
definition snapshot and digest based on the exact legacy definitions visible at
its recorded start; ambiguity blocks. Board choices with an exact mapped
Artifact revision are already applied by core and are not copied; layout
remains Farm. Core-target annotations are already Evaluation/feedback refs;
only workflow-node/Farm-run annotations become Farm records.

- [ ] **Step 4: Transform and verify without touching the source**

Generate future Farm IDs with `crypto.randomUUID()` and deterministic legacy IDs from `sha256(storeId + kind + sourceIdentity)`. Rewrite graph inputs from path strings to validated `CoreEntityRef` or `FarmIntermediateRef`. Preserve unknown/malformed raw evidence in the untouched recovery source and a redacted issue row; do not silently discard a valid sibling JSONL line.

Verification requires 100% terminal coverage, exact source byte accounting, unchanged source digest, no slug-keyed directory, no absolute path/core bucket key/plaintext token/legacy core filename in staged Farm data, all core refs resolvable, all append-only sequences ordered, and clean staged hashes.

Require every persisted `social-account`, `campaign`, and `calendar-entry` ref
to resolve through the map. The live migration keeps account identity but never
copies a credential value/ref; configured status is verified through core.
Generate `.ralphy/farm/auth.token` as 32 random bytes at mode 0600 in the stage,
write only its digest to `identity.json`, and scan every staged report/event for
zero token occurrence.

- [ ] **Step 5: Implement guarded post-core installation and recovery**

`install` is unavailable until the prepared stage is `ready`, core cutover consumed the exact ready-record/grant digests, and the newly cut-over live core hello reports the exact `consumers.farm` pending DTO with the recorded migration/store/protocol/contract/schema/stage facts. `identity.json` carries that `storeId`, Farm migration ID, stage digest, and auth-token digest. With all Farm/Studio writers stopped, atomically rename the exact staged `farm/` directory to `<live-data-root>/farm`, fsync the parent, re-verify identity plus mode-0600 token, then mark installed and require hello to return the exact ready DTO and identity digest. A pre-existing destination, identity/token/grant mismatch, changed stage, or different pending consumer blocks. `recover` either completes the exact rename or leaves both generations; it never overwrites, merges, copies, or deletes.

Run:

```bash
bun test tests/unit/farm-state-migration.test.ts tests/integration/farm-migrate.test.ts
git add cli/lib/migration/legacy.ts cli/lib/migration/journal.ts cli/lib/migration/farm-state.ts cli/commands/migrate.ts src/program.ts tests/unit/farm-state-migration.test.ts tests/integration/farm-migrate.test.ts tests/fixtures/farm-migration/build-legacy-farm.ts
gitleaks protect --staged --redact
git commit -m "feat(farm): add resumable automation-state migration"
```

### Task 4: Convert the runner and executors to core operations and stable refs

**Files:**
- Modify: `cli/lib/workflow/executors/types.ts`
- Modify: `cli/lib/workflow/executors/index.ts`
- Modify: `cli/lib/workflow/executors/ralphy-verbs.ts`
- Modify: `cli/lib/workflow/executors/media.ts`
- Modify: `cli/lib/workflow/executors/llm.ts`
- Modify: `cli/lib/workflow/executors/coding-agent.ts`
- Modify: `cli/lib/workflow/executors/ingestion.ts`
- Modify: `cli/lib/workflow/executors/control-flow.ts`
- Modify: `cli/lib/workflow/executors/calendar.ts`
- Modify: `cli/lib/workflow/executors/campaign.ts`
- Modify: `cli/lib/farm/runner.ts`
- Modify: `cli/lib/workflow.ts`
- Modify: `cli/lib/workflow-graph.ts`
- Modify: `cli/commands/workflow.ts`
- Modify: `tests/unit/workflow-executors.test.ts`
- Modify: `tests/unit/workflow-executors-ralphy-verbs.test.ts`
- Modify: `tests/unit/workflow-executors-media.test.ts`
- Modify: `tests/unit/farm-runner.test.ts`
- Modify: `tests/integration/farm-e2e.test.ts`

**Interfaces:**
- Consumes: `RalphyClient`, `FarmStore`, stable input refs, and `FarmExternalRun`
- Produces: path-free executor results and crash-safe idempotent core operations

```ts
export interface ExecutorContext {
  workspaceId: string;
  projectId?: string;
  farmRunId: string;
  nodeId: string;
  attempt: number;
  coreSessionId: string;
  inputs: Record<string, JsonValue | CoreEntityRef | FarmIntermediateRef>;
  core: RalphyClient;
  farm: FarmStore;
  reportCost: (coreRunId: string) => void;
  now?: () => Date;
}

export interface ExecutorResult {
  output: JsonValue | CoreEntityRef | FarmIntermediateRef |
    Array<JsonValue | CoreEntityRef | FarmIntermediateRef>;
  refs?: Array<CoreEntityRef | FarmIntermediateRef>;
  deactivate?: string[];
}
```

- [ ] **Step 1: Rewrite tests to forbid `artifactPath`**

Make executor and runner fixtures return stable refs. Assert serialized run events/cache/dead letters contain the exact ref IDs and no `path`, `locator`, `bucket`, `key` for core data, provider payload, or legacy filename. A deliberate old-shaped result must fail validation before it is journaled.

- [ ] **Step 2: Convert `ralphy-verbs.ts` one operation at a time**

Map generate/social-copy/captions to `generation.start`, render to `composition.build`, evaluation to `evaluation.create`, repair to `repair.start`, and Unit creation to `unit.revise`. Each call includes explicit core context, external provenance, and:

```ts
const external = {
  system: "ralphy-farm" as const,
  runId: farmRunId,
  nodeId: node.id,
  attempt,
  operation,
  idempotencyKey: [
    "ralphy-farm", farmRunId, node.id, String(attempt), operation
  ].join("/"),
};
```

The adapter supplies the authenticated consumer Session and core verifies that
the request Session belongs to that principal/scope. The executor records
returned core Run/entity IDs. Retrying the same attempt first calls
`operation.find` and returns the same operation; a deliberate Farm retry
increments `attempt` and creates a new core attempt/revision according to the
core contract. A caller-supplied `system` mismatch is rejected and never changes
the server-derived external system.

Delete the path-shaped `resolveProject`, `pathFromValue`, `updateManifestSlot`,
and in-process `runMediaGeneration` seams. Replace them with ID validation,
typed core refs, and one adapter call; no compatibility helper may synthesize an
Artifact revision from a filename.

- [ ] **Step 3: Convert direct media/provider/agent execution**

Route t2i/i2i/t2v/i2v/r2v/v2v/lipsync/tts/music/sfx through `generation.start`; remove-bg/reframe/crunch through `transform.start`; transcribe through the core transcription operation; LLM and coding-agent nodes through core generation/agent-turn methods. Registered provider/credential selection is an ID/config input to core, never a Farm connector object or secret.

Keep generic allowlisted non-provider HTTP and pure graph transforms in Farm. Provider-host blocking remains mandatory for the generic HTTP node.

- [ ] **Step 4: Rework runner resume/cache/budget semantics**

`executeGraphRun` creates only the Farm run namespace and journals stable refs. It loads the immutable `definition.json` expanded graph/digest; it never reloads a selected Workflow/Subgraph revision during resume. It resolves Farm intermediates through `FarmStore`; core locators are requested only inside adapter-backed read helpers and immediately discarded. Node-cache entries store input hashes and stable refs; a cache hit first proves referenced core entities still exist. Cost and budget checks query core Runs by external Farm tuple instead of reading `generations.jsonl`.

Replace `createRun`, path artifacts, legacy workspace/project existence checks, `run.json` rewrites outside the Farm store, and direct generation-log writes. `resumeIncompleteRuns` derives exact completed attempts from Farm events and core idempotency, so a crash after core success but before Farm append recovers the original core result without duplication.

Cover that crash window independently for `generation.start`,
`composition.build`, and `unit.revise`: delete/suppress
the Farm completion append after the core response, restart the runner, and
require tuple/key lookup to restore the original Run and result IDs without a
second provider call, Build, Unit revision, or Farm event. Task 5 applies the
same matrix to Publication and Metric refresh after those executors are converted.

- [ ] **Step 5: Verify and commit executor conversion**

```bash
bun test tests/unit/workflow-executors.test.ts tests/unit/workflow-executors-ralphy-verbs.test.ts tests/unit/workflow-executors-media.test.ts tests/unit/farm-runner.test.ts tests/integration/farm-e2e.test.ts
git add cli/lib/workflow/executors/types.ts cli/lib/workflow/executors/index.ts cli/lib/workflow/executors/ralphy-verbs.ts cli/lib/workflow/executors/media.ts cli/lib/workflow/executors/llm.ts cli/lib/workflow/executors/coding-agent.ts cli/lib/workflow/executors/ingestion.ts cli/lib/workflow/executors/control-flow.ts cli/lib/workflow/executors/calendar.ts cli/lib/workflow/executors/campaign.ts cli/lib/farm/runner.ts cli/lib/workflow.ts cli/lib/workflow-graph.ts cli/commands/workflow.ts tests/unit/workflow-executors.test.ts tests/unit/workflow-executors-ralphy-verbs.test.ts tests/unit/workflow-executors-media.test.ts tests/unit/farm-runner.test.ts tests/integration/farm-e2e.test.ts
git commit -m "refactor(farm): execute workflows through core ids"
```

### Task 5: Move publishing, analytics, spend, selection, and campaign facts to core

**Files:**
- Modify: `cli/lib/workflow/executors/publish.ts`
- Modify: `cli/lib/workflow/executors/analytics.ts`
- Modify: `cli/lib/publish/publish.ts`
- Modify: `cli/lib/publish/article.ts`
- Modify: `cli/lib/publish/ledger.ts`
- Modify: `cli/lib/publish/quota.ts`
- Modify: `cli/lib/publish/attribution.ts`
- Modify: `cli/lib/analytics/pull.ts`
- Modify: `cli/lib/analytics/postmortem.ts`
- Modify: `cli/lib/analytics/roi.ts`
- Modify: `cli/lib/spend.ts`
- Modify: `cli/lib/selection.ts`
- Modify: `cli/lib/review-card.ts`
- Modify: `cli/lib/distribution.ts`
- Modify: `cli/lib/campaign/crosslink.ts`
- Modify: `cli/lib/campaign/report.ts`
- Modify: `cli/lib/campaign/store.ts`
- Modify: `cli/lib/calendar/store.ts`
- Modify: `tests/unit/publish.test.ts`
- Modify: `tests/unit/publish-ledger.test.ts`
- Modify: `tests/unit/publish-quota.test.ts`
- Modify: `tests/unit/run-budget.test.ts`
- Modify: `tests/unit/selection.test.ts`
- Modify: `tests/unit/selection-bias-532.test.ts`
- Test: `tests/unit/core-delivery-routing.test.ts`

**Interfaces:**
- Consumes: core Unit presentation, Publication, Metric, Run/cost, campaign, calendar, Evaluation, and feedback DTOs
- Produces: Farm scheduling/trust/quota decisions that reference core attempts without duplicating domain/provider state

- [ ] **Step 1: Write a failing delivery-routing journey**

Use the fake bridge to create a Unit whose latest and selected revisions differ,
choose the selected revision's exact Presentation/effective caption/options,
have Farm cadence/quota/trust choose `scheduleAt`, call one publication,
refresh multi-source metric snapshots, and build selection/ROI/review output.
Assert only Farm policy/audit and stable Publication/Metric IDs land in the Farm
namespace; no publish ledger, provider response, metric payload, or cost row is
written there.

- [ ] **Step 2: Keep policy in Farm and move execution to core**

Trust, kill-switch, cadence, and quota functions remain pure Farm decisions.
`publish.ts` and article publishing call `publication.publish` with the exact
selected Unit revision, Presentation, effective caption revision/options,
social-account ID when the rail requires one, scheduled instant, authenticated
consumer Session, external tuple, and idempotency key. Core owns the exclusive
submission claim/fence plus the dedicated submission Run/RunAttempt for that
single target. Immediate acceptance remains `submitted`; scheduled
acceptance remains `scheduled`. `reconciliation_required`/`unknown` parks the
Farm node and invokes `publication.reconcile` with a distinct external Run and
fresh reconciliation fence; it never retries the POST, reclaims an expired
submission fence, or marks success from an uncertain response. A confirmed
failure/revision uses a new attempt/key and optional immutable `revisedFrom`
Publication ID. Farm never
calls Postiz/dev.to/Hashnode/X/YouTube APIs or reads their credentials.

Use portable account descriptors and relink maps for provider rails. Preserve
accountless `github-pages`/`manual` and validated historical account-resolution
failures without inventing an account. Medium output is a core RunObject plus
approval artifact; it is not a Publication until a later confirmed `manual`
post. An idempotent skip is represented by core Activity and the original
Publication ID, never a synthetic Farm/core attempt.

`ledger.ts` becomes a thin core Publication query adapter and then can be deleted when its callers consume core DTOs directly. Exactly-once comes from core publication idempotency, not a Farm JSONL ledger.

- [ ] **Step 3: Query metrics, cost, campaigns, and calendar state**

Analytics refresh calls core with external provenance and stores only returned
snapshot IDs in the Farm event; replay returns those IDs. Postmortem/ROI/report/
selection/distribution/review-card query bounded core Metric/Publication/Run/
Evaluation/Unit lists. Cumulative metrics request an as-of/window and use the
core newest snapshot per Publication across all sources by default. With an
explicit source filter, they use the newest snapshot per Publication within
that source. They never sum historical snapshots or two provider sources for
one Publication. Nullable CTR, retention curve, average-view-duration, note,
and raw provider extensions remain nullable DTO fields; Farm never turns
unknown into zero. Campaign and dated calendar mutations go to core; Farm retains only
workflow schedule/cadence policy and stable social-account/campaign/calendar
refs in run events.

No aggregate may infer state from files or duplicate a provider metric payload. Preserve existing user-facing result shapes where they are ID-safe; remove legacy path fields rather than filling them with synthetic values.

- [ ] **Step 4: Cover failure and replay boundaries**

Test freeze/safe mode prevents the provider call, stale core state returns
`E_CONFLICT`, competing publish workers yield one claim, a stale fence cannot
finish, duplicate/uncertain idempotency never makes a second provider attempt,
an expired submission attempt is terminalized and cannot be reclaimed,
reconciliation uses its own Run/fresh fence and only looks up/resolves,
reconciliation resolves or preserves unknown state, and failed publication
retry uses a new Farm attempt/key. Metric refresh appends source/as-of/window
snapshots once, crash replay returns the same IDs, default newest-per-
Publication and explicit-source totals do not double-count, and selection/ROI
remain deterministic across pagination. Also cover selected-versus-latest Unit
resolution, exact effective caption/options, rail/account validation,
`revisedFrom`, and Medium export without a Publication.

- [ ] **Step 5: Verify and commit delivery conversion**

```bash
bun test tests/unit/publish*.test.ts tests/unit/run-budget.test.ts tests/unit/selection*.test.ts tests/unit/core-delivery-routing.test.ts
git add cli/lib/workflow/executors/publish.ts cli/lib/workflow/executors/analytics.ts cli/lib/publish/publish.ts cli/lib/publish/article.ts cli/lib/publish/ledger.ts cli/lib/publish/quota.ts cli/lib/publish/attribution.ts cli/lib/analytics/pull.ts cli/lib/analytics/postmortem.ts cli/lib/analytics/roi.ts cli/lib/spend.ts cli/lib/selection.ts cli/lib/review-card.ts cli/lib/distribution.ts cli/lib/campaign/crosslink.ts cli/lib/campaign/report.ts cli/lib/campaign/store.ts cli/lib/calendar/store.ts tests/unit/publish.test.ts tests/unit/publish-ledger.test.ts tests/unit/publish-quota.test.ts tests/unit/run-budget.test.ts tests/unit/selection.test.ts tests/unit/selection-bias-532.test.ts tests/unit/core-delivery-routing.test.ts
git commit -m "refactor(farm): delegate delivery state to core"
```

### Task 6: Split portable bundles at the ownership boundary

**Files:**
- Modify: `cli/lib/bundle.ts`
- Modify: `cli/lib/schemas/bundle.ts`
- Create: `cli/commands/bundle.ts`
- Modify: `src/program.ts`
- Modify: `docs/workspace-bundle.md`
- Modify: `docs/architecture/farm-node-graph.md`
- Modify: `tests/unit/workflow-graph.test.ts`
- Test: `tests/unit/farm-bundle.test.ts`

**Interfaces:**
- Consumes: core `workspace.export|workspace.import` portable archive contract and Farm definitions/policy defaults
- Produces: a resumable compound bundle whose live import writes each owner's state through that owner

```text
bundle.zip
  manifest.yaml
  core/workspace.ralphy.zip
  farm/workflows/<workflow-id>/identity.json
  farm/workflows/<workflow-id>/revisions/<workflow-revision-id>.json
  farm/subgraphs/<subgraph-id>/identity.json
  farm/subgraphs/<subgraph-id>/revisions/<subgraph-revision-id>.json
  farm/policy-defaults.json
  farm/id-map.json
```

- [ ] **Step 1: Write failing export/import/upgrade tests**

The fake core export supplies a portable core archive with Documents,
Composition sources, reference Objects, non-secret social-account descriptors,
campaigns, and calendar entries. Assert Farm never opens that archive or source
bucket paths. Import must call core first, receive `{ workspaceId, entityIdMap,
relinkRequired }`, rewrite every `social-account`, `campaign`, and
`calendar-entry` Farm ref through that complete map, then atomically install the
Farm definitions. Imported account refs remain present but publication is
blocked until each required account is explicitly relinked through core. A
crash after core import resumes by bundle ID and does not create a second
Workspace.

- [ ] **Step 2: Redefine the manifest**

Keep stable `bundleId`, monotonic version, and Farm trust default. Replace `ralphyVersionFloor`/`requiredConnectorKeys` with the exact pinned core contract range and core capability/provider IDs; credential readiness is queried as configured/missing status through core, never inferred from Farm environment variables.

The bundle includes automation know-how only: selected workflow/subgraph
identities plus every immutable revision needed by those selections,
schedule policy, and the opaque core portable export. Project media/history,
Farm run state, approvals, cache, dead letters, metrics, publications, auth
token, and other secrets are never bundled.

- [ ] **Step 3: Implement resumable owner-ordered import and upgrade**

Journal `prepared -> core-imported -> farm-installed -> complete` below `.ralphy/farm/imports/<operation-id>.json`. Core import receives the bundle ID as idempotency key. Farm validates every returned mapped ID and required-relink record before its atomic definition installation. If Farm installation fails, leave the imported core Workspace/revisions intact and resumable; never delete core rows to fake rollback.

Upgrade creates immutable core revisions through core import and immutable Farm
workflow/subgraph revisions with stable identity IDs. Rollback changes only the
selected Farm revision pointers with expected-current checks and selects the
prior exact core revision IDs; it never overwrites a definition file or copies
core state. A Farm Run created before either operation remains bound to its
original expanded definition digest.

- [ ] **Step 4: Expose Farm-owned commands and update docs**

Register `ralphy-farm bundle export|import|upgrade|rollback`. Studio calls these Farm commands through its Farm control API; it no longer routes bundle operations to a hand-copied core implementation. Document the two-owner archive and recovery semantics.

- [ ] **Step 5: Verify and commit the bundle split**

```bash
bun test tests/unit/farm-bundle.test.ts tests/unit/workflow-graph.test.ts
git add cli/lib/bundle.ts cli/lib/schemas/bundle.ts cli/commands/bundle.ts src/program.ts docs/workspace-bundle.md docs/architecture/farm-node-graph.md tests/unit/farm-bundle.test.ts tests/unit/workflow-graph.test.ts
git commit -m "refactor(farm): split portable bundle ownership"
```

### Task 7: Convert Studio from path scanning to core/Farm entity APIs

**Files:**
- Modify: `studio/server/lib.ts`
- Modify: `studio/server/index.ts`
- Create: `studio/server/media.ts`
- Modify: `studio/server/control.ts`
- Modify: `studio/server/annotations.ts`
- Modify: `studio/server/approvals.ts`
- Modify: `studio/server/inbox.ts`
- Modify: `studio/server/graph.ts`
- Modify: `studio/server/hooks.ts`
- Modify: `studio/server/patches.ts`
- Modify: `studio/server/capabilities.ts`
- Modify: `studio/client/src/studio.tsx`
- Modify: `studio/client/src/storybook.tsx`
- Modify: `tests/studio-cli-routing.test.ts`
- Modify: `studio/test/server.test.ts`
- Modify: `studio/test/farm-api.test.ts`
- Modify: `studio/test/approvals-api.test.ts`
- Modify: `studio/test/hooks-api.test.ts`
- Modify: `studio/test/ui-smoke.test.ts`

**Interfaces:**
- Consumes: one injected `RalphyClient`, `FarmStore`, core activity sequence, Farm activity sequence, and stable IDs
- Produces: path-free Studio APIs/UI, private media tickets, and two-source resumable live updates

- [ ] **Step 1: Rewrite server tests around IDs before implementation**

Seed no `.ralphy/workspaces` tree. Serve fake core Workspace/Project overview, media cards, Units, Runs, and activity plus Farm workflows/runs/approvals. Assert every API accepts/returns `workspaceId`, `projectId`, `farmRunId`, and entity refs; any slug/path-shaped route or response fails.

- [ ] **Step 2: Delete scanner-derived domain state**

Replace `studio/server/lib.ts` Workspace/project directory enumeration, Artifact scanning, `safeProjectFile`, phase inference, board/scenes, generation log, Unit directory, spend, and run summary readers with DTO shaping over core overview/media/run/unit methods. Project board choice calls the core `media.select` controller with an exact Artifact revision and expected selection; project/run layout uses the Farm canvas store. `control.ts` removes its duplicate installed-core `spawnSync` runner and hand-copied trust/calendar/report/workflow readers; all core calls use `src/ralphy-cli.ts`, all Farm calls use `FarmStore`/Farm command functions.

Domain annotations/reviews route to `media.review`, Evaluation, or feedback methods using exact Artifact/Document/Build/core-Run IDs. Workflow-node and Farm-run annotations, approvals, inbox, canvas, and patches remain Farm IDs under the Farm store. No endpoint folds legacy `annotations.jsonl` or `board.json` after migration.

- [ ] **Step 3: Replace root watching with two explicit feeds**

Remove recursive `fs.watch`. Subscribe to store-wide core `activity.subscribe` and tail each selected Workspace's Farm `activity.jsonl` by sequence. Send WebSocket envelopes with separate cursors:

```ts
type StudioEvent =
  | { source: "core"; sequence: number; data: CoreActivityEvent }
  | { source: "farm"; workspaceId: string; sequence: number; data: FarmActivityEvent };
```

Do not fabricate a total order. On reconnect, replay core with `activity.list(afterSequence)` and Farm from its last sequence, then resume live delivery. A core child restart reruns hello; a changed `storeId` or `rootId` invalidates server caches/media tickets and forces a client reload.

- [ ] **Step 4: Keep locators server-side with opaque media tickets**

`studio/server/media.ts` is the only allowed caller of
`createStudioMediaSource`. For an Object/RunObject preview, it validates the
stable target/scope, asks the adapter's private resolver to open the bytes,
creates a random short-lived single-root ticket, and streams from
`/api/media/<ticket>`. Neither this module nor any route receives an absolute
path. The browser receives only ticket URL, MIME, bytes, and entity ID. Tickets
expire, are cleared on bridge/root change, and never appear in persisted
annotations or logs. Generic `RalphyClient.request` rejects `locator.resolve`
at both TypeScript and runtime boundaries.

Webhook lookup uses stable workflow/node IDs and compares the submitted token digest with `timingSafeEqual`; neither token nor digest enters response/activity. Farm daemon start/stop may spawn only `ralphy-farm`, never core directly.

- [ ] **Step 5: Convert the UI and verify Studio**

Replace path keys and the generations drawer in `studio.tsx` with discriminated media/core Run cards. Workspace selector values are IDs while labels show names/slugs. Run graph nodes and approval selections carry stable refs. Storybook Workspace keys also use IDs.

Run:

```bash
bun test tests/studio-cli-routing.test.ts studio/test/server.test.ts studio/test/farm-api.test.ts studio/test/approvals-api.test.ts studio/test/hooks-api.test.ts studio/test/ui-smoke.test.ts
bun run studio:build
git add studio/server/lib.ts studio/server/index.ts studio/server/media.ts studio/server/control.ts studio/server/annotations.ts studio/server/approvals.ts studio/server/inbox.ts studio/server/graph.ts studio/server/hooks.ts studio/server/patches.ts studio/server/capabilities.ts studio/client/src/studio.tsx studio/client/src/storybook.tsx studio/test/server.test.ts studio/test/farm-api.test.ts studio/test/approvals-api.test.ts studio/test/hooks-api.test.ts studio/test/ui-smoke.test.ts tests/studio-cli-routing.test.ts
git commit -m "refactor(studio): consume core entities by id"
```

### Task 8: Remove reachable legacy/core copies and pin deployment to the released contract

**Files:**
- Create: `scripts/lint-consumer-boundary.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `src/program.ts`
- Modify: `cli/lib/paths.ts`
- Modify: `cli/lib/farm/preflight.ts`
- Modify: `cli/lib/farm/simulate.ts`
- Modify: `cli/lib/farm/rollup.ts`
- Modify: `cli/lib/capabilities.ts`
- Modify: `cli/lib/ingestion/store.ts`
- Modify: `cli/lib/ingestion/topic-index.ts`
- Modify: `cli/lib/selection.ts`
- Modify: `cli/lib/cadence-config.ts`
- Modify: `cli/lib/notifications.ts`
- Modify: `cli/lib/subgraph.ts`
- Modify: `cli/lib/prompt-lint.ts`
- Modify: `docker/Dockerfile`
- Modify: `docker/docker-compose.yml`
- Modify: `docker/README.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Test: `tests/unit/consumer-boundary.test.ts`
- Test: `tests/integration/released-core-e2e.test.ts`

**Interfaces:**
- Consumes: all migrated Farm/Studio entrypoints and `core-contract.json`
- Produces: zero reachable legacy/core-storage/provider code, a pinned image, and startup contract enforcement

- [ ] **Step 1: Add the reachable-source boundary lint first**

Use the already-installed TypeScript compiler API to walk the exact production
graphs rooted at `src/index.ts` and `studio/server/index.ts`. Traverse static
imports, `export ... from`/`export * from` re-exports, and string-literal
`import()` edges with `.js` -> `.ts|.tsx` and directory-index resolution. A
non-literal dynamic import or CommonJS `require` in reachable code is itself a
failure; there is no edge/suppressions list. A fixture violation hidden behind
one re-export and another behind a literal dynamic import must both fail.

Outside `src/ralphy-cli.ts` and `cli/lib/migration/**`, fail on:

```ts
const banned = [
  "bun:sqlite", "registry.json", "workspace.json", "asset-manifest.json",
  "generations.jsonl", "user-prompts.jsonl", "user-assets.jsonl",
  "unit.json", "publish-ledger.jsonl", ".ralphy/workspaces",
  "projectDir(", "workspaceDir(", "currentWorkspace(", "getActiveWorkspace("
];
```

Also fail on sibling-core imports, any direct `ralphy` spawn outside the adapter, registered-provider hosts/fetches outside core, and `artifactPath` in reachable DTO types. Migration fixture readers may name legacy files but may not be imported by normal runtime entrypoints.

The gate also rejects reachable filesystem calls whose argument is derived
from `workspaceDir`, `projectDir`, `sharedDir`, `workflowsDir`, or a raw data
root even when no banned filename literal is present. It separately permits
only FarmStore paths below `.ralphy/farm`, Run intermediates, and explicit
temporary/export inputs. `locator.resolve` may occur only inside
`src/ralphy-cli.ts`; `createStudioMediaSource` may be imported only by
`studio/server/media.ts`.

- [ ] **Step 2: Remove every reported normal caller by audited slice**

Convert/remove legacy scope calls in `src/program.ts`, `cli/lib/paths.ts`,
`cli/lib/registry.ts`, `cli/commands/run.ts`, `cli/lib/run.ts`, and
`cli/lib/workflow.ts`. Convert preflight/simulation/rollup/capability discovery
to the core hello/query DTOs so they do not reach the copied provider, render,
media, registry, or path modules. Narrow the root TypeScript program to the Farm
entrypoint/import graph; Studio retains its own `tsconfig.json`. Historical
source outside both reachable programs is not shipped or imported and therefore
does not justify a broad deletion in this migration. Do not keep a suppressions
list to hide a reachable violation.

Explicitly convert `cli/lib/ingestion/store.ts` and `topic-index.ts` to the Farm
ingestion store, `cli/lib/selection.ts` plus upgrade/rollback lifecycle callers
to the Farm selection store, cadence/notifications readers to Farm policy,
`cli/lib/subgraph.ts` to immutable selected revisions, and
`cli/lib/prompt-lint.ts` to the exact workflow/subgraph revision plus core
Document refs. Remove Studio annotation/board readers through Task 7. The
boundary test contains each former reader path and proves none is reachable;
generic path parameters cannot evade the gate.

- [ ] **Step 3: Pin and verify core in Docker**

Use `FROM oven/bun:1.3.11`. Install the exact `@alecs5am/ralphy` version recorded in `core-contract.json` during image build with Bun, set `RALPHY_BIN` to that installed executable, and fail the build if its version/hello differs. Never use `latest` or a sibling copy.

Mount one shared `/app/.ralphy` volume and set both Farm and Studio to `--root /app/.ralphy`. Provider/Postiz environment variables are available only to the installed core bridge process; Farm does not resolve them. Both service commands perform the hello handshake before accepting a tick/request. Health checks fail on an incompatible/missing core, wrong `storeId`, interrupted migration journal, or absent Farm namespace.

- [ ] **Step 4: Run the released-core and container journey**

The integration test uses the installed released binary and creates Workspace
-> Project -> immutable Farm workflow/subgraph revisions -> generated Artifact
revision -> Composition Build -> Unit presentation -> approval -> Publication
-> Metric -> Studio preview. Park the Run, select newer definitions, and prove
resume still uses its original revision IDs/expanded digest while a new Run
uses the new selections. Assert core IDs match across CLI, Farm journal, and
Studio, and that a crash/resume does not duplicate generation, publication, or
Metric refresh.

Run:

```bash
bun run lint
bun run lint:consumer-boundary
bun test
bun run studio:build
bun run studio:test
STUDIO_AUTH_TOKEN=test-only RALPHY_CORE_VERSION=$(bun -e 'console.log((await Bun.file("core-contract.json").json()).coreVersion)') docker compose -f docker/docker-compose.yml config --quiet
docker build -f docker/Dockerfile -t ralphy-farm:contract .
docker run --rm ralphy-farm:contract bun src/index.ts doctor --root /app/.ralphy --contract-only
```

- [ ] **Step 5: Document and commit the standalone consumer**

Update README/AGENTS/Docker docs with the ownership table, ID-only scope, root semantics, core pin/upgrade order, Farm migration commands, and recovery. Then:

```bash
git add scripts/lint-consumer-boundary.ts package.json tsconfig.json src/program.ts cli/lib/paths.ts cli/lib/farm/preflight.ts cli/lib/farm/simulate.ts cli/lib/farm/rollup.ts cli/lib/capabilities.ts cli/lib/ingestion/store.ts cli/lib/ingestion/topic-index.ts cli/lib/selection.ts cli/lib/cadence-config.ts cli/lib/notifications.ts cli/lib/subgraph.ts cli/lib/prompt-lint.ts docker/Dockerfile docker/docker-compose.yml docker/README.md README.md AGENTS.md tests/unit/consumer-boundary.test.ts tests/integration/released-core-e2e.test.ts
gitleaks protect --staged --redact
git commit -m "refactor(farm): enforce the released core boundary"
```

### Task 9: Rehearse and install the real Farm state during the coordinated cutover

**Files:**
- Create: `docs/farm-state-migration-2026-08.md`

**Interfaces:**
- Consumes: released/verified core, passing Farm package/image, the real legacy root, and the core migration stage/run IDs
- Produces: one verified `.ralphy/farm` namespace attached to the live v2 `storeId`, with legacy recovery retained

- [ ] **Step 1: Rehearse from recoverable clones**

Stop Farm daemon, Studio, Desktop, core workers, and source watchers. Run Farm audit against the exact legacy source and the queryable core migration rehearsal stage. Obtain the exact mode-0600 core maintenance grant, prepare/verify the Farm stage through its bounded mapping client, complete core rehearsal cutover, install Farm state into only the rehearsal v2 root, then exercise rollback/recovery. Record redacted counts, bytes, dispositions, issues, hashes, durations, and additional disk use; never record the grant nonce or Farm auth token.

- [ ] **Step 2: Prove representative historical state**

Open at least one completed, failed, parked-approval, retried, and cache-hit Farm run. Verify exact workflow/subgraph revision IDs and expanded graph digests, Project/Artifact/Unit/Publication/social-account/campaign/calendar refs, ingestion/topic/selection/lifecycle state, annotations, approvals/inbox/layout, trust/publish/quota audit, dead letters, webhook rotation, metrics/report, and Studio activity/media preview. Resolve every ambiguous mapping with a fixture-backed deterministic rule and rerun from a fresh rehearsal stage.

- [ ] **Step 3: Prepare the live Farm stage before core freeze/cutover**

Under the shared maintenance window:

1. quiesce and re-audit exact live roots/processes;
2. run/resume core migration import to its pre-freeze stage;
3. generate the exact Farm consumer maintenance grant and run/resume `ralphy-farm migrate --core-grant <path>` against that core stage;
4. require 100% Farm coverage and stable-ref resolution;
5. freeze and verify core;
6. re-verify the Farm stage against the frozen core `storeId` and mapping digest;
7. emit the canonical Farm ready record and pass its exact path/digest to core cutover.

No Farm command writes the legacy source or frozen core stage.

- [ ] **Step 4: Cut over core, then install Farm before restarting writers**

Use the exact core Run/verification IDs and ready-record/grant digests. After core reports installed, the exact Farm pending DTO, and passes read-only smoke, run Farm `install` with the exact Farm migration ID and confirmation. Verify `.ralphy/farm/identity.json` matches the live core `storeId`, migration ID, stage/auth-token digests, `auth.token` is mode 0600, and core hello switches to the exact Farm ready DTO with the expected identity digest; authenticate and run Farm/Studio read-only smoke, then start only the pinned Farm daemon and Studio. Confirm migrated pending core jobs remain held and no schedule publishes merely because services restarted.

If Farm install fails, keep core/Farm stages and journals and run `recover`; if the coordinated decision is core rollback, leave the v2 generation preserved and the restored legacy root supplies its untouched legacy Farm state. Never merge the two generations.

- [ ] **Step 5: Record evidence and run final gates**

```bash
bun run lint
bun run lint:consumer-boundary
bun test
bun run studio:build
bun run studio:test
STUDIO_AUTH_TOKEN=test-only RALPHY_CORE_VERSION=$(bun -e 'console.log((await Bun.file("core-contract.json").json()).coreVersion)') docker compose -f docker/docker-compose.yml config --quiet
gitleaks detect --source .
```

Commit only redacted evidence:

```bash
git add docs/farm-state-migration-2026-08.md tests/fixtures/farm-migration
gitleaks protect --staged --redact
git commit -m "test(farm): verify the sqlite consumer cutover"
```

Retain the legacy core recovery root, Farm migration stage/journal, and rollback-new v2 root until the user separately approves cleanup after real Denti.AI and automation verification.

## Acceptance Criteria

1. Farm and Studio build/test without any sibling checkout and use only the pinned installed core contract.
2. No reachable normal Farm/Studio code opens SQLite, scans legacy core state, calls provider hosts, or spawns core outside `src/ralphy-cli.ts`.
3. Farm state lives only below `.ralphy/farm/workspaces/<workspace-id>/` with stable IDs and no persisted core paths/locators/secrets.
4. Every core-producing node records external Farm provenance and survives crash/retry without duplicate revisions/publications.
5. Provider/render/publish/analytics state, costs, metrics, and credentials exist only in core; Farm keeps orchestration policy and stable refs.
6. Studio uses core overview/media/activity APIs plus Farm activity, and streams media through private locator tickets without exposing paths.
7. Bundles serialize/import each owner's state through that owner and resume safely across partial import/upgrade.
8. The Docker image pins Bun and the exact released core, shares one data root, and refuses incompatible startup.
9. Every real legacy Farm path has a verified disposition, staged state is prepared before core cutover, and installation binds to the exact live `storeId` with recovery retained.
