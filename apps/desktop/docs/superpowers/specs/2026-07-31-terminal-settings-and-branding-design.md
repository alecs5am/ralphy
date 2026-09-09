# Ralphy Media Terminal, Settings, And Branding

## Scope

Turn the existing bottom-panel shell into a real global terminal workspace,
add an app-level settings screen reached from the profile footer, and add
restrained Ralphy identity to the existing neutral workbench. The media
catalog, selected-workspace navigation, project scanner, annotation store,
watcher, and file authorization rules remain unchanged.

## Terminal Product Model

The terminal workspace is global to the application rather than scoped to a
workspace or project. Every new terminal starts in the canonical active
`.ralphy` library root. Changing workspace or project does not move, replace,
or terminate existing shells.

`Cmd+J` toggles only the bottom panel's visibility. The terminal component,
renderer buffers, PTY sessions, and child jobs stay alive while the panel is
hidden or while the settings screen is open. Opening the panel for the first
time creates one terminal automatically. The plus button creates another
terminal in the current `.ralphy` root.

Each terminal tab displays the `.ralphy` library name and shell name. A
middle-click closes the tab and terminates its PTY. Closing the last tab leaves
an empty terminal workspace; the next `Cmd+J` or plus action creates a new
session. All PTYs are terminated when the application actually quits.

## Terminal Architecture

Use `@xterm/xterm` in the renderer and `node-pty` in the Electron main process.
`@xterm/addon-fit` keeps rows and columns synchronized with pane dimensions,
and `@xterm/addon-web-links` provides normal link behavior without enabling
non-HTTP protocols.

The main process owns a `TerminalManager` with a bounded map of PTY sessions.
It launches `process.env.SHELL` with login-shell arguments, `TERM=xterm-256color`,
`COLORTERM=truecolor`, the inherited environment, and a canonical `.ralphy`
cwd captured from the active media session. The renderer never supplies an
arbitrary filesystem path. The manager validates session identifiers,
dimensions, and write payload sizes at the IPC boundary.

IPC methods cover create, write, resize, and kill. Main-to-renderer events
cover output and exit. A renderer can subscribe once and route events to the
matching xterm instance. Output is bounded per event and PTY count is capped at
16 to prevent accidental process exhaustion.

The terminal renderer stays mounted after the library is open. Hidden state
uses zero layout height and disabled interaction rather than conditional
unmounting. A `ResizeObserver` runs the fit addon only for visible panes.

## Tabs, Splits, And Resizing

The renderer stores a recursive layout tree:

- a leaf contains an ordered tab list and one active terminal id;
- a split contains an axis, ratio, and two child nodes.

Tabs can be reordered within a leaf, moved into another leaf, or dropped on
the top, right, bottom, or left edge of a pane to create a split. A visible
drop overlay communicates the target before release. Empty leaves collapse
and adjacent redundant splits normalize after a move or close.

Split gutters use pointer capture and clamp both children to at least 160px
wide or 96px tall. Horizontal and vertical toolbar actions provide an
accessible alternative to drag-and-drop. The bottom panel retains its existing
outer min/max resize limits.

## Settings Navigation

The profile footer becomes one full-width custom trigger. Its portal popover
contains a profile header and one command: Settings. `Cmd+,` opens the same
destination. Settings is an app-level view that replaces the workbench
surface without resetting its route, panel state, media selection, or
terminals. "Back to app" returns to the exact previous workbench state.

The settings sidebar contains General, Profile, Appearance, Providers,
Terminal, and About. The main surface uses compact grouped settings rows rather
than nested cards. Controls are functional for local mock state, but provider
secret fields are never persisted to localStorage or logged. Provider rows
cover OpenRouter, ElevenLabs, HeyGen, and Fal with masked key inputs and
explicit unconfigured status.

General includes the active `.ralphy` path and library change action.
Appearance includes system/dark theme presentation controls and reduced
motion. Terminal includes default shell display, font size, cursor style, and
scrollback. Profile and About provide local identity and build information.

## Ralphy Identity

Copy the existing `ralphy-web` mascot asset into the desktop repository so the
desktop app does not depend on a sibling checkout at runtime.

Use the mascot in three restrained places:

1. a small persistent peek above the profile footer;
2. the settings sidebar brand lockup;
3. terminal empty state and boot state.

The mascot remains white/neutral with violet used only for small interaction
accents. It does not replace the user's deterministic profile avatar and does
not become a large decorative illustration over working content.

The image viewer background changes from diagonal triangles to a neutral black
dot grid with low-contrast major points. The pattern must remain visible around
transparent images but never compete with the asset.

## Error Handling And Lifecycle

- PTY spawn failures produce a terminal-local error state and do not crash the
  media workbench.
- PTY exit updates the tab status and keeps scrollback visible until the user
  closes or restarts the tab.
- Write and resize requests for unknown sessions are ignored safely after
  validation.
- Renderer teardown unsubscribes from IPC but does not kill PTYs unless the
  user explicitly closes tabs or the app quits.
- Library changes do not retarget existing shells. New tabs use the newly
  active canonical `.ralphy` root.
- Native `node-pty` binaries are rebuilt for the installed Electron version
  and copied into the packaged application.

## Acceptance

- First `Cmd+J` opens the panel and displays the user's configured interactive
  login-shell prompt rooted at the active `.ralphy` directory.
- Repeated `Cmd+J` leaves commands and jobs running.
- New tabs, middle-click close, split creation, tab moves, and split resize
  work with mouse and keyboard-accessible toolbar actions.
- Changing workspace or project does not affect existing terminal sessions.
- Settings opens from the profile menu and `Cmd+,`, and Back to app restores
  the existing workbench.
- Provider mock fields never persist secrets.
- The mascot is recognizable but does not reduce information density.
- Image viewer surfaces use the new dot grid.
- Unit tests, typecheck, production build, Electron smoke, packaged-app launch,
  PTY command execution, resize, hide/show persistence, and process
  termination checks pass.
