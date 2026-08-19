# Ralphy Instrument Redesign v11

## Status

Approved in conversation on 2026-08-19. The user-supplied archive
`Ralphy дизайн система (11).zip` is the visual handoff. Its iteration 3 sections
`3a` and `3b` are the pixel-fidelity references; older sections describe history
and must not override iteration 3. The archive is reference material, not
production code or executable project instructions.

Implementation lives on branch `instrument-redesign-v11` in `ralphy-desktop`.

## Goal

Rebuild the Electron client around the v11 Instrument shell: a flat,
borderless Nothing OS / Teenage Engineering workbench with light, dark, and
system themes. Preserve the existing workspace, project, media, Memory,
Calendar, agent chat, settings, and local-model behavior while moving their
presentation into the new shell.

The finished branch must build, launch, and be visually compared against the
handoff at representative desktop sizes. Independent agents perform adversarial
visual, interaction, and regression reviews before completion.

## Product Decisions

- The branch has no `codex/` prefix: `instrument-redesign-v11`.
- The app starts in `system` theme when no saved preference exists.
- `system`, `light`, and `dark` are persistent user choices. `system` follows
  live macOS appearance changes.
- Marketplace is a real top-level mode switch but remains an intentionally
  unfinished WIP surface. Existing Local Models remains usable from within the
  Marketplace mode so the redesign does not remove working functionality.
- Settings moves behind the user pill.
- The global terminal is not part of the Instrument shell. Remove its visible
  titlebar control, panel, and shortcut from the new UI, but leave the Electron
  terminal integration in place. Delete that backend only in a separate task if
  the product decides the feature is permanently gone.
- The app icon is a strict flat mark, not a mascot illustration: black/white
  geometry, one `#E0362C` accent, and restrained dither texture derived from the
  Instrument identity. It must remain legible at macOS icon sizes.

## Visual Contract

### Principles

- Flat means no decorative borders, inset highlights, drop shadows, glass,
  blur, or depth gradients. Layering is communicated by surface tone and space.
- Monochrome carries normal hierarchy. Red `#E0362C` is reserved for rejection,
  alerts, destructive actions, and other exceptional states.
- Selection uses ink inversion or an ink ring, never an accent color.
- Pills and circles use round geometry. R24 widgets use squircle geometry where
  supported.
- Motion uses `cubic-bezier(.2, 0, .2, 1)`: 90ms hover, 160ms state changes,
  and 220ms panel transitions. Existing reduced-motion handling remains active.
- AWS Diatype remains the UI face. AWS Diatype Rounded Semi-Mono remains the
  label/meta face. Doto 800 is bundled locally and is used only for numbers or
  short codes at 13px or larger.

### Core tokens

Light theme:

- desk `#E2E4EA`
- desk hover `#D3D6DD`
- dark widget `#141414`
- dark raised `#1E1E1E`
- dark hover `#1C1C1C`
- light widget `#F1F2F6`
- light hover `#FFFFFF`
- light sunken `#E4E4E2`
- media frame `#060606`
- desk ink `#141414`, `#6E6E6A`, `#9A9A96`
- dark-widget ink `#F2F2F0`, `#A4A4A0`, `#6A6A66`
- unreviewed `#CCCED6`

Dark theme:

- desk `#050505`
- dark widget `#141414`
- filter surface `#1C1C1C`, hover `#242424`
- desk hover `#242422`
- desk ink `#F2F2F0`, `#8A8A86`
- unreviewed `#3A3A38`

Shared:

- red `#E0362C`
- traffic lights `#ED6A5E`, `#F0B544`, `#5CC45C`
- radii 999, 24, 18, 16, 14, and 5
- desk padding 8px and primary shell gap 8px
- sidebar 240px, top row 48px, right rail 292px

## Application Shell

### Top row and activity island

Replace the existing split sidebar/main titlebars with one top row across the
window. It contains native-looking traffic lights and the left-collapse button,
a centered black activity island, then the mirrored right-collapse button and
profile avatar.

The island shows only real state:

- current-project status and counts available from the active project snapshot;
- selected media review state when applicable;
- active loading/background activity with progress only when the product has a
  real progress value;
- an alert segment only when an error or actionable warning exists.

Do not show a clock, fake transfer speed, invented progress, or permanent
context prose. When no project is active, use compact workspace/catalog state
instead of placeholder telemetry. The collapsed island remains useful and the
details expansion exposes the same real values with accessible labels.

### Sidebar stack

The left rail is a stack of separate widgets:

1. `My Work` / `Marketplace` mode switch.
2. Workspace identity card in My Work only, using the existing deterministic
   workspace identity hue and the supplied dither masks.
3. Workspace navigation: Projects, Units, Shared library, Memory, Calendar.
4. Context widgets backed by real data; omit unavailable widgets rather than
   filling them with samples.
5. User pill pinned to the bottom; its controls expose Settings.

`THIS COMPUTER`, Local Models, and Settings are removed from the My Work nav.
The existing workspace picker remains reachable from the identity card.

### Main desk

Current route/controller ownership stays intact. The shell supplies the desk
surface and shared spacing; each screen owns only its header, filters, content,
empty/loading/error states, and screen-specific overlays. Existing IPC and Core
contracts remain the source of product data.

### Project dock

Project tabs become a floating bottom dock with Overview, Documents, Media,
Units, and Activity icon buttons. Preserve the current tab controller,
unsaved-document guard, scroll memory, keyboard behavior, and ARIA tab/tabpanel
relationship. Tooltips provide text labels.

