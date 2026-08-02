# Full Library Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import, physically relocate, verify, and cut over the user's complete legacy `.ralphy` library and Desktop-owned state into the SQLite domain store with 100% source-path coverage and a recoverable rollback point.

**Architecture:** Migration builds a sibling staged Ralphy root while every source remains untouched. Every pre-freeze staged operation receives one `MigrationContext` carrying its explicit database/root, immutable source identities, and Run ID; ambient cwd/root helpers are forbidden. On APFS every source Object is copy-on-write cloned with a required-clone policy, promoted and journaled without a full-copy fallback. A one-time freeze closes the staged store; all later verification is read-only and external. A durable journal outside all renamed roots then coordinates the non-atomic two-rename cutover and crash recovery while retaining both the legacy recovery root and, on rollback, the new v2 root.

**Tech Stack:** Bun, TypeScript, `bun:sqlite`, Node filesystem/crypto APIs, APFS clone via `COPYFILE_FICLONE_FORCE`, macOS Keychain, Zod, `bun:test`

## Global Constraints

- Complete the core-domain-store and entity-CLI/bridge plans before running this plan.
- Every pre-freeze function that reads/writes staged state consumes `MigrationContext = { db, storeRoot, sourceRoots, runId }`; `storeRoot` is the staged data root containing `ralphy.db`. Read-only audit and post-freeze verify/cutover receive explicit immutable paths/identities instead. Migration modules never call ambient `openDomainDb()`, `ralphDir()`, `setRoot()`, or infer state from cwd.
- The latest observed source contains 77,670 regular files and 3,685 directories totaling 70,386,992,506 logical bytes (about 65.6 GiB), including 26 zero-byte files and 399 `.DS_Store` files. It has 30 Workspaces, 160 physical Projects, 146 registry Projects, 21 physical-only Projects, and 7 registry-only Projects. Only about 17.6 GB is free, so an ordinary second copy is not viable.
- The latest jobs snapshot contains 141 jobs (13 pending, 13 completed, 114 failed, and 1 cancelled), 1,605 log rows, and 128 absolute `log_path` values. Preserve pending jobs under an execution hold; never start them implicitly after cutover.
- `migrate audit` is strictly read-only, `migrate run` never cuts over, and cutover requires the exact Run ID plus a fresh verification ID.
- The packaged Desktop and a source watcher were running during audit. Apply one shared redacted quiescence gate before and after every mutating phase for Desktop/Electron helpers, daemon/workers/watchers, generation/render/ffmpeg/HyperFrames/Remotion, publishing, and other source-targeting agents.
- Never follow symlinks during inventory. Every file, directory, empty entry, symlink, socket, and unknown entry receives exactly one ledger row and disposition.
- Never mutate or delete the source before verified cutover.
- Reserve `.ralphy/farm/` in the v2 root for Farm-owned automation state. Core migration inventories legacy Farm paths for coverage, raw evidence, recovery, and stable-ID handoff, but never installs consumer state there or later scans that namespace as domain buckets, tmp, or cache.
- Before retiring legacy paths, produce a complete stable legacy-locator-to-entity mapping for every Farm-relevant Workspace, Project, control, and media source. Farm migration consumes only the maintenance bridge mapping and must reach its own verified ready state before core cutover.
- Farm receives that mapping authority only through an external mode-0600 consumer maintenance grant bound to the exact migration Run, lock nonce, source identities/inventory digests, mapping digest, store ID, and core contract. Neither hello nor a normal bridge method exposes the nonce.
- For the live library require `COPYFILE_FICLONE_FORCE`. Unsupported clone, `EXDEV`, or any clone failure stops with the source untouched and performs no ordinary-copy/delete fallback. Copy mode is a separately selected mode only when space already covers all remaining logical bytes, derived bytes/DB overhead, and `max(2 GiB, 10%)` reserve.
- Malformed JSONL creates an issue plus a raw diagnostic Object containing the exact bytes, byte offset, length, and hash; valid sibling lines remain importable. Preserve CRLF, missing final newline, and invalid UTF-8 evidence.
- Import every ambiguous revision candidate but do not choose a head without manifest/index evidence.
- Plaintext credentials and Electron `safeStorage` blobs never enter SQLite, Objects, reports, activity, stdout, stderr, or logs. Known schemas include X, Telegram, and Postiz plus the observed 667,395-byte Instagram cookie jar at `.ralphy/tmp/ig-cookies.txt`; re-scan all roots and Desktop state under the cutover lock before importing any raw control evidence. Cutover blocks until each candidate has an encrypted core text/file secret reference or an explicit sensitive recovery-only disposition.
- `migrate audit` performs no filesystem write, clone probe, lock acquisition, DB creation/checkpoint, or source-WAL mutation. `run` creates the lock/stage and probes forced clone support.
- Never invoke or reuse the current in-place `cli/lib/migrate.ts`; its rewrite/prune and `EXDEV -> copy -> remove` behavior is unsafe for this migration.
- Migrated pending jobs carry a nullable migration hold that every claim path excludes. Only explicit post-cutover resume or cancel releases/resolves it.
- Freeze the staged database exactly once after all imports. Repeated verification may write only external verification records and must leave the database/WAL/SHM bytes, size, mtime, and digest unchanged.
- Recovery is never deleted automatically.
- Keep all repository edits and commit messages English-only.

---

### Task 1: Add migration schema, types, errors, and the complete legacy fixture

**Files:**
- Modify: `cli/lib/store/schema.ts`
- Modify: `cli/lib/jobs/db.ts`
- Create: `cli/lib/migration/types.ts`
- Modify: `cli/lib/errors/catalog.ts`
- Modify: `tests/unit/errors-catalog.test.ts`
- Create: `tests/fixtures/migration/build-legacy-library.ts`
- Test: `tests/unit/migration-schema.test.ts`
- Modify: `tests/integration/jobs-db.test.ts`

**Interfaces:**
- Consumes: the schema version produced by the completed core/entity plans, immutable `store_id`, and `newDomainId()`
- Produces: the next schema migration, `MigrationContext`, migration row types, and `buildLegacyLibrary(root): LegacyFixture`

```ts
export type MigrationSourceRoot = {
  id: string;
  kind: "ralphy" | "legacy-workspace" | "desktop";
  path: string;
  device: bigint;
  inode: bigint;
};
export type MigrationContext = {
  db: Database;
  storeRoot: string;
  sourceRoots: readonly MigrationSourceRoot[];
  runId: string;
};
export type MigrationConsumerGrant = {
  version: 1;
  namespace: "farm";
  coreMigrationRunId: string;
  storeId: string;
  lockNonce: string;
  coreVersion: string;
  schemaVersion: number;
  contractVersion: number;
  sourceInventoryDigest: string;
  mappingDigest: string;
  sourceIdentities: Array<{
    id: string;
    kind: "ralphy" | "legacy-workspace" | "desktop";
    canonicalPathHash: string;
    device: string;
    inode: string;
    mode: number;
    inventoryDigest: string;
  }>;
  issuedAt: number;
};
```

- [ ] **Step 1: Write the failing migration-schema test**

```ts
const db = openDomainDb();
expect(db.query("SELECT name FROM sqlite_master WHERE name = 'migration_entries'").get()).not.toBeNull();
expect(() => db.query(`INSERT INTO migration_entries
  (id, migration_run_id, source_root_kind, source_path, entry_kind, disposition, state, created_at, updated_at)
  VALUES ('entry', 'missing', 'ralphy', 'x', 'file', 'object', 'inventoried', 1, 1)`).run()).toThrow();
```

- [ ] **Step 2: Add exact journal columns and constraints**

Migration 3 creates:

