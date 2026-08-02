# Full Library Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import, physically relocate, verify, and cut over the user's complete legacy `.ralphy` library and Desktop-owned state into the SQLite domain store with 100% source-path coverage and a recoverable rollback point.

**Architecture:** Migration builds a sibling staged Ralphy root while the source remains untouched. Every staged operation receives an explicit database and store root; it must never resolve the live root through ambient process state. On APFS every source Object is copy-on-write cloned with a required-clone policy, promoted and journaled without a full-copy fallback. After semantic and byte-level verification, a durable journal outside all renamed roots coordinates the non-atomic two-rename cutover and crash recovery while retaining both the legacy recovery root and, on rollback, the new v2 root.

**Tech Stack:** Bun, TypeScript, `bun:sqlite`, Node filesystem/crypto APIs, APFS clone via `COPYFILE_FICLONE_FORCE`, macOS Keychain, Zod, `bun:test`

## Global Constraints

- Complete the core-domain-store and entity-CLI/bridge plans before running this plan.
- The latest observed source contains 77,670 regular files and 3,685 directories totaling 70,386,992,506 logical bytes (about 65.6 GiB), including 26 zero-byte files and 399 `.DS_Store` files. It has 30 Workspaces, 160 physical Projects, 146 registry Projects, 21 physical-only Projects, and 7 registry-only Projects. Only about 17.6 GB is free, so an ordinary second copy is not viable.
- The latest jobs snapshot contains 141 jobs (13 pending, 13 completed, 114 failed, and 1 cancelled), 1,605 log rows, and 128 absolute `log_path` values. Preserve pending jobs under an execution hold; never start them implicitly after cutover.
- `migrate audit` is strictly read-only, `migrate run` never cuts over, and cutover requires the exact Run ID plus a fresh verification ID.
- The packaged Desktop and a source watcher were running during audit. Apply one shared redacted quiescence gate before and after every mutating phase for Desktop/Electron helpers, daemon/workers/watchers, generation/render/ffmpeg/HyperFrames/Remotion, publishing, and other source-targeting agents.
- Never follow symlinks during inventory. Every file, directory, empty entry, symlink, socket, and unknown entry receives exactly one ledger row and disposition.
- Never mutate or delete the source before verified cutover.
- For the live library require `COPYFILE_FICLONE_FORCE`. Unsupported clone, `EXDEV`, or any clone failure stops with the source untouched and performs no ordinary-copy/delete fallback. Copy mode is a separately selected mode only when space already covers all remaining logical bytes, derived bytes/DB overhead, and `max(2 GiB, 10%)` reserve.
- Malformed JSONL creates an issue plus a raw diagnostic Object containing the exact bytes, byte offset, length, and hash; valid sibling lines remain importable. Preserve CRLF, missing final newline, and invalid UTF-8 evidence.
- Import every ambiguous revision candidate but do not choose a head without manifest/index evidence.
- Plaintext credentials and Electron `safeStorage` blobs never enter SQLite, Objects, reports, activity, stdout, stderr, or logs. Known candidates include two mode-0600 Postiz credential files and `.ralphy/tmp/ig-cookies.txt`; re-scan all roots and Desktop state under the cutover lock. Cutover blocks until each candidate has a core secret reference or an explicit sensitive recovery-only disposition.
- `migrate audit` performs no filesystem write, clone probe, lock acquisition, DB creation/checkpoint, or source-WAL mutation. `run` creates the lock/stage and probes forced clone support.
- Never invoke or reuse the current in-place `cli/lib/migrate.ts`; its rewrite/prune and `EXDEV -> copy -> remove` behavior is unsafe for this migration.
- Recovery is never deleted automatically.
- Keep all repository edits and commit messages English-only.

---

### Task 1: Add migration schema, types, errors, and the complete legacy fixture

