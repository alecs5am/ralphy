# Usable Media Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the current Core-backed Desktop structure with visual media tiles, an accessible viewer/inspector, generation details, and consistent established styling.

**Architecture:** Keep the current Workspace/Project screens, six Project tabs, cursor pages, controller, and trusted media protocol. Adapt the old tile/dialog interaction patterns to safe Core DTOs; resolve previews only for mounted virtual tiles through the existing main-owned locator chain, and request provenance only when the modal is open.

**Tech Stack:** Electron, React, TypeScript, Vitest, `@tanstack/react-virtual`, Radix Dialog, Motion, existing semantic CSS and media preview components.

## Global Constraints

- Preserve the current navigation and domain structure; this is not a structural rollback.
- Consume exact Core contract major 2 and require the advertised `media.generation.show` capability before showing provenance.
- Add no dependency and no Tailwind/shadcn layer.
- Reuse existing Ralphy tokens, squircle treatment, modal CSS, `ImageViewport`, `VideoPlayer`, `AudioWaveform`, and Markdown rendering.
- Never expose a raw path, locator, generic request/response/error/metadata, provider payload, credential, external ID, Finder/Trash/drag action, or legacy scanner to React.
- Keep server-side media filtering, 50-item cursor pages, explicit Load more, and virtualization.
- Only mounted tiles may resolve previews; cap concurrency at image 4, video 2, audio 1 and cache at most 128 immutable target/root-epoch entries.
- Modal previous/next navigates loaded filtered items only and never auto-loads another page.
- Prompt-like text is escaped plain text, collapsed by default, and copied only on explicit user action.
- Keep one outer scroll owner per screen and structural borders only.
- Use TDD with a witnessed behavior-level RED before every production change.
- Do not access or mutate the live `.ralphy` tree during implementation.

---

### Task 1: Copy and secure the generation-detail contract

**Files:**
- Modify: `electron/ralphy/types.ts:285-370,800-845`
- Modify: `electron/ralphy/project-reader.ts:1-35,285-330`
- Modify: `electron/media/types.ts:285-370`
- Modify: `electron/main.ts:1100-1190`
- Modify: `electron/preload.ts:1-55`
- Modify: `src/lib/ipc.ts:210-270`
- Modify: `tests/ralphy-current-core.test.ts`
- Modify: `tests/project-reader.test.ts`
- Modify: `tests/ipc-security.test.ts`
- Modify: `electron/ralphy/contract-type-assertions.ts`

**Interfaces:**
- Consumes: Core Task 4 `media.generation.show` and its exact DTOs.
- Produces:
  - `MediaWorkbenchBridge.loadProjectGeneration(project,target,after?)`
  - `MediaWorkbenchBridge.loadProjectMediaRevisions(project,artifactId,after?)`
  - `MediaWorkbenchBridge.selectProjectMediaRevision(project,artifactId,revisionId,expectedSelectedRevisionId)`

- [ ] **Step 1: Write copied-contract and reader REDs**

Copy the exact Core DTO names and discriminants, including:

```ts
export type MediaGenerationTarget =
  | { type: "artifact-revision"; id: string }
  | { type: "run-object"; id: string };

export type MediaGenerationDetailDto =
  | { status: "generation"; target: MediaGenerationTarget; run: RunDto;
      attempts: Page<GenerationAttemptDetailDto>;
      cost: { knownUsd: number | null; complete: boolean } }
  | { status: "not-generation"; target: MediaGenerationTarget; producer: RunDto }
  | { status: "unknown"; target: MediaGenerationTarget;
      reason: "not-recorded" | "ambiguous" };
```

Add compiled exact-key assertions so DTO drift fails `bun run typecheck`. In the reader test require one exact request:

```ts
request("media.generation.show", {
  context: { authority: "Project", workspaceId: "ws_1", projectId: "prj_1" },
  target: { type: "artifact-revision", id: "arev_1" },
  limit: 20,
});
```

Artifact cards without `selectedRevisionId` must not issue the request and return `unknown/not-recorded` locally. Raw Object cards are not valid targets. Reject malformed response discriminants, IDs, page cursors, attempt/provider/model/cost/text/parameter fields, oversized text, non-finite numbers, unknown parameter names, and privacy keys.

Require Artifact revision listing to page `media.revisions` with an exact Artifact ref and selection to call:

```ts
request("media.select", {
  context,
  ref: { type: "artifact", id: "art_1" },
  revisionId: "arev_1",
  expectedSelectedRevisionId: null,
});
```

The reader must validate that the returned refreshed card has the same Artifact ID and selected revision. The copied contract accepts `string | null` for `expectedSelectedRevisionId`.

- [ ] **Step 2: Verify RED**

