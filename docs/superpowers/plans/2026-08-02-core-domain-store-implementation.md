# Core Domain Store Implementation Plan

> **2026-08-04 scope amendment:** `ralphy-farm` is removed from the program.
> Every Farm-specific namespace, identity, consumer-readiness, release, or
> coordinated-cutover requirement below is superseded and must not be
> implemented. Core, full-library migration, Desktop, and release remain.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the mandatory SQLite source of truth and immutable local bucket primitives for every Ralphy domain entity.

**Architecture:** A single `bun:sqlite` database at `.ralphy/ralphy.db` owns relational state, revisions, audit activity, jobs, and migration journals. Small store modules execute explicit SQL against one shared connection; media bytes are atomically promoted from `.ralphy/tmp/` into ID-addressed Workspace or Project buckets before rows may reference them.

**Tech Stack:** Bun, TypeScript, `bun:sqlite`, Node filesystem/crypto APIs, Zod, `bun:test`

## Global Constraints

- `.ralphy/ralphy.db` is the only authoritative domain store after cutover.
- Use `bun:sqlite`; add no ORM or database dependency.
- Store opaque prefixed UUIDs as `TEXT`, timestamps as UTC epoch milliseconds, and booleans as constrained integers. The existing queue API deliberately preserves integer autoincrement IDs for `jobs`, `job_logs`, and `job_artifacts`; `activity_events.id` is also an integer autoincrement sequence.
- Enable WAL, foreign keys, and a 5000 ms busy timeout on every writable connection.
- Every creative edit creates an immutable revision; mutable heads and operational statuses use optimistic checks and append an activity event.
- A project belongs to exactly one workspace, and project slugs are unique inside that workspace.
- Authenticated automation consumers act through immutable consumer-owned Agent Sessions; an ordinary caller cannot claim a consumer identity or its external-operation provenance.
- Every consumer-started operation has one indexed external tuple, one idempotency key, one immutable canonical request digest, and its authenticated consumer principal on the Run. Replay authorization follows that principal across reconnect Sessions, so a crash between core success and consumer journaling can recover the original Run and result IDs without letting an ordinary or foreign principal claim them.
- Object rows contain relative bucket keys only; reject absolute paths, `..` segments, binary payloads, and data URLs at the store boundary.
- Never insert a row that references bytes until the bytes have been validated, hashed, and atomically placed in their final bucket key.
- Never hold a SQLite transaction open during a provider call, render, hash, file copy, or media probe.
- Working, rejected, and superseded Objects remain durable and discoverable while a project is active.
- Keep files and commit messages English-only and use Bun for every check.

## Cross-Plan Release Checkpoint

Execution order is fixed. Complete this plan, the entity CLI/bridge plan, and
Full Library Migration Tasks 1-8 in the core repository. Publish that exact
commit as the stable `@alecs5am/ralphy` package/CLI, record the version,
integrity, and commit, then run the core-only rehearsal and live cutover before
Desktop integration and release validation.

---

### Task 0: Restore the clean implementation baseline

**Files:**
- Modify: `.husky/pre-commit`
- Modify: `cli/lib/publish/article.ts`
- Modify: `cli/lib/templater/suggest.ts`
- Modify: `docs/cli-surface.generated.md`
- Test: `tests/unit/article-publish.test.ts`
- Test: `tests/integration/cli-user-journey-post-install.test.ts`

**Interfaces:**
- Consumes: `connectorsFor("text")` from `cli/lib/providers/registry.ts`
- Preserves: `suggestTemplates()` offline fallback and the generated CLI contract

- [ ] **Step 1: Confirm the existing offline fallback failure**

Run:

```bash
bun test --timeout 45000 tests/integration/cli-user-journey-post-install.test.ts
```

Expected: the `doctor + template suggest` case fails with exit code 3 because
`callLLM()` reaches the process-exiting provider resolver when no text provider
is configured.

- [ ] **Step 2: Guard the optional default LLM path at its shared caller**

When no injected `llmFn` is supplied and no registered text connector is
available, return the deterministic keyword fallback without calling the fatal
provider resolver. Do not alter explicit `--no-llm`, injected test callers, or
configured-provider behavior.

- [ ] **Step 3: Verify the focused regression**

Run:

```bash
bun test --timeout 45000 tests/integration/cli-user-journey-post-install.test.ts
```

Expected: PASS with pristine output.

- [ ] **Step 4: Isolate Git commands that target an external repository**

Add a regression test that initializes a disposable outer repository, exports
its repository-local `GIT_*` variables, then publishes to a different disposable
GitHub Pages repository. Before the fix the publish must fail or target the
outer repository; after the fix only the intended site repository may receive
the commit.

The product Git helper must remove repository-local Git environment variables
before spawning Git with `cwd: repoDir`. The pre-commit hook must likewise clear
the invoking repository's local Git environment before running tests, so fixture
repositories cannot mutate the checkout's config. Preserve credentials and
non-local Git configuration.

- [ ] **Step 5: Refresh the generated CLI contract and full baseline**

Run:

```bash
bun run cli:surface:build
bun run lint
bun test --timeout 45000 tests/integration/
```

Expected: PASS.

- [ ] **Step 6: Commit the baseline repair**

```bash
git add .husky/pre-commit cli/lib/publish/article.ts cli/lib/templater/suggest.ts docs/cli-surface.generated.md tests/unit/article-publish.test.ts tests/integration/cli-user-journey-post-install.test.ts docs/superpowers/plans/2026-08-02-core-domain-store-implementation.md
git commit -m "fix(template): preserve offline suggest fallback"
```

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
  "run", "attempt", "rres", "robj", "mig", "mentry", "miss", "brand", "persona", "tmpl", "memory",
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
| Delivery | `units`; immutable `unit_revisions` unique `(unit_id, revision_no)`; `unit_items` unique `(unit_revision_id, position)`; `unit_presentations`; `presentation_caption_revisions`; `presentation_items`; `publications`; `metric_snapshots` |
| Execution | `agent_sessions`; `runs`; `run_attempts`; `run_results`; `run_objects`; migrated `jobs`, `job_logs`, `job_artifacts`; append-only `activity_events(id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id, project_id, entity_type, entity_id, action, payload_json, created_at)` |

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
- Produces: `createWorkspace`, `updateWorkspace`, `listWorkspaces`, `upsertSocialAccount`, `listSocialAccounts`, `createProject`, `listProjects`, `transferProjectMetadata`, `createIteration`, `addFeedback`, `resolveFeedback`, `listActivity`, and their row/input types

**Locked interface choices:**
- `transferProjectMetadata(projectId, { workspaceId, slug? }, expectedRowVersion)` changes only the Project row after a journaled bucket move has already succeeded.
- `resolveFeedback(feedbackId, { note?, links? })` accepts exact resolution targets of type `document_revision`, `artifact_revision`, `composition_revision`, `build`, `build_output`, `unit_item`, or `unit_presentation`; resolve the target's owning Workspace and reject cross-Workspace links before insert.
- `addFeedback` validates an optional target through the same ownership resolver. Iteration `reason` remains free text so imported client vocabulary is not lost.
- Workspace and Project list cursors are the last returned opaque ID, ordered by ID ascending. Limits default to 50 and must be integers from 1 through 100.
- Social-account `config` is public/non-secret JSON only. Recursively reject credential-like keys (`apiKey`, `accessToken`, `refreshToken`, `token`, `secret`, `password`, or `credential`) instead of persisting or returning their values.

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

export type Page<T, C = string> = { items: T[]; nextCursor: C | null };
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
- Modify: `cli/lib/store/types.ts`
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
expect(searchDocuments({ projectId: project.id, query: "periodontal" }).items[0]?.revisionId).toBe(v2.id);
expect(() => reviseDocument({ documentId: brief.id, expectedHeadId: v1.id, format: "markdown", body: "stale" })).toThrow(/conflict/i);
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `bun test tests/integration/domain-documents.test.ts`

Expected: FAIL because `documents.ts` does not exist.

- [ ] **Step 3: Implement immutable revisions and exact bindings**

Allow formats `markdown`, `text`, and `json`, and kinds `brief`, `style-guide`, `production-plan`, `scenario`, `storyboard`, `research`, `postmortem`, `memory`, `note`, and `custom`. Accept JSON as a parsed value or JSON string, recursively sort object keys while preserving array order, and store the canonical JSON text. Reject non-finite numbers. Reject valid data URLs anywhere in text or JSON; reject strict base64 payloads in JSON only below explicitly binary-bearing keys (`base64`, `b64`, `binary`, `blob`, `bytes`, `dataUrl`, `fileData`, or `imageData`) so ordinary prose and identifiers are not false positives. Calculate SHA-256 over the exact canonical envelope `{ format, title: title ?? null, body }`.

In one immediate transaction, insert the next revision, conditionally update `documents.current_revision_id` only when `expectedHeadId` matches, maintain FTS for the current head, and append `document.revised`. The first revision accepts only an omitted/null expected head; later revisions require the exact current head. Only current `markdown` and `text` heads are indexed; JSON is not. A Workspace-scoped Document may reference an Iteration only when the Iteration belongs to a Project in that Workspace.

Bindings store exact revision IDs; changing a Document head never alters existing project/build bindings.

- [ ] **Step 4: Cover Workspace inheritance and structured JSON**

`listDocuments` and `searchDocuments` return `Page<T>`. A Project sees its own Documents plus Workspace Documents; when both use the same slug, the Project Document shadows the Workspace Document. Bindings are unique by `(project_id, role)` or `(build_id, role)` and conflict rather than silently replacing an existing role. A Project may bind one of its own revisions or a Workspace revision from the same Workspace, but never another Project's revision. Build bindings follow the Build's Project ownership through its Composition and use a minimal raw-SQL Build fixture until Task 6 supplies the public Build store.

Test a Workspace style guide visible from its Project, same-slug Project shadowing, canonical JSON round-trip, exact Project and Build bindings, FTS pagination/current-head-only indexing, data-URL and binary-key rejection, same-Workspace Iteration validation, binding conflicts, and rejection of cross-Workspace bindings.

