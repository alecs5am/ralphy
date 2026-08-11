# Project Workbench UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a polished, continuously scrolling Project workbench across Overview, Documents, Media, Compositions, Units, and Activity without changing the accepted Workspace/Project structure.

**Architecture:** Consume the reviewed Core contract from `2026-08-11-project-workbench-core-contracts.md`, keep all root/path authorization in Electron main, and split the monolithic Project screen into focused tab panels. Cursor paging remains authoritative but is triggered by visible scroll sentinels; `@tanstack/react-virtual`, existing design tokens, preview cache/scheduler, Radix, and native browser controls provide the UI without new dependencies.

**Tech Stack:** Electron, React 19, TypeScript, Bun, Vitest, `@tanstack/react-virtual`, Radix Dialog, Lucide, existing CSS token system.

## Global Constraints

- The approved design is `docs/superpowers/specs/2026-08-11-project-workbench-ui-overhaul-design.md`. The six Claude Design screenshots are structural references, not pixel specifications.
- Work only in `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/.worktrees/sqlite-domain-store-desktop`, already isolated on `codex/sqlite-domain-store-desktop`. Do not mutate the installed app or live `.ralphy` during implementation.
- Core literal search and media-facet contracts must be independently reviewed and frozen first. Desktop must be tested against that exact binary before packaging.
- Preserve Workspace → Project routing, six tabs, Core-backed state, cursor families, root epochs, stale-response fences, immutable media refs, and modal provenance semantics.
- No new package, UI framework, design system, raw path in renderer, Trash action, eager full cursor drain, page-local media filtering, or per-tile generation-detail fan-out.
- Use existing `--canvas`, `--panel-solid`, `--raised`, `--hover`, `--selected`, AWS Diatype, focus, spacing, radius, squircle, `SelectMenu`, `SnappySlider`, `MarkdownView`, media primitives, and Radix Dialog.
- Hover and selection must be distinct. No rounded left selection stripe and no recursive decorative borders.
- Overview caps at 1440px. Documents/Compositions/Units have independent master/detail scroll owners. Media and Activity each have one virtual scroll owner. Ordinary `Load more` buttons are absent.
- Cursor append is user-scroll driven, one request in flight, never a hidden drain. Append failure retains loaded items and shows Retry.
- Media mouse contract is exact: single click selects, double-click opens modal, right-click selects and opens context. Keyboard Space selects and Enter opens.
- Future multiselect is not implemented. Keep one selected ref without baking selection into the modal or preview state.
- Unit work uses `unit.show`, revisions/items/presentations/captions/items and nullable-CAS `unit.select`. Do not consume the currently inconsistent `unit.preview` handler and do not add `unit.revise`.
- Source, tests, reports, and commit messages are English-only. Use strict TDD and behavior/mounted tests rather than source-string assertions or framework mocks.
- Every task runs focused tests, typecheck when it changes types, `git diff --check`, staged diff check, and `gitleaks protect --staged --redact` before commit.

---

### Task 1: Consume Media Facets And Add Ref-Scoped Context Actions

**Files:**
- Modify: `electron/ralphy/types.ts`
- Modify: `electron/ralphy/contract-type-assertions.ts`
- Modify: `electron/ralphy/project-reader.ts`
- Modify: `electron/media/types.ts`
- Modify: `electron/media/protocol-access.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/ipc.ts`
- Modify: `src/state/project-screen-controller.ts`
- Test: `tests/ralphy-current-core.test.ts`
- Test: `tests/project-reader.test.ts`
- Test: `tests/ipc-security.test.ts`
- Test: `tests/protocol-access.test.ts`
- Test: `tests/project-screen-behavior.test.tsx`
- Test: `tests/project-media-presentation.test.tsx`

**Interfaces:**
- Starts only after reviewed Core Task 2 is frozen; copy its exact DTO/request
  contract rather than anticipating an in-progress Core shape.
- Consumes reviewed Core card fields and request axes:

```ts
type ProjectMediaKind = "image" | "video" | "audio" | "document" | "other";
type MediaProvenance = "generation" | "not-generation" | "unknown";
// Every MediaCardDto includes mediaKind and provenance.
```

- Produces:

```ts
export type ProjectMediaQuery = {
  filter: ProjectMediaFilter;
  mediaKind?: ProjectMediaKind;
  provenance?: MediaProvenance;
};

performProjectMediaAction(
  project: ProjectReference,
  ref: MediaCardDto["ref"],
  action: "open" | "finder" | "copy",
): Promise<void>;
```

- [ ] **Step 1: Write failing exact Core/reader contract tests**

Update the real-Core fixture and compiled assertions to require `mediaKind` and `provenance` on all three card variants. Add reader tests that pass each optional query axis unchanged to `media.list` and reject malformed/unknown response classifications.
Add controller/presentation expectations proving the compiled caller sends
`mediaQuery: { filter: mediaFilter }`; keep the reducer's existing
`mediaFilter` state name and do not introduce a temporary dual reader API.

```ts
await reader.loadPage({
  tab: "media",
  project,
  mediaQuery: { filter: "candidate", mediaKind: "video", provenance: "generation" },
});
expect(request).toHaveBeenCalledWith("media.list", {
  context: project,
  limit: 50,
  filter: "candidate",
  mediaKind: "video",
  provenance: "generation",
  types: ["artifact", "run-object"],
});
```

- [ ] **Step 2: Write failing production IPC tests for context actions**

Exercise the production-used registrar/main seam, not a duplicate fake registrar. Assert untrusted sender, malformed Project/ref/action, missing target, stale root before/after Core calls, symlink/out-of-root file, and unexpected locator shape fail before side effect. Assert successful `open`, `finder`, and `copy` return `undefined` and the renderer never receives a path.

For copy, inject/stub the main clipboard sink and assert it writes the canonical
`file:` URL as the macOS `public.file-url` pasteboard buffer. Round-trip the
buffer/format in the test; copying path text or merely passing a path to a fake
sink is not sufficient. The preload surface must contain exactly one named
`performProjectMediaAction` entry, not a generic bridge method.

