# Shared Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the workspace Shared Library placeholder with the complete handoff inventory, backed by the current workspace-media contract where it is truthful and by explicit unavailable states where Core has no contract yet.

**Architecture:** Add a workspace-scoped media adapter that reuses Core `media.*` methods and the existing guarded `ralphy-media://` preview boundary without exposing filesystem paths to React. A pure presentation layer keeps current-contract data, bounded/empty states, and unavailable future fields distinct. The renderer composes one stateful Shared Library screen with a calibrated grid, audit list, inspector, viewer, and complete non-mutating workflow shells.

**Tech Stack:** Electron, React 19, TypeScript, Bun/Vitest, Radix UI, Lucide, existing media preview/player components, CSS container queries, SQLite only for the explicitly authorized UX Testing Lab QA seed.

**Spec:** `docs/design/shared-library-ui-handoff.md`

**Visual evidence:** `/Users/maximovchinnikov/Downloads/design_handoff_shared_library/README.md` and `/Users/maximovchinnikov/Downloads/design_handoff_shared_library/Ralphy Shared Library.dc.html`

## Global Constraints

- The repository handoff is the product model; the prototype bundle is visual evidence; the released Core/Desktop contracts are operational truth.
- Redesign the existing workspace shared-media scope. Do not create a second asset store or renderer-side metadata database.
- Intended use and actual usage are separate presentation types and separate sections. Never convert `usageRoles` into semantic artifact roles.
- Missing Core fields render explicit unavailable states. Do not convert an absent rights contract into `Not documented`, absent backlinks into `Not used yet`, or absent evidence into a zero.
- Current Core values are limited to artifact identity/slug/kind, selected revision/state/date, MIME, selected bytes/object/storage, revision count, `usageRoles`, target, media kind, and coarse provenance; revision history exposes only its exact DTO fields.
- Roles use a curated entry surface plus `Other`, but unknown future strings render losslessly. Do not build an agent-created taxonomy editor until Core supplies role provenance/governance.
- All search is exact local field search over values actually returned by Core. Do not imply semantic search.
- Never expose raw locators, filesystem paths, or unsafe object URLs to React. Preview/open actions stay behind the guarded Electron media protocol and root fencing.
- Selecting a revision changes only the future default. Existing references remain pinned; do not infer or display their count.
- Add/promote/duplicate/AI/archive/update controls have complete workflow surfaces but cannot persist until a released Core mutation exists. Disabled/unavailable is a component state, not an omission.
- Use the current application shell, tokens, typography, and `var(--accent)`; do not import the prototype runtime, sprite loader, sample data, fonts, or rejected mosaic frame.
- No new dependency, Core contract change, sibling-repository import, direct SQLite access from the app, global style reset, or DB migration.
- Preserve unrelated work and the two recorded baseline failures: Calendar fixed-date formatting and the pre-existing `font-weight: 500` contract.
- Use Bun for all TypeScript work, strict RED→GREEN TDD, `bun run build`, and staged gitleaks before every commit.

---

Before Task 1, record `SHARED_LIBRARY_BASE=$(git rev-parse HEAD)` in `.superpowers/sdd/2026-08-20-shared-library/progress.md`; Task 9 uses that immutable recorded SHA for its range checks.

### Task 1: Add the guarded workspace media adapter

**Files:**
- Create: `electron/ralphy/shared-library-reader.ts`
- Modify: `electron/media/types.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/main.ts`
- Modify: `src/lib/ipc.ts`
- Test: `tests/shared-library-reader.test.ts`
- Test: `tests/ipc-security.test.ts`
- Test: `tests/ralphy-current-core.test.ts`

**Interfaces:**
- Consumes: current Core `media.list`, `media.show`, `media.revisions`, `media.select`, and `locator.resolve`; existing protocol-token and root-fencing helpers.
- Produces:

```ts
export type SharedLibraryQuery = {
  after?: string | null;
  mediaKind?: MediaKind;
  provenance?: MediaProvenance;
};

export interface SharedLibraryReader {
  loadPage(workspaceId: string, query?: SharedLibraryQuery): Promise<Page<ArtifactMediaCardDto>>;
  loadArtifact(workspaceId: string, artifactId: string): Promise<ArtifactMediaCardDto>;
  loadRevisions(workspaceId: string, artifactId: string, after?: string | null): Promise<Page<ArtifactRevisionDto>>;
  selectRevision(workspaceId: string, artifactId: string, revisionId: string, expectedSelectedRevisionId: string | null): Promise<ArtifactMediaCardDto>;
  resolvePreview(workspaceId: string, artifactId: string): Promise<ProjectPreview | null>;
}
```

- The exact renderer bridge additions are:

```ts
loadSharedLibraryPage(workspaceId: string, query?: SharedLibraryQuery): Promise<Page<ArtifactMediaCardDto>>;
loadSharedLibraryArtifact(workspaceId: string, artifactId: string): Promise<ArtifactMediaCardDto>;
loadSharedLibraryRevisions(workspaceId: string, artifactId: string, after?: string | null): Promise<Page<ArtifactRevisionDto>>;
selectSharedLibraryRevision(workspaceId: string, artifactId: string, revisionId: string, expectedSelectedRevisionId: string | null): Promise<ArtifactMediaCardDto>;
resolveSharedLibraryPreview(workspaceId: string, artifactId: string): Promise<ProjectPreview | null>;
performSharedLibraryAction(workspaceId: string, artifactId: string, action: "open" | "finder"): Promise<void>;
```

