# Ralphy Instrument Full Redesign

**Date:** 2026-08-20
**Status:** Approved for implementation
**Target:** `ralphy-desktop`
**Branch:** `codex/nothing-os-redesign`
**Reference:** `/Users/maximovchinnikov/Downloads/Ralphy дизайн система (11).zip`

## Intent

Rebuild the complete Ralphy Desktop presentation layer as a polished Nothing OS / Teenage Engineering-inspired instrument panel. This is a full UI rewrite, not a CSS reskin. The existing Core v3 contract, Electron security boundary, readers, domain controllers, and persistence remain the source of truth unless a presentation requirement cannot be satisfied without a narrowly scoped adapter.

The supplied handoff is authoritative for the shared Instrument language and for My Work → Project → Media iteration 3a/3b. Earlier prototype sections and `design-v1.md` provide functional layout context only. Screens without a final handoff will be redesigned from the same tokens, blocks, density, and interaction rules rather than copying the old palette.

## Product principles

1. **A desk of instruments.** The window is a cool desk holding separate functional widgets, not three continuous application panels.
2. **Flat means flat.** App chrome has no elevation shadows, glass, blur, inset highlights, decorative borders, or depth gradients. Hierarchy comes from surface tone and 8px air.
3. **Monochrome carries interaction.** Selection and primary actions use inversion. Red `#E0362C` is reserved for alerts, rejection, destructive actions, and live recording.
4. **Data stays honest.** Real UI never invents availability, progress, counts, or notifications. UX Testing Lab may receive deterministic renderer-only mock island data when mock mode is enabled.
5. **One system, two palettes.** Light and dark share geometry and component behavior. Dark changes the desk and desk ink; black widgets, frames, island, and white composer remain stable.
6. **Content is not chrome.** User media, social previews, terminal canvases, and image/video scrims retain the contrast needed by their content and use explicit content tokens.
7. **Presentation rewrite, domain preservation.** New components may replace all old view hierarchy and CSS, but must reuse existing navigation, Core/bridge contracts, controllers, and truthful availability models.

## Visual system

### Themes

The global preference is exactly `system | dark | light` and defaults to `system` for new or invalid preferences.

| Token | Light | Dark |
| --- | --- | --- |
| Desk | `#E2E4EA` | `#050505` |
| Desk hover | `#D3D6DD` | `#242422` |
| Dark widget | `#141414` | `#141414` |
| Dark raised | `#1E1E1E` | `#1E1E1E` |
| Dark hover | `#1C1C1C` | `#1C1C1C` |
| Light widget | `#F1F2F6` | `#141414` |
| Light hover | `#FFFFFF` | `#242424` |
| Light sunken | `#E4E4E2` | `#1E1E1E` |
| Media frame | `#060606` | `#060606` |
| Desk primary ink | `#141414` | `#F2F2F0` |
| Desk secondary ink | `#6E6E6A` | `#8A8A86` |
| Desk muted ink | `#9A9A96` | `#6A6A66` |
| Dark primary ink | `#F2F2F0` | `#F2F2F0` |
| Dark secondary ink | `#A4A4A0` | `#A4A4A0` |
| Dark muted ink | `#6A6A66` | `#6A6A66` |
| Unreviewed | `#CCCED6` | `#3A3A38` |
| Alert | `#E0362C` | `#E0362C` |

The preference is validated and persisted with existing Workbench preferences. The renderer applies `data-theme` before React paints and follows `prefers-color-scheme` changes while set to `system`. `color-scheme` must match the resolved palette. Non-CSS consumers such as xterm and WaveSurfer receive the resolved palette explicitly.

### Typography and assets

- AWS Diatype Regular: primary UI text, normally 11.5–13px; widget titles 16–17px.
- AWS Diatype Rounded Semi-Mono: paths, metadata, keyboard labels, and uppercase microcopy at 9–10.5px with `.06–.11em` letter spacing.
- Doto 800: numbers and short codes only, minimum 13px. It is bundled locally with its license; the renderer never depends on Google Fonts.
- Existing byte-identical AWS fonts and dither assets are reused from `public/assets`.
- Workspace identity uses deterministic colored dither derived from the workspace name. Color identifies an entity and never communicates state.
- The supplied Ralphy mascot becomes the canonical chat/status mascot after a visual and accessibility check.
- Existing Lucide React icons remain the icon source; prototype runtime and CDN sprite are not shipped.