- [ ] **Step 3: Run the focused RED**

```bash
bun run test -- tests/ralphy-current-core.test.ts tests/project-reader.test.ts tests/ipc-security.test.ts tests/protocol-access.test.ts tests/project-screen-behavior.test.tsx tests/project-media-presentation.test.tsx
```

Expected: new card keys/query axes and named action method/handler do not exist.

- [ ] **Step 4: Copy and strictly validate the frozen Core types**

Add closed enum parsers and exact-key card validation in `project-reader.ts`; extend every card DTO and compiled contract assertion. Change media page input from `mediaFilter` to `mediaQuery`, forwarding only present optional fields. Adapt the one compiled caller in `project-screen-controller.ts` to send `{ mediaQuery: { filter: mediaFilter } }`; keep reducer/state internals unchanged. Keep existing 50-item page limits and entity-ref `types` policy.

- [ ] **Step 5: Implement one main-only resolver for context actions**

Add a project-reader method that authorizes the exact card with `media.show`,
reads its immutable `target`, and calls `locator.resolve` with purpose `open`
for open, `finder` for Finder, and `drag` for copy. Validate absolute
path/MIME/byte shape inside main; do not add the path to
`MediaWorkbenchBridge` results.

Add one main-only `MediaProtocolAccess.authorizeTrustedLocator()` that reuses
`validateLibraryRoot()` and `resolveContainedPath()` for whole-chain symlink and
containment checks, then requires a regular file and exact expected byte size.
Unlike `mintTrustedLocator()`, it accepts every file MIME and returns a canonical
path without minting a renderer token. Register one secured handler through the
existing production registrar/root capture. Recheck sender/root before request,
after each awaited Core request, before this file-system authorization, and
immediately before `shell.openPath`, `shell.showItemInFolder`, or
`clipboard.writeBuffer("public.file-url", Buffer.from(pathToFileURL(path).href))`.

- [ ] **Step 6: Run focused GREEN and typecheck**

```bash
bun run test -- tests/ralphy-current-core.test.ts tests/project-reader.test.ts tests/ipc-security.test.ts tests/protocol-access.test.ts tests/project-screen-behavior.test.tsx tests/project-media-presentation.test.tsx
bun run typecheck
git diff --check
```

Mutation check: changing `copy` purpose to an unapproved value, returning the locator, omitting the post-request root check, or accepting a sibling-project card must break a focused test.

- [ ] **Step 7: Commit Task 1**

```bash
git add electron/ralphy/types.ts electron/ralphy/contract-type-assertions.ts electron/ralphy/project-reader.ts electron/media/types.ts electron/media/protocol-access.ts electron/main.ts electron/preload.ts src/lib/ipc.ts src/state/project-screen-controller.ts tests/ralphy-current-core.test.ts tests/project-reader.test.ts tests/ipc-security.test.ts tests/protocol-access.test.ts tests/project-screen-behavior.test.tsx tests/project-media-presentation.test.tsx
git diff --cached --check
gitleaks protect --staged --redact
git commit -m "feat(desktop): add scoped media facets and actions"
```

### Task 2: Add Lazy Unit Pages And Selection To The Existing Project Controller

**Files:**
- Modify: `electron/ralphy/types.ts`
- Modify: `electron/ralphy/contract-type-assertions.ts`
- Modify: `electron/ralphy/project-reader.ts`
- Modify: `electron/media/types.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/ipc.ts`
- Modify: `src/state/project-screen-controller.ts`
- Test: `tests/project-reader.test.ts`
- Test: `tests/ipc-security.test.ts`
- Test: `tests/ralphy-current-core.test.ts`
- Test: `tests/project-screen-behavior.test.tsx`

**Interfaces:**
- Produces closed, cursor-preserving methods:

```ts
type ProjectUnitPageRequest =
  | { kind: "revisions"; unitId: string; cursor?: string | null }
  | { kind: "items"; revisionId: string; cursor?: string | null }
  | { kind: "presentations"; revisionId: string; cursor?: string | null };

loadProjectUnit(project: ProjectReference, unitId: string): Promise<UnitDto>;
loadProjectUnitRevision(project: ProjectReference, revisionId: string): Promise<UnitRevisionDto>;
loadProjectUnitPage(
  project: ProjectReference,
  request: ProjectUnitPageRequest,
): Promise<Page<UnitRevisionDto> | Page<UnitItemDto> | Page<UnitPresentationDto>>;
selectProjectUnitRevision(
  project: ProjectReference,
  unitId: string,
  revisionId: string,
  expectedSelectedRevisionId: string | null,
): Promise<UnitDto>;
```

Controller additions:

```ts
unitId: string | null;
unit: LoadState<UnitDto>;
unitRevisions: DomainPage<UnitRevisionDto>;
inspectedUnitRevisionId: string | null;
inspectedUnitRevision: LoadState<UnitRevisionDto>;
unitItems: DomainPage<UnitItemDto>;
unitPresentations: DomainPage<UnitPresentationDto>;
unitMutation: "idle" | "select";
unitConflict: string | null;
openUnit(unitId: string): Promise<void>;
loadMoreUnitRevisions(): Promise<void>;
inspectUnitRevision(revisionId: string): Promise<void>;
loadMoreUnitItems(): Promise<void>;
loadMoreUnitPresentations(): Promise<void>;
selectInspectedUnitRevision(): Promise<void>;
```

- [ ] **Step 1: Write failing reader page tests**

Seed two opaque pages for revisions, items, and presentations. Assert each call
requests exactly one 50-item page, forwards its opaque cursor once, validates
every row against the requested Unit/revision and Project scope, and returns its
next cursor unchanged. Assert no method drains the second page until its
corresponding load-more action and no call reaches `presentation.items`,
`presentation.captions`, `unit.preview`, or `unit.revise`.
Assert only the revision request includes `order: "newest"` and a >50-row Core
fixture presents the highest revision first.