```text
migration_runs(
  id PRIMARY KEY, stage_root_rel, recovery_root_rel, phase,
  source_entry_count, source_file_count,
  source_bytes, inventory_completed_at, frozen_at, cutover_at,
  cutover_activity_id, last_error_code, last_error_detail,
  created_at, updated_at
)

migration_sources(
  id PRIMARY KEY, migration_run_id REFERENCES migration_runs,
  source_kind, source_label, canonical_path_hash,
  source_device, source_inode, source_mode, inventory_digest,
  created_at,
  UNIQUE(migration_run_id, source_kind, source_device, source_inode)
)

migration_entries(
  id PRIMARY KEY, migration_run_id REFERENCES migration_runs,
  migration_source_id REFERENCES migration_sources,
  source_path, source_locator_hash, entry_kind, source_kind, disposition,
  source_device, source_inode, source_mode, bytes, mtime_ms, sha256,
  target_path, target_refs_json, raw_evidence_object_id,
  state, error_code, terminal_at, created_at, updated_at,
  UNIQUE(migration_run_id, migration_source_id, source_path),
  UNIQUE(migration_run_id, migration_source_id, source_locator_hash)
)

migration_issues(
  id PRIMARY KEY, migration_run_id REFERENCES migration_runs,
  migration_entry_id REFERENCES migration_entries, code, severity,
  line_no, detail_json, resolved_at, created_at
)
```

Constrain phases to `audited|inventory|import|objects|relations|verify|ready|cutover|rolled-back|failed`, entry states to `inventoried|imported|staged|verified|excluded|issue`, issue severity to `info|review|block`, and dispositions to:

| Disposition | Allowed terminal state | Meaning |
|---|---|---|
| `domain` | `imported` | semantic rows plus exact raw control evidence |
| `object` | `verified` | immutable Artifact/Composition/Document source bytes |
| `run-object` | `verified` | working/diagnostic evidence |
| `decoded-object` | `verified` | derived bytes decoded from one inventoried source |
| `cache` | `excluded` | proven reproducible staged cache |
| `system` | `excluded` | mode/hash-recorded system entry such as `.DS_Store` |
| `recovery-only` | `excluded` | retained only in the untouched recovery tree |
| `secret-imported` | `excluded` | imported into encrypted text/file secret storage |
| `secret-recovery-only` | `excluded` | sensitive bytes retained only in recovery |
| `issue` | `issue` | explicit terminal review/block decision linked to an issue row |

An issue row itself is not a disposition: terminal `issue` requires one linked
unresolved decision with severity/reason, and resolving it requires a forward
transition to another allowed disposition/state. Account bytes per source path
even when several paths deduplicate to one Object. Represent zero-byte files and
empty directories explicitly; decoded data-URL bytes are derived targets rather
than additional source bytes.
`source_locator_hash` is immutable and equals SHA-256 over
`source-kind + NUL + normalized-relative-POSIX-path`; normalization rejects absolute paths, `..`,
empty segments, platform separators, and Unicode ambiguity before hashing. It
is the stable join key exposed by maintenance-only `migration.consumer.map` and
must be populated for every inventory row before import begins.

`source_path` is relative to its `migration_source_id`; `target_path` is null or
a staged-data-root-relative POSIX locator. Neither column may contain an
absolute, drive, UNC, URL, data URL, or traversal locator. Source roots exist as
in-memory context plus hashed/device/inode identities in SQLite, not plaintext
absolute paths.

Add persistent triggers that reject delete, ID/logical-key `INSERT OR REPLACE`,
source fingerprint/identity edits, backward state/phase transitions, and changes
to terminal disposition/targets/timestamps, including with
`recursive_triggers=OFF`. The sole terminal exception is one guarded
`issue -> allowed disposition/state` decision after all linked blocking issues
are resolved; it cannot return to `issue`. `target_refs_json` is canonical
sorted unique domain IDs or validated secret refs. Direct-SQL tests exercise every forbidden transition and
multi-source same-path entries.

Recoverable phase errors update redacted `last_error_*` while leaving the phase
at its resumable checkpoint. `failed` is terminal and used only by an explicit
abort/irrecoverable decision; `resume` never moves a failed Run backward.

The same schema migration adds nullable `jobs.migration_hold_run_id` referencing
the migration Run. Update every claim/reservation query in the shared jobs DB
module to require it is null; no alternate claim API may omit the predicate.
Expose `resumeHeldJob(id, expectedMigrationRunId)` as the only operation that
clears a hold; ordinary single/bulk retry never does. Existing cancellation may
terminalize a held job but cannot requeue it.
Migration-schema/jobs tests prove held pending jobs cannot be claimed through
single, bulk, dependency, scheduled, or retry paths.

- [ ] **Step 3: Add migration error codes without repurposing existing codes**

Add `E_MIGRATION_LOCKED`, `E_MIGRATION_SPACE`, `E_MIGRATION_COVERAGE`, `E_MIGRATION_VERIFY`, and `E_MIGRATION_CUTOVER` to the append-only catalog and keep the budget `< 56`.

- [ ] **Step 4: Build one deterministic comprehensive fixture**

`buildLegacyLibrary` creates both pre-#106 `workspace/.ralph` and current `.ralphy/workspaces` layouts containing:

- one registered, one physical-only, and one registry-only Project;
- Denti-like R2/R3 feedback, branch-suffixed HTML composition families, master/social/`.vN` render profiles, loose Markdown/ZIP files, and `render/work-*` diagnostics;
- an absolute-path asset manifest with one data URL;
- JSONL with valid lines surrounding one malformed line;
- an eight-image carousel, 32-item sticker pack, 40-item pack with repeated
  media refs, article, Workspace Unit, duplicate Unit media, text-only
  post/thread Units with `media: []`, same-slug `.vN` Unit directories, an
  intentional `foo-v2` identity, multiple `caption_versions`, `revisedFrom`
  publication links, raw caption states `humanized`/`auto_draft_archived`,
  Postiz/GitHub Pages/dev.to/Hashnode/Medium/manual article evidence, failures
  recorded before account resolution, failed-then-success same-slot rows,
  partial multi-target rows, and both ledger-only and manifest-only attempts;
- publish ledger, analytics, evaluations, stage state, jobs DB/logs with a non-empty WAL and pending job, cache/temp, semantic and unknown empty files/directories, `.DS_Store`, symlink/socket/FIFO blockers, one unknown file, X/Telegram/Postiz plaintext credentials, a 667,395-byte Instagram cookie jar, Desktop review/safeStorage fixtures, crash-injection points, and ambiguous `.vN`/`-vN`/`rN`/`final*` names;
- observed unusual roots: `.scratch`, `scratch`, `tmp`, `tmp-scripts`, `farm`, `web-videos`, `media-library`, root `PROFILE.md`/text files, `_research`, `_fx-probe`, references, research, memory, old jobs/logs, and daemon files.
- Farm/Studio state that legacy readers currently own: ingestion cursor/seen, topic index, selection-weight history, mixed lifecycle upgrade/rollback/selection events, cadence/notifications, workflows/subgraphs with prompt-file refs, project and run annotations, project board choice/layout, and run canvas layout.

Return exact expected entry/file/byte counts and hashes from the builder; tests must not hard-code host paths.

- [ ] **Step 5: Verify and commit migration primitives**

Run: `bun test tests/unit/migration-schema.test.ts tests/unit/errors-catalog.test.ts`

```bash
git add cli/lib/store/schema.ts cli/lib/jobs/db.ts cli/lib/migration/types.ts cli/lib/errors/catalog.ts tests/unit/errors-catalog.test.ts tests/fixtures/migration/build-legacy-library.ts tests/unit/migration-schema.test.ts tests/integration/jobs-db.test.ts
git commit -m "feat(migrate): add migration journal schema"
```

### Task 2: Implement read-only audit, complete inventory, and maintenance locking

**Files:**
- Create: `cli/lib/migration/inventory.ts`
- Create: `cli/lib/migration/service.ts`
- Test: `tests/unit/migration-inventory.test.ts`

**Interfaces:**
- Produces: read-only `auditMigration(input)`, `inventoryLegacySource(ctx: MigrationContext)`, explicit-identity `acquireMaintenanceLock`/`releaseMaintenanceLock`, and `readMigrationStatus`

```ts
export type AuditMigrationInput = {
  sourceRoots: readonly { kind: "ralphy" | "legacy-workspace" | "desktop"; path: string }[];
};
export type MigrationAudit = {
  sourceEntries: number;
  sourceFiles: number;
  sourceBytes: number;
  workspaces: number;
  physicalProjects: number;
  registryProjects: number;
  physicalOnlyProjects: string[];
  registryOnlyProjects: string[];
  cloneSupport: "not-probed";
  freeBytes: number;
  blockers: MigrationIssue[];
};
```

