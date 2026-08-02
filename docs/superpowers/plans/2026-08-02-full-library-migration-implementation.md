# Full Library Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import, physically relocate, verify, and cut over the user's complete legacy `.ralphy` library and Desktop-owned state into the SQLite domain store with 100% source-path coverage and a recoverable rollback point.

**Architecture:** Migration builds a sibling staged Ralphy root while the source remains untouched. On APFS every source Object is copy-on-write cloned into staged temp storage, promoted through the normal Object API, and journaled; after semantic and byte-level verification, two exact renames atomically exchange the legacy source for the staged root while retaining the old root as recovery.

**Tech Stack:** Bun, TypeScript, `bun:sqlite`, Node filesystem/crypto APIs, APFS clone via `COPYFILE_FICLONE_FORCE`, macOS Keychain, Zod, `bun:test`

## Global Constraints

- Complete the core-domain-store and entity-CLI/bridge plans before running this plan.
- The observed source is approximately 66 GB with 24,624 regular files, 30 Workspaces, 160 physical Projects, 146 registry Projects, and only about 18 GB free; a second byte-for-byte copy is not viable.
- `migrate audit` is strictly read-only, `migrate run` never cuts over, and cutover requires the exact Run ID plus a fresh verification ID.
- Stop Desktop, daemon, watchers, generation, render, publish, and agent processes before staging or cutover.
- Never follow symlinks during inventory. Every file, directory, empty entry, symlink, socket, and unknown entry receives exactly one ledger row and disposition.
- Never mutate or delete the source before verified cutover.
- Use APFS copy-on-write clone when full-copy free-space requirements are not met; if clone support is absent and space is insufficient, stop with a migration issue.
- Malformed JSONL creates one issue for the exact line and does not discard valid sibling lines.
- Import every ambiguous revision candidate but do not choose a head without manifest/index evidence.
- Plaintext credentials and Electron `safeStorage` blobs never enter SQLite or logs. Cutover blocks until each secret source has a core secret reference or an explicit environment-owned disposition.
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
- Consumes: schema version 2 from the entity-CLI plan and `newDomainId()`
- Produces: schema migration 3, migration row types, and `buildLegacyLibrary(root): LegacyFixture`

- [ ] **Step 1: Write the failing migration-schema test**

```ts
const db = openDomainDb();
expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 3 });
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
  bytes, mtime_ms, sha256, target_path, target_refs_json,
  state, error_code, created_at, updated_at,
  UNIQUE(migration_run_id, source_root_kind, source_path)
)

migration_issues(
  id PRIMARY KEY, migration_run_id REFERENCES migration_runs,
  migration_entry_id REFERENCES migration_entries, code, severity,
  line_no, detail_json, resolved_at, created_at
)
```

Constrain phases to `audited|inventory|import|objects|relations|verify|ready|cutover|rolled-back|failed`, entry states to `inventoried|imported|staged|verified|excluded|issue`, and issue severity to `info|review|block`.

- [ ] **Step 3: Add migration error codes without repurposing existing codes**

Add `E_MIGRATION_LOCKED`, `E_MIGRATION_SPACE`, `E_MIGRATION_COVERAGE`, `E_MIGRATION_VERIFY`, and `E_MIGRATION_CUTOVER` to the append-only catalog and keep the budget `< 56`.

- [ ] **Step 4: Build one deterministic comprehensive fixture**

`buildLegacyLibrary` creates both pre-#106 `workspace/.ralph` and current `.ralphy/workspaces` layouts containing:

