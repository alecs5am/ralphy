# Resumable Migration Cutover Implementation Plan

> **For agentic workers:** Execute inline with strict red-green TDD. Do not commit until the rolling review and full repository gates are clean.

**Goal:** Complete the one-shot SQLite migration controller, exact Desktop safeStorage authorization, durable cutover/recovery/rollback journal, startup guard, and held-job adapter without touching a live `.ralphy`, a sibling repository, Farm, or release delivery.

**Architecture:** Reuse the existing migration inventory/import/staging/freeze helpers behind one monotonic service controller. Keep filesystem mutation in a hash-bound external journal that derives every generation path from the inventoried source and Run ID. Put the Desktop handoff capability in one small migration authorization module and enforce it again at the actual `migration.secret.import` bridge boundary.

**Tech Stack:** Bun, TypeScript, `bun:sqlite`, Node filesystem/crypto/process primitives, Commander, existing domain-store and migration helpers.

## Global Constraints

- No public package, GitHub, npm, Homebrew, updater, release, Farm, or Desktop sibling changes.
- Never read or write the user's live `.ralphy`; all tests use isolated fixtures.
- No dependency, sibling TypeScript import, caller-selected stage/recovery/rollback/journal path, copy/delete/overwrite, or `EXDEV` fallback.
- Every secret handoff binds the exact controller/helper/bridge process identities, lock nonce, staged-root device/inode, entry/provider/ref, and is mode 0600 plus single-use.
- The pipeline order is inventory → scopes → stage → jobs → late stage → production → Desktop/non-safeStorage → authorized safeStorage → final late stage, with no backward phase transition.
- The first verification freezes exactly once; later verification is read-only. Freshness is exact identity/version/source/status/digest binding with no TTL.
- Frozen bytes remain immutable until installed smoke succeeds; reconciliation is one nonce-keyed transaction followed by checkpoint, read-only verification, and external installed digest persistence.

---

### Task 1: Public controller RED fixtures

**Files:**
- Create: `tests/integration/cli-migrate-sqlite.test.ts`
- Modify: `tests/integration/migration-domain.test.ts`

**Interfaces:**
- Consumes: existing CLI binary at `cli/index.ts` and isolated fixture roots.
- Produces: observable CLI requirements for audit/run/resume/status/verify/cutover/recover/rollback.

- [ ] Write CLI tests proving `audit` is write-neutral, `run` reaches the complete pre-freeze phase without source mutation, and `resume` is idempotent.
- [ ] Assert the source-derived stage path literal `.ralphy-staging/<run-id>/.ralphy`, sibling recovery `.ralphy-recovery-<run-id>`, rollback-new `.ralphy-rollback-new-<run-id>`, and derived journal name.
- [ ] Add the freeze-on-first-verify/read-only-later-verify test with distinct verification IDs but identical freeze/database/content/inventory facts.
- [ ] Run `bun test tests/integration/cli-migrate-sqlite.test.ts` and record the expected failures from the incomplete controller and command surface.

### Task 2: Monotonic resumable phase controller

**Files:**
- Modify: `cli/lib/migration/service.ts`
- Modify: `cli/lib/migration/staging.ts`
- Modify: `cli/lib/migration/inventory.ts`
- Modify: `cli/lib/migration/import.ts`

**Interfaces:**
- Consumes: `inventoryLegacySource`, `importScopesAndDocuments`, `stageInventoryObjects`, `importExecutionAndOperations`, `importProductionAndDelivery`, `importDesktopStateAndSecrets`, `freezeMigration`, and `verifyMigration`.
- Produces: `resumeMigration(input): Promise<MigrationResumeResult>` and `verifyOrFreezeMigration(input): Promise<MigrationVerification>`.

- [ ] Make `stageInventoryObjects` phase-monotonic: it may run in later import phases but updates `migration_runs.phase` to `objects` only when the current phase precedes `objects`.
- [ ] Add one explicit `MigrationContext` and execute the required ordered idempotent pipeline, checking the exact lock/quiescence before and after every mutating phase.
- [ ] Preserve optional-source identities from `migration_sources`; later commands reject omission, addition, reorder, kind/label drift, inode replacement, and version drift.
- [ ] Keep non-safeStorage imports inside Core; expose only exact pending Desktop handoff facts for safeStorage entries.
- [ ] Close/checkpoint before first freeze. Dispatch first verify to `freezeMigration` plus read-only verification and all later verifies only to `verifyMigration`.
- [ ] Run the focused migration controller tests to GREEN without weakening existing Task 1–7 tests.

### Task 3: One-shot Desktop authorization RED and implementation

**Files:**
- Create: `cli/lib/migration/desktop-authorization.ts`
- Create: `tests/unit/migration-cutover.test.ts`
- Modify: `cli/lib/bridge/methods.ts`
- Modify: `cli/lib/migration/service.ts`

**Interfaces:**
- Produces: `createDesktopHandoffAuthorization`, `consumeDesktopHandoffAuthorization`, `runDesktopSecretHandoff`, and `DesktopSecretHandoffRequest`.
- Authorization record fields: `version`, `runId`, `lockNonce`, controller/helper/bridge PID plus process-start identities, staged-root ID/device/inode, `sourceEntryId`, `provider`, `ref`, `state`, and `createdAt`; never a secret value.

