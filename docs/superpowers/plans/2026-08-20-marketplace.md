# Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate Local Models destination with one complete application-level Marketplace that truthfully browses current Models, Templates, and Recipes, renders full unavailable shells for unsupported categories and actions, and preserves the exact My Work context while switching modes.

**Architecture:** Keep the existing My Work tree mounted while Marketplace is active so route, selection, filters, scroll, and focus survive an exact mode round-trip. Fetch the schema-v1 public Template/Recipe catalog only from the fixed Ralphy Bunny CDN in Electron main, project it through a strict bounded DTO, and merge it in a pure controller with the existing Hugging Face/Civitai and Ollama model services. The renderer uses discriminated category presentations, full-route details, and explicit capability states; only bounded Recipe clipboard copy mutates anything.

**Tech Stack:** Electron 43, React 19, TypeScript, Bun/Vitest, Radix UI, Lucide, Motion, existing `@tanstack/react-virtual`, existing Local Models service, CSS container queries, real Electron/Chromium geometry tests.

**Spec:** `docs/design/marketplace-ui-handoff.md`

**Related specs:** `docs/design/local-models-ui-handoff.md` and `docs/design/skills-and-prompts-library-ui-handoff.md`

**Visual evidence:** `/Users/maximovchinnikov/Downloads/design_handoff_marketplace/README.md`, `/Users/maximovchinnikov/Downloads/design_handoff_marketplace/design.md`, and `/Users/maximovchinnikov/Downloads/design_handoff_marketplace/Marketplace Page.dc.html`

## Global Constraints

- The repository handoff is the product model; the prototype bundle is visual evidence; released Core/Desktop contracts are operational truth.
- Build one application-level Marketplace mode and one sidebar. Do not create separate top-level Models, Local Models, Skills, Prompts, or Recipes destinations.
- Switching My Work ↔ Marketplace preserves each mode's route, query, filters, selection, scroll, focus, sidebar visibility, and exact Back destination. Chat remains available beside Marketplace.
- Real production item types in this release are Models from the current provider/runtime service and Templates/Recipes from public-library schema 1. A `recipeKind: "prompt"` record remains a Recipe unless a safe public contract identifies it as a Prompt.
- Prompts, Components & Effects, and Skills remain visible supported categories with complete unavailable category/detail/review shells. Do not create production sample items for them.
- Use the fixed HTTPS source `https://ralphy.b-cdn.net/library/library.json`; never honor `RALPHY_LIBRARY_URL`, redirects, `file:` URLs, or a renderer-supplied source.
- Provider descriptions, Markdown, preview media, public-library fields, and recipe artifacts are untrusted input. Main strips raw HTML from prose/Markdown, drops raw-HTML/path/unknown fields, rejects over-limit/non-allowlisted URLs, and preserves only the bounded Recipe artifact as opaque inert text for exact copy.
- Do not invent ratings, downloads, `Trending`, recommendations, collection membership, trust, audit status, licenses, versions, update dates, compatibility, usage backlinks, saved state, or installation state. Model provider download counts must not render or determine Marketplace community ranking.
- Search ranking is visibly `Relevance · keyword`. Search and sort operate only on fields actually returned by a current source.
- Source identity, publisher verification, content audit, license, signature/hash, and local modification are separate availability fields; a fixed official source alone does not prove every unavailable field.
- Save, add, install, use-in-chat, download, update, conflict resolution, publish, creator/community, relationship, and backlink actions render complete non-mutating review UI with the missing-contract reason. Recipe artifact copy may call the existing bounded clipboard IPC.
- My Library renders the real Ollama-registered Models subsection. Saved, Added, Forked, Downloads, Updates, and Needs attention are unavailable capability states, not zero counts.
- Target chooser options come only from the current `CatalogResult.workspaces` and `CatalogResult.projects`; every option names its workspace/project. Chat, agent, runtime, and compatibility claims stay unavailable without enumeration contracts.
- Use current app tokens, fonts, Lucide icons, English product copy, `var(--accent)`, and existing shell patterns. Do not import prototype runtime/assets, sample records, a new palette/typeface, or sibling TypeScript source.
- Preserve Shared Library as a workspace destination. Marketplace never reads or writes workspace media.
- No new dependency, Core contract change, sibling source import, direct renderer filesystem/network/SQLite access, DB migration, or schema-v9 write.
- Use Ponytail full: reuse the current model service, clipboard IPC, guarded atomic writer, Markdown renderer, selectors, Radix dialog primitives, and geometry harness pattern before adding code.
- Current baseline at `e51dc85` is 624 passed, 1 skipped, and exactly two unrelated failures: Calendar fixed-date copy and the pre-existing `font-weight: 500` design-system contract.
- Use Bun, strict RED→GREEN TDD, `bun run build`, `git diff --check`, and staged gitleaks before every commit.

---

Before Task 1, record `MARKETPLACE_BASE=$(git rev-parse HEAD)` in `.superpowers/sdd/2026-08-20-marketplace/progress.md`; Task 11 uses that immutable SHA for range checks.

## File Map

- `src/state/marketplace-navigation.ts` — independent Marketplace history and per-location memory; no catalog/network logic.
- `electron/marketplace-library.ts` — fixed-origin fetch, bounded cache, schema-1 validation, and renderer-safe Template/Recipe projection.
- `src/screens/marketplace/presentation.ts` — discriminated Model/Template/Recipe presentations and explicit availability for all six categories.
- `src/state/marketplace-controller.ts` — merges public-library and model sources, suppresses stale requests, applies honest keyword search/filter/sort.
- `src/screens/MarketplaceScreen.tsx` — route composition and screen lifecycle.
- `src/screens/marketplace/MarketplaceHeader.tsx` — title, search, filters, source health, and narrow category menu.
- `src/screens/marketplace/MarketplaceBrowse.tsx` — Discover, mixed results, category inventory, and result previews.
- `src/screens/marketplace/MarketplaceModelViews.tsx` — current model browse/compatibility/detail and Ollama inventory views.
- `src/screens/marketplace/MarketplacePublicItemDetail.tsx` — real Template and Recipe full-route details.
- `src/screens/marketplace/MarketplaceUnavailableViews.tsx` — Prompt, Component, Skill, collection, creator, and publishing unavailable shells.
- `src/screens/marketplace/MarketplaceWorkflows.tsx` — target chooser, type-specific action reviews, Downloads, and update/conflict review.
- `src/screens/marketplace/MarketplaceMyLibrary.tsx` — real installed Models plus unavailable persistent-state sections.
- `src/styles/marketplace.css` — Marketplace-only layout, responsive, focus, and reduced-motion rules.

### Task 1: Add exact application-mode navigation and one adaptive sidebar

**Files:**
- Create: `src/state/marketplace-navigation.ts`
- Create: `src/screens/MarketplaceScreen.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/ContextSidebar.tsx`
- Modify: `src/styles/workbench.css`
- Test: `tests/marketplace-navigation.test.tsx`
- Test: `tests/workbench-state.test.ts`
- Test: `tests/workspace-navigation.test.tsx`

**Interfaces:**
- Consumes: existing My Work `WorkbenchState`, `CatalogResult`, panel/chat state, and sidebar chrome.
- Produces:

```ts
export type AppMode = "work" | "marketplace";
export type MarketplaceCategory = "models" | "templates" | "recipes" | "prompts" | "components" | "skills";
export type MarketplaceLibrarySection = "installed" | "saved" | "added" | "downloads" | "updates" | "attention";
export type MarketplaceBrowseRoute =
  | { kind: "discover" }
  | { kind: "results" }
  | { kind: "category"; category: MarketplaceCategory }
  | { kind: "library"; section: MarketplaceLibrarySection }
  | { kind: "collection" };
export type MarketplaceRoute = MarketplaceBrowseRoute
  | { kind: "detail"; itemId: string }
  | { kind: "unavailable-detail"; category: "prompts" | "components" | "skills" };

export interface MarketplaceFilterState {
  category: MarketplaceCategory | "all";
  source: "all" | "ralphy" | "huggingface" | "civitai" | "modelscope";
  license: "all" | "declared";
  compatibility: "all" | "compatible" | "unknown" | "incompatible";
  modality: "all" | "text" | "image" | "video" | "audio" | "multimodal";
  format: "all" | "gguf" | "safetensors" | "onnx" | "mlx";
}

export interface MarketplaceQueryState {
  text: string;
  filters: MarketplaceFilterState;
  sort: "relevance" | "updated" | "name";
}

interface MarketplaceLocationMemory {
  query: MarketplaceQueryState;
  scrollTop: number;
  focusId: string | null;
}

export type MarketplaceLocation = MarketplaceLocationMemory & (
  | { route: MarketplaceBrowseRoute; selectedItemId: string | null }
  | { route: { kind: "detail"; itemId: string }; selectedItemId: string }
  | { route: { kind: "unavailable-detail"; category: "prompts" | "components" | "skills" }; selectedItemId: null }
);

export const MARKETPLACE_SIDEBAR_WIDTH = 248;

export interface MarketplaceNavigationState {
  mode: AppMode;
  sidebarVisible: boolean;
  location: MarketplaceLocation;
  history: MarketplaceLocation[];
  historyIndex: number;
  workReturnFocusId: string | null;
}

export type MarketplaceNavigationAction =
  | { type: "switch-mode"; mode: AppMode; returnFocusId: string | null }
  | { type: "navigate"; location: MarketplaceLocation }
  | { type: "remember"; patch: MarketplaceMemoryPatch }
  | { type: "select"; itemId: string | null }
  | { type: "back" }
  | { type: "forward" }
  | { type: "toggle-sidebar" };

export type MarketplaceMemoryPatch = Partial<Pick<MarketplaceLocationMemory, "query" | "scrollTop" | "focusId">>;

export interface MarketplaceScreenProps {
  catalog: CatalogResult | null;
  location: MarketplaceLocation;
  sidebarVisible: boolean;
  onNavigate(location: MarketplaceLocation): void;
  onRememberLocation(patch: MarketplaceMemoryPatch): void;
}

export function readMarketplaceNavigation(storage: Storage): MarketplaceNavigationState;
export function writeMarketplaceNavigation(storage: Storage, state: MarketplaceNavigationState): void;
export function isMarketplaceLocation(value: unknown): value is MarketplaceLocation;
export function marketplaceReducer(state: MarketplaceNavigationState, action: MarketplaceNavigationAction): MarketplaceNavigationState;
```