- [ ] **Step 2: Write failing secured IPC/controller tests**

Assert the copied frozen contract admits `order: "newest"` only on the four
reviewed history methods and rejects unknown order. Assert named preload methods
and production handlers validate the closed page
discriminator, exact IDs/cursor, sender, root epoch, nullable expected-selected
CAS, and response scope. Controller tests cover A→B stale Unit/revision
suppression, one in-flight page per family, selected/latest initial inspection,
`sealedAt !== null` select, conflict authoritative reload with no mutation retry, and
dispose fencing.

- [ ] **Step 3: Run the focused RED**

```bash
bun run test -- tests/ralphy-current-core.test.ts tests/project-reader.test.ts tests/ipc-security.test.ts tests/project-screen-behavior.test.tsx -t "unit workbench"
```

Expected: Unit page methods, snapshot fields, and controller actions are absent.

- [ ] **Step 4: Implement minimal single-page readers and secured channels**

Map the closed request directly to `unit.revisions`, `unit.items`, or
`unit.presentations`, always with `limit: 50` and at most the supplied cursor.
Revision pages always send the reviewed `order: "newest"`; their opaque next
cursor appends older revisions when the rail tail becomes visible. Item and
Presentation pages retain semantic ascending position order.
Use `unit.show` and `unit.revision.show` for exact identities. Validate complete
frozen DTO shapes and exact ownership before returning. Do not reuse `drain()`:
the UI owns when the next visible page is requested.

Add only `loadProjectUnit`, `loadProjectUnitRevision`,
`loadProjectUnitPage`, and `selectProjectUnitRevision` channels to
preload/bridge/main. Register via `securedHandle`/current root reader; the page
channel accepts only the closed Unit discriminator and is not a generic Core
request. Add no Unit preview.

- [ ] **Step 5: Implement controller state and conflict reload**

Mirror the proven Composition request-counter/CAS pattern without a new
controller. Opening a Unit loads its identity and page one of revisions only;
inspecting a revision loads that exact revision plus page one of Items and
Presentations. Each family appends independently with its own request fence.
On conflict, keep the chosen inspected revision ID if still present, reload the
Unit and first revision page once, expose a clear conflict message, and require
an explicit second click. Selection is allowed only for a loaded inspected
revision whose `sealedAt` is non-null and which is not already selected. Derive
the Draft/Sealed display label from `sealedAt`; `UnitRevisionDto` has no `state`.

- [ ] **Step 6: Run focused GREEN and typecheck**

```bash
bun run test -- tests/ralphy-current-core.test.ts tests/project-reader.test.ts tests/ipc-security.test.ts tests/project-screen-behavior.test.tsx -t "unit workbench"
bun run typecheck
```

- [ ] **Step 7: Commit Task 2**

```bash
git add electron/ralphy/types.ts electron/ralphy/contract-type-assertions.ts electron/ralphy/project-reader.ts electron/media/types.ts electron/main.ts electron/preload.ts src/lib/ipc.ts src/state/project-screen-controller.ts tests/ralphy-current-core.test.ts tests/project-reader.test.ts tests/ipc-security.test.ts tests/project-screen-behavior.test.tsx
git diff --cached --check
gitleaks protect --staged --redact
git commit -m "feat(desktop): load interactive unit details"
```

### Task 3: Replace Button Paging With Scroll-Driven Cursor Append

**Files:**
- Create: `src/screens/project/AutoCursorTail.tsx`
- Create: `src/screens/project/scroll-memory.ts`
- Modify: `src/state/project-screen-controller.ts`
- Modify: `src/components/VirtualAssetGrid.tsx`
- Modify: `src/screens/ProjectScreen.tsx`
- Modify: `src/styles/workbench.css`
- Test: `tests/project-domain-state.test.ts`
- Test: `tests/project-screen-behavior.test.tsx`
- Test: `tests/media-grid.test.ts`
- Test: `tests/react-host.ts`

**Interfaces:**
- Produces:

```ts
export function AutoCursorTail(props: {
  root: HTMLElement | null;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  onLoadMore(): void;
  onRetry(): void;
}): React.ReactNode;

export function useRememberedScroll(
  memory: Map<string, number>,
  key: string,
): { ref(node: HTMLElement | null): void; onScroll(event: React.UIEvent<HTMLElement>): void };

loadMore(tab: ProjectTab): Promise<void>;
retryPage(tab: ProjectTab): Promise<void>;
```

- [ ] **Step 1: Write controller REDs for duplicate/stale append**

Assert two simultaneous `loadMore("media")` calls issue one request; null cursor, inactive tab, initial loading, and append error do not silently drain; tab/root/query reset invalidates a late append; retry sends the same current cursor and retains loaded items.

- [ ] **Step 2: Write mounted IntersectionObserver/scroll-memory REDs**

Extend the real host only with the browser `IntersectionObserver` behavior
required by production. Mount a scroll root and sentinel, prove intersection
triggers once, loading prevents a duplicate, error renders `role="alert"` plus
Retry, and no next cursor removes the observer. Switch tabs/unmount/remount and
prove separate master/detail offsets restore exactly. Name and exercise all six
tab keys—Overview, Documents, Media, Compositions, Units, and Activity—rather
than testing only one generic key.

- [ ] **Step 3: Run the focused RED**

```bash
bun run test -- tests/project-domain-state.test.ts tests/project-screen-behavior.test.tsx tests/media-grid.test.ts -t "automatic cursor"
```

- [ ] **Step 4: Implement the smallest native primitives**

`AutoCursorTail` uses one `IntersectionObserver` with `root`, `rootMargin: "240px 0px"`, and no timer loop. It calls `onLoadMore` only when `hasMore && !loading && !error`. It renders a polite loading status or bottom alert/Retry in the same sentinel location.

`useRememberedScroll` stores `scrollTop` in the parent-owned map on real scroll and restores it in `useLayoutEffect`/ref attachment. Do not introduce global storage or controller DOM state.

