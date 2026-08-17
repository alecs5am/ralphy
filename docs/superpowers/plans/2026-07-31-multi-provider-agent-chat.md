# Multi-Provider Agent Chat Implementation Plan

**Goal:** Add Codex and OpenRouter providers, per-provider model selection, and
multiple persistent switchable chats without weakening the existing local
agent capabilities.

**Architecture:** Electron owns provider discovery, encrypted credentials,
Claude/Codex child processes, model catalogs, and normalized events. React owns
a bounded per-library chat collection. Every request and event is routed by
`chatId`; Claude has its existing runner while Codex and OpenRouter share one
Codex JSONL runner.

**Tech Stack:** Electron 43, React 19, TypeScript, Bun, Claude Code CLI, Codex
CLI, Motion.

### Task 1: Generic Agent Contracts And State

**Files:** `electron/media/types.ts`, `src/chat/useAgentChat.ts`,
`tests/chat-state.test.ts`

- [ ] Write failing tests for provider/model state, two-chat switching,
  inactive-chat events, bounded persistence, and legacy Claude migration.
- [ ] Replace the Claude-only reducer with the smallest provider-aware reducer
  and hook.
- [ ] Run the focused tests and typecheck.

### Task 2: Codex And OpenRouter Runtime

**Files:** `electron/agent/codex-session.ts`, `electron/agent/request.ts`,
`tests/codex-session.test.ts`, `tests/agent-request.test.ts`

- [ ] Write a fake-Codex process test for ChatGPT and OpenRouter invocations,
  full access, model selection, resume, JSONL normalization, and stop.
- [ ] Implement Codex binary/auth/model discovery and one shared runner.
- [ ] Add bounded trust-boundary validation and run focused tests.

### Task 3: Credentials And IPC

**Files:** `electron/main.ts`, `electron/preload.ts`, `src/lib/ipc.ts`,
`electron/claude/credentials.ts`, `tests/agent-credentials.test.ts`,
`tests/agent-bridge.test.ts`

- [ ] Add failing tests for write-only OpenRouter credentials and chat-routed
  envelopes.
- [ ] Add generic agent channels, provider status/model listing, send, stop,
  and secret management.
- [ ] Preserve Claude authentication behavior and run focused tests.

### Task 4: Provider, Model, And Chat UI

**Files:** `src/App.tsx`, `src/components/UtilityPanels.tsx`,
`src/screens/SettingsScreen.tsx`, `src/styles/workbench.css`,
`src/styles/settings.css`, `tests/design-system.test.ts`

- [ ] Add failing structural assertions for custom menus and provider states.
- [ ] Implement the recent-chat switcher, provider/model menus, Codex status,
  OpenRouter key flow, and real provider settings.
- [ ] Verify compact and wide panel layouts with no nested-card treatment.

### Task 5: Full Verification

- [ ] Run `bun test`, `bun run typecheck`, `bun run build`, and
  `bun run smoke`.
- [ ] Package and verify the macOS signature.
- [ ] Launch the app, test two Codex chats and switching with a harmless prompt,
  inspect screenshots at compact and wide sizes, and leave the app open.
- [ ] Report OpenRouter live inference as unverified if no key is available.
