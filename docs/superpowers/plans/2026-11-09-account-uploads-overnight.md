# Account Uploads Morning Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The owner approved autonomous overnight implementation; do not request another plan approval.

**Goal:** Make the existing accounts, upload queue and side panel usable for an owner-led test the next morning, with evidence of local verification and clear remaining live-provider limits.

**Architecture:** Continue the existing `feat/account-uploads` branch and PR #9 in the core repository. Keep the panel read-only and route changes through the CLI. Exercise publication flows with isolated fixtures and simulated browser/provider responses; the owner performs sign-in and the first real publication later.

**Tech Stack:** Bun 1.4.2, TypeScript, SQLite, patchright, existing panel HTML.

**Spec:** `docs/superpowers/specs/2026-11-04-account-uploads-design.md`

## Global Constraints

- Change only the core `ralphy/` repository. Preserve sibling repositories and unrelated work.
- Use `mise exec bun@1.4.2 --` and repository checks; no npm lockfiles.
- Files and shared artifacts are English; user-facing chat is Russian. No AI attribution.
- No real social publication, approval of real queued items, advertising writes, paid API calls, paid scraping, public release or merge.
- Do not use the owner's everyday browser or enter passwords, codes or captchas.
- Never reset, clean, force-push or overwrite generated user artifacts.
- User-library migrations require a SQLite-consistent backup and successful rehearsal on a disposable copy before opening the original with newer code. Preserve all existing account and corpus data.
- Keep unknown publication outcomes unknown until explicitly reconciled; do not weaken identity binding or approval requirements.
- Read current AGENTS.md and docs/developing-ralphy.md. Respect normal hooks here; the EllyLLM hook exception does not apply.
- Run `gitleaks protect --staged --redact` before every commit. Review the complete branch before pushing; update PR #9 instead of creating a duplicate.

## Review Focus

- A library already at early schema 13 but missing `social_accounts.platform_user_id` must upgrade without losing rows; current complete v13 and v12 libraries must also work.
- Two workers must not submit the same upload or share a concurrently open account profile.
- A timeout or crash around the publish click must never automatically post twice.
- Actions copied from the panel must identify the correct workspace/account when handles collide across workspaces or platforms.
- Empty, stale, partial or rounded metrics must not appear as current complete measurements or false success.

---

### Task 1: Repair upgrade compatibility

**Files:** `cli/lib/store/schema.ts`, store startup/migration helpers discovered from it; `tests/unit/migration-schema.test.ts`, `tests/unit/account-uploads.test.ts`, relevant integration migration tests.

**Interfaces:** Preserve `openDomainDb()` and owned-account DTOs. Current account queries require `platform_user_id`; do not remove that requirement to hide the migration problem.

- [x] Add regression fixtures for v12, complete v13 and the already-applied early v13 missing the identity column. Assert migration is idempotent, data/foreign keys survive, and account reads work.
- [x] Run targeted regressions and establish the failure before fixing it.
- [x] Implement a forward-compatible repair using the migration architecture, including version-pinned checks and portable imports where needed. Do not silently rewrite an already-applied migration as the only repair.
- [x] Verify the fix on fixtures and on a SQLite backup copy of `~/.ralphy/ralphy.db`; report schema, counts and integrity checks before/after.
- [x] Only after passing rehearsal, apply the supported migration to the real home library if a safe runnable build is ready. Otherwise provide the exact tested command and explain the remaining prerequisite.

### Task 2: Verify queue and browser lifecycle

**Files:** `cli/lib/uploads/run.ts`, `cli/lib/uploads/browser.ts`, `cli/lib/uploads/platforms.ts`, `cli/lib/store/uploads.ts`, `cli/commands/account.ts`, `cli/commands/upload.ts`, `tests/unit/account-uploads.test.ts`; add focused tests where existing files do not cover the public CLI boundary.

**Interfaces:** Keep existing `account`/`upload` verbs and documented result shapes unless fixing a demonstrated contract defect.

- [x] Inspect connected code for claiming, profile concurrency, approval gates, account binding, failure-before-submit, timeout-after-submit and abandoned-worker recovery.
- [x] Add meaningful tests for discovered defects, then make the smallest fixes.
- [x] Run an isolated CLI smoke: create workspace/account, ingest a locally generated small video, queue without approval, approve only the fixture item, run against simulated provider success/failure/unknown responses, inspect state and metrics.
- [x] Check success verification on all three scripted platforms; do not describe a URL discovered before the publish click as evidence of a completed publication.
- [x] Mark unsupported metrics/capabilities truthfully; do not expand platform scope or build device/proxy support overnight.

### Task 3: Make Accounts usable from the side panel

**Files:** `cli/lib/panel/accounts.ts`, `cli/lib/panel/page.html`, `cli/lib/panel/server.ts`, `tests/unit/panel-accounts.test.ts`, `tests/integration/panel-server.test.ts`, `.agents/skills/panel/SKILL.md`, `.agents/skills/account-uploads/SKILL.md`.

