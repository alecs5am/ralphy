# Denti AI And Nightmaker Manual Recovery Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Manually make the complete Denti AI and Nightmaker workspaces usable in the reviewed Desktop app without building another migration framework or touching other historical workspaces.

**Architecture:** Two workspace agents prepare exact evidence independently, then apply small Project-scoped SQLite transactions sequentially while the app is stopped. A third agent owns backup and independent read-only verification; all one-off material lives under the live `.ralphy` recovery/maintenance tree, never in a repository.

**Tech Stack:** Existing schema-v6 SQLite database, existing Core migration classifiers/stable-ID/manifest helpers invoked directly from the worktree, SQLite integrity/FK queries, packaged Electron app.

## Global Constraints

- This plan starts only after the Core and Desktop implementation plans pass review, build, and isolated package smoke.
- Authorized Workspace IDs are exactly:
  - Denti AI `ws_0f2fd33c-bfc6-4a75-83b4-2e1966aafe9f`
  - Nightmaker `ws_65e3b770-7fa7-4532-87e8-f7c4ff02e0c1`
- Do not add or modify product source, tests, migrations, CLI commands, package files, commits, or releases.
- Do not run the exhaustive `buildLiveRepairPlan`; its global baseline and cardinalities are out of scope.
- Do not scan or mutate another Workspace below its top-level identity/count digest.
- Do not delete a historical file or ambiguous row. Exact `.DS_Store` ghosts remain UI-filtered.
- The app and Core processes remain stopped for every database write.
- Create and verify a fresh schema-v6 backup before the first write; preserve it under `.ralphy/recovery`.
- All scratch evidence, exact SQL transcript, hashes, reports, and screenshots live under `.ralphy/maintenance/manual-denti-nightmaker-20260810-v1`.
- Denti and Nightmaker preparation may run in parallel; SQLite writes run sequentially.
- Use one transaction per Project. Any unexpected preimage, trigger failure, missing file, mismatch, or partial state stops that Workspace without retry.
- Never use `INSERT OR IGNORE`, `INSERT OR REPLACE`, inferred latest rows, filename resemblance, mtime, or arbitrary byte-only generation matching.
- Only the exact 67 source→output bindings with canonical locator, bytes, ArtifactRevision triple, and Project scope become generation chains.
- The 40 non-exact generation candidates remain ordinary media.

---

### Task 1: Freeze, back up, and capture immutable preimages

**Files:**
- Create outside Git: `/Users/maximovchinnikov/github/ralphy/ralphy/.ralphy/maintenance/manual-denti-nightmaker-20260810-v1/preflight.md`
- Create outside Git: `/Users/maximovchinnikov/github/ralphy/ralphy/.ralphy/recovery/manual-denti-nightmaker-20260810-v1/ralphy-v6-before-manual-recovery.db`
- Create outside Git: `/Users/maximovchinnikov/github/ralphy/ralphy/.ralphy/recovery/manual-denti-nightmaker-20260810-v1/manifest.json`

**Interfaces:**
- Consumes: reviewed packaged app/Core, live `.ralphy/ralphy.db`, both exact Workspace IDs.
- Produces: verified backup, live DB identity, maintenance directory, and target/non-target preimage digests.

- [ ] **Step 1: Create the run directories without a repository file**

Use the exact run ID `manual-denti-nightmaker-20260810-v1` and record the absolute maintenance/recovery paths in `preflight.md`. If either run directory already exists, stop rather than reuse it. Reject symlinked path components and require mode 0700 on both run directories.

- [ ] **Step 2: Stop application processes and prove the writer is absent**

Quit `/Applications/Ralphy Media.app`, close the development Electron app, and confirm no process has the live DB/WAL/SHM open. Record process-name/PID evidence only; never record environment variables or credentials.

- [ ] **Step 3: Capture exact live identity and health**

Record canonical path, device, inode, size, mode, `PRAGMA user_version`, full `schema_migrations`, `PRAGMA integrity_check`, and `PRAGMA foreign_key_check`. Require user_version 6, integrity `ok`, and zero FK rows.

Capture literal counts/digests for all tables and a separate digest of every non-target Workspace row. Capture the two target Workspace rows, every target Project row, selected Artifact/Unit pointers, current Document bindings, all migration entry target-ref bytes, and current supplemental-ref count before writing.

- [ ] **Step 4: Create and verify the backup**

Open the source read-only and use SQLite `VACUUM INTO` to the exact recovery path. Set the backup file mode to 0600. Record SHA-256, bytes, device/inode, integrity, FK, schema history, target rows, and non-target digest in `manifest.json`; verify the backup reproduces every captured preimage.

