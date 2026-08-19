# Instrument v11 visual verification

Captured on 2026-08-19 from the production renderer build against the live
`~/.ralphy` store. The app was launched with the repository's packaged Core
0.3.0 binary:

```bash
RALPHY_BIN='/Users/maximovchinnikov/github/ralphy/ralphy-desktop/release/Ralphy Media.app/Contents/Resources/bin/ralphy' ./node_modules/.bin/electron . --remote-debugging-port=9333
```

The existing Playwright install under `.ds-sync/` connected over CDP for
deterministic renderer captures. No dependency was added. Native macOS traffic
lights are outside the renderer bitmap and therefore do not appear in these
screenshots.

## Automated verification

| Command | Exit | Result |
| --- | ---: | --- |
| `bun run typecheck` | 0 | Passed (`tsc --noEmit`). |
| `bun run test` | 1 | 495 passed, 1 skipped, 1 failed. The known Calendar test expects `Tue, Aug 18, 2026`, while the schedule dialog deliberately initializes from `Date.now()` (Aug 19 at verification time). |
| `bun run build` | 0 | Renderer and Electron bundles built. Vite emitted its existing advisory for a chunk larger than 500 kB. |
| `bun run smoke` | 1 | The unqualified development smoke selected global `ralphy` 0.2.0, which exits with `error: unknown option '--stdio'`; the harness then exits 1 after `pty:prepare` without surfacing the child stderr. |
| `RALPHY_BIN='.../release/Ralphy Media.app/Contents/Resources/bin/ralphy' bun run smoke` | 0 | Diagnostic rerun passed with bundled Core 0.3.0: `Electron smoke passed`. |

No source or test was changed for either baseline/environment failure. The
Calendar assertion is date-dependent test drift, not an Instrument behavior
regression. The smoke failure is caused by the globally installed legacy CLI;
the current bundled Core satisfies the Desktop bridge contract.

## Icon decision

Selected concept: **abstract dither aperture**, a strict mechanical module made
from black/white flat geometry, one red functional indicator, and a restrained
halftone aperture. The mechanical R and dial explorations were not shipped.

`bun run icon:mac` rebuilt `build/RalphyMedia.icns`. The `build/` directory is
repository-ignored, so only `assets/app-icon-1024.png` is committed. Small-size
inspection retained both the silhouette and indicator:

| Size | Red pixels | Inspection |
| ---: | ---: | --- |
| 16 px | 1 | Indicator survives as a single functional pixel; silhouette remains distinct. |
| 32 px | 12 | Indicator and aperture remain separable. |
| 128 px | 210 | Indicator, aperture, and restrained dither are clear. |
| 1024 px | — | Source is a 1024×1024 PNG; SHA-256 `daded690674e3743890e1c4fae9a70655e7189062c45e23c965ee802663a161d`. |

Generated ICNS SHA-256:
`7f938cc435653fc38903a6e91a1dd0db1b47c0fb5586b1ca5ab8b90e2ac80424`.

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
- At 1100×720 the right rail can be collapsed and the document remains exactly
  1100 px wide with no horizontal overflow.

Concrete differences from the reference:

- The handoff island contains sample review aggregates and a background-task
  meter. The live island is narrower and shows only available project
  name/status/count data; unavailable telemetry is intentionally not invented.
- The handoff sidebar includes sample review-progress and overdue widgets. The
  live project has no equivalent shell context, so those widgets are omitted.
- The handoff toolbar includes an explicit rows/columns/gallery control cluster;
  the production toolbar exposes the current density slider/control only.
- The live Review widget is about 419 px high and leaves about 409 px for chat;
  the handoff allocates roughly 366 px to Review and 461 px to chat. Review is
  therefore visibly taller and chat shorter in the production capture.
- The dark chat composer footer/chips have lower contrast than the handoff's
  light sunken chips.
- File order, selected item, status totals, captions, and preview ratios differ
  because the captures use live project data rather than prototype samples.

## Other capture observations

- Marketplace correctly presents WIP and a working Local Models action, but its
  left rail still shows the My Work workspace/navigation stack instead of a
  Marketplace-specific stack.
- Settings is keyboard-reachable with `Command-,`, but the current user-pill
  profile popover contains only identity and does not expose the Settings action
  described by the v11 product decision.
- The 1100×720 project dock remains reachable, though its visible labels are
  tightly packed around the active icon.

These observations are recorded for the parent-owned adversarial review; no
verification-wave UI fix was applied here.
