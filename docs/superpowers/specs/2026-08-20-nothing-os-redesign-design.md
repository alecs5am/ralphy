# Ralphy Instrument Full Redesign

**Date:** 2026-08-20
**Status:** Approved for implementation
**Target:** `ralphy-desktop`
**Branch:** `codex/nothing-os-redesign`
**Reference archive:** `/Users/maximovchinnikov/Downloads/Ralphy дизайн система (11).zip`
**Reference SHA-256:** `fe371e93e3d778bbd9d7e5621d200ff4298e386edbbc20d3e971941c004c0804`
**Stable evidence workspace:** `.superpowers/sdd/nothing-instrument/` (repository-ignored and never packaged)

## Intent

Rebuild the complete Ralphy Desktop presentation layer as a polished Nothing OS / Teenage Engineering-inspired instrument panel. This is a full UI rewrite, not a CSS reskin. The existing Core v3 contract, Electron security boundary, readers, domain controllers, and persistence remain the source of truth; this delivery adds no Core method, session, database, or Desktop review adapter.

The supplied handoff is authoritative for the shared Instrument language and for My Work → Project → Media iteration 3a/3b. Before implementation, verify the archive SHA above and extract it to `.superpowers/sdd/nothing-instrument/reference/design_handoff_instrument/`; every plan uses that stable path. Earlier prototype sections and `design-v1.md` provide functional layout context only. Screens without a final handoff will be redesigned from the same tokens, blocks, density, and interaction rules rather than copying the old palette.

## Product principles

1. **A desk of instruments.** The window is a cool desk holding separate functional widgets, not three continuous application panels.
2. **Flat means flat.** App chrome has no elevation shadows, glass, blur, inset highlights, decorative borders, or depth gradients. Hierarchy comes from surface tone and 8px air.
3. **Monochrome carries interaction.** Selection and primary actions use inversion. Red `#E0362C` is reserved for alerts, rejection, destructive actions, and live recording.
4. **Data stays honest.** Real UI never invents availability, progress, counts, review mutations, or notifications. UX Testing Lab may receive deterministic renderer-only test data only when `VITE_RALPHY_ENABLE_MOCKS === "true"`.
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

The handoff's `#111111`, `#262626`, `#2E2E2E`, `#E8E8E6`, `#4A4A48`, `#DFE2E9`, `#EB4438`, traffic-light colors, and dither/noise colors must be reconciled into one named primitive/semantic token manifest before route work. Application source, including xterm and WaveSurfer owners, consumes `INSTRUMENT_PALETTE` rather than duplicating literals. Direct authored color literals are allowed only in `src/instrument/palette.ts` and inside the verified token-definition block of `src/styles/tokens.css`; automated equality and source-reachability checks reject literals elsewhere.

Small readable text does not use the handoff's low-contrast muted tones. Readable secondary text is exactly `#4A4A48` on light desk/light widgets and `#A4A4A0` on dark desk/dark widgets; these pairs exceed 4.5:1. Values such as `#6A6A66` on `#141414`, `#9A9A96` on `#E2E4EA`, and `#6E6E6A` on `#E2E4EA` are decorative or disabled-only, carry no required information, and require an accessible name when they identify an element. This deliberate accessibility deviation from 3a/3b is verified by a token contrast matrix and computed Electron checks for text, badges, hover, selected, disabled, and focus states.

The preference is validated and persisted with existing Workbench preferences. The renderer applies `data-theme` before React paints and follows `prefers-color-scheme` changes while set to `system`. `color-scheme` must match the resolved palette. Non-CSS consumers such as xterm and WaveSurfer receive the resolved palette explicitly.

### Typography and assets

- AWS Diatype Regular: primary UI text, normally 11.5–13px; widget titles 16–17px.
- AWS Diatype Rounded Semi-Mono: paths, metadata, keyboard labels, and uppercase microcopy at 9–10.5px with `.06–.11em` letter spacing.
- Doto 800: numbers and short codes only, minimum 13px. It is bundled locally with its license; the renderer never depends on Google Fonts. The pinned OFL file has SHA-256 `26a7b58bdba6cda8a78ca6e8b3791d8013b8abc6d5e6519f84193893aee02020` and contains `SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007`; both font and license bytes are verified immediately after download.
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

The 48px row reserves the measured hidden-inset area for exactly one functional native macOS traffic-light set; HTML must not duplicate or imitate those controls. It also contains the left collapse control, centered Dynamic Island, and right collapse control plus the stable profile/avatar control. Interactive elements use `-webkit-app-region: no-drag`; remaining space is draggable. Native minimize/zoom/close hit regions, the reserved inset, and drag/no-drag regions are calibrated in the packaged app. The row replaces the old MainHeader rather than adding a second header.

