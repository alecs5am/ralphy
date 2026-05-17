# 11 — Testing & Reliability — SPEC

> **Vision.** `bun test` is the heartbeat. Refactors land safely. Releases are green-before-pushed. Paid tests exist but never block contributors.

## Scope

**In:**

- CLI verb JSON-shape tests
- Golden renders for TOP-5 templates
- Doctor scenario tests
- Playbook lint (verb-existence check)
- Recipe tests (deferred to [`06.01.04`](../06-utilities/SPEC.md))
- CI matrix (macOS + Linux, optional Windows)
- Paid-test gating

**Not in:**

- Quality of generated content → [`08`](../08-quality-and-evaluation/)
- Install / release smoke → [`09`](../09-distribution-and-release/) (reuses fixtures from here)
- Visual regression of landing → [`07`](../07-socials-and-docs/)

---

## 11.01 CLI verb JSON-shape tests

Every v1.0 verb has a test that runs it (or `--dry-run` for paid verbs), parses stdout as JSON, and validates against a schema.

### 11.01.01 Test harness in `tests/cli/`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- One test file per verb: `tests/cli/<verb>.test.ts`.
- Harness `tests/cli/_runner.ts` spawns `bun run ralph -- <args>`, captures stdout/stderr/exit, parses JSON.
- Vitest or `bun test` — pick one and use it consistently (see Q-01).

### 11.01.02 JSON schemas committed under `docs/cli-spec.md`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Each verb's output schema written as a JSON Schema or Zod schema in `cli/lib/schemas/<verb>.ts`.
- Tests import the schema and assert.
- Schemas are also referenced from `docs/cli-spec.md` (generated or hand-cited).

### 11.01.03 Every v1.0 verb has a test  [ ]
**v1.0:** yes

**Acceptance criteria:**
- A `lint:verb-coverage` script lists verbs in `cli/commands/` and compares to test files; CI fails on a verb with no test.
- Exempted verbs (interactive `setup` wizard, etc.) are explicitly listed in an allowlist.

### 11.01.04 Tests use fixtures, not real APIs  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `tests/fixtures/` has: a 3-project workspace, 5 ref files, sample `prompts.json`, sample `scenario.json`, a 1s mp4 (shared with [`06`](../06-utilities/)).
- Tests for `generate *` use `--dry-run` and assert the resolved request body — they do not call providers.
- Provider mocks live at `tests/mocks/openrouter.ts`, `tests/mocks/elevenlabs.ts`.

### 11.01.05 Tests run in < 60s total  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Hyperfine'd in CI; budget alerted if median > 60s.
- Parallelization on by default.

---

## 11.02 Golden renders

Five reference templates render reproducibly on every PR. Catches regressions in compositions, recipes, Remotion version drift.

### 11.02.01 Golden fixture per template  [ ]
**v1.0:** yes

**Acceptance criteria:**
- For each template in `templates/TOP.md`:
  - A canonical project fixture (committed to `tests/golden/<template>/`).
  - Cached gen outputs (committed images + videos + VO + music) so no API calls happen at test time.
  - Expected mp4 properties: duration ±0.1s, resolution exact, audio LUFS within ±1.0, video bitrate within ±10%.
  - Expected first-frame perceptual hash within ε.

### 11.02.02 `bun test:golden` is the entrypoint  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Renders each template via `ralphy render <fixture>`.
- Asserts structural properties (not bit-exact — ffmpeg encoder drift).
- Failure output points at the assertion that diverged + the artifact path.

### 11.02.03 Regenerating goldens is a single command  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `bun test:golden --update` re-renders and writes new fixtures.
- Diff against git shows what changed — reviewer can sanity check.

### 11.02.04 CI runs goldens on every PR  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Required check.
- Cached node_modules + bun cache to keep PR time < 10 min.

---

## 11.03 Doctor scenarios

Test what `ralphy doctor` does in each failure mode. This is where users see Ralphy's first "this is broken, here's the fix".