**Files:**
- Modify: `cli/lib/store/schema.ts`
- Create: `cli/lib/migration/types.ts`
- Modify: `cli/lib/errors/catalog.ts`
- Modify: `tests/unit/errors-catalog.test.ts`
- Create: `tests/fixtures/migration/build-legacy-library.ts`
- Test: `tests/unit/migration-schema.test.ts`

**Interfaces:**
- Consumes: the schema version produced by the completed core/entity plans, immutable `store_id`, and `newDomainId()`
- Produces: the next schema migration, migration row types, and `buildLegacyLibrary(root): LegacyFixture`

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
  id PRIMARY KEY, source_root_kind, source_root_rel, stage_root_rel,
  recovery_root_rel, phase, source_entry_count, source_file_count,
  source_bytes, inventory_completed_at, verified_at, cutover_at,
  cutover_activity_id, last_error_code, last_error_detail,
  created_at, updated_at
)

migration_entries(
  id PRIMARY KEY, migration_run_id REFERENCES migration_runs,
  source_root_kind, source_path, entry_kind, source_kind, disposition,
  source_device, source_inode, source_mode, bytes, mtime_ms, sha256,
  target_path, target_refs_json, raw_evidence_object_id,
  state, error_code, terminal_at, created_at, updated_at,
  UNIQUE(migration_run_id, source_root_kind, source_path)
)

migration_issues(
  id PRIMARY KEY, migration_run_id REFERENCES migration_runs,
  migration_entry_id REFERENCES migration_entries, code, severity,
  line_no, detail_json, resolved_at, created_at
)
```

Constrain phases to `audited|inventory|import|objects|relations|verify|ready|cutover|rolled-back|failed`, entry states to `inventoried|imported|staged|verified|excluded|issue`, and issue severity to `info|review|block`. A source entry has exactly one typed terminal disposition whose sorted target refs and terminal timestamp cannot be rewritten. Account bytes per source path even when several paths deduplicate to one Object. Represent zero-byte files and empty directories explicitly; decoded data-URL bytes are derived targets rather than additional source bytes.

- [ ] **Step 3: Add migration error codes without repurposing existing codes**

Add `E_MIGRATION_LOCKED`, `E_MIGRATION_SPACE`, `E_MIGRATION_COVERAGE`, `E_MIGRATION_VERIFY`, and `E_MIGRATION_CUTOVER` to the append-only catalog and keep the budget `< 56`.

- [ ] **Step 4: Build one deterministic comprehensive fixture**

`buildLegacyLibrary` creates both pre-#106 `workspace/.ralph` and current `.ralphy/workspaces` layouts containing:

- one registered, one physical-only, and one registry-only Project;
- Denti-like R2/R3 feedback, multiple HTML composition versions, two render profiles, and `render/work-*` diagnostics;
- an absolute-path asset manifest with one data URL;
- JSONL with valid lines surrounding one malformed line;
- an eight-image carousel, 32-item sticker pack, article, Workspace Unit, and duplicate Unit media;
- publish ledger, analytics, evaluations, stage state, jobs DB/logs with a non-empty WAL and pending job, cache/temp, empty files/directories, `.DS_Store`, symlink/socket/FIFO blockers, one unknown file, plaintext credential and cookie fixtures, Desktop review fixture, crash-injection points, and ambiguous `.vN`/`-vN`/`rN`/`final*` names;
- observed unusual roots: `.scratch`, `scratch`, `tmp`, `tmp-scripts`, `farm`, `web-videos`, `media-library`, root `PROFILE.md`/text files, `_research`, `_fx-probe`, references, research, memory, old jobs/logs, and daemon files.

Return exact expected entry/file/byte counts and hashes from the builder; tests must not hard-code host paths.

- [ ] **Step 5: Verify and commit migration primitives**

Run: `bun test tests/unit/migration-schema.test.ts tests/unit/errors-catalog.test.ts`

```bash
git add cli/lib/store/schema.ts cli/lib/migration/types.ts cli/lib/errors/catalog.ts tests/unit/errors-catalog.test.ts tests/fixtures/migration/build-legacy-library.ts tests/unit/migration-schema.test.ts
git commit -m "feat(migrate): add migration journal schema"
```

### Task 2: Implement read-only audit, complete inventory, and maintenance locking

**Files:**
- Create: `cli/lib/migration/inventory.ts`
- Create: `cli/lib/migration/service.ts`
- Test: `tests/unit/migration-inventory.test.ts`

**Interfaces:**
- Produces: `auditMigration`, `inventoryLegacySource`, `acquireMaintenanceLock`, `releaseMaintenanceLock`, and `readMigrationStatus`

```ts
export type AuditMigrationInput = { sourceRoot: string; desktopDataRoot?: string };
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