Run: `bun run test -- tests/ralphy-current-core.test.ts tests/project-reader.test.ts tests/ipc-security.test.ts`

Expected: FAIL because the method, DTOs, IPC channel, and reader are absent.

- [ ] **Step 3: Add the narrow reader and IPC path**

Add `loadGeneration(project, target, after?)`, `loadMediaRevisions(project, artifactId, after?)`, and `selectMediaRevision(project, artifactId, revisionId, expectedSelectedRevisionId)` to `createProjectDomainReader`; validate exact IDs and complete response shapes before returning them. Register exact named channels through `securedHandle` and `parseProjectReference`; the generation channel also uses a new exact target parser. Preload exposes only the named methods. The mock bridge throws the existing domain-unavailable error.

- [ ] **Step 4: Verify GREEN**

Run: `bun run test -- tests/ralphy-current-core.test.ts tests/project-reader.test.ts tests/ipc-security.test.ts && bun run typecheck`

Expected: PASS with trusted sender/root fences and compiled contract assertions.

- [ ] **Step 5: Commit**

```bash
git add electron/ralphy/types.ts electron/ralphy/project-reader.ts electron/media/types.ts electron/main.ts electron/preload.ts src/lib/ipc.ts electron/ralphy/contract-type-assertions.ts tests/ralphy-current-core.test.ts tests/project-reader.test.ts tests/ipc-security.test.ts
git commit -m "feat(desktop): load media generation details"
```

### Task 2: Restore visual virtual tiles safely

**Files:**
- Create: `src/lib/media.ts`
- Modify: `src/components/VirtualAssetGrid.tsx`
- Modify: `src/screens/ProjectScreen.tsx:122-180`
- Modify: `tests/project-media-presentation.test.tsx`
- Create: `tests/media-grid.test.ts`

**Interfaces:**
- Consumes: existing `resolveProjectPreview(project, ref)`, `ProjectReference`, `MediaCardDto`, and root epoch.
- Produces:
  - `assetGridGeometry(width,targetTileWidth,gap)`
  - `previewScheduler`
  - visual mounted-tile previews and `onOpen(card)`.

- [ ] **Step 1: Write geometry, scheduling, and mounted-preview REDs**

Restore only the old deterministic geometry and scheduler behavior in the desired API:

```ts
expect(assetGridGeometry(492, 190, 16)).toEqual({
  columns: 2,
  tileWidth: 238,
  tileHeight: 202.75,
  rowHeight: 218.75,
  gap: 16,
});
```

Use hand-derived literals for approximately 492px, 688px, and wide widths. In the rendered grid, assert a real `<img loading="lazy">` or `<video muted preload="metadata">` appears after the mounted tile's resolver succeeds; unmounted/overscan-external cards issue no resolver call; the same immutable ref/root epoch resolves once; changing root epoch resolves again; late unmounted results do not publish; failures retain the MIME glyph.

Assert single click selects, double click calls `onOpen`, Enter/Space select through the button, and an explicit Open control remains keyboard reachable without nesting a button inside a button.

- [ ] **Step 2: Verify RED**

Run: `bun run test -- tests/media-grid.test.ts tests/project-media-presentation.test.tsx`

Expected: FAIL because the current tile is text-only and geometry is fixed.

- [ ] **Step 3: Restore the smallest old media primitives**

Create `src/lib/media.ts` containing only `assetGridGeometry`, `createPreviewScheduler`, and:

```ts
export const previewScheduler = createPreviewScheduler({
  image: 4,
  video: 2,
  audio: 1,
});
```

Do not restore legacy query/filter/annotation code. Adapt `MediaCardTile` to accept `project`, `rootEpoch`, `resolvePreview`, `onSelect`, and `onOpen`. Cache promises in a module Map keyed by `rootEpoch:workspaceId:projectId:ref.type:ref.id`, evict oldest beyond 128, and release the scheduler on load/error/unmount. Audio tiles use the existing byte ceiling and waveform helper; otherwise use the existing type glyph.

Use `assetGridGeometry()` for every virtual row's explicit height and the established 16:10 preview shell.

- [ ] **Step 4: Verify GREEN**

Run: `bun run test -- tests/media-grid.test.ts tests/project-media-presentation.test.tsx`

Expected: PASS with no hidden page load and no overlap.

- [ ] **Step 5: Commit**

```bash
git add src/lib/media.ts src/components/VirtualAssetGrid.tsx src/screens/ProjectScreen.tsx tests/media-grid.test.ts tests/project-media-presentation.test.tsx
git commit -m "fix(desktop): restore visual media tiles"
```

### Task 3: Add selected-media viewer and inspector

