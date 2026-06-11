# Local web app: project artifact browser with live file-watch

> **Status:** done — 2026-06-11
> **Filed:** 2026-06-10
> **Folder:** issues

## Context

Requested 2026-06-10. The user wants a simple, stylish local web app to browse a project's artifacts visually instead of `ls`-ing `workspace/projects/<id>/`. Reference shown: a Higgsfield-style dense image grid. Decided shape (via clarifying Qs): a **standalone new folder** (not folded into `desktop/` #009, not a route in `landing/`) — a lean local web app with a small file-watch server. It should reuse `landing/`'s design tokens the way `desktop/` did (copied tokens, no Next dependency).

Adjacent prior art: idea **#009** (Ralphy Desktop) already specifies an Electron project panel with a file watcher pushing live updates — this app is the browser-only, no-Electron cousin of that panel and may later fold into it.

## What

A folder (proposed `studio/`) holding a two-part local app:

- **Server** (`studio/server/`): a tiny local HTTP + WebSocket service that (a) lists projects from `workspace/projects/`, (b) lists a selected project's artifacts (walk `artifacts/**` per #105, with legacy `assets/`+`refs/` fallback until #106 lands), returning kind + path + mtime + size, (c) serves the media bytes, (d) watches the selected project dir (chokidar or `fs.watch`) and pushes create/change/unlink events over WS for real-time grid updates. Read-only — it never mutates the project (honors append-only invariant #14).
- **UI** (`studio/src/`): Vite + a small framework (or vanilla), brand tokens copied from `landing/`. Layout per the brief:
  - **top-left selector**: workspace picker (#108) above the project picker — choose workspace → its projects populate; choose project → its grid loads,
  - **artifact grid** (dense, thumbnailed, grouped/filterable by kind — images/videos/voiceover/music/...),
  - **preview modal** on click (image zoom, `<video>` player, `<audio>` player for VO/music, text for prompts/captions),
  - **live updates**: WS events add/replace/remove grid tiles without reload.

Runs foregrounded by the user in their own shell (`bun run dev` in `studio/`) — **not** auto-launched by the agent (invariant #5). Keep it stylish-but-simple, matching the dark dense-grid reference.

## Why it matters

Visual review is the one thing the CLI can't give: scanning 40 re-rolls, comparing `.vN` variants, hearing a VO, spotting a bad frame. A live grid turns "agent generated something, let me `ls` and `open`" into a glance. It also de-risks #009 — the server + grid + modal + watch built here is directly liftable into the Electron renderer's project panel later.

## Scope / acceptance

- New top-level `studio/` folder with its own `package.json`, `README.md` (how to run), and copied design tokens (document the source so they can be re-synced from `landing/`).
- `studio/server/`: endpoints `GET /api/projects`, `GET /api/projects/:id/artifacts`, `GET /api/projects/:id/file?path=...` (path-traversal-guarded, scoped to the project dir), and a WS endpoint emitting `{type: add|change|unlink, kind, path, mtime}`.
- `studio/src/`: project selector (top-left), kind-grouped artifact grid with thumbnails, click-to-open modal supporting image / video / audio / text previews.
- Live: dropping a new file into the watched project's `artifacts/` makes a tile appear within ~1s, no manual refresh; deleting removes it; re-roll (`.vN`) appears as a new tile.
- Read-only guarantee: no code path under `studio/` writes/renames/deletes inside `workspace/projects/`.
- `bun run dev` (in `studio/`) starts server + UI; documented in `studio/README.md`. Agent must NOT auto-launch it (invariant #5) — README instructs the user to run it foreground.
- Reads the #105 `artifacts/` layout; degrades to legacy `assets/`+`refs/` while #106 is pending.
- Smoke: a tiny test (or documented manual check) that `/api/projects` lists real workspace projects and `/api/projects/:id/artifacts` returns the expected kinds for one fixture project.

## Notes

- **Sequence after #105 + #108** (so it reads the `artifacts/` layout + workspaces natively); works against legacy layout in the meantime via the same fallback the CLI uses.
- Cross-links: **#009** (Ralphy Desktop — same panel shape; this is the standalone web precursor, keep the server/UI cleanly liftable into the Electron renderer), **#105** (artifacts layout) / **#108** (workspaces + `.ralphy/` root — adds the workspace selector) / **#106** (migration to the layout it browses).
- Stack: lean over heavy — Vite + Bun server (`Bun.serve` gives HTTP+WS in one) is the natural fit given the repo is all-`bun`. No Next, no Electron here.
- Thumbnails: generate on the fly server-side (sharp/ffmpeg) or lazy-load originals with CSS sizing for the MVP — decide during build; originals-with-lazy-load is the simpler MVP.
- Out of scope: editing/generating from the UI, auth, remote hosting. Local read-only viewer only.
