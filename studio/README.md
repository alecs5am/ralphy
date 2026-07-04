# Ralphy Studio — local artifact browser (#107)

A small read-only web app for visually browsing a project's artifacts —
the dense-grid alternative to `ls`-ing `.ralphy/workspaces/<ws>/projects/<id>/`.
Live: files appear/disappear in the grid as `ralphy generate` writes them,
no reload.

## Run it (you, in your own shell — the agent never auto-launches this)

```bash
cd studio
bun run dev          # builds the Preact/Vite UI, then serves http://127.0.0.1:4860
```

- `STUDIO_PORT=5000 bun run dev` — pick a port.
- `RALPHY_STUDIO_ROOT=/path/to/dir-containing-.ralphy bun run dev` — browse a
  different data root (default: walks up from `studio/` to find `.ralphy/`).
- `bun run dev:api` — API/static server only; useful after a UI build.
- `bun run dev:vite` — Vite UI dev server on `127.0.0.1:4861` with API/WS
  proxied to a separately running `dev:api`.

## What it shows

- **Top-left selector** — workspace picker (#108) above the project list;
  projects sort by most-recently-touched.
- **Artifact grid** — `<project>/artifacts/<kind>/` (#105 layout: images,
  videos, voiceover, music, sfx, captions, fonts, refs + any custom subdir),
  plus `render/` deliverables as an extra group. Filter chips per kind;
  `.vN` re-rolls carry a version badge.
- **Preview modal** — click a tile: image zoom, `<video>` player (range
  requests supported, seeking works), `<audio>` for VO/music, text view for
  prompts/captions, "open raw" link.
- **Live updates** — a WebSocket per selected project (`fs.watch` recursive)
  pushes add/change/unlink; new tiles flash with an accent ring.
- **Large directories** — big file groups are virtualized in the Preact grid,
  so render folders with tens of thousands of frames do not create tens of
  thousands of DOM nodes.

## Workspace Storybook

`/storybook.html` is a workspace-level component browser, not project-level
state. It reads `.ralphy/workspaces/<workspace>/component-stories.mjs`, renders
stories in an iframe, exposes variants + controls, supports replaying animated
stories, and copies agent-friendly refs like:

```text
@component:short-guides/caption/default {"params":{"text":"..."}}
```

## Architecture

```
studio/
  client/src/        Preact/Vite UI source
  dist/              generated Vite build (gitignored)
  server/lib.ts      pure listing/guard helpers (unit-tested)
  server/index.ts    Bun.serve: static UI + JSON API + WS watch (127.0.0.1 only)
  src/               shared CSS + build-missing fallback HTML
  test/              fixture-backed API smoke tests (bun test)
```

- **Frontend** — Preact + Vite builds the browser UI into `dist/`; the Bun
  server serves `dist/` first, then falls back to `src/` only for shared CSS
  and a build-missing HTML page.
- **Backend** — Bun built-ins only (`Bun.serve` does HTTP + WS).
- **Read-only guarantee** — no code path under `studio/` writes, renames, or
  deletes inside the data root (AGENTS.md invariant #14). The file endpoint is
  path-traversal- and symlink-escape-guarded, scoped to the project dir.
- **API**: `GET /api/workspaces`, `GET /api/projects?workspace=`,
  `GET /api/projects/:id/artifacts?workspace=`,
  `GET /api/projects/:id/file?workspace=&path=`, `WS /ws?workspace=&project=`.

## Design tokens

`src/tokens.css` is a hand-copied snapshot of `landing/app/globals.css`
(`:root` palette, accent = the landing's runtime orange). Re-sync by hand when
the landing palette changes — same convention `desktop/` uses.

## Relation to Ralphy Desktop (#009)

This is the standalone web precursor of the Desktop project panel: the
server endpoints + grid + modal + watch loop are designed to be lifted into
the Electron renderer later. Keep `server/lib.ts` UI-agnostic.