- [ ] **Step 1: Write failing read-only audit and inventory coverage tests**

Assert the fixture's exact entry/file/byte totals equal the summary and ledger count, empty directories and zero-byte files have rows, unknown files receive `disposition = 'issue'`, and `auditMigration` changes no source bytes/metadata, jobs WAL/SHM, or parent listing and creates no lock, database, stage, journal, or temporary clone probe.

- [ ] **Step 2: Implement `lstat` traversal without following links**

After the maintenance lock is acquired, use `fs.promises.opendir`, sort child names for deterministic order, and insert one `migration_sources` identity plus one `migration_entries` row per relative path including directories into `ctx.db`. Use `lstat`, never follow links, record device/inode/full mode/size/mtime, hash control files during inventory, and defer large media hashes until staging. Reject source paths that escape their exact resolved source. A poison test sets cwd/ambient `setRoot()` to a writable live fixture and proves all migration bytes/rows go only through `ctx.storeRoot`/`ctx.db`. Audit itself returns an in-memory report and cannot construct a `MigrationContext`.

- [ ] **Step 3: Implement preflight evidence**

Audit, without writing or probing clone support:

- compares registry Project IDs against physical Project directories;
- opens legacy jobs DB query-only without checkpointing and reports all status counts;
- detects packaged Desktop, daemon PID, and known watcher processes;
- computes required copy bytes plus a 10%/2 GiB safety margin;
- inventories Desktop settings/review/secret candidates from the explicit `desktop` source root;
- records all blockers without changing source.

The redacted process scan returns only category/PID/count; it never serializes,
logs, or reports argv. After the lock is held, `run` rejects broad mutating
targets (filesystem root, home, repository root, or any path other than the
exact inventoried `.ralphy` source), pre-existing conflicting stage/recovery/
rollback/journal state, and source identities already used by another active
Run. Canonical source roots must be distinct and non-overlapping; duplicate,
nested, or symlink-alias identities reject rather than double-account bytes. It
probes `COPYFILE_FICLONE_FORCE`, verifies stage/source use the same
device, and refuses insufficient copy-mode space before creating the first
staged Object.

- [ ] **Step 4: Add the exact maintenance lock**

Create `<source-parent>/.ralphy-migration.lock` with `open("wx", 0o600)` containing Run ID, source realpath/device/inode, PID plus process-start identity, nonce, UID, and timestamp. Reject symlinked source, stage, journal, recovery, or ancestor paths. PID reuse cannot make a stale lock appear live; a stale lock is reclaimed only through the matching `resume`, `recover`, or `rollback`, never silent deletion.

Use one shared process gate in `run`, `resume`, `verify`, `cutover`, `recover`, and `rollback`. Inspect process categories plus open file descriptors and process cwd under both source and stage; report only category/PID, never full argv or FD target. Recheck every source/stage identity and quiescence before and after each mutating phase.

- [ ] **Step 5: Verify and commit audit/inventory**

Run: `bun test tests/unit/migration-inventory.test.ts`

```bash
git add cli/lib/migration/inventory.ts cli/lib/migration/service.ts tests/unit/migration-inventory.test.ts
git commit -m "feat(migrate): inventory every legacy path"
```

### Task 3: Implement isolated legacy readers and semantic scope/document import

**Files:**
- Create: `cli/lib/migration/legacy.ts`
- Create: `cli/lib/migration/import.ts`
- Test: `tests/unit/migration-import.test.ts`

**Interfaces:**
- Consumes: `MigrationContext`, scope/Document/operations stores, and migration ledger
- Produces: `classifyLegacyPath`, `importScopesAndDocuments`, `importExecutionAndOperations`

- [ ] **Step 1: Write failing malformed and drift import tests**

Assert:

- all valid JSONL lines on both sides of a malformed line become rows;
- the malformed line creates one issue plus a diagnostic-evidence allocation with exact raw bytes, byte offset, length, and hash for Task 4 staging;
- 22-like physical-only Projects are imported as `needs_review` rather than dropped;
- registry-only Projects become archived metadata-only `needsReview` Projects with `migrationSourceMissing`; physical-only Projects also receive `needsReview` evidence;
- Markdown/JSON control content becomes typed immutable Document revisions;
- absolute paths are normalized to source-relative evidence and never copied into live rows.

- [ ] **Step 2: Keep every legacy parser inside one module**

`legacy.ts` may read registry/config/workspace manifests, asset manifests, Units, composition indexes, JSONL, old jobs SQLite, and known Markdown filenames. It returns typed records plus parse issues; it never writes source and never appears in normal command imports.

It also has explicit typed parsers for the Farm/Studio files named in the
fixture: ingestion cursor/seen, topic index, selection weights, each lifecycle
event variant, cadence/notifications, workflow/subgraph/prompt refs,
annotations, board, and canvas. Each parser preserves record order, stable
source locator hash, and malformed sibling evidence; none is reachable from a
normal runtime import graph.

Run the secret-candidate classifier before parsing or allocating any control bytes;
secret-tainted entries may flow only to encrypted secret import or untouched
recovery. Parse JSONL as bytes so invalid UTF-8, CRLF, missing final newline,
and malformed line boundaries remain recoverable; catch per record, not per
file. For JSON and each valid JSONL record, first parse the untouched raw bytes
with `JSON.parse` into `unknown`, retain raw evidence, then apply an explicit
legacy-shape normalizer before Zod validation. Never feed a legacy record
straight into the canonical/current schema or let Zod stripping erase unknown
fields. Malformed records enter the issue/quarantine report with source locator,
ordinal, byte range, and digest while valid sibling records continue. Every
non-empty non-secret JSON, JSONL, Markdown, and recognized control
file gets an exact raw-evidence allocation in addition to normalized rows, even
when parsing is complete. Preserve byte hash, mode, CRLF, invalid UTF-8, and
missing final newline. A recognized zero-byte control file uses the semantic
empty marker plus ledger zero hash/mode instead of an invalid empty Object. This
task does not register evidence Objects or terminalize their entries; it emits
deterministic preallocated candidates consumed by Task 4. Decode no data URLs
here.

- [ ] **Step 3: Import scope and text rows with ledger transitions**

Create stable ID maps in migration target refs. Import Workspaces/Projects,
Iterations inferred only from explicit feedback-round evidence, feedback,
Documents/revisions/bindings, Workspace resources, memory, research,
evaluator/stage state, settings, campaigns, and calendar state. A recognized
semantic zero-byte control file becomes an explicit empty Document/marker plus
ledger hash/mode evidence; an unknown zero-byte file remains blocking `issue`,
never a silent system exclusion. Semantic rows plus their deterministic target/
evidence allocations (for non-empty controls) share one `ctx.db` transaction but leave the entry
non-terminal; Task 4 atomically binds the verified raw Object and transitions it
to `imported`. Resume treats existing matching IDs as idempotent and mismatches
as blockers.

- [ ] **Step 4: Import old jobs and logs**

With all writers stopped, allocate exact raw-evidence candidates for
`jobs.db`, `jobs.db-wal`, and `jobs.db-shm`, then forced-clone the triplet into a
separate staged working directory. Compare source triplet device/inode/mode/
size/mtime/hash before and after, open/checkpoint only the working clone, and
require clean SQLite integrity/foreign keys. Task 4 registers the untouched raw
triplet candidates. Reconcile source snapshot versus working clone versus staged
domain rows by counts and every job/log/artifact primary ID; missing, duplicate,
or changed rows block. Copy every row into staged `ralphy.db`, import all 1,605
log rows, create Runs for historical jobs, preserve numeric job IDs, and
normalize all absolute log paths to safe relative/Object locators. Missing
Project links become review issues.

Populate nullable `jobs.migration_hold_run_id` from Task 1. Preserve every pending job with the current
migration Run ID; completed/failed/cancelled jobs have null hold. Only explicit
post-cutover `job resume` clears the hold or `job cancel` terminalizes the held
job. Generic retry, daemon startup, dependency release, and first launch cannot
release or execute it.