### 11.03.01 Scenario fixtures in `tests/doctor/scenarios/`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Fixtures: missing `OPENROUTER_API_KEY`, expired key (mocked 401), missing ffmpeg (PATH manipulation), wrong ffmpeg version, missing yt-dlp, missing bun (skipped — we ARE bun), read-only workspace, no internet (mocked), low disk (mocked), broken project link, stale registry.
- Each scenario asserts: exit code, the specific check that flagged red, and the hint string.

### 11.03.02 At least 10 scenarios pass at v1.0  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Scenario count: 10 or more.
- Each scenario's failure mode is the kind a real user would encounter (no contrived bugs).

### 11.03.03 Hint strings are reviewed by the user before v1.0  [ ]
**v1.0:** yes

**Acceptance criteria:**
- All hint strings are sentences a human reads and acts on without further context.
- Reviewed in a single pass; the review commit annotates `docs/cli-spec.md`.

---

## 11.04 Playbook lint

Playbooks reference `ralphy ...` invocations as the bridge to action. When a verb's flag is renamed, the playbook lies until someone notices.

### 11.04.01 `bun lint:playbooks` extracts every `ralphy ...` from playbooks  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Greps `docs/playbooks/**/*.md`, `.agents/skills/**/SKILL.md`, `AGENTS.md` for `ralphy ` invocations.
- For each, parses the verb + flags and asserts they exist (`ralphy <verb> --help` exit 0, all flags appear in `--help` output).
- CI fails on a stale reference.

### 11.04.02 Lint runs on every PR  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Required check.
- Wall-time < 30s.

### 11.04.03 Lint is forgiving of inline examples  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Code fences clearly marked as "example output" (e.g., `bash` blocks following an `Example:` heading) can be excluded with a sentinel comment.
- Linter documents the override.

---

## 11.05 Recipe tests

Cross-link with [`06.01.04`](../06-utilities/SPEC.md). Mention here so the dependency is visible.

### 11.05.01 ffmpeg recipe tests run as part of `bun test`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Tests defined in [`06.01.04`](../06-utilities/SPEC.md) are wired into the same harness as `11.01`.

---

## 11.06 CI matrix

### 11.06.01 macOS-14 + ubuntu-22.04 matrix  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Every PR runs both.
- Required checks.

### 11.06.02 Windows runner — best-effort, not required  [ ]
**v1.0:** stretch

**Acceptance criteria:**
- Same matrix entry, marked `continue-on-error: true`.
- Manual triage if it breaks; not a release blocker.

### 11.06.03 Caching for speed  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Bun cache + ffmpeg fixtures cache + golden-fixture cache.
- PR wall-time goal < 10 min.

---

## 11.07 Paid-test gating

### 11.07.01 `RALPHY_TEST_PAID=1` gates the paid suite  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Tests that hit real OpenRouter / ElevenLabs are tagged `[paid]` in their describe block.
- Default `bun test` skips them with a "skipped — set RALPHY_TEST_PAID=1" message.
- A separate workflow runs them on a schedule (nightly or on `main` push) using maintainer secrets.

### 11.07.02 Paid tests assert real behavior, not contract  [ ]
**v1.0:** stretch

**Acceptance criteria:**
- One paid test per provider, end-to-end (generate image / video / VO / music).
- Asserts the file exists, is the right size class, and parses.
- Budget cap: < $1 per paid run.

---

## 11.08 Post-launch hardening

### 11.08.01 Nightly full suite  [ ]
**v1.0:** no

**Acceptance criteria:**
- Cron workflow runs the full paid suite + golden renders weekly.
- Failures open issues with reproduction info.

### 11.08.02 Property-based testing on prompt cookbooks  [ ]
**v1.0:** no

**Acceptance criteria:**
- Generate random brand/persona/scenario tuples; assert the prompt cookbook produces valid (lint-passing) prompts.
- Catches edge cases not in fixtures.
