# Project Workbench UI Overhaul

## Status

Approved in conversation on 2026-08-11. The six Claude Design screenshots shared
that day are structural references, not pixel specifications. The production
design remains Ralphy's existing graphite workbench and native interaction
language.

This spec supersedes the presentation and pagination choices in
`2026-08-10-usable-media-and-targeted-workspace-migration-design.md` where they
conflict. Its Core trust boundaries, root-epoch fencing, immutable media
targets, safe provenance contract, and no-raw-path renderer rules remain in
force.

## Goal

Turn the existing Core-backed Project screen into a useful local creative
workbench: a readable project dashboard, real document browser/editor, full
media grid, usable composition and unit inspectors, and a continuous activity
timeline. Keep the current Workspace → Project routing, six project tabs,
controller boundaries, and migrated Denti AI/Nightmaker data.

## Non-goals

- No rollback to the filesystem scanner or the first application's data model.
- No new navigation hierarchy, design system, UI framework, or package.
- No eager full-dataset drain. Local data is still cursor-paged; pages load only
  as the user approaches the end of a visible virtual/list scroll owner.
- No speculative media multiselect, bulk actions, drag bundle, Trash, or review
  workflow. The single-selection interaction must leave room for future
  multiselect without implementing it now.
- No raw locator, absolute path, provider payload, request/response, credential,
  or unbounded metadata in the renderer.
- No fabricated links for DTOs that lack an exact navigable target.
- No `unit.revise` UI until there is a reviewed input model. Existing exact
  unit selection and read surfaces are sufficient for this release.

## Design Language

Reuse `tokens.css`, `workbench.css`, and the established components:

- graphite `--canvas`, `--panel-solid`, `--raised`, `--hover`, `--selected`;
- AWS Diatype and AWS Diatype Mono roles;
- the existing 4/8 spacing rhythm, type scale, focus rings, radii, and native
  squircle selectors;
- structural separators only. Do not place borders around every nested row,
  list, card, and preview;
- `--hover` only for hover and `--selected` plus a calm selection ring for the
  selected row or tile. Do not use the rounded left selection stripe;
- existing `SelectMenu`, `SnappySlider`, Radix Dialog, media preview primitives,
  `MarkdownView`, command buttons, chips, and empty/error states;
- one restrained accent. Status uses semantic dots/badges, not decorative tag
  clouds.

At effective project-content widths below 720px, master/detail views stack. At
720px and above they split. Overview uses one column below 720px, two columns
from 720px, and a semantic 12-column layout from 1200px. Project content is
centered and capped at 1440px where a full-width canvas is not needed.

## Shared Paging And Scroll Contract

Cursor paging remains the Core boundary, but ordinary `Load more` buttons are
removed from all tabs.

- Overview owns the outer page scroll.
- Activity owns one virtualized timeline scroll.
- Media owns one full-width virtual grid scroll.
- Documents, Compositions, and Units lock the outer body and give their master
  and detail panes independent scroll owners.
- Each tab preserves its own scroll position. Master/detail tabs preserve both
  pane positions. A first visit starts at the top.
- Selection preserves the master position and moves/focuses the detail heading
  without moving unrelated tab scroll state.
- When the last visible virtual row enters a small threshold and a non-null
  cursor exists, request exactly one next page. Never drain hidden pages.
- Only one append request per tab may be in flight. Query/filter/root/project
  changes invalidate the cursor generation and reset the affected scroll owner.
- Append failures keep loaded items visible and render a bottom `role="alert"`
  with Retry. Loading more uses a polite status row.

## Project Header And Tabs

Keep the current project header and six tabs. Repair hierarchy and spacing so
the title, description, lifecycle badges, tab bar, and optional actions read as
one header rather than nested panels. Tab controls remain real buttons with
keyboard focus and selected state. The active tab's body consumes the remaining
height without causing the entire application shell to scroll.

## Overview

Overview becomes a dashboard, not a dump of bounded transport DTOs.

- Top row: current project state and media totals.
- Full-width production metrics band where meaningful data exists.
- Production stream: iteration/stage/current runs in compact readable rows.
- Deliverables: latest documents, compositions/builds, and units.
- Distribution and recent activity appear only when data exists.
- Empty secondary sections collapse to a compact empty state or disappear; they
  do not reserve equal columns.
- Copy such as `Recent records (bounded)` and raw UUID walls is removed. Use
  `Latest 5`, human titles/slugs, state, and relative/compact time. Technical IDs
  belong in secondary detail, not the dashboard.
