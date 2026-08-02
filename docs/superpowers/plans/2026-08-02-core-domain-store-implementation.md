# Core Domain Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the mandatory SQLite source of truth and immutable local bucket primitives for every Ralphy domain entity.

**Architecture:** A single `bun:sqlite` database at `.ralphy/ralphy.db` owns relational state, revisions, audit activity, jobs, and migration journals. Small store modules execute explicit SQL against one shared connection; media bytes are atomically promoted from `.ralphy/tmp/` into ID-addressed Workspace or Project buckets before rows may reference them.

**Tech Stack:** Bun, TypeScript, `bun:sqlite`, Node filesystem/crypto APIs, Zod, `bun:test`

## Global Constraints

- `.ralphy/ralphy.db` is the only authoritative domain store after cutover.
- Use `bun:sqlite`; add no ORM or database dependency.
- Store opaque prefixed UUIDs as `TEXT`, timestamps as UTC epoch milliseconds, and booleans as constrained integers.
- Enable WAL, foreign keys, and a 5000 ms busy timeout on every writable connection.
- Every creative edit creates an immutable revision; mutable heads and operational statuses use optimistic checks and append an activity event.
- A project belongs to exactly one workspace, and project slugs are unique inside that workspace.
- Object rows contain relative bucket keys only; reject absolute paths, `..` segments, binary payloads, and data URLs at the store boundary.
- Never insert a row that references bytes until the bytes have been validated, hashed, and atomically placed in their final bucket key.
- Never hold a SQLite transaction open during a provider call, render, hash, file copy, or media probe.
- Working, rejected, and superseded Objects remain durable and discoverable while a project is active.
- Keep files and commit messages English-only and use Bun for every check.

---

### Task 1: Open and migrate the central database

**Files:**
- Create: `cli/lib/store/db.ts`
- Create: `cli/lib/store/schema.ts`
- Create: `cli/lib/store/ids.ts`
- Test: `tests/integration/domain-db.test.ts`

**Interfaces:**
- Consumes: `ralphDir()` from `cli/lib/paths.ts` and `Database` from `bun:sqlite`
- Produces: `domainDbPath(): string`, `openDomainDb(): Database`, `closeDomainDb(): void`, `withImmediateTransaction<T>(fn: (db: Database) => T): T`, and `newDomainId(prefix: DomainIdPrefix): string`

- [ ] **Step 1: Write the failing database bootstrap test**

```ts
import { afterEach, expect, test } from "bun:test";
import { makeTmpRoot } from "../helpers/tmp-root.js";
import { closeDomainDb, domainDbPath, openDomainDb } from "../../cli/lib/store/db.js";

test("opens the authoritative database with enforced pragmas and schema v1", () => {
  const tmp = makeTmpRoot("ralphy-domain-db");
  const db = openDomainDb();
  expect(domainDbPath()).toBe(`${tmp.dir}/.ralphy/ralphy.db`);
  expect(db.query("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
  expect(db.query("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
  expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 1 });
  expect(db.query("SELECT name FROM sqlite_master WHERE name = 'workspaces'").get()).not.toBeNull();
  closeDomainDb();
  tmp.cleanup();
});

afterEach(closeDomainDb);
```

- [ ] **Step 2: Run the test and confirm the missing module failure**

Run: `bun test tests/integration/domain-db.test.ts`

Expected: FAIL because `cli/lib/store/db.ts` does not exist.

- [ ] **Step 3: Implement IDs, connection ownership, and ordered schema migrations**

Use `crypto.randomUUID()` in `ids.ts`:

```ts
import { randomUUID } from "node:crypto";

export const DOMAIN_ID_PREFIXES = [
  "ws", "acct", "prj", "iter", "fb", "fblink", "stage", "doc", "drev", "bind",
  "obj", "art", "arev", "rel", "usage", "comp", "crev", "cfile", "input", "build",
  "output", "eval", "unit", "urev", "item", "pres", "pitem", "pub", "metric", "session",
  "run", "attempt", "robj", "mig", "mentry", "miss", "brand", "persona", "tmpl", "memory",
  "mrev", "campaign", "cell", "calendar",
] as const;
export type DomainIdPrefix = (typeof DOMAIN_ID_PREFIXES)[number];
export const newDomainId = (prefix: DomainIdPrefix) => `${prefix}_${randomUUID()}`;
```

