# Core Domain Store Implementation Plan

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
- Every consumer-started operation has one indexed external tuple and one idempotency key on its Run, so a crash between core success and consumer journaling can recover the original Run and result IDs.
- Object rows contain relative bucket keys only; reject absolute paths, `..` segments, binary payloads, and data URLs at the store boundary.
- Never insert a row that references bytes until the bytes have been validated, hashed, and atomically placed in their final bucket key.
- Never hold a SQLite transaction open during a provider call, render, hash, file copy, or media probe.
- Working, rejected, and superseded Objects remain durable and discoverable while a project is active.
- `.ralphy/farm/` is a reserved consumer-owned namespace, not core domain state. Startup may validate only its bounded `identity.json` handshake; no core store, verifier, query, overview, media controller, or garbage collector reads or classifies other children.
- Keep files and commit messages English-only and use Bun for every check.

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
- Create: `cli/lib/store/units.ts`
- Modify: `tests/integration/domain-db.test.ts`
- Test: `tests/integration/domain-units.test.ts`

**Interfaces:**
- Consumes: Artifact revisions, Build outputs, Workspace social accounts, Runs, and activity
- Produces: `createUnit`, atomic-graph `reviseUnit`, `selectUnitRevision`, `recordPublication`, fenced `claimPublication`/`finishPublicationClaim`, `requestPublicationReconciliation`/`claimPublicationReconciliation`, foundational immutable `recordRunResult`, `appendMetricSnapshot`, `listMetricSnapshots`, cumulative `getMetricTotals`, and aggregate `getUnit`

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
Validate scope, parent, Session, and Project Iteration. Platform is a non-empty
kebab slug; reject new `reels`/`shorts` IDs because migration maps them to
`instagram`/`youtube`.

The required base item may target either an Artifact revision or a Document
revision, so text-only post/thread/article Units with no media remain valid.
Repeated Artifact/Document revisions are allowed at different base positions
(including 40-item packs); uniqueness applies to item IDs/positions, not target
revision IDs.

Add foundational immutable `run_results(run_id, position, entity_type,
entity_id, created_at)` with unique `(run_id, position)` and `(run_id,
entity_type, entity_id)`. Internal `recordRunResult` stores only stable result
IDs, validates their exact scope, and rejects update/delete/same-ID/logical-key
`INSERT OR REPLACE` even with `recursive_triggers=OFF`. Task 7 uses it inside
ordinary Run transactions; Task 9 adds bounded consumer queries and external-
tuple replay rather than introducing this table later.

Publications are append-only attempts with one required dedicated submission
Run, pending for every normal new attempt, and immutable rail
`postiz | github-pages | devto | hashnode | manual`, nullable
`revised_from_publication_id`, provider identifiers, state, URL, validated
schedule/submission/publish timestamps, error/failure stage, and a required
globally unique idempotency key. Each attempt binds the exact sealed
Presentation, its effective caption revision, and canonical effective platform
options; later Unit selection/caption revisions cannot change what was sent.
Target is the Presentation platform; do not duplicate it in another column.

`postiz`, `devto`, and `hashnode` require a same-Workspace social account whose
canonical platform matches, except a terminal historical/preflight `failed`
attempt with `failure_stage = "account-resolution"`, no claim, and no provider
ID. `github-pages` and `manual` accept no social account and use rail-specific
validation. A Medium export is a RunObject plus approval artifact, not a
Publication or published URL; a later confirmed manual post may create a
`manual` attempt. `revised_from_publication_id` must resolve to an older
same-Workspace attempt and is immutable.

`recordPublication` normally inserts `draft` against that pending Run. Its only
terminal-at-insert form is a validated account-resolution/preflight failure:
state `failed`, no claim/provider ID, matching failure stage, and the dedicated
Run atomically terminalized failed with the Publication result and Activity.
This preserves historical/pre-binding failures without pretending a provider
call happened or adding an illegal `draft -> failed` transition.

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
The locked operational claim fields include `claim_kind = submission |
reconciliation` and `active_claim_run_id`: submission must point to the required
submission Run and reconciliation to its distinct Run. They clear only during
the same terminalizing/invalidation transaction; immutable Run results and
Activity retain completed claim history.