### Geometry and motion

- Desk radius 16px; outer padding and inter-widget gap 8px.
- Widgets radius 24px with squircle support; pills and circles radius 999px and remain round.
- Standard controls are 28–40px high depending on context; nav rows are 34px.
- Motion uses `cubic-bezier(.2, 0, .2, 1)`: 90ms hover, 160ms state, 220ms panel.
- Reduced motion removes morphing and movement while preserving immediate state changes.
- Semantic focus uses a visible 2px ink outline with offset. The no-border rule does not remove focus, status rings, selection rings, or input affordances required for accessibility.

## Shared application shell

The old continuous workbench chrome is replaced by `InstrumentShell`.

### Top row

The 48px row contains colored macOS traffic lights and the left collapse control, a centered Dynamic Island, and the right collapse control plus user avatar. Interactive elements use `-webkit-app-region: no-drag`; remaining space is draggable. The row replaces the old MainHeader rather than adding a second header.

### Left instrument stack

At 1440px the stack is 240px wide and contains:

1. My Work / Marketplace mode switch.
2. My Work workspace identity card, omitted in Marketplace.
3. Route navigation widget with live truthful counts only where supported.
4. Route-specific context instruments such as review progress or actionable attention.
5. User pill pinned to the bottom; Settings opens from it.

Local Models remains inside Marketplace. Settings is not a permanent nav row. Existing history, route restoration, focus restoration, and workspace selection remain owned by the current reducers.

### Desk

The central desk owns the active screen and its single vertical scroll container. Every screen receives an Instrument header made from filter pills, counters, and contextual actions, then route content composed from shared widgets. Each screen has at most one visually dominant primary pill and one red action.

### Right instrument column

At full width the column is 292px. Chat is a permanent dark widget with a white composer in both themes. Project Media selection inserts the review console above chat. Other screen inspectors may use the column only when their existing interaction already has an inspector; no new unsupported inspector data is invented.

### Project dock

Project routes receive a floating bottom-center dock for Overview, Documents, Media, Units, and Activity. Existing project capabilities remain authoritative: if Overview or another section has no real route, the dock item is omitted or disabled with a reason instead of opening a fake surface. The dock never replaces application or workspace navigation.

### Responsive contract

- **1440×900 and wider:** full 240px left stack, desk, 292px right column, and project dock.
- **1280×800:** full left stack; right column remains if the desk retains at least 680px, otherwise it collapses behind the top-row control.
- **1100×720 minimum:** right column starts collapsed; left stack remains available and may be manually collapsed. No horizontal window scroll is allowed.
- Screen layouts respond to the measured desk container, not only viewport width. Dense grids reduce columns at explicit container thresholds; detail columns stack at or below 760px of desk width.
- Manual collapse preferences are respected across relaunches. Automatic compact behavior never overwrites the user's stored preference.
- The dock must avoid chat/inspector overlap and remain reachable at every supported width.

## Dynamic Island

### Compact state

The island is a fixed black `#141414` 36px pill in both themes. It shows, as available:

- selected-project review/status counters using solid, ring, red, and muted dots;
- an active-task segment with dither orb, short mono label, 3px progress track, and Doto percentage;
- an unread notification count only when a feed explicitly supplies unread items;
- an expand control.

It does not show a clock or repeat project context as prose. On library/workspace routes without a project, unsupported project counters disappear rather than becoming zero.

### Expanded state

Activation morphs into a focus-managed flat card anchored to the top row. It contains:

1. The current active task, progress if supplied, status, and a truthful destination action.
2. Up to three recent notifications with timestamp, severity, and existing-route destination.
3. Explicit empty, unavailable, and error states.

Escape closes it and restores the opener without changing page scroll. Updates are announced politely only for meaningful task/notification transitions, not periodic count refreshes.

### Feed contract

`DynamicIslandFeed` is renderer-owned and presentation-safe:

```ts
type DynamicIslandFeed = {
  projectStatus: Availability<ProjectStatusSummary>;
  activeTask: IslandTask | null;
  notifications: Availability<IslandNotification[]>;
};
```

Live V1 derives only real selected-route identity, project/workspace availability, current agent work, and application errors already in renderer memory. It does not add a Core or database notification contract.

When `VITE_RALPHY_ENABLE_MOCKS=true` and the selected workspace is UX Testing Lab, a deterministic mock provider supplies one active task and three recent notifications. The mock has stable IDs, routes only to existing screens, resets when the root/workspace changes, and never writes the database or leaks into production builds. One mock notification may animate from the island once per renderer session to demonstrate the iPhone-like behavior; reduced-motion users receive an immediate state change.

The interface is intentionally replaceable by a future Core-backed feed without changing island components.

## Screen rewrite matrix

Every live route and operational overlay is in scope.

### Startup and global states

- Welcome/restoring and Home Library unavailable/error.
- Empty library and root selection.
- Migration Recovery.
- App-level alerts and refresh failures.
- Loading, offline, partial, unavailable, and empty states use Instrument surfaces and truthful reasons.

### My Work

- Workspace Overview: performance, plan/outcomes, insights, operations, attention.
- Projects collection and project cards.
- Workspace Units placeholder remains an honest unavailable/placeholder surface until its data contract exists.
- Shared Library: results, inspector, viewer, workflows, history, media failure states.
- Memory: list, rulebook, reviews, unavailable states.
- Calendar: month/week/agenda, inspector, drawers, schedule flow, platform settings, account/partial/error states.

### Project

- Documents: list, search, editor/viewer, JSON/Markdown, conflicts and revisions.
- Media: high-fidelity handoff 3a/3b, filters, adaptive masonry, selection, console, keyboard review, media viewer, generation and revision flows.
- Units: collection, detail, revisions, presentations, previews and playback states.
- Activity: virtual list, filters, search, run inspector and technical/unavailable states.

### Marketplace

- Discover, search/results, categories and collection.
- Models and machine/Ollama inventory.
- Template and Recipe details and controlled media.
- Prompt, Component, and Skill unavailable details.
- My Library Installed plus honest unavailable Saved, Added, Downloads, Updates, Attention, and Forks.
- Target chooser and non-mutating review workflows.

### Settings and utilities

- General, Profile, Appearance, Providers, Terminal, and About.
- Appearance contains the controlled System / Dark / Light setting.
- Settings search, sticky header, Back to app, modals, menus, selects, context menus, tooltips, and profile menu.
- Bottom terminal panel and xterm palette.
- Agent chat states, messages, composer, permissions, loading, errors, and disconnected state.

## Component architecture

The rewrite introduces a small reusable Instrument layer rather than a generic component framework:

- `InstrumentShell`, `InstrumentTopRow`, `InstrumentSidebar`, `InstrumentDesk`, `InstrumentRightRail`, `ProjectDock`.
- `DynamicIsland` and a pure feed projector.
- `InstrumentWidget`, `InstrumentPill`, `InstrumentIconButton`, `InstrumentCounter`, `StatusDot`, `DitherIdentity`, `InstrumentEmptyState`.
- Existing Radix dialogs/selects remain and are reskinned; native buttons, inputs, progress, and disclosure semantics remain native where possible.

Components are added only when at least two real surfaces share the same behavior. Route-specific layout stays with the route instead of growing a universal schema renderer.

Old presentation components and CSS selectors are removed after their final consumer migrates. Legacy dark-only tokens, accent-purple selection, blur classes, elevation shadows, and duplicate screen palettes must not remain reachable in production.

## State and data flow

- App retains ownership of route, restored catalog, selected workspace/project, panel visibility, and theme preference.
- Theme resolution is a pure helper plus a single root attribute; screens do not own local theme state.
- Dynamic Island receives a projected DTO and navigation callbacks. It performs no IPC, filesystem access, or route mutation itself.
- Project and workspace controllers remain scoped by root epoch and selected IDs. Island/screen snapshots clear on selection changes and cannot display stale prior-project values.
- Mock island state is isolated under the existing mock flag and UX Testing Lab identity.
- All unsupported actions remain focusable explanations or disabled controls with accessible reasons; no enabled no-op actions are permitted.