`db.ts` must cache the connection together with its absolute path, reopen when `setRoot()` changes it in tests, and apply these settings before migrations:

```ts
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 5000");
```

`schema.ts` exports `SCHEMA_VERSION = 1` and an ordered `MIGRATIONS` array. Migration 1 creates the approved table groups below. Every foreign key specifies either `ON DELETE CASCADE` for owned children or `ON DELETE RESTRICT` for immutable provenance.

| Group | Tables and required constraints |
|---|---|
| System | `schema_migrations(version PRIMARY KEY, applied_at)`, `storage_transfers`, `storage_transfer_entries`; the full-library migration plan appends its migration journal in schema version 3 |
| Scope | `workspaces` with unique slug and `row_version`; `social_accounts` unique by workspace/platform/external ID; `projects` with required workspace and unique `(workspace_id, slug)`; `project_iterations` unique `(project_id, number)`; `feedback_items`; `feedback_resolution_links`; `project_stages` unique `(project_id, stage)` |
| Documents | `documents`; immutable `document_revisions` unique `(document_id, revision_no)`; `project_document_bindings`; `build_document_bindings`; FTS5 `document_revisions_fts(revision_id UNINDEXED, title, body)` |
| Storage | `objects` with unique `(bucket, key)`, positive bytes, hash, and storage class; `artifacts`; immutable `artifact_revisions` unique `(artifact_id, revision_no)`; `artifact_relations`; `artifact_usages` |
| Production | `compositions`; immutable `composition_revisions` unique `(composition_id, revision_no)`; `composition_revision_files`; `composition_inputs`; `builds`; `build_outputs`; `evaluations` |
| Delivery | `units`; immutable `unit_revisions` unique `(unit_id, revision_no)`; `unit_items` unique `(unit_revision_id, position)`; `unit_presentations`; `presentation_items`; `publications`; `metric_snapshots` |
| Execution | `agent_sessions`; `runs`; `run_attempts`; `run_objects`; migrated `jobs`, `job_logs`, `job_artifacts`; append-only `activity_events(id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id, project_id, entity_type, entity_id, action, payload_json, created_at)` |

Use `BEGIN EXCLUSIVE`, insert the migration record, set `PRAGMA user_version`, and commit as one operation. Roll back on any exception and leave `user_version` unchanged. Before upgrading a non-empty existing database, checkpoint WAL, create `.ralphy/backups/ralphy-schema-<version>-<timestamp>.db` with parameterized `VACUUM INTO`, reopen the backup read-only, and require `integrity_check = ok`.

Add database triggers that reject update/delete of Document, Artifact, and Unit revisions; permit only `draft -> sealed` for Composition revisions; reject edits to sealed Composition children; and require each Unit item to target exactly one Artifact revision or Document revision. Store code additionally rejects cross-Workspace references before inserts.

- [ ] **Step 4: Test migration idempotence and rollback**

Add assertions that reopening does not duplicate `schema_migrations`, and export `applyMigrations(db, { beforeVersion?: (version: number) => void })` so the test can throw before version 1 and prove that neither its tables nor migration row survive.

Run: `bun test tests/integration/domain-db.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the database bootstrap**

```bash
git add cli/lib/store/db.ts cli/lib/store/schema.ts cli/lib/store/ids.ts tests/integration/domain-db.test.ts
git commit -m "feat(store): add central domain database"
```

### Task 2: Add transactional Workspace, Project, Iteration, feedback, and activity stores

**Files:**
- Create: `cli/lib/store/types.ts`
- Create: `cli/lib/store/activity.ts`
- Create: `cli/lib/store/scopes.ts`
- Test: `tests/integration/domain-scopes.test.ts`

**Interfaces:**
- Consumes: `openDomainDb()`, `withImmediateTransaction()`, and `newDomainId()` from Task 1
- Produces: `createWorkspace`, `updateWorkspace`, `upsertSocialAccount`, `listSocialAccounts`, `createProject`, `transferProjectMetadata`, `createIteration`, `addFeedback`, `resolveFeedback`, `listActivity`, and their row/input types

- [ ] **Step 1: Write failing scope and optimistic-conflict tests**

```ts
const ws = createWorkspace({ slug: "denti-ai", name: "Denti.AI" });
const project = createProject({ workspaceId: ws.id, slug: "perio-pitch", name: "Perio pitch" });
const iteration = createIteration({ projectId: project.id, title: "Client corrections", reason: "feedback" });
const feedback = addFeedback({ iterationId: iteration.id, body: "Shorten the opening." });