Run: `bun test tests/integration/domain-documents.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Documents**

```bash
git add cli/lib/store/types.ts cli/lib/store/documents.ts tests/integration/domain-documents.test.ts
git commit -m "feat(store): add versioned searchable documents"
```

### Task 4: Add atomic Objects and versioned Artifacts

**Files:**
- Modify: `cli/lib/store/types.ts`
- Create: `cli/lib/store/objects.ts`
- Create: `cli/lib/store/artifacts.ts`
- Test: `tests/integration/domain-objects.test.ts`
- Test: `tests/integration/domain-artifacts.test.ts`

**Interfaces:**
- Consumes: scope rows, `.ralphy/tmp/`, Node `createHash`, and activity transactions
- Produces: `prepareObject(input): Promise<PreparedObject>`, `registerPreparedObject(db, prepared): ObjectRow`, `ingestObject(input): Promise<ObjectRow>`, `resolveObjectPath(row): string`, `createArtifact`, `getArtifact`, `getArtifactRevision`, `addArtifactRevision`, `selectArtifactRevision`, `setArtifactRevisionState`, `addArtifactRelation`, and `addArtifactUsage`

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

Validate exact Workspace/Project ownership from SQLite. Project Objects resolve below `buckets/<workspace-id>/projects/<project-id>/objects/`; shared Objects resolve below `buckets/<workspace-id>/shared/objects/`. Require a positive-size readable regular source, a non-empty MIME, storage class `durable`, `working`, or `diagnostic`, and a basename-only `originalName`; reject URLs/data URLs, absolute/traversing locators, directories, and sources already under immutable buckets. Write/copy below `.ralphy/tmp/<object-id>/`, stream SHA-256 and byte counting, fsync, then promote within `.ralphy` to an ID-derived final key.

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

`registerPreparedObject` inserts only the Object row. `ingestObject` defaults to `copy`; generated Run temp callers pass `move`, and the source is removed only after Object registration plus `object.registered` activity commit. The migration plan uses `prepareObject` outside a transaction, then calls `registerPreparedObject` and updates its journal inside one short transaction. If registration fails after final promotion, preserve the unreferenced final bytes for integrity reporting.

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

Support Workspace-owned and Project-owned Artifact identities. Use the existing `MEDIA_ARTIFACT_KINDS` as the accepted intrinsic vocabulary except `ref`: reject new `kind: "ref"`, and let migration map a legacy ref to its underlying intrinsic kind (or `custom`) plus Artifact usage role `reference`.

Revision states are exactly `working`, `candidate`, `approved`, `rejected`, `superseded`, and `archived`. Revision rows and their Object bindings remain immutable. `setArtifactRevisionState` therefore creates a new revision backed by the same Object and parented to the source revision; if the source was selected, selection advances atomically to the new revision. Selection uses an expected selected revision and appends `artifact.selected`.

A Workspace Artifact accepts only a shared Object in that Workspace. A Project Artifact accepts its Project-local Objects plus shared Objects in its Workspace. Relations link exact revisions inside one Workspace. Usages assign an exact revision and non-empty role to exactly one validated Workspace, Project, or feedback context; arbitrary unchecked polymorphic contexts remain internal until their owning store exists.

- [ ] **Step 5: Run storage and Artifact checks**

Run: `bun test tests/integration/domain-objects.test.ts tests/integration/domain-artifacts.test.ts`

Expected: PASS, including cross-scope rejection, traversal/data-URL rejection, copy/move behavior, same-name non-overwrite, post-promotion transaction failure with preserved orphan bytes, missing-byte rejection, immutable old revisions, state-as-new-revision behavior, shared Object reuse, and exact relation/usage ownership.

- [ ] **Step 6: Commit storage and media identity**

```bash
git add cli/lib/store/types.ts cli/lib/store/objects.ts cli/lib/store/artifacts.ts tests/integration/domain-objects.test.ts tests/integration/domain-artifacts.test.ts
git commit -m "feat(store): add immutable objects and artifact revisions"
```

### Task 4A: Harden store identity and Agent Session scope

**Files:**
- Modify: `cli/lib/store/schema.ts`
- Modify: `cli/lib/store/types.ts`
- Create: `cli/lib/store/internal-types.ts`
- Create: `cli/lib/store/sessions.ts`
- Modify: `cli/lib/store/documents.ts`
- Modify: `cli/lib/store/artifacts.ts`
- Create: `tests/integration/domain-sessions.test.ts`
- Modify: `tests/integration/domain-documents.test.ts`
- Modify: `tests/integration/domain-artifacts.test.ts`

**Interfaces:**
- Consumes: Task 1 database, Task 3 Documents, Task 4 Artifacts, and activity transactions
- Produces: `getStoreIdentity`, `startAgentSession`, `getAgentSession`, `listAgentSessions`, `endAgentSession`, and a shared session-scope assertion used by provenance-bearing stores

- [ ] **Step 1: Lock stable store and Session identity in the pre-release schema**

Store one generated `store_id` inside `ralphy.db`; it must survive close/reopen, directory moves, staging, and cutover because secret-service identity must never depend on the mutable `.ralphy` path. Require every Agent Session to belong to one Workspace and optionally one of that Workspace's Projects. Add database guards that prevent changing a Session's Workspace, Project, agent, metadata, or start time after insertion; only a one-way `ended_at: NULL -> timestamp` transition is legal.

Add SQLite provenance guards for Documents, Artifacts, Compositions, Units, and Runs. A Workspace entity accepts only an active Workspace Session. A Project entity accepts an active Session from the same Workspace whose Project is either null or exactly that Project. An unscoped migration Run cannot reference a Session. Store APIs must perform the same checks before inserts so callers receive clear errors instead of raw constraint failures.

- [ ] **Step 2: Add the minimal Session lifecycle**

`startAgentSession` validates a non-empty agent label, canonical JSON metadata, and exact Workspace/Project ownership, then records `agent_session.started`. `endAgentSession` is idempotent only through an explicit expected-open transition: the first close records `agent_session.ended`; a second close conflicts. Session scope never changes. Listing is cursor-paginated and may filter a Workspace to all sessions or one exact Project.

Apply the shared active-session scope assertion to `reviseDocument`, `addArtifactRevision`, and `setArtifactRevisionState`. A state transition records the author making the transition and never copies the source revision's author.

- [ ] **Step 3: Prove cross-scope and stable-identity behavior**

Test stable store identity across reopen, invalid cross-Workspace Session creation, immutable Session scope, one-way ending, pagination, and direct-SQL provenance guards. For both Documents and Artifacts, test rejection of foreign-Workspace, sibling-Project, ended, and Project-Session-to-Workspace authors; test that a Workspace Session can author a Project revision and an exact Project Session can author its own Project revision.

- [ ] **Step 4: Commit the invariant before Runs**

```bash
git add cli/lib/store/schema.ts cli/lib/store/types.ts cli/lib/store/sessions.ts cli/lib/store/documents.ts cli/lib/store/artifacts.ts tests/integration/domain-sessions.test.ts tests/integration/domain-documents.test.ts tests/integration/domain-artifacts.test.ts docs/superpowers/plans/2026-08-02-core-domain-store-implementation.md
git commit -m "feat(store): enforce agent session scope"
```

### Task 5: Consolidate Runs and jobs into the domain database

**Files:**
- Create: `cli/lib/store/runs.ts`
- Modify: `cli/lib/store/types.ts`
- Modify: `cli/lib/jobs/db.ts`
- Modify: `cli/lib/jobs/types.ts`
- Modify: `cli/lib/jobs/worker.ts`
- Test: `tests/integration/domain-runs.test.ts`
- Modify: `tests/integration/jobs-db.test.ts`
- Test: `tests/integration/jobs-worker-runs.test.ts`

**Interfaces:**
- Consumes: Task 1 database, Task 4 Object promotion, and existing jobs query API
- Produces: `startRun`, `startRunAttempt`, `finishRunAttempt`, `finishRun`, `recordRunObject`, `promoteRunObject`, aggregate `getRun`; existing job exports retain their current signatures and gain an optional `run_id`

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

Run and attempt states are `pending`, `running`, `succeeded`, `failed`, and `cancelled`. New Runs start pending; attempts start running. A Project Run derives its Workspace and rejects a mismatch, Workspace-only Runs use shared storage, and only `kind: "migration"` may be unscoped. One Run survives retries while each execution adds a monotonically numbered attempt; starting a retry moves a terminal Run back to running. Reject starting an attempt while the Run is already running. Finish an attempt only from running and a Run only from pending/running. Preserve the Run's first start time across retries while clearing its prior terminal time/error when a new attempt starts.

Attempt response metadata, cost, and errors are mutable operational fields, but every transition appends activity. `run_objects.path` is relative to `.ralphy`; reject absolute, drive, traversal, and data-URL locators. `promoteRunObject` validates the recorded byte/hash facts, calls `ingestObject(..., transfer: "move")` before linking the returned Object ID, and resolves promoted bytes through that Object thereafter. A post-promotion link failure may leave only an unreferenced immutable Object.

- [ ] **Step 3: Point the existing jobs API at `ralphy.db`**

Remove the private connection and schema migration from `cli/lib/jobs/db.ts`; make `openDb`, `closeDb`, and `dbPath` compatibility adapters over the domain database and preserve every existing job, bulk filter, log, artifact, scheduling, and count export/signature. Add optional `run_id` to `JobInsertInput`, `JobRow`, and inserts. Keep unconstrained legacy `project_id` behavior and external `.ralphy/job-logs/`; do not create or import old `jobs.db` here.

For a claimed job with `run_id`, the worker creates a local/process attempt before validation/gating/spawn and finishes it plus the Run on empty argv, spend-gate block/rejection, synchronous spawn throw, asynchronous child error, success, non-zero/null exit, SIGTERM/SIGKILL, external cancellation, and daemon shutdown. Completed maps to succeeded, failed/blocked to failed, and cancelled to cancelled. Dependency-blocked jobs are unclaimed and retain a pending Run until retry or cancellation; spend-gate blocked jobs have an attempt and a failed Run. Pending/blocked cancellation terminalizes only an unstarted pending linked Run. A retried job creates another attempt on the same Run when reclaimed.

Use one shared exactly-once completion path for the Job, attempt, and Run. Cancellation wins over a later child close; an error followed by close cannot produce two transitions; cancellation while awaiting the asynchronous spend gate prevents spawn. Make `finalizeJob` conditional so a completed child cannot overwrite a concurrently cancelled Job. Do not add separate job activity events.

- [ ] **Step 4: Verify jobs and Runs together**

Run the Run/jobs/worker suites plus direct queue, scheduling, enqueue, and bulk-filter dependents.

Expected: PASS, and `domainDbPath()` is the only SQLite path created in the fixture. Preserve numeric job IDs, snake-case rows, priority/ID ordering, arbitrary legacy `project_id`, append-mode logs across retry, dependency behavior, and the exact public `JobArtifactRow` shape without exposing `object_id`. Cover synchronous/asynchronous spawn failure, spend-gate rejection, cancellation during the gate, child error/close races, daemon stop, and retry on the same Run.

- [ ] **Step 5: Commit execution state**

```bash
git add cli/lib/store/runs.ts cli/lib/store/types.ts cli/lib/jobs/db.ts cli/lib/jobs/types.ts cli/lib/jobs/worker.ts tests/integration/domain-runs.test.ts tests/integration/jobs-db.test.ts tests/integration/jobs-worker-runs.test.ts docs/superpowers/plans/2026-08-02-core-domain-store-implementation.md
git commit -m "feat(store): consolidate runs and jobs"
```

### Task 6: Add generic Composition revisions and reproducible Builds

**Files:**
- Modify: `cli/lib/store/schema.ts`
- Modify: `cli/lib/store/types.ts`
- Create: `cli/lib/store/compositions.ts`
- Modify: `tests/integration/domain-db.test.ts`
- Test: `tests/integration/domain-compositions.test.ts`

**Interfaces:**
- Consumes: Projects, Iterations, Objects, Artifact revisions, Documents, Runs, and activity
- Produces: `createComposition`, `reviseComposition`, `putCompositionSource`, `removeCompositionSource`, `bindCompositionInput`, `removeCompositionInput`, `sealCompositionRevision`, `startBuild`, `completeBuild`, `failBuild`, `cancelBuild`, `selectCompositionRevision`, and aggregate `getComposition`

- [ ] **Step 1: Write failing engine-switch and multi-output tests**

```ts
const composition = createComposition({ projectId: project.id, slug: "perio-cut", kind: "video" });
const v1 = reviseComposition({ compositionId: composition.id, expectedLatestRevisionId: null, engine: "hyperframes", engineConfig: {} });
putCompositionSource({ revisionId: v1.id, logicalPath: "index.html", objectId: htmlObject.id });
bindCompositionInput({ revisionId: v1.id, artifactRevisionId: scene.id, role: "scene", position: 0 });
const sealed = sealCompositionRevision({ revisionId: v1.id });
const build = startBuild({ compositionRevisionId: sealed.id, profile: { name: "social", crf: 24 }, runId: run.id });
completeBuild({ buildId: build.id, outputs: [
  { artifactRevisionId: masterRevision.id, role: "master", position: 0 },
  { artifactRevisionId: previewRevision.id, role: "preview", position: 1 },
] });