- `MarketplaceQueryState` is the single serializable query/filter/sort object used by navigation and, by import, the Task 3 controller. No second query type or string-keyed filter bag is allowed.
- Validation accepts only the declared filter/sort enums, caps query text at 256 characters, IDs/focus IDs at 256 characters, scroll at an integer `0…10_000_000`, and history at 50 locations. It rejects unknown keys, non-finite values, and malformed locations.
- A detail location is valid only when `selectedItemId === route.itemId`; an unavailable-detail location requires `selectedItemId === null`. The reducer accepts `select` only on browse routes and ignores it on either detail route. `back` and `forward` restore complete immutable locations rather than reconstructing them from the current query.
- App renders both `.app-mode-work` and `.app-mode-marketplace` surfaces; the inactive surface has `hidden` and `inert` so its React state/scroll stays mounted without remaining interactive or accessible.
- Marketplace is outside the `if (!catalog)` work-content branch: after welcome/recovery, its global mode control and screen render when `restoreLibrary()` returns `null` or an empty catalog. `MarketplaceScreen` receives `catalog={null}` and renders source/My Library capability states instead of falling back to the workspace-only `LibraryScreen` return.
- Render the mode rows of `ContextSidebar` whenever the app shell is ready, not behind `catalog && sidebarVisible`; change its `rootPath` prop to `string | null`, pass empty workspace/project arrays when the catalog is null, and keep workspace-only rows hidden. The user can click Marketplace from the null-catalog Library error/empty state without pre-seeding persisted mode.
- Marketplace uses a mode-fixed 248px sidebar and no resize handle. My Work continues using persisted `PANEL_SIZE_LIMITS.sidebar` values unchanged.

- [ ] **Step 1: Write failing navigation, persistence, and sidebar tests**

```tsx
expect(roundTrip.location).toEqual({
  route: { kind: "category", category: "recipes" },
  query: { text: "ffmpeg", filters: { category: "recipes", source: "ralphy", license: "all", compatibility: "unknown", modality: "all", format: "all" }, sort: "name" },
  selectedItemId: "recipe:voxel-dither",
  scrollTop: 438, focusId: "marketplace-item-recipe:voxel-dither",
});
expect(isMarketplaceLocation({ ...roundTrip.location, query: { ...roundTrip.location.query, sort: "popular" } })).toBe(false);
expect(isMarketplaceLocation({ ...roundTrip.location, route: { kind: "detail", itemId: "model:a" }, selectedItemId: "model:b" })).toBe(false);
expect(marketplaceReducer(detailState, { type: "select", itemId: "model:b" })).toBe(detailState);
expect(marketplaceReducer(stateAtB, { type: "back" }).location).toEqual(locationA);
expect(marketplaceReducer(stateAtA, { type: "forward" }).location).toEqual(locationB);
expect(workSurface.hidden).toBe(true);
expect(workSurface.getAttribute("inert")).not.toBeNull();
expect(marketplaceMarkup).toContain("Discover");
expect(marketplaceMarkup).toContain("Components & Effects");
expect(marketplaceMarkup).toContain("MY LIBRARY");
expect(marketplaceMarkup).not.toContain("Local Models");
vi.useFakeTimers();
vi.spyOn(bridge, "restoreLibrary").mockResolvedValue(null);
const host = createReactHost();
const root = createRoot(host.container as unknown as Element);
await act(async () => { root.render(<App />); await vi.advanceTimersByTimeAsync(1_500); });
const marketplaceButton = host.container.querySelectorAll("button").find((button) => button.textContent === "Marketplace");
expect(marketplaceButton).not.toBeUndefined();
await act(async () => marketplaceButton!.click());
expect(host.container.textContent).toContain("Discover");
const emptyCatalogMarkup = renderToStaticMarkup(<MarketplaceScreen catalog={{ ...emptyCatalog, workspaces: [], projects: [] }} location={locationA} sidebarVisible={true} onNavigate={() => undefined} onRememberLocation={() => undefined} />);
expect(emptyCatalogMarkup).toContain("Discover");
await act(async () => root.unmount());
host.restore();
vi.useRealTimers();
```

Cover mode-switch focus restoration, Marketplace Back within history, exact Back→Forward restoration of query/filter/sort/selection/scroll/focus, Marketplace-root Back to the exact My Work route, independent sidebar visibility, malformed persisted enum/filter/detail-selection state, `Cmd+B`, app header back/forward, one mounted sidebar only, Marketplace without workspace hero, null/empty catalog reachability, mode-fixed sidebar width, and chat/right-panel visibility in Marketplace.

- [ ] **Step 2: Run navigation tests and verify RED**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/marketplace-navigation.test.tsx tests/workbench-state.test.ts tests/workspace-navigation.test.tsx`

Expected: FAIL because Marketplace navigation/types and mode sidebar do not exist.

- [ ] **Step 3: Implement the minimal mode reducer and shell integration**

Keep My Work content mounted under `hidden`/`inert`; do not serialize each existing screen's private state. Move the existing `if (!catalog)` return into `workContent`, after the global app shell/mode state, so it cannot prevent Marketplace navigation. Render the ContextSidebar mode rows with nullable `rootPath` even when work content has no catalog. Marketplace gets a minimal truthful destination shell for this task. Remove the `localModelsVisible` app branch and Local Models row, but leave the model service/screen files until Task 5 migrates their UI. Use `MARKETPLACE_SIDEBAR_WIDTH` only in Marketplace mode and omit its resize handle.

```tsx
const marketplaceSidebarVisible = marketplace.sidebarVisible && viewport.width > 1_280;
const marketplaceShellStyle = { "--sidebar-w": `${MARKETPLACE_SIDEBAR_WIDTH}px` } as CSSProperties;

<div className="app-mode-surface app-mode-work" hidden={marketplace.mode !== "work"} inert={marketplace.mode !== "work"}>
  {workContent}
</div>
<div className="app-mode-surface app-mode-marketplace" style={marketplaceShellStyle} hidden={marketplace.mode !== "marketplace"} inert={marketplace.mode !== "marketplace"}>
  <MarketplaceScreen catalog={catalog} location={marketplace.location} sidebarVisible={marketplaceSidebarVisible} onNavigate={navigateMarketplace} onRememberLocation={rememberMarketplace} />
</div>
```

- [ ] **Step 4: Run navigation tests, typecheck, and build**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/marketplace-navigation.test.tsx tests/workbench-state.test.ts tests/workspace-navigation.test.tsx && bun run typecheck && bun run build`

Expected: PASS and build exits 0.

- [ ] **Step 5: Commit application-mode navigation**

```bash
git add src/state/marketplace-navigation.ts src/screens/MarketplaceScreen.tsx src/App.tsx src/components/ContextSidebar.tsx src/styles/workbench.css tests/marketplace-navigation.test.tsx tests/workbench-state.test.ts tests/workspace-navigation.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: add marketplace application mode"
```

### Task 2: Add the fixed-origin public-library adapter

**Files:**
- Create: `electron/marketplace-library.ts`
- Modify: `electron/media/types.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/main.ts`
- Modify: `src/lib/ipc.ts`
- Test: `tests/marketplace-library.test.ts`
- Test: `tests/ipc-security.test.ts`

**Interfaces:**
- Consumes: Electron `net.fetch`, `app.getPath("userData")`, and existing `guardedAtomicWrite`.
- Produces exactly one renderer bridge method:

```ts
export type MarketplacePublicCategory = "template" | "recipe";
export type MarketplaceRecipeKind = "ffmpeg" | "encode" | "overlay" | "bake" | "hyperframes" | "prompt";
export type MarketplaceJsonValue = null | boolean | number | string | MarketplaceJsonValue[] | { [key: string]: MarketplaceJsonValue };

export interface MarketplaceRecipeDto {
  kind: MarketplaceRecipeKind | null;
  body: string | null;
  artifact: string | null;
  parameters: MarketplaceJsonValue | null;
  demo: {
    kind: "hyperframes" | "media";
    storageUrl: string | null;
    beforeUrl: string | null;
    afterUrl: string | null;
    posterUrl: string | null;
  } | null;
}

export interface MarketplacePublicItemDto {
  id: string;
  category: MarketplacePublicCategory;
  name: string;
  summary: string;
  referenceUrls: string[];
  recipe: MarketplaceRecipeDto | null;
}

export interface MarketplacePublicSnapshotDto {
  schemaVersion: 1;
  source: "live" | "cache";
  refreshedAt: string;
  sourceUpdatedAt: string | null;
  warning: string | null;
  items: MarketplacePublicItemDto[];
}

export interface MarketplaceBridge {
  loadMarketplacePublicLibrary(): Promise<MarketplacePublicSnapshotDto>;
}

export function projectMarketplacePublicDocument(value: unknown): MarketplacePublicItemDto[];

interface MarketplaceLibraryOptions {
  fetcher: typeof fetch;
  cachePath: string;
  now(): number;
}

export async function loadMarketplacePublicLibrary(options: MarketplaceLibraryOptions): Promise<MarketplacePublicSnapshotDto>;
async function readBoundedJson(response: Response, maxBytes: number): Promise<unknown>;
function sanitizeMarketplaceProse(value: unknown, maxLength: number): string | null;
function sanitizeMarketplaceMarkdown(value: unknown, maxLength: number): string | null;
function projectMarketplaceArtifact(value: unknown): string | null;
function validateMarketplaceAssetUrl(value: unknown): string | null;
function boundedLastModified(headers: Headers): string | null;
```