expect(project.workspaceId).toBe(ws.id);
expect(() => createProject({ workspaceId: ws.id, slug: "perio-pitch", name: "Duplicate" })).toThrow();
expect(() => updateWorkspace(ws.id, { name: "Stale" }, ws.rowVersion - 1)).toThrow(/conflict/i);
expect(listActivity({ projectId: project.id, afterId: 0, limit: 20 }).map((e) => e.action)).toEqual([
  "project.created", "iteration.created", "feedback.created",
]);
```

Run: `bun test tests/integration/domain-scopes.test.ts`

Expected: FAIL because the scope store does not exist.

- [ ] **Step 2: Define stable row and mutation types**

In `types.ts`, use camel-case application rows and explicit union values. At minimum define `WorkspaceRow`, `ProjectRow`, `IterationRow`, `FeedbackRow`, `ActivityEventRow`, `ObjectRow`, `ArtifactRow`, `ArtifactRevisionRow`, `CompositionRow`, `CompositionRevisionRow`, `BuildRow`, `UnitRow`, `UnitRevisionRow`, `RunRow`, and `RunObjectRow`. JSON columns are parsed before a row leaves the store.

```ts
export class StoreConflictError extends Error {
  readonly code = "E_CONFLICT";
}

export type Page<T> = { items: T[]; nextCursor: string | null };
```

- [ ] **Step 3: Implement one-transaction mutations with activity**

`appendActivity(db, input)` inserts an event and returns its integer ID. Every scope mutation must insert its state row and activity event inside the same `withImmediateTransaction()` callback. `updateWorkspace` and project metadata updates use `WHERE id = ? AND row_version = ?`; zero changes throws `StoreConflictError`.

`transferProjectMetadata` changes only DB ownership metadata and is deliberately internal; the later journaled transfer command must move the physical bucket first.

- [ ] **Step 4: Add pagination and foreign-key assertions**

Test `listWorkspaces({ cursor, limit })`, `listProjects({ workspaceId, cursor, limit })`, social-account upsert/list without secret values, activity resume by monotonic integer ID, rejection of a missing workspace, and cascaded deletion only for a temporary empty Workspace fixture.

Run: `bun test tests/integration/domain-scopes.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit scope stores**

```bash
git add cli/lib/store/types.ts cli/lib/store/activity.ts cli/lib/store/scopes.ts tests/integration/domain-scopes.test.ts
git commit -m "feat(store): add workspace project and iteration state"
```

### Task 3: Store immutable Documents and FTS search

**Files:**
- Create: `cli/lib/store/documents.ts`
- Test: `tests/integration/domain-documents.test.ts`

**Interfaces:**
- Consumes: Workspace/Project/Iteration IDs and transaction/activity helpers
- Produces: `createDocument`, `reviseDocument`, `getDocument`, `listDocuments`, `bindProjectDocument`, `bindBuildDocument`, and `searchDocuments`

- [ ] **Step 1: Write the failing revision and FTS test**