**Files:**
- Create: `src/screens/project/MediaViewer.tsx`
- Modify: `src/state/project-screen-controller.ts:1-115,285-325`
- Modify: `src/screens/ProjectScreen.tsx:75-155`
- Modify: `tests/project-domain-state.test.ts`
- Modify: `tests/project-screen-behavior.test.tsx`
- Modify: `tests/project-media-presentation.test.tsx`

**Interfaces:**
- Consumes: Task 1 `loadProjectGeneration`, Task 2 `onOpen`, existing selected preview state and media page.
- Produces controller methods `openMediaViewer(card)`, `closeMediaViewer()`, `navigateMediaViewer(delta)`, and modal state in `ProjectScreenSnapshot`.

- [ ] **Step 1: Write controller race/navigation REDs**

Extend the snapshot with:

```ts
mediaViewerOpen: boolean;
mediaGeneration: {
  status: "idle" | "loading" | "ready" | "error";
  value: MediaGenerationDetailDto | null;
  error: string | null;
};
mediaRevisions: {
  status: "idle" | "loading" | "ready" | "error";
  items: ArtifactRevisionDto[];
  error: string | null;
};
```

Require open to retain current grid selection/pagination, load preview and generation independently, ignore A after B, close on filter/project/root disposal, and retry only the generation detail. For an Artifact, load its revisions; an unselected Artifact shows the revision chooser instead of the dead-end “Select a revision” message. Selecting a revision uses a null-aware CAS, replaces the selected grid card with the returned refreshed card, then loads preview/provenance. A conflict reloads revisions/card and keeps the modal open without retrying the mutation. Previous/next uses `snapshot.domain.pages.media.items`, skips no records, disables outside the loaded array, and never calls `loadProjectPage`.

- [ ] **Step 2: Verify controller RED**

Run: `bun run test -- tests/project-domain-state.test.ts tests/project-screen-behavior.test.tsx -t "media viewer"`

Expected: FAIL because modal state and methods are absent.

- [ ] **Step 3: Implement minimal controller state/fences**

Add independent `mediaGenerationRequest` and `mediaRevisionRequest` counters. `openMediaViewer(card)` calls existing `openMedia(card)`, marks the viewer open, loads Artifact revisions when applicable, converts selected Artifact→selected immutable revision or RunObject→exact ref, and calls `loadProjectGeneration`. Missing selected Artifact revision waits for user selection and performs no preview/provenance request. `closeMediaViewer`, media filter change, and dispose increment both counters.

- [ ] **Step 4: Write accessible modal RED**

Mount the real ProjectScreen with the existing test React host. Assert Radix Dialog title/description, Close, Escape, focus return/fallback, large image/video/audio stage, role=status, role=alert+Retry, loaded-item arrows, and arrow-key suppression while focus is inside `textarea`, `input`, `contenteditable`, or a slider.

Assert the inspector renders literal provider/model, partial and complete cost semantics, state/time, `Generation`/`Not a generation`/`Provenance unavailable`, collapsed escaped prompt, Show full, Copy, safe parameters, and `Not recorded`. An HTML prompt must remain text and never create an element. An unselected Artifact renders its revision number/state/time list and an explicit Select action; after success the real preview replaces the chooser.

- [ ] **Step 5: Verify modal RED**

Run: `bun run test -- tests/project-media-presentation.test.tsx tests/project-screen-behavior.test.tsx`

Expected: FAIL because no modal exists.

- [ ] **Step 6: Adapt the existing dialog shell**

Use installed `@radix-ui/react-dialog`, existing `.asset-modal-*` CSS, Motion, and current preview primitives. Keep `ProjectScreen` structure and current inline selection behavior; wire Task 2 double-click/Open to `openMediaViewer` and render `MediaViewer` once beside the media tab content.

Use a semantic `<dl>` for facts and `<pre>` for prompt-like text. Reuse `bridge.copyText` only from the explicit Copy button. Do not add Finder, Trash, paths, drag, annotations, or review controls.

- [ ] **Step 7: Verify GREEN**

Run: `bun run test -- tests/project-domain-state.test.ts tests/project-screen-behavior.test.tsx tests/project-media-presentation.test.tsx`

Expected: PASS with the virtual grid still mounted when the modal opens/closes.

- [ ] **Step 8: Commit**

```bash
git add src/screens/project/MediaViewer.tsx src/state/project-screen-controller.ts src/screens/ProjectScreen.tsx tests/project-domain-state.test.ts tests/project-screen-behavior.test.tsx tests/project-media-presentation.test.tsx
git commit -m "feat(desktop): add media viewer inspector"
```

### Task 4: Apply the established design language to current screens

