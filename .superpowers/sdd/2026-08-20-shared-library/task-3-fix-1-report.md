# Task 3 fix 1 report — Shared Library review corrections

## Result

- The Shared Library stylesheet is now part of the design-system corpus. Its disallowed 9px sizes and uppercase transforms are gone; literal audit headings use the approved 9.5px scale.
- Grid and audit identities no longer present a slug as a title. They show the explicit `Title unavailable — Core does not return artifact titles` state and label the returned identifier as `SLUG`; media primitives receive a labeled slug identity too.
- The audit list now separates exact selected revision ID/state from the explicitly headed revision count column. Grid facts also label revision count, and no revision replacement mutation was added.
- Resolved image, video, audio stream/player, and audio decode/load failures now propagate through the existing low-level primitives to the shared honest `Preview unavailable` state. No audio autoplay behavior changed.
- Search coverage is table-driven across slug, kind, MIME, `referencedAs`, and provenance; every sort mode is covered. Root-only and workspace-only rerenders separately prove controller, query, selection, and preview-token reset behavior.
- The default 4:5 grid is explicitly five columns at the reference content width, with 4/3/2-column container breakpoints. Hover/selection transitions use the existing 160ms token and retain the reduced-motion override.
- Grid/list identity buttons now name click/Space inspector selection separately from Enter/double-click viewer opening. The former interactive card wrapper was removed, so media/player controls are not nested inside a conflicting button role.

## TDD evidence

- RED: adding `shared-library.css` to the design corpus exposed its 9px and uppercase-transform violations.
- RED: screen contracts failed on unlabeled slug identity, misleading revision cells, missing dedicated accessible identity controls, and actual `error` events from the image, video, and audio elements.
- RED: a follow-up media-heading assertion caught the audio primitive still rendering the raw slug as an unlabeled title.
- GREEN: Task 3 screen/presentation checks pass; the design suite now differs only by the pre-existing `font-weight: 500` baseline failure in `src/styles/app.css`.

## Verification

- Task 1/2, Task 3 screen/navigation/Overview, and lower-media regression gate: 109 passed, 1 intentional live-Core skip.
- Full mock suite: 558 passed, 1 skipped, with only the two recorded baseline failures: Calendar fixed-date text and the pre-existing design-system `font-weight: 500` contract.
- `bun run typecheck`: exited 0.
- `bun run build`: exited 0; Vite retained its existing large-chunk warning.
- `git diff --check`: exited 0.
- Staged gitleaks is recorded in the commit handoff.

## Scope and concerns

- No Core, database, Electron, preload, IPC, schema, migration, dependency, prototype runtime, asset, or data contract changed. The only lower-level changes are optional media-error callbacks needed to prove and render honest preview failure.
- Titles and the previously documented semantic/future fields remain unavailable until Core exposes them. Task 4+ still owns the inspector, viewer, and mutation workflows; this fix adds none of those implementations.