- [ ] Write RED tests for wrong/reused nonce, PID reuse, helper/controller and bridge/helper parent mismatch, staged-root replacement, entry/provider/ref mismatch, concurrent consume, dead process, wrong mode/owner, extra output, timeout, nonzero exit, and replay.
- [ ] Implement canonical same-directory exclusive mode-0600 authorization writes, fsync/rename/parent-fsync, exact process ancestry inspection, atomic single-use transition, and bounded terminalization/reclaim.
- [ ] Change `migration.secret.import` to require and consume the authorization before inspecting or storing secret material; bind `provider` derived from `ref` and the exact current bridge process.
- [ ] Spawn only an explicitly supplied packaged Desktop executable, pass metadata on stdin, use a scrubbed child environment, capture no secret output, reject any stdout/stderr, and zero request buffers in `finally`.
- [ ] Invoke the packaged Desktop with exact argv `[desktopExecutable, "--migration-secret-handoff"]`. Desktop must select this one-shot mode before normal app initialization, open no windows or watchers, consume exactly one newline-terminated `DesktopSecretHandoffRequest` JSON object from stdin, emit nothing on stdout/stderr, and exit within the controller timeout. Secret values and encrypted-source paths never appear in argv, environment, stdin metadata, stdout, or stderr.
- [ ] Run the focused unit and bridge tests to GREEN.

### Task 4: Durable journal and crash matrix

**Files:**
- Replace: `cli/lib/migration/cutover-journal.ts`
- Modify: `cli/lib/migration/service.ts`
- Modify: `tests/unit/migration-cutover.test.ts`
- Modify: `tests/integration/cli-migrate-sqlite.test.ts`

**Interfaces:**
- Produces: derived `migrationCutoverPaths`, `createCutoverJournal`, `executeCutover`, `recoverCutover`, `rollbackCutover`, `assertStartupJournalReady`, and `reconcileInstalledMigration`.
- Journal states are monotonic crash states covering prepared, source moved, recovery durable, installed moved, smoke passed, installed, rollback-new moved, and rolled back.

- [ ] Write a table-driven RED crash matrix around temp create/write, file fsync, journal rename, parent fsync, source rename, recovery chmod/fsync, install rename, restoration rename, installed smoke, rollback first rename, and rollback restore rename.
- [ ] Validate the complete canonical journal envelope: run/verification/nonce/state/transition, all derived path and filesystem identities, non-mutating source identities, versions, database/content/inventory digests, original mode, timestamps, and `consumers.farm: null`.
- [ ] Implement pinned no-symlink directory operations with exclusive temp files, file fsync, atomic rename, and parent fsync; never overwrite, copy, delete, or fall back across devices.
- [ ] Acquire a journal-identity maintenance lock beside the absent live name for recover/rollback and release only the unchanged owned lock.
- [ ] Keep the frozen generation byte-identical through renames and read-only smoke; then reconcile `cutover_at` and one nonce-keyed Activity in exactly one transaction, checkpoint, reverify, and persist the installed digest externally.
- [ ] Make recover/rollback deterministic from journal identity and preserve both generations on every failed restoration.
- [ ] Run crash, cutover, recovery, rollback, and Task 7 freeze tests to GREEN.

### Task 5: Startup, CLI, queue, and generated surface

**Files:**
- Modify: `cli/commands/migrate.ts`
- Modify: `cli/commands/queue.ts`
- Modify: `cli/index.ts`
- Modify: `cli/lib/paths.ts`
- Modify: `.gitignore`
- Modify: `tests/fixtures/verb-shapes.ts`
- Modify: `docs/cli-surface.generated.md`

**Interfaces:**
- Public migrate commands: `audit|run|resume|status|verify|cutover|recover|rollback` and the smallest explicit local Desktop handoff option.
- Public queue adapter: `queue resume <id> --migration-run <run-id>` delegates only to `resumeHeldJob`.

- [ ] Add RED CLI tests rejecting caller-selected stage/journal/generation paths, bad confirmation, stale verification, unsafe journal state, and ordinary startup before SQLite open.
- [ ] Derive all paths from `--source` and `--run-id`; recover/rollback accept the source, not a journal path.
- [ ] Call `assertStartupJournalReady` before normal CLI and bridge SQLite startup; only reconciled installed/rolled-back journals pass.
- [ ] Keep retry and bulk retry from mutating held jobs, reject an entire external-Run retry request before mutation, and preserve single-job resume behavior.
- [ ] Add exact ignore patterns, update verb shapes, run `bun run cli:surface:build`, and verify no retired migrator/EXDEV fallback remains.

### Task 6: Review, gates, report, and final commit

**Files:**
- Create: `.superpowers/sdd/2026-08-02-full-library-migration-implementation/task-8-report.md` (ignored)

- [ ] Run focused migration, authorization, journal, bridge, queue, and domain verification suites.
- [ ] Run `bun run lint`, `bunx tsc --noEmit`, `git diff --check`, English-only scan, CLI surface check, and the full ordinary commit hook.
- [ ] Self-review every brief requirement and run rolling independent review; resolve findings through new RED tests.
- [ ] Stage only Task 8 files, run `gitleaks protect --staged --redact --no-banner`, and commit `feat(migrate): add resumable verified cutover` without bypassing hooks.
- [ ] Record exact RED/GREEN evidence, crash coverage, authorization contract, validation totals, commit hash, and deferred concerns in the ignored report.