- [ ] **Step 5: Verify and commit semantic import**

Run: `bun test tests/unit/migration-import.test.ts`

```bash
git add cli/lib/migration/legacy.ts cli/lib/migration/import.ts tests/unit/migration-import.test.ts
git commit -m "feat(migrate): import legacy semantic state"
```

### Task 4: Clone and promote every binary/Object candidate into staged buckets

**Files:**
- Create: `cli/lib/migration/staging.ts`
- Modify: `cli/lib/store/objects.ts`
- Test: `tests/unit/migration-staging.test.ts`
- Modify: `tests/integration/domain-objects.test.ts`

**Interfaces:**
- Consumes: `MigrationContext`, `prepareObject`, `registerPreparedObject`, APFS clone, and migration ledger
- Produces: `stageInventoryObjects(ctx: MigrationContext): Promise<StageSummary>`

- [ ] **Step 1: Finalize the shared Object API before migration code**

Use these exact interfaces:

```ts
export type PreparedObject = {
  id: string;
  scope: { workspaceId: string; projectId?: string };
  bucket: string;
  key: string;
  finalPath: string;
  sha256: string;
  bytes: number;
  mime: string | null;
  originalName: string;
  storageClass: "durable" | "working" | "diagnostic";
};

export async function prepareObject(db: Database, storeRoot: string, input: ObjectIngestInput & {
  transfer: "copy" | "move";
  clonePolicy?: "allow-copy" | "require";
}): Promise<PreparedObject>;
export function registerPreparedObject(db: Database, prepared: PreparedObject): ObjectRow;
export async function ingestObject(input: ObjectIngestInput & { transfer?: "copy" | "move" }): Promise<ObjectRow>;
```

`prepareObject` completes bytes before any DB transaction and resolves only through the supplied `db` and `storeRoot`. `registerPreparedObject` performs only the row insert. `ingestObject` remains the normal ambient convenience wrapper and defaults to `copy`; generated Run temp callers explicitly pass `move`. Add an ambient-live-root trap test proving staged migration cannot touch cwd's live store.

Migration resume never relies on a process-local `WeakSet`, cache, or returned
`PreparedObject`. Reconstruct it after restart only from the immutable ledger
allocation plus final staged bytes, then re-stat/stream-hash/verify the final
path before registration. Poison ambient cwd and `setRoot()` in every staging
test.

- [ ] **Step 2: Write failing APFS clone and resume tests**

Assert source hashes/mtimes remain unchanged, staged files use forced cloning, decoded data URLs become ordinary Objects, a crash after final-byte promotion but before ledger commit resumes with the preallocated Object ID/key and no duplicate row, and insufficient copy-mode free space blocks before the first Object. Inject `ENOTSUP`, `EXDEV`, and clone failure under `clonePolicy: "require"` and prove zero fallback copy/remove calls.

- [ ] **Step 3: Implement clone to staged temp, then normal promotion**

For every durable/working/diagnostic candidate, including all preallocated raw
control evidence:

1. allocate and persist the target Object ID/key in the ledger;
2. clone directly into an Object-specific staged temp path using `copyFile(..., COPYFILE_FICLONE_FORCE)` with `clonePolicy: "require"` for the live library;
3. stream hash, fsync, rename to the immutable final key, and fsync its containing directory;
4. inside one explicit staged-DB transaction, call `registerPreparedObject` and mark the ledger entry `staged` with sorted Object target refs;
5. verify staged hash before marking `verified`.

For a semantic control entry, the registration transaction instead binds
`raw_evidence_object_id`, verifies all already-allocated semantic targets, and
terminalizes the entry as `domain/imported`; its raw Object is still hash-
verified and referenced. A malformed-line diagnostic allocation becomes a
RunObject/Object target without swallowing valid sibling rows.

Resume in a fresh process handles bytes promoted before DB commit by rebuilding
the same `PreparedObject` from ledger facts, verifying final bytes, and
registering the same preallocated Object. A matching DB row with an incomplete
ledger is verified and completed; a mismatching path/hash blocks and is never
overwritten. Ordinary copy is a separately preflight-selected mode, never an
internal fallback from required clone.

Decode data URLs directly into staged temp, record their manifest entry plus generated Object refs, and never materialize base64 in SQLite.

- [ ] **Step 4: Classify RunObjects, cache, empty, and unknown entries**

Render work frames/probes/logs and legacy `.scratch`, `scratch`, `tmp`, and
`tmp-scripts` become durable evidence as working/diagnostic Migration RunObjects
unless proven reproducible; their old path name does not make them disposable
v2 temp. Reproducible cache stays below staged `.ralphy/cache/` with explicit
ledger target. Preclassified secret candidates are never opened/staged here and
remain non-terminal for Task 6. Recognized semantic zero-byte files were imported as empty
Documents/markers; fixture-backed empty directories and `.DS_Store` receive
explicit terminal recovery/system dispositions with mode/size/hash evidence.
Unknown files or empty entries remain blocking `issue` until a reviewed rule
assigns a valid disposition.

- [ ] **Step 5: Verify and commit staged storage**

Run: `bun test tests/unit/migration-staging.test.ts tests/integration/domain-objects.test.ts`

```bash
git add cli/lib/migration/staging.ts cli/lib/store/objects.ts tests/unit/migration-staging.test.ts tests/integration/domain-objects.test.ts
git commit -m "feat(migrate): stage legacy objects safely"
```

### Task 5: Reconstruct Artifacts, Compositions, Builds, Units, publications, and metrics

**Files:**
- Modify: `cli/lib/migration/import.ts`
- Test: `tests/unit/migration-production.test.ts`

**Interfaces:**
- Consumes: `MigrationContext`, imported scope/Document IDs, staged Object hashes, legacy manifests/indexes/Units, and production/delivery stores
- Produces: `importProductionAndDelivery(ctx: MigrationContext): Promise<ImportSummary>`

- [ ] **Step 1: Write failing Denti-like provenance tests**

Assert R2/R3 feedback links to Iterations only from explicit feedback records,
HTML branch suffixes remain distinct Composition lineages, and only a proven
revision token is stripped from identity. Master/social/`.vN` render variants
become separate Builds on their exact source revision; outputs become Artifact
revisions and work files remain RunObjects. `rN` in a filename alone never
creates an Iteration. Ambiguous/empty families remain imported but unselected
with a review issue. Loose Markdown/ZIP files become Documents/Artifacts, not
synthetic Projects.

- [ ] **Step 2: Reconstruct Artifact families using evidence precedence**

Evidence order is manifest/index selection, explicit composition binding, exact
Unit provenance, then filename-family heuristic. Preserve meaningful branch
suffixes; remove `.vN`/`-vN` only when sibling/index evidence proves it is a
revision token. Never strip `rN` as an Iteration or conflate master, social, and
encoded `.vN` renders. Hash-identical Unit copies link to the proven source
Artifact revision. `.vN`, `-vN`, `rN`, `final*`, and zero-byte candidates
without higher evidence remain unselected with an issue; no filename alone
selects a head.

- [ ] **Step 3: Reconstruct flexible Units and distribution history**

Import carousel and sticker order, article body/cover/attachments, captions,
per-platform presentation metadata, append-only publish records, Postiz
identifiers, URLs, schedule timestamps, and analytics snapshots. A text-only
post/thread with `media: []` becomes a valid Unit revision with at least one
Document item; it is never dropped or forced to invent media. Directories with
the same manifest slug and a proven `.vN` suffix become immutable revisions of
one Unit; latest and selected pointers are derived separately from explicit
manifest/index evidence and otherwise remain unset/reviewable. An intentional
semantic slug such as `foo-v2` remains a separate Unit unless same-slug manifest
evidence proves otherwise. Preserve up to 40 or more ordered items and repeated
Artifact/Document targets at distinct positions; deduplication reuses Object
bytes, never deletes an item occurrence. Article/text body is a Document item.