After the maintenance lock is acquired, use `fs.promises.opendir`, sort child names for deterministic order, and insert one `migration_entries` row per relative path including directories into the explicit staged database. Use `lstat`, never follow links, record device/inode/mode/size/mtime, hash control files during inventory, and defer large media hashes until staging. Reject source paths that escape the exact resolved root. Audit itself only returns an in-memory report.

- [ ] **Step 3: Implement preflight evidence**

Audit, without writing or probing clone support:

- compares registry Project IDs against physical Project directories;
- opens legacy jobs DB query-only without checkpointing and reports all status counts;
- detects packaged Desktop, daemon PID, and known watcher processes;
- computes required copy bytes plus a 10%/2 GiB safety margin;
- inventories Desktop settings/review/secret candidates supplied through `desktopDataRoot`;
- records all blockers without changing source.

After the lock is held, `run` probes `COPYFILE_FICLONE_FORCE`, verifies stage/source use the same device, and refuses insufficient copy-mode space before creating the first staged Object.

- [ ] **Step 4: Add the exact maintenance lock**

Create `<source-parent>/.ralphy-migration.lock` with `open("wx", 0o600)` containing Run ID, source realpath/device/inode, PID plus process-start identity, nonce, UID, and timestamp. Reject symlinked source, stage, journal, recovery, or ancestor paths. PID reuse cannot make a stale lock appear live; a stale lock is reclaimed only through the matching `resume`, `recover`, or `rollback`, never silent deletion.

Use one shared process gate in `run`, `resume`, `verify`, `cutover`, `recover`, and `rollback`. Report only process category and PID, never full argv. Recheck source identity and quiescence before and after every mutating phase.

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
- Consumes: explicit source paths, staged domain DB, scope/Document/operations stores, and migration ledger
- Produces: `classifyLegacyPath`, `importScopesAndDocuments`, `importExecutionAndOperations`

- [ ] **Step 1: Write failing malformed and drift import tests**

Assert:

- all valid JSONL lines on both sides of a malformed line become rows;
- the malformed line creates one issue and a diagnostic Object with exact raw bytes, byte offset, length, and hash;
- 22-like physical-only Projects are imported as `needs_review` rather than dropped;
- registry-only Projects become archived metadata-only `needsReview` Projects with `migrationSourceMissing`; physical-only Projects also receive `needsReview` evidence;
- Markdown/JSON control content becomes typed immutable Document revisions;
- absolute paths are normalized to source-relative evidence and never copied into live rows.

- [ ] **Step 2: Keep every legacy parser inside one module**

`legacy.ts` may read registry/config/workspace manifests, asset manifests, Units, composition indexes, JSONL, old jobs SQLite, and known Markdown filenames. It returns typed records plus parse issues; it never writes source and never appears in normal command imports.

Parse JSONL as bytes so invalid UTF-8, CRLF, missing final newline, and malformed line boundaries remain recoverable; catch per record, not per file. Keep a raw diagnostic Object for partially understood control files whose unknown fields are not fully normalized. Decode no data URLs in this task—emit a classified binary candidate consumed by Task 4.

- [ ] **Step 3: Import scope and text rows with ledger transitions**