const v2 = reviseComposition({ compositionId: composition.id, expectedLatestRevisionId: v1.id, parentRevisionId: v1.id, engine: "remotion", engineConfig: {} });
expect(v2.engine).toBe("remotion");
expect(getComposition(composition.id).revisions[0]?.builds[0]?.outputs).toHaveLength(2);
expect(() => putCompositionSource({ revisionId: v1.id, logicalPath: "index.html", objectId: other.id })).toThrow(/sealed/i);
```

- [ ] **Step 2: Implement draft checkout metadata and sealing**

Composition kinds are `video`, `carousel`, `sticker-pack`, `image`, `audio`, `document`, and `custom`. Engine is a non-empty slug stored per revision. `reviseComposition` compares required `expectedLatestRevisionId` with the greatest revision number, independently from manual selection; parent defaults to latest, and a caller may explicitly branch from an older same-Composition parent only while acknowledging the real latest revision. Explicit null parent is valid only for the first revision. A new draft clones only the chosen parent's ordered sources and inputs under new child IDs, while accepting a new engine/version/config; it never clones Builds, bindings, Iteration, author, state, or timestamps. Validate Iteration and active author Session against the exact Project.

Draft source rows upsert by safe relative POSIX logical path and inputs upsert by ordered position; explicit remove operations let the later checkout reconciler represent deletions. Upserts use query plus UPDATE/INSERT rather than conflict replacement. Source Objects must resolve to present bytes and may be Project-local or Workspace-shared; input Artifact revisions may be Project-local or Workspace-owned in the same Workspace and must resolve to present bytes. Sealing requires at least one source or input and hashes canonical UTF-8 JSON containing kind, engine/version/config, ordered source path/position/Object ID/hash, and ordered exact input position/revision/role/config. Recursively sort object keys, preserve arrays, distinguish null from `{}`, and reject cycles, non-finite numbers, non-JSON objects, data URLs, and locked binary payloads. It then sets `sealed_at` and makes all creative rows immutable. Editable checkout materialization and snapshotting remain a later CLI-controller concern.

`startBuild` requires a sealed revision and exact same-Project Run (Workspace-only, sibling, foreign, and unscoped Runs reject) and inserts a running Build before engine work starts. `failBuild`/`cancelBuild` retain the Build and Run; the store never transitions the Run itself. `completeBuild` atomically links one or more exact Project Artifact revision outputs whose positions are contiguous `0..N-1`; Workspace-shared outputs reject. Terminal Builds cannot transition or gain outputs. Add pre-release v1 guards that make Build outputs immutable and insertable only while running, and Build Document bindings immutable and insertable only while pending/running. Guard ID and logical-key `INSERT OR REPLACE` conflicts for Composition files/inputs, Build outputs/bindings, and Builds with `recursive_triggers=OFF`; lock Build identity/provenance fields and deletion. Neither outcome changes Composition selection automatically; selection accepts sealed same-Composition revisions only and uses an expected selected revision.

- [ ] **Step 3: Cover conflicts, exact provenance, and failed Builds**

Test expected-latest and expected-selection conflicts separately; selected-v1/latest-v2 conflict; explicit older-parent branch; clone/remove behavior; duplicate logical paths/positions; path/symlink/missing-byte and source/input scope rejection; Iteration/Session scope; engine change; canonical manifest digest stability; raw-SQL sealed-child/output/binding/Build update/delete/REPLACE immutability; Build transition/output rollback including activity abort; failed/cancelled Build reproducibility with unchanged Run; exact Workspace/Project Document bindings; and selection of an older sealed revision. Aggregate ordering is revisions by number, children/outputs by position, and Builds/bindings by `(created_at,id)`, read from one snapshot transaction.

Run: `bun test tests/integration/domain-compositions.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit production assembly**

```bash
git add cli/lib/store/schema.ts cli/lib/store/types.ts cli/lib/store/compositions.ts tests/integration/domain-db.test.ts tests/integration/domain-compositions.test.ts
git commit -m "feat(store): add composition revisions and builds"
```

### Task 7: Add flexible Units, platform presentations, publications, and metrics

**Files:**
- Modify: `cli/lib/store/schema.ts`
- Modify: `cli/lib/store/types.ts`
- Modify: `cli/lib/store/runs.ts`
- Modify: `cli/lib/store/scopes.ts`
- Create: `cli/lib/store/units.ts`
- Modify: `tests/integration/domain-db.test.ts`
- Modify: `tests/integration/domain-scopes.test.ts`
- Test: `tests/integration/domain-units.test.ts`

**Interfaces:**
- Consumes: Artifact revisions, Build outputs, Workspace social accounts, Runs, and activity
- Produces: `createUnit`, atomic-graph `reviseUnit`, `selectUnitRevision`, `recordPublication`, fenced `claimPublication`/`finishPublicationClaim`, `requestPublicationReconciliation`/`claimPublicationReconciliation`, `claimPublicationStatusLookup`/`finishPublicationStatusLookup`, `cancelDraftPublication`, `claimPublicationCancellation`/`finishPublicationCancellation`, `recoverExpiredPublicationFollowUp`, foundational immutable `recordRunResult`, `appendMetricSnapshot`, `listMetricSnapshots`, cumulative `getMetricTotals`, and aggregate `getUnit`

- [ ] **Step 1: Write failing multi-item and shared-video tests**

```ts
const pack = createUnit({ projectId: project.id, slug: "telegram-pack", format: "sticker-pack" });
const packRevision = reviseUnit({ unitId: pack.id, expectedLatestRevisionId: null, items: stickerRevisions.map((id, position) => ({
  artifactRevisionId: id,
  role: "sticker",
  position,
})) });
selectUnitRevision({ unitId: pack.id, revisionId: packRevision.id, expectedSelectedRevisionId: null });
expect(getUnit(pack.id).latestRevisionId).toBe(packRevision.id);
expect(getUnit(pack.id).selectedRevisionId).toBe(packRevision.id);

const short = createUnit({ projectId: project.id, slug: "perio-short", format: "video" });
const shortRevision = reviseUnit({
  unitId: short.id,
  expectedLatestRevisionId: null,
  items: [{ artifactRevisionId: video.id, role: "primary", position: 0 }],
  presentations: ["tiktok", "instagram", "youtube"].map((platform) => ({
    platform,
    caption: `${platform} caption`,
    options: {},
  })),
});
expect(getUnit(short.id).latestRevisionId).toBe(shortRevision.id);
```

- [ ] **Step 2: Implement immutable ordered bundles**

Correct pre-release schema v1 so Units have required `workspace_id`, optional
`project_id`, independent nullable `latest_revision_id` and
`selected_revision_id`, and partial unique slug indexes for Workspace and
Project scope. Add nullable `sealed_at` to Unit revisions and guards that allow
only the store's final seal transition; item, presentation, and
presentation-item children may insert only while unsealed and may never change
afterward. Both Unit pointers may reference only a sealed revision belonging to
that same Unit; direct SQL update/delete/REPLACE cannot bypass that rule.
Support Workspace-owned and Project-owned Units. Workspace Units use
Workspace-shared Artifact/Document revisions; Project Units may additionally
use revisions owned by that Project.

A Unit identity is immutable immediately after `createUnit`, including before
its first revision: lock `workspace_id`, nullable `project_id`, `slug`,
`format`, and `created_at`, forbid delete and same-ID/logical-key `INSERT OR
REPLACE`, and expose no rename/re-scope/reformat mutation. An abandoned empty
Unit remains an auditable empty identity rather than being repurposed or
silently removed; only its revision pointers and timestamps may advance through
the named optimistic APIs.

Add required presentation `position` with unique `(unit_revision_id, position)` alongside platform uniqueness, and `presentation_items.created_at`. A Presentation with zero `presentation_items` inherits every base Unit item in base order with base config. A non-empty set is the complete explicit ordered subset for that platform: positions are contiguous, each row references one unique base `unit_item_id` from the same revision, omitted base items are intentionally absent, and no implicit items are merged in. Base item config and presentation-item override config remain separate. Persist presentation array order exactly.

Store caption history as immutable ordered
`presentation_caption_revisions(id, presentation_id, revision_no,
parent_revision_id, state, text, created_at)` plus one
`unit_presentations.effective_caption_revision_id`. States are `draft`,
`humanized`, `auto-draft-archived`, and `final`; every parent/effective pointer
must belong to that Presentation and the effective row is locked when the Unit
revision seals. Multiple legacy `caption_versions` survive as history rather
than being collapsed into one string.

Fix the Unit author Session trigger to resolve scope through
`units.workspace_id` with nullable Project rather than inner-joining Projects,
so Workspace Units accept only active Workspace Sessions while Project Units
accept a Workspace Session or exact-Project Session. Add persistent
primary/logical-key insert guards for revisions and every child so `INSERT OR
REPLACE` cannot bypass sealed immutability with `recursive_triggers=OFF`.

`reviseUnit` requires `expectedLatestRevisionId` and compares it with the
greatest revision/current latest pointer independently from manual selection
(null only for the first revision). Parent defaults to latest; a caller may
branch from an older sealed same-Unit revision only while acknowledging the
real latest. It inserts a complete revision graph in one transaction: at least
one ordered heterogeneous item, ordered unique-platform presentations,
optional cover/crop/safe-area/options, and zero-or-complete ordered platform
item subsets. Cover must be an Artifact revision already present among base
items. It seals only after persistent guards prove at least one base item,
contiguous base/presentation/subset positions, unique platform/base refs,
same-revision child ownership, exact-one item targets, and valid cover
membership. The same transaction advances only `latest_revision_id` and
appends activity; selection changes solely through `selectUnitRevision` with
`expectedSelectedRevisionId`. Caption/item/presentation edits create another
Unit revision; do not expose post-creation setters that mutate an old graph.
Validate scope, parent, Session, and Project Iteration. Presentation platform
is canonical lowercase kebab ASCII matching
`^[a-z0-9]+(?:-[a-z0-9]+)*$`; reject aliases `reels`/`shorts` because migration
maps them to `instagram`/`youtube`. Publication target platform is always read
from that stored Presentation and is never accepted as a second caller field.

The required base item may target either an Artifact revision or a Document
revision, so text-only post/thread/article Units with no media remain valid.
Repeated Artifact/Document revisions are allowed at different base positions
(including 40-item packs); uniqueness applies to item IDs/positions, not target
revision IDs.

Add foundational immutable `run_results(id PRIMARY KEY, run_id, position, entity_type,
entity_id, created_at)` with unique `(run_id, position)` and `(run_id,
entity_type, entity_id)`. Internal `recordRunResult` stores only stable result
IDs, validates their exact scope, and permits INSERT only while the parent Run
is `pending | running`; a persistent trigger enforces the same rule. It rejects
update/delete/same-ID/logical-key `INSERT OR REPLACE` even with
`recursive_triggers=OFF`. Every operation that has results must insert all of
them before changing its Run to a terminal state in the same transaction; no
terminal Run can gain a late result. Task 7 uses it inside ordinary Run
transactions; Task 9 adds bounded consumer queries and external-tuple replay
rather than introducing this table later.