The reader additionally exposes an Electron-main-only `resolveActionLocator(workspaceId, artifactId, action)` helper. IPC validates the workspace against the captured root, consumes the locator inside main, and invokes `openPath`/`showItemInFolder`; no locator/path type crosses preload. `createMockBridge()` implements every required renderer method with truthful empty/null results and an explicit unavailable error for unsupported mutation attempts.

- [ ] **Step 1: Add failing exact-contract and trust-boundary tests**

```ts
expect(request).toHaveBeenCalledWith("media.list", {
  context: { workspaceId: "ws_1" }, limit: 50, types: ["artifact"],
});
await expect(reader.loadPage("ws_1")).resolves.toMatchObject({
  items: [expect.objectContaining({ workspaceId: "ws_1", projectId: null })],
});
await expect(reader.loadPage("ws_1")).rejects.toThrow(/workspace shared artifact/i);
expect(Object.keys(window.ralphy)).toContain("loadSharedLibraryPage");
expect(rendererBridgeSource).not.toMatch(/absolutePath|bucket|object path/i);
```

Cover invalid IDs, project-scoped cards returned to the workspace reader, wrong-workspace cards, over-limit pages, invalid cursors, targetless preview, forged locator output, symlink/root escape, selection CAS, and preview-token revocation.

- [ ] **Step 2: Run adapter tests and verify RED**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/shared-library-reader.test.ts tests/ipc-security.test.ts tests/ralphy-current-core.test.ts`

Expected: FAIL because the workspace-scoped bridge methods and reader do not exist.

- [ ] **Step 3: Implement the minimal adapter**

Validate exact Core DTO keys with the same helpers as `project-reader.ts`, but require `projectId === null`. Reuse the existing media protocol token store and shell-open implementation. Do not widen `ProjectReference`, fabricate a project context, or return paths to the renderer.

- [ ] **Step 4: Run adapter tests, typecheck, and build**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/shared-library-reader.test.ts tests/ipc-security.test.ts tests/ralphy-current-core.test.ts && bun run typecheck && bun run build`

Expected: adapter suites pass; build exits 0.

- [ ] **Step 5: Commit the adapter**

```bash
git add electron/ralphy/shared-library-reader.ts electron/media/types.ts electron/preload.ts electron/main.ts src/lib/ipc.ts tests/shared-library-reader.test.ts tests/ipc-security.test.ts tests/ralphy-current-core.test.ts
gitleaks protect --staged --redact
git commit -m "feat: add workspace shared media adapter"
```

### Task 2: Model Shared Library capabilities and screen state

**Files:**
- Create: `src/screens/shared-library/presentation.ts`
- Create: `src/state/shared-library-controller.ts`
- Test: `tests/shared-library-presentation.test.ts`
- Test: `tests/shared-library-controller.test.ts`

**Interfaces:**
- Consumes: Task 1 bridge methods and exact `ArtifactMediaCardDto` / `ArtifactRevisionDto` pages.
- Produces:

```ts
export type Availability<T> =
  | { status: "ready"; value: T }
  | { status: "partial"; value: T; reason: string }
  | { status: "empty"; reason: string }
  | { status: "unavailable"; reason: string };

export interface SharedArtifactPresentation {
  id: string;
  slug: string;
  title: Availability<string>;
  kind: string;
  mediaKind: MediaKind;
  mime: string | null;
  bytes: number | null;
  selectedRevisionId: string | null;
  selectedState: string | null;
  selectedAt: number | null;
  revisionCount: number;
  storageClass: string | null;
  provenance: MediaProvenance;
  referencedAs: string[];
  preview: "available" | "no-target";
  semanticRoles: Availability<string[]>;
  tags: Availability<string[]>;
  entities: Availability<string[]>;
  canonicalStatus: Availability<never>;
  agentUse: Availability<{ purpose: string; useWhen: string; avoidWhen: string; constraints: string }>;
  rights: Availability<never>;
  usageBacklinks: Availability<never>;
  attention: Availability<never>;
  relationships: Availability<never>;
}

export type SharedLibraryQueryState = {
  text: string;
  mediaKind: MediaKind | "all";
  provenance: MediaProvenance | "all";
  view: "grid" | "list";
  sort: "recently-selected" | "name" | "size";
};

export interface SharedLibraryPresentation {
  artifacts: SharedArtifactPresentation[];
  selectedArtifactId: string | null;
  nextCursor: string | null;
  totalCount: Availability<number>;
  totalSelectedBytes: Availability<number>;
}

export type SharedLibrarySnapshot =
  | { status: "loading"; query: SharedLibraryQueryState }
  | { status: "ready"; value: SharedLibraryPresentation; query: SharedLibraryQueryState; refreshing: boolean; loadingMore: boolean; pageError: string | null; refreshError: string | null }
  | { status: "error"; error: string; query: SharedLibraryQueryState };

export interface SharedLibraryController {
  subscribe(listener: () => void): () => void;
  getSnapshot(): SharedLibrarySnapshot;
  start(): Promise<void>;
  refresh(): Promise<void>;
  loadMore(): Promise<void>;
  setQuery(patch: Partial<SharedLibraryQueryState>): void;
  selectArtifact(id: string | null): void;
  dispose(): void;
}
```