- [ ] **Step 5: Harden controller and expose the Media tail**

Make `loadMore(tab)` verify active tab, non-null cursor, non-loading status, and no current append request before calling the existing append reducer path. Keep one request ID per tab/generation. Add the tail to the actual `.asset-grid-scroll`; remove the shared `Pagination` component only where the replacement is active. Later panel tasks remove the remaining buttons.

- [ ] **Step 6: Run focused GREEN and typecheck**

```bash
bun run test -- tests/project-domain-state.test.ts tests/project-screen-behavior.test.tsx tests/media-grid.test.ts -t "automatic cursor"
bun run typecheck
```

- [ ] **Step 7: Commit Task 3**

```bash
git add src/screens/project/AutoCursorTail.tsx src/screens/project/scroll-memory.ts src/state/project-screen-controller.ts src/components/VirtualAssetGrid.tsx src/screens/ProjectScreen.tsx src/styles/workbench.css tests/project-domain-state.test.ts tests/project-screen-behavior.test.tsx tests/media-grid.test.ts tests/react-host.ts
git diff --cached --check
gitleaks protect --staged --redact
git commit -m "fix(desktop): append project pages on scroll"
```

### Task 4: Build The Documents Master/Detail Workbench

**Files:**
- Create: `src/screens/project/DocumentsPanel.tsx`
- Create: `src/components/JsonDocumentView.tsx`
- Modify: `electron/ralphy/project-reader.ts`
- Modify: `electron/media/types.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/ipc.ts`
- Modify: `src/screens/ProjectScreen.tsx`
- Modify: `src/state/project-screen-controller.ts`
- Modify: `src/styles/workbench.css`
- Test: `tests/project-reader.test.ts`
- Test: `tests/ipc-security.test.ts`
- Test: `tests/documents-panel.test.tsx`
- Test: `tests/project-screen-behavior.test.tsx`
- Test: `tests/design-system.test.ts`

**Interfaces:**
- Produces controller methods/state:

```ts
documentMode: "read" | "edit";
documentSearch: {
  query: string;
  items: DocumentSearchDto[];
  nextCursor: string | null;
  status: "idle" | "loading" | "ready" | "error";
  appendError: string | null;
};
documentDraft: { format: "markdown" | "text" | "json"; title: string | null; body: string } | null;
documentDirty: boolean;
clearDocumentSearch(): void;
loadMoreDocumentSearch(): Promise<void>;
retryDocumentSearchAppend(): Promise<void>;
beginDocumentEdit(): void;
cancelDocumentEdit(): void;
setDocumentDraftBody(body: string): void;
setDocumentDraftTitle(title: string): void;
setDocumentDraftFormat(format: "markdown" | "text" | "json"): void;
saveDocument(): Promise<void>;

searchProjectDocuments(
  project: ProjectReference,
  query: string,
  cursor?: string | null,
): Promise<Page<DocumentSearchDto>>;
```

- [ ] **Step 1: Write mounted Documents REDs**

Mount the production panel/controller and prove:

- left and right panes scroll independently while the outer panel does not;
- list rows and active search rows virtualize and append from their own
  sentinel, each using its own opaque cursor;
- `MD`, `JSON`, and `TXT` badges/icons are visually and textually distinct;
- hover and selected computed backgrounds differ and no inset left stripe exists;
- input debounce sends trimmed nonblank text once; blank clears without IPC;
- `c++`, hyphen, quote, and `NOT` strings are forwarded unchanged to reviewed Core;
- Markdown renders headings/lists/code, JSON renders safe token spans, text uses styled viewer;
- Read→Edit seeds the exact current title/body, Preview toggles rendering, Cancel restores, Save sends current head CAS;
- invalid JSON shows local validation without IPC; conflict keeps dirty draft and reloads head without retry;
- changing doc/tab with dirty draft uses one native confirmation and respects Cancel.
- selecting a row preserves the master `scrollTop` and moves focus to the
  connected detail heading without scrolling another tab.

Reader/IPC tests prove each nonblank search request forwards at most one opaque
`after` cursor, validates the returned page, and never drains the next page.
Malformed cursor/query/scope and a stale root fail at the production handler.

- [ ] **Step 2: Run the Documents RED**

```bash
bun run test -- tests/project-reader.test.ts tests/ipc-security.test.ts tests/documents-panel.test.tsx tests/project-screen-behavior.test.tsx -t "documents workbench"
```

- [ ] **Step 3: Refactor document state before styling**

Current `loadDocument()` incorrectly creates an editable draft for every read.
Change it to load preview with `documentMode: "read"` and no draft.
`beginDocumentEdit()` copies the loaded preview/title/format; dirty is a literal
comparison with that base. Blank search increments the search request fence,
clears items/cursor/error, and never calls the API. A new nonblank query loads
page one; `loadMoreDocumentSearch()` appends only its current opaque cursor and
dedupes by revision ID. The master sentinel selects search append while the
trimmed query is active and ordinary `document.list` append otherwise.

Catch JSON parsing before the mutation call and expose the message through the existing local error state. On CAS conflict, preserve draft and edit mode while reloading authoritative document/revision once.

- [ ] **Step 4: Implement focused panel and native renderers**

Move all Document markup out of `ProjectScreen.tsx`. Use installed
`useVirtualizer` for the master and `AutoCursorTail` against the active list or
search cursor. Use existing `MarkdownView` and `.plain-text-view`.
`JsonDocumentView` parses once and recursively emits React text/span tokens with
a depth/entry ceiling matching the existing JSON IPC bound; it never uses
`dangerouslySetInnerHTML`.

The detail sticky header owns Read/Edit, format, title, revision, Preview/Cancel/Save. Use native `<textarea>`, `<input>`, `<select>` or existing `SelectMenu`; no editor dependency.

- [ ] **Step 5: Implement independent layout and exact visual states**