Publications are append-only attempts with one required dedicated submission
Run, pending for every normal new attempt, and immutable rail
`postiz | github-pages | devto | hashnode | manual`, nullable
`revised_from_publication_id`, provider identifiers, state, URL, validated
schedule/submission/publish timestamps, error/failure stage, and a required
globally unique idempotency key. Each attempt binds the exact sealed
Presentation, its effective caption revision, and canonical effective platform
options; later Unit selection/caption revisions cannot change what was sent.
Target is the Presentation platform; do not duplicate it in another column.

Social-account identity is immutable: canonicalize `platform` with the same
lowercase-kebab rule, and lock `workspace_id`, `platform`, and `external_id`
against update/delete/rekey/REPLACE. An upsert may update only display/profile/
public-config fields for the exact existing identity; changing Workspace,
platform, or external ID creates a new account row. Later credential columns
remain mutable only through their own optimistic API and never redefine this
identity.

`postiz`, `devto`, and `hashnode` require a same-Workspace social account whose
canonical platform matches, except a terminal historical/preflight `failed`
attempt with `failure_stage = "account-resolution"`, no claim, and no provider
ID. `github-pages` and `manual` accept no social account and use rail-specific
validation. A Medium export is a RunObject plus approval artifact, not a
Publication or published URL; a later confirmed manual post may create a
`manual` attempt. `revised_from_publication_id` must resolve to an older
same-Workspace attempt and is immutable.

`recordPublication` has only two canonical insert shapes. A normal insert is
`draft` with `claim_epoch = 0`, no active claim/token/expiry, no provider ID/
URL, no submitted/published/failure timestamps or error, and nullable immutable
`scheduled_at` that, when present, is an integer `>= created_at`. Its dedicated
submission Run must still be pending. The only terminal-at-insert shape is a
validated account-resolution/preflight `failed` row with no claim/provider ID/
URL or submission/publish timestamps, an allowlisted failure stage/safe code,
and the dedicated Run atomically given its Publication result before that Run
is terminalized failed and Activity is appended.
This preserves historical/pre-binding failures without pretending a provider
call happened or adding an illegal `draft -> failed` transition.

Provider IDs are bounded printable strings and may move null -> value only
under the matching live fence. A Publication URL, when supplied, must be at
most 2048 UTF-8 bytes and byte-equal to canonical `new URL(value).href`, use
`https:`, have a non-empty hostname, and contain no parsed username, password,
or fragment; it too moves only null -> value and is immutable. Runtime rejects
parse failures and checks the URL parser's `protocol`, `hostname`, `username`,
`password`, and `hash` fields. SQL enforces the bounded/canonical structural
fields with an exact `https://` prefix and non-empty authority, isolates that
authority before the first `/`, `?`, or `#`, and rejects `@` only inside that
authority. It must not use a global `instr(url, '@') = 0` check, because valid
TikTok paths such as `/@creator/video/...` contain `@`. `submitted_at` may move null -> an integer
`>= created_at` only on provider-confirmed `scheduled | submitted | published`;
`published_at` may move null -> an integer `>= submitted_at` only with
`published`, which also requires the canonical URL. Draft/submitting rows have
neither timestamp; scheduled requires immutable `scheduled_at` plus
`submitted_at`; submitted requires `submitted_at`; terminal failed/cancelled/
uncertain rows may retain only timestamps reached in their prior valid state.
SQLite guards enforce this complete timeline on every transition.

A duplicate key for the same effective presentation/account/rail returns the
original attempt with its original schedule and audits an idempotent skip; it
does not insert another Publication. The Run may differ only for a new
attempt/key, never for replay. Reusing a key for another target/account/rail
conflicts. Validate exact Unit/account/Run ownership: Workspace Unit requires
Workspace-only Run, Project Unit exact-Project Run. One Publication attempt has
one submission Run; every target in a multi-target request has a distinct
Publication and Run.

Provider submission uses an exclusive fenced claim. `claimPublication(id,
expectedState, leaseMs)` conditionally moves `draft -> submitting`, increments
`claim_epoch`, writes a random `claim_token` plus expiry, creates/starts the
submission Run's single provider RunAttempt with a safe canonical effective
request, moves the Run to `running`, and appends activity in one transaction;
another live claim cannot call the provider. `finishPublicationClaim` requires
the exact epoch/token and atomically terminalizes the Publication, that
RunAttempt, the submission Run, its Publication Run result, and activity. A
stale worker cannot win after lease expiry or reconciliation. The provider HTTP
call is outside SQLite and occurs at most once for that submission claim.
Every claim/finish/recovery statement receives one captured safe-integer `now`.
Lease duration is an integer `1..300_000`; checked addition must not overflow.
SQL defines live strictly as `claim_expires_at > now` and expired strictly as
`claim_expires_at <= now`; equality is expired. Finish requires matching kind/
Run/epoch/token plus a live lease in its conditional UPDATE. A claim never
silently steals an expired fence: the matching explicit recovery API closes it
first. Tests exercise `expiry - 1`, exact expiry, and `expiry + 1` against SQL
predicates rather than a JavaScript pre-read.
The locked operational claim fields include `claim_kind = submission |
reconciliation | status-lookup | cancellation` and `active_claim_run_id`:
submission must point to the required submission Run and every follow-up kind
to its own distinct Run. A shared validator and persistent trigger reject any
Run present in `publications.submission_run_id` for any Publication—not merely
the current one—as a reconciliation/status/cancellation Run; a follow-up Run
must also be pending, same-scope, attempt/result-free, and unused by another
active claim. The converse Publication INSERT trigger rejects choosing a Run
already used by any active follow-up, closing the other insertion order. They clear only during the same terminalizing/
invalidation transaction; immutable Run results and Activity retain completed
claim history.

The locked transition graph is:

```text
draft -> submitting | cancelled
submitting -> scheduled | submitted | published | failed | reconciliation_required | unknown
scheduled -> published | failed | cancelled | reconciliation_required | unknown
submitted -> published | failed | cancelled | reconciliation_required | unknown
unknown -> reconciliation_required
reconciliation_required -> scheduled | submitted | published | failed | cancelled | unknown
published | failed | cancelled -> terminal
```

Postiz immediate acceptance is `submitted`; scheduled acceptance is
`scheduled`. A crash/timeout after provider dispatch but before a durable
response becomes `reconciliation_required` when a provider lookup is possible,
otherwise `unknown`; replay returns that existing attempt and never POSTs it
again. An expired `submitting` claim can only be closed through
`requestPublicationReconciliation`, which takes expected state/Run/epoch plus
one internally captured `now`, accepts no token, and conditionally requires
`claim_expires_at <= now`: in one transaction it terminalizes the
original RunAttempt/submission Run with safe unknown-outcome metadata, records
the Publication result, clears the token/lease, increments the epoch to
invalidate the submitter, and moves to `reconciliation_required` or `unknown`.
It can never be reclaimed for another POST. Only reconciliation may leave those
states. A reconciliation first moves `unknown -> reconciliation_required` when
manual/provider evidence is available, then `claimPublicationReconciliation`
attaches a distinct pending reconciliation Run, creates/starts its single
lookup/manual RunAttempt, and issues a fresh token/epoch. Finishing requires
that exact reconciliation fence and atomically terminalizes its RunAttempt,
Run, Run result, Publication outcome, and activity; it performs lookup/manual
resolution only, never submission. No uncertain path leaves an attempt running.
Retry after a confirmed failure creates a new Publication/submission Run/key.

Every provider follow-up Run reports execution of that follow-up independently
from the resulting Publication state. A completed lookup/reconciliation/cancel
request that authoritatively proves the Publication is `failed`, `published`,
or `cancelled` finishes its follow-up Run/RunAttempt as `succeeded` and records
that Publication state in the Run result. A timeout, transport error, or
provider-operation failure finishes the follow-up Run/RunAttempt as `failed`,
even when the Publication remains `scheduled | submitted` or moves to
`reconciliation_required | unknown`. Publication terminal state never implies
the follow-up Run's terminal state.

`recoverExpiredPublicationFollowUp({ publicationId, expectedState,
expectedClaimKind, expectedClaimRunId, expectedClaimEpoch })` is the only
expiry path for `status-lookup | cancellation | reconciliation`; submission
uses `requestPublicationReconciliation` instead. It accepts no claim token and
captures `now` once from the store's test-injectable clock (never caller input),
then conditionally requires the exact active kind/Run/epoch/state with
`claim_expires_at <= now`. In one transaction it marks the running attempt and
follow-up Run failed with a safe `lease-expired` code, inserts that Run's
Publication result before terminalizing the Run, appends redacted Activity,
clears every active-claim field, and increments `claim_epoch` exactly once.
Expired status lookup retains its known `scheduled | submitted` Publication
state. Expired cancellation moves to `reconciliation_required` when the
provider supports lookup, otherwise `unknown`; expired reconciliation remains
`reconciliation_required | unknown` according to its current uncertainty and
provider capability. No token is returned, logged, placed in Activity/result/
error, or accepted from the caller; repeat recovery with the stale epoch
conflicts after the first atomic close.

Status polling is explicit provider work, not a read-side mutation.
`claimPublicationStatusLookup` accepts only `scheduled | submitted`, an exact
expected state, and a distinct pending lookup Run; under a fresh epoch/token it
starts that Run's single provider RunAttempt without changing the Publication
state. `finishPublicationStatusLookup` requires that fence, then atomically
keeps the state or moves it to a provider-proven `published | failed |
cancelled`, closes
the lookup RunAttempt/Run, records the Publication Run result, and appends
Activity. A timeout/provider-operation failure closes the lookup attempt/Run as
failed and clears its fence
while retaining the known `scheduled | submitted` state; a later lookup needs
a new Run/tuple/key. Lookup never calls a submission endpoint.

`cancelDraftPublication(id, expectedState)` atomically moves an unsubmitted
draft to `cancelled`, cancels its still-pending submission Run, records the
Publication result, and appends Activity without a cancellation Run or
RunAttempt. It is an optimistic local mutation with no external tuple/
idempotency-key replay contract: a lost response is resolved by reading the
Publication, while a repeated stale `expectedState: "draft"` conflicts.
Provider-backed
`scheduled | submitted` cancellation instead uses
`claimPublicationCancellation` with a distinct pending cancellation Run and a
fresh epoch/token. `finishPublicationCancellation` may move to `cancelled` only
on provider confirmation (or to a provider-proven `published | failed`) and
atomically closes its RunAttempt/Run/result/Activity. An uncertain cancellation
closes that attempt/Run as failed, invalidates the fence, and moves to
`reconciliation_required | unknown`; only a separately fenced reconciliation
may resolve it. Cancellation and lookup never resubmit content.

Lock `scheduled_at` after creation;
`submitted_at` and `published_at` may move only null -> a valid timestamp on
their matching transition. Provider publication ID/URL may move only null ->
value under the active fence and are then immutable. Claim token never appears
in DTO/activity/error data.

Metric snapshots are immutable time-series rows with required non-empty source
slug, `as_of`, optional all-null-or-valid `window_start`/`window_end`, indexed
common metrics, and validated raw provider JSON. Preserve nullable `ctr`,
`retention_curve_json`, `avg_view_duration_sec`, and `note`; SQL and DTOs must
distinguish unknown `NULL` from measured zero. Add duplicate-ID/REPLACE,
no-update, and no-delete triggers; use SQLite integer/real-type checks for time,
common non-negative counters/duration, finite CTR, and the validated retention
curve. Retain unknown provider-specific fields in raw JSON.
`listMetricSnapshots` filters one Publication plus optional source/as-of/window
and is bounded. Cumulative totals never sum time-series history. Apply the
requested as-of/window/source filter first, then choose exactly one winner per
Publication by `(as_of DESC, created_at DESC, id DESC)`. Without a source
filter, candidates span all sources; with an explicit source, candidates are
restricted to that source before the same total order. Sum only the winners
across Publications. A source switch (for example Postiz to YouTube) therefore
cannot double-count one Publication, and equal `as_of` rows remain
deterministic.
Metric refresh records every created snapshot ID as an ordered Run result, so
the foundational ordinary Run transaction is atomic; Task 9 proves external
tuple replay returns those original IDs without appending duplicate samples.