- one registered, one physical-only, and one registry-only Project;
- Denti-like R2/R3 feedback, multiple HTML composition versions, two render profiles, and `render/work-*` diagnostics;
- an absolute-path asset manifest with one data URL;
- JSONL with valid lines surrounding one malformed line;
- an eight-image carousel, 32-item sticker pack, article, Workspace Unit, and duplicate Unit media;
- publish ledger, analytics, evaluations, stage state, jobs DB/logs/WAL, cache/temp, empty files/directories, one unknown file, plaintext credential fixture, Desktop review fixture, and ambiguous `.vN`/`-vN`/`rN`/`final*` names.

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
  cloneSupported: boolean;
  freeBytes: number;
  blockers: MigrationIssue[];
};
```

- [ ] **Step 1: Write failing inventory coverage tests**

Assert the fixture's exact entry/file/byte totals equal the summary and ledger count, empty directories have rows, unknown files receive `disposition = 'issue'`, and `auditMigration` leaves source mtimes/hashes unchanged and creates no staging directory.

- [ ] **Step 2: Implement `lstat` traversal without following links**

Use `fs.promises.opendir`, sort child names for deterministic order, and insert one `migration_entries` row per relative path including directories. Hash control files during inventory and defer large media hashes until staging. Reject source paths that escape the exact resolved root.

- [ ] **Step 3: Implement preflight evidence**

Audit:

- compares registry Project IDs against physical Project directories;
- checkpoints/reads legacy jobs DB and reports pending/running counts;
- detects packaged Desktop, daemon PID, and known watcher processes;
- probes APFS clone support with two small temporary files under the staging parent;
- computes required copy bytes plus a 10%/2 GiB safety margin;
- inventories Desktop settings/review/secret candidates supplied through `desktopDataRoot`;
- records all blockers without changing source.

- [ ] **Step 4: Add the exact maintenance lock**

Create `<source-parent>/.ralphy-migration.lock` with `open("wx", 0o600)` containing Run ID, PID, source realpath, and start time. Refuse a live PID; a stale lock requires `migrate resume` or explicit rollback, never silent deletion.

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
- the malformed line creates one issue with `line_no` and raw-line hash;
- 22-like physical-only Projects are imported as `needs_review` rather than dropped;
- registry-only Projects become blocking missing-source issues;
- Markdown/JSON control content becomes typed immutable Document revisions;
- absolute paths are normalized to source-relative evidence and never copied into live rows.

- [ ] **Step 2: Keep every legacy parser inside one module**

`legacy.ts` may read registry/config/workspace manifests, asset manifests, Units, composition indexes, JSONL, old jobs SQLite, and known Markdown filenames. It returns typed records plus parse issues; it never writes source and never appears in normal command imports.

Read JSONL with `readline`; catch per line, not per file. Decode no data URLs in this task—emit a classified binary candidate consumed by Task 4.

- [ ] **Step 3: Import scope and text rows with ledger transitions**

Create stable ID maps in migration target refs. Import Workspaces/Projects, Iterations inferred from feedback rounds, feedback, Documents/revisions/bindings, Workspace resources, memory, research, evaluator/stage state, settings, campaigns, and calendar state. Each semantic insert and its entry transition to `imported` share one SQLite transaction.

- [ ] **Step 4: Import old jobs and logs**

Checkpoint the source jobs WAL read-only, copy job/log/artifact rows into staged `ralphy.db`, create Runs for historical jobs, preserve original numeric job IDs in metadata, and resolve project ownership through the ID map. Missing Project links become review issues.

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
- Consumes: `prepareObject`, `registerPreparedObject`, APFS clone, staged root, and migration ledger
- Produces: `stageInventoryObjects(db, runId): Promise<StageSummary>`

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

export async function prepareObject(input: ObjectIngestInput & { transfer: "copy" | "move" }): Promise<PreparedObject>;
export function registerPreparedObject(db: Database, prepared: PreparedObject): ObjectRow;
export async function ingestObject(input: ObjectIngestInput & { transfer?: "copy" | "move" }): Promise<ObjectRow>;
```

`prepareObject` completes bytes before any DB transaction. `registerPreparedObject` performs only the row insert. `ingestObject` is the normal convenience path and defaults to `copy`; generated Run temp callers explicitly pass `move`.

- [ ] **Step 2: Write failing APFS clone and resume tests**

Assert source hashes/mtimes remain unchanged, staged files share clone behavior when supported, decoded data URLs become ordinary Objects, a crash after `prepareObject` but before ledger commit resumes without a duplicate live row, and insufficient non-clone free space blocks before copying.

- [ ] **Step 3: Implement clone to staged temp, then normal promotion**

For every durable/working/diagnostic candidate:

1. clone source to staged `.ralphy/tmp/migration/<entry-id>` using `copyFile(..., COPYFILE_FICLONE_FORCE)`;
2. if clone is unsupported, use ordinary copy only when preflight proved sufficient free space;
3. call `prepareObject({ transfer: "move" })` against the staged root;
4. inside one `withImmediateTransaction`, call `registerPreparedObject` and mark the ledger entry `staged` with Object target refs;
5. verify staged hash before marking `verified`.

