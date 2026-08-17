# Desktop One-Shot Secret Handoff Implementation Plan

**Goal:** Add a packaged Electron mode that decrypts one audited Desktop provider key and imports it into the staged Ralphy store without opening the normal app or exposing secret bytes outside process memory.

**Architecture:** `electron/main.ts` selects the helper mode before registering normal IPC, protocols, windows, watchers, terminals, or bridge restart behavior. The helper reads one bounded exact-shape request from its own stdin, maps `anthropic` or `openrouter` to the existing owned safeStorage file, starts exactly one Ralphy bridge against the supplied staged root, sends exactly one `migration.secret.import` request through the child stdin, validates the bounded response, closes the child, and exits. Packaged production uses only `Contents/Resources/bin/ralphy`; no global fallback or release is involved.

**Global constraints:**

- Secret bytes never enter argv, environment, stdout, stderr, logs, reports, telemetry, crash metadata, or renderer/preload/IPC state.
- One helper invocation handles exactly one source entry and starts exactly one bridge child.
- Accepted providers and files are exact: `anthropic` -> `claude-api-key.bin`, `openrouter` -> `openrouter-api-key.bin`.
- The request arrives only on helper stdin and contains `{v, runId, root, sourceEntryId, ref, provider}`; it contains no secret.
- The helper validates exact fields, size bounds, absolute staged root, migration/source/ref shapes, and the provider/ref match before reading safeStorage.
- Missing/decryption-invalid credentials fail closed before bridge start.
- No normal window, watcher, interval, media worker, terminal, agent session, IPC registration, protocol registration, activity subscription, or auto-restart path runs in helper mode.
- No binary, credential fixture, or public release is committed.

---

### Task 1: Implement the one-shot helper boundary

**Files:**
- Create: `electron/migration/secret-handoff.ts`
- Modify: `electron/main.ts`
- Modify: `electron/ralphy/types.ts`
- Test: `tests/migration-secret-handoff.test.ts`

- [ ] Write failing tests for exact stdin parsing, provider/ref matching, missing/decrypt-invalid files, one bridge child/one request, safe result validation, empty stdout/stderr, child close on success/failure, and rejection of extra fields/oversize/non-staged roots.
- [ ] Implement a pure request parser and injected helper runner using the existing credential stores and `RalphyBridgeClient`; do not add a second bridge protocol implementation.
- [ ] Select helper mode before normal Desktop registration/startup. Packaged mode resolves only the bundled core; development/tests retain the approved resolver behavior.
- [ ] Assert helper mode never calls window/watcher/interval/terminal/agent/protocol/IPC startup seams and exits after the bridge closes.
- [ ] Run `bun run test -- tests/migration-secret-handoff.test.ts tests/ralphy-client.test.ts tests/ralphy-executable.test.ts && bun run typecheck && bun run build`.
- [ ] Commit `feat(desktop): add one-shot secret handoff`.

### Task 2: Add packaged no-window/no-watcher smoke

**Files:**
- Modify: `scripts/smoke-electron.mjs`
- Modify: `package.json`
- Test: `tests/migration-secret-handoff.test.ts`

- [ ] Add a packaged helper smoke branch that exercises helper-mode selection and clean exit without reading the user's credential files or starting a bridge. The smoke flag contains no secret and is unavailable to the normal renderer.
- [ ] Make smoke fail if any BrowserWindow, watcher, interval, restart loop, terminal, or agent startup marker appears, or if helper stdout/stderr is non-empty.
- [ ] Add `smoke:secret-handoff` for the already packaged local app; do not add downloads/updaters.
- [ ] With the final locally rebuilt core: run tests/typecheck/build, package, normal packaged smoke, helper packaged smoke, and strict codesign verification.
- [ ] Commit `test(desktop): smoke packaged secret handoff`.