Lock Publication identity/provenance/claim/provider/timestamp fields and the
forward transition graph in SQLite as well as store code; forbid deletion and
primary/idempotency-key REPLACE. This is operational state on one append-only
attempt, not a mutable identity row. Persistent seal guards cover the complete
Unit graph and persistent Publication guards cover every transition even with
`recursive_triggers=OFF`.

- [ ] **Step 3: Cover platform and analytics behavior**

Test an eight-image carousel, a 32-sticker pack, a 40-item pack that repeats
the same Artifact revision at distinct positions, text-only post/thread/article
Units whose sole ordered item is a Document revision, a Workspace Unit,
presentation-order round trip, a shared video with one
Object/Artifact/item and three TikTok/Instagram/YouTube presentations, zero
presentation items inheriting all, and a non-empty complete ordered subset with
unique base refs and separately round-tripped config. Cover membership,
scope/Session rejection, stale `expectedLatestRevisionId` independently from a
stale `expectedSelectedRevisionId`, branching from an older sealed revision,
immutable create-only empty Unit identity, canonical platform plus
`reels`/`shorts` rejection, and raw-SQL cross-Unit/unsealed pointer plus update/
delete/same-ID/same-logical-key REPLACE immutability all reject. Direct SQL cannot seal a missing,
non-contiguous, duplicate-presentation-ref, or cross-revision graph. Preserve
multiple caption revisions and the `humanized`/`auto-draft-archived` states,
and prove a sealed effective caption cannot be changed.

For Publications, test exclusive claim, competing workers, stale fence after
lease/reconciliation, strict live/expired SQL behavior at `expiry - 1`, exact
expiry, and `expiry + 1`, the complete transition table, canonical normal and
preflight insert shapes, HTTPS URL normalization/credential/fragment/size
rejection, acceptance of a canonical TikTok URL whose path contains
`/@creator/...`, rejection of parsed authority userinfo such as
`https://user:pass@host/...`, rejection of an empty hostname such as
the malformed `http://` plus every non-HTTPS protocol, and proof that neither
SQL nor runtime applies a global `@` ban. Exercise the same three cases through
direct SQL so the authority-only guard cannot regress. Cover timeline
requirements, timestamp/provider-ID/URL one-way locks,
canonical Presentation-derived platform, immutable social-account identity,
Postiz submitted/scheduled behavior, idempotent replay,
crash-after-POST becoming `reconciliation_required`/`unknown` without a second
POST, expired submission claim invalidation, fresh fenced reconciliation with a
separate Run and no submit call, no running RunAttempt on any uncertain path,
fenced status lookup from both `scheduled` and `submitted` with a separate
RunAttempt/Run/result, local draft cancellation, fenced provider cancellation
with a separate RunAttempt/Run/result, and proof that neither path can resubmit.
Reject a current or other Publication's submission Run globally as any follow-
up Run through both store and direct SQL. Expire status, cancellation, and
reconciliation claims through `recoverExpiredPublicationFollowUp`: assert the
known status state is retained, cancellation/reconciliation become or remain
uncertain, attempt/Run/result/Activity close atomically, epoch increments once,
and no token appears or is accepted.
Assert draft cancellation has no external replay identity; successful follow-up
execution may record a failed/cancelled Publication while its Run succeeds, and
timeout/provider-operation failure makes the follow-up Run fail regardless of
the retained/moved Publication state. Also cover partial-target attempts with
distinct Runs, failed then separate successful attempt,
all supported rails, nullable-account historical/preflight failures,
same-Workspace `revised_from_publication_id`, a Medium approval export that
creates no Publication, an idempotent skip recorded only as Activity, and
atomic Publication + Run result + Run state + activity rollback on an injected
failure. Direct SQL and store calls reject RunResult insertion after a Run is
terminal; every success/failure/cancel path records ordered results before its
terminal Run update and rolls back both on injection. For Metrics, test source/as-of/window filtering, immutable rows,
unknown `NULL` versus measured zero, newest-per-Publication totals across all
sources by default, newest-per-Publication-within-source totals when filtered,
a source switch that does not double-count, equal-`as_of` rows resolved by
`created_at` and then ID in descending order, and rejection of fractional/
negative/non-finite normalized counters while preserving provider values in
raw JSON. Task 9 covers external Metric-refresh replay returning the same
snapshot IDs.

Run: `bun test tests/integration/domain-units.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit delivery state**

```bash
git add cli/lib/store/schema.ts cli/lib/store/types.ts cli/lib/store/runs.ts cli/lib/store/scopes.ts cli/lib/store/units.ts tests/integration/domain-db.test.ts tests/integration/domain-scopes.test.ts tests/integration/domain-units.test.ts
git commit -m "feat(store): add units presentations and publications"
```

### Task 8: Add integrity verification and finish the foundation gate

**Files:**
- Create: `cli/lib/store/verify.ts`
- Test: `tests/integration/domain-verify.test.ts`

**Interfaces:**
- Consumes: every Task 1-7 table and `resolveObjectPath()`
- Produces: synchronous dependency-free `verifyDomainStore(options?: { hashObjects?: boolean }): DomainVerificationReport`

- [ ] **Step 1: Lock the exact redacted report contract in a failing test**

```ts
type ForeignKeyViolation = {
  table: string;
  rowId: string;
  parent: string;
  foreignKeyIndex: number;
};
type RowIssue<R extends string> = {
  table: string;
  rowId: string;
  column: string;
  jsonPointer?: string;
  reason: R;
};
type ChainIssue<E extends string, R extends string> = {
  entityType: E;
  entityId: string;
  reason: R;
  relatedId?: string;
};
type RunObjectIssueReason = "invalid-locator" | "outside-root" | "symlink" |
  "not-regular" | "unreadable" | "size-mismatch" | "hash-mismatch" |
  "missing-hash-evidence" | "missing-forensic-file";
type AbsolutePathReason = "posix-absolute" | "drive-absolute" |
  "unc-absolute" | "file-url";
type RevisionChainEntity = "document" | "document-revision" | "artifact" |
  "artifact-revision" | "evaluation" | "run" | "run-attempt" | "run-result";
type RevisionChainReason = "missing-pointer" | "foreign-pointer" |
  "latest-not-greatest" | "parent-mismatch" | "revision-number-mismatch" | "scope-mismatch" |
  "missing-target" | "run-lifecycle-mismatch" | "run-result-mismatch";
type BuildChainEntity = "composition" | "composition-revision" |
  "composition-file" | "composition-input" | "build" | "build-output" |
  "build-binding";
type BuildChainReason = "missing-pointer" | "foreign-pointer" |
  "latest-not-greatest" | "selected-unsealed" | "parent-mismatch" | "revision-number-mismatch" | "scope-mismatch" |
  "unsealed-input" | "position-gap" | "missing-output" |
  "binding-mismatch" | "build-lifecycle-mismatch";
type UnitChainEntity = "unit" | "unit-revision" | "unit-item" |
  "presentation" | "caption-revision" | "publication" | "metric-snapshot";
type UnitChainReason = "missing-pointer" | "foreign-pointer" |
  "latest-not-greatest" | "selected-unsealed" | "parent-mismatch" | "revision-number-mismatch" | "scope-mismatch" |
  "unsealed-graph" | "position-gap" | "presentation-mismatch" |
  "publication-lifecycle-mismatch" | "claim-fence-mismatch" |
  "run-result-mismatch" | "metric-window-mismatch";
type ProvenanceEntity = "document-revision" | "artifact-revision" |
  "composition-revision" | "unit-revision" | "run" | "evaluation" |
  "consumer-principal" | "agent-session";
type ProvenanceReason = "missing-session" | "ended-session" |
  "workspace-mismatch" | "project-mismatch" |
  "invalid-consumer-principal" | "consumer-session-ownership-mismatch" |
  "consumer-session-auth-mismatch" | "external-provenance-mismatch";