```ts
const brief = createDocument({ projectId: project.id, kind: "brief", slug: "brief", title: "Brief" });
const v1 = reviseDocument({ documentId: brief.id, format: "markdown", body: "Periodontal education launch" });
const v2 = reviseDocument({
  documentId: brief.id,
  expectedHeadId: v1.id,
  iterationId: iteration.id,
  format: "markdown",
  body: "Periodontal education launch with a shorter hook",
});

expect(v2.parentRevisionId).toBe(v1.id);
expect(getDocument(brief.id).currentRevision?.id).toBe(v2.id);
expect(searchDocuments({ workspaceId: workspace.id, query: "periodontal" })[0]?.revisionId).toBe(v2.id);
expect(() => reviseDocument({ documentId: brief.id, expectedHeadId: v1.id, format: "markdown", body: "stale" })).toThrow(/conflict/i);
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `bun test tests/integration/domain-documents.test.ts`

Expected: FAIL because `documents.ts` does not exist.

- [ ] **Step 3: Implement immutable revisions and exact bindings**

Allow formats `markdown`, `text`, and `json`, and kinds `brief`, `style-guide`, `production-plan`, `scenario`, `storyboard`, `research`, `postmortem`, `memory`, `note`, and `custom`. Reject data URLs in text and recursively reject base64-like binary fields in JSON. Calculate a SHA-256 digest over the canonical stored content. In one transaction, insert the next revision, update `documents.current_revision_id` only when `expectedHeadId` matches, update the FTS row, and append `document.revised`.

Bindings store exact revision IDs; changing a Document head never alters existing project/build bindings.

- [ ] **Step 4: Cover Workspace inheritance and structured JSON**

Test a Workspace style guide visible from its Project, Project override ordering, canonical JSON round-trip, exact Build binding, FTS pagination, and rejection of cross-Workspace bindings.

Run: `bun test tests/integration/domain-documents.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Documents**

```bash
git add cli/lib/store/documents.ts tests/integration/domain-documents.test.ts
git commit -m "feat(store): add versioned searchable documents"
```

### Task 4: Add atomic Objects and versioned Artifacts

**Files:**
- Create: `cli/lib/store/objects.ts`
- Create: `cli/lib/store/artifacts.ts`
- Test: `tests/integration/domain-objects.test.ts`
- Test: `tests/integration/domain-artifacts.test.ts`

**Interfaces:**
- Consumes: scope rows, `.ralphy/tmp/`, Node `createHash`, and activity transactions
- Produces: `prepareObject(input): Promise<PreparedObject>`, `registerPreparedObject(db, prepared): ObjectRow`, `ingestObject(input): Promise<ObjectRow>`, `resolveObjectPath(row): string`, `createArtifact`, `addArtifactRevision`, `selectArtifactRevision`, `setArtifactRevisionState`, `addArtifactRelation`, and `addArtifactUsage`

- [ ] **Step 1: Write a failing atomic-ingest test**

```ts
const object = await ingestObject({
  scope: { workspaceId: ws.id, projectId: project.id },
  sourcePath,
  originalName: "scene-01.mp4",
  mime: "video/mp4",
  storageClass: "working",
  transfer: "move",
});

expect(object.key.startsWith("objects/")).toBe(true);
expect(resolveObjectPath(object)).toBe(`${tmp.dir}/.ralphy/buckets/${ws.id}/projects/${project.id}/${object.key}`);
expect(Bun.file(resolveObjectPath(object)).size).toBe(knownBytes);
expect(existsSync(sourcePath)).toBe(false);
```

Also inject a transaction failure after the final rename and assert that the final bytes are discoverable as an unreferenced Object candidate while no DB row points at a missing file.

- [ ] **Step 2: Implement safe bucket resolution and promotion**

Validate scope ownership from SQLite. Project Objects resolve below `buckets/<workspace-id>/projects/<project-id>/objects/`; shared Objects resolve below `buckets/<workspace-id>/shared/objects/`. Sanitize `originalName`, write/copy below `.ralphy/tmp/<object-id>/`, hash and measure, fsync, then rename within `.ralphy` to the final unique key.

Split ingestion so file work never happens in a transaction:

```ts
export async function prepareObject(input: ObjectIngestInput & {
  transfer: "copy" | "move";
}): Promise<PreparedObject>;
export function registerPreparedObject(db: Database, prepared: PreparedObject): ObjectRow;
export async function ingestObject(input: ObjectIngestInput & {
  transfer?: "copy" | "move";
}): Promise<ObjectRow>;
```

`ingestObject` defaults to `copy`; generated Run temp callers pass `move`. The migration plan uses `prepareObject` outside a transaction, then calls `registerPreparedObject` and updates its journal inside one short transaction.