Create stable ID maps in migration target refs. Import Workspaces/Projects, Iterations inferred from feedback rounds, feedback, Documents/revisions/bindings, Workspace resources, memory, research, evaluator/stage state, settings, campaigns, and calendar state. Each semantic insert and its entry transition to `imported` share one SQLite transaction.

- [ ] **Step 4: Import old jobs and logs**

With all writers stopped, clone `jobs.db`, `jobs.db-wal`, and `jobs.db-shm` into stage; compare source triplet metadata before/after and checkpoint only the clone. Copy every job/log/artifact row into staged `ralphy.db`, import all 1,605 log rows, create Runs for historical jobs, preserve numeric job IDs, and normalize all absolute log paths to safe relative/Object locators. Missing Project links become review issues.

Preserve every pending job under a migration execution hold that worker claims exclude. Only explicit post-cutover `job resume` or `job cancel` clears or resolves that hold; first launch never executes migrated pending work.

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
- Consumes: explicit staged database/store root, `prepareObject`, `registerPreparedObject`, APFS clone, and migration ledger
- Produces: `stageInventoryObjects(db, storeRoot, runId): Promise<StageSummary>`

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

- [ ] **Step 2: Write failing APFS clone and resume tests**

Assert source hashes/mtimes remain unchanged, staged files use forced cloning, decoded data URLs become ordinary Objects, a crash after final-byte promotion but before ledger commit resumes with the preallocated Object ID/key and no duplicate row, and insufficient copy-mode free space blocks before the first Object. Inject `ENOTSUP`, `EXDEV`, and clone failure under `clonePolicy: "require"` and prove zero fallback copy/remove calls.

- [ ] **Step 3: Implement clone to staged temp, then normal promotion**

For every durable/working/diagnostic candidate:

1. allocate and persist the target Object ID/key in the ledger;
2. clone directly into an Object-specific staged temp path using `copyFile(..., COPYFILE_FICLONE_FORCE)` with `clonePolicy: "require"` for the live library;
3. stream hash, fsync, rename to the immutable final key, and fsync its containing directory;
4. inside one explicit staged-DB transaction, call `registerPreparedObject` and mark the ledger entry `staged` with sorted Object target refs;
5. verify staged hash before marking `verified`.

Resume handles bytes promoted before DB commit by verifying and registering the same preallocated Object. A matching DB row with an incomplete ledger is verified and completed; a mismatching path/hash blocks and is never overwritten. Ordinary copy is a separately preflight-selected mode, never an internal fallback from required clone.

Decode data URLs directly into staged temp, record their manifest entry plus generated Object refs, and never materialize base64 in SQLite.

- [ ] **Step 4: Classify RunObjects, cache, empty, and unknown entries**

Render work frames/probes/logs and legacy `.scratch`, `scratch`, `tmp`, and `tmp-scripts` become durable evidence as working/diagnostic Migration RunObjects unless proven reproducible; their old path name does not make them disposable v2 temp. Reproducible cache stays below staged `.ralphy/cache/` with explicit ledger target. Empty directories, zero-byte files, and every `.DS_Store` receive explicit terminal recovery/system dispositions with size/hash evidence. Unknown files block verification until assigned Object/RunObject/system disposition by a reviewed rule.

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
- Consumes: imported scope/Document IDs, staged Object hashes, legacy manifests/indexes/Units, and production/delivery stores
- Produces: `importProductionAndDelivery(db, runId): Promise<ImportSummary>`

- [ ] **Step 1: Write failing Denti-like provenance tests**

Assert R2/R3 feedback links to Iterations, HTML versions become ordered Composition revisions, each render profile becomes a Build on the exact source revision, render outputs become Artifact revisions, render work files remain RunObjects, and ambiguous filename families are present with no selected head plus a review issue.

- [ ] **Step 2: Reconstruct Artifact families using evidence precedence**

