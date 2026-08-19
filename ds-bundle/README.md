## How to build with Ralphy Desktop

A dark-only desktop workbench for reviewing generated media. There is no light
theme and no theme switch — `:root` sets `color-scheme: dark` and every surface
token is a dark value. Do not build a light variant.

### Setup

No provider or wrapper component is required: components read their data from
props, and the Ralphy IPC bridge falls back to a built-in mock outside Electron,
so everything renders standalone.

What IS required is the canvas. `styles.css` paints `body` with the app's
surface and type; any container you mount into must inherit it or set it
explicitly, or components render dark-on-white:

```jsx
<div style={{ background: "var(--canvas)", color: "var(--fg)",
              fontFamily: "var(--font-sans)" }}>
  <ProjectHeader project={project} scan={null} loading={false}
                 copyState="idle" onCopyForAgent={copy} />
</div>
```

Two components load images the host app serves — `AiBrandIcon`
(`./assets/ai/<brand>.svg`) and `RalphyMascot` (`./assets/ralphy-mascot.svg`).
Those files are not part of the design system; serve them next to your HTML
entry or expect an empty glyph.

### Styling idiom

Semantic CSS classes plus CSS custom properties. This is **not** a utility-class
system and **not** a props-based theme — components own their class names, and
your own layout glue should use the same tokens rather than hard-coded values.

| Group | Tokens |
| --- | --- |
| Surfaces | `--canvas` `--sunken` `--panel` `--panel-solid` `--raised` `--hover` `--selected` `--pressed` |
| Text | `--fg` `--fg-2` `--fg-3` `--fg-4` |
| Accent | `--accent` `--accent-soft` `--accent-fill` `--accent-line` |
| Status | `--ok` `--warn` `--danger` `--idle` |
| Lines | `--line` `--line-strong` |
| Type | `--font-sans` `--font-mono` `--text-xs` … `--text-xl`, `--leading-tight` `--leading-snug` `--leading-body` |
| Radius | `--radius-sm` `--radius-md` `--radius-lg` `--radius-xl` `--radius-pill` |
| Sizing | `--control-sm` `--control-md` `--control-lg` `--row-md` `--row-lg` `--sidebar-w` `--inspector-w` `--titlebar-h` |
| Spacing | `--space-1` … `--space-8` (4px → 40px) |
| Effects | `--blur` `--ring-select` `--shadow-pop` `--shadow-window` |
| Motion | `--ease` `--dur-fast` `--dur` `--dur-slow` |

Reusable classes you can apply to your own markup: `.command-button` (with
`.is-primary`), `.icon-button`, `.filter-chip`, `.filter-select-chip`,
`.panel-blur` (frosted panel over the canvas), `.main-region` (screen body),
`.screen-header` / `.screen-kicker`, `.inspector-section-heading`,
`.property-row`, `.danger-action`.

Type is small and even: 13px base, regular weight only. No uppercase transforms,
no negative letter-spacing, no 500 weight — the design-system test in this repo
enforces that. Corners use `corner-shape` where supported: `.sq`, buttons and
inputs are squircles, `.pill` / `.dot` / chips are round.

### Where the truth lives

Read the real files before styling: `_ds/<folder>/styles.css` and its
`@import` closure — `tokens/` for the token definitions and `_ds_bundle.css` for
every component rule. Per-component API and usage live in
`components/<group>/<Name>/<Name>.d.ts` and `<Name>.prompt.md`.

### Composition

Screens (`LibraryScreen`, `WorkspaceScreen`, `ProjectScreen`, `SettingsScreen`,
`AssetViewer`) are full surfaces — give them a sized container, not a card.
`ContextSidebar` wants `--sidebar-w`, `Inspector` wants `--inspector-w`.
`AssetViewer` and `AssetContextMenu` portal to `document.body`.