Map raw caption states `humanized` and `auto_draft_archived` to the canonical
Presentation caption-state vocabulary while retaining exact raw evidence.
Import every `caption_versions` entry as ordered immutable caption history,
choose the effective caption only from explicit source evidence, and bind each
Publication to the exact effective Presentation revision, caption revision,
and canonical effective platform options that were used. Map every
`revisedFrom` link (26 in the latest observed live source) to immutable same-Workspace
`publications.revised_from_publication_id` edges after both attempts exist.
Provider rails require a social account except a terminal pre-account failure,
which imports as provider rail + `failure_stage = "account-resolution"` and no
claim/provider call. Historical social account is also nullable for validated
manual/article rails; every other nullable account must match a named
provider-specific validation rule. GitHub Pages and manual evidence import as
accountless rails; dev.to and Hashnode require matching provider accounts.
Legacy Medium export evidence becomes a RunObject plus approval artifact, not a
Publication or published URL; only a separately confirmed manual post creates
a `manual` Publication. Ambiguous rails or cross-scope revised links block.

Parse manifests and publish-ledger JSONL independently, then reconcile them by
stable source identity, locator/row ordinal, target slot, provider ID, and exact
timestamps rather than lossy caption/filename heuristics. A failed then
successful record for one slot remains two ordered attempts; partial multi-
target batches retain each target's independent outcome; ledger-only and
manifest-only attempts both survive with explicit provenance. A true legacy
idempotent-skip row produces Activity referencing the original Publication and
does not create an attempt. Generate every import idempotency key
deterministically from immutable source identity + locator hash + row ordinal +
target so resume returns the same IDs and never collides distinct attempts.
Each imported Publication target receives its own dedicated historical Run;
reconstruct a terminal RunAttempt only when source evidence proves provider
execution, and never leave a migrated attempt running. Pre-account failures
have a terminal failed Run without a fabricated provider RunAttempt; every
dedicated Run records its Publication result atomically.
Malformed publish/analytics JSONL rows remain quarantined/reported raw evidence
while valid siblings import.

Import Metric source plus as-of/window evidence and nullable `ctr`,
`retentionCurve`, `avgViewDurationSec`, `note`, and raw unknown fields without
turning missing values into zero. When legacy rows are cumulative, default
verification chooses the newest snapshot per Publication across all sources;
an explicit source filter chooses the newest per Publication within that
source. It never sums historical snapshots or multiple sources for one
Publication. Never copy Unit media into a new bucket key when hash/scope proves
an existing Object.

- [ ] **Step 4: Mark exact ledger targets**

A source manifest may target dozens of domain rows and decoded Objects; store the sorted stable IDs in `target_refs_json`. Transition only after every referenced row exists in the same transaction. Every Farm-relevant legacy Workspace, Project, control, media, schedule, workflow, subgraph, run journal, approval, inbox, layout, trust, dead-letter, and cache path receives its immutable `source_locator_hash` plus the complete stable core entity references needed by the Farm consumer. Missing or ambiguous Farm mappings remain blocking issues; slug/path guesses are never accepted.

The Farm handoff inventory explicitly includes `ingestion/cursor.json`,
`ingestion/seen.jsonl`, `topic-index.jsonl`, `selection-weights.jsonl`, every
`lifecycle.jsonl` event, cadence and notifications blocks from
`workspace.json`, workflow/subgraph definitions and referenced prompt files,
project/run `annotations.jsonl`, Studio `board.json`, and project/run canvas
state. Cursor/seen/topic/selection/lifecycle/policy/definition/layout rows map to
their stable Workspace/Project/Farm-run/core-Run IDs for the Farm migrator and
are not normalized into unrelated core tables. Board choices map to exact
Artifact revision IDs and become core selection only when the referenced hash
and Artifact lineage are unambiguous; board layout remains a Farm handoff row.
Artifact/Document/Build/core-Run annotations become immutable core
Evaluation/feedback rows; workflow-node/Farm-run annotations remain Farm
handoff rows. Mixed or path-only targets block rather than being guessed.

Include stable target refs for every non-secret social account descriptor,
campaign, campaign cell, and dated calendar entry. Credential refs/values are
handled only by Task 6. These mappings are required so Farm definitions and
run journals can rewrite `social-account`, `campaign`, and `calendar-entry`
refs without retaining a slug or source path.

Apply deterministic observed-root rules: legacy `farm` content becomes core
Migration RunObjects with parsed known dead-letter JSONL plus exact raw evidence
and consumer-handoff refs; it remains migration evidence/recovery and is never
installed as new `.ralphy/farm` live state;
`web-videos/<slug>` becomes a default-Workspace physical-only Project;
`media-library/library.json` becomes a custom catalog Document plus raw evidence
while its cache is reproducible; root `PROFILE.md`/text and loose Markdown become
default-Workspace Documents; loose ZIPs become Artifacts; `_research` is a
normal physical Project; `_fx-probe` is a diagnostic Project with Composition/
Build/RunObjects; reference/research/memory roots become shared resources/
Documents/Artifacts; old jobs/logs become execution evidence; daemon PID is
recovery-only. Directory shape alone never promotes loose files into Projects.
Any unmatched root, including an unmatched empty entry, remains blocking until
a fixture-backed rule exists.

After every Farm-candidate row is terminal and its target refs resolve, write
the canonical `MigrationConsumerGrant` to
`<source-parent>/.ralphy-consumer-grant-<run-id>-farm.json` through a mode-0600
sibling temp, file fsync, rename, and parent fsync. `mappingDigest` hashes the
sorted `(sourceIdentityId, sourceLocatorHash, sourceKind, targetRefs)` rows;
`sourceInventoryDigest` hashes the ordered source identity/inventory digests.
Re-emission is byte-identical while the lock and inputs are unchanged. A
changed lock nonce, source fingerprint, mapping row, store/schema/contract/core
version, or existing mismatched grant blocks and requires resume/rebuild; the
grant path/content never enters SQLite, activity, ordinary hello, or reports.

- [ ] **Step 5: Verify and commit production import**

Run: `bun test tests/unit/migration-production.test.ts`

Expected: PASS for text-only Document Units, 40-item/repeated-target order,
same-slug `.vN` revisions versus intentional `foo-v2`, independent latest and
selected pointers, immutable caption history, every ledger/manifest merge
case, deterministic retry keys, idempotent-skip Activity, effective
presentation/options binding, provider/account/Medium rules, `revisedFrom`
resolution, nullable/raw Metrics with both aggregation modes, and malformed
JSONL quarantine with valid siblings preserved.

```bash
git add cli/lib/migration/import.ts tests/unit/migration-production.test.ts
git commit -m "feat(migrate): reconstruct production history"
```

### Task 6: Import Desktop reviews and migrate all credential sources safely

**Files:**
- Modify: `cli/lib/migration/import.ts`
- Modify: `cli/lib/bridge/methods.ts`
- Test: `tests/unit/migration-desktop-state.test.ts`

**Interfaces:**
- Consumes: `MigrationContext`, Desktop review/settings export, core secret store, stable Artifact/RunObject IDs
- Produces: review/evaluation/feedback rows and write-only text/file `migration.secret.import` bridge operation

- [ ] **Step 1: Write failing review matching tests**

Match a Desktop annotation first by normalized source-relative path and then by verified hash. Assert path collisions become review issues, Approved/Shortlist/Reject/Needs Work map to approved/candidate/rejected/open feedback, and notes/tags/rating/favorite survive as evaluation metadata.

- [ ] **Step 2: Import plaintext legacy credentials directly into the core secret store**

Run secret discovery/classification before any raw-evidence or Object staging.
Parse only fixture-backed X, Telegram, and Postiz schemas, write values to scoped
secret refs keyed by immutable `store_id`, store only refs/non-secret account
metadata in SQLite, redact issue detail, and classify entries as
`secret-imported`. Import the observed 667,395-byte Instagram cookie jar through
`setSecretFile`; it is encrypted file-shaped data, never a text secret, Object,
RunObject, or raw-evidence file. Consumers materialize it only to mode-0600
`tmp/<run-id>/secrets/` and remove it at Run terminalization. An unknown secret
candidate blocks until imported or explicitly classified
`secret-recovery-only`; until that decision, inventory uses only lstat/name
classification and never reads bytes merely for a report. Secret-tainted bytes
never enter semantic parsers.