- [ ] **Step 5: Revalidate immediately before handing off**

Re-read live device/inode, data version, target preimages, schema, and process evidence. If any value changed after backup, abandon this run and create a new backup/run ID.

### Task 2: Manually recover Denti AI

**Files:**
- Create outside Git: `/Users/maximovchinnikov/github/ralphy/ralphy/.ralphy/maintenance/manual-denti-nightmaker-20260810-v1/denti-evidence.json`
- Create outside Git: `/Users/maximovchinnikov/github/ralphy/ralphy/.ralphy/maintenance/manual-denti-nightmaker-20260810-v1/denti-transactions.md`
- Create outside Git: `/Users/maximovchinnikov/github/ralphy/ralphy/.ralphy/maintenance/manual-denti-nightmaker-20260810-v1/denti-report.md`

**Interfaces:**
- Consumes: Task 1 preimages/backup and exact Denti Workspace.
- Produces: 2 recovered Compositions, 75 revisions/files, 57 exact generation chains, deterministic single-revision Artifact selections, and a verified Denti report.

- [ ] **Step 1: Build read-only Project evidence**

Require only the two real Denti Projects and exclude the exact `.DS_Store` ghost. Prove:

- Denti Perio: one root source, 44 snapshot sources, 161 direct renders, 57 exact source/output generation bindings;
- Denti VoicePerio: zero root sources, 30 snapshot sources, zero exact Builds;
- 22 archive-locator and 8 byte-mismatch candidates are excluded;
- every referenced Object is in the Denti Workspace/Project, is a regular non-symlink file, and matches recorded bytes/hash;
- each source and output migration entry has the expected original immutable refs.

Use existing `migrationStableId`, the shared composition locator classifier, and the production manifest digest helper directly from the Core worktree. Record their literal outputs in `denti-evidence.json`; do not add a wrapper module or script.

- [ ] **Step 2: Prepare exact Project transactions**

For each Project, record the full preimage and ordered statements before execution:

1. insert one Composition;
2. for each ordered source, insert a draft CompositionRevision and its one CompositionRevisionFile;
3. update that revision draft→sealed after its file exists;
4. select only the exact Perio root revision; leave VoicePerio unselected;
5. for each exact generation, insert a pending `generate.hyperframes` Run, a running Attempt whose `request_json` is the reviewed `generation-input/v1` projection from that exact evidence row, a running Build, BuildOutput, and RunResult, then transition Build/Attempt/Run to succeeded;
6. add the exact source and output supplemental migration refs using existing `task-2d2-v1` accounting;
7. select an Artifact revision only when that Artifact has exactly one in-scope revision; preserve its candidate state and leave every multi-revision Artifact unchanged;
8. leave every Unit selection and noncanonical Document binding unchanged.

Every `INSERT` names all immutable columns and has an immediately preceding absence check. Every `UPDATE` includes the exact old pointer/state/row version in its WHERE clause and requires one changed row. Provider/model/cost/prompt/parameters come only from the same exact generation evidence row; absent values remain null/empty and paths, profiles, source Object IDs, provider payloads, and raw errors never enter `request_json`.

- [ ] **Step 3: Apply Project transactions sequentially**

Revalidate Task 1 DB identity, stopped processes, backup hash, target preimages, and evidence file hash. Execute Denti Perio in one immediate transaction; commit only if the exact postconditions hold inside the transaction. Verify it read-only after commit, then repeat for VoicePerio.

- [ ] **Step 4: Verify Denti independently**

Require exactly 2 Compositions, 75 revisions/files, 1 selected Composition, and 57 succeeded Run/Attempt/Build/Output/Result chains with unique output ArtifactRevisions. Require all 30 non-exact candidates absent from these tables, FK/integrity clean, unrelated row digests unchanged, and a second read-only reconstruction of the Denti plan reports no missing or extra relationship.

### Task 3: Manually recover Nightmaker

**Files:**
- Create outside Git: `/Users/maximovchinnikov/github/ralphy/ralphy/.ralphy/maintenance/manual-denti-nightmaker-20260810-v1/nightmaker-evidence.json`
- Create outside Git: `/Users/maximovchinnikov/github/ralphy/ralphy/.ralphy/maintenance/manual-denti-nightmaker-20260810-v1/nightmaker-transactions.md`
- Create outside Git: `/Users/maximovchinnikov/github/ralphy/ralphy/.ralphy/maintenance/manual-denti-nightmaker-20260810-v1/nightmaker-report.md`