type ObjectFileIssue = {
  objectId: string;
  reason: "invalid-locator" | "outside-root" | "symlink" | "not-regular" | "empty" | "size-mismatch" | "unreadable";
};
type FilesystemIssue = {
  relativePath: string;
  reason: "symlink" | "unreadable" | "unexpected-type";
};
type DomainVerificationReport = {
  integrity: "ok" | "failed";
  hashObjects: boolean;
  integrityCheck: string[];
  foreignKeyViolations: ForeignKeyViolation[];
  missingObjects: string[];
  objectFileIssues: ObjectFileIssue[];
  hashMismatches: string[];
  runObjectIssues: RowIssue<RunObjectIssueReason>[];
  absolutePathRows: RowIssue<AbsolutePathReason>[];
  dataUrlRows: RowIssue<"data-url">[];
  invalidJsonRows: RowIssue<"invalid-json">[];
  binaryPayloadRows: RowIssue<"binary-payload">[];
  brokenRevisionChains: ChainIssue<RevisionChainEntity, RevisionChainReason>[];
  brokenBuildChains: ChainIssue<BuildChainEntity, BuildChainReason>[];
  brokenUnitChains: ChainIssue<UnitChainEntity, UnitChainReason>[];
  sessionProvenanceIssues: ChainIssue<ProvenanceEntity, ProvenanceReason>[];
  unreferencedObjects: string[];
  orphanedObjectPaths: string[];
  filesystemIssues: FilesystemIssue[];
};
```

Routing is part of the external redacted contract: Document/Artifact/
Evaluation/general Run findings go only to `brokenRevisionChains`;
Composition/Build findings go only to `brokenBuildChains`; Unit/presentation/
Publication/Metric findings go only to `brokenUnitChains`; Session/consumer
authorship findings go only to `sessionProvenanceIssues`. Do not duplicate one
finding across families or add ad-hoc entity/reason strings. Schema evolution
must extend these literal unions and the contract test in the same change. The
consumer literals are reserved in this Task 8 contract and become queryable in
Task 9 when their tables/columns land; they may not be represented as a generic
`run` finding.

`hashObjects` defaults to false. `integrity` is `ok` only when
`integrityCheck` is exactly `["ok"]` and every other issue array is empty;
`hashObjects: false` records that durable Object content hashes were not
performed rather than pretending they passed; it never disables supplied
RunObject hash checks. Every report value is an ID, enum, bounded reason, or
store-relative POSIX path; never return an absolute path, source value, SQLite
message containing user content, or provider error.

Delete one fixture Object after inserting it and assert its ID appears in
`missingObjects`; inject each structured issue class with checks temporarily
disabled and restored in `finally`. Add exact routing assertions for every
entity family/reason union. With `hashObjects: false`, corrupt supplied
RunObject hash evidence and require `runObjectIssues`; remove an unpromoted
forensic file and require `missing-forensic-file` without making the row schema-
invalid. Put `/Users/example` inside a caption sentence and require no absolute-
locator finding, then use it as the entire eligible JSON string and require the
anchored finding.

- [ ] **Step 2: Implement deterministic verification queries**

Run `PRAGMA integrity_check`; expose only `["ok"]` or `["failed"]` and keep the
raw diagnostic internal so SQLite messages cannot leak. Map every
`foreign_key_check` row exactly.
Resolve every Object through the store resolver and distinguish missing rows from
invalid locator, escape, symlink, non-regular, empty, unreadable, and byte-count
facts. With `hashObjects: true`, stream SHA-256 and byte counting in chunks;
never buffer a media file. `hashObjects` controls hashing of durable Objects
only. A promoted RunObject ignores its historical locator and resolves through
`object_id`; for every unpromoted RunObject, supplied byte/hash evidence is
always checked regardless of `hashObjects`. An absent unpromoted forensic/
diagnostic RunObject is schema-valid because retention may remove its bytes,
but verification intentionally reports `missing-forensic-file` in
`runObjectIssues` (never `missingObjects`). A present unpromoted RunObject must
have a contained regular locator plus matching byte/hash evidence.

Drive text/JSON inspection from an exhaustive descriptor list of every
application table and eligible column; a schema test fails when a new eligible
column is not classified. Inspect JSON keys and string values recursively,
emit RFC 6901 `jsonPointer` values with `~0`/`~1` escaping, and detect POSIX,
drive, UNC, and `file:` absolute locators plus valid data URLs. Strict base64 is
an issue only below the locked binary-bearing keys. Every `reason` comes from a
closed per-array vocabulary; invalid JSON reports its row/column and stable
reason without parser input or exception text.

Absolute-locator detection is anchored to the entire eligible locator column
value or entire JSON string value. It may trim only schema-authorized outer
whitespace and must not flag an absolute-looking substring embedded in prose,
a caption, or a larger non-locator string.

Verify current/latest/selected pointers, parents, revision numbers, exact Workspace/Project scope,
every non-empty Unit's latest pointer equals its greatest canonical revision
while selected may be null or any sealed same-Unit revision,
sealed Composition/Build/output/binding chains, complete sealed Unit/item/presentation/
Publication submission/status-lookup/cancellation/reconciliation claim/
RunAttempt/Run-result/transition/timestamp/provider-ID and
Metric source/window chains, current Evaluation target Project ownership, and
active Session authorship across Documents, Artifacts, Compositions, Units, and
Runs. Task 8 does not invent Evaluation Session provenance before Task 9 adds
that schema. Ended Sessions author no later revision. Report unused Object rows and
walk only `buckets/**/objects/**` for orphan paths; ignore tmp, cache, backups,
exports, recovery, and staging trees. Record symlink/unreadable/unexpected
filesystem entries separately and never follow them.

Treat top-level `farm/` as an explicit reserved boundary: if present, `lstat`
only that root and require a real directory rather than a file or symlink, then
do not open, recurse, stat, hash, count, or classify any child. Legacy-looking
filenames, bucket-shaped paths, tmp/cache names, unreadable descendants, and
arbitrary byte volume under `farm/` cannot become Object, orphan, cache, or
filesystem findings. Add a poison fixture whose reserved tree contains all of
those shapes and assert verification touches no descendant while still
detecting an invalid namespace root itself.

Deduplicate exact findings and sort every string and composite field by UTF-8
byte order, not locale. Open a second read-only connection to the same WAL
database and prove it reads while the writer holds `BEGIN IMMEDIATE`; separately
prove a stale expected-head write raises `StoreConflictError`.

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

### Task 9: Publish bounded query, overview, and media-controller surfaces

**Files:**
- Modify: `cli/lib/store/schema.ts`
- Modify: `cli/lib/store/types.ts`
- Create: `cli/lib/store/pagination.ts`
- Modify: `cli/lib/store/activity.ts`
- Modify: `cli/lib/store/scopes.ts`
- Modify: `cli/lib/store/sessions.ts`
- Modify: `cli/lib/store/documents.ts`
- Modify: `cli/lib/store/objects.ts`
- Modify: `cli/lib/store/artifacts.ts`
- Modify: `cli/lib/store/runs.ts`
- Modify: `cli/lib/jobs/db.ts`
- Create: `cli/lib/store/consumers.ts`
- Modify: `cli/lib/store/compositions.ts`
- Modify: `cli/lib/store/units.ts`
- Create: `cli/lib/store/evaluations.ts`
- Create: `cli/lib/store/overviews.ts`
- Create: `cli/lib/store/media.ts`
- Modify: `cli/lib/store/verify.ts`
- Create: `npm/contracts/farm-identity-v1.golden.json`
- Modify: `npm/package.json`
- Test: `tests/integration/domain-query-surfaces.test.ts`
- Modify: `tests/integration/domain-db.test.ts`
- Modify: `tests/integration/domain-runs.test.ts`
- Modify: `tests/integration/domain-verify.test.ts`
- Modify: `tests/integration/jobs-db.test.ts`
- Modify: `tests/integration/jobs-worker-runs.test.ts`
- Create: `tests/integration/npm-package-contract.test.ts`

**Interfaces:**
- Consumes: all verified domain stores and the bounded `.ralphy/farm/identity.json` startup handshake
- Produces: every bounded list/detail/history/status API needed by thin CLI/bridge/Desktop consumers, bounded `getDocumentContent`, low-level internal `bindConsumerPrincipal(db, ...)`, authenticated consumer principals/Sessions, recoverable external-operation Runs/results, guarded generic queue retry, Workspace/Project overview DTOs, discriminated media cards, and atomic `reviewMedia`

- [ ] **Step 1: Replace unsafe public pagination before publishing it**

Define `Page<T, C = string> = { items: T[]; nextCursor: C | null }` in
`types.ts`. `pagination.ts` owns three non-interchangeable cursor codecs:
`c1.` plus unpadded base64url canonical JSON `[createdAt,id]`, `v1.` plus
`[revisionNo,id]`, and `p1.` plus `[position,id]`. Decode only a two-element
array whose ordinal/timestamp is a non-negative safe integer and whose ID is
bounded printable ASCII of 1..128 bytes, reject cursors over 256 bytes, and
require decode/re-encode to equal the original. Creation-ordered root lists use
`(created_at,id) > (?,?)`; Document/Artifact/Composition/Unit/caption revision
histories use `(revision_no,id) > (?,?)`; and ordered child lists, including
Composition inputs/files, Build outputs, Unit/presentation items, and
`run_results`, use `(position,id) > (?,?)`. Never reuse a creation cursor for a
semantic ordinal. Each query is ascending with `LIMIT limit + 1` and promises
stable-set traversal only, not snapshot isolation across pages.

Activity is the one global sequence. Keep `ActivityEventRow` and
`payload_json` internal; public `ActivityDto` is exactly `{ sequence,
workspaceId, projectId, entityType, entityId, action, createdAt }`, where
`sequence` is `activity_events.id` and no public field is named `id` or
`payload`. `listActivity({ afterSequence, limit })` uses an exclusive integer
sequence, returns `Page<ActivityDto, number>`, and
`latestActivitySequence()` returns zero for an empty store. Tighten the shared
activity writer so newly written payloads contain only bounded stable IDs,
safe enums, booleans, finite numbers, and counts; recursively reject raw
metadata/config/provider responses, errors, body text, paths/locators,
credentials, or secret-shaped keys before SQLite. Add a 101-event no-gap/no-
duplicate test plus a DB-level assertion that Task 9 writes no forbidden raw
payload. Limits are integer `1..100` unless an existing public method has a
smaller bound.

- [ ] **Step 2: Complete the explicit query surface**

Add public Workspace/Project show/update; paged social accounts;
Iteration/feedback/resolution-link/stage queries; Document revision and binding
queries; Object detail; Artifact revision/usage/relation queries;
Run/attempt/RunObject detail and lists; Composition/Build lists/detail;
Unit/Publication/Metric lists/detail; and `createEvaluation`, `getEvaluation`,
and paged `listEvaluations`. Commands and bridge handlers must not issue ad-hoc
SQL.

Move raw SQL shapes—including `ActivityEventRow`, `RunObjectRow`, `ObjectRow`,
and body-bearing `DocumentRevisionRow`—to `store/internal-types.ts`; only store,
verifier, and migration modules may import it. `store/types.ts` exports public
DTO/page/input types. Ordinary store exports return explicit DTO projections:
Activity omits `payload_json`; RunObject omits
`path`, `log_path`, `tag`, `error_message`, and any raw metadata/error;
Object omits `bucket`, `key`, `sha256`, `original_name`, and `metadata_json`;
Document and Document-revision DTOs omit `body`. Do not export a raw-row getter
or spread a SQL row into a DTO. A source-boundary test rejects any command,
controller, bridge, agent, or Desktop-facing module importing
`store/internal-types.ts`. Run/attempt failure detail is a bounded safe
code/status, never provider response/error text. The only content/locator
exceptions are the separately authorized bounded Document-content and trusted
Electron locator seams defined below and in the bridge plan.

Define `QueryContext = { sessionId: string } | { workspaceId: string;
projectId?: string }`. `getDocumentContent({ context, revisionId,
afterByte, limitBytes })` is the only consumer text-body read. It accepts a
non-negative safe-integer `afterByte` and integer `limitBytes` in `1..65_536`, authorizes `context` against the
exact immutable revision, and rejects an `afterByte` inside a UTF-8 continuation
sequence or beyond EOF (`afterByte === byteLength` returns an empty terminal
page). Compute the nominal end at `afterByte + limitBytes`; if that splits
one code point, extend through that code point by at most three bytes, so a
page is at most `limitBytes + 3` bytes and even `limitBytes: 1` always makes
progress. Return only `{ revisionId, format, text, nextByte }`, with `nextByte`
equal to the actual byte end or null at EOF. Callers page and concatenate; no
other Document DTO contains a locator, bucket/key, filesystem path, or body.

Project and Build binding detail is exactly `{ ownerType, ownerId, role,
documentId, boundRevisionId, currentHeadRevisionId, hasNewerHead }`.
`replaceProjectDocumentBinding` and `replaceBuildDocumentBinding` require
`expectedRevisionId`: null creates an empty role, while replacement requires
the exact currently bound revision; stale/missing expectations conflict.
`hasNewerHead` is computed from the current Document head's greater revision
number and never changes the binding implicitly.

Replace the unbounded children returned by `getRun`, `getComposition`, and
`getUnit`: each identity/detail getter returns only its safe identity and
latest/selected summary, while attempts, RunObjects, revisions, sources,
inputs, Builds, outputs, bindings, Unit items, presentations, Publications,
Metrics, and results use independent bounded getters/lists with the cursor
family matching their order. Delete or make internal the former aggregate
exports; any internal aggregate must accept explicit per-child limits and is
never exported to CLI/bridge/Desktop.

Correct pre-release `evaluations`: require `workspace_id`, allow nullable
`project_id`, add non-null `authored_by_session_id` referencing
`agent_sessions`, and require exactly one of the existing target columns
`artifact_revision_id | composition_revision_id | build_id | run_id`. Derive
and validate target Workspace/nullable Project, require active exact-scope
Session authorship for normal writes, and enforce target XOR, derived scope,
author scope/activity, plus update/delete/same-ID `INSERT OR REPLACE` guards in
SQLite with `recursive_triggers=OFF`. Evaluation rows and their target/report
facts are append-only. Workspace Evaluations use nullable `project_id` and may
target only a Workspace-owned Artifact revision or Workspace-only Run;
Project-owned targets require their exact derived Project.
Public `EvaluationDto` is an explicit projection of stable scope/target IDs,
verdict, favorite, nullable rating, bounded tags/note, author Session ID, and
created time; raw report/metadata/provider payload remains internal.

Now that Evaluation Session provenance exists, extend `verifyDomainStore` and
`domain-verify.test.ts` using the exact Task 8 closed provenance vocabulary.
Evaluation target/project ownership stays routed to
`brokenRevisionChains`, while missing/ended/cross-scope Evaluation authorship
is routed only to `sessionProvenanceIssues` using the Task 8 closed entity/
reason vocabularies. This is deliberately introduced here, not retroactively
required by Task 8.

Define and share this exact identity contract:

```ts
export type FarmIdentityV1 = {
  version: 1;
  namespace: "farm";
  storeId: string;
  consumerId: string;
  migrationId: string;
  stageDigest: string;
  credentialDigest: string;
};
```

Its canonical file is UTF-8 JSON with keys in that exact order, no
insignificant whitespace, and no trailing newline. `storeId`, `consumerId`,
and `migrationId` are 1..128 ASCII bytes matching
`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`; both digests are lowercase 64-hex.
Farm's token file is exactly 43 ASCII bytes: the unpadded canonical base64url
encoding of 32 random bytes, with no newline. `credentialDigest` is lowercase
SHA-256 hex over those 32 decoded bytes, not over the encoded text;
`consumerId` is created once during Farm staging and cannot change during
ready/freeze/install/recovery. Core rejects extra/missing fields,
non-canonical bytes, changed bound facts, or invalid IDs/digests. The public
`identityDigest` is SHA-256 of the canonical identity-file bytes.

The repository root `package.json` is private and is not the published
package. Before the core release, publish the fixed language-neutral
`npm/contracts/farm-identity-v1.golden.json` through the actual
`@alecs5am/ralphy/contracts/farm-identity-v1.golden.json` npm subpath export.
Add `contracts/` to `npm/package.json#files` and the exact subpath to
`npm/package.json#exports` without changing the binary entry point:

```json
{
  "files": ["bin/", "scripts/", "README.md", "contracts/"],
  "exports": {
    "./contracts/farm-identity-v1.golden.json": "./contracts/farm-identity-v1.golden.json",
    "./package.json": "./package.json"
  }
}
```

The checked-in vector
contains literal fields `{ version: 1, tokenHex, identity, credentialDigest,
identityDigest }`; `identity` is the exact canonical JSON string, not an object
to be reserialized by the fixture loader. Lock these literals:

```text
tokenHex = 000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
identity = {"version":1,"namespace":"farm","storeId":"store_golden_v1","consumerId":"consumer_golden_v1","migrationId":"migration_golden_v1","stageDigest":"1111111111111111111111111111111111111111111111111111111111111111","credentialDigest":"630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd"} <!-- gitleaks:allow fixed public test vector -->
credentialDigest = 630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd <!-- gitleaks:allow fixed public test vector -->
identityDigest = d19f851bbd34bd9219e8bf8ebe43a629ddd7b5f881356ae40934e9a272853232
```

The golden is only a serializer/parser and digest contract test. Runtime
registration/readiness never compares a migration's random token, consumer ID,
migration ID, or identity bytes to these static sample values. The package
test runs `bun pm pack` in `npm/` into a disposable directory, inspects the tar
with `tar -tf`, requires `package/contracts/farm-identity-v1.golden.json`,
extracts and byte-compares it to the source vector, and resolves that exact
subpath from an installation of the packed tarball.

Add `consumer_principals(id, namespace UNIQUE, identity_digest, created_at,
disabled_at)` and nullable `consumer_principal_id` to `agent_sessions`. A
consumer Session is otherwise the same immutable scoped Session used by all
existing revision provenance: it has one Workspace, optional exact Project,
fixed `agent = "consumer:<namespace>"`, and may author only while active. The
normal `startAgentSession` API can never set `consumer_principal_id`.
Task 9 exposes only the low-level internal insertion primitive
`bindConsumerPrincipal(db, { id, namespace, identityDigest })`. It knows
nothing about migration inventory, phase, readiness files, or Farm paths; it
inserts once and permits only byte-identical ID/namespace/digest replay. No
bridge method or ordinary store caller exposes it. The later full-library
`freezeMigration` owns Farm-candidate eligibility and is the sole production
caller after migration schema exists; a no-Farm migration never calls it.

`authenticateConsumer(namespace, tokenBase64url)` is internal to the bridge
and accepts only the bounded startup identity for that namespace. Starting
from the already resolved data root, `readFarmIdentity` must `lstat` the
`farm` parent as a real directory, reject a symlink/non-owner parent or a
realpath outside the data root, snapshot its device/inode, then open
`identity.json` with `O_RDONLY | O_NOFOLLOW`. Before reading, `fstat` must
require a regular owner-owned mode-0600 file of `1..4096` bytes; read no more
than the snapshotted size, then re-`fstat` and re-`lstat`/realpath the parent and
require unchanged device/inode/owner/mode/size. This protects both a leaf
symlink and parent-symlink replacement. Parse only the exact canonical
`FarmIdentityV1` and bounded IDs above; require its canonical digest and
consumer/namespace/store facts to equal the installed bound principal and live
store, and require `disabled_at IS NULL`, before accepting a token. The JSON wire token is the exact
unpadded base64url string; reject a non-canonical alphabet/padding/length,
decode to exactly 32 bytes, hash those decoded bytes, compare 32-byte digest
buffers with `timingSafeEqual`, and zero temporary token buffers. Core never
opens `farm/auth.token` or any other consumer child and never compares runtime
facts with the golden vector. `startConsumerSession` requires that
connection-authenticated principal, derives the fixed agent label, and reuses
the existing Session scope checks.

Extend Runs with nullable `external_system`, `external_run_id`,
`external_node_id`, `external_attempt`, `external_operation`, and
`idempotency_key`, plus nullable `request_digest` and
`consumer_principal_id`. The six external fields, request digest, and principal
are all null for an ordinary Run or all non-null for a consumer Run; enforce
that invariant and immutability in both CHECKs/triggers and store code.
`external_attempt` is a positive safe integer and `request_digest` is lowercase
64-hex SHA-256 of canonical UTF-8 JSON for the validated semantic operation
request, excluding Session ID, external tuple/key, and transport envelope. The
canonicalizer recursively sorts object keys by UTF-8 byte order, preserves
array order, serializes with `JSON.stringify` and no whitespace, normalizes
`-0` to `0`, and rejects undefined, holes, bigint, cycles, non-finite numbers,
non-plain objects, and invalid Unicode. The controller computes it after
normalization; the store never trusts a caller-supplied digest.
Add partial unique indexes over
`(external_system, external_run_id, external_node_id, external_attempt,
external_operation)` and `(external_system, idempotency_key)`. Only a live
consumer Session may start such a Run, and `external_system` is derived from
its authenticated principal rather than trusted from input. Persist the
originating `agent_session_id` for audit, but authorize replay by the immutable
`consumer_principal_id`: a newly authenticated reconnect Session for the same
principal and scope may recover the Run, while another principal or an ordinary
Session rejects. Conversely, `startRun` rejects a consumer-owned Session when
external provenance is absent, so consumer Sessions cannot mint ordinary Runs;
a persistent Run insert/update trigger enforces both that rule and equality
between an external Run principal and its originating Session principal.
Reusing a key with the exact tuple, principal, scope, Run kind, and request
digest returns the original Run; any mismatch is `E_CONFLICT`.

Publish these transaction-aware primitives without opening nested
transactions:

```ts
type StartConsumerOperationRunInput = {
  sessionId: string;
  workspaceId: string;
  projectId?: string;
  kind: string;
  label?: string;
  external: {
    runId: string;
    nodeId: string;
    attempt: number;
    operation: string;
    idempotencyKey: string;
  };
};
type RunDto = {
  id: string;
  workspaceId: string | null;
  projectId: string | null;
  agentSessionId: string | null;
  kind: string;
  label: string | null;
  state: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
};
type ConsumerOperationStart = { run: RunDto; replayed: boolean };

startConsumerOperationRunInTransaction(
  db: Database,
  input: StartConsumerOperationRunInput & { requestDigest: string },
): ConsumerOperationStart;
startConsumerOperationRun(
  input: StartConsumerOperationRunInput & { requestDigest: string },
): ConsumerOperationStart;
insertJobInTransaction(db: Database, input: JobInsertInput): JobRow;
```

The non-transaction variants wrap one immediate transaction. Controllers use
one caller-owned immediate transaction and first call
`startConsumerOperationRunInTransaction`. If it returns `replayed`, they read
the original result refs and create nothing. Otherwise they insert/link the
initial domain row and call `insertJobInTransaction`; any Run-result link needed
at acceptance is inserted before a terminal Run update. Existing `insertJob`
delegates to the same primitive. Fault injection after each insert must leave
either all three rows committed or none; replay observes the committed Run/
domain row/Job and never enqueues a duplicate.

Guard the existing generic queue retry APIs at the same boundary. Before any
update, `retryJob(id)` joins the Job's linked Run and rejects when
`runs.external_system IS NOT NULL`. `retryJobsByFilter(filter)` resolves and
checks the complete target set first; if any matched Job is linked to an
external Run, it rejects the whole bulk request and changes zero rows. A
consumer retry must go through its operation controller and create a new
external Run with an incremented `external_attempt`, a new tuple, and a new
idempotency key. Generic queue retry can never reuse or mutate a consumer Run.

Use the foundational immutable `run_results` and internal `recordRunResult`
from Task 7; do not recreate or alter its lifecycle here. Produce
`startConsumerOperationRun`, `findConsumerOperation` (tuple or idempotency-key
discriminated input), and `listRunResults({ context, runId, after, limit })`.
`RunResultDto` is exactly `{ id, runId, position, entityType, entityId,
createdAt }`. Result pages use the `p1.[position,id]` cursor and limit `1..100`.
An ordinary Run permits the normal scoped read context; an external Run
requires an active consumer Session whose authenticated principal and scope
match that Run, so direct scope or an ordinary Session cannot bypass replay
isolation by guessing `runId`.
`findConsumerOperation` requires an active consumer Session on the current
authenticated connection, compares its principal and scope rather than the
historical Session ID, and returns `{ run, results: Page<RunResultDto>,
replayed: true }`; it accepts `resultsAfter`/`resultsLimit`, and subsequent
pages use the same principal-restricted result API. Extend the existing result-
entity validator only for entity types first introduced in Task 9. An ordinary
or foreign principal cannot query a consumer tuple. Distinct Publication
submission/lookup/reconciliation/provider-cancel Runs therefore retain
distinct result pages; local draft cancel has no external Run and is not
findable through this seam. Entity Task 7A operations and Task 8 consumer Agent
turns both use this same replay seam.

Add nullable `run_objects.mime` with a CHECK that a present value is 3..255
printable ASCII bytes matching `^[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+$`
and make it immutable; legacy/unknown RunObjects keep
null. Extend `verifyDomainStore` in this same task for every schema addition:
Evaluation target/XOR/derived scope and `authored_by_session_id`; consumer
principal namespace/identity-digest shape plus Session ownership; Run external all-or-none fields, digest format,
principal/system/scope agreement, and the ban on ordinary Runs authored by a
consumer Session; plus RunObject MIME validity. Task 9 extends the closed
verifier implementation with the already reserved `"consumer-principal"` and
`"agent-session"` entities and `"invalid-consumer-principal"`,
`"consumer-session-ownership-mismatch"`, `"consumer-session-auth-mismatch"`,
and `"external-provenance-mismatch"` reasons; it adds `"invalid-mime"` only to
`RunObjectIssueReason`. Extend the exhaustive verifier descriptor registry with
`consumer_principals.(id, namespace, identity_digest, created_at, disabled_at)`
and `agent_sessions.(id, agent, consumer_principal_id, workspace_id,
project_id, ended_at)`. A standalone malformed principal reports as
`consumer-principal`; a consumer Session with a missing/disabled/wrong owner or
non-derived `consumer:<namespace>` auth label reports as `agent-session`, even
when no Run references either row. Consumer and external Run authorship
findings go only to `sessionProvenanceIssues`, while
Evaluation target ownership remains in `brokenRevisionChains`. Add matching
corruption fixtures for each principal and Session reason plus external Run
linkage to `domain-verify.test.ts`; the descriptor-coverage test must fail if a
Task 9 table/column is omitted. No Task 9 table/column lands without an explicit
verifier assertion.

- [ ] **Step 3: Add typed overview and media controllers**

Overview has no implicit sections. Lock these request shapes, with every page
limit in `1..50` and creation cursor `c1` unless shown otherwise:

```ts
type OverviewPageRequest<C = string> = { after?: C | null; limit: number };
type WorkspaceOverviewRequest = {
  context: QueryContext;
  workspaceId: string;
  sections: {
    documents?: OverviewPageRequest;
    units?: OverviewPageRequest;
    accounts?: OverviewPageRequest;
    projects?: OverviewPageRequest;
    activity?: { afterSequence: number; limit: number };
  };
};
type ProjectOverviewRequest = {
  context: QueryContext;
  projectId: string;
  sections: {
    documents?: OverviewPageRequest;
    iterations?: OverviewPageRequest;
    feedback?: OverviewPageRequest;
    stages?: OverviewPageRequest;
    compositions?: OverviewPageRequest;
    builds?: OverviewPageRequest;
    units?: OverviewPageRequest;
    runs?: OverviewPageRequest;
    activity?: { afterSequence: number; limit: number };
    mediaCounts?: true;
  };
};
```

The response always contains exactly one root summary and only requested
sections. Root summaries are `WorkspaceSummaryDto { id, slug, name,
rowVersion, createdAt, updatedAt }` and `ProjectSummaryDto { id, workspaceId,
slug, name, state, rowVersion, createdAt, updatedAt }`. Section DTO
allowlists are: Document `{ id, workspaceId, projectId, slug, title, kind,
currentRevisionId, rowVersion, createdAt, updatedAt }`; Project Document adds
`binding: DocumentBindingDto | null`; Unit `{ id, workspaceId, projectId, slug,
format, latestRevisionId, selectedRevisionId, createdAt, updatedAt }`; account
`{ id, workspaceId, platform, externalId, displayName, username, createdAt,
updatedAt }`; Iteration `{ id, projectId, number, title, state, createdAt,
closedAt }`; feedback `{ id, projectId, iterationId, status, targetType,
targetId, createdAt, resolvedAt }`; stage `{ id, projectId, stage, state,
entityType, entityId, rowVersion, updatedAt }`; Composition `{ id, projectId, slug, kind,
latestRevisionId, selectedRevisionId, createdAt, updatedAt }`; Build `{ id,
compositionRevisionId, runId, state, createdAt, finishedAt }`; Run `{ id,
workspaceId, projectId, kind, label, state, createdAt, startedAt, endedAt }`; and
the safe `ActivityDto`. `mediaCounts` is exactly `{ artifacts, objects,
runObjects }`. Before the entity/credential task adds `credential_ref`,
`relink_required`, and account `row_version`, account DTOs explicitly omit
those fields, `credentialConfigured`, and credential source; that later task
adds status from the real columns rather than guessing it here.

Every query, overview, media, and activity projection is SQL-backed and may
resolve only the exact core Object/RunObject selected by an explicit controller
call. None performs discovery or fallback traversal under reserved `farm/`.
Extend the query-surface test with a poison Farm tree and an access trap; all
DTOs, counts, cursors, and activity sequences must remain identical and the trap
must record zero descendant access.

Overview DTOs are constructed from those projections, never row spreads. They
never include metadata/config/payload, raw report/error text, credential refs,
bucket/key/original name/hash, body, or any path/locator. Each section is one
independent bounded page with its own returned cursor; implementations may run
the requested queries in one read snapshot but may not construct an unbounded
cross-section aggregate.

Every media method uses `MediaRef = { type: "artifact" | "run-object" |
"object"; id: string }`; no bare ID is polymorphic. `getMediaCards({ context,
refs })` accepts `1..100` distinct mixed refs, authorizes every ref first, and
returns cards in exactly the caller's mixed order or rejects the whole request
without revealing which ref failed. `listMedia({ context, types?, after,
limit })` uses `c1`, orders `(created_at,id)` ascending, and returns the same
union. A Workspace context sees only Workspace-owned/shared rows; a Project
context sees that Project's rows plus Workspace-shared rows in its Workspace,
never sibling Project rows. Session context derives the same visibility.

The no-locator union is exact: Artifact cards expose `ref`, scope IDs, slug,
kind, selected revision ID/state/MIME/bytes/timestamp, and revision count;
RunObject cards expose `ref`, scope IDs, Run ID, purpose/state/retention,
nullable MIME, bytes/timestamp, and optional promoted Object ID; Object cards
expose `ref`, scope IDs, storage class/MIME/bytes/timestamp/reference count.
Object storage class remains `durable | working | diagnostic`; cache/temp are
RunObject location/retention concepts. Only an Artifact ref is selectable or
reviewable.

`referenceCount` is the sum of non-null direct FK rows from
`artifact_revisions.object_id`, `composition_revision_files.object_id`,
`run_objects.object_id`, `job_artifacts.object_id`, and
`storage_transfer_entries.object_id`. Keep that exhaustive list in one
internal `OBJECT_REFERENCE_SOURCES` registry; a schema-introspection test using
`PRAGMA foreign_key_list` fails if any current FK to `objects(id)` is absent or
any listed source no longer exists. Later migration schema must extend the
registry for its Object FK before landing.

`reviewMedia` accepts an Artifact ref with a non-null selected revision, exact
non-null `expectedSelectedRevisionId`, active author Session, and verdict
`shortlist | approved | rejected | needs-work`. In one immediate transaction it
creates a new immutable state revision from the selected revision (`candidate
| approved | rejected | candidate` respectively), advances selection, inserts
one immutable Evaluation targeting that new revision, optionally inserts
Project feedback, and appends redacted activity. Project feedback is permitted
only for a Project-owned Artifact when an exact active same-Project
`iterationId` and non-empty feedback text are supplied; `needs-work` on a
Project requires them. A Workspace Artifact creates only the state revision
and Workspace Evaluation: `iterationId`/feedback are forbidden, and
`needs-work` remains an Evaluation verdict with candidate state. Any stale
selection, invalid Session/scope/Iteration, Evaluation, feedback, or activity
failure rolls back every row; unselected Artifacts must be selected first.

- [ ] **Step 4: Verify and commit the consumer boundary**

Test all three cursor codecs/cross-family rejection, ordinal pagination with
equal timestamps, malformed/size/limit boundaries, stable-set insertion
behavior, every list/detail/history/status method, both Workspace and Project
visibility, split bounded child/result pages, exact optimistic binding detail,
Workspace/Project Evaluation XOR/derived-scope/author/append-only guards,
store-wide public `sequence` naming, and write-time rejection of raw activity
payload. Exercise every overview section independently and together, require
only requested sections/cursors and the exact DTO key allowlists, and prove no
aggregate can return an unbounded child collection.

Test mixed ordered `MediaRef` batches, duplicate/invisible/cross-sibling atomic
rejection, Workspace-shared visibility, nullable RunObject MIME, exact media
union shapes, and exhaustive Object reference counts for every registered FK
plus the schema-introspection drift failure. Cover non-Artifact review
rejection; Project needs-work with exact Iteration and atomic feedback;
Workspace review with no feedback; and stale/failed review rollback.
Recursively assert every ordinary DTO contains zero Activity payload,
RunObject path/metadata/error, Object bucket/key/hash/original-name/metadata,
Document body, path/locator, raw error, or secret fields.

Also test wrong/missing/non-canonical Farm token rejection without reflection,
bounded identity IDs, leaf and parent symlinks, wrong owner/mode, oversized or
raced identity reads, decoded-byte hashing, and exact 32-byte
`timingSafeEqual`; poison every other consumer child. Test ordinary callers
being unable to mint consumer Sessions, immutable consumer Session scope,
consumer Sessions being unable to start ordinary Runs, direct-SQL
principal/session/external-all-or-none/request-digest guards, and tuple/key
lookup isolation. Simulate the crash window for six fixture Runs named
`generation`, `build`, `unit-revision`, `publication`, `metric-refresh`, and
`agent-turn`:
create the Run and ordered results, omit the consumer journal append,
reconnect/authenticate as the same principal with a new Session, query by both
the tuple and key, page every result using the position cursor, and require the
same Run/result IDs with no second row or Metric snapshot. A foreign principal,
ordinary Session, changed scope/kind/request digest, or tuple/key disagreement
must conflict. Inject failure after initial domain row, Run, and Job insertion
to prove the new in-transaction primitives commit all-or-none.
For linked external `generation`, `build`, `publication`, and `metric-refresh`
Jobs, prove both single and bulk generic retry reject before mutation (including
a mixed bulk set), while the corresponding consumer controller succeeds only
with the next external attempt, tuple, and idempotency key. Test bounded
Document content paging with explicit Session/direct scope, a continuation-
byte start rejection, and a one-byte limit that extends by at most three bytes;
prove no other query or DTO exposes a locator or body. Require core's serializer
and parser to consume its checked-in golden bytes, reproduce both fixed digests,
and reject reordered keys, extra whitespace, a trailing newline, or any changed
sample fact. Separately test runtime authentication with newly generated
identity/base64url-token facts and a matching low-level bound principal digest,
without comparison to the golden's sample values; the full migration suite
owns inventory eligibility and ready-record-to-stage agreement. Pack the real
`npm/` package and verify the exported golden tar entry/subpath as specified.

```bash
bun test tests/integration/domain-query-surfaces.test.ts tests/integration/domain-*.test.ts tests/integration/jobs-db.test.ts tests/integration/jobs-worker-runs.test.ts tests/integration/npm-package-contract.test.ts
git add cli/lib/store/schema.ts cli/lib/store/types.ts cli/lib/store/internal-types.ts cli/lib/store/pagination.ts cli/lib/store/activity.ts cli/lib/store/scopes.ts cli/lib/store/sessions.ts cli/lib/store/documents.ts cli/lib/store/objects.ts cli/lib/store/artifacts.ts cli/lib/store/runs.ts cli/lib/jobs/db.ts cli/lib/store/consumers.ts cli/lib/store/compositions.ts cli/lib/store/units.ts cli/lib/store/evaluations.ts cli/lib/store/overviews.ts cli/lib/store/media.ts cli/lib/store/verify.ts npm/contracts/farm-identity-v1.golden.json npm/package.json tests/integration/domain-query-surfaces.test.ts tests/integration/domain-db.test.ts tests/integration/domain-runs.test.ts tests/integration/domain-verify.test.ts tests/integration/jobs-db.test.ts tests/integration/jobs-worker-runs.test.ts tests/integration/npm-package-contract.test.ts docs/superpowers/plans/2026-08-02-core-domain-store-implementation.md
gitleaks protect --staged --redact
git commit -m "feat(store): add bounded domain query surfaces"
```
