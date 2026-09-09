# Electron Media Workbench Design

## Goal

Build a fast macOS media workbench for a user-selected `.ralphy` library. The
application is organized around Ralphy workspaces and projects, not a global
asset dump. It must remain responsive against the real 64 GB library with 30
workspaces, more than 150 projects, and more than 17,000 media files.

Electron is an implementation detail, not permission to move filesystem work
or unbounded DOM trees into the renderer.

## Product Decisions

- The app is an Electron + React macOS application.
- The user selects a `.ralphy` directory. The app never reads deprecated
  `config.json.activeWorkspace`.
- Last library, workspace, and project are app-local preferences.
- Startup publishes a shallow workspace/project catalog only.
- A project is recursively indexed only after explicit or app-local restored
  selection.
- Filesystem changes appear without a manual refresh.
- Delete means `shell.trashItem`, never permanent deletion.
- Review annotations live under `.ralphy/media-library/library.json`.
- The primary viewer replaces the project grid in the same window.

## Navigation

The route hierarchy is:

```text
Library -> Workspace -> Project -> Asset
```

There is one contextual sidebar:

- Library route: searchable workspaces sorted by recent activity.
- Workspace/project/asset routes: projects from one workspace, with Back.
- Workspace and project columns are never visible together.

Library and workspace routes contain operational summaries, not asset grids.
Project entry defaults to Overview and exposes Finals, Assets, Refs, Units,
and Files.

## Process Boundaries

### Main Process

- Owns window lifecycle, dialogs, app-local settings, Trash, Finder, clipboard,
  and bounded text reads.
- Owns one recursive `fs.watch` FSEvents stream for `workspaces/` plus a small
  watcher for root registry metadata.
- Validates every root, project reference, and file path at the trust boundary.
- Never synchronously traverses a project on the Electron main thread.

### Scanner Worker

- Produces the shallow catalog.
- Recursively scans exactly one selected project.
- Classifies Ralphy entities and reads bounded metadata.
- Streams the selected project's generation ledger and caches incremental
  results.
- Supports cancellation. Only one project scan owns the worker slot; a newer
  request replaces the pending request.

### Renderer

- Receives serializable snapshots through the preload bridge.
- Holds navigation, visible query, selection, and presentation state.
- Renders only virtualized visible grid rows.
- Never receives Node or arbitrary filesystem access.

## Ralphy Model

Workspace summaries include name, description, project count, shared/unit
counts, and derived recent activity.

Project summaries include name, brief, status, phase, final state, platform,
aspect ratio, spend when known, and recent activity. Direct bounded reads of
`production-plan.json`, registry records, and known top-level contracts are
allowed. Catalog construction must not recurse through project media.

Project items are classified as final render, generated artifact, reference,
unit asset, lifecycle document, production file, or other project file.
Generation attribution includes provider/model, operation, timestamp, and
cost when available.

## Live Sync

The watcher emits changed paths only. The main process routes them:

- selected project path -> debounce and rescan that project;
- known inactive project media -> no project scan;
- workspace/project structure or registry metadata -> shallow catalog refresh;
- annotation store writes -> ignored by media routing.

The renderer rejects stale catalog/project/ledger generations.

## Performance Budgets

- Opening `.ralphy`: no recursive media scan and no asset rows.
- Shallow catalog target: under 250 ms warm on the real library.
- Representative 150-250 file project scan: under 300 ms excluding previews.
- Project switch feedback: under 100 ms.
- Scroll work: only visible rows plus small overscan.
- Preview decode concurrency: 4 images and 2 video metadata requests.
- Thumbnail memory budget: 192 MB maximum, measured and adjustable.
- No unbounded `Promise.all`, media elements, observers, or object URLs.
- Background/hidden project work is cancelled on route changes.

## Visual System

The reference is Codex Desktop's quiet, dense macOS shell combined with
Ralphy's rose/amber identity. It must not resemble a debug table or a marketing
page.

- Titlebar: 44 px.
- Sidebar: 280 px, contextual rows 36-40 px.
- Inspector: 320 px and visible only for a selection.
- Minimum window: 1100 x 720.
- Primary/body text: 13-14 px.
- Metadata: 12 px minimum.
- Section headings: 13-16 px; no oversized dashboard typography.
- Radius: 4, 6, or 8 px only.
- Hairline separators only between structural regions.
- No gradients, glow, decorative blobs, nested cards, or broad shadows.

Core colors:

```text
canvas       #121212
sidebar      #1B1B1B
raised       #222222
hover        #292929
selection    #333033
divider      #343434
primary      #F1F1EF
secondary    #AAA9A5
muted        #767571
focus rose   #E778A3
amber        #E9B35F
approved     #67B982
rejected     #DA7474
```

Rose is for selection/review focus. Amber is for lifecycle and spend. Neither
is a page background.

## Main Surfaces

### Library

Shows context, totals, recent workspaces, and work requiring attention. It does
not duplicate every sidebar row or leave a blank canvas.

### Workspace

Shows workspace description, project/final/phase/spend summary, recent
projects, and shared/unit shortcuts. Selecting a project enters it.

### Project

Keeps a compact production header visible in every mode: phase/status,
platform/aspect, final state, spend, next expected step, and activity.

Grid controls occupy one or two readable bands. Search, type, review, sort,
group, intermediate state, and grid size are visible without opening a hidden
settings panel.

### Asset Viewer

Replaces the grid. Supports image, video, audio, text, Markdown, and PDF.
Back restores mode, query, selection, and scroll position. Previous/next,
keyboard arrows, Command-[, Escape, and mouse thumb Back are supported.

## Review Workflow

Statuses are Unreviewed, Approved, Shortlist, Needs Work, and Reject. Users can
also set favorite, 0-5 rating, tags, and notes.

`Copy for Agent` writes concise Markdown containing project context, absolute
paths, review state, notes/tags, and generation attribution/cost. It is
available from tiles, inspector, and viewer.

## Validation

- Pure catalog/scanner/query/annotation tests use temporary `.ralphy` fixtures.
- Renderer state and interaction tests cover navigation, filters, review, and
  viewer history.
- An Electron smoke test opens a fixture and validates preload IPC.
- Benchmarks run on the real library without mutating it.
- Visual screenshots are checked at 1440x900 and 1100x720.
- Final testing creates one temporary project fixture for live sync and Trash.

