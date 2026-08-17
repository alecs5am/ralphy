# Project Tabs Visual Polish

## Status

Approved in conversation on 2026-08-17. This is a visual and interaction pass
over the existing responsive Project tabs. It keeps all current controllers,
IPC contracts, pagination, mutations, and seeded Denti AI history intact.

## Goal

Make Overview, Documents, Media, Compositions, Units, and Activity feel like
one carefully designed desktop workspace at 2K, while remaining usable at the
existing medium and narrow container widths. Fix clipped selection geometry,
improve readability, and give each content type an appropriate presentation.

## Shared Interaction Language

- Increase typography only inside Project tab content: 13-14px primary text
  and 12-13px metadata. Do not change titlebar or sidebar density.
- Virtual master lists have 6px horizontal breathing room and a 4px visual gap
  between rows. The virtual row size includes that gap so items never overlap.
- Hover applies only to unselected rows. Selected, hover, and focus states keep
  identical dimensions and radii; focus rings render inside the available box.
- Use borderless surfaces and low-contrast tonal separation. Borders appear
  only where they clarify structure.
- Preserve semantic buttons, accessible names, keyboard behavior, focus
  visibility, scroll memory, cursor paging, and reduced-motion behavior.

## Documents

- Keep the virtualized master/detail architecture and sticky search/header.
- Give list rows a stable inset selection surface with readable title and
  metadata. No row state may touch or clip against the pane edges.
- Present the preview as a centered reading canvas within the detail pane with
  a 960px maximum width. Markdown uses a readable prose measure; JSON, text,
  and editor content are left-aligned inside that centered canvas.
- Use 14px reading text and 13px monospace code with a comfortable line height.
  The preview surface grows naturally instead of filling empty space with a
  featureless gray slab.

## Compositions and Units

- Apply the same master-list spacing and state geometry as Documents.
- Revision rails receive internal edge padding and gaps included in their
  virtual geometry, so selected and focused revisions are never clipped.
- Keep previews visually primary, with compact metadata and technical details
  remaining collapsed. Existing mutation and selection behavior is unchanged.

## Activity

- Keep virtualized paging and date grouping.
- Draw a continuous vertical timeline. Each event uses a Lucide action icon in
  a restrained semantic color instead of a dot: document, generation/run,
  composition, unit, feedback, completion, and archive categories.
- Milestones receive stronger icon treatment and text weight, not a full-width
  background card. Day headers interrupt the line cleanly.
- Derive labels and icon categories from the existing action/entity strings;
  do not add filters or expand the Activity DTO.

## Media

- Replace fixed-height rows with a virtualized masonry board. Keep cursor
  paging, preview scheduling, selection, keyboard controls, context actions,
  density control, and the seven-column maximum.
- Image and video cards learn their intrinsic aspect ratio from the existing
  preview element. The in-memory preview cache stores that ratio so cards
  settle once and remain stable during the session.
- Before metadata loads, and for audio/document/unknown media, use a
  deterministic aspect-ratio fallback derived from media kind and stable card
  identity. This gives nonvisual files varied but repeatable board proportions.
- Place each item in the currently shortest column. Virtualize individual
  positioned cards against the scroll viewport rather than rendering all
  records or using CSS columns, preserving performance for large libraries.
- Show the preview at its natural card ratio with compact title and metadata
  below it. Selection remains an inset ring on the preview surface.

## Overview

- Use a low-boxing two-column composition at wide widths: project state,
  production stream, and recent activity form the main narrative; media,
  documents, compositions, units, and deliverables form the supporting rail.
- Present top-level metrics as one calm horizontal band. Missing metrics do not
  reserve empty cells.
- Use spacing, type scale, icons, and section rhythm for hierarchy rather than
  repeating identical raised cards around every group.
- Reuse only data already present in `ProjectOverviewDto`; do not load media
  previews or add decorative placeholder data from a new API.
- Preserve every existing navigation action and compact empty state.

## Responsive Behavior

- The maximized 2K window is the primary layout target.
- At medium widths, master/detail panes remain side by side while supporting
  grids reduce columns and secondary copy truncates safely.
- Below the existing 720px project container breakpoint, master/detail panes
  stack, overview becomes one column, activity metadata wraps, and masonry
  reduces to the number of columns the density control can support.
- No tab introduces horizontal page scrolling.

## Verification

1. Use the archived Denti AI project `Denti Perio Pitch 001` and inspect all six
   tabs in the maximized 2K Electron window.
2. Verify hover, selected, focus, keyboard, double-click/open, context menu,
   sticky controls, independent scrolling, cursor append, and scroll restore.
3. Exercise image, video, audio, document, and unknown media cards and confirm
   stable masonry placement after previews load.
4. Inspect medium and narrow project-container widths, then restore 2K.
5. Add one focused runnable test for masonry geometry and update existing
   Project UI tests for list spacing and timeline icons.
6. Run typecheck, focused tests, the full Bun test suite, and the production
   build. Leave the current Electron app running on Denti AI.

## Non-goals

- No new package, component framework, database fixture, schema, IPC method, or
  CLI contract.
- No global typography change outside Project tabs.
- No Activity filtering from an incomplete client-side page.
- No eager rendering of the complete media library.
- No unrelated refactor or generalized design-system abstraction.