Decode data URLs directly into staged temp, record their manifest entry plus generated Object refs, and never materialize base64 in SQLite.

- [ ] **Step 4: Classify RunObjects, cache, empty, and unknown entries**

Render work frames/probes/logs become RunObjects with diagnostic/cache/temp retention metadata. Reproducible cache stays below staged `.ralphy/cache/` with explicit ledger target. Empty directories receive `system-empty` disposition. Unknown files block verification until assigned Object/RunObject/system exclusion by a reviewed rule.

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

Parse only known credential schemas from the two observed Workspace `credentials.json` files, write values to scoped secret refs, store only refs/non-secret account metadata in SQLite, redact issue detail, and classify the source entry as `secret-imported`.

- [ ] **Step 3: Add a write-only Electron safeStorage handoff**

`migration.secret.import` accepts `{ runId, sourceEntryId, ref, value }`, writes through `setSecret`, records only the ref and completion status, and never echoes `value`. Desktop decrypts its own `claude-api-key.bin`/`openrouter-api-key.bin` in the Desktop implementation plan and calls this method before verification.

Chromium localStorage chat/settings data is exported by Desktop as typed JSON without credential bytes and imported as Agent Session preferences/history Documents where it belongs.

- [ ] **Step 4: Verify redaction**

Search staged SQLite text columns, migration reports, activity, stdout, and stderr for fixture secrets and assert zero matches. Verify `hasSecret(ref)` is true.

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
- Consumes: source inventory, staged DB/buckets, `verifyDomainStore`, secret dispositions, and source control hashes
- Produces: `verifyMigration(db, runId): Promise<MigrationVerification>`

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
- unchanged source counts/control hashes since inventory;
- hashes for every durable Object;
- `PRAGMA integrity_check = ok` and empty `foreign_key_check`;
- zero rows resolving to missing bytes;
- valid Composition revision -> Build -> output and Unit revision -> item -> Artifact revision chains;
- no data URL, secret, or unresolved absolute path in SQLite;
- every Desktop review and credential source resolved or explicitly environment-owned.

- [ ] **Step 3: Bind cutover to a fresh digest**

Compute the verification ID from Run ID, inventory digest, staged DB hash, sorted Object hash digest, and verification timestamp. Store it with `verified_at`. Any later ledger/object/DB mutation invalidates it and requires a new verify call.

- [ ] **Step 4: Verify and commit migration validation**

Run: `bun test tests/unit/migration-verify.test.ts`

```bash
git add cli/lib/migration/verify.ts tests/unit/migration-verify.test.ts
git commit -m "feat(migrate): verify complete library coverage"
```

### Task 8: Expose resumable migration, exact cutover, and rollback commands

**Files:**
- Modify: `cli/lib/migration/service.ts`
- Modify: `cli/commands/migrate.ts`
- Modify: `cli/index.ts`
- Modify: `.gitignore`
- Modify: `tests/fixtures/verb-shapes.ts`
- Modify: `docs/cli-surface.generated.md`
- Test: `tests/integration/cli-migrate-sqlite.test.ts`

**Interfaces:**
- Produces: `startMigration`, `resumeMigration`, `cutoverMigration`, `rollbackCutover`, and the complete `ralphy migrate` command tree

- [ ] **Step 1: Write the failing CLI resume/cutover test**

```text
ralphy migrate audit --source <fixture>
ralphy migrate run --source <fixture>
ralphy migrate status <run-id> --source <fixture>
ralphy migrate resume <run-id> --source <fixture>
ralphy migrate verify <run-id> --source <fixture>
ralphy migrate cutover <run-id> --verification <verification-id> --confirm <run-id> --source <fixture>
ralphy migrate rollback <run-id> --confirm <run-id> --source <fixture>
```

Assert `run` leaves source untouched, resume continues from the first incomplete phase without duplicate rows, stale verification refuses cutover, successful cutover leaves `.ralphy-recovery-<run-id>`, and injected failure of the second rename restores the original `.ralphy` immediately.

- [ ] **Step 2: Implement phase checkpoints and staged-root binding**

Derive stage root as `<source-parent>/.ralphy-staging/<run-id>` and target database as `<stage-root>/.ralphy/ralphy.db`. Each command opens only that DB until cutover. Phase transitions are monotonic and idempotent; `resume` reruns the current phase using ledger state.

- [ ] **Step 3: Implement exact two-rename cutover**

