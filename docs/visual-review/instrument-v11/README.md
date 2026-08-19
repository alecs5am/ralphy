# Instrument v11 visual verification

Captured on 2026-08-19 from the production renderer build against the live
`~/.ralphy` store. The app was launched with the repository's packaged Core
0.3.0 binary:

```bash
RALPHY_BIN='/Users/maximovchinnikov/github/ralphy/ralphy-desktop/release/Ralphy Media.app/Contents/Resources/bin/ralphy' ./node_modules/.bin/electron . --remote-debugging-port=9333
```

The existing Playwright install under `.ds-sync/` connected over CDP and used
Chromium device metrics for deterministic 1440×900 and 1100×720 renderer
captures. No dependency was added. Native macOS traffic lights are outside the
renderer bitmap and therefore do not appear in these screenshots.

## Automated verification

| Command | Exit | Result |
| --- | ---: | --- |
| `bun run typecheck` | 0 | Passed (`tsc --noEmit`). |
| `bun run test` | 0 | 503 passed, 1 skipped across 57 files. The Calendar assertion now controls the clock and is deterministic. |
| `bun run build` | 0 | Renderer and Electron bundles built. Vite emitted its existing advisory for a chunk larger than 500 kB. |
| `bun run smoke` | 1 | The unqualified development smoke selected global `ralphy` 0.2.0, which exits with `error: unknown option '--stdio'`; the harness then exits 1 after `pty:prepare` without surfacing the child stderr. |
| `RALPHY_BIN='.../release/Ralphy Media.app/Contents/Resources/bin/ralphy' bun run smoke` | 0 | Diagnostic rerun passed with bundled Core 0.3.0: `Electron smoke passed`. |

The unqualified smoke remains an environment failure caused by the globally
installed legacy CLI, not an Instrument regression. The current bundled Core
satisfies the Desktop bridge contract. A focused bundled-Core integration test
also copies the live SQLite store to a temporary root, then exercises
`createProjectReader().reviewMedia` through approve and reject; each call creates
and ends a main-owned Core Session. Cleanup uses the originating Core client
even if the renderer root becomes stale, and the integration compares open
Session counts before and after review. The source store is never mutated.

## Icon decision

Selected concept: **abstract dither aperture**, retained from the selected
image-generation exploration and quantized into deterministic `#050505`,
`#F2F2F0`, and `#E0362C` flat fills. The mechanical R and dial explorations were
not shipped.

`assets/app-icon-1024.png` contains exactly those three colors; edge
antialiasing is introduced only by resizing into the ICNS representations.
`bun run icon:mac` rebuilt `build/RalphyMedia.icns`. The `build/` directory is
repository-ignored, so only the source PNG is committed. Small-size inspection
retained both the silhouette and red indicator:

| Size | Sample | Inspection |
| ---: | --- | --- |
| 16 px | 4 red-dominant antialiased pixels | Indicator survives; silhouette remains distinct. |
| 32 px | 16 red-dominant antialiased pixels | Indicator and aperture remain separable. |
| 128 px | 254 red-dominant pixels, 132 exact red | Indicator, aperture, and binary dither are clear. |
| 1024 px | 14,519 exact-red pixels; 3 colors total | Exact source palette; SHA-256 `b7303ff5c8ca2afcf13a510493e834ffe79962d62c358bcfc017a7003ec47ad5`. |

Generated ICNS SHA-256:
`09dc9109030c7d601ae29daed5845a6eb115043c70595198a8c1f9f54451f7a0`.

## Screenshot inventory

All desktop screenshots are exactly 1440×900 unless noted.

| File | State |
| --- | --- |
| `media-light-1440x900.png` | Media, light theme, right rail open, live approved item selected in Review. |
| `media-dark-1440x900.png` | Media, dark theme, same live review state. |
| `marketplace-wip-dark-1440x900.png` | Honest Marketplace WIP landing. |
| `workspace-projects-light-1440x900.png` | Workspace Projects with live preview assets. |
| `memory-dark-1440x900.png` | Memory with live rules and expanded negative-scope warning. |
| `calendar-dark-1440x900.png` | Calendar month with live publication fixtures and Postiz-unavailable state. |
| `settings-dark-1440x900.png` | Appearance settings with Dark selected. |
| `local-models-dark-1440x900.png` | Live Local Models catalogue and machine-fit data. |
| `media-dark-constrained-1100x720.png` | Minimum layout: sidebar open, right rail collapsed, four media lanes, no horizontal document overflow. |

## Media comparison with handoff 3a / 3b

Matches observed in both themes:

- Renderer geometry is 8 px desk padding, a 48 px top row, a 240 px sidebar,
  a 292 px right rail, four natural-ratio media lanes, and 10 px lane gaps.
- Light desk is `#E2E4EA`; dark desk is `#050505`; right-rail widgets are
  `#141414`; Reject alone uses the red exceptional-state treatment.
- Filters are compact pills, the item count uses Doto, frames are flat and
  black, captions sit outside the frames with status dots, and selection uses
  an ink ring plus `IN CONSOLE` rather than an accent color.
- Computed styles on the header, sidebar, right rail, Review, captions, and
  project dock report zero borders, `box-shadow: none`, and
  `backdrop-filter: none`.
- Computed contrast checks cover the selected sidebar row and invariant white
  composer chips in light and dark themes; the selected row's SVG icon is also
  sampled independently. All sampled ratios are at least 4.5:1.
- Review is 374 px high at 1440×900 and leaves 454 px for chat, matching the
  reference's compact review/chat balance. Close overlays the preview, verdict
  is folded into metadata, and navigation follows the verdict actions.
- At 1100×720 the right rail can be collapsed and the document remains exactly
  1100 px wide with no horizontal overflow. Icon-only project dock buttons use
  their `aria-label`s without rendering redundant hidden-label spans.

Concrete differences from the reference:

- The handoff island contains sample review aggregates and a background-task
  meter. The live island is narrower and shows only available project
  name/status/count data; unavailable telemetry is intentionally not invented.
- The handoff sidebar includes sample review-progress and overdue widgets. The
  live project has no equivalent shell context, so those widgets are omitted.
- The handoff toolbar includes an explicit rows/columns/gallery control cluster;
  the production toolbar exposes the current density slider/control only.
- The handoff enables Needs work. Production disables both the action and `N`
  shortcut because Core requires an iteration and non-empty feedback, and this
  wave intentionally does not invent that workflow. A persistent on-surface
  explanation is associated with the disabled action through
  `aria-describedby`. Approve and Reject are real Core-backed actions.
- File order, selected item, status totals, captions, and preview ratios differ
  because the captures use live project data rather than prototype samples.

## Other capture observations

- Marketplace is a true top-level shell: its rail shows Discover/WIP, working
  Local Models, and the user pill without My Work counts or project navigation.
  The island reports `Marketplace · Catalog preview`, while My Work route and
  project selection remain preserved for return. The Marketplace screenshot is
  captured only after the outgoing work chat rail has detached.
- The island is keyboard-operable and opens a compact disclosure containing the
  same real status/project/count/busy data, avoiding silent truncation without
  inventing telemetry.
- Settings is reachable through `Command-,` and the user-pill Settings menu
  item. Its modal has initial focus, a focus trap, Escape close, opener restore,
  and an inert workbench background. The profile path restores focus to the
  persistent user-pill trigger rather than the transient menu item.
- The built preview is left open at 1440×900, dark Media, with a live approved
  item selected in Review.
