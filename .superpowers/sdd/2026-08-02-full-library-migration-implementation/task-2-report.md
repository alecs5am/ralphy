# Task 2 report: read-only audit, complete inventory, and maintenance locking

## Status

Complete for the Task 2 boundary. The audit is source-neutral, inventory covers every relative source path, source bindings and digests are immutable and replayable, the migration lock includes PID-start identity, and `run`/`resume` use one redacted quiescence/FD/cwd gate around Task 2 mutations.

No live `.ralphy` tree, Desktop state, or sibling repository was read or changed.

## Delivered

- Replaced the destructive top-level legacy migrator with the staged `ralphy migrate {audit|run|resume|status|verify|cutover|recover|rollback}` surface and deleted the old in-place implementation and its obsolete destructive integration suite.
- Kept `auditMigration` strictly read-only: it creates no lock, stage, journal, database, checkpoint, clone probe, or source-local temporary file.
- Counted only regular files as files while retaining a row/count for directories, symlinks, FIFOs, sockets, and other entries.
- Fixed registry reconciliation for the real object-map `projects` shape while retaining array compatibility. The comprehensive fixture reports four physical and four registered Projects, including the exact two physical-only and two registry-only IDs.
- Added zero-write legacy jobs evidence. A WAL-free database image is read into memory and deserialized query-only; audit creates no temporary DB/WAL/SHM files and never opens the source through SQLite. A nonempty jobs WAL is reported as the blocking `MIGRATION_JOBS_WAL_UNMATERIALIZED` issue because Bun serialization omits WAL-only frames and even a readonly source connection changes shared-memory bytes. An absent or zero-byte WAL remains auditable.
- Added copy-space evidence with `max(2 GiB, 10%)` reserve, redacted Desktop settings/review/secret-candidate counts, and redacted process results containing only category, PID, and count.
- Reworked inventory around `fs.promises.opendir`, sorted names, `lstat`, exact-root containment, and no link following. It records full mode, device, inode, regular-file size, mtime, disposition, and control-file hashes while deferring media hashes.
- Populated an immutable digest for each `migration_sources` row and a deterministic aggregate inventory digest. A repeated resume rescans and compares the frozen source identities/digests, returns the same result without duplicate rows, and rejects drift or a changed source set.
- Proved migration state stays on the explicit `MigrationContext` database/store even when cwd and ambient `setRoot()` point at a writable poison tree.
- Added a durable mode-0600 sibling lock with Run ID, source realpath/device/inode, PID, process-start identity, nonce, UID, and timestamp. Every acquire, reclaim, and release is serialized by an atomic mode-0600 sibling guard. Reclaim rereads and revalidates the lock under that guard before unlinking; guard cleanup verifies device/inode identity. Live or uninspectable locks never disappear implicitly; stale locks are reclaimable only by a matching recovery action.
- Rejected symlinked source/ancestor paths, duplicate/nested/aliased source identities, caller-selected stores, broad sources, conflicting derived paths, cross-device stages, and unsupported forced clones. `run` derives `.ralphy-staging/<run-id>/.ralphy` beside the exact `.ralphy` source and probes `COPYFILE_FICLONE_FORCE` only after locking.

## TDD evidence

- Audit RED: the fixture returned 184 “files” instead of 181 regular files and object-map registries returned zero Projects. GREEN: exact fixture entry/file/byte totals, registry drift, jobs/Desktop evidence, and full before/after source snapshots pass.
- Inventory RED: special entries inflated the file total; source digests stayed null; media was eagerly hashed; replay attempted duplicate inserts. GREEN: exact 259-entry/181-file coverage, three source digests, control-only hashes, deterministic replay, and poison-root neutrality pass.
- Lock RED: `processStartIdentity` was absent, symlink aliases were accepted, and no cwd/FD gate existed. GREEN: complete lock identity, explicit stale reclaim, redacted process evidence, and source-cwd refusal pass.
- Service RED: an undefined/caller-selected store was opened and the legacy command remained top-level. GREEN: derived sibling staging, durable lock reuse, forced-clone proof, source-neutral replay, and staged-only command help pass.

## Independent review fix round

- Hard-disabled `verify`, `cutover`, `recover`, and `rollback` until their Task 7-8 activation gates exist. Each entry point now fails before reading or mutating caller paths, including when handed a shallow `ok: true` verification file.
- Made process inspection fail closed. Production resolves only validated absolute `ps`/`lsof` executables; missing tools, nonzero exits, signals, invalid output, and output overflow return `unknown`, and both audit and quiescence treat `unknown` as blocking. PID-start inspection distinguishes present, absent, and unknown, so a probe failure cannot make a lock owner look dead.
- Serialized all lock mutations with the sibling reclaim guard and added under-guard reread/device/inode/full-identity comparison before stale unlink.
- Changed status to derive the stage from the exact source and Run ID. Status and resume require an existing nonsymlink regular `ralphy.db`, validate the Run and immutable stage locator from an in-memory query-only image before any writable open, reject nonempty WAL state, and do not create directories, databases, WAL, SHM, or locks for missing/invalid Runs.
- Removed the jobs audit's OS-temp materialization. A test replaces `mkdtempSync` with a trap while auditing the live-shaped WAL fixture and verifies the complete source/sibling snapshots remain unchanged. Nonempty WAL evidence now fails closed as described above.
- Reclassified symlink/FIFO/socket/other child entries as audit coverage reviews rather than environmental preflight blockers. `run` can therefore create the durable Run and inventory those paths; inventory persists one blocking issue per uncovered entry.
- Made optional registries optional only when absent. An existing non-regular, unreadable, or malformed `registry.json`/`config.json` now produces the blocking `MIGRATION_REGISTRY_UNREADABLE` issue.

## Verification

- `bun test tests/unit/migration-inventory.test.ts tests/unit/errors-catalog.test.ts tests/integration/migration-domain.test.ts`: 38 passed, 0 failed, 841 assertions.
- `bun run lint`: passed TypeScript and all repository lints; the pre-existing `install` skill heading warning remains unchanged.
- `git diff --check`: passed.

## Self-review and remaining concerns

- Task 2 does not perform semantic import, Object staging, freeze, verification-envelope construction, cutover, or recovery-journal redesign. Those remain Tasks 3-7 and this commit is not authorization for a live rehearsal or cutover.
- The shared quiescence scanner is macOS-oriented for this macOS/APFS cutover: it uses `ps` for categorized processes and `lsof` for cwd/open descriptors. It never returns or persists argv or descriptor targets. A non-macOS migration would need an equivalent native process/FD backend before use.
- Task 2 enforces the gate and durable lock in `run` and `resume`, the mutating commands implemented in this task. Verify/cutover/recover/rollback remain unavailable; their later implementations must call the same gate at their pre/post identity boundaries rather than introduce another scanner.
- Jobs status counts are intentionally unavailable while `jobs.db-wal` is nonempty. Audit records a blocker rather than risk incomplete counts, mutate `jobs.db-shm`, create a temporary triplet, or introduce a custom WAL parser in Task 2.
