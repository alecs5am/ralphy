# Ralphy desktop

Ralphy Media is a macOS Electron workbench for reviewing files produced inside
Ralphy workspaces and projects. It opens a user-selected `.ralphy` directory and
does not depend on the deprecated `activeWorkspace` setting.

## Product model

- The library view indexes workspace and project metadata without scanning every
  asset.
- A workspace is always the active context; its projects are sorted by recent
  filesystem activity.
- Opening a project starts a cancellable worker-thread scan for that project only.
- The project overview separates Ralphy finals, generated artifacts, references,
  reusable units, lifecycle documents, and other files.
- The asset grid is virtualized and limits concurrent image and video previews.
- Files created by Ralphy appear through the macOS recursive filesystem watcher.
- Images, video, audio, Markdown, text, JSON, and PDF open in the main content
  area. Back returns to the same grid position.

Review state includes shortlist, approved, needs-work, reject, favorite, rating,
tags, and notes. `Copy for Agent` places a path-aware feedback block on the
clipboard. Destructive deletion uses the macOS Trash.

Review metadata is stored at:

```text
.ralphy/media-library/library.json
```

Generated files are never modified when review metadata changes.

## Run

Requires Bun and macOS. This package lives in `apps/desktop` inside
[`alecs5am/ralphy`](https://github.com/alecs5am/ralphy). Run these commands
from this directory, or use `bun run install:desktop` and `bun run start`
from the repository root.

```bash
bun install --frozen-lockfile
bun run start
```

For renderer-only development with fixture data:

```bash
bun run dev
```

## Validate

```bash
bun run typecheck
bun run test
bun run build
bun run smoke
bun run benchmark
```

The benchmark uses a real `.ralphy` path when passed as an argument, or the
repository fixture path by default:

```bash
bun run benchmark /path/to/repository/.ralphy
```

## Package for macOS

```bash
RALPHY_CORE_BIN=/absolute/path/to/approved/ralphy bun run package:mac
```

Packaging verifies the runtime version and SHA-256 against `scripts/bundled-core.mjs`.
Without an explicit `RALPHY_CORE_BIN`, it reads `build/core/ralphy` in this package.
Place the approved executable there or provide its absolute path; the old desktop
checkout is not required.

The signed development build is written to `release/Ralphy Media.app`.

## Architecture

```text
Electron main
  media session epoch + validated IPC
  shallow catalog and project worker
  recursive filesystem watcher
  tokenized ralphy-media:// file protocol
  macOS Finder, clipboard, open, and Trash operations

React renderer
  contextual workspace/project navigation
  project overview and explicit filter controls
  virtualized media grid and in-place viewer
  review inspector and Copy for Agent
```

The desktop package consumes Ralphy's documented CLI/bridge and filesystem
contracts. The runtime remains independently buildable and testable.
