# Ralphy Media Interaction Polish And Panels

## Scope

Apply the approved second-pass references to the Electron renderer without
changing the Ralphy catalog, project scanner, annotation store, file watcher,
or IPC trust boundary. The application remains workspace-first: whenever a
library is open, exactly one workspace is active in the main area.

## Navigation And Persistence

- `Cmd+B` toggles the left sidebar.
- The sidebar header owns the toggle while open. When closed, the main header
  owns the toggle and navigation history controls beside the macOS traffic
  lights.
- The workspace control is a real styled selector, not a route to an
  intermediate workspace list.
- Opening or restoring a library selects the last valid workspace. If no valid
  preference exists, select the workspace with the newest activity.
- Selecting a workspace opens its overview; selecting a project opens that
  project while retaining the workspace context.
- Persist sidebar, right panel, bottom panel, workspace view, workspace, and
  project choices in app-local browser preferences.

## Main Header And Panels

The main header has no bottom rule. Breadcrumb text uses stronger contrast and
the right edge contains two independent icon buttons:

1. right details panel;
2. bottom terminal panel.

The right panel displays the existing asset inspector when an asset is
selected and a compact context summary otherwise. The bottom panel is a
functional shell with a Terminal tab, an idle prompt, and a close control; it
does not start a subprocess in this pass.

## Workspace Screen

The workspace overview receives the same surface, typography, and corner
treatment as the asset workbench. Projects support grid and list presentation,
with grid selected by default. Both modes preserve activity sorting and expose
project phase, final state, cost, and recent activity.

## Custom Controls

Use accessible headless Radix primitives for workspace, grouping, and sorting
selectors. No native `<select>` remains in the renderer. Triggers, content,
items, keyboard focus, selection marks, and open/close motion share one
application component and token set.

The profile footer uses a deterministic local Boring Avatar generated from the
current user/library identity. It never fetches a remote image.

## Motion

Use Motion for React with user reduced-motion preference respected.

- Sidebar and utility panels animate on mount/unmount.
- Workspace grid/list changes crossfade and reflow with layout animation.
- Obvious selected/pressed states use restrained 90-220ms transitions.
- Double-clicking a media card opens a modal lightbox. The card and modal use a
  shared `layoutId`, while the backdrop fades independently.
- The underlying virtualized grid stays mounted, preserving scroll position.
- Escape, the modal close control, the macOS mouse back button, and the
  existing previous/next controls remain functional.

## Virtual Grid Geometry

The card overlap is caused by measuring absolutely positioned virtual rows
while their responsive child height changes. Replace live row measurement with
one deterministic geometry function derived from viewport width, target card
width, gap, preview ratio, and metadata height. Every virtual item row receives
an explicit height. Column changes trigger one virtualizer remeasure, and cards
cannot shrink below that row height.

## Visual System

Neutral surfaces replace the blue-cast graphite:

- canvas `#181818`;
- primary raised surface `#2d2d2d`;
- intermediate neutral steps without blue channels;
- indigo/violet remains an interaction and Ralphy-brand accent only.

Increase component radii to 8/10/14/18px and keep pills circular. Apply native
`corner-shape: squircle` to cards, buttons, fields, menus, dialogs, panels, and
project cards. Remove the main header rule and avoid decorative content rules.

## App Icon

Use the supplied `r01-glossy-3d.v1.png` as the exact icon artwork. Remove only
the border-connected white canvas so macOS receives transparent outer corners;
do not regenerate, recolor, redraw, or alter the mascot.

## Acceptance

- Restoring a valid library never lands on an all-workspaces screen.
- `Cmd+B` and both header panel buttons work and expose accurate ARIA state.
- Workspace selection, grouping, and sorting use styled Radix controls.
- Workspace projects default to grid and can switch to list.
- Virtual rows do not overlap at minimum, default, or wide window sizes.
- Media opens as a shared-layout modal and returns to the same grid position.
- Markdown, video, audio, image, PDF, review, Trash, and Copy for Agent behavior
  remains intact.
- Neutral computed surfaces match `#181818` and `#2d2d2d`.
- The packaged app contains the supplied mascot artwork and valid `.icns`.
- Unit tests, typecheck, production build, Electron smoke, benchmark, package,
  codesign verification, and live packaged-app QA pass.
