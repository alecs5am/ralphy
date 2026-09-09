# Nothing OS final integration wave

## Scope and commits

- Integration base: `38c81d0`
- `ff9cd88` — `fix: finish instrument overlays and project dock`
- `3effe4b` — `test: finalize instrument package evidence`
- Completed Marketplace/Polish Tasks 8–14 as one accelerated integration wave.
- Reconciled the merged Work and Marketplace waves without changing Core, IPC, database schemas, or adding dependencies.

## Runtime and visual outcome

- Registered reachable Work overlays at their real production surfaces so the flat Instrument overlay treatment applies to Shared Library, Memory, Calendar, workspace detail, Media, Unit, and Activity surfaces.
- Fixed the project dock escaping its bottom-center contract because older `project-controls` CSS won after the Instrument stylesheet. It now portals outside transformed route ancestors and is locked to the bottom-center at every project route.
- Verified UX Testing Lab Media in mock and production packages. Mock exposes the labelled renderer-only test review. Production exposes read-only review with the exact Core 0.3.0 unsupported reason and no mock presentation.
- Captured representative light/dark Media 3a/3b, workspace, 1440×900, 1280×800, and 1100×720 evidence after image load and real selection/rail state.

## Packaging and safety

- Mock package: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/.worktrees/nothing-os-redesign/release/Ralphy Media Mock.app`
- Production package: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/.worktrees/nothing-os-redesign/release/Ralphy Media.app`
- Both packages are ad-hoc codesign-valid and contain the independently pinned Core `0.3.0` SHA-256 `a843e2805b4b0a49d02f7afe46cdd5693d81184c14d560af836be93283d85679`.
- Packaging retains approved Core bytes before replacing an output app, so rebuilding the production path cannot destroy its own approved source.
- Production `dist` and packaged renderer contain none of the complete mock/fixture marker allowlist.
- Every visual audit used one hidden Electron process for the complete resize/state journey. Maximum concurrent app instances was `1`; active instances after each run was `0`.
- Both launches recorded unchanged main database and WAL fingerprints. SQLite SHM churn was observed and recorded separately as expected.

## Evidence

- Final manifest: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/.worktrees/nothing-os-redesign/.superpowers/sdd/nothing-instrument/final/manifest.json`
- Contact-sheet report: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/.worktrees/nothing-os-redesign/.superpowers/sdd/nothing-instrument/final/report.html`
- Media fidelity record: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/.worktrees/nothing-os-redesign/.superpowers/sdd/nothing-instrument/final/media-fidelity.json`
- Manifest phase: `final`, revision `25`.
- Inventory lock: `317` canonical scenarios, `1,898` expanded theme/viewport cases, semantic digest `9a392591abbb59f445f6b5d81d95eb533cdc0b4fa12a2e837762d549c70c9ed4`.
- Evidence contains two serialized launches, ten captures, eight accessibility journeys, package/Core verification, DB-family records, and approved product/visual/accessibility/security/regression decisions.

## Verification

- `bun run typecheck` — pass.
- `VITE_RALPHY_ENABLE_MOCKS=false bun run build` — pass; existing chunk-size warning only.
- `bun run audit:instrument:source` — `INSTRUMENT_SOURCE_AUDIT_OK 125`.
- `bun run audit:instrument:marketplace` — `MARKETPLACE_INSTRUMENT_AUDIT_OK 10`.
- Mock hidden audit — `INSTRUMENT_ELECTRON_AUDIT_OK mock 1`.
- Production hidden audit — `INSTRUMENT_ELECTRON_AUDIT_OK production 1`.
- `bun run audit:media:fidelity` — pass.
- `bun run audit:instrument:final` — pass and emitted the absolute report path.
- Full suite — `935 passed`, `1 skipped`; only the two recorded pre-existing baselines failed.
- `git diff --check`, staged gitleaks checks, both codesign checks, and production mock-marker exclusion — pass.

## Known baselines

1. `tests/calendar-screen.test.tsx` retains its fixed date expectation `Tue, Aug 18, 2026` while the screen follows the current calendar period.
2. `tests/design-system.test.ts` retains the pre-existing global `font-weight: 500` contract failure outside this wave.

No integration regression remains open from this wave.