- Media totals and section `View all` controls switch to the corresponding tab.
- Exact Document rows switch to Documents and open that document. Exact
  Composition rows/stages switch to Compositions and open that composition.
  Other rows remain non-clickable when the current DTO cannot provide an exact
  destination.

## Documents

Documents uses a durable master/detail workbench.

### Master pane

- Independently scrollable, virtualized/cursor-appending document list.
- Search runs after a short debounce. Blank/whitespace clears the search and
  never crosses IPC. Literal hyphens, quotes, operators, and punctuation are
  safe search text rather than raw SQLite FTS syntax.
- Search errors use the normal inline error/retry state; validation errors do
  not collapse into `The operation could not be completed`.
- Rows show a prominent `MD`, `JSON`, or `TXT` badge plus a distinguishable
  icon, title, kind, revision/status, and useful secondary metadata.
- Hover uses `--hover`; selected uses `--selected` plus the established calm
  ring. No left stripe. Hovering a neighboring row must remain visually
  distinct from the selected row.

### Detail pane

- Independently scrollable with a sticky header containing title, kind, format,
  current revision, and Read/Edit modes.
- Markdown uses the existing safe `MarkdownView` with the established heading,
  table, code, quote, and list styling.
- JSON is parsed and rendered with small native React token spans for keys,
  strings, numbers, booleans, and null. Invalid/oversized JSON falls back to
  styled plain text; no HTML injection and no highlighter dependency.
- Plain text uses the existing document viewer typography rather than a bare
  browser `<pre>`.
- Edit mode is available for an existing document. It edits title/body in local
  draft state and offers Preview, Cancel, and Save new revision. Save calls the
  existing `document.revise` CAS contract with the displayed head revision.
- A conflict keeps the draft, reloads the authoritative head, and gives a clear
  retry/review choice; it never silently overwrites or automatically retries the
  mutation.
- Unsaved state is visible and changing document/tab asks for confirmation
  before discarding local edits.

## Media

Media returns to one full-width virtual grid. The inline side preview and the
overlay `Open` button are removed; the modal is the sole large viewer.

### Toolbar

Use structured controls, not an unstructured chip cloud:

- Type: All, Image, Video, Audio, Other.
- Generation: All, Generated, Not generated, Unknown.
- Lifecycle/source: the current authoritative Core filter presets.
- Grid density: reuse `SnappySlider` and existing discrete geometry stops.
- Search is not added until Core has a correct bounded media-search contract.

Type and generation predicates run in Core before cursor/limit. Filtering only
the loaded page, draining all cursors, or calling generation detail per tile is
incorrect. `media.list` adds one safe per-card provenance enum so a tile can
show Generated without exposing provider data; provider, model, cost, prompt,
and parameters remain on-demand modal detail.

### Tile interaction

- Single click selects one tile.
- Double-click opens the existing modal.
- Space selects the focused tile and Enter opens it, so double-click is never
  the only accessible path.
- Right-click selects the tile and opens the existing workbench-style context
  menu with Preview, Open externally, Reveal in Finder, and Copy file. Main
  resolves the immutable media target for the requested purpose and performs
  the side effect; renderer never receives a path. On macOS, Copy file writes
  the canonical `file:` URL as the native `public.file-url` pasteboard type so
  Finder and external applications receive a file rather than path text. Trash
  is absent.
- Selection state is a normal single-ID set-compatible model so later
  Cmd/Shift multiselect can be added without changing tile semantics, but this
  release implements only one selected item.
- Tiles show real mounted-only preview, fallback glyph, format/type, compact
  title, duration/size where already safe, lifecycle state, and Generated badge
  when the list contract proves it. No absolute Open button floats over cards.
- The existing preview scheduler/cache/root-epoch and stale-result fencing stay
  intact. Automatic cursor append follows actual grid scroll only.

### Modal

Keep the current accessible modal, provenance inspector, Artifact revision CAS,
loaded-only arrows, Escape/focus return, safe prompts, and null/partial cost
semantics. Move any remaining useful RunObject evidence into the modal. Closing
the side preview must not remove information that is exact and already safe.

## Compositions

Compositions becomes an independently scrolling master/detail surface.

- Master rows show title/slug, format/engine summary, selected/latest badges,
  status, and revision count; one click opens the composition.
- Detail has a sticky header with New draft and state-appropriate primary
  action.
- Revisions render newest-first in a compact horizontal timeline (`R45`, state,
  date, selected/latest), never as wrapping UUID paragraphs.