- `loadMarketplacePublicLibrary(options)` in main-only code accepts injected `fetcher`, `cachePath`, and `now` for tests; no URL argument exists.
- Exact limits: fixed URL/host/path; HTTPS only; `redirect: "error"`; 8,000 ms timeout; 2 MiB response/cache cap; response URL exactly `https://ralphy.b-cdn.net/library/library.json`; `Content-Type`/`Content-Length`/`Last-Modified` headers at most 128 characters; schema version exactly 1; 1,024 raw blocks; 512 projected items; 128-character ASCII IDs; 160-character names; 2,048-character summaries; 8 reference URLs; 64 KiB body/artifact; JSON depth 4; 64 object keys/array entries; 4,096-character JSON strings; 2,048-character URLs.
- Preview/reference URLs require no username/password, no non-default port, no query/hash, exact origin `https://ralphy.b-cdn.net`, and a canonical path under `/blocks/` or `/units/`. Reject backslashes, repeated slashes, dot segments, encoded separators/dot segments/NUL, decode errors, redirect responses, and a final `response.url` mismatch.
- Main drops `demo.html`, filesystem/source-path keys, unknown root/block keys, asset blocks, and invalid/over-limit values. Sanitize HTML only from prose/Markdown fields (`name`, `summary`, `recipe.body`); `recipe.artifact` is an opaque bounded string preserved byte-for-byte for inert text rendering and exact clipboard copy. Cache stores only the projected DTO and is revalidated on every read. Renderer warnings/errors are bounded fixed copy and never interpolate `cachePath`, filesystem paths, request URLs, or raw exception messages.

- [ ] **Step 1: Write failing schema and trust-boundary tests**

```ts
process.env.RALPHY_LIBRARY_URL = "file:///Users/demo/.ssh/id_rsa";
await loadMarketplacePublicLibrary({ fetcher, cachePath, now: () => 1_787_200_000_000 });
expect(fetcher).toHaveBeenCalledWith("https://ralphy.b-cdn.net/library/library.json", expect.objectContaining({ redirect: "error" }));
expect(snapshot.items).toEqual([
  expect.objectContaining({ id: "choose-the-door", category: "template", recipe: null }),
  expect.objectContaining({ id: "voxel-dither", category: "recipe" }),
]);
expect(JSON.stringify(snapshot.items.map(({ name, summary, recipe }) => [name, summary, recipe?.body]))).not.toMatch(/<script|demoHtml|sourcePath|absolutePath|unknownSecret/i);
expect(snapshot.items.find(({ id }) => id === "voxel-dither")?.recipe?.artifact).toBe(exactOpaqueArtifactIncludingAngleBrackets);
expect(snapshot.warning).not.toContain(cachePath);
```

Cover redirects, a mismatched `response.url`, status/content-type errors, over-128-byte headers, false/oversized `Content-Length`, streamed-body overflow, invalid UTF-8/JSON, wrong schema, array/string/depth limits, duplicate IDs, invalid kinds, URL credentials/non-default ports/query/hash/noncanonical or encoded-traversal paths, prose/Markdown HTML removal, exact opaque artifact preservation, cache fallback, corrupt/oversized/symlink cache, atomic write failure, and network+cache total failure with path-redacted renderer copy. Assert no path/URL input crosses preload.

- [ ] **Step 2: Run adapter/security tests and verify RED**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/marketplace-library.test.ts tests/ipc-security.test.ts`

Expected: FAIL because the adapter, DTOs, channel, and preload method do not exist.

- [ ] **Step 3: Implement bounded fetch, projection, and cache fallback**

Read the response stream incrementally and abort at 2 MiB before concatenating. Check bounded headers and the final response URL before parsing. Sanitize only prose/Markdown; never normalize, trim, interpolate, or execute the bounded artifact. Do not return the public document, provider headers, cache path, or unprojected `params`. Write the projected snapshot with `guardedAtomicWrite`; cache write failure does not hide a valid live response and produces only fixed path-free warning copy.

```ts
const PUBLIC_LIBRARY_URL = "https://ralphy.b-cdn.net/library/library.json";
const response = await fetcher(PUBLIC_LIBRARY_URL, {
  headers: { accept: "application/json" }, credentials: "omit", redirect: "error",
  signal: AbortSignal.timeout(8_000),
});
if (response.url !== PUBLIC_LIBRARY_URL) throw new Error("Marketplace catalog response origin mismatch");
const snapshot = { schemaVersion: 1, source: "live", refreshedAt: new Date(now()).toISOString(), sourceUpdatedAt: boundedLastModified(response.headers), warning: null, items: projectMarketplacePublicDocument(await readBoundedJson(response, 2 * 1024 * 1024)) } satisfies MarketplacePublicSnapshotDto;
await guardedAtomicWrite(cachePath, JSON.stringify(snapshot), { maxBytes: 2 * 1024 * 1024 }).catch(() => undefined);
return snapshot;
```

- [ ] **Step 4: Run adapter tests, typecheck, and build**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/marketplace-library.test.ts tests/ipc-security.test.ts && bun run typecheck && bun run build`

Expected: PASS and Electron bundle exits 0.

- [ ] **Step 5: Commit the secure adapter**

```bash
git add electron/marketplace-library.ts electron/media/types.ts electron/preload.ts electron/main.ts src/lib/ipc.ts tests/marketplace-library.test.ts tests/ipc-security.test.ts
gitleaks protect --staged --redact
git commit -m "feat: add marketplace public catalog adapter"
```

### Task 3: Model honest cross-source catalog state

**Files:**
- Create: `src/screens/marketplace/presentation.ts`
- Create: `src/state/marketplace-controller.ts`
- Test: `tests/marketplace-presentation.test.ts`
- Test: `tests/marketplace-controller.test.ts`

**Interfaces:**
- Consumes: Task 1 `MarketplaceQueryState`, Task 2 snapshot, and current `LocalModelCatalog`, `LocalModelSummary`, `LocalModelDetail`, `LocalModelMachine`.
- Produces:

```ts
export type Availability<T> =
  | { status: "ready"; value: T }
  | { status: "empty"; reason: string }
  | { status: "unavailable"; reason: string };

interface MarketplaceCommonItem {
  key: string;
  name: string;
  summary: string;
  sourceLabel: string;
  version: Availability<string>;
  updatedAt: Availability<string>;
  license: Availability<string>;
  publisherIdentity: Availability<string>;
  contentAudit: Availability<string>;
  compatibility: Availability<string>;
}

export interface MarketplaceModelDto {
  provider: "huggingface" | "civitai" | "modelscope";
  id: string;
  name: string;
  author: string;
  task: string;
  modality: "text" | "image" | "video" | "audio" | "multimodal" | "unknown";
  modelType: string;
  baseModel: string | null;
  license: string | null;
  gated: boolean;
  revision: string | null;
  lastModified: string | null;
  tags: string[];
  iconUrl: string | null;
  previewUrl: string | null;
  providerUrl: string;
  recommendedPackage: { format: string; bytes: number | null; files: string[] };
  comfort: { level: "comfortable" | "usable" | "tight" | "unknown" | "incompatible"; label: string; score: 0 | 1 | 2 | 3 | 4; runtime: "ollama" | "diffusers" | "transformers" | "mlx"; estimatedMemoryBytes: number | null; evidence: string[] };
  state: "remote" | "gated" | "downloaded" | "ready";
  permissions: string[];
}

export interface MarketplaceModelDetailDto extends MarketplaceModelDto {
  readme: string;
  previewUrls: string[];
  files: { name: string; bytes: number | null; format: string; recommended: boolean; warning: string | null }[];
}

export type MarketplaceItemPresentation =
  | (MarketplaceCommonItem & { category: "models"; model: MarketplaceModelDto })
  | (MarketplaceCommonItem & { category: "templates"; template: MarketplacePublicItemDto })
  | (MarketplaceCommonItem & { category: "recipes"; recipe: MarketplacePublicItemDto });

export interface MarketplaceCategoryPresentation {
  category: MarketplaceCategory;
  label: string;
  purpose: string;
  count: Availability<number>;
  catalog: "ready" | "unavailable";
}

export interface MarketplaceSourceIssue {
  source: "ralphy-public" | "huggingface" | "civitai" | "modelscope" | "models";
  scope: "public-library" | "model-provider" | "model-catalog";
  message: string;
}

export interface MarketplaceSourceHealth {
  publicLibrary: "ready" | "unavailable";
  models: "ready" | "partial" | "unavailable";
}

export type MarketplaceSnapshot =
  | { status: "loading"; query: MarketplaceQueryState }
  | { status: "ready"; items: MarketplaceItemPresentation[]; categories: MarketplaceCategoryPresentation[]; machine: LocalModelMachine | null; publicSource: MarketplacePublicSnapshotDto | null; sourceErrors: MarketplaceSourceIssue[]; sourceHealth: MarketplaceSourceHealth; refreshing: boolean; query: MarketplaceQueryState }
  | { status: "error"; error: string; sourceErrors: MarketplaceSourceIssue[]; sourceHealth: MarketplaceSourceHealth; query: MarketplaceQueryState };

export interface MarketplaceController {
  subscribe(listener: () => void): () => void;
  getSnapshot(): MarketplaceSnapshot;
  start(): Promise<void>;
  refresh(): Promise<void>;
  setQuery(query: MarketplaceQueryState): void;
  dispose(): void;
}

export function projectMarketplaceModel(summary: LocalModelSummary): MarketplaceModelDto;
export function projectMarketplaceModelDetail(detail: LocalModelDetail): MarketplaceModelDetailDto;

export function presentMarketplaceSources(
  publicSnapshot: MarketplacePublicSnapshotDto | null,
  modelCatalog: LocalModelCatalog | null,
  query: MarketplaceQueryState,
  sourceErrors: MarketplaceSourceIssue[],
  sourceHealth: MarketplaceSourceHealth,
): Extract<MarketplaceSnapshot, { status: "ready" }>;
```