- [ ] **Step 1: Add failing truthfulness tests**

```ts
expect(card.referencedAs).toEqual(["opening hook"]);
expect(card.semanticRoles).toEqual({ status: "unavailable", reason: expect.stringContaining("Core") });
expect(card.rights.status).toBe("unavailable");
expect(card.usageBacklinks.status).toBe("unavailable");
expect(presentation.totalSelectedBytes).toMatchObject({ status: "partial" });
expect(card.canonicalStatus.status).toBe("unavailable");
expect(JSON.stringify(presentation)).not.toMatch(/not used yet|rights unknown|approved alternative|reference only/i);
```

Cover empty versus unavailable, non-null cursor preservation, incomplete pages, selected and unselected artifacts, targetless artifacts, local query/filter/sort changes, refresh-in-place, append/load-more, stable-ID deduplication, page failure/retry, stale page/request suppression, and selection persistence by stable artifact ID.

- [ ] **Step 2: Run model/controller tests and verify RED**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/shared-library-presentation.test.ts tests/shared-library-controller.test.ts`

Expected: FAIL because the files do not exist.

- [ ] **Step 3: Implement pure mapping and controller**

Keep unavailable future fields typed, rather than adding renderer-only mock metadata. Only compute counts/bytes when page completeness makes the statement honest; bounded totals say `Showing N loaded artifacts`.

- [ ] **Step 4: Run focused tests**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/shared-library-presentation.test.ts tests/shared-library-controller.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit state and presentation**

```bash
git add src/screens/shared-library/presentation.ts src/state/shared-library-controller.ts tests/shared-library-presentation.test.ts tests/shared-library-controller.test.ts
gitleaks protect --staged --redact
git commit -m "feat: model shared library state"
```

### Task 3: Implement the shell, toolbar, calibrated grid, and audit list

**Files:**
- Create: `src/screens/SharedLibraryScreen.tsx`
- Create: `src/screens/shared-library/SharedLibraryToolbar.tsx`
- Create: `src/screens/shared-library/SharedArtifactPreview.tsx`
- Create: `src/styles/shared-library.css`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Test: `tests/shared-library-screen.test.tsx`
- Test: `tests/workspace-navigation.test.tsx`

**Interfaces:**
- Consumes: Task 2 controller/snapshot; Task 1 preview bridge; existing lower-level image/video/audio primitives, workspace identity, Lucide icons, and navigation state.
- Produces: the live `shared` workspace page, local query/filter/view controls, grid/list selection, and callbacks `onAdd`, `onPromote`, `onOpenInspector`, `onOpenViewer`.

- [ ] **Step 1: Add failing shell and inventory tests**

```tsx
expect(markup).toContain("Shared Library");
expect(markup).toContain("Reusable workspace artifacts for people and agents");
expect(markup).toContain("Add artifact");
expect(markup).toContain("Promote from project");
expect(markup).toContain("Search slug, kind, referenced role, provenance");
expect(markup).toContain("Grid");
expect(markup).toContain("List");
expect(markup).not.toContain("Shared Library is not wired yet");
```

Use a synthetic complete page and a bounded page. Assert current filters work for slug/kind/MIME/referenced-role/provenance exact local search; semantic role/entity/canonical/rights/missing-metadata controls are present with a reason and disabled. Assert unknown `usageRoles` render losslessly under `Referenced as`, not as semantic roles. Assert grid cards have one chrome band, honest previews/fallbacks, no audio hover autoplay, and list columns preserve unavailable cells. Assert list multi-select bulk actions are visible but unsupported mutations are disabled. Assert bounded pages expose `Load more`, an append error exposes retry without hiding loaded rows, and a `rootEpoch + workspaceId` change resets cards, selection, preview tokens, and query lifecycle.

- [ ] **Step 2: Run screen/navigation tests and verify RED**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/shared-library-screen.test.tsx tests/workspace-navigation.test.tsx tests/workspace-overview-navigation.test.tsx`

Expected: FAIL on the missing screen and existing placeholder.

- [ ] **Step 3: Implement the page shell and live collection views**

Use one primary CTA. Grid is the default, list is the audit view, and clicking a card selects/opens the inspector. Enter/double-click opens the viewer. Build `SharedArtifactPreview` directly on the workspace preview URL and low-level media primitives; never pass a fabricated project to `MediaCardPreview`. Do not add a fixed entity grouping when entities are unavailable; show `Grouping by entity is unavailable from Core` and keep a flat collection. App keys the controller by `rootEpoch + workspaceId`; Overview → Shared → Back restores the originating Overview focus/state.

