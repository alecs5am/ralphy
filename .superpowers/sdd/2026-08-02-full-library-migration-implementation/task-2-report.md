# Task 2 report: read-only audit, complete inventory, and maintenance locking

## Status

Complete for the Task 2 boundary. The audit is source-neutral, inventory covers every relative source path, source bindings and digests are immutable and replayable, the migration lock includes PID-start identity, and `run`/`resume` use one redacted quiescence/FD/cwd gate around Task 2 mutations.

No live `.ralphy` tree, Desktop state, or sibling repository was read or changed.

## Delivered

- Replaced the destructive top-level legacy migrator with the staged `ralphy migrate {audit|run|resume|status|verify|cutover|recover|rollback}` surface and deleted the old in-place implementation and its obsolete destructive integration suite.
- Kept `auditMigration` strictly read-only: it creates no lock, stage, journal, database, checkpoint, clone probe, or source-local temporary file.
- Counted only regular files as files while retaining a row/count for directories, symlinks, FIFOs, sockets, and other entries.
- Fixed registry reconciliation for the real object-map `projects` shape while retaining array compatibility. The comprehensive fixture reports four physical and four registered Projects, including the exact two physical-only and two registry-only IDs.
- Added legacy jobs status evidence without opening the source database. Audit copies the existing DB/WAL/SHM triplet to a disposable OS-temp directory with ordinary byte copies, opens only that copy query-only, compares source size/mtime/digest fingerprints before and after, and removes the temporary directory in `finally`. This preserves source DB/WAL/SHM bytes and metadata and also handles an initially absent SHM safely.
- Added copy-space evidence with `max(2 GiB, 10%)` reserve, redacted Desktop settings/review/secret-candidate counts, and redacted process results containing only category, PID, and count.
- Reworked inventory around `fs.promises.opendir`, sorted names, `lstat`, exact-root containment, and no link following. It records full mode, device, inode, regular-file size, mtime, disposition, and control-file hashes while deferring media hashes.
- Populated an immutable digest for each `migration_sources` row and a deterministic aggregate inventory digest. A repeated resume rescans and compares the frozen source identities/digests, returns the same result without duplicate rows, and rejects drift or a changed source set.
- Proved migration state stays on the explicit `MigrationContext` database/store even when cwd and ambient `setRoot()` point at a writable poison tree.
- Added a durable mode-0600 sibling lock with Run ID, source realpath/device/inode, PID, process-start identity, nonce, UID, and timestamp. Release compares the complete identity. Live locks never disappear implicitly; stale locks are reclaimable only by a matching `resume`, `recover`, or `rollback` action.
- Rejected symlinked source/ancestor paths, duplicate/nested/aliased source identities, caller-selected stores, broad sources, conflicting derived paths, cross-device stages, and unsupported forced clones. `run` derives `.ralphy-staging/<run-id>/.ralphy` beside the exact `.ralphy` source and probes `COPYFILE_FICLONE_FORCE` only after locking.

## TDD evidence

- Audit RED: the fixture returned 184 “files” instead of 181 regular files and object-map registries returned zero Projects. GREEN: exact fixture entry/file/byte totals, registry drift, jobs/Desktop evidence, and full before/after source snapshots pass.
- Inventory RED: special entries inflated the file total; source digests stayed null; media was eagerly hashed; replay attempted duplicate inserts. GREEN: exact 259-entry/181-file coverage, three source digests, control-only hashes, deterministic replay, and poison-root neutrality pass.
- Lock RED: `processStartIdentity` was absent, symlink aliases were accepted, and no cwd/FD gate existed. GREEN: complete lock identity, explicit stale reclaim, redacted process evidence, and source-cwd refusal pass.
- Service RED: an undefined/caller-selected store was opened and the legacy command remained top-level. GREEN: derived sibling staging, durable lock reuse, forced-clone proof, source-neutral replay, and staged-only command help pass.

## Verification

- `bun test tests/unit/migration-inventory.test.ts tests/unit/errors-catalog.test.ts tests/integration/migration-domain.test.ts`: 30 passed, 0 failed, 817 assertions.
- `bun run lint`: passed TypeScript and all repository lints; the pre-existing `install` skill heading warning remains unchanged.
- `git diff --check`: passed.

## Self-review and remaining concerns

- Task 2 does not perform semantic import, Object staging, freeze, verification-envelope construction, cutover, or recovery-journal redesign. Those remain Tasks 3-7 and this commit is not authorization for a live rehearsal or cutover.
- The shared quiescence scanner is macOS-oriented for this macOS/APFS cutover: it uses `ps` for categorized processes and `lsof` for cwd/open descriptors. It never returns or persists argv or descriptor targets. A non-macOS migration would need an equivalent native process/FD backend before use.
- Task 2 enforces the gate and durable lock in `run` and `resume`, the mutating commands implemented in this task. Later verify/cutover/recover/rollback phase implementations must call the same exported gate at their pre/post identity boundaries rather than introduce another scanner.
- Audit intentionally uses a disposable ordinary copy for querying jobs evidence; it does not use `COPYFILE_FICLONE_FORCE`, probe clone support, or write below any source/stage parent.