The locked transition graph is:

```text
draft -> submitting | cancelled
submitting -> scheduled | submitted | published | failed | reconciliation_required | unknown
scheduled -> published | failed | cancelled | reconciliation_required | unknown
submitted -> published | failed | reconciliation_required | unknown
unknown -> reconciliation_required
reconciliation_required -> scheduled | submitted | published | failed | unknown
published | failed | cancelled -> terminal
```

Postiz immediate acceptance is `submitted`; scheduled acceptance is
`scheduled`. A crash/timeout after provider dispatch but before a durable
response becomes `reconciliation_required` when a provider lookup is possible,
otherwise `unknown`; replay returns that existing attempt and never POSTs it
again. An expired `submitting` claim can only be closed through
`requestPublicationReconciliation`: in one transaction it terminalizes the
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
and is bounded. Cumulative totals never sum time-series history. Without a
source filter, choose the single newest `as_of` snapshot per Publication across
all sources, then sum those rows across Publications. With an explicit source,
choose the newest snapshot per Publication within that source. A source switch
(for example Postiz to YouTube) therefore cannot double-count one Publication.
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
and raw-SQL cross-Unit/unsealed pointer plus update/delete/same-ID/same-logical-
key REPLACE immutability all reject. Direct SQL cannot seal a missing,
non-contiguous, duplicate-presentation-ref, or cross-revision graph. Preserve
multiple caption revisions and the `humanized`/`auto-draft-archived` states,
and prove a sealed effective caption cannot be changed.

For Publications, test exclusive claim, competing workers, stale fence after
lease/reconciliation, the complete transition table, timestamp/provider-ID
one-way locks, Postiz submitted/scheduled behavior, idempotent replay,
crash-after-POST becoming `reconciliation_required`/`unknown` without a second
POST, expired submission claim invalidation, fresh fenced reconciliation with a
separate Run and no submit call, no running RunAttempt on any uncertain path,
partial-target attempts with distinct Runs, failed then separate successful attempt,
all supported rails, nullable-account historical/preflight failures,
same-Workspace `revised_from_publication_id`, a Medium approval export that
creates no Publication, an idempotent skip recorded only as Activity, and
atomic Publication + Run result + Run state + activity rollback on an injected
failure. For Metrics, test source/as-of/window filtering, immutable rows,
unknown `NULL` versus measured zero, newest-per-Publication totals across all
sources by default, newest-per-Publication-within-source totals when filtered,
a source switch that does not double-count, and rejection of fractional/
negative/non-finite normalized counters while preserving provider values in
raw JSON. Task 9 covers external Metric-refresh replay returning the same
snapshot IDs.