- [ ] **Step 4: Run screen/navigation tests, typecheck, and build**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/shared-library-screen.test.tsx tests/workspace-navigation.test.tsx tests/workspace-overview-navigation.test.tsx && bun run typecheck && bun run build`

Expected: PASS.

- [ ] **Step 5: Commit the shell**

```bash
git add src/screens/SharedLibraryScreen.tsx src/screens/shared-library/SharedLibraryToolbar.tsx src/screens/shared-library/SharedArtifactPreview.tsx src/styles/shared-library.css src/App.tsx src/main.tsx tests/shared-library-screen.test.tsx tests/workspace-navigation.test.tsx tests/workspace-overview-navigation.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: add shared library collection views"
```

### Task 4: Implement the inspector, revisions, and truth-separated detail sections

**Files:**
- Create: `src/screens/shared-library/SharedArtifactInspector.tsx`
- Modify: `src/screens/SharedLibraryScreen.tsx`
- Modify: `src/styles/shared-library.css`
- Test: `tests/shared-library-inspector.test.tsx`
- Test: `tests/shared-library-screen.test.tsx`

**Interfaces:**
- Consumes: selected artifact, Task 1 `loadArtifact`, `loadRevisions`, `selectRevision`, `performAction`, preview URL, controller refresh.
- Produces: 460px inspector/full-width narrow sheet, safe preview/summary, actual revision history and CAS selection, unavailable Agent Use/Rights/Usage shells, and focus restoration.

- [ ] **Step 1: Add failing inspector tests**

```tsx
expect(markup).toContain("Context agents receive");
expect(markup).toContain("Actual usage");
expect(markup).toContain("System-derived backlinks are unavailable from this Core version");
expect(markup).toContain("Revisions");
expect(markup).toContain("Append-only");
expect(markup).toContain("Related artifacts");
expect(markup).toContain("Relationship data is unavailable from this Core version");
expect(markup).toContain("Select as default for future use");
expect(markup).toContain("Existing references stay pinned");
expect(markup).not.toMatch(/0 references|rights safe|system prompt/i);
```

Cover selected/unselected revisions, paged history, selection CAS conflict/retry, no target, failed preview, safe Open original, technical IDs/MIME/storage without paths/hashes, `Referenced as`, unavailable intended-use fields, and exact focus return to the originating card/row after closing.

- [ ] **Step 2: Run inspector tests and verify RED**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/shared-library-inspector.test.tsx tests/shared-library-screen.test.tsx`

Expected: FAIL because the inspector is absent.

- [ ] **Step 3: Implement inspector and revision selection**

Use Radix primitives and the existing preview components. Selection updates only the future default through `media.select`; do not display pinned usage counts, a compatibility verdict, or `Review existing usages` as active.

- [ ] **Step 4: Run focused tests**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/shared-library-inspector.test.tsx tests/shared-library-screen.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit inspector and revisions**

```bash
git add src/screens/shared-library/SharedArtifactInspector.tsx src/screens/SharedLibraryScreen.tsx src/styles/shared-library.css tests/shared-library-inspector.test.tsx tests/shared-library-screen.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: add shared artifact inspector"
```

### Task 5: Implement the full-window content viewer

**Files:**
- Create: `src/screens/shared-library/SharedArtifactViewer.tsx`
- Modify: `src/screens/SharedLibraryScreen.tsx`
- Modify: `src/styles/shared-library.css`
- Test: `tests/shared-library-viewer.test.tsx`

**Interfaces:**
- Consumes: current loaded artifact order, selected artifact/revisions, guarded preview URL, existing `ImageViewport`, `VideoPlayer`, and `AudioWaveform`.
- Produces: opaque full-window viewer, previous/next artifact navigation, kind-specific stage, revision rail, context rail, keyboard controls, and return to the inspector/origin.

- [ ] **Step 1: Add failing viewer tests**

```tsx
expect(markup).toContain("Context agents receive");
expect(markup).toContain("Actual usage");
expect(markup).toContain("Revision");
expect(markup).toContain("Open original");
expect(markup).not.toMatch(/fake thumbnail|page 1 \/ 4|sha-256/i);
```

Cover image contain/zoom, explicit video playback, labelled audio play/pause/seek/mute/volume with textual duration, SVG actual-preview path, font/data/document honest fallback, no invented page count/text/font family, previous/next within loaded results, Enter/double-click open, Escape close, reduced motion, and focus restoration.

- [ ] **Step 2: Run viewer tests and verify RED**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/shared-library-viewer.test.tsx`

Expected: FAIL because the viewer is absent.

- [ ] **Step 3: Implement the viewer with existing media primitives**

Choose presentation from MIME where Core `mediaKind === "other"`, without changing Core enums. Do not add a text-read path unless Task 1 can validate and bound it safely; unsupported documents render facts plus Open original.

- [ ] **Step 4: Run viewer and media regression tests**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/shared-library-viewer.test.tsx tests/project-media-presentation.test.tsx tests/media-grid.test.ts tests/protocol-access.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit viewer**

```bash
git add src/screens/shared-library/SharedArtifactViewer.tsx src/screens/SharedLibraryScreen.tsx src/styles/shared-library.css tests/shared-library-viewer.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: add shared artifact viewer"
```

### Task 6: Implement add, promote, duplicate, AI, and archive workflow surfaces

**Files:**
- Create: `src/screens/shared-library/SharedLibraryWorkflows.tsx`
- Modify: `src/screens/SharedLibraryScreen.tsx`
- Modify: `src/screens/shared-library/SharedArtifactInspector.tsx`
- Modify: `src/styles/shared-library.css`
- Test: `tests/shared-library-workflows.test.tsx`

**Interfaces:**
- Consumes: modal kind `"add" | "promote" | "duplicate" | "suggestions" | "archive" | "update-review"`, current artifact/card fixtures, and close/focus callbacks.
- Produces: all handoff workflow windows with deterministic local step state and explicit mutation Availability.

- [ ] **Step 1: Add failing workflow-inventory tests**

```tsx
expect(add).toContain("Source");
expect(add).toContain("Duplicates");
expect(add).toContain("Describe for reuse");
expect(add).toContain("Confirm");
expect(add).toContain("Needs context");
expect(promote).toContain("the existing project remains pinned");
expect(duplicate).toContain("Same content identity");
expect(suggestions).toContain("Licence, consent and identity are never inferred");
expect(archive).toContain("Nothing is deleted");
expect(updateReview).toContain("Update compatible usages");
expect(updateReview).toContain("Keep current revision");
expect(updateReview).toContain("Open usage for review");
```

Cover one-primary-button maximum, non-blocking incomplete metadata copy, explicit `Not documented` rights default only as a proposed input value, per-field suggestion acceptance UI, duplicate reason requirement, promotion non-destructive copy, archive impact inventory unavailable, revision update-review choices unavailable without backlinks/compatibility evidence, and disabled final mutation actions with Core-version reasons. Assert no shell mutates/persists or calls unsupported bridge methods.

- [ ] **Step 2: Run workflow tests and verify RED**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/shared-library-workflows.test.tsx`