CSS uses a 280–340px master column and minmax detail, each `overflow:auto`, `min-height:0`; below 720px stack with bounded master height. Selected rows use `--selected` plus `--ring-select`; hover uses `--hover`. Add explicit format badge colors derived from existing semantic/accent tokens, not a new palette.

- [ ] **Step 6: Run GREEN, mutation pressure, and geometry smoke**

```bash
bun run test -- tests/project-reader.test.ts tests/ipc-security.test.ts tests/documents-panel.test.tsx tests/project-screen-behavior.test.tsx tests/design-system.test.ts
bun run typecheck
```

Mutate debounce blank handling, selected surface, JSON escaping, and pane overflow one at a time; each must fail a behavior/computed-style test.

- [ ] **Step 7: Commit Task 4**

```bash
git add electron/ralphy/project-reader.ts electron/media/types.ts electron/main.ts electron/preload.ts src/lib/ipc.ts src/screens/project/DocumentsPanel.tsx src/components/JsonDocumentView.tsx src/screens/ProjectScreen.tsx src/state/project-screen-controller.ts src/styles/workbench.css tests/project-reader.test.ts tests/ipc-security.test.ts tests/documents-panel.test.tsx tests/project-screen-behavior.test.tsx tests/design-system.test.ts
git diff --cached --check
gitleaks protect --staged --redact
git commit -m "feat(desktop): finish the documents workbench"
```

### Task 5: Restore The Full Media Grid And Structured Filters

**Files:**
- Create: `src/screens/project/MediaPanel.tsx`
- Modify: `src/components/VirtualAssetGrid.tsx`
- Modify: `src/screens/project/MediaViewer.tsx`
- Modify: `src/screens/ProjectScreen.tsx`
- Modify: `src/state/project-domain.ts`
- Modify: `src/state/project-screen-controller.ts`
- Modify: `src/styles/workbench.css`
- Test: `tests/media-grid.test.ts`
- Test: `tests/project-media-presentation.test.tsx`
- Test: `tests/project-screen-behavior.test.tsx`
- Test: `tests/design-system.test.ts`

**Interfaces:**
- Produces:

```ts
type MediaSelection = { type: "artifact" | "run-object" | "object"; id: string } | null;
selectMedia(card: MediaCardDto): void;
setMediaQuery(patch: Partial<ProjectMediaQuery>): Promise<void>;

type VirtualAssetGridProps = {
  // existing preview/cache props
  selectedRef: MediaSelection;
  density: number;
  hasMore: boolean;
  loadingMore: boolean;
  appendError: string | null;
  onSelect(card: MediaCardDto): void;
  onOpen(card: MediaCardDto): void;
  onContextMenu(card: MediaCardDto, point: { x: number; y: number }): void;
  onLoadMore(): void;
  onRetryAppend(): void;
};
```

- [ ] **Step 1: Write mounted interaction/filter REDs**

Prove single click changes only selection and makes no preview/provenance request; double-click opens modal; Space selects; Enter opens; right-click first selects then opens a focusable menu at the pointer; Escape/outside click closes and restores tile focus. Assert the menu has Preview/Open externally/Reveal in Finder/Copy file and no Trash.

Prove there is one full-width `.asset-grid-scroll`, no inline `.project-preview`, no floating Open button, no ordinary pagination button, and actual sentinel append. Structured controls forward exact Core filter/kind/provenance axes, reset cursor/selection/grid scroll, and never filter `page.items` locally. Density changes geometry using existing stops.

- [ ] **Step 2: Run the Media RED**

```bash
bun run test -- tests/media-grid.test.ts tests/project-media-presentation.test.tsx tests/project-screen-behavior.test.tsx -t "full media grid"
```

- [ ] **Step 3: Make selection synchronous and remove duplicate preview path**

Replace async `openMedia()` with synchronous `selectMedia()`. Preview and generation requests start only in `openMediaViewer()`. Remove `MediaPreview` and `RunObjectEvidence` from `ProjectScreen`; render exact RunObject evidence inside the modal inspector.

- [ ] **Step 4: Implement MediaPanel toolbar and query reset**

Use `SelectMenu` for Lifecycle/source, Type, and Generation, plus `SnappySlider` for density. `All` deletes the optional scalar from `ProjectMediaQuery`. `setMediaQuery` request-fences current page/modal, clears selection, dispatches one query reset, resets grid scroll, and loads page one only when Media is active.

- [ ] **Step 5: Implement tile and context-menu behavior**

Keep the scheduler/cache/mounted-only resolution untouched. Remove nested Open button. The primary tile button handles click/double-click/key/context events and shows `data-selected`. Render Generated badge only for `provenance === "generation"`; Unknown does not pretend to be non-generated.

Reuse `.asset-context-menu`; position within viewport, use real buttons, close on Escape/outside/focus loss, and invoke `performProjectMediaAction` for open/finder/copy. Preview calls `openMediaViewer` locally.

- [ ] **Step 6: Run GREEN and design geometry tests**

```bash
bun run test -- tests/media-grid.test.ts tests/project-media-presentation.test.tsx tests/project-screen-behavior.test.tsx tests/design-system.test.ts
bun run typecheck
```

