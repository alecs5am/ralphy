# Unified Ralphy Repository Implementation Plan

**Goal:** Make `alecs5am/ralphy` the home of the desktop product and runtime, with personal Git identity isolated from corporate repositories.

**Architecture:** Keep the runtime and CLI at the repository root. Import the desktop application under `apps/desktop` with its full history. Retain its independent Bun package and lockfile so both existing build systems remain reproducible. The desktop continues to call the CLI contract.

**Constraints:** Preserve local branches, tags, uncommitted work, and user data. Use SSH for Git transport and the personal GitHub account for API operations. Do not change the globally active corporate account. Do not publish backup refs or rewrite other contributors.

- [x] Identify inherited corporate author settings and verify the personal SSH key and GitHub user ID.
- [x] Save original local and remote histories as Git bundles outside both working trees.
- [x] Rewrite corporate author, committer, and tagger identities in isolated mirrors; verify every commit tree, message, timestamp, and parent mapping.
- [x] Synchronize local refs without replacing working files; publish only explicit branch and tag updates with expected-old-SHA leases.
- [x] Import the current desktop branch with full history into `apps/desktop`; retain other desktop branches under a `desktop/` namespace.
- [x] Add root desktop commands and desktop CI; update product positioning and repository ownership documentation; remove checkout-specific build paths.
- [x] Run runtime lint and integration checks, desktop typecheck/tests/build/architecture/style checks, and staged secret scanning. Compare pre-existing failures against the original desktop checkout.
- [x] Prepare the unified main commit and explicit SSH ref updates; verify GitHub attributes the rewritten source commits to the personal account. Preserve the old desktop repository as a source-history reference.

Validation logs, original refs, commit mappings, and bundles are stored in the local Git migration backup directory. GitHub-managed pull request refs cannot be force-pushed; any retained old PR history must be reported separately.

## Validation notes

- All 1,286 tracked desktop files were retained. Package integration changes affect six desktop files; application behavior source is unchanged.
- Desktop: 1,128 tests passed, one opt-in runtime test skipped; typecheck, build, architecture, and style checks passed. Electron is installed before tests run, and worker concurrency is bounded to avoid contention from multiple Electron/compiler processes.
- Runtime lint and documentation-link checks passed. Generated CLI help normalizes checkout paths so CI and local checkouts produce the same document.
- Runtime unit checks: 2,938 passed and 12 failed in existing migration/memory tests. The migration-import and memory-store/curate failures reproduce on the pre-merge runtime snapshot (23 passed, 10 failed across those three files). Runtime application source is unchanged.
- Imported Cyrillic reference documents and language labels are listed individually in the existing translation-debt allowlist. The staged secret-scan exception is limited to a copied documentation example containing the literal placeholder `YOUR_API_KEY`.
- Runtime integration checks: all 906 tests across 97 files passed in 11 bounded processes. The initial single-process run exceeded available memory.
- Publication and archive status are recorded in the local migration report after the final push.