- [ ] **Step 1: Write failing presentation and controller tests**

```ts
expect(items.map((item) => item.category)).toEqual(["models", "templates", "recipes"]);
expect(categories.find(({ category }) => category === "skills")?.count.status).toBe("unavailable");
expect(template.license).toEqual({ status: "unavailable", reason: expect.stringContaining("public library") });
expect(model.publisherIdentity.status).toBe("unavailable");
expect(JSON.stringify(projectMarketplaceModel({ ...modelSummary, downloads: 98_765, likes: 432 }))).not.toMatch(/downloads|likes|rating|trending|recommended/i);
expect(searchLocalModels).toHaveBeenCalledWith(expect.objectContaining({ sort: "updated", limit: 24 }));
expect(partialSnapshot.sourceErrors).toContainEqual({ source: "huggingface", scope: "model-provider", message: "rate limited" });
expect(partialSnapshot.sourceHealth.models).toBe("partial");
expect(allModelsFailedSnapshot.sourceHealth.models).toBe("unavailable");
expect(totalFailureSnapshot).toMatchObject({ status: "error", sourceHealth: { publicLibrary: "unavailable", models: "unavailable" } });
```

Cover explicit field-by-field model/detail projection, serialized absence of `downloads`/`likes`, keyword scoring over current fields, stable source-prefixed keys, prompt-recipe staying Recipe, every Task 1 filter enum, honest unavailable counts, live/cache source state, fulfilled catalog with one provider error plus usable models, fulfilled catalog with zero models and all attempted providers errored, public failure plus healthy models, model failure plus public items, total model+public failure, stale response suppression, refresh retaining content, deterministic name tie-breaks, no provider-download sorting, and controller disposal. Merge every fulfilled `LocalModelCatalog.errors` entry into `sourceErrors`; a fulfilled catalog is not automatically healthy.