Expected: FAIL because workflow surfaces are absent.

- [ ] **Step 3: Implement complete non-mutating windows**

Use a shared Radix window frame only where it removes repeated focus/scrim/header/footer logic. Do not build a generic workflow engine or renderer database. Duplicate/AI/archive windows are reachable from explicit inspector `More` options marked `Preview unavailable workflow` so every required component is testable without implying persistence.

- [ ] **Step 4: Run workflow and screen tests**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/shared-library-workflows.test.tsx tests/shared-library-screen.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit workflow surfaces**

```bash
git add src/screens/shared-library/SharedLibraryWorkflows.tsx src/screens/SharedLibraryScreen.tsx src/screens/shared-library/SharedArtifactInspector.tsx src/styles/shared-library.css tests/shared-library-workflows.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: add shared library workflow states"
```

### Task 7: Complete operational states, responsive behavior, and accessibility

**Files:**
- Modify: `src/screens/SharedLibraryScreen.tsx`
- Modify: `src/screens/shared-library/SharedLibraryToolbar.tsx`
- Modify: `src/screens/shared-library/SharedArtifactInspector.tsx`
- Modify: `src/screens/shared-library/SharedArtifactViewer.tsx`
- Modify: `src/styles/shared-library.css`
- Modify: `tests/shared-library-screen.test.tsx`
- Modify: `tests/design-system.test.ts`

**Interfaces:**
- Consumes: all Tasks 1–6 states and current workspace/navigation lifecycle.
- Produces: initial loading, retained-content refresh, full/local failures, empty/no-results/partial/targetless/preview-failure states, 5→3→narrow layout, keyboard model, and measured overflow/focus coverage.

- [ ] **Step 1: Add failing state and geometry tests**

```tsx
expect(emptyMarkup).toContain("Build a reusable source of truth");
expect(emptyMarkup).toContain("Add canonical characters, locations, products, audio hooks and brand assets for future projects.");
expect(noResultsMarkup).toContain("Clear filters");
expect(partialMarkup).toContain("Showing loaded artifacts");
expect(previewFailureMarkup).toContain("Preview unavailable");
expect(previewFailureMarkup).not.toContain("File is corrupt");
```

In real Chromium/Electron geometry, assert `scrollWidth <= clientWidth` for the page, toolbar, grid/list, inspector, viewer, and workflows at 2560×1400, 1360×900, and 1280×800. Assert inspector compresses the grid at large width and becomes a full sheet at narrow width. Cover keyboard-reachable grid/list/multi-select/media controls, status text not color-only, focus restoration, `aria-busy` without per-row noise, and reduced motion.

- [ ] **Step 2: Run state/design tests and verify RED**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/shared-library-screen.test.tsx tests/design-system.test.ts`

Expected: new state/geometry assertions fail before final behavior/styles.

- [ ] **Step 3: Implement the final states and responsive/accessibility rules**

Missing file, rights unknown, broken reference, duplicate candidate, and revision-update labels remain unavailable unless Core explicitly returns evidence. A targetless selected artifact is `No preview target`, not `Missing file`.

- [ ] **Step 4: Run the complete Shared Library renderer regression set**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/shared-library-presentation.test.ts tests/shared-library-controller.test.ts tests/shared-library-screen.test.tsx tests/shared-library-inspector.test.tsx tests/shared-library-viewer.test.tsx tests/shared-library-workflows.test.tsx tests/workspace-navigation.test.tsx tests/design-system.test.ts`

Expected: Shared Library suites pass; only the recorded unrelated design-system font-weight baseline may fail in the combined command.

- [ ] **Step 5: Commit states and responsive behavior**

```bash
git add src/screens/SharedLibraryScreen.tsx src/screens/shared-library/SharedLibraryToolbar.tsx src/screens/shared-library/SharedArtifactInspector.tsx src/screens/shared-library/SharedArtifactViewer.tsx src/styles/shared-library.css tests/shared-library-screen.test.tsx tests/design-system.test.ts
gitleaks protect --staged --redact
git commit -m "feat: complete shared library states"
```

