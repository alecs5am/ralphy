# Project Tabs Responsive Redesign

## Status

Approved in conversation on 2026-08-17. The existing Workspace Projects redesign
is the visual reference: full-width responsive composition, calm borderless
surfaces, consistent radii, and stable hover/selection geometry.

This spec supersedes only the presentation choices for Project tabs in
`2026-08-11-project-workbench-ui-overhaul-design.md`. Existing controller,
paging, scroll-memory, IPC, safety, and domain behavior remain unchanged.

## Goal

Make all six Project tabs useful and visually coherent on a 2K desktop while
remaining readable at medium and narrow widths. Preserve current functionality
and data contracts. Verify the result against the archived Denti AI project
`Denti Perio Pitch 001`, supplementing only the missing historical records
needed to exercise Overview and Activity.

## Non-goals

- No new design system, UI framework, dependency, route, or domain abstraction.
- No controller, IPC, pagination, or database schema changes for presentation.
- No new editing, bulk-action, filtering, or navigation features.
- No replacement of existing Denti AI documents, media, runs, compositions,
  units, or other real records.
- No attempt to normalize every Project component into a shared component
  library. Reuse existing markup and styles where they already fit.

## Shared Project Shell

- Project content consumes the full available main-region width. Remove the
  Overview-only 1440px cap and any equivalent artificial centering on 2K.
- Use the established responsive page padding and 4/8 spacing rhythm from the
  Workspace Projects page.
- Use `--canvas` as the page and `--raised` / `--panel-solid` for semantic
  surfaces. Avoid high-contrast outer borders and nested border boxes.
- Keep radii consistent across cards, previews, rows, and empty states. Hover,
  focus, and selection must not change radius, dimensions, or layout.
- Keep Project header and tabs compact at the top. Only the active tab's body or
  its existing pane owners scroll.
- Keep existing keyboard controls, focus rings, accessible names, loading
  statuses, errors, and unsaved-document guards.
- Master/detail layouts use a roughly 320px master pane and a flexible detail
  pane on wide screens. Below the existing 720px project-container breakpoint,
  they stack vertically without horizontal overflow.

## Overview

- Use a full-width adaptive dashboard rather than a narrow centered column.
- Keep Current state, Media library, Production stream, and Deliverables as
  distinct calm cards with balanced column spans on 2K.
- Metrics, when present, remain a responsive card band rather than separators
  inside one large panel.
- Collapse missing secondary content into compact empty copy; do not reserve a
  large blank surface.
- Preserve current exact navigation to Documents, Media, Compositions, and
  Units.

## Documents

- Keep the current virtualized master/detail interaction and independent scroll
  owners.
- Give the master pane enough room for titles and metadata, with the search
  control sticky at its top.
- Render rows as borderless interactive surfaces with stable hover, selected,
  and focus states.
- Use the remaining width for the document surface. Preserve the readable
  maximum line width inside the full-width detail pane.
- Replace the giant blank detail slab with a compact centered empty state on a
  calm surface.
- Keep the document header sticky and visually connected to the document body.

## Media

- Keep the full-width virtual grid and current filters, density control,
  preview scheduling, modal, and paging behavior.
- Make the toolbar compact and responsive: filters wrap first, count and
  density remain legible without forcing the grid narrower.
- Constrain effective tile density so a 2K window does not turn cards into
  unreadable thumbnails. Existing user density choices still work within the
  supported geometry stops.
- Use rounded media previews tightly contained within borderless cards. Keep
  title and useful metadata readable and visually secondary.

## Compositions

- Preserve the virtualized composition master, horizontal revision rail,
  build/output preview, mutations, and technical disclosure.
- Present the detail as one coherent work surface: compact sticky identity and
  actions, revision rail, then the selected revision content.
- Make Output preview the primary visual block when available. Empty preview
  copy remains compact and centered instead of dominating a large blank panel.
- Use calm cards for meaningful sections and low-contrast separators only where
  they clarify hierarchy.

## Units

- Use the same master/detail geometry and interaction language as Documents and
  Compositions without introducing a new shared component abstraction.
- Keep the unit list compact and readable with stable badges and selection.
- Treat revision preview, Items, and Presentations as distinct calm sections in
  the detail pane.
- Keep the revision rail horizontal, technical details collapsed, and current
  selection/mutation behavior unchanged.
- Use the same compact empty-detail treatment as Documents.

## Activity

- Keep the current virtualized, cursor-paged timeline and day grouping.
- Present each event as a compact row/card with time, humanized action, and
  entity. The current Activity DTO does not expose payload data, so the UI must
  not add an IPC contract solely for decorative context.
- Give lifecycle milestones such as completion and archival a restrained status
  treatment; do not add bright borders or decorative tag clouds.
- Keep the empty state compact and centered when no events exist.
- Do not add filters until the existing data contract can filter the complete
  timeline.

## Denti AI Fixture Data

Use the live local database only for the archived project:

- Workspace: `Denti Ai`
- Project: `Denti Perio Pitch 001`
- Workspace ID: `ws_0f2fd33c-bfc6-4a75-83b4-2e1966aafe9f`
- Project ID: `prj_2d9cceda-aacb-4675-821d-dd79d9623d68`

Insert approximately 16-20 realistic historical Activity rows across the
project's existing timeline. Events should cover brief and production-plan
creation, source import, transcription, generation runs, composition revisions,
final selection, unit assembly, delivery completion, and project archival.
Actions should read like plausible production history and use existing entity
IDs where a matching real record exists. The fixture rows remain in the
archived project without additional mock/test labels.

Add two completed iterations and a small set of resolved feedback rows only if
needed to exercise the approved Overview layout. Keep every insert scoped to
the Denti AI workspace/project and do not update or delete existing records.
Perform the inserts in one transaction after a recoverable database backup.

## Verification

1. Start with the user's maximized 2K Electron window and inspect all six tabs
   in `Denti Perio Pitch 001`, including selected and empty master/detail states.
2. Inspect representative medium and narrow layouts, including the existing
   720px container transition, then restore the maximized 2K window.
3. Verify hover, selection, focus, scroll ownership, sticky controls, virtual
   paging, document opening, composition selection, unit selection, media
   density, and Activity day grouping.
4. Run the repository typecheck, focused Project-screen/design tests, full test
   suite, and build. Report the known unrelated
   `tests/design-system.test.ts` split-vertical geometry failure separately if
   it remains unchanged.
5. Leave the current Electron development app running on the Denti AI project.