Run: `bun test tests/integration/domain-units.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit delivery state**

```bash
git add cli/lib/store/schema.ts cli/lib/store/types.ts cli/lib/store/runs.ts cli/lib/store/units.ts tests/integration/domain-db.test.ts tests/integration/domain-units.test.ts
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
type RowIssue = {
  table: string;
  rowId: string;
  column: string;
  jsonPointer?: string;
  reason: string;
};
type ChainIssue = {
  entityType: string;
  entityId: string;
  reason: string;
  relatedId?: string;
};
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
  runObjectIssues: RowIssue[];
  absolutePathRows: RowIssue[];
  dataUrlRows: RowIssue[];
  invalidJsonRows: RowIssue[];
  binaryPayloadRows: RowIssue[];
  brokenRevisionChains: ChainIssue[];
  brokenBuildChains: ChainIssue[];
  brokenUnitChains: ChainIssue[];
  sessionProvenanceIssues: ChainIssue[];
  unreferencedObjects: string[];
  orphanedObjectPaths: string[];
  filesystemIssues: FilesystemIssue[];
};
```

`hashObjects` defaults to false. `integrity` is `ok` only when
`integrityCheck` is exactly `["ok"]` and every other issue array is empty;
`hashObjects: false` records that content hashes were not performed rather than
pretending they passed. Every report value is an ID, enum, bounded reason, or
store-relative POSIX path; never return an absolute path, source value, SQLite
message containing user content, or provider error.

Delete one fixture Object after inserting it and assert its ID appears in
`missingObjects`; inject each structured issue class with checks temporarily
disabled and restored in `finally`.

- [ ] **Step 2: Implement deterministic verification queries**

Run `PRAGMA integrity_check`; expose only `["ok"]` or `["failed"]` and keep the
raw diagnostic internal so SQLite messages cannot leak. Map every
`foreign_key_check` row exactly.
Resolve every Object through the store resolver and distinguish missing rows from
invalid locator, escape, symlink, non-regular, empty, unreadable, and byte-count
facts. With `hashObjects: true`, stream SHA-256 and byte counting in chunks;
never buffer a media file. A promoted RunObject ignores its historical locator
and resolves through `object_id`; an unpromoted RunObject must have a contained
regular locator plus byte/hash evidence matching the row.

Drive text/JSON inspection from an exhaustive descriptor list of every
application table and eligible column; a schema test fails when a new eligible
column is not classified. Inspect JSON keys and string values recursively,
emit RFC 6901 `jsonPointer` values with `~0`/`~1` escaping, and detect POSIX,
drive, UNC, and `file:` absolute locators plus valid data URLs. Strict base64 is
an issue only below the locked binary-bearing keys. Every `reason` comes from a
closed per-array vocabulary; invalid JSON reports its row/column and stable
reason without parser input or exception text.

Verify current/latest/selected pointers, parents, revision numbers, exact Workspace/Project scope,
sealed Composition/Build/output/binding chains, complete sealed Unit/item/presentation/
Publication claim/RunAttempt/Run-result/transition/timestamp/provider-ID and
Metric source/window chains, Evaluation target ownership, and active Session
authorship across Documents, Artifacts, Compositions, Units, Evaluations, and
Runs. Ended Sessions author no later revision. Report unused Object rows and
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
- Create: `cli/lib/store/consumers.ts`
- Modify: `cli/lib/store/compositions.ts`
- Modify: `cli/lib/store/units.ts`
- Create: `cli/lib/store/evaluations.ts`
- Create: `cli/lib/store/overviews.ts`
- Create: `cli/lib/store/media.ts`
- Test: `tests/integration/domain-query-surfaces.test.ts`

**Interfaces:**
- Consumes: all verified domain stores and the bounded `.ralphy/farm/identity.json` startup handshake
- Produces: every bounded list/detail/history/status API needed by thin CLI/bridge/Desktop consumers, authenticated consumer principals/Sessions, recoverable external-operation Runs/results, Workspace/Project overview DTOs, discriminated media cards, and atomic `reviewMedia`

- [ ] **Step 1: Replace unsafe public pagination before publishing it**

Define `Page<T, C = string> = { items: T[]; nextCursor: C | null }` in
`types.ts`. `pagination.ts` owns creation cursors: literal prefix `c1.` plus
unpadded base64url of canonical JSON `[createdAt,id]`. Decode only a two-element
array whose timestamp is a non-negative safe integer and whose ID is bounded
printable ASCII of 1..128 bytes, reject cursors over 256 bytes, and require decode/re-encode to
equal the original. Queries use `(created_at, id) > (?, ?)` ascending with
`LIMIT limit + 1`; this promises stable-set traversal only, not snapshot
isolation across pages.

Activity is the one global sequence: `listActivity({ afterSequence, limit })`
uses exclusive integer `activity_events.id`, returns `Page<ActivityEventRow,
number>`, and `latestActivitySequence()` returns zero for an empty store. Add a
101-event no-gap/no-duplicate test. Limits are integer `1..100` unless an
existing public method has a smaller bound.

- [ ] **Step 2: Complete the explicit query surface**

Add public Workspace/Project show/update; paged social accounts; Iteration/feedback/resolution-link/stage queries; Document revision and binding queries with optimistic binding replacement; `getObject(id)`; Artifact revision/usage/relation queries; Run/attempt/RunObject detail and lists; Composition/Build lists/detail; Unit/Publication/Metric lists/detail; and `createEvaluation`, `getEvaluation`, and paged `listEvaluations`. Commands and bridge handlers must not issue ad-hoc SQL.

Replace the unbounded children returned by `getRun`, `getComposition`, and
`getUnit`: each identity/detail getter returns only its row and
latest/selected summary, while attempts, RunObjects, revisions, sources, inputs, Builds,
outputs, bindings, Unit items, presentations, Publications, and Metrics use
independent bounded getters/lists. Delete or make internal the former aggregate
exports; no alternate public unbounded graph remains.

Correct pre-release `evaluations`: require `workspace_id`, allow nullable
`project_id`, and require exactly one of the existing target columns
`artifact_revision_id | composition_revision_id | build_id | run_id`. Derive
and validate target scope, require active Session authorship for normal writes,
and add persistent update/delete/same-ID `INSERT OR REPLACE` guards with
`recursive_triggers=OFF`. Evaluation rows and their target/report facts are
immutable. Workspace Evaluations use nullable `project_id` and may target only
a Workspace-owned Artifact revision or Workspace-only Run; Project-owned
targets require their exact derived Project.

Add `consumer_principals(id, namespace UNIQUE, identity_digest, created_at,
disabled_at)` and nullable `consumer_principal_id` to `agent_sessions`. A
consumer Session is otherwise the same immutable scoped Session used by all
existing revision provenance: it has one Workspace, optional exact Project,
fixed `agent = "consumer:<namespace>"`, and may author only while active. The
normal `startAgentSession` API can never set `consumer_principal_id`.
`authenticateConsumer(namespace, token)` is internal to the bridge and accepts
only the bounded startup identity for that namespace. For Farm, core may
`lstat` and read only `.ralphy/farm/identity.json` (regular file, no symlink,
mode 0600, at most 4096 bytes) with the exact canonical shape
`{ version: 1, namespace: "farm", storeId, consumerId, migrationId,
stageDigest, credentialDigest }`; it hashes the in-memory token and compares the
digest with `timingSafeEqual`. It never opens `farm/auth.token` or any other
consumer child. `startConsumerSession` requires that authenticated principal,
derives the fixed agent label, and reuses the existing Session scope checks.

Extend Runs with nullable `external_system`, `external_run_id`,
`external_node_id`, `external_attempt`, `external_operation`, and
`idempotency_key`. The six external fields are all-null for ordinary Runs and
all-non-null for a consumer Run; `external_attempt` is a positive safe integer.
Add partial unique indexes over
`(external_system, external_run_id, external_node_id, external_attempt,
external_operation)` and `(external_system, idempotency_key)`. Only a live
consumer Session may start such a Run, and `external_system` is derived from
its authenticated principal rather than trusted from input. Reusing a key with
the exact tuple, scope, Run kind, and canonical request digest returns the
original Run; any mismatch is `E_CONFLICT`.

Use the foundational immutable `run_results` and internal `recordRunResult`
from Task 7; do not recreate or alter its lifecycle here. Produce
`startConsumerOperationRun`, `findConsumerOperation` (tuple or idempotency-key
discriminated input), and bounded `listRunResults`; extend the existing result-
entity validator only for entity types first introduced in Task 9. An Agent Session without a
consumer principal cannot set or query another consumer's tuple. These APIs are
the single replay seam used later by generation, Build, Unit-revision,
Publication, and Metric-refresh controllers.

- [ ] **Step 3: Add typed overview and media controllers**

Workspace overview returns Workspace Documents, Units, accounts, recent activity, and Project summaries. Project overview returns inherited/project Documents with exact bound revision and newer-head status, Iteration/feedback/stages, Compositions/Build summaries, Units, recent Runs/activity, and media counts.

Every query, overview, media, and activity projection is SQL-backed and may
resolve only the exact core Object/RunObject selected by an explicit controller
call. None performs discovery or fallback traversal under reserved `farm/`.
Extend the query-surface test with a poison Farm tree and an access trap; all
DTOs, counts, cursors, and activity sequences must remain identical and the trap
must record zero descendant access.

Overview DTOs are constructed from explicit projections, never row spreads.
Their field allowlist is stable IDs, slug/name/label, kind/format/role, state/
status/verdict, platform/handle/credential-configured status, latest/selected/bound
revision IDs, counts, timestamps, row version, and page cursors. They never include `metadata`, `config`, `payload`, raw report/
error text, credential refs, bucket/key, original names, hashes, or any path/
locator. Every nested collection is a caller-supplied bounded page or a count.

Media is exactly this no-locator discriminated union: Artifact cards expose
identity/scope/slug/kind, selected revision ID/state/MIME/bytes/timestamp, and
revision count; RunObject cards expose identity/scope/purpose/state/retention,
MIME/bytes/timestamp, and optional promoted Object ID; Object cards expose
identity/scope/storage class/MIME/bytes/timestamp/reference count. Object
storage class remains `durable | working | diagnostic`; cache/temp are
RunObject location/retention concepts. Only an Artifact card is reviewable.

`reviewMedia` requires an Artifact with a non-null selected revision and the
exact non-null `expectedSelectedRevisionId`. In one immediate transaction it
creates the new state revision from that selected revision, advances selection,
inserts one immutable Evaluation, optionally inserts open feedback, and appends
activity. Any stale selection, invalid Session/scope, Evaluation, or feedback
failure rolls back every row; unselected Artifacts must be selected first.

- [ ] **Step 4: Verify and commit the consumer boundary**

Test cursor canonicality/malformed/size/limit boundaries, stable-set insertion
behavior, every list/detail/history/status method, both Workspace and Project
visibility, split bounded child pages, Workspace/Project Evaluation XOR/scope/immutability,
store-wide activity sequence, exact media union shapes, non-Artifact review
rejection, and stale/failed media-review rollback. Recursively assert overview
and media DTO keys satisfy their allowlists and contain zero paths, locators,
metadata/config/payload, raw errors, or secrets.

Also test wrong/missing Farm token rejection without reflecting token bytes,
ordinary callers being unable to mint consumer Sessions, immutable consumer
Session scope, direct-SQL principal/session guards, and tuple/idempotency
lookup isolation. Simulate the crash window for five fixture Runs named
`generation`, `build`, `unit-revision`, `publication`, and `metric-refresh`:
create the Run and ordered results, omit the consumer journal append,
reconnect/authenticate, query by both the tuple and key, and require the same
Run/result IDs with no second row or Metric snapshot.
Poison every other `.ralphy/farm/**` child and assert startup reads only the
bounded identity while all query/verification calls touch no consumer child.

```bash
bun test tests/integration/domain-query-surfaces.test.ts tests/integration/domain-*.test.ts
git add cli/lib/store/schema.ts cli/lib/store/types.ts cli/lib/store/pagination.ts cli/lib/store/activity.ts cli/lib/store/scopes.ts cli/lib/store/sessions.ts cli/lib/store/documents.ts cli/lib/store/objects.ts cli/lib/store/artifacts.ts cli/lib/store/runs.ts cli/lib/store/consumers.ts cli/lib/store/compositions.ts cli/lib/store/units.ts cli/lib/store/evaluations.ts cli/lib/store/overviews.ts cli/lib/store/media.ts tests/integration/domain-query-surfaces.test.ts docs/superpowers/plans/2026-08-02-core-domain-store-implementation.md
gitleaks protect --staged --redact
git commit -m "feat(store): add bounded domain query surfaces"
```