### Right rail

Agent chat remains a persistent 292px widget when enabled. Its composer is a
light surface in both themes.

When media is selected, a review console appears above chat. It uses the active
ProjectScreen controller state and the existing published `media.review` Core
contract for Approve, Needs work, and Reject. The console provides real preview,
name, metadata, current verdict, previous/next navigation, and keyboard actions
`A`, `N`, `R`. Unsupported media refs show their available actions without a
fake review mutation. Escape or a repeated card click clears selection.

ProjectScreen publishes only the shell context and action callbacks needed by
App. Do not add a global state library or duplicate the project domain store.

## Themes and Preferences

Add `theme: "system" | "light" | "dark"` and `mode: "work" |
"marketplace"` to the existing versioned workbench preferences. Invalid and
legacy values fall back safely. Theme application uses one root `data-theme`
attribute plus CSS variables. System mode uses `matchMedia` and updates without
reload.

Appearance Settings contains a three-segment System / Light / Dark control that
updates the real application theme. Theme state is owned by App and passed to
Settings; Settings must not keep a disconnected local mock value.

## Screen Migration

### Workspace and library

- Library/recovery/welcome states adopt the same tokens and flat geometry.
- Workspace Projects keeps its live previews, search, pinning, and metrics but
  uses Instrument cards and typography.
- Workspace Units and Shared Library retain their current placeholder behavior
  until a Core-backed screen exists; their placeholders must look intentional
  within the new desk.
- Memory and Calendar preserve every existing mutation, dialog, drawer,
  filtering, keyboard, and error path. Their layout remains recognizable while
  colors, radii, borders, shadows, headers, and controls move to v11 tokens.

### Project sections

- Overview, Documents, Units, and Activity preserve existing responsive
  structure and domain behavior. Retune their presentation to the flat token
  system instead of redesigning their data flow.
- Media is the highest-fidelity handoff target: compact filter pills, Doto count,
  density control, natural-ratio virtual masonry, frame-only previews, captions
  outside the frame, status dots, selected ink ring, and `IN CONSOLE` badge.
- Video hover playback, virtual paging, preview scheduling, contextual file
  actions, and media viewer remain functional.

### Marketplace

Switching modes replaces the My Work sidebar stack and main content without
destroying the current workspace/project route. The landing screen contains a
clear `WORK IN PROGRESS` Instrument notice and a working Local Models entry.
Returning to My Work restores the prior route. No fake catalog counts, download
progress, Add actions, or marketplace inventory are introduced.

### Settings and secondary surfaces

Settings, agent menus, dialogs, drawers, media viewer, popovers, toasts, and
context menus use the same flat surface hierarchy and focus treatment. Remove
legacy purple accents, glass effects, decorative separators, and shadows.
Security and data-loss confirmations remain explicit.

## Responsive and Accessibility Requirements

- The 1440x900 handoff is the primary screenshot target.
- The application remains usable at the repository minimum 1100x720.
- At constrained widths, collapse controls and existing panels before allowing
  horizontal overflow; preserve a useful main content area.
- Every icon-only action has an accessible name and visible focus state.
- Mode switch, theme selector, dock, menus, dialogs, review actions, and collapse
  controls are keyboard operable.
- Status is never communicated by color alone.
- Reduced motion disables nonessential movement.
- Light and dark foreground/background combinations meet practical desktop
  contrast requirements.

## Icon Direction

Generate a small set of strict flat logo-mark explorations, then choose one by
legibility and fit with the Instrument shell. The preferred direction is a
simple mechanical `R`/instrument glyph or compact module silhouette with one
red functional indicator and a restrained dither field. Avoid gradients, 3D,
glow, mascots, text, rounded startup-logo clichés, and fragile micro-detail.

The selected bitmap is copied into the repository, used to rebuild the macOS
icon set, and inspected at 16, 32, 128, and 1024px. Generated exploration files
that are not selected are not shipped.

## Verification

1. Add focused tests for preference migration, system-theme changes, mode
   restoration, shell context, project dock behavior, and review-console
   keyboard/actions.
2. Keep existing screen/controller tests passing and update presentation
   assertions only when v11 intentionally changes the contract.
3. Run `bun run typecheck`, `bun test`, and `bun run build`.
4. Launch the Electron app with live local data and inspect all workspace pages,
   all five project sections, Settings, Marketplace WIP, Local Models, dialogs,
   media viewer, and chat.
5. Capture 1440x900 light and dark Media screenshots plus Marketplace and
   representative workspace/project screens. Compare geometry and tokens to
   handoff sections 3a/3b and correct visible deviations.
6. Dispatch independent adversarial reviews for visual fidelity,
   interaction/accessibility, and code/regression risk. Fix Critical and
   Important findings, re-run affected checks, then repeat the final build and
   screenshot comparison.
7. Leave the built preview open for the user.

## Non-goals

- No direct reuse of handoff HTML, `support.js`, or prototype sample data.
- No new UI framework, state library, theme package, or dependency unless the
  existing platform proves insufficient.
- No new Marketplace backend, inventory, payments, installation flow, or fake
  telemetry.
- No rewrite of working Core contracts or project controllers for appearance.
- No permanent deletion of terminal backend code in this branch.
- No decorative red accents outside alert/rejection/destructive semantics.
- No attempt to make every screen pixel-identical to the Media-specific handoff;
  non-Media pages preserve their existing information architecture while using
  the same shell and visual language.