```jsx
<div style={{ display: "grid", gridTemplateColumns: "var(--sidebar-w) 1fr",
              height: "100vh", background: "var(--canvas)" }}>
  <ContextSidebar route={{ kind: "project", workspaceId, projectId }}
                  rootPath={rootPath} workspaces={workspaces} projects={projects}
                  pinnedWorkspaceIds={[]} pinnedProjectIds={[]} searchRequest={0}
                  canGoBack canGoForward={false} onBack={back} onForward={forward}
                  onToggleSidebar={toggle} onOpenSettings={openSettings}
                  onOpenWorkspace={openWorkspace} onOpenProject={openProject}
                  onToggleProjectPin={togglePin} />
  <main className="main-region">
    <ProjectScreen project={project} scan={scan} annotations={annotations}
                   loading={false} includeIntermediate={false}
                   onIncludeIntermediateChange={setIntermediate}
                   onOpenAsset={openAsset} onChangeAsset={changeAsset}
                   onTrashAsset={trashAsset} />
  </main>
</div>
```

# RalphyDesktop (ralphy-desktop@0.1.0)

This design system is the published ralphy-desktop React library, bundled as a single
browser global. All 35 components are the real upstream code.

## Where things are

- `_ds_bundle.js` — the whole-DS bundle at the project root; loads every component to `window.RalphyDesktop`. First line is a `/* @ds-bundle: … */` metadata header.
- `styles.css` — the single stylesheet entry: it `@import`s the tokens, fonts, and component styles (`_ds_bundle.css`). Link this one file.
- `components/<group>/<Name>/<Name>.prompt.md` (example JSX + variants), `<Name>.d.ts` (types), `<Name>.html` (variant grid).
- `tokens/*.css` — CSS custom properties, names verbatim from upstream.
- `fonts/` — `@font-face` files + `fonts.css` (when the package ships fonts).

For a specific component, `read_file("components/<group>/<Name>/<Name>.prompt.md")`.

## Loading

Add these two lines to your page once (React must be on the page first):

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
```

Components are then available at `window.RalphyDesktop.*`. Mount into a dedicated child node (e.g. `<div id="ds-root">`), not the host page's own React root, so the two trees don't collide:

```jsx
const { AgentChatPanel } = window.RalphyDesktop;
ReactDOM.createRoot(document.getElementById('ds-root')).render(<AgentChatPanel />);
```

Wrap the tree in the provider — most components read theme/i18n from context:

```jsx
<PreviewCanvas>{children}</PreviewCanvas>
```

## Tokens

73 CSS custom properties from ralphy-desktop. Names are
preserved verbatim from upstream. They are declared inside `_ds_bundle.css` (this DS ships one compiled stylesheet rather than separate token files).

- **color** (10): `--file-kind-color`, `--fg-2`, `--fg-3`, …
- **spacing** (8): `--space-1`, `--space-2`, `--space-3`, …
- **typography** (2): `--font-sans`, `--font-mono`
- **radius** (5): `--radius-sm`, `--radius-md`, `--radius-lg`, …
- **shadow** (2): `--shadow-pop`, `--shadow-window`
- **other** (46): `--sidebar-column`, `--right-column`, `--sidebar-w`, …

## Components

### general
- `AgentChatPanel`
- `AiBrandIcon`
- `App`
- `AssetContextMenu`
- `AssetTile`
- `BottomPanel`
- `ContextSidebar`
- `Inspector`
- `InspectorPreview`
- `MainHeader`
- `MarkdownView`
- `ProfileAvatar`
- `ProfileMenu`
- `ProjectControls`
- `ProjectHeader`
- `RalphyMascot`
- `ResizeHandle`
- `ReviewControls`
- `SelectMenu`
- `SidebarChrome`
- `SnappySlider`
- `VirtualAssetGrid`
- `WelcomeScreen`
- `WorkspacePicker`

### media
- `AssetContent`
- `AudioWaveform`
- `ImageViewport`
- `VideoPlayer`

### screens
- `AssetViewer`
- `LibraryScreen`
- `ProjectScreen`
- `SettingsScreen`
- `WorkspaceScreen`

### terminal
- `TerminalPane`
- `TerminalWorkspace`
