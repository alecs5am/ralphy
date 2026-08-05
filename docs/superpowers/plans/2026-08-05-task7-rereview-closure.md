# Task 7 Re-review Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all seven Task 7 re-review findings with source-derived evidence, stable freeze boundaries, and adversarial regression tests.

**Architecture:** Freeze records bind only safe secret ref/kind facts while decrypted values remain ephemeral for the pre-freeze byte scan. Job and production expectations are computed from checked immutable source records before target insertion, then compared with staged rows during freeze. External-record identity and all mutation boundaries are bound into the canonical freeze envelope.

**Tech Stack:** TypeScript, Bun, bun:sqlite, Node filesystem/crypto standard library.

## Global Constraints

- TDD: each behavior must fail before production changes and pass afterward.
- No Farm, public release, live `.ralphy`, or Desktop writes.
- Preserve nofollow, quiescence, exact source-entry identity, and whole-stage scanning already approved.
- Use Bun; add no dependencies.

---

### Task 1: Stable secret and snapshot freeze envelope

**Files:**
- Modify: `cli/lib/migration/verify.ts`
- Test: `tests/unit/migration-verify.test.ts`

**Interfaces:**
- Consumes: authenticated `SecretInventoryEntry[]` from `readSecretInventory`.
- Produces: canonical safe `{ref, kind}` facts/digest in `FrozenMigration`; post-freeze verification uses those facts without treating omitted secrets as empty.

- [ ] Add a failing imported-secret freeze+verify test and a failing index-2 mutation/no-record test.
- [ ] Run the focused tests and confirm the expected inventory mismatch and late-mutation false acceptance.
- [ ] Separate safe secret facts from ephemeral values; bind facts/digest into the freeze record and re-run a full final snapshot after any test seam.
- [ ] Run the focused tests to green.

### Task 2: Source-derived Job accounting

**Files:**
- Modify: `cli/lib/migration/import.ts`
- Modify: `cli/lib/migration/verify.ts`
- Test: `tests/unit/migration-import.test.ts`
- Test: `tests/unit/migration-verify.test.ts`

**Interfaces:**
- Consumes: checked `PreparedJobSource` records from the immutable cloned triplet.
- Produces: a required triplet index and canonical expected Job/Run/log/artifact rows computed before insertion.

- [ ] Add failing tests for source-derived facts and an injected initially-wrong completed/no-hold target.
- [ ] Confirm current post-insert self-attestation lets the wrong target through.
- [ ] Compute canonical expected rows before insertion, persist their digests plus exact triplet entry IDs, and require complete index coverage at freeze.
- [ ] Run focused Job tests to green.

### Task 3: Source-derived production graph accounting

**Files:**
- Modify: `cli/lib/migration/import.ts`
- Modify: `cli/lib/migration/verify.ts`
- Test: `tests/unit/migration-production.test.ts`
- Test: `tests/unit/migration-verify.test.ts`

**Interfaces:**
- Consumes: checked parsed production records before materialization.
- Produces: complete indexed expected graph occurrences/rows, including ordered items, revisions, attempts, and metric winner facts.

- [ ] Add a failing 40-to-39 ordered-item omission seam/test.
- [ ] Confirm current target-derived fact accepts the omitted graph.
- [ ] Capture source-derived expected graph facts before writes and require exact occurrence/index coverage against staged rows.
- [ ] Run focused production tests to green.

### Task 4: RunObject, zeroization, and verification-directory binding

**Files:**
- Modify: `cli/lib/migration/verify.ts`
- Modify: `cli/lib/store/secrets.ts`
- Test: `tests/unit/migration-verify.test.ts`
- Test: `tests/unit/secret-store.test.ts`

**Interfaces:**
- Consumes: promoted RunObject/Object rows, pinned external-directory identity, transient plaintext buffers.
- Produces: exact promoted-row equality, best-effort buffer zeroization with an internal observation seam, and freeze-bound verification-directory identity/exclusions.

- [ ] Add failing promoted RunObject mismatch, copied-freeze-under-source, and buffer-zeroing tests.
- [ ] Confirm each failure reflects the reviewed gap.
- [ ] Validate promoted path/bytes/hash/mime, zero retained buffers in `finally`, and bind/recheck external directory device/inode/canonical path plus excluded roots.
- [ ] Run focused tests to green.

### Task 5: Full closure gate and report

**Files:**
- Modify: `.superpowers/sdd/2026-08-02-full-library-migration-implementation/task-7-report.md`

- [ ] Run the complete migration/domain suite, typecheck, lint, and diff check.
- [ ] Stage exact files and run staged gitleaks.
- [ ] Update the report with all seven finding-to-test mappings and honest JS-string zeroization limits.
- [ ] Commit `fix(migrate): bind source-derived verification facts`; allow the full hook to finish without bypass.
