# Native Media Library Design

## Goal

Build a polished native macOS media library for reviewing files generated under
a Ralphy `.ralphy` directory. The app must open as a normal `.app`, become
interactive immediately, stay synchronized with filesystem changes, and remain
responsive with the current library of more than 70,000 files.

## Product Decisions

The app is a personal, local-first review tool. It does not modify the Ralphy
CLI contract, import source from another repository, upload files, or require an
account. Generated files remain untouched unless the user explicitly moves them
to Trash.

SwiftUI provides the window, navigation, toolbar, grid, inspector, menus, and
keyboard commands. AppKit and native macOS frameworks provide folder picking,
clipboard access, Finder integration, Quick Look, thumbnails, file watching,
and Trash. The app uses no third-party dependencies.

A reproducible build script packages the SwiftPM executable as
`Ralphy Media.app`. The package remains directly testable with `swift test`.

## Library Layout

The selected root must be a `.ralphy` directory containing `workspaces`.
Supported files are indexed only below:

`workspaces/<workspace>/projects/<project>/...`

The app recognizes:

- images: PNG, JPEG, GIF, WebP, HEIC, TIFF, BMP, AVIF, SVG
- video: MP4, MOV, M4V, WebM
- audio: MP3, WAV, M4A, AAC, AIFF, FLAC, OGG
- text: TXT, Markdown, JSON, JSONL, SRT, HTML, CSS, JavaScript, TypeScript,
  MJS, YAML, TOML, XML, CSV, TSV, LOG, Python, and shell scripts
- documents: PDF

Hidden files, packages, dependency/build directories, and internal render work
directories such as `render/work-*` are excluded by default. The user can turn
on "Include intermediates" to inspect those files. Final renders, references,
artifacts, evaluation frames, and ordinary project files remain visible.

## Performance Model

The window appears before scanning starts. Initial scans and reloads run away
from the main actor. The grid receives one immutable result when a scan
completes, and an older result cannot overwrite a newer requested scan.

The filesystem watcher observes `.ralphy/workspaces`, not the whole `.ralphy`
root. This prevents annotation writes from causing media rescans. File events
are debounced and coalesced; a burst during generation results in at most one
active scan and one queued follow-up scan.

Quick Look generates thumbnails asynchronously only for visible cells.
`NSCache` keeps decoded thumbnails in memory. Grid cells never synchronously
decode source images or construct media players.

Filtering, sorting, and grouping operate on the indexed in-memory records.
Search matches filename, relative path, workspace, project, tags, and notes.

## Review Model

Each file may have a `MediaAnnotation`, keyed by `.ralphy`-relative path:

- verdict: unreviewed, keep, maybe, or reject
- rating from zero to five
- favorite flag
- normalized tags
- free-form note
- last-updated timestamp

The decoder migrates the prototype's legacy `rejected` flag to the reject
verdict. Unknown future fields do not prevent the library from opening.

Annotations are stored atomically in
`.ralphy/media-library/library.json`. Edits are debounced so typing a note does
not write on every keystroke. A malformed metadata file never hides indexed
media or gets silently overwritten; the app reports the problem and preserves
the source file.

## Main Window

The window follows familiar macOS media-library conventions:

- source-list sidebar with All, Unreviewed, Keep, Maybe, Reject, Favorites,
  workspaces, and projects
- toolbar with library picker, search, type filter, sort, group, intermediate
  toggle, inspector toggle, and grid-size control
- lazy center grid with Quick Look thumbnails, filename, project context,
  verdict, favorite, and rating indicators
- inspector with a large native preview, selection summary, verdict controls,
  rating, tags, note, file properties, and actions
- bottom status strip with visible count, total count, selection count, and
  scan state

The design uses native semantic colors, materials, SF Symbols, compact
controls, and standard window chrome. It supports light and dark appearances,
Dynamic Type, tooltips, VoiceOver labels, and keyboard navigation.

## Review Workflow

Click selects one item. Command-click toggles an item. Shift-click selects a
range in the current visible order. Inspector actions apply to every selected
item when multiple items are selected.

Available commands:

- set Keep, Maybe, Reject, or Unreviewed
- set rating zero through five
- toggle Favorite
- add or remove tags and edit a note
- select all visible files
- show a Quick Look preview
- open externally or reveal in Finder
- copy absolute paths
- copy a Markdown feedback block for an agent
- move files to macOS Trash after confirmation
- drag files from the grid to another application

`Copy for Agent` includes absolute and relative paths, workspace/project,
media type, verdict, rating, favorite state, tags, and notes. It is suitable
for pasting into Codex, Claude Code, or another local coding agent.

## Failure Handling

An invalid selected folder produces an actionable message and keeps the
previous library open. Scan failures preserve the last successful result.
Unreadable individual files are skipped and counted instead of failing the
entire scan. Trash failures identify the affected file. Canceling the Trash
confirmation makes no filesystem change.

The open panel displays hidden files and starts near the last library. The
last successful root, grid size, filters, grouping, sorting, and inspector
visibility persist in `UserDefaults`.

## Packaging

`scripts/build-app.sh` creates a release build and packages it into
`dist/Ralphy Media.app` with bundle identifier `app.ralphy.media`. The bundle
contains an application icon, version metadata, minimum macOS version, and the
release executable. `scripts/test-app.sh` verifies the bundle, performs a
headless scan, launches it through Launch Services, and confirms that the
process remains alive.

## Validation

Automated tests cover scanning rules, intermediate-file behavior, annotation
migration and normalization, query/filter/sort/group behavior, feedback
rendering, malformed metadata handling, and filesystem-change coalescing where
the logic is platform-independent.

Completion requires:

- `swift test` succeeds with no failures
- debug and release builds succeed
- the existing Electron client still succeeds with `bun run build`
- the packaged app passes `scripts/test-app.sh`
- scanning the real `.ralphy` tree is benchmarked against the prototype
- a UI pass opens the real library, changes filters and selection, previews a
  file, updates and restores an annotation, and exercises Copy for Agent
- the final packaged app is left running with the user's real `.ralphy`
  library open

## Non-Goals

- Cloud or multi-device synchronization
- Editing source media
- A custom database or thumbnail daemon
- Automatic deletion or emptying Trash
- Changes to Ralphy workspace manifests
- App Store signing, notarization, or sandboxing