Evidence order is manifest/index selection, explicit composition binding, exact Unit provenance, then filename-family heuristic. Hash-identical Unit copies link to the proven source Artifact revision. `.vN`, `-vN`, `rN`, and `final*` candidates without higher evidence remain unselected.

- [ ] **Step 3: Reconstruct flexible Units and distribution history**

Import carousel and sticker order, article body/cover/attachments, captions, per-platform presentation metadata, append-only publish records, Postiz identifiers, URLs, schedule timestamps, and analytics snapshots. Never copy Unit media into a new bucket key when hash/scope proves an existing Object.

- [ ] **Step 4: Mark exact ledger targets**

A source manifest may target dozens of domain rows and decoded Objects; store the sorted stable IDs in `target_refs_json`. Transition only after every referenced row exists in the same transaction.

Apply deterministic observed-root rules: `farm` content becomes Migration RunObjects with parsed known dead-letter JSONL plus raw evidence; `web-videos/<slug>` becomes a default-Workspace physical-only Project; `media-library/library.json` becomes a custom catalog Document plus raw evidence while its cache is reproducible; root `PROFILE.md`/text becomes default-Workspace Documents; `_research` is a normal physical Project; `_fx-probe` is a diagnostic Project with Composition/Build/RunObjects; reference/research/memory roots become shared resources/Documents/Artifacts; old jobs/logs become execution evidence; daemon PID is recovery-only. Any unmatched root remains blocking until a fixture-backed rule exists.

- [ ] **Step 5: Verify and commit production import**

Run: `bun test tests/unit/migration-production.test.ts`

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
- Consumes: Desktop review/settings export, core secret store, stable Artifact/RunObject IDs
- Produces: review/evaluation/feedback rows and write-only `migration.secret.import` bridge operation

- [ ] **Step 1: Write failing review matching tests**

Match a Desktop annotation first by normalized source-relative path and then by verified hash. Assert path collisions become review issues, Approved/Shortlist/Reject/Needs Work map to approved/candidate/rejected/open feedback, and notes/tags/rating/favorite survive as evaluation metadata.

- [ ] **Step 2: Import plaintext legacy credentials directly into the core secret store**

Parse only known credential schemas from the two observed Workspace `credentials.json` files, write values to scoped secret refs keyed by the immutable database `store_id`, store only refs/non-secret account metadata in SQLite, redact issue detail, and classify the source entry as `secret-imported`. Discover secret candidates across every root, including `.ralphy/tmp/ig-cookies.txt`; an unknown candidate blocks until imported or explicitly classified sensitive recovery-only. Never open/read an unknown candidate merely to include its path in audit output.

- [ ] **Step 3: Add a write-only Electron safeStorage handoff**

`migration.secret.import` accepts `{ runId, sourceEntryId, ref, value }` only through stdin/bridge memory, writes through `setSecret`, records only the ref and completion status, and never accepts the value through argv/env or echoes request input. Desktop re-audits and decrypts any current safeStorage blobs under the maintenance lock and calls this method before verification.

Chromium localStorage chat/settings data is exported by Desktop as typed JSON without credential bytes and imported as Agent Session preferences/history Documents where it belongs.

- [ ] **Step 4: Verify redaction**

Search staged SQLite/WAL/SHM, Objects, reports, activity, stdout, stderr, and logs for fixture secrets and assert zero matches. Verify `hasSecret(ref)` remains true after stage-to-live rename. Preserve unmatched Desktop annotations as unbound `needsReview` feedback rather than dropping them. After cutover verify recovery mode 0700 and legacy secret files mode 0600; the report discloses that recovery still contains plaintext credentials. Recovery/keychain cleanup is a separate explicit operation.

Run: `bun test tests/unit/migration-desktop-state.test.ts tests/unit/secret-store.test.ts`

- [ ] **Step 5: Commit Desktop-state migration**

```bash
git add cli/lib/migration/import.ts cli/lib/bridge/methods.ts tests/unit/migration-desktop-state.test.ts
git commit -m "feat(migrate): import desktop reviews and secrets"
```