Mutation check: resolving preview on click, filtering the loaded array, restoring the overlay Open button, or letting a second append request through must fail.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/screens/project/MediaPanel.tsx src/components/VirtualAssetGrid.tsx src/screens/project/MediaViewer.tsx src/screens/ProjectScreen.tsx src/state/project-domain.ts src/state/project-screen-controller.ts src/styles/workbench.css tests/media-grid.test.ts tests/project-media-presentation.test.tsx tests/project-screen-behavior.test.tsx tests/design-system.test.ts
git diff --cached --check
gitleaks protect --staged --redact
git commit -m "feat(desktop): restore the full media grid"
```

### Task 6: Replace Overview DTO Dump With A Navigable Dashboard

**Files:**
- Create: `src/screens/project/OverviewPanel.tsx`
- Modify: `src/screens/ProjectScreen.tsx`
- Modify: `src/state/project-screen-controller.ts`
- Modify: `src/styles/workbench.css`
- Test: `tests/project-screen-behavior.test.tsx`
- Test: `tests/design-system.test.ts`

**Interfaces:**
- `OverviewPanel` consumes the existing `ProjectOverviewDto` and explicit callbacks:

```ts
onViewTab(tab: ProjectView): void;
onOpenDocument(documentId: string): void;
onOpenComposition(compositionId: string): void;
onOpenUnit(unitId: string): void;
openDocumentById(documentId: string): Promise<void>;
```

- [ ] **Step 1: Write Overview semantic/navigation REDs**

Mount a complete and a sparse real DTO. Assert no raw project ID, `Recent
records (bounded)`, selected/latest UUID paragraph, or equal auto-fit card wall
appears. Assert media total/View all controls select exact tabs; Document opens
Documents+document; Composition opens Compositions+composition; Unit opens
Units+unit; unsupported Build/run/feedback facts are not fake buttons. Sparse
sections collapse.

At effective content widths 476, 900, 1280, and 1800px, assert 1/2/12-column semantic placement, max width 1440, no horizontal overflow, and readable metric labels.

- [ ] **Step 2: Run the Overview RED**

```bash
bun run test -- tests/project-screen-behavior.test.tsx tests/design-system.test.ts -t "overview dashboard"
```

- [ ] **Step 3: Implement focused semantic sections**

Move Overview markup out of `ProjectScreen`. Use state/media top row, metrics band, production stream, deliverables, distribution, and recent activity. Render compact empty states only for primary sections; omit empty secondary sections. Use human title/slug/state/compact time and technical disclosures only where needed.

Use explicit callback buttons only for exact destinations. Add
`openDocumentById()` as the smallest public wrapper around the existing exact
internal loader. For a Document row, switch tab then call it with the DTO's
document ID; for Composition call `openComposition` after selecting the tab;
for Unit call the Task 2 `openUnit` action after selecting Units.

- [ ] **Step 4: Run GREEN and CSS mutation checks**

```bash
bun run test -- tests/project-screen-behavior.test.tsx tests/design-system.test.ts -t "overview dashboard"
bun run typecheck
```

- [ ] **Step 5: Commit Task 6**

```bash
git add src/screens/project/OverviewPanel.tsx src/screens/ProjectScreen.tsx src/state/project-screen-controller.ts src/styles/workbench.css tests/project-screen-behavior.test.tsx tests/design-system.test.ts
git diff --cached --check
gitleaks protect --staged --redact
git commit -m "feat(desktop): redesign the project overview"
```

### Task 7: Turn Compositions Into A Compact Production Inspector

**Files:**
- Modify: `electron/ralphy/project-reader.ts`
- Modify: `electron/media/types.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/ipc.ts`
- Modify: `src/screens/project/CompositionsPanel.tsx`
- Modify: `src/screens/ProjectScreen.tsx`
- Modify: `src/state/project-screen-controller.ts`
- Modify: `src/styles/workbench.css`
- Test: `tests/project-reader.test.ts`
- Test: `tests/ipc-security.test.ts`
- Test: `tests/composition-view.test.tsx`
- Test: `tests/project-screen-behavior.test.tsx`
- Test: `tests/design-system.test.ts`

**Interfaces:**
- Replaces the eager `CompositionAggregate` path with exact identity and closed,
  cursor-preserving detail pages:

```ts
type ProjectCompositionPageRequest =
  | { kind: "revisions"; compositionId: string; cursor?: string | null }
  | { kind: "sources"; revisionId: string; cursor?: string | null }
  | { kind: "inputs"; revisionId: string; cursor?: string | null }
  | { kind: "revision-evaluations"; revisionId: string; cursor?: string | null }
  | { kind: "builds"; revisionId: string; cursor?: string | null }
  | { kind: "build-outputs"; buildId: string; cursor?: string | null }
  | { kind: "build-evaluations"; buildId: string; cursor?: string | null };

loadProjectComposition(project, compositionId): Promise<CompositionDto>;
loadProjectCompositionRevision(project, revisionId): Promise<CompositionRevisionDto>;
loadProjectCompositionBuild(project, buildId): Promise<BuildDto>;
loadProjectCompositionPage(
  project,
  request: ProjectCompositionPageRequest,
): Promise<Page<CompositionRevisionDto | CompositionSourceDto |
  CompositionInputDto | EvaluationDto | BuildDto | BuildOutputDto>>;