After closing/checkpointing staged SQLite:

1. recheck maintenance lock, stopped processes, source inventory digest, and verification ID;
2. rename exact source `.ralphy` to `.ralphy-recovery-<run-id>`;
3. rename exact staged `.ralphy` to source `.ralphy`;
4. if step 3 fails, rename recovery back before returning `E_MIGRATION_CUTOVER`;
5. open the new DB, run integrity/foreign-key/domain smoke checks, append cutover activity, and retain recovery.

- [ ] **Step 4: Replace the old command surface**

Expose `audit|run|resume|status|verify|cutover|rollback`. Remove in-place `EXDEV` copy/delete behavior. Add `.ralphy-staging/`, `.ralphy-recovery-*/`, and `.ralphy-migration.lock` ignore entries. Regenerate command docs and pretty shapes.

- [ ] **Step 5: Verify and commit orchestration**

Run:

```bash
bun test tests/integration/cli-migrate-sqlite.test.ts
bun run cli:surface:build
bun run lint
```

```bash
git add cli/lib/migration/service.ts cli/commands/migrate.ts cli/index.ts .gitignore tests/fixtures/verb-shapes.ts docs/cli-surface.generated.md tests/integration/cli-migrate-sqlite.test.ts
git commit -m "feat(migrate): add resumable verified cutover"
```

### Task 9: Rehearse against an APFS clone of the real library

**Files:**
- Create: `docs/migration-rehearsal-2026-08.md`

**Interfaces:**
- Consumes: the live source only through a recoverable APFS clone and all Task 1-8 tools
- Produces: a redacted rehearsal report with exact counts, bytes, issues, duration, and resolved classification rules

- [ ] **Step 1: Stop writers and capture the preflight snapshot**

Confirm packaged Desktop, Nightmaker watcher, daemon, and all Ralphy jobs/processes are stopped. Record `procs`, free space, jobs counts, source entry/file/byte counts, registry/physical Project drift, and control-file hashes in the report without credentials or absolute user secrets.

- [ ] **Step 2: Create a recoverable APFS clone, never a live apply**

Clone the exact `.ralphy` tree into a scoped rehearsal source on the same APFS volume. Prove source/rehearsal counts and sampled hashes match before invoking migration.

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
- Delete: `cli/lib/migrate.ts`
- Delete: `tests/integration/cli-migrate-106.test.ts`
- Modify: `cli/lib/paths.ts`
- Modify: `scripts/lint-no-legacy-state.ts`
- Modify: `docs/domain-store.md`

**Interfaces:**
- Consumes: a successful real-library rehearsal, released v2-aware core, and packaged v2-aware Desktop
- Produces: one live SQLite/bucket library, one retained recovery root, and no normal legacy fallback

- [ ] **Step 1: Re-run live preflight and obtain a fresh source digest**

Stop all writers, acquire the maintenance lock, confirm APFS/free space and current counts, and refuse to reuse the rehearsal verification ID.

- [ ] **Step 2: Migrate and verify the live library without cutover**

Run audit, staged migration, resume as needed, secret handoff, and verification. Require 100% coverage and two identical consecutive verification reports before requesting cutover.

- [ ] **Step 3: Cut over and perform representative smoke checks**

Use the exact Run/verification IDs. Exercise CLI reads/writes and packaged Desktop for Denti.AI Composition/Build switching, feedback rounds, a multi-item carousel/sticker Unit, three-platform preview, publications/metrics, Documents, working diagnostics, and activity.

- [ ] **Step 4: Remove migration-era normal fallbacks**

Delete the old in-place migrator and its test, remove legacy layout fallback from normal paths, and strengthen `lint:no-legacy-state` so only `cli/lib/migration/legacy.ts` may name legacy control files. Keep the new migration reader for recovery/import tooling, not runtime reads.

- [ ] **Step 5: Run final gates and commit runtime retirement**

```bash
bun run lint:no-legacy-state
bun run lint
bun test tests/unit/
bun test tests/integration/
gitleaks protect --staged --redact
git add cli/lib/paths.ts scripts/lint-no-legacy-state.ts docs/domain-store.md
git add -u cli/lib/migrate.ts tests/integration/cli-migrate-106.test.ts
git commit -m "refactor(core): retire legacy filesystem state"
```

Keep `.ralphy-recovery-<run-id>` untouched until the user separately requests verified deletion.
