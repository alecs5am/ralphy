# Nothing Work Surfaces — implementation report

## Scope

- Branch: `codex/nothing-work-wave`
- Base: `32e93891aac05f97637699d35b58c7e3290e652d`
- Implementation commit: `de37a0d` (`feat: rebuild Nothing work surfaces`)
- Plan: `docs/superpowers/plans/2026-08-20-nothing-work-surfaces.md`, Tasks 1–20
- Marketplace was not changed.

## Production outcome

The complete Work mode now uses one coherent Nothing OS / Teenage Engineering presentation layer across startup and Home Library, Workspace Overview and navigation, Shared Library, Memory, Calendar, project Documents, Media, Units, Activity, their inspectors, viewers, workflows, and registered overlays. The implementation reuses the existing production controllers, bridge contracts, shell, token layer, overlay registry, and shell-owned scrolling instead of introducing parallel data flows.

Notable closure work:

- Theme-resolved flat instrument surfaces, monochrome hierarchy, red semantic accents, compact mono metadata, 8px shell gaps, 240px sidebar, 292px rail, R24 widgets, no new literal color system, shadows, blur, or decorative depth gradients.
- Shared Library, Calendar, and Activity inspectors use the shell rail when it is open and remain usable in the work surface when the rail is closed.
- Activity virtualization consumes the shell scroll owner; loaded history, live catch-up, cursor tail, and inspector state stay on the existing controller contract.
- Media receives the 3a/3b grid and review-console treatment, truthful preview/viewer behavior, selection navigation, production read-only review state, and shell-rail integration.
- Production review status only accepts validated artifact revision state. Unsupported review controls remain focusable, `aria-disabled`, and explain: `Review is unavailable in Core 0.3.0 from Desktop.`
- The UX Testing Lab A/N/R review is renderer-only and in-memory, requires feedback for Needs Work, supports guarded A/N/R shortcuts, and resets the complete session on the exact `(rootEpoch, workspaceId, projectId)` tuple.
- The mock implementation and mock CSS are lazy leaf chunks gated by the exact `VITE_RALPHY_ENABLE_MOCKS === "true"` and `workspaceName === "UX Testing Lab"` checks. A false production build contains neither review mock module, fixture marker, feedback UI copy, nor mock CSS.

No Core, DB, IPC, Electron process code, shared contract, dependency, or package-lock change was made.

## Verification gates

| Gate | Result |
|---|---|
| `bun run typecheck` | Pass |
| `VITE_RALPHY_ENABLE_MOCKS=false bun run build` | Pass: renderer and Electron bundles |
| False-bundle scan for mock review module, fixture marker, feedback UI, and mock CSS | Pass: absent |
| `VITE_RALPHY_ENABLE_MOCKS=true bun run build:renderer` plus review marker scan | Pass: one separate lazy review chunk present |
| Work-focused Vitest wave | 415 passing assertions across 37 passing files in the broad run; workspace navigation, Shared Library, Activity, review, and settings follow-ups pass independently |
| Critical review tests | Pass: 19/19 across mock reducer, production presentation, media presentation, and Activity |
| Instrument color audit | Pass: 65/65 |
| Instrument settings/focus probe | Pass: 2/2, hidden Electron |
| `git diff --check` | Pass |
| Core/DB/IPC/shared-contract diff scan | Pass: no changed paths |

## Hidden geometry audit

The standard serial audit ran six hidden cases at 1440×900, 1280×800, and 1100×720 across light/dark and docked/closed/overlay panel states.

- `maxActiveInstances: 1`
- `activeInstancesAfterRun: 0`
- all six cases: one vertical scroll owner and no horizontal overflow
- visible sidebar: exactly 240px
- docked rail: exactly 292px
- no visible window was opened
- temporary Electron links and all audit processes were cleaned after the run

Local evidence: `.superpowers/sdd/nothing-instrument/shell/manifest.json` and its six hidden screenshots.

## Known baseline

`tests/calendar-screen.test.tsx` remains 6/7: its fixed-date assertion expects `Tue, Aug 18, 2026`, while the current-date-driven schedule flow renders the current period. This was present before this wave and is unrelated to the Work-surface rewrite; calendar contract and presentation suites pass.