### Left instrument stack

At 1440px the stack is 240px wide and contains:

1. My Work / Marketplace mode switch.
2. My Work workspace identity card, omitted in Marketplace.
3. Route navigation widget with live truthful counts only where supported.
4. Route-specific context instruments such as review progress or actionable attention.
5. User pill pinned to the bottom; Settings opens from it.

Local Models remains inside Marketplace. Settings is not a permanent nav row. Existing history, route restoration, focus restoration, and workspace selection remain owned by the current reducers.

### Desk

The central desk owns the active screen and its single vertical scroll container. `InstrumentScrollContext` exposes that element, measured dimensions, a route scroll key, and capture/restore methods. Media, Activity, and every virtualizer use it as an external scroll element; they do not create nested route scrollers. Modal/sheet content may own one explicitly marked local scroller while the desk is inert and locked. Every screen receives an Instrument header made from filter pills, counters, and contextual actions, then route content composed from shared widgets. Each screen has at most one visually dominant primary pill and one red action.

### Right instrument column

The shared right-rail mode is exactly `docked | overlay | closed`. At full width, `docked` is a 292px column. Below the docking threshold, the top-row control opens the same chat/review/inspector content as a modal sheet in `overlay` mode; it is never made unreachable. `overlay` traps focus, makes the desk inert, locks desk scrolling, closes with Escape, restores the opener with `preventScroll`, and preserves selection. `closed` renders neither docked nor overlay content. Chat is a permanent dark widget with a white composer in both themes. Project Media selection inserts the read-only or mock test console above chat. Other inspectors may use the shared contract only when their existing interaction already has an inspector; no route owns a competing viewport heuristic.

### Project dock

Project routes receive a floating bottom-center dock for Overview, Documents, Media, Units, and Activity. Existing project capabilities remain authoritative: if Overview or another section has no real route, the dock item is omitted or disabled with a reason instead of opening a fake surface. The dock never replaces application or workspace navigation.

### Responsive contract

- **1440×900 and wider:** full 240px left stack, desk, 292px right column, and project dock.
- **1280×800:** full left stack; right column remains if the desk retains at least 680px, otherwise it collapses behind the top-row control.
- **1100×720 minimum:** right rail starts `closed`; its control opens `overlay`. The left stack remains available and may be manually collapsed. No horizontal window scroll is allowed.
- Screen layouts respond to the measured desk container, not only viewport width. Dense grids reduce columns at explicit container thresholds; detail columns stack at or below 760px of desk width.
- Manual collapse preferences are respected across relaunches. Automatic compact behavior never overwrites the user's stored preference.
- The dock must avoid chat/inspector overlap and remain reachable at every supported width.

## Dynamic Island

### Compact state

The island is a fixed black `#141414` 36px pill in both themes. It shows, as available:

- selected-project review/status counters only when an explicit feed supplies them; production V1 supplies none;
- an active-task segment with dither orb, short mono label, 3px progress track, and Doto percentage;
- an unread notification count only when a feed explicitly supplies unread items;
- an expand control.

It does not show a clock or repeat project context as prose. On library/workspace routes without a project, unsupported project counters disappear rather than becoming zero.

### Expanded state

Activation morphs into a focus-managed flat card anchored to the top row. It contains:

1. The current active task, progress if supplied, status, and a destination action only when the task carries explicit provenance.
2. Up to three recent notifications with timestamp/severity; navigation appears only for an explicit existing-route destination.
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

Production V1 always exposes project counters as `unavailable`. Live task/notification destinations are optional; current navigation is never inferred as provenance. An item without a destination renders status without an action.

When `VITE_RALPHY_ENABLE_MOCKS === "true"` and the selected workspace name is exactly `UX Testing Lab`, a deterministic mock provider supplies counters, one active task, and three recent notifications. The mock has stable IDs, routes only to existing screens, resets when the root/workspace changes, and never writes through IPC, filesystem, or database. One mock notification may animate once per renderer session; navigation away and back does not replay it. Reduced-motion users receive an immediate state change. A `false` production build contains neither fixture IDs nor a mock chunk/module path.

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
- Media: high-fidelity handoff 3a/3b, filters, adaptive masonry, selection, console, keyboard review affordances, media viewer, generation and revision flows. Production is read-only: it presents only real review status already available and renders focusable `aria-disabled` A/N/R controls with the exact reason `Review is unavailable in Core 0.3.0 from Desktop.` No Desktop `media.review` adapter, consumer authentication, session lifecycle, Core type reconciliation, or database mutation is added.
- In mock mode and exact UX Testing Lab only, Media exposes a clearly labelled `TEST REVIEW SESSION` backed entirely by renderer memory. One dynamically imported mock-review module owns its reducer and shortcut eligibility policy. It supports local Approve/Reject and Needs Work with required feedback plus an active mock iteration. State is scoped to and resets on any change in the exact `(rootEpoch, workspaceId, projectId)` tuple, including a same-workspace project switch; reviews, feedback draft, iteration, and shortcut scope are cleared together. It never crosses IPC/storage/files, and every module path and fixture marker is excluded from production chunks.
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