### Task 8: Seed current-contract UX Testing Lab artifacts safely

**Files:**
- Database: `/Users/maximovchinnikov/.ralphy/ralphy.db`
- Backup: `/Users/maximovchinnikov/.ralphy/backups/ralphy-before-shared-library-2026-08-20-<UTC-HHMMSS>.db` created with exclusive non-overwrite semantics
- Source media: `/Users/maximovchinnikov/Downloads/design_handoff_shared_library/uploads/media-assets/`
- Report only: `.superpowers/sdd/2026-08-20-shared-library/task-8-db-report.md`

**Interfaces:**
- Consumes: schema-v9 `artifacts`, `artifact_revisions`, `objects`, `runs`, `run_results`, `artifact_usages`, `artifact_relations`; UX Testing Lab workspace ID `ws_6afaf432-6794-400c-b50a-e8b640c20cd2`.
- Produces: idempotent workspace-scoped current-contract QA fixtures visible to Task 1 with stable `ux-shared-*` IDs and real object bytes. The user explicitly requested DB mocks for the purpose-built `UX Testing Lab`; this is a QA-only raw seed because Core exposes no create/promote mutation, and the application never performs direct SQLite access.

- [ ] **Step 1: Re-audit and create a recoverable backup**

Run read-only integrity, FK, row-scope, file existence, and SHA checks. Print the exact manifest below before the first write. Create a unique backup with SQLite's backup command using an exclusive path; never overwrite a prior backup. Abort if the DB path, workspace metadata `mock:true`, schema version, integrity, workspace ID, or any manifest ID/bucket/key differs. If a stable ID/path already exists, continue only when every field, byte count, and SHA matches the manifest exactly.

- [ ] **Step 2: Prepare an idempotent transaction and verify it against a temporary DB copy**

Use stable IDs and `INSERT ... SELECT ... WHERE NOT EXISTS`; never update or delete existing rows. The exact artifact manifest is:

| Artifact | Revisions / selected state | Source bytes |
| --- | --- | --- |
| `art_ux_shared_image` / `ux-shared-canonical-image` | `arev_ux_shared_image_1`, approved selected | `uploads/media-assets/0ff9b03c81029454c9eb1e5934bca2f9.jpg` |
| `art_ux_shared_video` / `ux-shared-brand-video` | `arev_ux_shared_video_1`, approved selected | `uploads/media-assets/From Klickpin.com- 46 Bold Office Outfit Ideas-pin-id-20055160840584430.mp4` |
| `art_ux_shared_audio` / `ux-shared-sonic-hook` | `arev_ux_shared_audio_1`, approved selected | `/Users/maximovchinnikov/.ralphy/buckets/ws_6afaf432-6794-400c-b50a-e8b640c20cd2/projects/prj_89992c84-d007-4a72-9261-a6df04e715b1/objects/obj_ux_audio_01.mp3` |
| `art_ux_shared_history` / `ux-shared-revision-history` | `arev_ux_shared_history_1` superseded → `arev_ux_shared_history_2` approved selected | `6b7c06cb9a0b425d874a269dbf950ae7.jpg`, then `8d2f941288a9ade95d63e7bfba078182.jpg` |
| `art_ux_shared_archived` / `ux-shared-archived-reference` | `arev_ux_shared_archived_1`, archived selected | `9e0748cb545c01c8154c24f3629c6ade.jpg` |
| `art_ux_shared_unselected` / `ux-shared-unselected` | `arev_ux_shared_unselected_1`, candidate; `selected_revision_id=NULL` | `a847686717ef695cb437a679a5223ad5.jpg` |
| `art_ux_shared_duplicate` / `ux-shared-duplicate-bytes` | `arev_ux_shared_duplicate_1`, approved selected | same bytes as `art_ux_shared_image` under a distinct object ID/key |

Object IDs are the revision suffix with `arev` replaced by `obj`; keys are `objects/<object-id>.<ext>` under the exact bucket `buckets/ws_6afaf432-6794-400c-b50a-e8b640c20cd2/shared`.

The exact object values are:

| Object ID | Key | Original name | MIME | Bytes | SHA-256 | `created_at` |
| --- | --- | --- | --- | ---: | --- | ---: |
| `obj_ux_shared_image_1` | `objects/obj_ux_shared_image_1.jpg` | `0ff9b03c81029454c9eb1e5934bca2f9.jpg` | `image/jpeg` | 105125 | `0a1e05bf60be1966503a41deccf211e781bb05e47b6a2d23752e597afd116662` | 1787202000100 |
| `obj_ux_shared_video_1` | `objects/obj_ux_shared_video_1.mp4` | `From Klickpin.com- 46 Bold Office Outfit Ideas-pin-id-20055160840584430.mp4` | `video/mp4` | 1494984 | `1c7cace8f2e60cca01377d2304d7fb6d2270d43064dc7e6ba7d83020cc88200f` | 1787202001100 |
| `obj_ux_shared_audio_1` | `objects/obj_ux_shared_audio_1.mp3` | `obj_ux_audio_01.mp3` | `audio/mpeg` | 960514 | `3f1c69c692712069179cdc49f1d492185c32c016a539264c4373682ca17fa142` | 1787202002100 |
| `obj_ux_shared_history_1` | `objects/obj_ux_shared_history_1.jpg` | `6b7c06cb9a0b425d874a269dbf950ae7.jpg` | `image/jpeg` | 118702 | `361f4ea1c7cbd1832fb1bfdefe866628ea5c85df0c3ee0d8397570a9ab969939` | 1787202003100 |
| `obj_ux_shared_history_2` | `objects/obj_ux_shared_history_2.jpg` | `8d2f941288a9ade95d63e7bfba078182.jpg` | `image/jpeg` | 306000 | `e96abe082b2fffcc49bbe96646d5dfa63c819427959d6112b2775556209b2467` | 1787202004100 |
| `obj_ux_shared_archived_1` | `objects/obj_ux_shared_archived_1.jpg` | `9e0748cb545c01c8154c24f3629c6ade.jpg` | `image/jpeg` | 62100 | `631e01904fc7714d57418003d44f000dc6650b0f700d3402fbad256e55d34e7d` | 1787202005100 |
| `obj_ux_shared_unselected_1` | `objects/obj_ux_shared_unselected_1.jpg` | `a847686717ef695cb437a679a5223ad5.jpg` | `image/jpeg` | 38695 | `c50340b0b0e9efe83737235c1a63dc496b75edf9fb6748a63fd686d7170b9158` | 1787202006100 |
| `obj_ux_shared_duplicate_1` | `objects/obj_ux_shared_duplicate_1.jpg` | `0ff9b03c81029454c9eb1e5934bca2f9.jpg` | `image/jpeg` | 105125 | `0a1e05bf60be1966503a41deccf211e781bb05e47b6a2d23752e597afd116662` | 1787202007100 |

Every object row also uses `workspace_id='ws_6afaf432-6794-400c-b50a-e8b640c20cd2'`, `project_id=NULL`, `backend='local'`, the bucket above, `storage_class='durable'`, the exact `original_name` above, and `metadata_json='{"mock":true,"source":"shared-library-handoff"}'`.

The exact artifact/revision values are:

| Artifact ID | slug | kind | selected revision | `created_at` / `updated_at` | Revision rows `(id,no,parent,state,object,created_at)` |
| --- | --- | --- | --- | --- | --- |
| `art_ux_shared_image` | `ux-shared-canonical-image` | `image` | `arev_ux_shared_image_1` | 1787202000000 / 1787202000100 | (`arev_ux_shared_image_1`,1,NULL,approved,`obj_ux_shared_image_1`,1787202000100) |
| `art_ux_shared_video` | `ux-shared-brand-video` | `video` | `arev_ux_shared_video_1` | 1787202001000 / 1787202001100 | (`arev_ux_shared_video_1`,1,NULL,approved,`obj_ux_shared_video_1`,1787202001100) |
| `art_ux_shared_audio` | `ux-shared-sonic-hook` | `audio` | `arev_ux_shared_audio_1` | 1787202002000 / 1787202002100 | (`arev_ux_shared_audio_1`,1,NULL,approved,`obj_ux_shared_audio_1`,1787202002100) |
| `art_ux_shared_history` | `ux-shared-revision-history` | `image` | `arev_ux_shared_history_2` | 1787202003000 / 1787202004100 | (`arev_ux_shared_history_1`,1,NULL,superseded,`obj_ux_shared_history_1`,1787202003100); (`arev_ux_shared_history_2`,2,`arev_ux_shared_history_1`,approved,`obj_ux_shared_history_2`,1787202004100) |
| `art_ux_shared_archived` | `ux-shared-archived-reference` | `image` | `arev_ux_shared_archived_1` | 1787202005000 / 1787202005100 | (`arev_ux_shared_archived_1`,1,NULL,archived,`obj_ux_shared_archived_1`,1787202005100) |
| `art_ux_shared_unselected` | `ux-shared-unselected` | `image` | NULL | 1787202006000 / 1787202006100 | (`arev_ux_shared_unselected_1`,1,NULL,candidate,`obj_ux_shared_unselected_1`,1787202006100) |
| `art_ux_shared_duplicate` | `ux-shared-duplicate-bytes` | `image` | `arev_ux_shared_duplicate_1` | 1787202007000 / 1787202007100 | (`arev_ux_shared_duplicate_1`,1,NULL,approved,`obj_ux_shared_duplicate_1`,1787202007100) |

All artifact rows use `workspace_id` above, `project_id=NULL`, and `row_version=1`. All revision rows use `iteration_id=NULL`, `authored_by_session_id=NULL`, and `metadata_json='{"mock":true}'`.

Create the exact lifecycle/reference rows:

- `runs`: `run_ux_shared_generation` has `kind='generation'`, label `UX Shared Library generation`, `created_at=1787202010000`; `run_ux_shared_non_generation` has `kind='evaluation'`, label `UX Shared Library evaluation`, `created_at=1787202011000`. Both use the workspace ID, `project_id=NULL`, `agent_session_id=NULL`, all external/idempotency/consumer fields NULL, and `metadata_json='{"mock":true}'`. Insert with `state='pending', started_at=NULL, ended_at=NULL, error=NULL`; after their result rows exist, transition to `state='succeeded'` with `ended_at=1787202010020` and `1787202011020` respectively, leaving `started_at=NULL` and `error=NULL`.
- `run_results`: `rr_ux_shared_generation` → generation run / position 0 / `entity_type='artifact_revision'` / `entity_id='arev_ux_shared_image_1'` / `created_at=1787202010010`; `rr_ux_shared_non_generation` → evaluation run / position 0 / `entity_type='artifact_revision'` / `entity_id='arev_ux_shared_video_1'` / `created_at=1787202011010`. Leave other revisions without producers for `unknown` provenance.
- `artifact_usages`: all three rows are project-target usages with `workspace_id=NULL`, `project_id='prj_89992c84-d007-4a72-9261-a6df04e715b1'`, `feedback_id=NULL`, `context_type=NULL`, and `context_id=NULL`, matching the current Core usage-role reader. `ause_ux_shared_01` → image R1 / `role='character reference'` / `lifecycle='current'` / `created_at=1787202020000`; `ause_ux_shared_02` → audio R1 / `role='opening hook'` / `lifecycle='current'` / `created_at=1787202021000`; `ause_ux_shared_03` → history R1 / `role='style reference'` / `lifecycle='historical'` / `created_at=1787202022000`.
- `artifact_relations`: `arel_ux_shared_01`, from `arev_ux_shared_history_1` to `arev_ux_shared_history_2`, `relation='superseded-by'`, `metadata_json='{"mock":true}'`, `created_at=1787202023000`.

The two image objects deliberately share a SHA for future duplicate-contract testing. The seed SQL must list every column explicitly and use the exact values above.

Stage bytes into unique temporary filenames first. On transaction failure, remove only files created by this run; never remove a pre-existing path. Rename staged files to final paths only after collision/hash validation. Every `objects.project_id` and `artifacts.project_id` is `NULL`.

- [ ] **Step 3: Apply once to the live mock workspace and verify**

Run the transaction under `BEGIN IMMEDIATE`; then assert `integrity_check=ok`, zero FK violations, zero cross-workspace mismatches, every object path exists, stored bytes/SHA match, stable seed counts are exact, and running the transaction a second time changes zero rows.

- [ ] **Step 4: Verify through the released bridge/CLI contract**

Use the Core bridge method consumed by Task 1, not direct renderer SQLite access, to prove the workspace page returns the seeded cards and revision history. Capture IDs, counts, object totals, exact row/file manifest, and backup path in the report.

- [ ] **Step 5: Record the DB operation without committing database bytes**

Do not add the DB, backup, media objects, or seed SQL to git. The task report must state exactly what was added, backup/recovery steps, and that raw seeding is a temporary QA exception until Core exposes create/promote APIs.

### Task 9: Verify the complete Shared Library handoff

**Files:**
- Modify only if verification exposes a defect in files already listed above.

**Interfaces:**
- Produces: a buildable live Shared Library whose complete component inventory matches the handoff and whose unavailable states accurately document current Core limits.

- [ ] **Step 1: Run focused and full verification**

Run:

```bash
VITE_RALPHY_ENABLE_MOCKS=true bun run test -- \
  tests/shared-library-reader.test.ts \
  tests/shared-library-presentation.test.ts \
  tests/shared-library-controller.test.ts \
  tests/shared-library-screen.test.tsx \
  tests/shared-library-inspector.test.tsx \
  tests/shared-library-viewer.test.tsx \
  tests/shared-library-workflows.test.tsx \
  tests/workspace-navigation.test.tsx \
  tests/workspace-overview-navigation.test.tsx \
  tests/ipc-security.test.ts \
  tests/design-system.test.ts
VITE_RALPHY_ENABLE_MOCKS=true bun run test
bun run typecheck
bun run build
git diff --check
```

Expected: all Shared Library tests pass; the full suite differs only by the two recorded unrelated failures.

- [ ] **Step 2: Inspect complete handoff coverage**

Verify grid, audit list, inspector variants, usage/revision/related-artifact sections, image/audio/video/document/font/data/vector viewer treatments, add/promote/duplicate/AI/archive/update-review windows, empty/no-results/targetless/preview-failure states, and 1280×800 behavior. For each unsupported field/action, verify visible unavailable copy and absence of mutation calls.

- [ ] **Step 3: Run branch and secret checks**

Let `SHARED_LIBRARY_BASE` be the plan commit recorded before Task 1 and `SHARED_LIBRARY_HEAD=$(git rev-parse HEAD)`. Run `git status --short`, `git diff --stat "$SHARED_LIBRARY_BASE".."$SHARED_LIBRARY_HEAD"`, `git diff --check "$SHARED_LIBRARY_BASE".."$SHARED_LIBRARY_HEAD"`, `gitleaks protect --staged --redact`, and `gitleaks git --log-opts="$SHARED_LIBRARY_BASE..$SHARED_LIBRARY_HEAD" --redact`. The unrelated unreachable finding at `.superpowers/brainstorm/35084-1786542451/state/server-info` in commit `906803b2396ae5200ea8dd51d42aaaf38318c7ef` is outside this range and documented in the Workspace Overview Task 8 report.

- [ ] **Step 4: Request final independent code review**

Review the full feature range against this plan and both handoff sources. Fix all Critical/Important findings, rerun focused verification, and obtain a clean scoped re-review before declaring completion.