- [ ] **Step 3: Write failing Artifact revision tests**

```ts
const artifact = createArtifact({ projectId: project.id, slug: "scene-01", kind: "video" });
const r1 = addArtifactRevision({ artifactId: artifact.id, objectId: object.id, state: "working" });
const r2 = addArtifactRevision({ artifactId: artifact.id, objectId: secondObject.id, parentRevisionId: r1.id, state: "candidate" });
selectArtifactRevision({ artifactId: artifact.id, revisionId: r2.id, expectedRevisionId: null });
expect(getArtifact(artifact.id).selectedRevisionId).toBe(r2.id);
expect(getArtifactRevision(r1.id)?.state).toBe("working");
```

- [ ] **Step 4: Implement Artifact identity, revisions, relations, and usages**

Use the existing `MEDIA_ARTIFACT_KINDS` as the accepted intrinsic kind vocabulary, mapping legacy `ref` to an Artifact usage role rather than a parallel storage type. Revision states are exactly `working`, `candidate`, `approved`, `rejected`, `superseded`, and `archived`. Selection uses an expected selected revision and appends `artifact.selected`.

- [ ] **Step 5: Run storage and Artifact checks**

Run: `bun test tests/integration/domain-objects.test.ts tests/integration/domain-artifacts.test.ts`

Expected: PASS, including cross-scope rejection, traversal rejection, same-name non-overwrite, missing-byte rejection, and immutable old revisions.

- [ ] **Step 6: Commit storage and media identity**

```bash
git add cli/lib/store/objects.ts cli/lib/store/artifacts.ts tests/integration/domain-objects.test.ts tests/integration/domain-artifacts.test.ts
git commit -m "feat(store): add immutable objects and artifact revisions"
```

### Task 5: Consolidate Runs and jobs into the domain database

**Files:**
- Create: `cli/lib/store/runs.ts`
- Modify: `cli/lib/jobs/db.ts`
- Modify: `cli/lib/jobs/types.ts`
- Modify: `cli/lib/jobs/worker.ts`
- Test: `tests/integration/domain-runs.test.ts`
- Modify: `tests/integration/jobs-db.test.ts`

**Interfaces:**
- Consumes: Task 1 database, Task 4 Object promotion, and existing jobs query API
- Produces: `startRun`, `startRunAttempt`, `finishRunAttempt`, `finishRun`, `recordRunObject`, `promoteRunObject`; existing job exports retain their current signatures and gain an optional `run_id`

- [ ] **Step 1: Write the failing Run lifecycle test**

```ts
const run = startRun({ projectId: project.id, kind: "generation", label: "scene-01" });
const attempt = startRunAttempt({ runId: run.id, provider: "fixture", model: "fixture/model" });
const runObject = recordRunObject({
  runId: run.id,
  path: "tmp/run/output.bin",
  purpose: "provider-response",
  state: "diagnostic",
  retention: "keep-on-failure",
  bytes: 4,
  sha256: fixtureHash,
});
finishRunAttempt(attempt.id, { state: "failed", error: "fixture failure" });
finishRun(run.id, { state: "failed" });
expect(getRun(run.id).objects[0]?.id).toBe(runObject.id);
```

- [ ] **Step 2: Implement short Run transitions**

Run states are `pending`, `running`, `succeeded`, `failed`, and `cancelled`. Attempt state, provider response metadata, cost, and errors are mutable operational fields, but every transition appends activity. `run_objects.path` is relative to `.ralphy`, and `promoteRunObject` calls `ingestObject` before linking the returned Object ID.

- [ ] **Step 3: Point the existing jobs API at `ralphy.db`**

Remove the private connection and schema migration from `cli/lib/jobs/db.ts`; call `openDomainDb()` and keep `insertJob`, `claimNextPending`, `finalizeJob`, log, retry, cancel, and count signatures stable. Add `run_id` to `JobInsertInput`, `JobRow`, and inserts. Do not import the old `jobs.db` here; that belongs only to the migration plan.

- [ ] **Step 4: Verify jobs and Runs together**

Run: `bun test tests/integration/domain-runs.test.ts tests/integration/jobs-db.test.ts tests/unit/jobs-*.test.ts`