- [ ] **Step 3: Add a write-only Electron safeStorage handoff**

`migration.secret.import` accepts either
`{ runId, sourceEntryId, ref, kind: "text", value }` or
`{ runId, sourceEntryId, ref, kind: "file", base64 }` only through bridge stdin
memory, writes through the matching encrypted primitive, records only ref/kind/
completion, and never accepts or echoes secret bytes through argv/env/output.

Desktop safeStorage handoff is a one-shot allowlisted Electron helper launched
under the maintenance lock. It may read only the audited safeStorage keys and
call this method; it must not start media/root watchers, bridge auto-restart, or
normal Desktop windows. It exits before the next quiescence gate/mutating phase,
and any remaining helper process blocks. Re-audit Desktop state immediately
before invocation so newly appeared blobs cannot be skipped.

The process gate allowlist is exact PID plus migration nonce for this helper and
its staged-root bridge only; it never permits Electron/bridge by name alone.

This core task lands/tests the bridge contract with a fixture helper. The actual
one-shot executable is a required Desktop-repository milestone after the core
contract is released; live verification cannot complete until its packaged
no-watcher/exit test passes.

Chromium localStorage chat/settings data is exported by Desktop as typed JSON without credential bytes and imported as Agent Session preferences/history Documents where it belongs.

- [ ] **Step 4: Verify redaction**

Search staged SQLite/WAL/SHM, Objects, raw evidence, reports, activity, stdout,
stderr, and logs for fixture text/cookie/safeStorage bytes and assert zero
matches. Verify text and file refs survive stage-to-live rename and file
materialization is mode 0600 and Run-contained. Prove the helper starts no
watcher and exits. Preserve unmatched Desktop annotations as unbound
`needsReview` feedback rather than dropping them. After cutover verify recovery
mode 0700 and legacy secret files mode 0600; the report discloses that recovery
still contains plaintext credentials. Recovery/keychain cleanup is a separate
explicit operation.

Run: `bun test tests/unit/migration-desktop-state.test.ts tests/unit/secret-store.test.ts`

- [ ] **Step 5: Commit Desktop-state migration**

```bash
git add cli/lib/migration/import.ts cli/lib/bridge/methods.ts tests/unit/migration-desktop-state.test.ts
git commit -m "feat(migrate): import desktop reviews and secrets"
```

### Task 7: Implement complete verification with a digest-bound verification ID

**Files:**
- Create: `cli/lib/migration/verify.ts`
- Modify: `cli/lib/store/verify.ts`
- Test: `tests/unit/migration-verify.test.ts`
- Modify: `tests/integration/domain-verify.test.ts`

**Interfaces:**
- Consumes: source inventory, staged DB/buckets, `verifyDomainStore`, secret dispositions, and full source fingerprints
- Produces: one-shot `freezeMigration(ctx: MigrationContext): Promise<FrozenMigration>` and read-only `verifyMigration(input: { storeRoot: string; runId: string; verificationDir: string }): Promise<MigrationVerification>` plus a mode-0600 record outside all renamed roots

```ts
export type FrozenFileFingerprint = {
  exists: boolean;
  bytes: number;
  mtimeMs: number;
  sha256: string | null;
};
export type FrozenMigration = {
  runId: string;
  frozenAt: number;
  database: FrozenFileFingerprint;
  wal: FrozenFileFingerprint;
  shm: FrozenFileFingerprint;
};
export type MigrationVerification = {
  id: string;
  runId: string;
  verifiedAt: number;
  sourceEntries: number;
  coveredEntries: number;
  sourceBytes: number;
  accountedBytes: number;
  blockers: MigrationIssue[];
  databaseDigest: string;
  contentDigest: string;
  inventoryDigests: Record<string, string>;
  coreVersion: string;
  schemaVersion: number;
  contractVersion: number;
};

export type ConsumerReadyRecord = {
  namespace: "farm";
  migrationId: string;
  coreMigrationRunId: string;
  storeId: string;
  maintenanceGrantDigest: string;
  sourceInventoryDigest: string;
  mappingDigest: string;
  stageDigest: string;
  createdAt: number;
};
```

Farm writes the canonical, mode-0600 `ConsumerReadyRecord` outside every
renamed root after transforming and verifying its staged namespace. Core treats
it as an opaque digest-bound cutover prerequisite: validate the namespace,
exact core Run/store identities, mapping/source digests, mode, and canonical
record digest plus the exact maintenance-grant digest, but never open the Farm
stage or interpret Farm files.

- [ ] **Step 1: Write failing coverage and corruption tests**

One unclassified empty file, one missing Object, one corrupt hash, one absolute live row, one data URL, one broken Build chain, one broken Unit chain, one unimported secret, or one changed source control hash must each block readiness with its exact entry/entity ID.

- [ ] **Step 2: Implement all activation gates**

Require:

- exactly one terminal disposition for every inventory row;
- every source byte accounted to a relocated Object/RunObject, recovery-only source, decoded payload source, cache/system exclusion, or explicit issue;
- exact raw-evidence Object coverage for every non-empty non-secret JSON/JSONL/Markdown/control file, explicit semantic empty markers with zero hash/mode evidence, and no unknown empty entry silently excluded;
- unchanged full source entry fingerprints/hashes since inventory;
- hashes for every durable Object;
- `PRAGMA integrity_check = ok` and empty `foreign_key_check`;
- zero rows resolving to missing bytes;
- valid Composition revision -> Build -> output and Unit revision -> item -> Artifact revision chains;
- source-derived Unit accounting reconciles every manifest/directory exactly,
  including text-only, same-slug `.vN`, intentional `-v2`, 40-item/repeated-
  target, caption-history, latest, and selected cases;
- source-derived publication accounting reconciles every manifest/ledger row,
  merge disposition, idempotent-skip Activity, effective presentation/options,
  provider/account rule, and `revisedFrom` edge without silent collapse;
- source-derived Metric accounting preserves source/as-of/window, nullable
  normalized fields, raw extensions, and default versus explicit-source totals;
- no data URL, secret, or unresolved absolute path in SQLite;
- no plaintext secret materialization remains under staged tmp;
- every Desktop review and credential source resolved to imported encrypted state or an explicit recovery-only disposition;
- the migrated pending-job hold count equals the source pending-job count;
- source/clone/staged job, log, and artifact IDs/counts reconcile exactly;
- every source path, including deduplicated paths, contributes its logical bytes exactly once.
- every Farm-candidate inventory row has the canonical locator hash, an explicit consumer disposition, and complete resolvable target refs; `migration.consumer.map` pages reproduce the same sorted mapping without paths, gaps, or duplicates.
- the external Farm maintenance grant is mode 0600, matches the active lock nonce/source identities/core contract, and its recomputed source/mapping digests equal both the ledger and the Farm ready record.

Extend the domain verifier's Object-reference query for schema v3 so
`migration_entries.raw_evidence_object_id` and non-terminal staged transfer
references count as uses; do not suppress genuinely orphaned migration Objects.
The base-schema test still runs without migration tables.

- [ ] **Step 3: Freeze once, then verify without mutating the stage**

`freezeMigration` is the last staged writer. It validates import completion,
transitions the Run to `ready` with `frozen_at` exactly once, checkpoints WAL,
requires `PRAGMA wal_checkpoint(TRUNCATE)` to report no busy/uncheckpointed
frames, and closes every staged connection. It then computes the closed DB/WAL/SHM
fingerprint and writes it only to an external mode-0600 freeze record. A second
freeze is idempotent only when that record and current closed fingerprint match
exactly; it never rewrites timestamps/rows.

`verifyMigration` opens the frozen database read-only/query-only, performs no
checkpoint or activity/write, and hashes the closed database plus sorted
Object/RunObject content and the opaque encrypted `secrets.enc` bytes/mode
without decrypting them. Snapshot DB/WAL/SHM existence, size, mtime, and SHA-256
before/after and require exact equality. Write only an atomic, fsynced,
mode-0600 external verification record containing Run ID, all source inventory
digests, database fingerprint, sorted content digest, timestamp, contract/core/
schema versions, and verification ID computed from the canonical record digest.
Compute the ID with the `id` field omitted to avoid a circular envelope. Never store the token inside the database
it authenticates. Cutover recomputes every digest before the first rename; any
stage mutation invalidates readiness and requires rebuilding a new Run, not a
write during verify. Two consecutive verifications have identical DB/content/
inventory digests while their external IDs/timestamps differ.

