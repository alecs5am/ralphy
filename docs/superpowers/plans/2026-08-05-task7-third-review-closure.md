# Task 7 Third Review Closure Plan

> **For Codex:** Execute this plan inline with test-driven development. Keep the change limited to Task 7 migration import/freeze verification; do not touch the live `.ralphy`, Farm, Desktop, or release workflows.

**Goal:** Make production accounting independently reconcile every legacy production/delivery record, and bind verification to the exact staged store inode while still allowing a same-inode rename.

**Architecture:** Persist source-derived expectations for non-Unit production/delivery records in the source fingerprint. Validate those expectations directly against the imported graph both during import and during freeze verification, without calling the production materializer or trusting the mutable accounting fact list. Persist the staged-root identity alongside the frozen excluded roots and compare the current staged root by device/inode rather than pathname.

**Tech Stack:** TypeScript, Bun test runner, SQLite migration store.

---

## Task 1: Independently reconcile production and delivery records

**Files:**
- Modify: `cli/lib/migration/import.ts`
- Modify: `cli/lib/migration/verify.ts`
- Modify: `tests/unit/migration-production.test.ts`
- Modify: `tests/unit/migration-verify.test.ts`

1. Add a regression seam that omits a Build graph in both dry and live materialization; assert the source-derived coverage check rejects it.
2. Add a freeze regression that removes a non-Unit accounting fact and its index entry together while leaving the source fingerprint; assert freeze rejects the missing graph.
3. Extend the production source fingerprint with deterministic expected graph facts for each production/delivery record.
4. Add one shared validator that queries the target graph from those source-derived expectations; call it after dry import, after live import, and from freeze inspection.
5. Run the focused production and verification tests.

## Task 2: Bind freeze verification to the staged-root inode

**Files:**
- Modify: `cli/lib/migration/verify.ts`
- Modify: `tests/unit/migration-verify.test.ts`

1. Add a failing test that verifies a byte-identical copied store at a new inode is rejected.
2. Add a passing test that verifies the same store after an in-filesystem rename.
3. Persist the staged-root identity in the freeze record, require it to be one of the hash-bound excluded roots, and compare current device/inode while allowing a changed path.
4. Run the focused verification tests.

## Task 3: Validate and commit

1. Run focused unit tests and the Task 7 migration integration checks.
2. Run TypeScript checking and inspect the diff.
3. Run `gitleaks protect --staged --redact` after staging.
4. Commit in English and report the commit hash and exact validation results.