### Task 7: Implement complete verification with a signed verification ID

**Files:**
- Create: `cli/lib/migration/verify.ts`
- Test: `tests/unit/migration-verify.test.ts`

**Interfaces:**
- Consumes: source inventory, staged DB/buckets, `verifyDomainStore`, secret dispositions, and full source fingerprints
- Produces: `verifyMigration(db, storeRoot, runId): Promise<MigrationVerification>` plus a mode-0600 verification record outside all renamed roots

```ts
export type MigrationVerification = {
  id: string;
  runId: string;
  verifiedAt: number;
  sourceEntries: number;
  coveredEntries: number;
  sourceBytes: number;
  accountedBytes: number;
  blockers: MigrationIssue[];
  digest: string;
};
```

- [ ] **Step 1: Write failing coverage and corruption tests**

One unclassified empty file, one missing Object, one corrupt hash, one absolute live row, one data URL, one broken Build chain, one broken Unit chain, one unimported secret, or one changed source control hash must each block readiness with its exact entry/entity ID.

- [ ] **Step 2: Implement all activation gates**

Require:

- exactly one terminal disposition for every inventory row;
- every source byte accounted to a relocated Object/RunObject, recovery-only source, decoded payload source, cache/system exclusion, or explicit issue;
- unchanged full source entry fingerprints/hashes since inventory;
- hashes for every durable Object;
- `PRAGMA integrity_check = ok` and empty `foreign_key_check`;
- zero rows resolving to missing bytes;
- valid Composition revision -> Build -> output and Unit revision -> item -> Artifact revision chains;
- no data URL, secret, or unresolved absolute path in SQLite;
- every Desktop review and credential source resolved or explicitly environment-owned;
- the migrated pending-job hold count equals source inventory;
- every source path, including deduplicated paths, contributes its logical bytes exactly once.

- [ ] **Step 3: Bind cutover to a fresh digest**

Finish all database writes, mark the Run ready, checkpoint WAL, and close every staged connection. Then hash the closed database plus sorted Object/RunObject content. Write an atomic, fsynced, mode-0600 verification record outside source, stage, and recovery containing Run ID, inventory digest, database digest, sorted content digest, timestamp, and verification ID. Never store the token inside the database it authenticates. Cutover recomputes every digest before the first rename; any mutation requires a new verify call. Two consecutive verifications must have identical content digests even though timestamped verification IDs differ.

- [ ] **Step 4: Verify and commit migration validation**

Run: `bun test tests/unit/migration-verify.test.ts`

```bash
git add cli/lib/migration/verify.ts tests/unit/migration-verify.test.ts
git commit -m "feat(migrate): verify complete library coverage"
```

### Task 8: Expose resumable migration, exact cutover, and rollback commands

