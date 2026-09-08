# Video Unit workspace implementation

**Goal:** Turn the approved archive 23 layout into Ralphy's own usable video editing workspace. HyperFrames supplies the composition model and playback/render contract; its Studio UI is not embedded.

**Design:** One contextual application header, collapsible asset library, large stage, one right inspector and a compact dark timeline. Reuse Window surfaces, current semantic colors and Create's ruler controls. Selection does not seek or recenter the stage.

**Architecture:** A `features/video-workspace` slice owns the editing session. Project Units open it in place of the project workbench. A small Electron module persists Unit-scoped drafts with optimistic concurrency, imports assets through existing guarded media access, and prepares exact source snapshots for the installed Ralphy runtime. SDK history remains the editing history; saved drafts and rendered Unit revisions remain distinct.

## Work

1. Verify installed HyperFrames SDK/player and Ralphy CLI contracts. Define the draft IPC contract and source handling. Preserve existing arbitrary source rather than claiming a flat MP4 has editable layers.
2. Add the editor session, timeline timing/trim/split/delete/undo behavior and file import. Add focused checks for timing bounds, serialization and conflict-safe persistence.
3. Implement the responsive workspace regions and Unit entry point. Use real playback, selection, inspector changes, searchable library, source history and render state. Use existing Create controls.
4. Add an explicit UX Testing Lab browser fixture with archive imagery and a real HyperFrames composition. Exercise editing, undo, save/reopen, playback and compact/light/dark layouts.
5. Run typecheck, Vitest, build, architecture/style audits and diff whitespace checks; package the preview app. Record material engine limitations honestly.

## References

- `docs/design/2026-09-07-video-unit-workspace-design-brief.md`
- Archive 23, artboards 2a–2d and 3a–3c (reference data, adapted to current components).
- [HyperFrames SDK](https://hyperframes.heygen.com/sdk/quickstart)
- [HyperFrames Player](https://hyperframes.heygen.com/packages/player)
- Installed Ralphy `composition revise`, `composition build`, and `unit revise` contracts.

## Implementation and verification

Implemented the Unit entry point, contextual header, collapsible library, isolated HyperFrames player, responsive inspector, resizable timeline, frame stepping, selection, trim, split, duplicate, text and media properties, media import/replacement, SDK undo/redo, draft comparison, scoped agent handoff, autosave and local draft recovery. Current Create controls and semantic theme colors replace the archive's older controls and literals.

Draft source and render outputs remain separate from the Unit's selected revision. The desktop adapter reuses a live Ralphy draft checkout, checks source hashes before rendering, and delegates exact composition builds to the installed CLI. Preview documents run with an opaque origin and restricted resource access.

Validation: typecheck and build passed; architecture audit reported zero violations; style audit completed with existing advisory findings; whitespace check passed. Vitest: 1,127 passed, one existing skip across 140 files. Focused checks cover frame-aligned split/trim, atomic undo, literal text, stale saves, symlinks, external source edits, stable agent IDs and recovery after unmount. Browser checks exercised title editing, playback, trim/undo, Cmd+A, saved draft comparison, and light/dark layouts including 1280×720 and a 1000px-wide work area. The signed Preview app was rebuilt.

### Current boundaries

- A Unit with a file-only source opens as one media clip. Source-video dimensions and duration are read from the media; a flat MP4 is not reconstructed into layers.
- Rendering requires a linked, available HyperFrames composition checkout. Core's current public contract cannot create that link for a file-only Unit. Rendering leaves Unit selection unchanged.
- The real UX Testing Lab editor load was exercised. Its editorial fixture's composition could not be materialized by Core, so the adapter opened its available original media instead. An end-to-end MP4 render was **not** verified on that fixture.
- Source animations are preserved. Duplicating or splitting animated/nested elements is rejected with an explanation; edit them through the agent. Preview bundles GSAP and the HyperFrames runtime, and does not load arbitrary external JavaScript dependencies.
- Comparison is between saved source drafts. Generated take management, a full keyframe/curve editor, track locking and an in-editor agent proposal/apply system are outside this implementation.

Review-only fixtures and transport live under `.superpowers/enjoyable-ui/video-preview*`; they do not simulate production render success or charge providers.