- The selected revision shows a primary build/output area: latest build state,
  evaluation summary, and exact output preview when available.
- Sources, Inputs, engine/author/iteration fields, and full IDs live under a
  native `details` disclosure named `Technical details`.
- Existing safety guards remain: only sealed revisions can be selected; build
  uses the exact latest eligible revision; failed mutations reload
  authoritatively and never auto-retry.

## Units

Units reuses the Compositions master/detail grammar without inventing a new
domain.

- Master rows show slug, format, selected/latest badges, and updated time. Rows
  are real buttons. Item counts/status appear only when already present in a
  bounded DTO; the UI never drains child pages to synthesize them.
- Detail contains a compact revision timeline, selected/latest controls,
  ordered Items, and Presentations grouped by platform.
- `unit.show`, `unit.revisions`, `unit.items`, `unit.presentations`, and
  nullable-CAS `unit.select` are loaded through named secured IPC and the
  existing project controller.
- Artifact or Document items are navigable only when their exact ref can be
  opened by an existing safe contract; otherwise they remain readable facts.
- Full IDs and external-operation facts remain in `Technical details`.
- No `unit.revise` editor is added.

## Activity

Activity becomes a virtualized timeline with automatic cursor append.

- Rows group by day and show time, action, human target, state, and cost when
  already present in the DTO.
- Refresh preserves appended rows and scroll anchor rather than replacing the
  timeline with page one.
- Live refresh reads only after the previously covered subscription sequence;
  it does not consume the visible history cursor or silently page through old
  backlog.
- If a live sequence gap exceeds one bounded page, catch-up follows only that
  separate new-event cursor until the announced high-water mark. This is not a
  drain of the user's older visible history.
- Unknown entity targets remain plain facts. Exact targets may navigate only
  through already-reviewed actions.
- No category filter is shown until Core can filter the complete timeline; a
  loaded-page-only filter would be misleading.

## Core Contract Changes

Core changes land and are reviewed before Desktop consumes them.

1. `document.search` treats `query` as literal user text. It trims and rejects
   blank input as validation, converts terms to a bounded quoted FTS expression,
   and never forwards raw FTS grammar.
2. `media.list` adds optional scalar axes:

   ```ts
   mediaKind?: "image" | "video" | "audio" | "document" | "other";
   provenance?: "generation" | "not-generation" | "unknown";
   ```

   The axes AND with `filter`/`types`. Kind derives from effective MIME.
   Provenance uses the exact global producer semantics of
   `media.generation.show`, including same-Run succeeded Build-result
   compatibility and global ambiguity before caller visibility.
3. Every returned media card includes `mediaKind` and
   `provenance: "generation" | "not-generation" | "unknown"`. These are safe
   classifications only, not generation detail. Filtering/classification
   happens in the bounded page query, not renderer N+1 calls.
4. Existing page size/cursor family, privacy DTOs, schema version, protocol
   version, and Core contract major remain unchanged unless the implementation
   proves a genuine incompatible contract break. No speculative schema/index is
   added without a query-plan or timing regression showing it is needed.

## Security And Accessibility

- Every new renderer→main action is a named channel in the preload allowlist,
  registered through the existing trusted-sender and root-epoch fence.
- Context-menu file actions accept exact Project + media ref, not a renderer
  path. Main authorizes with Core, resolves a purpose-scoped locator, rechecks
  the active root, then performs the side effect.
- Search strings and editor content are bounded at IPC and Core boundaries.
- All master rows, tiles, tabs, disclosures, menus, and commands are keyboard
  reachable with the existing >=2px, >=3:1 focus treatment.
- Independent panes have accessible labels; loading uses `role="status"`, errors
  use `role="alert"`, and menu/dialog focus returns to a connected fallback.
- Do not add fake `grid`, `table`, or `row` roles without implementing their full
  keyboard semantics.

## Verification

- Core: focused literal-search and media-query contract tests, bridge/privacy
  tests, typecheck/lint, full integration entry point, clean binary smoke.
- Desktop: controller/reducer tests for stale paging/filter/reset behavior;
  mounted production tests for every tab and interaction; production IPC/root
  tests for new channels; Chromium geometry/focus/independent-scroll checks at
  1100×720 and 1360×900; typecheck, full tests, renderer/Electron build, diff
  check, and scoped gitleaks.
- Packaged macOS smoke uses an isolated fixture root first. Only after all code
  and package reviews pass may the installed app be opened read-only against the
  live recovered Denti AI and Nightmaker workspaces. No save/select/build/context
  side effect is used during live verification.