**Files:**
- Modify: `cli/lib/migration/service.ts`
- Create: `cli/lib/migration/cutover-journal.ts`
- Modify: `cli/commands/migrate.ts`
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
ralphy migrate audit --source <fixture>
ralphy migrate run --source <fixture>
ralphy migrate status <run-id> --source <fixture>
ralphy migrate resume <run-id> --source <fixture>
ralphy migrate verify <run-id> --source <fixture>
ralphy migrate cutover <run-id> --verification <verification-id> --confirm <run-id> --source <fixture>
ralphy migrate recover <run-id> --confirm <run-id> --source <fixture>
ralphy migrate rollback <run-id> --confirm <run-id> --source <fixture>
```

Assert `run` leaves source untouched, resume continues from the first incomplete phase without duplicate rows, stale verification refuses cutover, successful cutover leaves `.ralphy-recovery-<run-id>`, and injected failure of the second rename restores the original `.ralphy` immediately. Inject crashes before/after every journal write and rename; `recover` must deterministically finish installation or restore recovery without overwriting either generation.

- [ ] **Step 2: Implement phase checkpoints and staged-root binding**

Derive stage root as `<source-parent>/.ralphy-staging/<run-id>` and target database as `<stage-root>/.ralphy/ralphy.db`. Each command receives and opens only that explicit store root/database until cutover. Phase transitions are monotonic and idempotent; `resume` reruns the current phase using ledger state. Normal CLI/Desktop startup checks the external cutover journal before opening SQLite and refuses interrupted states.

- [ ] **Step 3: Implement journaled two-rename cutover and recovery**

Maintain `<source-parent>/.ralphy-migration-<run-id>.journal.json` outside all renamed roots with durable states `prepared`, `source-moved`, `installed`, `rollback-new-moved`, and `rolled-back`. Every transition uses atomic temp write, file fsync, rename, and parent-directory fsync. Record root device/inode identities, not only paths.

After closing/checkpointing staged SQLite:

1. recheck maintenance lock, stopped processes, source identity/digest, and external verification record;
2. persist `prepared`, rename source `.ralphy` to `.ralphy-recovery-<run-id>`, fsync parent, then persist `source-moved`;
3. rename exact staged `.ralphy` to source `.ralphy` and fsync parent;
4. if step 3 fails, immediately restore recovery; if restoration also fails, retain `source-moved` for explicit recovery and never copy/delete;
5. open the new DB, run integrity/foreign-key/domain smoke checks, append cutover activity, checkpoint/close, persist `installed`, and retain recovery.

`recover` identifies actual roots by recorded device/inode and handles a crash after installation but before its journal update. Rollback first renames v2 live to `.ralphy-rollback-new-<run-id>`, then recovery to live; if the second rename fails, restore v2 live. Never overwrite or delete the new v2 generation.

- [ ] **Step 4: Replace the old command surface**

Expose `audit|run|resume|status|verify|cutover|recover|rollback`. Delete the old in-place migrator and its source-consumption test when this command replaces it; no dangerous legacy implementation may remain shipped until live cutover. Remove every `EXDEV` copy/delete path. Add stage/recovery/rollback-new/lock/journal entries to ignores. Regenerate command docs and pretty shapes.

- [ ] **Step 5: Verify and commit orchestration**

Run:

```bash
bun test tests/integration/cli-migrate-sqlite.test.ts
bun run cli:surface:build
bun run lint
```

```bash
git add cli/lib/migration/service.ts cli/lib/migration/cutover-journal.ts cli/commands/migrate.ts cli/index.ts cli/lib/paths.ts .gitignore tests/fixtures/verb-shapes.ts docs/cli-surface.generated.md tests/integration/cli-migrate-sqlite.test.ts
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

Resolve every blocking unknown/malformed/secret/revision issue by adding deterministic migration rules and fixture cases. Re-run from a fresh clone until one pass reaches 100% coverage, clean SQLite checks, zero missing bytes/absolute paths/data URLs, and representative Denti.AI chains.

- [ ] **Step 4: Exercise rehearsal cutover and rollback**

Cut over only the rehearsal clone, launch core CLI and packaged Desktop against it, inspect Denti.AI plus one carousel/sticker/article project, then test rollback. Record elapsed time and maximum additional disk use.

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

Stop all writers, acquire the maintenance lock, re-audit current counts/jobs/Desktop state/secret candidates, confirm forced-clone support/free space, and refuse to reuse the rehearsal verification ID. Retain the previous CLI commit/package and previous Desktop package as part of operational rollback.

- [ ] **Step 2: Migrate and verify the live library without cutover**

Run audit, staged migration, resume as needed, secret handoff, and verification. Require 100% coverage and two consecutive reports with identical content digests before requesting cutover.

- [ ] **Step 3: Cut over and perform representative smoke checks**

Use the exact Run/verification IDs. Exercise CLI reads/writes and packaged Desktop for Denti.AI Composition/Build switching, feedback rounds, a multi-item carousel/sticker Unit, three-platform preview, publications/metrics, Documents, working diagnostics, and activity.

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