- [ ] **Step 4: Verify and commit migration validation**

Run: `bun test tests/unit/migration-verify.test.ts tests/integration/domain-verify.test.ts`

```bash
git add cli/lib/migration/verify.ts cli/lib/store/verify.ts tests/unit/migration-verify.test.ts tests/integration/domain-verify.test.ts
git commit -m "feat(migrate): verify complete library coverage"
```

### Task 8: Expose resumable migration, exact cutover, and rollback commands

**Files:**
- Modify: `cli/lib/migration/service.ts`
- Create: `cli/lib/migration/cutover-journal.ts`
- Modify: `cli/commands/migrate.ts`
- Modify: `cli/commands/queue.ts`
- Modify: `cli/index.ts`
- Modify: `cli/lib/paths.ts`
- Delete: `cli/lib/migrate.ts`
- Delete: `tests/integration/cli-migrate-106.test.ts`
- Modify: `.gitignore`
- Modify: `tests/fixtures/verb-shapes.ts`
- Modify: `docs/cli-surface.generated.md`
- Test: `tests/integration/cli-migrate-sqlite.test.ts`

**Interfaces:**
- Produces: `startMigration`, `resumeMigration`, `cutoverMigration`, `recoverCutover`, `rollbackCutover`, startup journal guard, and the complete `ralphy migrate` command tree

- [ ] **Step 1: Write the failing CLI resume/cutover test**

```text
ralphy migrate audit --source <fixture>/.ralphy --legacy-source <fixture>/workspace/.ralph --desktop-source <desktop-data>
ralphy migrate run --source <fixture>/.ralphy --legacy-source <fixture>/workspace/.ralph --desktop-source <desktop-data>
ralphy migrate status <run-id> --source <fixture>/.ralphy
ralphy migrate resume <run-id> --source <fixture>/.ralphy
ralphy migrate consumer-grant <run-id> --namespace farm --source <fixture>/.ralphy
ralphy migrate verify <run-id> --source <fixture>/.ralphy
ralphy migrate cutover <run-id> --verification <verification-id> --consumer-ready farm:<consumer-ready-record> --confirm <run-id> --source <fixture>/.ralphy
ralphy migrate recover <run-id> --confirm <run-id> --source <fixture>/.ralphy
ralphy migrate rollback <run-id> --confirm <run-id> --source <fixture>/.ralphy
```

Assert `run` leaves source untouched, resume continues from the first incomplete phase without duplicate rows, stale verification or missing/stale/mismatched Farm readiness refuses cutover, successful cutover leaves `.ralphy-recovery-<run-id>`, and injected failure of the second rename restores the original `.ralphy` immediately. Exercise a table-driven crash matrix before/after each temp write, file fsync, journal rename, parent fsync, source rename, recovery mode change, install rename, restore rename, and installed smoke check; `recover` deterministically finishes installation or restores recovery without overwriting either generation. Also exercise crashes before and after Farm's separate namespace install: core recovery preserves the consumer record/stage, startup remains `consumer-pending`, and retrying the Farm install makes the exact identity handshake ready without replacing either generation.

`consumer-grant` is available only after complete Farm mapping and while the
matching maintenance lock is live. It returns only `{ namespace, path,
grantDigest }` through the maintenance CLI; its file contains the exact
`MigrationConsumerGrant`, is mode 0600, and is byte-identical on retry. Wrong
namespace/Run/source, stale lock PID/start identity/nonce, changed inventory or
mapping digest, and post-cutover calls reject.

- [ ] **Step 2: Implement phase checkpoints and staged-root binding**

Derive stage root as `<source-parent>/.ralphy-staging/<run-id>` and staged
data root/database as `<stage-root>/.ralphy` and
`<stage-root>/.ralphy/ralphy.db`. Each command constructs one
`MigrationContext` and opens only that database until freeze/cutover. Phase
transitions are monotonic and idempotent; `resume` reruns the current phase from
ledger facts and rejects any core/schema/contract version mismatch with the Run
that created the stage. Poison tests make ambient live-root use fail. Normal
CLI/Desktop startup checks the external journal before opening SQLite and
refuses interrupted states.

The Run records Farm as a required consumer once legacy Farm candidates are
inventoried. `cutover` therefore requires exactly one
`--consumer-ready farm:<path>` record matching that Run's `storeId`, source inventory digest, and
mapping digest plus maintenance-grant digest. The external core journal copies only its namespace, migration
ID, stage digest, target store ID, and canonical record digest; it never embeds
Farm content or exposes the record path to ordinary clients.

The first `migrate verify` call performs the one-shot freeze and then read-only
verification; later verify calls detect the external freeze record and remain
strictly read-only. No separate hidden freeze command exists.

- [ ] **Step 3: Implement journaled two-rename cutover and recovery**

Maintain `<source-parent>/.ralphy-migration-<run-id>.journal.json` outside all
renamed roots with durable states `prepared`, `source-moved`, `installed`,
`rollback-new-moved`, and `rolled-back`. Every transition uses atomic temp
write at mode 0600, file fsync, rename, and parent-directory fsync. The journal records the exact
mutating source/stage/recovery/rollback paths plus device/inode/mode identities,
and kind/path-hash/device/inode/mode identities for every non-mutating source; immutable
`storeId`, schema/contract/core versions, database digest, sorted content
digest, every source inventory digest, verification ID, Run ID, nonce, and
transition counter, plus the validated required-consumer readiness facts. A
fingerprint or version mismatch is never auto-repaired.

After closing/checkpointing staged SQLite:

1. require the mutating source to be exactly the inventoried basename `.ralphy` under its recorded parent—not `/`, home, repository root, an unresolved variable/glob, or a broader tree—and reject conflicting live/stage/recovery/rollback/journal generations;
2. recheck maintenance lock, contract/core/schema versions, stopped writers plus FDs/cwd under both source and stage, all source/stage identities/digests, every imported secret ref via value-free status, and the external verification record;
3. persist `prepared`, rename source `.ralphy` to `.ralphy-recovery-<run-id>`, set only the recovery root to mode 0700, fsync it and the parent, then persist `source-moved`; the journal retains the original root mode and any restore/rollback reapplies it;
4. rename exact staged `.ralphy` to source `.ralphy` and fsync parent;
5. if installation fails, immediately restore recovery; if restoration also fails, retain `source-moved` for explicit recovery and never copy/delete;
6. open the installed DB read-only, require its database/content/store/schema fingerprints to equal the verification record, and run integrity/foreign-key/domain smoke checks; persist `installed` and retain recovery before any database write. Normal startup then idempotently reconciles that installed journal into `migration_runs.cutover_at` plus one cutover activity keyed by Run/journal nonce; a crash before reconciliation simply retries it and cannot make installation ambiguous.

The core rename never moves, creates, or deletes the prepared Farm namespace.
After core installation, startup and `system.hello` expose the required `farm`
consumer as the exact safe DTO `{ namespace: "farm", state: "pending",
coreMigrationRunId, migrationId, stageDigest, readyRecordDigest,
identityDigest: null }` and allow only read-only inspection plus migration/
recovery operations until the exact bounded `.ralphy/farm/identity.json`
matches the journaled `storeId`, Farm migration ID, and stage digest. Farm owns
the atomic staged-directory rename and parent fsync. Once the identity matches,
startup reports the same DTO with `state: "ready"` and the canonical
`identityDigest`; core recovery only preserves and points
to the Farm ready record/journal and never traverses, repairs, merges, or removes
Farm state.

Before `installed`, `recover` identifies actual roots by recorded device/inode/
store ID plus the frozen digest rather than filename and handles every crash
state, including installation before its journal update. After `installed`,
normal writes may change the database, so rollback uses journal state plus
device/inode/store ID and never demands the stale frozen digest. Any unrecorded
conflicting generation blocks for manual review.
Rollback first renames v2 live to `.ralphy-rollback-new-<run-id>`, then recovery
to live; if the second rename fails, restore the exact v2 identity. Never
overwrite, merge, copy, or delete either generation.

