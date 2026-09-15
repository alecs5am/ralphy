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

## Creative experiments in chat

The agent can read creatives from a configured MCP, import a source baseline into
a Unit, and save alternatives as Unit revisions. Source metadata and reported
metrics belong in a project document; proposed improvements remain hypotheses.
Text alternatives can use document items and captions. Rendered visual
alternatives need their own artifacts.

Chat supports a declarative MDX card with saved identifiers:

```mdx
<UnitCard workspaceId="ws_id" projectId="prj_id" unitId="unit_id" title="Creative 1" />
```

Place cards on separate lines outside code fences. The card loads the actual
generated version count, with the original shown separately as R0, and opens the
Unit viewer in the right panel without leaving chat. Cards stay within the active workspace. JavaScript expressions,
imports, and event handlers are not supported.

Provider model choices come from the installed provider CLI. Development can
select a different Codex executable with `RALPHY_CODEX_PATH` in an untracked
`.env.local` file; the chosen binary must offer the requested model.

## Run

Requires Bun and macOS. This package lives in `apps/desktop` inside
[`alecs5am/ralphy`](https://github.com/alecs5am/ralphy). Run these commands
from this directory, or use `bun run install:desktop` and `bun run start`
from the repository root.

```bash
bun install --frozen-lockfile
bun run start
```

Development launches use this repository's `cli/index.ts` through Bun. Set
`RALPHY_BIN` to an absolute executable path only to test another runtime.
Packaged applications always use their bundled runtime.

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
bun run package:mac
```

Packaging compiles a standalone CLI from this checkout and exports its current prompt
pack. The app includes both; the receiving computer needs no repository, Bun, or Node
to run Ralphy CLI. The packaged manifest records the binary version and SHA-256.
An explicit `RALPHY_CORE_BIN` remains a legacy override and must match the approved
pin in `scripts/bundled-core.mjs`. Builds target the build machine's architecture.

Codex is a separate prerequisite: install it and sign in on the receiving computer.
MCP connections and generation-provider credentials must also be configured there.

Run `bun scripts/smoke-portable.ts` after packaging to relocate the app into a
temporary directory and check it with a fresh home and no developer tools on PATH.

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