**Interfaces:** Preserve GET-only panel behavior and CLI mutation boundary. Extend existing DTOs only for concrete usability defects.

- [x] Verify empty states, the needs-you/unknown queue, account search, duplicate handles, correct root/workspace in copied commands, stale metrics, and no silent loss of actionable rows behind the 200-row presentation limit.
- [x] Fix demonstrated UX or scope defects and cover their shaping/endpoint behavior.
- [x] Exercise the page using the permitted local verification tools. Do not invoke T3 preview tools unless browser work is explicitly requested in the active task; do not claim visual verification from a DOM stub.
- [x] Update the spec status and skills to match actual implemented behavior, including freshness and capability limits.

### Task 4: Deliver a reproducible morning test

**Files:** create `docs/testing/account-uploads-morning-test.md`; add a small repeatable smoke fixture/helper only if it materially improves reproduction. Keep all fixture runtime state outside tracked files.

**Interfaces:** The guide names the exact tested executable/checkout, data root, startup command and deep link; it never assumes an unreleased global CLI contains new verbs.

- [x] Document a 10-15 minute owner-led test: launch panel, pick/create a test account, manual sign-in, queue a selected video, inspect approval, explicitly publish, sync metrics, inspect results and recovery states.
- [x] Include expected outcomes, screenshots/evidence locations where available, exact build SHA, backup path, commands run/results and all unverified provider behavior.
- [x] Verify the core/plugin skill installation path on an isolated root; prepare a local runnable build without public release or overwriting unrelated global installations.
- [x] Run narrow checks while iterating, then `mise exec bun@1.4.2 -- bun run lint`, the documented integration suite and meaningful affected unit suites. Investigate failures; use same-SHA baseline evidence for unrelated failures.
- [x] Investigate desktop/Vercel red checks enough to give exact causes and a scoped resolution. Do not remove checks merely to make the PR green or resurrect the retired desktop product.
- [x] Review the complete branch against main and this plan, fix findings, scan staged secrets, commit and push to the existing PR. Immediately link each pushed PR through T3.
- [x] Leave a concise completion report for the parent: exact SHA, changed behavior, verification, local test entry point, remaining blockers. Do not watch PRs from a delegated child.

## Follow-up after the morning test

Trend-to-experiment attribution, 24/48/72-hour comparisons, corpus refresh, paid-ad toolkit integration and public release follow only after the first real publishing loop has been validated. If the core deliverables finish early, inspect these gaps read-only and add concrete recommendations to the test guide; do not invent more product scope or make provider calls to fill time.

## Execution evidence

- Forward schema v14 and exact supported historical closed-WAL discovery are
  covered for v12, early v13 and complete v13. Complete v13 identity survives.
- Queue/profile concurrency, dead-worker recovery, identity binding, publication
  proof, retained diagnostics and manual post-id extraction are covered by
  external-free tests. Two real worker processes cannot claim both account rows.
- Panel commands are executable/root/Workspace/id scoped. Every actionable row
  survives the published-history cap, and the 200-row history reports its total.
- Home library migrated only after a consistent backup and successful compiled
  rehearsal on a disposable copy. All previous table counts and account fields
  survived; integrity is ok and foreign-key violations are empty. No upload was
  queued, approved or run in the home library. The checkout library stays v12.
- Final full unit suite: 3983 pass, 1 skip, 0 fail. Final documented integration
  suite: 1127 pass, 3 skip, 0 fail. Focused ten-file suite: 105 pass, 0 fail.
- Full lint reproduces four unchanged generation-log scanner findings from exact
  main. Other affected lint/type/surface checks pass. A single pre-existing
  migration CLI test now uses the documented 45-second timeout instead of its
  conflicting 30-second override; no assertions were removed.
- Desktop baseline and branch logs were compared; archive/geometry failures
  overlap, while the branch also reports core chalk resolution. Vercel's build
  cause remains unverified because the available login cannot read its team.
  Checks were not disabled and retired desktop work was not resumed.
- Review: both code-review axes performed by the implementer; no child agents,
  per delegation boundary. Parent performs independent review after delivery.
- Reproduction, executable, backup and remaining limits:
  [morning test](../../testing/account-uploads-morning-test.md). Exact final SHA
  and local build hashes are in the ignored build manifest and final handoff.

## Independent review follow-through

- Separate Standards and Spec reviewers inspected the full branch. The parent
  reproduced and fixed portable identity loss, unscoped onboarding and device
  recovery instructions, and added a real Chromium Accounts test enabled in CI.
- Local headless Chrome verification covers the narrow layout, clipboard scope,
  keyboard/filter behavior, refresh focus, stale counters and unknown recovery.
- Real platform sign-in and publication remain owner-led morning acceptance.