Expected: PASS, and `domainDbPath()` is the only SQLite path created in the fixture.

- [ ] **Step 5: Commit execution state**

```bash
git add cli/lib/store/runs.ts cli/lib/jobs/db.ts cli/lib/jobs/types.ts cli/lib/jobs/worker.ts tests/integration/domain-runs.test.ts tests/integration/jobs-db.test.ts
git commit -m "feat(store): consolidate runs and jobs"
```

### Task 6: Add generic Composition revisions and reproducible Builds

**Files:**
- Create: `cli/lib/store/compositions.ts`
- Test: `tests/integration/domain-compositions.test.ts`

**Interfaces:**
- Consumes: Projects, Iterations, Objects, Artifact revisions, Documents, Runs, and activity
- Produces: `createComposition`, `reviseComposition`, `putCompositionSource`, `bindCompositionInput`, `sealCompositionRevision`, `startBuild`, `completeBuild`, `failBuild`, `selectCompositionRevision`, and aggregate `getComposition`

- [ ] **Step 1: Write failing engine-switch and multi-output tests**

```ts
const composition = createComposition({ projectId: project.id, slug: "perio-cut", kind: "video" });
const v1 = reviseComposition({ compositionId: composition.id, engine: "hyperframes", engineConfig: {} });
putCompositionSource({ revisionId: v1.id, logicalPath: "index.html", objectId: htmlObject.id });
bindCompositionInput({ revisionId: v1.id, artifactRevisionId: scene.id, role: "scene", position: 0 });
const sealed = sealCompositionRevision({ revisionId: v1.id });
const build = startBuild({ compositionRevisionId: sealed.id, profile: { name: "social", crf: 24 }, runId: run.id });
completeBuild({ buildId: build.id, outputs: [masterRevision.id, previewRevision.id] });

const v2 = reviseComposition({ compositionId: composition.id, parentRevisionId: v1.id, engine: "remotion", engineConfig: {} });
expect(v2.engine).toBe("remotion");
expect(getComposition(composition.id).revisions[0]?.builds[0]?.outputs).toHaveLength(2);
expect(() => putCompositionSource({ revisionId: v1.id, logicalPath: "index.html", objectId: other.id })).toThrow(/sealed/i);
```

- [ ] **Step 2: Implement draft checkout metadata and sealing**

Composition kinds are `video`, `carousel`, `sticker-pack`, `image`, `audio`, `document`, and `custom`. Engine is a non-empty slug stored per revision. Draft revisions may replace source/input rows; sealing hashes the ordered source/input manifest, sets `sealed_at`, and makes all creative rows immutable.

`startBuild` requires a sealed revision. It inserts the Build before engine work starts. `failBuild` retains the Build and Run; `completeBuild` links ordered exact Artifact revision outputs. Neither outcome changes the Composition selection automatically.

- [ ] **Step 3: Cover conflicts, exact provenance, and failed Builds**

Test expected-head conflict, duplicate logical paths, cross-Project input rejection, engine change between revisions, source manifest digest stability, failed Build reproducibility, exact Document bindings, and selection of an older revision.

Run: `bun test tests/integration/domain-compositions.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit production assembly**

```bash
git add cli/lib/store/compositions.ts tests/integration/domain-compositions.test.ts
git commit -m "feat(store): add composition revisions and builds"
```

### Task 7: Add flexible Units, platform presentations, publications, and metrics

**Files:**
- Create: `cli/lib/store/units.ts`
- Test: `tests/integration/domain-units.test.ts`

**Interfaces:**
- Consumes: Artifact revisions, Build outputs, Workspace social accounts, Runs, and activity
- Produces: `createUnit`, `reviseUnit`, `setUnitItems`, `upsertUnitPresentation`, `setPresentationItems`, `selectUnitRevision`, `recordPublication`, `updatePublicationState`, `appendMetricSnapshot`, and aggregate `getUnit`

- [ ] **Step 1: Write failing multi-item and shared-video tests**

```ts
const pack = createUnit({ projectId: project.id, slug: "telegram-pack", format: "sticker-pack" });
const packRevision = reviseUnit({ unitId: pack.id, items: stickerRevisions.map((id, position) => ({
  artifactRevisionId: id,
  role: "sticker",
  position,
})) });
expect(getUnit(pack.id).currentRevision?.items).toHaveLength(32);