**Interfaces:**
- Consumes: Task 1 backup, verified Denti post-state, and exact Nightmaker Workspace.
- Produces: 5 recovered Compositions, 32 revisions/files, 10 exact generation chains, deterministic single-revision Artifact selections, and a verified Nightmaker report.

- [ ] **Step 1: Build read-only Project evidence**

Require the registered Nightmaker Projects plus the physical `profile-*` document-only pseudo-project and exclude the exact `.DS_Store` ghost. Recover only:

- Brandfilm: one root + two snapshots;
- Demo: one root + two snapshots;
- Hooks: one root + ten snapshots and 10 exact Builds;
- Matrix: one root + five snapshots;
- Relaunch: one root + eight snapshots.

Prove the 10 archive-locator candidates are excluded. The other Nightmaker Projects and `profile-*` remain document/media-only; do not fabricate Compositions for them and do not delete `profile-*`.

- [ ] **Step 2: Prepare exact Project transactions**

Use the same ordered row lifecycle and preimage rules as Task 2. Every one of the five root revisions becomes selected. Add generation chains only for the 10 exact Hooks records. Select only single-revision Artifacts; preserve all multi-revision Artifact, Unit, and noncanonical Document pointers.

- [ ] **Step 3: Apply Project transactions sequentially**

Before each of the five Project transactions revalidate the live DB identity, stopped processes, Task 1 backup, Denti post-state digest, Nightmaker preimage, and evidence hash. Commit a Project only after its exact in-transaction postconditions pass.

- [ ] **Step 4: Verify Nightmaker independently**

Require exactly 5 Compositions, 32 revisions/files, 5 selected Compositions, and 10 succeeded Run/Attempt/Build/Output/Result chains. Require all non-exact candidates absent, file evidence unchanged, FK/integrity clean, Denti digest unchanged, other Workspace digest unchanged, and a second read-only reconstruction reports no missing or extra relationship.

### Task 4: Independent final verification and packaged-app QA

**Files:**
- Create outside Git: `/Users/maximovchinnikov/github/ralphy/ralphy/.ralphy/maintenance/manual-denti-nightmaker-20260810-v1/final-verification.md`
- Create outside Git: `/Users/maximovchinnikov/github/ralphy/ralphy/.ralphy/maintenance/manual-denti-nightmaker-20260810-v1/screenshots/`

**Interfaces:**
- Consumes: Tasks 1-3, reviewed packaged app, reviewed Core binary.
- Produces: final live-data verdict and usable installed application.

- [ ] **Step 1: Reproduce database postconditions without mutation-agent material**

The verifier independently reads the live DB, source evidence, and backup manifest. Require total recovery facts of 7 Compositions, 107 revisions/files, 6 selected Compositions, and 67 exact succeeded `generate.hyperframes` generation chains. Require each repaired target to have its exact supplemental source association, no non-exact generation target in a Build, exactly the 2,945 single-revision target Artifacts selected and every 48 multi-revision Artifact still unchanged, Units unchanged, and all non-target digests unchanged.

- [ ] **Step 2: Run final database health and backup recovery checks**

Require integrity `ok`, zero FK rows, schema/history unchanged, no active partial lifecycle row, no partial repair marker/ref set, and backup hash/mode/health unchanged. Open the backup read-only and prove it still represents the exact pre-recovery state.

- [ ] **Step 3: Install and launch the reviewed package**

Preserve the previous application bundle as the existing dated backup, install the reviewed package to `/Applications/Ralphy Media.app`, launch it against the live `.ralphy`, and keep the maintenance/backup directories untouched.

- [ ] **Step 4: Smoke-test both complete Workspaces**

In Denti AI and Nightmaker, exercise Workspace→Project navigation, Documents, Media filters/load-more, image/video/audio tile previews, selection, modal open/Escape/arrows, generation/provider/model/cost/prompt states, and Compositions/revision/output previews. Verify VoicePerio visibly has revisions but no selected revision until the user chooses one. Verify non-composition Nightmaker projects remain usable for Documents/Media.

Capture screenshots at 1360x860 and 1100x720 showing the media grid, modal inspector, Documents, and Compositions. Record every unavailable legacy prompt as `Not recorded`, never as an error or invented value.

- [ ] **Step 5: Audit repository and runtime hygiene**

Require no new repo-root runtime directories, no temporary files outside `.ralphy`, no product-source diff from the manual recovery, and no unexpected untracked repository file. Keep backup/evidence paths in the final report; do not delete them.