- [ ] **Step 4: Replace the old command surface**

Expose `audit|run|resume|status|consumer-grant|verify|cutover|recover|rollback`. `audit|run`
accept one exact mutating `--source <.ralphy>` plus optional explicit
`--legacy-source` and `--desktop-source`; the created Run freezes those source
identities, and later commands reject attempts to substitute them. Delete the
old in-place migrator and its source-consumption test when this command replaces
it; no dangerous legacy implementation may remain shipped until live cutover.
Remove every `EXDEV` copy/delete path. Add stage/recovery/rollback-new/lock/
journal entries to ignores. Regenerate command docs and pretty shapes.

Expose `queue resume <id> --migration-run <run-id>` as the explicit adapter over
`resumeHeldJob`; it requires the matching hold and never resumes multiple jobs.
`queue retry` and bulk retry leave held jobs unchanged; `queue cancel` may
terminalize one. Cover all three command paths before regenerating docs.

- [ ] **Step 5: Verify and commit orchestration**

Run:

```bash
bun test tests/integration/cli-migrate-sqlite.test.ts
bun run cli:surface:build
bun run lint
```

```bash
git add cli/lib/migration/service.ts cli/lib/migration/cutover-journal.ts cli/commands/migrate.ts cli/commands/queue.ts cli/index.ts cli/lib/paths.ts .gitignore tests/fixtures/verb-shapes.ts docs/cli-surface.generated.md tests/integration/cli-migrate-sqlite.test.ts
git add -u cli/lib/migrate.ts tests/integration/cli-migrate-106.test.ts
git commit -m "feat(migrate): add resumable verified cutover"
```

### Task 9: Rehearse against an APFS clone of the real library

**Files:**
- Create: `docs/migration-rehearsal-2026-08.md`

**Interfaces:**
- Consumes: the live source only through a recoverable APFS clone and all Task 1-8 tools
- Produces: a redacted rehearsal report with exact counts, bytes, issues, duration, and resolved classification rules

- [ ] **Step 1: Stop writers and capture the preflight snapshot**

Confirm packaged Desktop, source watcher, daemon, and all Ralphy jobs/processes are stopped. Record only redacted process categories/PIDs, free space, jobs counts/holds, source entry/file/byte counts, registry/physical Project drift, and full inventory digest without credentials or sensitive argv.

- [ ] **Step 2: Create a recoverable APFS clone, never a live apply**

Clone the exact `.ralphy` tree per file using forced APFS clones on the same volume; never use generic recursive copy. Prove source/rehearsal entry counts and hashes match before invoking migration.

- [ ] **Step 3: Run audit, stage, import, and verify repeatedly**

Resolve every blocking unknown/malformed/secret/revision issue by adding
deterministic migration rules and fixture cases. Re-run from a fresh clone until
one pass reaches 100% coverage, exact raw-control/empty/mode evidence, clean
SQLite checks, zero missing bytes/absolute paths/data URLs/secrets, reconciled
held jobs, and representative Denti.AI branches/Builds. The real-library report
must reconcile all 169 observed Units, including all 42 text-only post/thread
Units with `media: []`, every maximum-size/repeated-item pack, same-slug `.vN`
revision family, and intentional version-looking identity. It must also
reconcile all 165 observed publish rows, all 26 resolvable `revisedFrom` links,
ledger/manifest merge dispositions, rail/account decisions, caption history,
effective platform options, Metric nullable/raw fields, and every quarantined
malformed JSONL row; changed source counts require a newly recorded audited
baseline, never a hard-coded silent waiver. Freeze once, run two
read-only verifications, and prove DB/WAL/SHM bytes and metadata are unchanged.
Before that freeze, run the released Farm migrator against the staged bridge
mapping until its separate stage is verified and emits a matching
`ConsumerReadyRecord`; pass that exact record to rehearsal cutover.

- [ ] **Step 4: Exercise rehearsal cutover and rollback**

Cut over only the rehearsal clone, confirm core reports Farm pending, install
the exact staged Farm namespace, then launch core CLI, Farm, Studio, and
packaged Desktop against it. Inspect Denti.AI plus one
carousel/sticker/article project, exercise Farm recovery across an interrupted
namespace install, then test coordinated rollback. For delivery smoke checks,
switch latest and selected Unit revisions independently; preview inherited and
explicit presentation subsets; inspect a text-only Unit, repeated-item pack,
caption history, failed/success and partial-target Publication attempts, a
revised Publication, an accountless article rail, Medium approval export with
no Publication, and default versus explicit-source Metric totals. Replay one
migrated operation and prove deterministic IDs. Record elapsed time and maximum
additional disk use.

- [ ] **Step 5: Commit the redacted rehearsal evidence**

```bash
git add docs/migration-rehearsal-2026-08.md tests/fixtures/migration
gitleaks protect --staged --redact
git commit -m "test(migrate): rehearse the complete library"
```

### Task 10: Perform the maintenance cutover and retire legacy runtime code

**Files:**
- Modify: `cli/lib/paths.ts`
- Modify: `scripts/lint-no-legacy-state.ts`
- Modify: `docs/domain-store.md`

**Interfaces:**
- Consumes: a successful real-library rehearsal, released v2-aware core, and packaged v2-aware Desktop
- Produces: one live SQLite/bucket library, one retained recovery root, and no normal legacy fallback

- [ ] **Step 1: Re-run live preflight and obtain a fresh source digest**

Stop all writers, acquire the maintenance lock, re-audit current counts/jobs/Desktop state/secret candidates, confirm forced-clone support/free space, reject broad/conflicting roots and open FDs/cwd under source or stage, and refuse to reuse the rehearsal verification ID. Retain the previous CLI commit/package and previous Desktop package as part of operational rollback.

- [ ] **Step 2: Migrate and verify the live library without cutover**

Run audit, staged migration, resume as needed, one-shot Desktop secret handoff,
prepare and verify the released Farm migration stage, freeze, and read-only verification. Require 100% core and Farm coverage and two consecutive
reports with identical database/content/inventory digests plus unchanged DB/
WAL/SHM bytes/metadata before requesting cutover. Confirm all migrated pending
jobs remain held and pass the exact Farm `ConsumerReadyRecord` to core cutover.

- [ ] **Step 3: Cut over and perform representative smoke checks**

Use the exact Run/verification/Farm migration IDs. While core reports Farm
pending, install the staged `.ralphy/farm` namespace and require its identity
handshake before restarting any writer. Then exercise CLI reads/writes, pinned
Farm/Studio, and packaged Desktop for Denti.AI Composition/Build switching,
feedback rounds, a multi-item carousel/sticker Unit, three-platform preview,
publications/metrics, Documents, working diagnostics, and both activity feeds.
Confirm latest/selected Unit switching, effective caption/options, one text-only
Unit, repeated items, publication reconciliation/lineage/accountless rails,
Medium export without a Publication, and default versus source-filtered Metric
totals against the rehearsal evidence before declaring live cutover complete.

- [ ] **Step 4: Remove migration-era normal fallbacks**

Confirm the old in-place migrator was already removed when the new command shipped, remove remaining legacy layout fallback from normal paths, and strengthen `lint:no-legacy-state` so only `cli/lib/migration/legacy.ts` may name legacy control files. Keep the new migration reader for recovery/import tooling, not runtime reads.

- [ ] **Step 5: Run final gates and commit runtime retirement**

```bash
bun run lint:no-legacy-state
bun run lint
bun test tests/unit/
bun test tests/integration/
gitleaks protect --staged --redact
git add cli/lib/paths.ts scripts/lint-no-legacy-state.ts docs/domain-store.md
git commit -m "refactor(core): retire legacy filesystem state"
```

Keep `.ralphy-recovery-<run-id>`, `.ralphy-rollback-new-<run-id>`, the external journal, and the old toolchain untouched until representative real-project verification completes and the user separately requests verified cleanup. The recovery tree may still contain plaintext credentials; deletion is never automatic.