- [ ] **Step 2: Run model/controller tests and verify RED**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/marketplace-presentation.test.ts tests/marketplace-controller.test.ts`

Expected: FAIL because presentation/controller files do not exist.

- [ ] **Step 3: Implement pure mapping and the smallest source coordinator**

Use `Promise.allSettled` for the two existing source calls. Do not add a query library, catalog superclass, adapter registry, or renderer cache. Import Task 1 `MarketplaceQueryState`; do not redeclare or loosely patch it. Explicitly copy allowlisted model fields into `MarketplaceModelDto`/`MarketplaceModelDetailDto`; never spread a service model because that would reintroduce `downloads`/`likes` into serialized presentation.

```ts
const [library, models] = await Promise.allSettled([
  bridge.loadMarketplacePublicLibrary(),
  bridge.searchLocalModels({ query: query.text || undefined, provider: query.filters.source === "ralphy" ? "all" : query.filters.source, sort: "updated", limit: 24 }),
]);
if (requestId !== this.#activeRequest || this.#disposed) return;
const attemptedProviders = query.filters.source === "all" || query.filters.source === "ralphy"
  ? (["huggingface", "civitai", "modelscope"] as const)
  : [query.filters.source];
const providerIssues: MarketplaceSourceIssue[] = models.status === "fulfilled"
  ? models.value.errors.map(({ provider, message }) => ({ source: provider, scope: "model-provider", message }))
  : [];
const sourceErrors: MarketplaceSourceIssue[] = [
  ...(library.status === "rejected" ? [{ source: "ralphy-public", scope: "public-library", message: "Ralphy public library is unavailable" } satisfies MarketplaceSourceIssue] : []),
  ...(models.status === "rejected" ? [{ source: "models", scope: "model-catalog", message: "Model catalog is unavailable" } satisfies MarketplaceSourceIssue] : []),
  ...providerIssues,
];
const failedProviders = new Set(providerIssues.map(({ source }) => source));
const allAttemptedProvidersFailed = attemptedProviders.every((provider) => failedProviders.has(provider));
const modelHealth = models.status === "rejected" || allAttemptedProvidersFailed ? "unavailable" : providerIssues.length > 0 ? "partial" : "ready";
const sourceHealth: MarketplaceSourceHealth = { publicLibrary: library.status === "fulfilled" ? "ready" : "unavailable", models: modelHealth };
if (library.status === "rejected" && modelHealth === "unavailable") {
  this.#snapshot = { status: "error", error: "Marketplace sources are unavailable", sourceErrors, sourceHealth, query };
  this.#emit();
  return;
}
this.#snapshot = presentMarketplaceSources(library.status === "fulfilled" ? library.value : null, models.status === "fulfilled" ? models.value : null, query, sourceErrors, sourceHealth);
this.#emit();
```

- [ ] **Step 4: Run focused tests, typecheck, build, and diff check**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/marketplace-presentation.test.ts tests/marketplace-controller.test.ts && bun run typecheck && bun run build && git diff --check`

Expected: PASS, build exits 0, and the diff has no whitespace errors.

- [ ] **Step 5: Commit presentation and controller**

```bash
git add src/screens/marketplace/presentation.ts src/state/marketplace-controller.ts tests/marketplace-presentation.test.ts tests/marketplace-controller.test.ts
gitleaks protect --staged --redact
git commit -m "feat: model marketplace catalog state"
```

### Task 4: Build Discover, mixed results, category browse, and source states

**Files:**
- Modify: `src/screens/MarketplaceScreen.tsx`
- Create: `src/screens/marketplace/MarketplaceHeader.tsx`
- Create: `src/screens/marketplace/MarketplaceBrowse.tsx`
- Create: `src/styles/marketplace.css`
- Modify: `src/main.tsx`
- Test: `tests/marketplace-screen.test.tsx`
- Test: `tests/marketplace-navigation.test.tsx`

**Interfaces:**
- Consumes: Task 1 location/navigation callbacks and Task 3 controller snapshot.
- Produces: Discover, results, and category routes with `onOpenItem(key)`, `onOpenCategory(category)`, `onOpenLibrary(section)`, `onRememberLocation(patch)`, and exact focus restoration.

```ts
export interface MarketplaceResultsProps {
  items: MarketplaceItemPresentation[];
  query: MarketplaceQueryState;
  onOpenItem(key: string): void;
}

export function MarketplaceResults(props: MarketplaceResultsProps): React.ReactElement;
```

- [ ] **Step 1: Write failing shell, discover, results, and state tests**

```tsx
expect(discover).toContain("Marketplace");
expect(discover).toContain("Models");
expect(discover).toContain("Templates");
expect(discover).toContain("Recipes");
expect(discover).toContain("Prompts");
expect(discover).toContain("Components & Effects");
expect(discover).toContain("Skills");
expect(results).toContain("Relevance · keyword");
expect(results).not.toMatch(/rating|trending|recommended for you|downloads/i);
const modelResultMarkup = renderToStaticMarkup(<MarketplaceResults items={[modelPresentation]} query={defaultQuery} onOpenItem={() => undefined} />);
expect(modelResultMarkup).not.toMatch(/98,?765|432|downloads|likes/i);
expect(partial).toContain("Civitai is unavailable");
expect(partial).toContain("Results from healthy sources are still shown");
```

Assert category cards show exact loaded counts or an unavailable reason; serialized and rendered model presentation cannot expose `downloads`/`likes`; Continue contains only real installed Ollama state; current-work suggestions are omitted without a match explanation; collection and recently-updated sections do not invent records; mixed results use text category labels; filters remain visible on no results; source retry retains healthy results; cards open on Enter/Space; closing/back restores the origin item and stored scroll.

- [ ] **Step 2: Run renderer tests and verify RED**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/marketplace-screen.test.tsx tests/marketplace-navigation.test.tsx`

Expected: FAIL on the minimal Task 1 shell.

- [ ] **Step 3: Implement the live shell and mixed feed**

Use semantic lists/grids, one primary action per result, real preview URLs only, explicit fallback plates, and the existing filter/select primitives. Only virtualize when the bounded result list exceeds 100 items; the current ≤536 adapter cap otherwise renders normally to preserve simple keyboard order.

```tsx
switch (location.route.kind) {
  case "discover": return <MarketplaceDiscover snapshot={snapshot} onOpenCategory={onOpenCategory} />;
  case "results": return <MarketplaceResults items={snapshot.items} query={snapshot.query} onOpenItem={onOpenItem} />;
  case "category": return <MarketplaceCategoryView category={location.route.category} snapshot={snapshot} onOpenItem={onOpenItem} />;
  default: return null;
}
```

- [ ] **Step 4: Run renderer tests, typecheck, and build**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/marketplace-screen.test.tsx tests/marketplace-navigation.test.tsx tests/marketplace-controller.test.ts && bun run typecheck && bun run build`

Expected: PASS and renderer build exits 0.

- [ ] **Step 5: Commit browse surfaces**

```bash
git add src/screens/MarketplaceScreen.tsx src/screens/marketplace/MarketplaceHeader.tsx src/screens/marketplace/MarketplaceBrowse.tsx src/styles/marketplace.css src/main.tsx tests/marketplace-screen.test.tsx tests/marketplace-navigation.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: add marketplace discovery views"
```

### Task 5: Migrate Local Models into Marketplace full routes

**Files:**
- Create: `src/screens/marketplace/MarketplaceModelViews.tsx`
- Modify: `src/screens/MarketplaceScreen.tsx`
- Modify: `src/screens/marketplace/MarketplaceBrowse.tsx`
- Modify: `src/styles/marketplace.css`
- Modify: `src/main.tsx`
- Delete: `src/screens/LocalModelsScreen.tsx`
- Delete: `src/styles/local-models.css`
- Delete: `tests/local-models-screen.test.tsx`
- Test: `tests/marketplace-models.test.tsx`
- Test: `tests/workspace-navigation.test.tsx`

**Interfaces:**
- Consumes: current `searchLocalModels`, `loadLocalModelDetail`, `refreshLocalModelMachine`, and `openLocalModelProvider` bridge methods without changing their operational contract.
- Produces: Models category list, full-route Model detail, compatibility/file/license/provider sections, and `onReviewDownload(model)`; Task 8 supplies the review UI.

```ts
export interface MarketplaceModelDetailProps {
  reference: LocalModelReference;
  onBack(): void;
  onReviewDownload(model: MarketplaceModelDetailDto): void;
}

export type MarketplaceModelDetailState =
  | { status: "loading" }
  | { status: "ready"; value: MarketplaceModelDetailDto }
  | { status: "error"; message: string };

function useMarketplaceModelDetail(reference: LocalModelReference): MarketplaceModelDetailState;
```

- [ ] **Step 1: Write failing migration and full-detail tests**

```tsx
expect(models).toContain("Models");
expect(detail).toContain("Compatibility");
expect(detail).toContain("What it gives you");
expect(detail).toContain("Use when");
expect(detail).toContain("Do not use when");
expect(detail).toContain("Versions and files");
expect(detail).toContain("License and access");
expect(detail).toContain("Local installation");
expect(detail).toContain("Used by Ralphy");
expect(detail).toContain("Works with");
expect(detail).toContain("Used by");
expect(detail).toContain("Download and installation are unavailable in the current Desktop contract");
expect(detail).not.toMatch(/downloads|likes|trending/i);
expect(sidebar).not.toContain("Local Models");
rerender(<MarketplaceModelDetail reference={referenceB} onBack={onBack} onReviewDownload={onReviewDownload} />);
resolveB(modelB);
resolveA(modelA);
expect(screen.getByRole("heading", { name: modelB.name })).toBeVisible();
expect(screen.queryByRole("heading", { name: modelA.name })).toBeNull();
```

Cover Hugging Face public/gated, Civitai permissions, likely/unknown/incompatible evidence, runtime absent, provider failure, preview error fallback, file warnings, serialized/rendered absence of `downloads`/`likes`, full-route Back/focus, provider external link validation, installed Ollama inventory handoff, and chat remaining mounted. Add deferred-promise tests for A→B where A resolves last, unmount before resolve/reject, and Back during load followed by late resolution; no stale result, state update, focus move, or review callback may occur. Source assertions prove `LocalModelsScreen` is no longer imported or reachable.

- [ ] **Step 2: Run model and navigation tests and verify RED**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/marketplace-models.test.tsx tests/workspace-navigation.test.tsx tests/local-models-service.test.ts`

Expected: new Marketplace model tests fail before the full-route view exists; provider service tests stay green.

- [ ] **Step 3: Move the useful Local Models UI into Marketplace**

Reuse service normalization but immediately project each loaded detail through Task 3 `projectMarketplaceModelDetail`. Replace the old dialog with a Marketplace detail route, remove popularity display/sorts, and leave only evidence-backed compatibility. Guard the non-cancellable existing IPC promise with both a monotonically increasing request generation and effect cleanup; the bridge contract has no `AbortSignal`, so cancellation here means suppressing all late state/callback effects. Delete the old screen/style/test after equivalent behavior is covered in `marketplace-models.test.tsx`.

```tsx
function useMarketplaceModelDetail(reference: LocalModelReference): MarketplaceModelDetailState {
  const generation = useRef(0);
  const [state, setState] = useState<MarketplaceModelDetailState>({ status: "loading" });
  useEffect(() => {
    const requestGeneration = ++generation.current;
    let cancelled = false;
    setState({ status: "loading" });
    void bridge.loadLocalModelDetail(reference).then(
      (value) => { if (!cancelled && requestGeneration === generation.current) setState({ status: "ready", value: projectMarketplaceModelDetail(value) }); },
      (cause) => { if (!cancelled && requestGeneration === generation.current) setState({ status: "error", message: cause instanceof Error ? cause.message : String(cause) }); },
    );
    return () => { cancelled = true; generation.current += 1; };
  }, [reference.id, reference.provider]);
  return state;
}

export function MarketplaceModelDetail({ reference, onBack, onReviewDownload }: MarketplaceModelDetailProps) {
  const state = useMarketplaceModelDetail(reference);
  if (state.status === "loading") return <main className="marketplace-detail-route" aria-busy="true">Loading model details…</main>;
  if (state.status === "error") return <main className="marketplace-detail-route"><button type="button" onClick={onBack}>Back to Models</button><p role="alert">{state.message}</p></main>;
  const detail = state.value;
  return <main className="marketplace-detail-route" aria-labelledby="marketplace-model-title">
    <button type="button" onClick={onBack}>Back to Models</button>
    <h1 id="marketplace-model-title">{detail.name}</h1>
    <section aria-labelledby="marketplace-model-compatibility"><h2 id="marketplace-model-compatibility">Compatibility</h2>{detail.comfort.evidence.map((line) => <p key={line}>{line}</p>)}</section>
    <section aria-labelledby="marketplace-model-files"><h2 id="marketplace-model-files">Versions and files</h2>{detail.files.map((file) => <p key={file.name}>{file.name}</p>)}</section>
    <button type="button" onClick={() => onReviewDownload(detail)}>Review download</button>
  </main>;
}
```

- [ ] **Step 4: Run model regression, typecheck, and build**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/marketplace-models.test.tsx tests/local-models-service.test.ts tests/ipc-security.test.ts tests/workspace-navigation.test.tsx && bun run typecheck && bun run build`

Expected: PASS and no standalone Local Models destination remains.

- [ ] **Step 5: Commit the model migration**

```bash
git add -A src/screens/LocalModelsScreen.tsx src/styles/local-models.css tests/local-models-screen.test.tsx src/screens/marketplace/MarketplaceModelViews.tsx src/screens/MarketplaceScreen.tsx src/screens/marketplace/MarketplaceBrowse.tsx src/styles/marketplace.css src/main.tsx tests/marketplace-models.test.tsx tests/workspace-navigation.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: move local models into marketplace"
```

### Task 6: Add real Template and Recipe details with safe Recipe copy

**Files:**
- Create: `src/screens/marketplace/MarketplacePublicItemDetail.tsx`
- Modify: `src/screens/MarketplaceScreen.tsx`
- Modify: `src/styles/marketplace.css`
- Modify: `index.html`
- Test: `tests/marketplace-public-details.test.tsx`
- Test: `tests/design-system.test.ts`

**Interfaces:**
- Consumes: Task 2 DTO, Task 3 presentation, existing `MarkdownView`, and `bridge.copyText`.
- Produces: full-route Template/Recipe detail; callbacks `onReviewTemplateTarget(item)` and `onReviewRecipeTarget(item)`; Recipe `Copy artifact` is the only enabled item mutation.

- [ ] **Step 1: Write failing Template/Recipe detail tests**

```tsx
expect(template).toContain("What it gives you");
expect(template).toContain("Use when");
expect(template).toContain("Do not use when");
expect(template).toContain("What will be added");
expect(template).toContain("Permissions and access");
expect(template).toContain("Version and provenance");
expect(template).toContain("Works with");
expect(template).toContain("Used by");
expect(template).toContain("Scene structure is unavailable from public-library schema 1");
expect(template).toContain("License is unavailable from public-library schema 1");
expect(recipe).toContain("Artifact");
expect(recipe).toContain("Named parameters");
expect(recipe).toContain("Do not use when");
expect(recipe).toContain("Source-provided preview");
expect(recipe).not.toContain("seed fixes composition, not pixels");
await click("Copy artifact");
expect(copyText).toHaveBeenCalledWith(exactArtifact);
expect(recipeMarkup).toContain("&lt;script&gt;");
expect(recipeRoot.querySelector("script")).toBeNull();
```

Cover all ten shared detail sections, Template reference preview/fallback, recipe body/artifact/parameters/demo/before/after, `recipeKind: "prompt"` remaining Recipe, unknown license/version/date/audit/compatibility/backlinks/relationships, exact copy of an artifact containing HTML-like angle brackets, inert `<pre><code>` text rendering with no created HTML node, copy success/failure announcement without focus theft, and CDN-only CSP for image/media.

- [ ] **Step 2: Run detail/design tests and verify RED**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/marketplace-public-details.test.tsx tests/design-system.test.ts`

Expected: Marketplace detail assertions fail; the recorded unrelated font-weight baseline may also remain.

- [ ] **Step 3: Implement full details and the bounded copy action**

Do not infer format, model stack, slots, failure modes, provenance, content review, or license from the item name/body. Render the opaque artifact only as React text children inside `<pre><code>`; never pass it to `MarkdownView`, `dangerouslySetInnerHTML`, a URL, shell, or media element. Add only `https://ralphy.b-cdn.net` to `img-src` and `media-src`; do not widen `default-src`, `script-src`, or `connect-src`.

```tsx
const copyArtifact = async () => {
  if (!item.recipe?.artifact) return;
  try {
    await bridge.copyText(item.recipe.artifact);
    setCopyStatus("Artifact copied");
  } catch (cause) {
    setCopyStatus(cause instanceof Error ? cause.message : String(cause));
  }
};
```

- [ ] **Step 4: Run detail tests, typecheck, and build**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/marketplace-public-details.test.tsx tests/marketplace-library.test.ts tests/markdown-view.test.tsx && bun run typecheck && bun run build`

Expected: PASS and the bounded artifact is the only enabled Marketplace action call.

- [ ] **Step 5: Commit public item details**

```bash
git add src/screens/marketplace/MarketplacePublicItemDetail.tsx src/screens/MarketplaceScreen.tsx src/styles/marketplace.css index.html tests/marketplace-public-details.test.tsx tests/design-system.test.ts
gitleaks protect --staged --redact
git commit -m "feat: add marketplace public item details"
```

### Task 7: Complete unsupported category, detail, collection, and contribution shells

**Files:**
- Create: `src/screens/marketplace/MarketplaceUnavailableViews.tsx`
- Modify: `src/screens/MarketplaceScreen.tsx`
- Modify: `src/screens/marketplace/MarketplaceBrowse.tsx`
- Modify: `src/styles/marketplace.css`
- Test: `tests/marketplace-unavailable-views.test.tsx`

**Interfaces:**
- Consumes: unsupported categories `"prompts" | "components" | "skills"` and route callbacks.
- Produces: category shell, universal full-route detail shell, Prompt variables/body/example blocks, Component preview/ratios/controls/accessibility blocks, Skill example-runs/files/permissions/trust blocks, collection shell, creator/publish shell, and callbacks into Task 8 reviews.

```ts
export interface MarketplaceUnavailableDetailProps {
  category: "prompts" | "components" | "skills";
  onReview(): void;
}

function UnavailablePromptDetail(props: Pick<MarketplaceUnavailableDetailProps, "onReview">): React.ReactElement;
function UnavailableComponentDetail(props: Pick<MarketplaceUnavailableDetailProps, "onReview">): React.ReactElement;
function UnavailableSkillDetail(props: Pick<MarketplaceUnavailableDetailProps, "onReview">): React.ReactElement;
```

- [ ] **Step 1: Write failing complete-inventory tests**

```tsx
expect(prompt).toContain("Prompt catalog is unavailable from the current contract");
expect(prompt).toContain("Variables");
expect(prompt).toContain("Expected output shape");
expect(component).toContain("Live preview unavailable");
expect(component).toContain("Aspect ratios");
expect(component).toContain("Accessibility notes");
expect(skill).toContain("Previewing a Skill never executes it");
expect(skill).toContain("SKILL.md");
expect(skill).toContain("references/");
expect(skill).toContain("scripts/");
expect(prompt).toContain("Used by");
expect(prompt).toContain("Usage backlinks are unavailable");
expect(collection).toContain("Community collection contract is unavailable");
expect(creator).toContain("Creator identity and published-item contracts are unavailable");
expect(publish).toContain("Publishing requires identity, validation, licensing, moderation, and versioning contracts");
```

Assert no fake names/items/counts/runs/files/permissions/versions/licenses; every unavailable field names its missing contract; category search/filters stay usable; each shell has exactly one review CTA and disabled type-specific final action is delegated to Task 8; source unavailable differs from empty results.

- [ ] **Step 2: Run unsupported-view tests and verify RED**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/marketplace-unavailable-views.test.tsx tests/marketplace-screen.test.tsx`

Expected: FAIL because unsupported detail/collection shells do not exist.

- [ ] **Step 3: Implement complete unavailable shells without sample records**

Render category-level capability requirements instead of synthetic cards. Reuse one common detail-section frame, but keep Prompt, Component, and Skill bodies explicit so their semantics and risk boundaries do not collapse.

```tsx
export function MarketplaceUnavailableDetail({ category, onReview }: { category: "prompts" | "components" | "skills"; onReview(): void }) {
  if (category === "prompts") return <UnavailablePromptDetail onReview={onReview} />;
  if (category === "components") return <UnavailableComponentDetail onReview={onReview} />;
  return <UnavailableSkillDetail onReview={onReview} />;
}
```

- [ ] **Step 4: Run view tests, typecheck, build, and diff check**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/marketplace-unavailable-views.test.tsx tests/marketplace-screen.test.tsx tests/marketplace-public-details.test.tsx && bun run typecheck && bun run build && git diff --check`

Expected: PASS, build exits 0, and the diff has no whitespace errors.

- [ ] **Step 5: Commit unsupported surfaces**

```bash
git add src/screens/marketplace/MarketplaceUnavailableViews.tsx src/screens/MarketplaceScreen.tsx src/screens/marketplace/MarketplaceBrowse.tsx src/styles/marketplace.css tests/marketplace-unavailable-views.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: complete marketplace category shells"
```

### Task 8: Add target chooser, My Library, Downloads, and action reviews

**Files:**
- Create: `src/screens/marketplace/MarketplaceWorkflows.tsx`
- Create: `src/screens/marketplace/MarketplaceMyLibrary.tsx`
- Modify: `src/screens/MarketplaceScreen.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/marketplace.css`
- Test: `tests/marketplace-workflows.test.tsx`
- Test: `tests/marketplace-my-library.test.tsx`

**Interfaces:**
- Consumes: `CatalogResult.workspaces`, `CatalogResult.projects`, current work route, real `LocalModelMachine.installed`, selected item/category, and Radix dialog.
- Produces:

```ts
export type MarketplaceWorkflowKind =
  | "model-download"
  | "template-target"
  | "recipe-target"
  | "prompt-use"
  | "component-target"
  | "skill-install"
  | "update-conflict";

export interface MarketplaceProjectTargetOption {
  id: string;
  kind: "project";
  label: string;
  contextLabel: string;
  current: boolean;
  compatible: true;
  compatibilityBasis: "project-target";
}

export interface MarketplaceUnavailableTargetScope {
  kind: "chat" | "agent" | "computer";
  label: string;
  reason: string;
}

export interface MarketplaceWorkflowTargets {
  workflow: MarketplaceWorkflowKind;
  projectOptions: MarketplaceProjectTargetOption[];
  unavailableScopes: MarketplaceUnavailableTargetScope[];
  contextProjectLabel: string | null;
  targetUnavailableReason: string | null;
}

export function marketplaceTargets(catalog: CatalogResult, current: WorkbenchRoute, kind: MarketplaceWorkflowKind): MarketplaceWorkflowTargets;

export interface MarketplaceTargetChooserProps {
  targets: MarketplaceWorkflowTargets;
  onCancel(): void;
}

export function MarketplaceTargetChooser(props: MarketplaceTargetChooserProps): React.ReactElement;

export type MarketplaceDownloadPresentation =
  | { availability: "unavailable"; reason: string }
  | { availability: "ready"; jobs: { id: string; label: string; state: "active" | "failed" | "completed"; progress: number | null; nextAction: string }[] };
```

- Production always passes `availability: "unavailable"` for downloads/updates/saved/added/forked/action mutation. Deterministic `ready` fixtures exist only in tests to exercise every required component state.

- [ ] **Step 1: Write failing chooser, library, download, and review tests**

```tsx
const modelTargets = marketplaceTargets(catalog, currentProjectRoute, "model-download");
const promptTargets = marketplaceTargets(catalog, currentProjectRoute, "prompt-use");
const skillTargets = marketplaceTargets(catalog, currentProjectRoute, "skill-install");
expect(modelTargets).toMatchObject({ projectOptions: [], contextProjectLabel: null });
expect(modelTargets.unavailableScopes.map(({ kind }) => kind)).toEqual(["computer"]);
expect(promptTargets).toMatchObject({ projectOptions: [], contextProjectLabel: null });
expect(promptTargets.unavailableScopes.map(({ kind }) => kind)).toEqual(["chat"]);
expect(skillTargets).toMatchObject({ projectOptions: [], contextProjectLabel: "UX Testing Lab / UX Tester" });
expect(skillTargets.unavailableScopes.map(({ kind }) => kind)).toEqual(["agent"]);
for (const workflow of ["template-target", "recipe-target", "component-target"] as const) {
  const targets = marketplaceTargets(catalog, currentProjectRoute, workflow);
  expect(targets.projectOptions).toEqual(expect.arrayContaining([expect.objectContaining({ contextLabel: "UX Testing Lab / UX Tester", current: true, compatible: true, compatibilityBasis: "project-target" })]));
  expect(targets.unavailableScopes).toEqual([]);
}
const targetsFromCurrent = marketplaceTargets(catalog, currentProjectRoute, "template-target").projectOptions;
const targetsFromOther = marketplaceTargets(catalog, otherProjectRoute, "template-target").projectOptions;
expect(targetsFromOther.map(({ current: _current, ...option }) => option)).toEqual(targetsFromCurrent.map(({ current: _current, ...option }) => option));
expect(targetsFromOther.map(({ current }) => current)).not.toEqual(targetsFromCurrent.map(({ current }) => current));
expect(marketplaceTargets(catalog, currentProjectRoute, "update-conflict")).toMatchObject({ projectOptions: [], unavailableScopes: [], targetUnavailableReason: "Update target is unavailable without persistent installed-version and local-modification state" });
expect(JSON.stringify(marketplaceTargets(catalog, currentProjectRoute, "recipe-target"))).not.toMatch(/\/Users\/|absolutePath|rootPath|ralphy\.db/i);
const chooserMarkup = renderToStaticMarkup(<MarketplaceTargetChooser targets={marketplaceTargets(catalog, currentProjectRoute, "recipe-target")} onCancel={() => undefined} />);
for (const path of [catalog.rootPath, ...catalog.workspaces.map(({ absolutePath }) => absolutePath)]) expect(chooserMarkup).not.toContain(path);
expect(library).toContain("Installed on this Mac");
expect(library).toContain("Registered in Ollama");
expect(library).toContain("Saved items are unavailable because there is no persistent saved-state contract");
expect(downloads).toContain("Active");
expect(downloads).toContain("Needs attention");
expect(downloads).toContain("Completed");
expect(update).toContain("Current version");
expect(update).toContain("Proposed version");
expect(update).toContain("Local modifications");
expect(actions).toContain("Saving is unavailable without a persistent saved-state contract");
expect(actions).toContain("Adding is unavailable without a Core mutation contract");
expect(actions).toContain("Use in chat is unavailable without target enumeration and attachment contracts");
expect(actions).toContain("The final action is disabled");
```

Cover the exact workflow matrix: Model exposes only an unavailable Computer/runtime scope; Prompt only unavailable Chat; Skill only unavailable Agent while the current project is context text and never selectable; Template/Recipe/Component expose only named project options; update/conflict exposes no target and names missing persistent version/modification state. For project workflows, every catalog project is target-kind compatible independent of the current route; `current` only preselects the matching project and never creates compatibility. Assert each wrong target kind is absent, workspace rows are never options, route changes alter only `current`, and serialized/helper and rendered chooser output excludes `CatalogResult.rootPath`, every `WorkspaceSummary.absolutePath`, DB paths, and raw fallback IDs. Also cover Escape/scrim cancel, focus trap/restore, no final bridge mutation call, model preflight/license/download/install/test review, Template project review, Recipe apply review, Prompt use-in-chat review, Component add review, Skill bundle/agent/scope/mode/files/tools/network/credentials review, active/failed/completed progress semantics, update keep/fork/replace disabled choices, and My Library distinctions for installed/saved/added/forked/download/update/attention.

- [ ] **Step 2: Run workflow/library tests and verify RED**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/marketplace-workflows.test.tsx tests/marketplace-my-library.test.tsx`

Expected: FAIL because workflow and My Library components do not exist.

- [ ] **Step 3: Implement complete non-mutating workflows**

Share only the Radix window frame/focus logic. Each action review has its own explicit fields and reason. Project rows exist only for Template/Recipe/Component. `compatible: true` means only that the row is structurally a project target accepted by those workflow kinds; it is identical for current and non-current projects and never claims item/runtime compatibility. Model/Prompt/Skill render exactly their one unavailable scope, and Skill project context is plain text outside the option list. Update/conflict renders only `targetUnavailableReason`. The only enabled item action remains Recipe copy from Task 6; opening chat without attaching an item is not presented as `Use in chat`.

```ts
export function marketplaceTargets(catalog: CatalogResult, current: WorkbenchRoute, kind: MarketplaceWorkflowKind): MarketplaceWorkflowTargets {
  const workspaceNames = new Map(catalog.workspaces.map((workspace) => [workspace.id, workspace.name]));
  const namedProjects = catalog.projects.flatMap((project) => {
    const workspaceName = workspaceNames.get(project.workspaceId);
    return workspaceName ? [{ id: project.projectId, kind: "project" as const, label: project.name, contextLabel: `${workspaceName} / ${project.name}`, current: current.kind === "project" && current.workspaceId === project.workspaceId && current.projectId === project.projectId, compatible: true as const, compatibilityBasis: "project-target" as const }] : [];
  });
  const currentProject = current.kind === "project" ? namedProjects.find(({ id }) => id === current.projectId)?.contextLabel ?? null : null;
  if (kind === "template-target" || kind === "recipe-target" || kind === "component-target") return { workflow: kind, projectOptions: namedProjects, unavailableScopes: [], contextProjectLabel: null, targetUnavailableReason: namedProjects.length ? null : "No named project targets are available" };
  if (kind === "model-download") return { workflow: kind, projectOptions: [], unavailableScopes: [{ kind: "computer", label: "Computer/runtime", reason: "Computer and runtime targets cannot be enumerated by the current Desktop contract" }], contextProjectLabel: null, targetUnavailableReason: null };
  if (kind === "prompt-use") return { workflow: kind, projectOptions: [], unavailableScopes: [{ kind: "chat", label: "Chat", reason: "Chat targets cannot be enumerated or attached by the current Desktop contract" }], contextProjectLabel: null, targetUnavailableReason: null };
  if (kind === "skill-install") return { workflow: kind, projectOptions: [], unavailableScopes: [{ kind: "agent", label: "Agent", reason: "Agent targets and installation scopes cannot be enumerated by the current Desktop contract" }], contextProjectLabel: currentProject, targetUnavailableReason: null };
  return { workflow: kind, projectOptions: [], unavailableScopes: [], contextProjectLabel: null, targetUnavailableReason: "Update target is unavailable without persistent installed-version and local-modification state" };
}
```

- [ ] **Step 4: Run workflow/screen tests, typecheck, and build**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/marketplace-workflows.test.tsx tests/marketplace-my-library.test.tsx tests/marketplace-screen.test.tsx tests/marketplace-models.test.tsx && bun run typecheck && bun run build`

Expected: PASS and no unsupported action invokes IPC.

- [ ] **Step 5: Commit workflows and My Library**

```bash
git add src/screens/marketplace/MarketplaceWorkflows.tsx src/screens/marketplace/MarketplaceMyLibrary.tsx src/screens/MarketplaceScreen.tsx src/App.tsx src/styles/marketplace.css tests/marketplace-workflows.test.tsx tests/marketplace-my-library.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: add marketplace review workflows"
```

### Task 9: Complete operational states, responsive geometry, and accessibility

**Files:**
- Modify: `src/screens/MarketplaceScreen.tsx`
- Modify: `src/screens/marketplace/MarketplaceHeader.tsx`
- Modify: `src/screens/marketplace/MarketplaceBrowse.tsx`
- Modify: `src/screens/marketplace/MarketplaceModelViews.tsx`
- Modify: `src/screens/marketplace/MarketplacePublicItemDetail.tsx`
- Modify: `src/screens/marketplace/MarketplaceUnavailableViews.tsx`
- Modify: `src/screens/marketplace/MarketplaceWorkflows.tsx`
- Modify: `src/screens/marketplace/MarketplaceMyLibrary.tsx`
- Modify: `src/styles/marketplace.css`
- Create: `tests/marketplace-geometry.test.tsx`
- Modify: `tests/marketplace-screen.test.tsx`
- Modify: `tests/design-system.test.ts`

**Interfaces:**
- Consumes: all Tasks 1–8 states.
- Produces: loading, cache/offline, partial source failure, total source failure, no results, unavailable source, removed-source copy, preview failure, narrow menu, keyboard/focus model, reduced motion, and measured geometry for all 18 required frames.

- [ ] **Step 1: Write failing state and real Electron geometry tests**

```tsx
expect(offline).toContain("Offline · cached catalog");
expect(offline).toContain("Last refreshed");
expect(noResults).toContain("Clear filters");
expect(noResults).toContain("Clear query");
expect(sourceFailure).toContain("Results from healthy sources are still shown");
expect(unavailable).toContain("Last known source metadata is unavailable");
```

The Electron harness renders actual production components for required frames 1–17: Discover, mixed results, filtered category, no-results/partial-failure, Model detail, Model review, Template detail, Recipe detail, Prompt detail shell, Component detail shell, Skill detail shell, target chooser, My Library, Downloads, update/conflict review, collection shell, and offline/unavailable-source. Required frame 18 is the narrow measurement below, not a synthetic content state.

For every state measure four layouts: 1440×900 with 248px Marketplace sidebar; 1280×800 with sidebar fully hidden and category menu visible; 1440×900 with 336px chat panel; 1280×800 with 336px chat panel and sidebar hidden. Assert page/panels/portals have `scrollWidth <= clientWidth + 1`, one explicit vertical scroll owner, no clipped primary action, no autoplay, no untrusted HTML node, and no horizontal body scroll.

Use computed styles, not class-name inference: at 1440 assert Marketplace sidebar `display !== "none"` and rounded `getBoundingClientRect().width === 248`; at exactly 1280 assert sidebar `display === "none"` (or absent), `MarketplaceScreen` has `data-sidebar-visible="false"`, and the header category menu `display !== "none"`. Repeat with a manually hidden sidebar at 1440 to prove the menu follows actual sidebar visibility rather than a `max-width: 760px` query. Assert My Work still computes its persisted 288–420px sidebar independently.

Force `:focus-visible` on sidebar mode/category rows, search, filter, result, detail CTA, workflow close/choice/final action, and narrow category menu; every outline is at least 2px. Emulate `prefers-reduced-motion: reduce`; card/specimen transitions and animations resolve to `0s`/`none`. Assert semantic list/grid/progress/dialog roles, text category/status/trust labels, and focus restoration after detail/workflow close.

- [ ] **Step 2: Run state/geometry/design tests and verify RED**

Run: `VITE_RALPHY_ENABLE_MOCKS=true bun run test -- tests/marketplace-screen.test.tsx tests/marketplace-geometry.test.tsx tests/design-system.test.ts`

Expected: new state/geometry assertions fail before final CSS/behavior; only the recorded unrelated design-system failure may accompany them.

- [ ] **Step 3: Implement final states and responsive/a11y rules**

At viewport width `<= 1280px`, or whenever the user manually hides it, remove the Marketplace sidebar entirely; do not create an icon rail. Pass the computed visibility to `MarketplaceScreen` and keep the selected category in the page header menu whenever `data-sidebar-visible="false"`. The detail-column container query remains independent. Freeze live specimens/video hover under reduced motion, retain visible status text, wrap long IDs/licenses/file names, and keep workflow headers/footers fixed with one scrollable body.

```css
.marketplace-screen[data-sidebar-visible="false"] .marketplace-header-category-menu {
  display: inline-flex;
}
@container main-region (max-width: 760px) {
  .marketplace-detail-layout { grid-template-columns: minmax(0, 1fr); }
}
@media (prefers-reduced-motion: reduce) {
  .marketplace-screen *, .marketplace-screen *::before, .marketplace-screen *::after {
    animation-duration: 0s !important;
    transition-duration: 0s !important;
  }
}
```

- [ ] **Step 4: Run the complete Marketplace renderer regression set**

Run:

```bash
VITE_RALPHY_ENABLE_MOCKS=true bun run test -- \
  tests/marketplace-navigation.test.tsx \
  tests/marketplace-library.test.ts \
  tests/marketplace-presentation.test.ts \
  tests/marketplace-controller.test.ts \
  tests/marketplace-screen.test.tsx \
  tests/marketplace-models.test.tsx \
  tests/marketplace-public-details.test.tsx \
  tests/marketplace-unavailable-views.test.tsx \
  tests/marketplace-workflows.test.tsx \
  tests/marketplace-my-library.test.tsx \
  tests/marketplace-geometry.test.tsx \
  tests/workspace-navigation.test.tsx \
  tests/ipc-security.test.ts \
  tests/design-system.test.ts
```

Expected: all Marketplace assertions pass; only the recorded unrelated design-system font-weight baseline may fail in the combined command.

- [ ] **Step 5: Commit states, geometry, and accessibility**

```bash
git add src/screens/MarketplaceScreen.tsx src/screens/marketplace/MarketplaceHeader.tsx src/screens/marketplace/MarketplaceBrowse.tsx src/screens/marketplace/MarketplaceModelViews.tsx src/screens/marketplace/MarketplacePublicItemDetail.tsx src/screens/marketplace/MarketplaceUnavailableViews.tsx src/screens/marketplace/MarketplaceWorkflows.tsx src/screens/marketplace/MarketplaceMyLibrary.tsx src/styles/marketplace.css tests/marketplace-geometry.test.tsx tests/marketplace-screen.test.tsx tests/design-system.test.ts
gitleaks protect --staged --redact
git commit -m "feat: complete marketplace states"
```

### Task 10: Verify UX Testing Lab targets read-only

**Files:**
- Database read-only: `/Users/maximovchinnikov/.ralphy/ralphy.db`
- Report only: `.superpowers/sdd/2026-08-20-marketplace/task-10-db-report.md`

**Interfaces:**
- Consumes: schema-v9 workspace/project rows, released `workspace.list`/`project.list` bridge reads, UX Testing Lab workspace ID `ws_6afaf432-6794-400c-b50a-e8b640c20cd2`.
- Produces: evidence that chooser target names come from current contracts and that Marketplace needs no DB mocks/schema changes.

- [ ] **Step 1: Audit database integrity and target rows with query-only SQLite**

Run:

```bash
sqlite3 -readonly /Users/maximovchinnikov/.ralphy/ralphy.db "PRAGMA query_only=ON; PRAGMA integrity_check; PRAGMA foreign_key_check; SELECT max(version) AS schema_version FROM schema_migrations; SELECT id,slug,name,metadata_json FROM workspaces WHERE id='ws_6afaf432-6794-400c-b50a-e8b640c20cd2'; SELECT id,workspace_id,slug,name,state FROM projects WHERE workspace_id='ws_6afaf432-6794-400c-b50a-e8b640c20cd2' ORDER BY name,id; SELECT total_changes() AS writes;"
```

Expected: integrity `ok`, zero FK rows, schema 9, workspace name `UX Testing Lab` with `mock:true`, project rows returned, and `writes=0`.

- [ ] **Step 2: Verify the same names through the released bridge contract**

Run a one-shot Bun evaluation that constructs `RalphyBridgeClient` with root `/Users/maximovchinnikov/.ralphy`, calls `workspace.list({ limit: 50 })` and `project.list({ workspaceId: "ws_6afaf432-6794-400c-b50a-e8b640c20cd2", limit: 50 })`, prints only IDs/names, and closes the client in `finally`.

```bash
bun --eval 'import { RalphyBridgeClient } from "./electron/ralphy/client.ts"; const client = new RalphyBridgeClient({ root: "/Users/maximovchinnikov/.ralphy" }); try { await client.start(); const workspaces = await client.request("workspace.list", { limit: 50 }); const projects = await client.request("project.list", { workspaceId: "ws_6afaf432-6794-400c-b50a-e8b640c20cd2", limit: 50 }); console.log(JSON.stringify({ workspaces: workspaces.items.map(({ id, name }) => ({ id, name })), projects: projects.items.map(({ id, workspaceId, name }) => ({ id, workspaceId, name })) }, null, 2)); } finally { await client.close(); }'
```

Expected: bridge DTO names match the query-only audit and the chooser fixture expectations; no filesystem path is returned to renderer code.

- [ ] **Step 3: Prove Marketplace introduced no database write surface**

Run: `rg -n "sqlite|ralphy\.db|INSERT|UPDATE|DELETE|schema_migrations" electron/marketplace-library.ts src/screens/MarketplaceScreen.tsx src/screens/marketplace src/state/marketplace-controller.ts`

Expected: no DB access or SQL statement in Marketplace production files.

- [ ] **Step 4: Record the ruling without seeding**

The report records SQL/bridge results, exact workspace/project target names, `writes=0`, no schema change, and this ruling: public catalog state is global/provider-backed, while existing UX Testing Lab targets already cover chooser rendering, so deterministic fixtures belong only in tests and no Marketplace DB seed is authorized or required.

### Task 11: Verify and review the complete Marketplace handoff

**Files:**
- Modify only if verification exposes a defect in files already listed above.

**Interfaces:**
- Produces: one buildable Marketplace covering every required frame, using only truthful current-contract data/actions.

- [ ] **Step 1: Run focused and full verification**

Run:

```bash
VITE_RALPHY_ENABLE_MOCKS=true bun run test -- \
  tests/marketplace-navigation.test.tsx \
  tests/marketplace-library.test.ts \
  tests/marketplace-presentation.test.ts \
  tests/marketplace-controller.test.ts \
  tests/marketplace-screen.test.tsx \
  tests/marketplace-models.test.tsx \
  tests/marketplace-public-details.test.tsx \
  tests/marketplace-unavailable-views.test.tsx \
  tests/marketplace-workflows.test.tsx \
  tests/marketplace-my-library.test.tsx \
  tests/marketplace-geometry.test.tsx \
  tests/local-models-service.test.ts \
  tests/workspace-navigation.test.tsx \
  tests/ipc-security.test.ts \
  tests/design-system.test.ts
VITE_RALPHY_ENABLE_MOCKS=true bun run test
bun run typecheck
bun run build
git diff --check
```

Expected: all Marketplace tests pass; the full suite differs from green only by the two recorded unrelated baseline failures.

- [ ] **Step 2: Inspect all 18 handoff frames and category/action honesty**

Verify Discover, mixed results, filtered category, no-results/partial source failure, Model detail/review, Template detail, Recipe detail/copy, Prompt/Component/Skill detail shells, target chooser, My Library, Downloads, update/conflict, collection, offline/unavailable-source, and narrow behavior. Verify all six textual categories and type-specific actions; real production items exist only for Models/Templates/Recipes; every unsupported field/action has visible unavailable copy and no mutation call.

- [ ] **Step 3: Run branch and secret checks**

Let `MARKETPLACE_BASE` be the immutable SHA recorded before Task 1 and `MARKETPLACE_HEAD=$(git rev-parse HEAD)`. Run:

```bash
git status --short
git diff --stat "$MARKETPLACE_BASE".."$MARKETPLACE_HEAD"
git diff --check "$MARKETPLACE_BASE".."$MARKETPLACE_HEAD"
gitleaks protect --staged --redact
gitleaks git --log-opts="$MARKETPLACE_BASE..$MARKETPLACE_HEAD" --redact
```

Expected: no unrelated or generated files, clean range diff, no staged secrets, and no new range findings.

- [ ] **Step 4: Request final independent code review**

Review the full feature range against this plan, the three repository handoffs, and the prototype README. Fix every Critical/Important finding, rerun focused verification, and obtain a clean scoped re-review before declaring Marketplace complete.