Settings uses a capability table. Each enabled control names its backing state/API, persistence lifetime, and verification. Unsupported provider/general/terminal/reveal/restore/link controls are removed or focusable `aria-disabled` with an exact reason. Every claimed persistent setting has a two-launch isolated-profile test; every claimed operation has an invocation/result test.

## Canonical scenario and evidence contract

`src/instrument/overlay-registry.tsx` is the production overlay authority. `InstrumentOverlayId` is derived from its object keys, never duplicated as a hand-written union, and its `InstrumentOverlay` wrapper is used by every live dialog, drawer, viewer, menu, sheet, and popover. The registry includes root/global overlays; workspace account, Unit outcome, and evidence details; Shared inspector/viewer/workflow; Memory recall/editor/history/confirm; Calendar filter/drawer/inspector/schedule/unit/date/time/platform/account/reconnect surfaces; Document editor/viewer/conflict; Media viewer/context/mock Needs Work; Unit viewer; run inspector; Marketplace detail/target chooser; and terminal. A reachable raw overlay implementation outside this wrapper is an audit failure.

Each production route component exports a typed applicable-state descriptor and renders through `InstrumentScreenRoot` with its current state. `PRODUCTION_SCREEN_STATES` imports those owner exports. `INSTRUMENT_SCENARIOS` derives its requirements from the real route unions, those production descriptors, and the production overlay registry. Completeness compares route/state pairs and overlay keys in both directions; omitting a live state/overlay from either production registration or scenario evidence fails type/tests/source audit.

Each scenario declares a stable ID, route, registered state, deterministic fixture ID, expected Instrument root/landmarks, overlay, focus entry/return, scroll owner, expected rail mode by viewport, explicit panel setup by viewport, accessibility journeys, forced themes, and viewports. The default evidence expansion is the exact Cartesian product of `light | dark` and `1440x900 | 1280x800 | 1100x720`. A missing pair is allowed only through a typed exception containing the omitted pair, concrete reason, reviewer identity, and approved decision. The runner and tests independently compute and compare the exact case-key set; count lower bounds are forbidden. Shell panel permutations remain a separate exact matrix rather than being inferred from scenario defaults.

Scenario fixtures are deterministic renderer-only modules loaded only when `VITE_RALPHY_ENABLE_MOCKS === "true"`; production bundles contain neither fixture IDs nor fixture chunk paths. Real Electron evidence is captured per scenario, not just per shell permutation, into a versioned ignored bundle with build/app/Core hashes, run mode, viewport/theme, native and content geometry, landmarks, typed measurements, focus/scroll/contrast results, artifacts/logs, accessibility journey, pixel-diff data, DB record link, launch/exit result, failures, and product/accessibility/security/regression reviewer decisions. Its launch ledger links every Electron or reference-browser child to main DB/WAL verification and a separate SHM observation. Schema validation and the generated HTML report require and display every field and reject broken links. Mock and production names never collide.

Media 3a/3b uses deterministic iteration-3 fixture data. At 1440×900 in both light/dark, reference and actual captures are cropped to the same calibrated renderer-content rectangle so native chrome is excluded. Evidence contains cropped reference, actual, and `ffmpeg` pixel-diff images. It records the structural Media-content mask plus a versioned `a11yDeviationMask` containing only documented readable-text token substitutions, including every region and masked pixel count. The zero-pixel-above-RGB-delta-16 rule applies outside the union of those masks; Media-content pixels retain the maximum 0.5% above RGB delta 24; structural boxes remain within 1 CSS px. No native-chrome or arbitrary visual region may enter the deviation mask. The measured contract includes native/content inset calibration, 240px sidebar, 8px outer gap, 38px Media filter row, four masonry lanes with 10px gaps, selected ring/badge, 292px console/chat rail, and dock clearance. 1280×800 and 1100×720 capture responsive Media, including overlay rail, viewer, video hover/focus, chat, and dock.

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
- Mock island and Media review state are isolated under the exact false-string-safe mock flag and UX Testing Lab identity.
- All unsupported actions remain focusable explanations or disabled controls with accessible reasons; no enabled no-op actions are permitted.

## Accessibility and interaction quality