```

The controller stores the Composition identity, revision page, inspected
revision identity, and each revision/build child page separately. Every family
has its own cursor, request fence, append action, and error. Existing revise,
select, build, and output-preview mutations remain exact and unchanged.
Revision, Build, and Evaluation requests always use reviewed
`order: "newest"`; their opaque next cursors continue toward older rows.
Sources, Inputs, and outputs keep their semantic ascending position order.

- [ ] **Step 1: Write lazy reader/security REDs**

Replace the old recursive-drain expectation with exact page tests. Opening one
Composition requests only `composition.show` plus page one of
`composition.revisions`. Inspecting one revision requests its exact identity and
only page one of sources, inputs, evaluations, and builds. Inspecting the newest
loaded Build requests its exact identity and page one of outputs/evaluations.
Every next cursor is forwarded only after the corresponding visible tail fires;
no sibling revision or hidden Build page is read.

Exercise the production handler for each closed discriminator. Wrong IDs,
cursor, target family, sender, response scope, or root epoch fail; there is no
generic Core request channel. Delete the eager aggregate types/path rather than
keeping two readers.

- [ ] **Step 2: Write mounted timeline/detail REDs**

Assert independent master/detail scrolling, automatic cursor tails, sticky
detail header, newest-first `R45` timeline nodes, selected/latest/state/date
badges, and absence of UUIDs in the primary rail. Selection preserves master
scroll and focuses the connected detail heading. Assert the newest loaded
Build/output/evaluation is primary and preview works. Full
revision/source/input/build/run/object IDs appear only after opening native
`Technical details`. Seed more than 50 revisions/builds and prove page one starts
with the exact newest row while the visible tail appends older rows.

Keep load-bearing action tests: sealed-only selection, latest-draft-only Build,
New draft guard, conflict/error text, disabled pending states, and output
preview retry.

- [ ] **Step 3: Run the Compositions RED**

```bash
bun run test -- tests/project-reader.test.ts tests/ipc-security.test.ts tests/composition-view.test.tsx tests/project-screen-behavior.test.tsx tests/design-system.test.ts
```

- [ ] **Step 4: Replace the aggregate with bounded readers/controller state**

Map the closed page request directly to the existing Core methods with
`limit: 50`. Keep one request ID and one `DomainPage` per family. Opening a
Composition loads header plus first revision page; inspecting a revision loads
only that exact revision's first child pages; select the newest visible Build
and load only its first output/evaluation pages. Appends retain existing rows
and errors. Conflict reload refreshes header, the first revision page, and the
still-inspected exact identities once, with no mutation retry.

- [ ] **Step 5: Recompose existing data without changing mutations**

Keep sort helpers and mutation calls. Replace wrapping revision cards with one
horizontal non-wrapping virtual rail; move full facts into
`<details><summary>Technical details</summary>…</details>`. Choose the latest
loaded Build by the existing deterministic sort and show its
state/evaluation/output before secondary Builds. Place an `AutoCursorTail` at
the visible end of every cursor-backed rail/list.

Give master/detail their own `overflow:auto; min-height:0`; sticky header
remains inside detail. Remove Pagination and the obsolete aggregate/drain code.

- [ ] **Step 6: Run GREEN and mutation checks**

```bash
bun run test -- tests/project-reader.test.ts tests/ipc-security.test.ts tests/composition-view.test.tsx tests/project-screen-behavior.test.tsx tests/design-system.test.ts
bun run typecheck
```

- [ ] **Step 7: Commit Task 7**

```bash
git add electron/ralphy/project-reader.ts electron/media/types.ts electron/main.ts electron/preload.ts src/lib/ipc.ts src/screens/project/CompositionsPanel.tsx src/screens/ProjectScreen.tsx src/state/project-screen-controller.ts src/styles/workbench.css tests/project-reader.test.ts tests/ipc-security.test.ts tests/composition-view.test.tsx tests/project-screen-behavior.test.tsx tests/design-system.test.ts
git diff --cached --check
gitleaks protect --staged --redact
git commit -m "feat(desktop): redesign composition inspection"
```

### Task 8: Build The Units Master/Detail Surface

**Files:**
- Create: `src/screens/project/UnitsPanel.tsx`
- Modify: `src/screens/ProjectScreen.tsx`
- Modify: `src/state/project-screen-controller.ts`
- Modify: `src/styles/workbench.css`
- Test: `tests/units-panel.test.tsx`
- Test: `tests/project-screen-behavior.test.tsx`
- Test: `tests/design-system.test.ts`

**Interfaces:**
- Consumes Task 2 Unit identity, revision, Items, and Presentations pages plus
  controller methods.
- Produces no new reader contract. Current Unit Items expose revision IDs but no
  exact parent-card/document navigation surface, so this task renders them as
  facts rather than scanning lists or inventing reverse lookup.

- [ ] **Step 1: Write Units REDs**

Assert real button master rows; automatic paging; independently scrolling
detail; compact newest-first revision rail whose own cursor loads only when its
end is visible; selected/latest/status; `sealedAt !== null` nullable-CAS selection;
conflict reload/no retry; independently appended ordered Items and Presentations
grouped by platform; and full IDs/config/effective-caption ID/crop/safe-area
under `Technical details`.

Selection preserves master scroll and focuses the connected detail heading.
Assert no Unit preview or revise request occurs. Current DTO fixtures render all
Item references as readable facts and expose zero item action buttons; no
resolver or reverse scan exists in this task.

- [ ] **Step 2: Run the Units RED**

```bash
bun run test -- tests/units-panel.test.tsx tests/project-screen-behavior.test.tsx -t "units workbench"
```

- [ ] **Step 3: Implement the panel using Composition grammar**

Use installed virtualization for master rows, `AutoCursorTail`, sticky detail header, horizontal revision rail, ordered semantic sections, and native technical disclosure. Reuse selected/hover/focus classes; do not introduce a new generic master-detail framework.

Wire exact controller select action and error states. Omit item navigation when current reader contracts cannot reverse-resolve the parent without a scan.

- [ ] **Step 4: Run GREEN and responsive checks**

```bash
bun run test -- tests/units-panel.test.tsx tests/project-screen-behavior.test.tsx tests/design-system.test.ts
bun run typecheck
```

- [ ] **Step 5: Commit Task 8**

```bash
git add src/screens/project/UnitsPanel.tsx src/screens/ProjectScreen.tsx src/state/project-screen-controller.ts src/styles/workbench.css tests/units-panel.test.tsx tests/project-screen-behavior.test.tsx tests/design-system.test.ts
git diff --cached --check
gitleaks protect --staged --redact
git commit -m "feat(desktop): add the units workbench"
```

### Task 9: Virtualize Activity Without Collapsing Appended History

**Files:**
- Create: `src/screens/project/ActivityTimeline.tsx`
- Modify: `src/screens/ProjectScreen.tsx`
- Modify: `src/state/project-domain.ts`
- Modify: `src/state/project-screen-controller.ts`
- Modify: `src/styles/workbench.css`
- Test: `tests/activity-timeline.test.tsx`
- Test: `tests/project-domain-state.test.ts`
- Test: `tests/project-screen-behavior.test.tsx`

**Interfaces:**
- Consumes existing `ActivityDto { sequence, entityType, entityId, action, createdAt }` only. No loaded-page category filter, cost, or state is invented.
- Produces `refreshActivity(previousCoveredSequence, announcedSequence)` behavior
  that merges/dedupes only newly announced rows without replacing already
  appended rows or consuming the visible history cursor.

- [ ] **Step 1: Write Activity REDs**

Assert day grouping, virtual rows, one scroll owner, automatic append, append
retry, and exact sequence dedupe. Load a visible page with a non-null history
cursor, set `coveredActivitySequence` beyond that page, then announce a newer
sequence. Prove the request starts after the prior covered sequence—not after
the highest displayed row or the visible page cursor—while loaded history,
`nextCursor`, scrollTop, and visible anchor remain unchanged. Assert no category
counts/filter bar or fictional cost/state appears.

Add a gap larger than the 50-row catch-up limit. Assert the controller follows
only the catch-up response's progress cursor until it reaches the announced
sequence or a null cursor, merges every scoped event once, and never advances
coverage past a failed page. A null cursor with no scoped event still advances
coverage to the announcement because the global event may belong elsewhere.

- [ ] **Step 2: Run the Activity RED**

```bash
bun run test -- tests/activity-timeline.test.tsx tests/project-domain-state.test.ts tests/project-screen-behavior.test.tsx -t "activity timeline"
```

- [ ] **Step 3: Implement append-preserving refresh and timeline**

Separate visible history append from live activity catch-up. In `refresh()`,
capture the old `coveredActivitySequence` and keep it as a separate catch-up
cursor. Query `activity.list` after that cursor with the existing bounded limit,
merge the returned rows by `sequence`, then advance coverage only to a
progress-checked response cursor. Continue over that catch-up cursor while it is
non-null and below the announced sequence. On null cursor, advance coverage to
at least the announcement (the global event can be outside this Project). A
failed or non-progressing page stops without skipping its range. Retain the
visible page's current `nextCursor` and append status throughout. Never query
after the highest displayed row and never call the ordinary tab `loadMore()`
path from a live event. Fence late catch-up by generation/request ID;
stale/lower announcements are ignored.

Render a virtualized semantic list grouped by local calendar day; rows show compact time, humanized action label, entity type/ID as secondary technical text, and no action button without an exact destination. Add `AutoCursorTail`; remove final Pagination usage.

- [ ] **Step 4: Run GREEN and typecheck**

```bash
bun run test -- tests/activity-timeline.test.tsx tests/project-domain-state.test.ts tests/project-screen-behavior.test.tsx
bun run typecheck
```

- [ ] **Step 5: Commit Task 9**

```bash
git add src/screens/project/ActivityTimeline.tsx src/screens/ProjectScreen.tsx src/state/project-domain.ts src/state/project-screen-controller.ts src/styles/workbench.css tests/activity-timeline.test.tsx tests/project-domain-state.test.ts tests/project-screen-behavior.test.tsx
git diff --cached --check
gitleaks protect --staged --redact
git commit -m "feat(desktop): add continuous project activity"
```

### Task 10: Finish Project Shell, Responsive Geometry, And Package Verification

**Files:**
- Modify: `src/components/ProjectHeader.tsx`
- Modify: `src/components/ProjectControls.tsx`
- Modify: `src/screens/ProjectScreen.tsx`
- Modify: `src/styles/workbench.css`
- Test: `tests/project-screen.test.tsx`
- Test: `tests/design-system.test.ts`
- Test: focused affected tab tests only when a visual fix changes their behavior

**Interfaces:**
- No new product contract. This task removes obsolete CSS/markup and verifies the integrated system.

- [ ] **Step 1: Write integrated Chromium geometry/accessibility REDs**

Render every active tab at 1100×720 and 1360×900 with sidebar and right panel. Assert:

- project header/tab/body fit remaining height and no application-level horizontal overflow exists;
- Overview uses effective container breakpoints and caps at 1440;
- Documents/Compositions/Units outer body is locked and each pane scrolls;
- Media/Activity each has one scroll owner;
- no `.load-more`, undefined token, recursive row/card borders, left selection stripe, floating media Open button, or UUID overflow appears;
- command/search/editor/tile/menu/tab focus is >=2px and >=3:1;
- smooth-corner selectors cover active raised surfaces without turning list rows into nested cards.

- [ ] **Step 2: Run the integrated RED**

```bash
bun run test -- tests/project-screen.test.tsx tests/design-system.test.ts
```

- [ ] **Step 3: Delete obsolete markup/CSS and repair only witnessed defects**

Remove old Overview/Document/Media/Unit/Activity functions from `ProjectScreen`, dead `Pagination`, inline preview CSS, stale filter-chip cloud overrides, duplicate scroll/padding rules, and unused imports. Keep tokens semantic; add no screenshot-specific colors or breakpoint-by-window hacks. Use container queries where the effective project pane, not viewport, determines layout.

- [ ] **Step 4: Run the fresh Desktop gate**

```bash
bun run typecheck
bun run test
bun run build
git diff --check
gitleaks detect --source . --redact
```

Record exact test file/pass/skip counts and build bundle summaries. Any repository-wide secret baseline finding must be distinguished from task diff with a staged scan; do not suppress a task leak.

- [ ] **Step 5: Build and smoke the macOS package with the frozen Core**

```bash
bun run package:mac
```

First launch the packaged app only with an isolated fixture root and isolated user-data. Verify all six tabs, auto paging, independent scrolls, safe literal search, document Read/Edit/Preview, media filters/grid/modal/context-menu opening without side effects, composition/unit detail, responsive 1100/1360 geometry, and keyboard focus.

Only after independent code/package review passes may the installed app be opened read-only against Denti AI and Nightmaker. Do not invoke Save, select revision, Build, Open externally, Finder, Copy file, or any other mutation/side effect in live QA. Preserve the live DB/main/sidecar hashes and FD receipt used by the existing final-verification process.

- [ ] **Step 6: Commit Task 10**

```bash
git add src/components/ProjectHeader.tsx src/components/ProjectControls.tsx src/screens/ProjectScreen.tsx src/styles/workbench.css tests/project-screen.test.tsx tests/design-system.test.ts
git diff --cached --check
gitleaks protect --staged --redact
git commit -m "fix(desktop): finish the project workbench"
```
