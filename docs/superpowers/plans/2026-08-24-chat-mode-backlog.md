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
- [x] **B4 — Drag and drop drops a raw image into the transcript.** A dropped image currently
  renders full-bleed with nothing to act on. Handle drops as *attachments*, entity-aware:
  - a drop from Finder is a `file`;
  - a drop from the app's own panels is a Ralphy entity — media, unit, scheduled content, memory,
    document, whatever the source says it is.
  Attachments are a separate channel from inline tags: inline tags are what the operator types.

  Landed as `src/chat/attachments.ts`: a drag type of our own (`application/x-ralphy-entity`) that
  the app's own rows carry — Unit cards, the workspace Units rows, media tiles, document rows,
  memory rules, calendar publications and the ready drawer — and a strip of removable chips above
  the composer. A Finder drop becomes a `file` with the real path (`webUtils.getPathForFile` in
  the preload). The window now refuses a stray drop outright, which is what the reported bug was:
  the default action for a dropped image is to *navigate* to it, so the window became the image.
  Attachments ride under the message as an `Attached:` block in the same `@kind:ref` vocabulary,
  so the operator's own bubble renders them as chips.

## C. Provider integration

- [x] **C1 — Refresh the Codex integration.** New models are rejected and the harness reports that
  Codex must be updated. Confirm what the installed Codex CLI actually accepts and follow it.
  Second pass: offering the right models was not enough. "Codex default" means "whatever
  `~/.codex/config.toml` says", and this operator's config says `gpt-5.6-luna` — so every existing
  chat kept failing. The row is now dropped when the configured default is unrunnable, and a chat
  pinned to a model the provider no longer lists moves to the provider's default by itself.
- [ ] **C2 — Refresh the Claude Code integration.** Same currency check for the Claude harness.
- [~] **C3 — Streaming looks dead on Codex.** The parser now forwards a growing message as
  suffixes, so the transcript streams as soon as the CLI reports one -- but the installed
  `codex-cli 0.142.4` never does: `codex exec --json` emits `item.completed` for an assistant
  message and nothing before it (verified against a live turn), and `codex exec` has no
  partial-output flag. Claude's harness streams properly through `--include-partial-messages`.
  The cure for Codex is `codex update`; ours is done.
- [x] **C4 — Generated chat titles.** A chat is currently named after its first prompt. Both Codex
  and Claude Code name sessions themselves; integrate whatever they already produce. Neither hands
  that name to a one-shot caller -- `codex exec` writes no thread name, and Claude's
  `generate_session_title` is a control request on the bidirectional stream the `-p` path cannot
  reach -- so the name is asked for the same way they ask for it: one short read-only turn after
  the first reply, once per chat, which a real send stops rather than queues behind.

  Found on the way: `codex exec` refuses to start outside a git repository, and the harness runs in
  the library's parent, which is the operator's home. A `full` turn never hit it because bypassing
  the sandbox bypasses the trust check -- so **Plan and Auto were broken for every turn** and
  looked fine. `--skip-git-repo-check` is now passed; what a turn may touch is still the sandbox's
  decision alone.
- [x] **C5 — "Provider Settings" opens Settings at its last page.** It must land on the provider
  page.

## D. Chat scope and panel state

- [x] **D1 — Chats belong to a workspace.** Switching workspace switches the chat list. The
  stored key gained the workspace (`agent-chats:3:<root>:<workspace>`); the pre-scope record is
  consumed by the migration rather than copied into every workspace.
- [x] **D2 — Panel state per chat.** `ViewPanelPreferences.tabsByWorkspace` became `byChat`, and
  the width moved inside it -- selecting a chat restores its tabs *and* the width it stood at. The
  record is capped at 40 chats, oldest first, so a closed chat cannot grow the blob forever.
- [x] **D3 — Add a web browser view tab.** An Electron `<webview>` in its own session partition,
  with `hardenWebviewAttach` in main deciding what a guest may attach with (no preload, no node,
  `http(s)` only). The guest stays mounted behind the page card, so switching tabs does not reload
  the page.

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
- [x] **F3 — Workspace `Units` page says "Units not wired yet"** while the workspace has units and
  they are reachable elsewhere. Superseded plan 2026-08-20 Task 3, which specified the
  unavailable plate as the deliverable: the sidebar counts those Units from the catalogue, so the
  plate had become a contradiction rather than an honesty.

## G. Test data

- [ ] **G1 — Fill the gaps in the test workspace.** `UX Testing Lab`'s overview is mostly
  "unavailable from the current Core contract"; establish which panels are missing *data* and
  which are missing *contract*, then write the data the workspace needs to render a full overview.