- All icon controls have accessible names, tooltips where the visual label is absent, and visible keyboard focus.
- Modal/dialog focus is initially visible, Escape works, and opener focus returns with `preventScroll`.
- Status is never color-only; counters and labels expose semantic text.
- Production A/N/R controls remain focusable but disabled with the Core 0.3.0 unsupported reason. Mock A/N/R shortcuts operate only inside the explicit test-review scope with a selected item. They are suppressed during composition/repeat/modifier events, whenever a modal/menu/viewer is open, and when focus is in any editable or interactive control (`input`, `textarea`, `select`, contenteditable, link, button, checkbox/radio, or role-equivalent).
- Hover-only media behavior has keyboard/focus parity. Video never autoplays with sound.
- `aria-live` is limited to user-relevant transitions; loading uses `aria-busy`; errors use alerts without repeated announcements.
- Forced light and dark palettes meet WCAG AA for normal text and focus indicators.
- Reduced motion disables island morphs, auto-preview movement, and nonessential panel animation.
- Automated keyboard journeys cover sidebar, dock, island, profile/Settings menus, chat, filters/cards, sheets/dialogs/viewers, Escape, and focus restoration. Live-region tests prove polite deduplication and that island/chat updates never move focus.

## Security and operational truth

- No renderer network or raw filesystem access is added.
- Existing media protocol token, root fencing, MIME allowlists, CSP, clipboard bounds, and Marketplace fixed-origin policies remain intact.
- The prototype HTML, `support.js`, remote Lucide sprite, and remote fonts are never shipped.
- Mock notifications/tasks/reviews are static renderer fixtures, contain no secrets or paths, and are excluded when mock mode is false.
- UX Testing Lab database remains unchanged. Around every packaged application launch, fingerprint existence, SHA-256, byte size, and nanosecond mtime of both `ralphy.db` and `ralphy.db-wal`; fail on WAL creation, removal, growth, or content/metadata change. Record `ralphy.db-shm` existence/metadata separately because read locks may change it; never claim SHM byte immutability. Any future review/notification persistence requires a separate Core-first contract and release.
- Final packaging accepts only `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/release/Ralphy Media.app/Contents/Resources/bin/ralphy`, version `0.3.0`, SHA-256 `a843e2805b4b0a49d02f7afe46cdd5693d81184c14d560af836be93283d85679`. Reject a mismatch before packaging and verify the packaged binary and manifest against the same independent pin.
- Before any real-Electron scenario or Media-fidelity audit consumes a mock package, build it deterministically with the exact mock flag and approved Core input, then verify the packaged Core and manifest against the independent version/SHA pin. Rebuild and reverify before a later audit when intervening commits can change the bundle.

## Verification

Each implementation task uses TDD and an independent task review. Final acceptance requires:

1. Theme preference validation, persistence, synchronous startup application, system-change behavior, and JS consumer updates.
2. Component behavior and accessibility tests for shell, sidebar, dock, island, Settings, dialogs, and shortcuts.
3. Existing domain/controller/bridge/security suites remain green apart from explicitly documented pre-existing baselines.
4. Real Electron per-scenario geometry and computed-style checks at 1440×900, 1280×800, and 1100×720 in forced light/dark, plus an isolated `system` case with live OS-theme change. Calibrate native outer bounds, content insets/device scale, and renderer inner dimensions separately.
5. No horizontal body overflow; one vertical scroll owner per screen; portal content fits; focus remains visible.
6. Automated design guards reject reachable app-chrome shadows, blur, depth gradients, old purple accent use, dark-only form color-scheme, and unallowlisted hard-coded palette literals.
7. Typed scenario completeness plus durable per-scenario screenshots/measurements, keyboard/reduced-motion/live-region journeys, and automated reference/actual/`ffmpeg` pixel comparison of Media 3a/3b using the stated tolerance.
8. Each UX Testing Lab launch uses the independently pinned Core 0.3.0 input, exact false-string-safe mock behavior, isolated temporary `userData`, per-launch DB/WAL fingerprints, and separate SHM records. A two-launch case proves preference persistence and before-paint theme without touching the developer profile.
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
- Dynamic Island counters and review-specific notifications/tasks are deterministic UX Testing Lab mocks in this branch. Production may show only current agent work and application errors already present in renderer memory, with no inferred counts, progress, destinations, or notification history.
- Production Media review is deliberately read-only because Core 0.3.0's authenticated session contract is not reconciled in this presentation rewrite. Mock test review is visibly labelled, renderer-local, and non-persistent.
- Theme remains renderer-persisted for this delivery. A main-process nativeTheme protocol is added only if packaged verification proves Chromium/system handling cannot produce correct native appearance.
- Fixed 1440 geometry is the fidelity anchor; 1280 and 1100 behavior is a product extension governed by container width and automatic right-rail collapse.
