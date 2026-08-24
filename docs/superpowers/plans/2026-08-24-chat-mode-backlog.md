# Chat Mode Backlog — 2026-08-24 review round

**Source:** operator review of the chat lens on the real library (`~/.ralphy`, workspace
`UX Testing Lab`, project `UX Tester`), 2026-08-24 night.

**Core:** `ralphy/.worktrees/sqlite-domain-store` working copy (`SCHEMA_VERSION = 9`) is the only
build that opens the home library. Run Desktop with `RALPHY_BIN` pointing at a wrapper that execs
that worktree's `cli/index.ts`, and start vite with the `renderer-real` launch configuration.

Status legend: `[ ]` open, `[x]` landed and verified in the running app, `[~]` landed but the
verification is partial (says which part).

---

## A. Lens and shortcut semantics

- [x] **A1 — `⌘R` toggles the right panel inside the chat lens.** The chat itself is permanent
  there; the chord must open and close the view panel, not the lens.
- [x] **A2 — `⌘R` does nothing under the desk lens.** The chord belongs to the chat lens only.

## B. Composer

- [x] **B1 — `@` picker highlight resets to the first row.** `sync()` runs on `keyup` and sets the
  highlight back to 0, so `↑`/`↓` can never land anywhere but the first row.
- [x] **B2 — Composer has no maximum height.** Cap it at roughly 12–15 lines and scroll inside.
- [x] **B3 — Chat measure is far too narrow.** The thread should read at ~740 units, not ~60, and
  the type should step up slightly.
- [ ] **B4 — Drag and drop drops a raw image into the transcript.** A dropped image currently
  renders full-bleed with nothing to act on. Handle drops as *attachments*, entity-aware:
  - a drop from Finder is a `file`;
  - a drop from the app's own panels is a Ralphy entity — media, unit, scheduled content, memory,
    document, whatever the source says it is.
  Attachments are a separate channel from inline tags: inline tags are what the operator types.

## C. Provider integration

- [ ] **C1 — Refresh the Codex integration.** New models are rejected and the harness reports that
  Codex must be updated. Confirm what the installed Codex CLI actually accepts and follow it.
- [ ] **C2 — Refresh the Claude Code integration.** Same currency check for the Claude harness.
- [ ] **C3 — Streaming looks dead on Codex.** Deltas do not appear to reach the transcript.
- [ ] **C4 — Generated chat titles.** A chat is currently named after its first prompt. Both Codex
  and Claude Code name sessions themselves; integrate whatever they already produce.
- [x] **C5 — "Provider Settings" opens Settings at its last page.** It must land on the provider
  page.

## D. Chat scope and panel state

- [ ] **D1 — Chats belong to a workspace.** Switching workspace switches the chat list.
- [ ] **D2 — Panel state per chat.** Selecting a chat restores that chat's view tabs and the
  panel's width.
- [ ] **D3 — Add a web browser view tab.**

## E. Context transparency

- [ ] **E1 — Show what the chat can reach.** Core ships `AGENTS.md` and a tree of instruction
  files (art director and friends) plus installed skills the harness can call. The app should show
  the operator the system-prompt entry point, the files already in context, and what the harness
  may pull in as it works.

## F. Surfaces outside the chat

- [x] **F1 — The project dock shows up in Marketplace.** It is exclusive to My Work, and only with
  a project open.
- [x] **F2 — Dynamic island does not collapse on outside click.** An open island should close when
  the operator clicks away.
- [ ] **F3 — Workspace `Units` page says "Units not wired yet"** while the workspace has units and
  they are reachable elsewhere.

## G. Test data

- [ ] **G1 — Fill the gaps in the test workspace.** `UX Testing Lab`'s overview is mostly
  "unavailable from the current Core contract"; establish which panels are missing *data* and
  which are missing *contract*, then write the data the workspace needs to render a full overview.
