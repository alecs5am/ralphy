# Claude Agent Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mocked right panel with a persistent streaming Ralphy agent powered by the user's local Claude CLI or Anthropic API key.

**Architecture:** Electron main owns authentication, the spawned `claude -p` process, session resume, and bounded JSONL normalization. React owns a per-library chat reducer above the panel mount boundary and communicates through the existing validated preload bridge.

**Tech Stack:** Electron 43, React 19, TypeScript, Bun, Claude Code CLI 2.1.220+, Motion, Vitest.

## Global Constraints

- Use the existing local Claude CLI; do not add an Agent SDK package.
- Support subscription OAuth and encrypted Anthropic API-key modes.
- Run Claude from the parent of the active canonical `.ralphy` root.
- Do not use or write `.ralphy/config.json.activeWorkspace`.
- Default permission mode is `Auto`; Full access must be explicit.
- Keep renderer access to credentials write-only.
- Preserve all current uncommitted workbench changes.

---

### Task 1: Claude Invocation And Stream Normalization

**Files:**
- Create: `electron/claude/session.ts`
- Create: `tests/claude-session.test.ts`

**Interfaces:**
- Produces: `ClaudeSession.run(request)`, `ClaudeSession.stop()`,
  `resolveClaudeBinary()`, `readClaudeAuthStatus()`, and normalized
  `ClaudeChatEvent` values.

- [ ] **Step 1: Write the failing real-process test**

Create an executable temporary fake `claude` that emits init, partial text,
tool-use, tool-result, and result JSONL. Assert literal normalized events,
`cwd`, permission flags, auth environment precedence, resume id, cancellation,
and malformed-line tolerance.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test tests/claude-session.test.ts`

Expected: failure because `electron/claude/session.ts` does not exist.

- [ ] **Step 3: Implement the smallest session driver**

Use `node:child_process.spawn`, `node:readline`, candidate-path resolution, a
128 KiB prompt limit, a 1 MiB JSONL line limit, and one active process. Build
these modes exactly: `auto`, `plan`, and `bypassPermissions`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bun test tests/claude-session.test.ts`

Expected: all session tests pass.

### Task 2: Chat Reducer And Bounded Persistence

**Files:**
- Create: `src/chat/useClaudeChat.ts`
- Create: `tests/chat-state.test.ts`

**Interfaces:**
- Produces: `reduceClaudeChat`, `loadClaudeChat`, `saveClaudeChat`, and
  `useClaudeChat({ rootPath, workspace, project })`.

- [ ] **Step 1: Write failing reducer tests**

Assert that deltas accumulate into one assistant message, a new assistant
message begins after a tool result, tool completion updates the matching row,
errors end busy state, New chat clears the session, and persistence is capped
at 100 entries.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test tests/chat-state.test.ts`

Expected: failure because the chat module does not exist.

- [ ] **Step 3: Implement reducer, storage, and bridge hook**

Keep event subscription active in `App`, persist per canonical root, append the
user message before invoking IPC, and convert invoke rejection to one visible
error entry.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bun test tests/chat-state.test.ts`

Expected: all chat-state tests pass.

### Task 3: Secure Auth And Validated IPC

**Files:**
- Modify: `electron/media/types.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/main.ts`
- Modify: `src/lib/ipc.ts`
- Test: `tests/claude-session.test.ts`

**Interfaces:**
- Produces bridge methods `getClaudeAuth`, `loginClaude`, `setClaudeApiKey`,
  `clearClaudeApiKey`, `sendClaudeMessage`, `stopClaude`, and `onClaudeEvent`.

- [ ] **Step 1: Extend the failing integration test**

Assert that an encrypted key is never returned, subscription mode strips API
credentials, API-key mode injects only the selected key, and invalid prompts,
session ids, project references, and permission modes are rejected.

- [ ] **Step 2: Verify RED**

Run: `bun test tests/claude-session.test.ts`

Expected: new auth/validation assertions fail.

- [ ] **Step 3: Wire auth and IPC**

Encrypt entered keys with Electron `safeStorage`, store only ciphertext under
`app.getPath("userData")`, validate trusted senders, capture the active media
root in main, authorize optional project references with `resolveProjectPath`,
and terminate Claude during app quit or library replacement.

- [ ] **Step 4: Verify GREEN and types**

Run: `bun test tests/claude-session.test.ts`

Run: `bun run typecheck`

Expected: both commands pass.

### Task 4: Functional Right-Panel Chat

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/UtilityPanels.tsx`
- Modify: `src/styles/workbench.css`

**Interfaces:**
- Consumes: `useClaudeChat` and Claude bridge methods.
- Produces: connection state, streamed messages, inline tool rows, permission
  menu, auth-source menu, New chat, Send, and Stop.

- [ ] **Step 1: Render the wished-for states against the reducer contract**

Exercise unauthenticated, idle, streaming, tool-running, failed, and completed
states in the development bridge and verify keyboard/accessible labels during
manual Electron inspection.

- [ ] **Step 2: Implement the panel**

Use borderless assistant prose, filled user bubbles, compact tool rows, an
auto-scrolling message region that respects manual scroll position, and a
custom permission menu. Keep the hook mounted in `App` when the panel closes.

- [ ] **Step 3: Verify focused behavior**

Run: `bun test tests/chat-state.test.ts tests/design-system.test.ts`

Run: `bun run typecheck`

Expected: all checks pass.

### Task 5: End-To-End Validation

**Files:**
- Modify only files required by defects found during verification.

**Interfaces:**
- Produces: a signed packaged app left open on the tested chat state.

- [ ] **Step 1: Run automated verification**

Run: `bun test`

Run: `bun run typecheck`

Run: `bun run build`

Run: `bun run smoke`

- [ ] **Step 2: Package and launch**

Run: `bun run package:mac`

Run: `codesign --verify --deep --strict release/Ralphy\ Media.app`

- [ ] **Step 3: Inspect the live app**

Verify right-panel toggle, auth state, API-key masking, composer keyboard
behavior, mode menu, panel-close persistence, terminal coexistence, and no
layout overlap at compact and wide window sizes. If subscription auth is
available, send one harmless read-only prompt and verify streaming plus Stop.