const short = createUnit({ projectId: project.id, slug: "perio-short", format: "video" });
const shortRevision = reviseUnit({ unitId: short.id, items: [{ artifactRevisionId: video.id, role: "primary", position: 0 }] });
for (const platform of ["tiktok", "instagram", "youtube"]) {
  upsertUnitPresentation({ unitRevisionId: shortRevision.id, platform, caption: `${platform} caption`, options: {} });
}
expect(getUnit(short.id).currentRevision?.presentations).toHaveLength(3);
expect(new Set(getUnit(short.id).currentRevision?.items.map((item) => item.artifactRevisionId))).toEqual(new Set([video.id]));
```

- [ ] **Step 2: Implement immutable ordered bundles**

`reviseUnit` inserts the revision and all ordered heterogeneous items in one transaction. A presentation belongs to one immutable Unit revision and contains caption, cover/crop/safe-area JSON, platform options, and optional ordered item overrides. Validate presentation items against the parent Unit revision.

Publications are append-only attempts with provider identifiers, state, URL, schedule/publish timestamps, error, and Run ID. Allowed operational states are `draft`, `scheduled`, `submitted`, `published`, `failed`, and `cancelled`; state transitions append activity. Metric snapshots are immutable time-series rows with indexed common metrics and validated raw provider JSON.

- [ ] **Step 3: Cover platform and analytics behavior**

Test an eight-image carousel, a 32-sticker pack, a shared video with three presentations, optimistic Unit head conflicts, Postiz attempt history, failed then successful publication, and two metric snapshots whose first row remains unchanged.

Run: `bun test tests/integration/domain-units.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit delivery state**

```bash
git add cli/lib/store/units.ts tests/integration/domain-units.test.ts
git commit -m "feat(store): add units presentations and publications"
```

### Task 8: Add integrity verification and finish the foundation gate

**Files:**
- Create: `cli/lib/store/verify.ts`
- Test: `tests/integration/domain-verify.test.ts`

**Interfaces:**
- Consumes: every Task 1-7 table and `resolveObjectPath()`
- Produces: `verifyDomainStore(options?: { hashObjects?: boolean }): DomainVerificationReport`

- [ ] **Step 1: Write the failing integrity-report test**

```ts
const report = verifyDomainStore({ hashObjects: true });
expect(report).toMatchObject({
  integrity: "ok",
  foreignKeyViolations: [],
  missingObjects: [],
  hashMismatches: [],
  absolutePathRows: [],
  dataUrlRows: [],
  brokenBuildChains: [],
  brokenUnitChains: [],
});
```

Delete one fixture Object after inserting it and assert its ID appears in `missingObjects`; inject an absolute key with foreign keys disabled and assert it appears in `absolutePathRows`.

- [ ] **Step 2: Implement deterministic verification queries**

Run `PRAGMA integrity_check` and `foreign_key_check`, enumerate every Object and RunObject locator, inspect all text/JSON columns for data URLs and absolute local paths, verify Composition revision to Build to output chains, and verify Unit revision to item to Artifact revision chains. Sort every issue list by stable ID so reports diff cleanly. Open a second connection to the same WAL database and prove concurrent reads succeed while a stale expected-head write returns `StoreConflictError`.

- [ ] **Step 3: Run the complete foundation suite**

Run:

```bash
bun test tests/integration/domain-*.test.ts tests/integration/jobs-db.test.ts
bun run lint
bun test tests/integration/
```

Expected: all commands exit 0.

- [ ] **Step 4: Scan and commit the verified foundation**

```bash
rg --pcre2 '\p{Cyrillic}' cli/lib/store tests/integration/domain-*.test.ts
git add cli/lib/store/verify.ts tests/integration/domain-verify.test.ts
gitleaks protect --staged --redact
git commit -m "feat(store): verify domain integrity"
```

Expected: the Cyrillic search prints nothing, gitleaks reports no leak, and the commit contains only the listed files.