**Files:**
- Modify: `src/screens/WorkspaceScreen.tsx`
- Modify: `src/screens/ProjectScreen.tsx`
- Modify: `src/screens/project/CompositionsPanel.tsx`
- Modify: `src/components/ProjectHeader.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/workbench.css:1230-1460,1860-2225,3660-3780,4230-4310`
- Modify: `src/styles/tokens.css:115-165`
- Modify: `tests/design-system.test.ts`
- Modify: `tests/workspace-domain.test.tsx`
- Modify: `tests/documents-panel.test.tsx`
- Modify: `tests/composition-view.test.tsx`

**Interfaces:**
- Consumes: current DTOs/controllers and established `.metrics-band`, `.content-section`, `.workspace-project-*`, `.mode-segments`, `.filter-chip`, `.command-button`, `.section-heading`, `.asset-*`, and `.asset-modal-*` patterns.
- Produces: current structure with consistent surfaces, controls, scroll ownership, and responsive behavior.

- [ ] **Step 1: Write active-surface design REDs**

Replace dead/deleted-selector assertions with behavior and computed-style checks for active screens. Require:

- no `var(--surface)` declaration;
- Workspace and Project overview record lists have no card/list/row recursive border;
- exactly one outer vertical scroll owner per screen;
- no horizontal overflow at 1360x860 and 1100x720 with sidebar/right-panel combinations;
- raised preview/dialog/project surfaces are in the squircle allowlist;
- filter/status pills remain round;
- Workspace project grid/list toggle uses only Core DTO fields;
- Documents search/editor and Compositions actions use styled existing controls and visible focus;
- Project header heading/icon layout remains inline and aligned.

The test mutation that re-adds a border to `.project-domain-list` or restores `var(--surface)` must fail.

- [ ] **Step 2: Verify RED**

Run: `bun run test -- tests/design-system.test.ts tests/workspace-domain.test.tsx tests/documents-panel.test.tsx tests/composition-view.test.tsx`

Expected: FAIL on current recursive borders, raw controls, and stale assertions.

- [ ] **Step 3: Make the smallest markup/CSS correction**

Keep current routes, tabs, ordering, controller calls, and data. Restore the existing Workspace grid/list presentation by reconnecting the already-persisted `workspaceView` setter. Render only bounded Core fields. Use borderless content sections/hover rows; only selected detail/preview receives `--raised`.

Remove duplicate outer padding/scroll rules, replace invalid `--surface` with `--panel-solid` only where a real surface remains, reuse `.filter-chip`/`.command-button`, and apply current squircle selectors. Do not add new colors, radii, shadows, or component abstractions.

- [ ] **Step 4: Verify GREEN**

Run: `bun run test -- tests/design-system.test.ts tests/workspace-domain.test.tsx tests/documents-panel.test.tsx tests/composition-view.test.tsx`

Expected: PASS with current domain behavior unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/screens/WorkspaceScreen.tsx src/screens/ProjectScreen.tsx src/screens/project/CompositionsPanel.tsx src/components/ProjectHeader.tsx src/App.tsx src/styles/workbench.css src/styles/tokens.css tests/design-system.test.ts tests/workspace-domain.test.tsx tests/documents-panel.test.tsx tests/composition-view.test.tsx
git commit -m "fix(desktop): finish current visual system"
```

### Task 5: Full Desktop validation and package

**Files:**
- Modify only if a witnessed gate or packaged-app regression requires it.
- Report: plan SDD workspace task report.

**Interfaces:**
- Consumes: Tasks 1-4 and the locally built reviewed Core binary.
- Produces: packaged app ready for the manual data operation.

- [ ] **Step 1: Run focused media/design gate**

Run:

```bash
bun run test -- tests/project-reader.test.ts tests/ipc-security.test.ts tests/media-grid.test.ts tests/project-domain-state.test.ts tests/project-screen-behavior.test.tsx tests/project-media-presentation.test.tsx tests/design-system.test.ts tests/workspace-domain.test.tsx tests/documents-panel.test.tsx tests/composition-view.test.tsx
```

Expected: all files pass with the existing intentional live-Core skip only where documented.

- [ ] **Step 2: Run full Desktop gates**

Run:

```bash
bun run typecheck
bun run test
bun run build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 3: Package and smoke without touching live data**

Run the package-defined macOS packaging command and launch the packaged app against an isolated fixture library. Verify Workspace/Project navigation, grid scroll, image/video/audio tile preview, modal open/Escape/arrows, provenance states, Documents, and Compositions. Record screenshots at 1360x860 and 1100x720 in the plan's ignored SDD workspace.

- [ ] **Step 4: Commit any test-proven package fix, otherwise record no diff**

Before any commit run `gitleaks protect --staged --redact`. Do not publish, sign for distribution, or replace `/Applications/Ralphy Media.app` until the manual recovery plan reaches its package-install step.