## Accessibility and interaction quality

- All icon controls have accessible names, tooltips where the visual label is absent, and visible keyboard focus.
- Modal/dialog focus is initially visible, Escape works, and opener focus returns with `preventScroll`.
- Status is never color-only; counters and labels expose semantic text.
- A/N/R shortcuts operate only with a selected Media item and never while an editable control has focus.
- Hover-only media behavior has keyboard/focus parity. Video never autoplays with sound.
- `aria-live` is limited to user-relevant transitions; loading uses `aria-busy`; errors use alerts without repeated announcements.
- Forced light and dark palettes meet WCAG AA for normal text and focus indicators.
- Reduced motion disables island morphs, auto-preview movement, and nonessential panel animation.

## Security and operational truth

- No renderer network or raw filesystem access is added.
- Existing media protocol token, root fencing, MIME allowlists, CSP, clipboard bounds, and Marketplace fixed-origin policies remain intact.
- The prototype HTML, `support.js`, remote Lucide sprite, and remote fonts are never shipped.
- Mock notifications/tasks are static renderer fixtures, contain no secrets or paths, and are excluded when mock mode is false.
- UX Testing Lab database remains unchanged. Any future notification persistence requires a separate Core-first contract and migration.

## Verification

Each implementation task uses TDD and an independent task review. Final acceptance requires:

1. Theme preference validation, persistence, synchronous startup application, system-change behavior, and JS consumer updates.
2. Component behavior and accessibility tests for shell, sidebar, dock, island, Settings, dialogs, and shortcuts.
3. Existing domain/controller/bridge/security suites remain green apart from explicitly documented pre-existing baselines.
4. Real Electron geometry and computed-style checks at 1440×900, 1280×800, and 1100×720 in forced light and dark, with sidebar/chat/bottom-panel combinations.
5. No horizontal body overflow; one vertical scroll owner per screen; portal content fits; focus remains visible.
6. Automated design guards reject reachable app-chrome shadows, blur, depth gradients, old purple accent use, dark-only form color-scheme, and unallowlisted hard-coded palette literals.
7. Visual inspection of every route/state in the screen matrix, with special pixel-level comparison of Media light/dark against handoff 3a/3b.
8. UX Testing Lab launch using bundled Core 0.3.0, mock island data visible only in mock mode, and no live DB byte/mtime change.
9. Production typecheck and renderer/Electron build.
10. Broad independent product, accessibility/visual, security, and final regression reviews before handoff.

## Execution decomposition

The work stays on one branch but is delivered through three sequential implementation plans:

1. **Foundation and shell:** themes, fonts/tokens, Instrument primitives, full shell, responsive behavior, Dynamic Island, Settings preference, chat/terminal integration.
2. **My Work and project surfaces:** startup/global states, Workspace routes, Project Documents/Media/Units/Activity, Shared Library, Memory, Calendar, viewers and workflows.
3. **Marketplace and final polish:** Marketplace routes/workflows, remaining overlays/utilities, legacy CSS/component removal, cross-theme geometry, UX Testing Lab audit, final reviews and launch.

Later plans may consume interfaces committed by earlier plans but may not weaken this specification. Each plan must leave the application runnable and independently reviewable.

## Deliberate rulings

- The request for a complete rewrite means complete presentation replacement, not a Core/DB rewrite. Rebuilding already-correct domain contracts would add risk without improving the requested design.
- Colored deterministic workspace dither is selected over grayscale because it provides identity without violating the semantic color rule.
- Doto is bundled locally rather than loaded remotely so the Electron UI is offline-safe and CSP-compatible.
- Dynamic Island notifications/tasks are deterministic UX Testing Lab mocks in this branch; production remains truthful and empty until Core exposes a notification feed.
- Theme remains renderer-persisted for this delivery. A main-process nativeTheme protocol is added only if packaged verification proves Chromium/system handling cannot produce correct native appearance.
- Fixed 1440 geometry is the fidelity anchor; 1280 and 1100 behavior is a product extension governed by container width and automatic right-rail collapse.
