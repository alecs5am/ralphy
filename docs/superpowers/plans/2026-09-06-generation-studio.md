# Generation Studio Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent native, navigation and UI tasks below.

**Goal:** Provide direct prompt-based image, video and audio generation from a workspace, with model-specific controls and durable results.

**Architecture:** A generation draft becomes an internal single-model execution snapshot. Reuse the existing CLI runtime, cancellation, sandboxed assets and run history; do not create documents in the user's Canvas library. The renderer consumes a typed catalog, never invents provider capabilities or calls paid APIs directly.

**Tech Stack:** React, TypeScript, Electron, installed Ralphy CLI, existing Window and SelectMenu components, Bun/Vitest.

**Spec:** The acceptance contract below is the design specification for this feature.

## Acceptance contract

- Workspace navigation exposes Create without opening chat. Images, Video and Audio have distinct visual identities; Audio offers voice, music and sound effects.
- Selecting a model changes input roles and controls. Unsupported controls are absent. First frame, last frame and reference images remain distinct through execution.
- Prompt, model, inputs, parameters and variants persist across navigation. Errors cannot silently discard a draft.
- Catalog search shows provider readiness. Unconfigured providers have a direct settings action.
- Estimate is separate from Generate. SFX has no dry run and cannot be executed by the estimate action. Native preflight errors remain visible.
- Results have media playback, settings reuse, reference reuse and export. History distinguishes estimates from actual generation and preserves failures and cancellation.
- Reuse dependencies and semantic design tokens. English application copy; no source file above 400 lines. Preserve existing changes.

## Task 1: Native generation contract and execution

Files: `shared/generation-studio.ts`, `electron/canvas/`, `electron/media/types.ts`, `electron/preload.ts`, `electron/main.ts`, `tests/generation-runtime*.ts`.

- [x] Define GenerationDraft, GenerationModel, GenerationCatalog and GenerationBridge. Expose load/save draft, load catalog/history, start/cancel, and validated asset export.
- [x] Build the catalog from current CLI models/provider matrix and OpenRouter model metadata. Expose only supported CLI fields and input roles.
- [x] Validate all renderer inputs, parameters, asset paths and preflight output before generating. Check the `ok` body even when CLI exits successfully.
- [x] Reuse run snapshots and atomic history. Serialize draft writes, guard root identity, and ensure SFX estimates never execute.
- [x] Verify trust boundaries, role-specific argv, audio dispatch and snapshot restoration with narrow Vitest tests.

## Task 2: Workspace navigation

Files: workspace page inventory, sidebar/view panel route maps, WorkRoute, App layout seam, instrument inventories and route tests.

- [x] Add `generation` / Create to workspace navigation and chat view tabs.
- [x] Lazy-load `GenerationScreen({workspaceId,workspaceName,rootEpoch,onOpenProviders})` and fill the desk.
- [x] Register `GENERATION_SCREEN_STATES` and `generation.parameters` SelectMenu owner.
- [x] Verify route transitions, full-height layout and production inventory contracts.

## Task 3: Studio UI

Files: `src/pages/generation/`, `src/shared/api/mock-generation-bridge.ts`, theme stylesheet, UI state tests.

- [x] Build model selection, explicit reference slots, schema-driven fields, prompt and variation controls in a compact Window.
- [x] Save drafts on edits; guard late async responses and duplicate starts. Poll active runs only and refresh on focus.
- [x] Build responsive result gallery and focused media viewer, actual run states, cost estimates, retry settings and export.
- [x] Show prompt starters as examples, never as generated results. Browser mock cannot submit paid work.
- [x] Verify model changes, draft persistence, stale responses and user actions with focused tests and browser inspection.

## Integration verification

- Provider settings must support the actual generation services. Reuse encrypted credential storage for OpenRouter, ElevenLabs and fal; expose presence/source only, save and remove keys without returning secrets, and refresh Studio availability after a credential change.
- Dynamic SelectMenu controls must ignore empty native-form reset events so switching models cannot erase valid parameter choices.

- [x] Run `bun run typecheck`, `bun run test`, `bun run build`, `bun run audit:arch`, `bun run audit:style`, and `git diff --check`.
- [x] Inspect populated and empty studio states, images/video/audio, narrow and full views, dark and light themes.
- [x] Package and open the local Ralphy Preview app. Test real CLI catalog/estimates without claiming unavailable paid generation succeeded.

## Verification outcome

- Typecheck, production build, architecture/style audits and whitespace checks passed.
- Full Vitest run: 132 files passed; 1080 tests passed and 1 skipped. The run used four workers to avoid cold-import contention on this Mac.
- Browser inspection covered both themes, full and narrow chat layouts, model/voice selection, estimates, simulated variations, reuse and provider settings.
- Eight real CLI preflight/dry-run contract checks passed with no credentials and no paid submissions.
- Packaged Ralphy Preview opened Create independently of chat in UX Testing Lab, loaded the real catalog, restored its prompt and produced a native image estimate of $0.04. Audio/video controls and provider presence matched the native catalog.
- Live paid generation remains unverified: no generation provider key is configured in the running preview. Browser sample outputs are explicitly labeled simulations.
