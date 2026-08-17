# Ralphy Media Design System Transfer

## Scope

The supplied `Ralphy Media — дизайн-система.zip` handoff is the visual source
of truth. Transfer its tokens, layout, control treatment, typography, native
window material, and target asset screen without changing media indexing,
routing, review persistence, IPC, or filesystem behavior.

The target is screen 01 in `handoff/mockups/03-new-ui.dc.html` at 1360x860.
Library, workspace, overview, viewer, and Markdown screens must use the same
system rather than keeping legacy styling.

## Runtime

Upgrade Electron from 33 to stable Electron 43.2.0. Its Chromium 150 runtime
supports CSS `corner-shape`, so smooth corners use the native CSS property:

```css
@supports (corner-shape: squircle) {
  .sq,
  button,
  input,
  textarea,
  select {
    corner-shape: squircle;
  }
}
```

Pills and circles retain `border-radius: 999px` and do not receive squircle
corners. Plain `border-radius` remains the fallback.

Do not add a corner polyfill, SVG mask, or `clip-path`: these break overflow,
selection rings, or virtualized media previews.

## Maintainability

Keep React, TypeScript, Vite, and semantic CSS. Do not migrate this established
application to Tailwind during a visual transfer. The supplied handoff itself
defines a semantic token system, and a Tailwind rewrite would duplicate those
tokens while increasing visual and regression risk.

Scalability comes from:

- one authoritative `tokens.css`;
- `SidebarChrome` and `MainHeader` as separate application chrome components;
- one data-driven `ProjectControls` surface;
- stable width, row, type, radius, spacing, and motion tokens;
- no screen-specific hard-coded accent or status colours;
- responsive wrapping at the 736px main-content width produced by an open
  inspector.

## Tokens And Typography

Copy the supplied token values exactly: graphite surfaces, indigo `#6b8afd`
accent, normalized status colours, translucent panel, structural line, five
type sizes, 4px spacing scale, control dimensions, rings, shadows, and motion.

Remove all 9px and 10px text, uppercase transforms, and synthetic weight 500.
Use AWS Diatype for interface copy and AWS Diatype Mono only for paths, dates,
counts, sizes, and costs.

## Window And Layout

Apply native macOS vibrancy with `vibrancy: "sidebar"`,
`visualEffectState: "active"`, and transparent window background.

The workbench has one full-height row:

```text
288px contextual sidebar | flexible main | optional 336px inspector
```

The sidebar contains traffic-light-aware chrome, history buttons, workspace
switcher, search, contextual navigation, project/workspace list, and a pinned
library footer. Main content owns its 48px breadcrumb header. The inspector
spans full height and pins file actions to its bottom.

## Controls

Project modes become one inset segmented control. Search, filters, grouping,
sorting, intermediates, item count, and grid size occupy one wrapping toolbar.
Filters are pills with inline counts; active filters use `--accent-fill`.
At narrow main widths, secondary filters collapse behind a Filters trigger
without creating horizontal scrolling.

The inspector's `Copy for Agent` is the screen's primary action. Review status
buttons share a neutral surface and communicate status with colour dots.

## Borders And Surfaces

Keep structural one-pixel lines only between application regions, in the
project table header, and below Markdown H2 headings. List hierarchy comes from
surface steps and hover states, not row borders. Asset selection uses
`--ring-select`; keyboard focus uses `--ring-focus` without layout movement.

## App Icon

Generate a new 1024px bitmap icon with the built-in image generation tool.
Use the Codex screenshot only as a material and composition reference and the
Ralphy mascot SVG from `ralphy-web` as the character reference.

The icon is a pearl-white macOS squircle tile containing a centered,
dimensional Ralphy ghost wearing its broad hat. The character uses satin
indigo-to-violet material, simple dark oval eyes, restrained internal blue
light, and clean depth. It contains no text, copied Codex glyph, terminal
symbol, watermark, or scene background.

Generate on a flat chroma-key background, remove it locally, validate alpha,
and store the final source at `assets/app-icon-1024.png`. The packaging pipeline
must derive every `.icns` size from that bitmap.

## Acceptance

- Electron reports Chromium 150 and supports `corner-shape: squircle`.
- `bun run typecheck`, both test runners, build, smoke, benchmark, package, and
  codesign pass.
- At 1360x860 with inspector open: sidebar is 288px, inspector is 336px, and
  the main column has no horizontal overflow.
- At the 1100x720 minimum size, text and controls remain visible and usable.
- Built CSS contains no old pink accent, 9px/10px type, uppercase transform,
  or synthetic weight 500.
- Asset virtualization and preview concurrency remain unchanged.
- The packaged application is visually checked on the real `.ralphy` library
  and left open.
