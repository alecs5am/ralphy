# Nothing Marketplace and Final Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Instrument rewrite across Marketplace and remaining overlays, remove all reachable legacy presentation, and prove real Electron geometry, security, UX Testing Lab database immutability, and bundled Core 0.3.0 launch behavior.

**Architecture:** Keep the current Marketplace navigation/controller/source adapters and render their exact capability states with the shared Instrument layer. Finish by deleting superseded chrome, enforcing source/build design guards, and driving the packaged Electron app through Chromium DevTools Protocol using Node's built-in `fetch`/`WebSocket`; no browser-test dependency or production debug IPC is added.

**Tech Stack:** Electron 43.2.0 with embedded Node 24.18.0, React 19, resolved TypeScript 5.9.3 (declared `^5.7.3`), Bun 1.3, Vitest 0.34.6, Motion, Radix Dialog/Select, Lucide React, current Marketplace/model services, `@types/node` 22-compatible built-ins, Chrome DevTools Protocol, macOS `stat`/`shasum`/`plutil`/`codesign`.

**Spec:** `docs/superpowers/specs/2026-08-20-nothing-os-redesign-design.md`

**Prerequisites:** Complete and review `docs/superpowers/plans/2026-08-20-nothing-foundation-shell.md` and `docs/superpowers/plans/2026-08-20-nothing-work-surfaces.md` before Task 1.

**Visual evidence:** `/tmp/ralphy-nothing-os.SYlRcI/design_handoff_instrument/README.md` and its final Instrument rules. Marketplace section `1b` is low-fidelity functional context only; final tokens, blocks, density, flatness, and responsive behavior come from sections `3a` / `3b` and the approved spec.

## Global Constraints

- Work only in `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/.worktrees/nothing-os-redesign` on `codex/nothing-os-redesign`; start after the reviewed Plan 2 acceptance gate.
- This is a presentation rewrite. Reuse the current Core v3 contract, Electron security boundary, readers, controllers, workbench/Marketplace reducers, media protocol, root fencing, MIME allowlists, clipboard bounds, and fixed Marketplace origins.
- Do not add a Core method, database migration, direct SQLite access, renderer filesystem access, renderer network access, sibling checkout import, prototype runtime, remote asset/font, or new package.
- Import the Plan 1 Instrument types/components exactly. Do not weaken or fork `Availability<T>`, theme, shell/right-rail portal, screen header, project dock, or Dynamic Island interfaces.
- Theme remains exactly `system | dark | light`. Light desk is `#E2E4EA`; dark desk is `#050505`; dark widgets are `#141414`; red `#E0362C` is only alert/rejection/destructive/live-recording semantics.
- App chrome is flat: no elevation shadow, blur, glass, inset highlight, decorative border, depth gradient, old purple accent, dark-only form `color-scheme`, or non-allowlisted hard-coded app palette literal.
- Geometry remains 8px outer padding/gap, 24px widgets, 999px pills/circles, 240px left stack, 292px right rail, and 1440x900/1280x800/1100x720 support with no horizontal body overflow.
- Each screen has one desk scroller, at most one dominant primary pill, and at most one red action. Detail columns stack at 760px measured desk width; portal content stays inside the viewport.
- Marketplace counts/state are truthful. Real production data are current provider/runtime Models and public-library schema-1 Templates/Recipes. Prompts, Components, Skills, Saved, Added, Downloads, Updates, Attention, and Forks are unavailable unless a current contract proves them.
- Local Models stays inside Marketplace. Installed inventory is the real Ollama/machine result. Target options come only from current `CatalogResult`; review flows remain non-mutating when the contract cannot persist.
- Provider/public content is untrusted. Preserve fixed-origin policies, safe controlled media, sanitized Markdown/prose, URL allowlists, and bounded clipboard behavior. No remote HTML/script/style execution.
- UX Testing Lab mock island data exists only in renderer mock builds, is absent from production bundles, routes only to existing screens, resets on root/workspace change, and never writes the database.
- Final acceptance uses `/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/dist/binaries/ralphy-darwin-arm64`; it must report exactly `0.3.0` and match the packaged manifest SHA-256.
- The live database `/Users/maximovchinnikov/.ralphy/ralphy.db` is read-only for acceptance. Record and compare its SHA-256, byte size, and nanosecond mtime around every real launch; never copy, vacuum, seed, migrate, or edit it.
- Use Bun. Every task follows RED to GREEN, receives an independent task review, runs `git diff --check`, stages only its files, runs `gitleaks protect --staged --redact`, and commits before the next task.

---

Before Task 1, record `NOTHING_POLISH_BASE=$(git rev-parse HEAD)` in the executor's progress notes. Do not commit those notes.

## Consumed Plan 1 Interfaces

Marketplace imports the locked superset rather than retaining its local availability type:

```ts
export type Availability<T> =
  | { status: "ready"; value: T }
  | { status: "partial"; value: T; reason: string }
  | { status: "empty"; reason: string }
  | { status: "unavailable"; reason: string }
  | { status: "error"; reason: string };

export interface InstrumentScreenHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  filters?: React.ReactNode;
  counters?: React.ReactNode;
  actions?: React.ReactNode;
}

export function InstrumentRightRailPortal(props: { children: React.ReactNode }): React.ReactPortal | null;
```

## File Map

- `src/screens/MarketplaceScreen.tsx` — existing controller lifecycle and route composition only.
- `src/screens/marketplace/MarketplaceHeader.tsx` — Instrument search/filter/category/health header.
- `src/screens/marketplace/MarketplaceBrowse.tsx` — Discover, results, categories, collection, loading/partial/error/empty states.
- `src/screens/marketplace/MarketplaceModelViews.tsx` — real provider Models, machine/Ollama inventory, detail and compatibility truth.
- `src/screens/marketplace/MarketplacePublicItemDetail.tsx` — Template/Recipe details and controlled media.
- `src/screens/marketplace/MarketplaceUnavailableViews.tsx` — unsupported category/detail/library/contribution states.
- `src/screens/marketplace/MarketplaceMyLibrary.tsx` — real Installed Models plus honest persistent-state gaps.
- `src/screens/marketplace/MarketplaceWorkflows.tsx` — current target chooser and non-mutating review flows.
- `scripts/audit-instrument-source.mjs` — static source/build policy guard.
- `scripts/audit-instrument-electron.mjs` — external CDP geometry/focus/style/screenshot runner; no application hook.

### Task 1: Rebuild Discover, search/results, categories, collection, and source states

**Files:**
- Modify: `src/screens/MarketplaceScreen.tsx`
- Modify: `src/screens/marketplace/MarketplaceHeader.tsx`
- Modify: `src/screens/marketplace/MarketplaceBrowse.tsx`
- Modify: `src/screens/marketplace/presentation.ts`
- Modify: `src/styles/marketplace.css`
- Test: `tests/marketplace-screen.test.tsx`
- Test: `tests/marketplace-presentation.test.ts`
- Test: `tests/marketplace-navigation.test.tsx`
- Test: `tests/marketplace-geometry.test.tsx`

**Interfaces:**
- Consumes: unchanged `MarketplaceController`, `MarketplaceLocation`, `MarketplaceQueryState`, source health/issues, current navigation memory/focus callbacks, and Plan 1 primitives/types.
- Produces: Instrument Discover, mixed results, category, collection, loading, refreshing, partial-source, full error, offline-equivalent, no-results, and removed-source states.

- [ ] **Step 1: Add failing Marketplace shell/state tests**

```tsx
expect(discover).toContain("Discover");
expect(discover).toContain('aria-label="Search Marketplace"');
expect(discover).toContain("Models");
expect(discover).toContain("Templates");
expect(discover).toContain("Recipes");
expect(partial).toContain("One source is unavailable");
expect(noResults).toContain("No results");
expect(error).toContain('role="alert"');
expect(marketplaceCss).not.toMatch(/box-shadow|backdrop-filter|linear-gradient|#8b7cf6/i);
```

Assert mode round-trip preserves route/query/filter/sort/selection/scroll/focus and that the workspace identity widget is absent in Marketplace.

- [ ] **Step 2: Run Marketplace shell tests and verify RED**

Run: `bun run test -- tests/marketplace-screen.test.tsx tests/marketplace-presentation.test.ts tests/marketplace-navigation.test.tsx tests/marketplace-geometry.test.tsx`

Expected: FAIL because Marketplace retains legacy layout and its own narrower `Availability` declaration.

- [ ] **Step 3: Compose current source truth with Instrument widgets**

```ts
import type { Availability } from "../../instrument/types";
```

Delete the route-local availability type. Use Instrument search/filter pills and source health reasons. Discover uses only real category counts when ready; unsupported counts render unavailable text and never a number. Results remain keyword relevance over current DTO fields. Collection renders current catalog content or a reasoned unavailable/empty state; it does not invent membership.

- [ ] **Step 4: Run GREEN checks and reviewer gate**

Run: `bun run test -- tests/marketplace-controller.test.ts tests/marketplace-screen.test.tsx tests/marketplace-presentation.test.ts tests/marketplace-navigation.test.tsx tests/marketplace-geometry.test.tsx && bun run typecheck && git diff --check`

Expected: suites pass; reviewer confirms every source/availability branch maps losslessly and mode/navigation memory is unchanged.

- [ ] **Step 5: Commit Marketplace browse surfaces**

```bash
git add src/screens/MarketplaceScreen.tsx src/screens/marketplace/MarketplaceHeader.tsx src/screens/marketplace/MarketplaceBrowse.tsx src/screens/marketplace/presentation.ts src/styles/marketplace.css tests/marketplace-screen.test.tsx tests/marketplace-presentation.test.ts tests/marketplace-navigation.test.tsx tests/marketplace-geometry.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: rebuild marketplace browse instruments"
```

### Task 2: Rebuild Models, machine compatibility, and Ollama inventory

**Files:**
- Modify: `src/screens/marketplace/MarketplaceModelViews.tsx`
- Modify: `src/screens/marketplace/MarketplaceBrowse.tsx`
- Modify: `src/styles/marketplace.css`
- Test: `tests/marketplace-models.test.tsx`
- Test: `tests/local-models-service.test.ts`

**Interfaces:**
- Consumes: existing provider search/detail, `LocalModelMachine`, real `installed` Ollama records, compatibility presentation, safe provider-open IPC, and exact loading/error/dispose behavior.
- Produces: Instrument Model cards/detail, hardware/runtime compatibility evidence, preview failure, gated/remote/downloaded/ready labels, machine inventory refresh, and explicit missing-contract action states.

- [ ] **Step 1: Add failing Model/inventory tests**

```tsx
expect(models).toContain("Models");
expect(detail).toContain("Compatibility");
expect(detail).toContain("Files");
expect(detail).toContain("License and access");
expect(installed).toContain("Installed on this computer");
expect(installed).toContain("Ollama");
expect(noRuntime).toContain("No compatible runtime detected");
expect(previewFailure).toContain("Provider preview unavailable");
expect(detail).not.toMatch(/Install now|Downloaded 1,000/i);
```

Cover loading/error/late completion, provider source, declared/unavailable license, compatibility evidence, insufficient memory/disk, machine refresh failure, gated source action, preview allowlist, and installed inventory.

- [ ] **Step 2: Run Model tests and verify RED**

Run: `bun run test -- tests/marketplace-models.test.tsx tests/local-models-service.test.ts`

Expected: FAIL on final Instrument classes/copy/layout.

- [ ] **Step 3: Implement truthful Model instruments**

```tsx
<InstrumentScreenHeader
  eyebrow="Marketplace"
  title={model.name}
  description={`${model.author} · ${model.task}`}
  counters={model.recommendedPackage.bytes === null ? undefined : <InstrumentCounter value={model.recommendedPackage.bytes} label="Bytes" />}
  actions={stateAwareAction}
/>
```

Use real provider/runtime/machine data only. Model detail sections show unavailable trust/license/backlink facts explicitly. The only real installed inventory is current machine/Ollama data. Download/install/update/use controls remain reasoned review states unless the current service actually supports the operation. Do not expose provider download counts as community rank or recommendation.

- [ ] **Step 4: Run GREEN checks and reviewer gate**

Run: `bun run test -- tests/marketplace-models.test.tsx tests/local-models-service.test.ts tests/marketplace-controller.test.ts && bun run typecheck && git diff --check`

Expected: suites pass; reviewer traces every displayed compatibility/state value to a current DTO field.

- [ ] **Step 5: Commit Model surfaces**

```bash
git add src/screens/marketplace/MarketplaceModelViews.tsx src/screens/marketplace/MarketplaceBrowse.tsx src/styles/marketplace.css tests/marketplace-models.test.tsx tests/local-models-service.test.ts
gitleaks protect --staged --redact
git commit -m "feat: rebuild marketplace model instruments"
```

### Task 3: Rebuild Template and Recipe details with controlled media

**Files:**
- Modify: `src/screens/marketplace/MarketplacePublicItemDetail.tsx`
- Modify: `src/screens/marketplace/presentation.ts`
- Modify: `src/styles/marketplace.css`
- Test: `tests/marketplace-public-details.test.tsx`
- Test: `tests/marketplace-library.test.ts`
- Test: `tests/marketplace-presentation.test.ts`

**Interfaces:**
- Consumes: validated schema-1 public DTOs, `marketplacePublicMediaKind`, current sanitized Markdown/prose, controlled CDN image/video URLs, bounded recipe clipboard action, and availability fields.
- Produces: Instrument Template/Recipe detail headers, sections, controlled previews, missing/failed media, copy feedback, and non-mutating target review entry.

- [ ] **Step 1: Add failing public-detail/security tests**

```tsx
expect(template).toContain("What it gives you");
expect(template).toContain("Use when");
expect(recipe).toContain("Parameters");
expect(recipe).toContain("Copy recipe artifact");
expect(missingMedia).toContain("preview is unavailable");
expect(untrustedUrl).not.toContain("<img");
expect(detail).not.toMatch(/verified publisher|audited|safe to install/i);
```

Cover template/recipe distinction, prompt-shaped Recipe staying a Recipe, before/after/poster/controlled video, missing media, image/video failure, inert artifact, exact copy, late copy status suppression, and Back focus.

- [ ] **Step 2: Run public-detail tests and verify RED**

Run: `bun run test -- tests/marketplace-public-details.test.tsx tests/marketplace-library.test.ts tests/marketplace-presentation.test.ts`

Expected: FAIL on Instrument detail selectors/semantics.

- [ ] **Step 3: Implement controlled Instrument details**

```tsx
const preview = marketplacePublicMediaKind(url);
return preview === "image"
  ? <img src={url} alt={label} loading="lazy" />
  : preview === "video"
    ? <video src={url} aria-label={label} controls preload="metadata" />
    : <InstrumentEmptyState title="Preview unavailable" reason="The current source did not provide an allowlisted preview." />;
```

Keep public content inert/sanitized and source identity distinct from publisher verification/audit/license. Use one dominant review/copy action per state. Video never autoplays with sound. Failed media exposes text/retry without changing allowlists.

- [ ] **Step 4: Run GREEN checks and security reviewer gate**

Run: `bun run test -- tests/marketplace-public-details.test.tsx tests/marketplace-library.test.ts tests/marketplace-presentation.test.ts tests/ipc-security.test.ts && bun run typecheck && git diff --check`

Expected: suites pass; reviewer confirms no raw HTML, arbitrary URL, filesystem path, renderer fetch, or unbounded clipboard value was introduced.

- [ ] **Step 5: Commit public details**

```bash
git add src/screens/marketplace/MarketplacePublicItemDetail.tsx src/screens/marketplace/presentation.ts src/styles/marketplace.css tests/marketplace-public-details.test.tsx tests/marketplace-library.test.ts tests/marketplace-presentation.test.ts
gitleaks protect --staged --redact
git commit -m "feat: rebuild marketplace public details"
```

### Task 4: Complete unavailable categories and My Library capability states

**Files:**
- Modify: `src/state/marketplace-navigation.ts`
- Modify: `src/instrument/InstrumentSidebar.tsx`
- Modify: `src/screens/marketplace/MarketplaceUnavailableViews.tsx`
- Modify: `src/screens/marketplace/MarketplaceMyLibrary.tsx`
- Modify: `src/styles/marketplace.css`
- Test: `tests/marketplace-unavailable-views.test.tsx`
- Test: `tests/marketplace-my-library.test.tsx`
- Test: `tests/marketplace-navigation.test.tsx`

**Interfaces:**
- Consumes: existing unsupported Prompt/Component/Skill detail shells, current installed inventory, Marketplace route persistence, and exact missing-contract reasons.
- Produces: `MarketplaceLibrarySection = "installed" | "saved" | "added" | "downloads" | "updates" | "attention" | "forks"`; Instrument unsupported detail/category/contribution states and My Library Installed/Saved/Added/Downloads/Updates/Attention/Forks.

- [ ] **Step 1: Add failing unsupported/library tests**

```tsx
expect(promptDetail).toContain("Prompt details unavailable");
expect(componentDetail).toContain("Component details unavailable");
expect(skillDetail).toContain("Skill details unavailable");
expect(library).toContain("Installed");
expect(library).toContain("Saved");
expect(library).toContain("Added");
expect(library).toContain("Downloads");
expect(library).toContain("Updates");
expect(library).toContain("Attention");
expect(library).toContain("Forks");
expect(library).not.toMatch(/Saved\s+0|Downloads\s+0|Updates\s+0/);
```

Assert persistence validation accepts `forks`, rejects unknown library sections, and every unsupported final action is focusable with `aria-disabled` plus `aria-describedby`.

- [ ] **Step 2: Run unsupported/library tests and verify RED**

Run: `bun run test -- tests/marketplace-unavailable-views.test.tsx tests/marketplace-my-library.test.tsx tests/marketplace-navigation.test.tsx`

Expected: FAIL because Forks is absent and unsupported/My Library views retain legacy presentation.

- [ ] **Step 3: Implement complete capability surfaces**

```ts
export type MarketplaceLibrarySection = "installed" | "saved" | "added" | "downloads" | "updates" | "attention" | "forks";
```

Keep Installed backed only by current Ollama inventory. Each other section renders one explicit unavailable widget naming the absent persistence/job/update/attention/fork contract; no zero count or sample row. Prompt/Component/Skill details keep complete structural sections so users understand the capability, but the final action remains disabled with its exact contract reason.

- [ ] **Step 4: Run GREEN checks and reviewer gate**

Run: `bun run test -- tests/marketplace-unavailable-views.test.tsx tests/marketplace-my-library.test.tsx tests/marketplace-navigation.test.tsx tests/marketplace-screen.test.tsx && bun run typecheck && git diff --check`

Expected: suites pass; reviewer confirms no unsupported state survives only in renderer memory and no enabled action is a no-op.

- [ ] **Step 5: Commit capability surfaces**

```bash
git add src/state/marketplace-navigation.ts src/instrument/InstrumentSidebar.tsx src/screens/marketplace/MarketplaceUnavailableViews.tsx src/screens/marketplace/MarketplaceMyLibrary.tsx src/styles/marketplace.css tests/marketplace-unavailable-views.test.tsx tests/marketplace-my-library.test.tsx tests/marketplace-navigation.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: complete marketplace capability states"
```

### Task 5: Rebuild target chooser and non-mutating review workflows

**Files:**
- Modify: `src/screens/marketplace/MarketplaceWorkflows.tsx`
- Modify: `src/screens/MarketplaceScreen.tsx`
- Modify: `src/styles/marketplace.css`
- Test: `tests/marketplace-workflows.test.tsx`
- Test: `tests/marketplace-public-details.test.tsx`
- Test: `tests/marketplace-models.test.tsx`

**Interfaces:**
- Consumes: current `CatalogResult.workspaces/projects`, type-specific item presentation, workflow opener/focus callbacks, and all current capability reasons.
- Produces: Instrument target chooser and Model download/Template add/Recipe review/unsupported review flows that never claim persistence.

- [ ] **Step 1: Add failing workflow truth/focus tests**

```tsx
expect(chooser).toContain("Choose a target");
expect(chooser).toContain("UX Testing Lab");
expect(chooser).toContain("Workspace · UX Testing Lab");
expect(chooser).toContain("Project · UX Tester");
expect(noCatalog).toContain("No target catalog is available");
expect(review).toContain("Review only");
expect(review).not.toMatch(/Added|Installed|Downloaded successfully/);
```

Assert options come only from supplied catalog, project labels include workspace, no chat/agent target is fabricated, Escape/outside close returns focus, dialogs fit 1100x720, and final unavailable controls are focusable/explanatory.

- [ ] **Step 2: Run workflow tests and verify RED**

Run: `bun run test -- tests/marketplace-workflows.test.tsx tests/marketplace-public-details.test.tsx tests/marketplace-models.test.tsx`

Expected: FAIL on Instrument workflow geometry/copy.

- [ ] **Step 3: Implement bounded review workflows**

```ts
const targets = [
  ...catalog.workspaces.map((workspace) => ({ id: `workspace:${workspace.id}`, label: `Workspace · ${workspace.name}` })),
  ...catalog.projects.map((project) => ({ id: `project:${project.workspaceId}:${project.projectId}`, label: `Project · ${project.name}` })),
];
```

Keep every workflow review-only unless an existing method performs the exact action. Selecting a target changes only dialog-local review state. The final control names the missing persistence/install/download/attachment contract and cannot emit fake success. Recipe clipboard copy remains the only allowed mutation here.

- [ ] **Step 4: Run GREEN checks and reviewer gate**

Run: `bun run test -- tests/marketplace-workflows.test.tsx tests/marketplace-public-details.test.tsx tests/marketplace-models.test.tsx tests/marketplace-screen.test.tsx && bun run typecheck && git diff --check`

Expected: suites pass; reviewer confirms target enumeration is exact and dialog-local selections do not leak into persisted application state.

- [ ] **Step 5: Commit workflows**

```bash
git add src/screens/marketplace/MarketplaceWorkflows.tsx src/screens/MarketplaceScreen.tsx src/styles/marketplace.css tests/marketplace-workflows.test.tsx tests/marketplace-public-details.test.tsx tests/marketplace-models.test.tsx
gitleaks protect --staged --redact
git commit -m "feat: rebuild marketplace review workflows"
```

### Task 6: Remove reachable legacy presentation and add strict design guards

**Files:**
- Create: `scripts/audit-instrument-source.mjs`
- Delete: `src/components/ContextSidebar.tsx`
- Delete: `src/components/Titlebar.tsx`
- Delete: `src/components/ProjectControls.tsx`
- Delete: `src/components/ProjectHeader.tsx`
- Delete: `src/styles/app.css`
- Delete: `src/styles/workbench.css`
- Delete: `src/styles/workspace-overview.css`
- Modify: `src/main.tsx`
- Modify: `package.json`
- Modify: `src/styles/instrument.css`
- Modify: `src/styles/work-surfaces.css`
- Modify: `src/styles/marketplace.css`
- Modify: `src/styles/settings.css`
- Modify: `src/styles/shared-library.css`
- Modify: `src/styles/terminal.css`
- Test: `tests/instrument-design-guards.test.ts`
- Test: `tests/design-system.test.ts`

**Interfaces:**
- Consumes: completed Instrument routes and Vite build output.
- Produces: `bun run audit:instrument:source`; `auditInstrumentSource({ root, mocks }): { files: string[]; violations: AuditViolation[] }`; a zero-reachability legacy graph; selector-aware guards for forbidden effects/colors/assets/fonts/prototype files and one explicit literal allowlist for content/security/traffic-light/status needs.

- [ ] **Step 1: Add failing source/build design guards**

```ts
expect(importGraph).not.toMatch(/ContextSidebar|MainHeader|ProjectControls|ProjectHeader/);
expect(auditInstrumentSource({ root: repoRoot, mocks: false }).violations).toEqual([]);
expect(tokens).toMatch(/html\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark/i);
expect(distFiles).not.toMatch(/support\.js|lucide-sprite|\.dc\.html|fonts\.googleapis/i);
expect(distText).not.toContain("ux-mock-render-1");
```

The literal allowlist is exact: spec palette values, macOS traffic lights `#ED6A5E/#F0B544/#5CC45C`, `transparent`, content scrims, provider/model brand SVGs, and security allowlist URLs already in `index.html`. Every other reachable CSS/TSX color literal fails with file/line/value.

- [ ] **Step 2: Run guards and verify RED**

Run: `VITE_RALPHY_ENABLE_MOCKS=false bun run build && bun run test -- tests/instrument-design-guards.test.ts tests/design-system.test.ts`

Expected: FAIL on old component imports/files, legacy CSS effects/tokens, and missing audit script/package command.

- [ ] **Step 3: Delete superseded files and implement the audit**

```js
function forbiddenDeclaration({ file, selector, property, value }) {
  const normalized = value.trim().toLowerCase();
  if (property === "color-scheme") {
    return normalized === "dark" && selector.trim() !== 'html[data-theme="dark"]'
      ? `${file}: dark-only color-scheme outside the resolved theme root`
      : null;
  }
  if (property === "box-shadow" && normalized !== "none") return `${file}: elevation/inset shadow`;
  if (property === "backdrop-filter") return `${file}: backdrop filter`;
  if (property === "filter" && /blur\s*\(/i.test(normalized)) return `${file}: blur filter`;
  if (/(?:linear|radial)-gradient\s*\(/i.test(normalized)) return `${file}: gradient`;
  return null;
}
```

Build the reachable module list recursively from `src/main.tsx`, following both static relative imports and relative `import()` edges; evaluate the one `VITE_RALPHY_ENABLE_MOCKS` branch as `false`, so the mock-only module is excluded and every other lazy screen remains included. Scan production-reachable CSS/TSX and `dist`. Parse selector/declaration pairs so `color-scheme: dark` is allowed only on `html[data-theme="dark"]`; reject shadow/blur/gradient declarations everywhere, using borders/outlines and solid pseudo-element content scrims instead. Delete the four superseded components and three superseded styles after `rg` proves no import. The color-literal allowlist is keyed by exact file, selector, property, and value; app-chrome depth is never allowlisted. Add `"audit:instrument:source": "node scripts/audit-instrument-source.mjs"`.

- [ ] **Step 4: Run GREEN guards and broad regression review**

Run: `VITE_RALPHY_ENABLE_MOCKS=false bun run build && bun run audit:instrument:source && bun run test -- tests/instrument-design-guards.test.ts tests/design-system.test.ts && bun run typecheck && git diff --check`

Expected: guard prints `INSTRUMENT_SOURCE_AUDIT_OK`; suites/typecheck/build pass; `dist` excludes mock IDs/prototype runtime/remote fonts; reviewer confirms every deleted file has no live consumer.

- [ ] **Step 5: Commit legacy removal and guards**

```bash
git add -A -- scripts/audit-instrument-source.mjs src/components/ContextSidebar.tsx src/components/Titlebar.tsx src/components/ProjectControls.tsx src/components/ProjectHeader.tsx src/styles/app.css src/styles/workbench.css src/styles/workspace-overview.css src/main.tsx package.json src/styles/instrument.css src/styles/work-surfaces.css src/styles/marketplace.css src/styles/settings.css src/styles/shared-library.css src/styles/terminal.css tests/instrument-design-guards.test.ts tests/design-system.test.ts
gitleaks protect --staged --redact
git commit -m "refactor: remove legacy workbench presentation"
```

### Task 7: Prove real Electron geometry, DB immutability, and bundled Core 0.3.0

**Files:**
- Create: `scripts/audit-instrument-electron.mjs`
- Modify: `package.json`
- Modify: `scripts/smoke-electron.mjs`
- Modify: `scripts/package-mac.mjs`
- Test: `tests/instrument-electron-audit.test.ts`
- Test: `tests/bundled-core.test.ts`

**Interfaces:**
- Consumes: packaged `release/Ralphy Media.app`, existing package/smoke/Core-manifest helpers, external Chromium DevTools Protocol, and the completed production UI. It adds no app IPC or renderer testing hook.
- Produces: `bun run audit:instrument:electron`, JSON/screenshot evidence under ignored `.superpowers/sdd/nothing-instrument-electron/`, and explicit `INSTRUMENT_ELECTRON_AUDIT_OK 24` output.

- [ ] **Step 1: Write failing audit-runner unit tests**

```ts
expect(auditCases()).toHaveLength(24);
expect(auditCases().map(({ width, height }) => `${width}x${height}`)).toEqual(expect.arrayContaining(["1440x900", "1280x800", "1100x720"]));
expect(assertGeometry({ bodyScrollWidth: 1100, innerWidth: 1100, scrollOwners: 1, dockReachable: true })).toBeUndefined();
expect(() => assertGeometry({ bodyScrollWidth: 1101, innerWidth: 1100, scrollOwners: 1, dockReachable: true })).toThrow(/horizontal overflow/i);
expect(readCoreManifest(validApp)).toMatchObject({ version: "0.3.0" });
```

Cover CDP timeout/cleanup, style/focus failures, portal overflow, expected rail behavior at each width, mock visibility expectation, Core SHA mismatch, and before/after DB fingerprint mismatch.

- [ ] **Step 2: Run audit tests and verify RED**

Run: `bun run test -- tests/instrument-electron-audit.test.ts tests/bundled-core.test.ts`

Expected: FAIL because the external Electron audit runner and package command do not exist.

- [ ] **Step 3: Implement the no-dependency external CDP audit**

```js
export const VIEWPORTS = [[1440, 900], [1280, 800], [1100, 720]];
export const THEMES = ["light", "dark"];
export const PANEL_CASES = [
  { left: true, right: true, bottom: false },
  { left: false, right: true, bottom: false },
  { left: true, right: false, bottom: true },
  { left: false, right: false, bottom: true },
];
export function auditCases() {
  return VIEWPORTS.flatMap(([width, height]) => THEMES.flatMap((theme) => PANEL_CASES.map((panels) => ({ width, height, theme, panels }))));
}
```

The script chooses an unused loopback debugging port, spawns the packaged executable with `--remote-debugging-port=<port>`, connects using built-in `fetch`/`WebSocket`, gets the native window with `Browser.getWindowForTarget`, applies each size using `Browser.setWindowBounds`, and drives theme/panel controls through accessible DOM selectors. For every case, use `Runtime.evaluate` and `Page.captureScreenshot` to assert:

- exact native `innerWidth/innerHeight`, no horizontal body overflow, one visible desk scroll owner;
- expected left/right/bottom visibility (1100 auto-collapses right without rewriting its preference; 1280 keeps it only when desk >=680px);
- desk/rail widths, 8px gaps, top-row 48px, dock bounds/reachability/no rail overlap, detail stacking at <=760px desk width;
- portals inside viewport, visible 2px keyboard focus, `color-scheme` matching forced theme;
- computed app-chrome `boxShadow === "none"`, no backdrop filter, no depth background image;
- mock island active task/three stable notifications only when `RALPHY_EXPECT_MOCKS=true` and the script selects `[data-workspace-name="UX Testing Lab"]`.

Use `try/finally` to close CDP, terminate the app, and preserve failure evidence. Add `"audit:instrument:electron": "node scripts/audit-instrument-electron.mjs"`. Keep `smoke-electron.mjs` compatible with the new opaque window; make `package-mac.mjs` reject any bundled Core version other than `0.3.0` for this release.

- [ ] **Step 4: Run production/mock packages, geometry, DB fingerprint, and final reviews**

First prove the core input:

```bash
CORE_BIN=/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/dist/binaries/ralphy-darwin-arm64
test "$($CORE_BIN --version)" = "0.3.0"
```

Fingerprint the live DB without opening it through SQLite:

```bash
DB=/Users/maximovchinnikov/.ralphy/ralphy.db
AUDIT_DIR=$(mktemp -d /tmp/ralphy-nothing-db-audit.XXXXXX)
shasum -a 256 "$DB" > "$AUDIT_DIR/before.sha256"
stat -f '%Fm %Fc %z' "$DB" > "$AUDIT_DIR/before.stat"
```

Build/package mock mode, audit all 24 cases with UX fixture visible, and verify packaged Core:

```bash
VITE_RALPHY_ENABLE_MOCKS=true RALPHY_CORE_BIN="$CORE_BIN" bun run package:mac
RALPHY_EXPECT_MOCKS=true RALPHY_PACKAGED_APP='release/Ralphy Media.app' bun run audit:instrument:electron
bun run smoke:packaged
test "$(plutil -extract CFBundleShortVersionString raw 'release/Ralphy Media.app/Contents/Info.plist')" = "0.1.0"
test "$('release/Ralphy Media.app/Contents/Resources/bin/ralphy' --version)" = "0.3.0"
```

Build/package production mode, prove fixture strings/data are absent, audit all 24 cases without mock island data, and smoke again:

```bash
VITE_RALPHY_ENABLE_MOCKS=false RALPHY_CORE_BIN="$CORE_BIN" bun run package:mac
bun run audit:instrument:source
! rg -a 'ux-mock-render-1|ux-mock-review|ux-mock-complete|ux-mock-error' dist 'release/Ralphy Media.app/Contents/Resources/app/dist'
RALPHY_EXPECT_MOCKS=false RALPHY_PACKAGED_APP='release/Ralphy Media.app' bun run audit:instrument:electron
bun run smoke:packaged
codesign --verify --deep --strict --verbose=2 'release/Ralphy Media.app'
```

Compare the live DB fingerprint:

```bash
shasum -a 256 "$DB" > "$AUDIT_DIR/after.sha256"
stat -f '%Fm %Fc %z' "$DB" > "$AUDIT_DIR/after.stat"
cmp "$AUDIT_DIR/before.sha256" "$AUDIT_DIR/after.sha256"
cmp "$AUDIT_DIR/before.stat" "$AUDIT_DIR/after.stat"
```

Expected: both audits print `INSTRUMENT_ELECTRON_AUDIT_OK 24`; packaged Core and manifest report 0.3.0 with matching SHA; production bundle contains no mock IDs; smoke/codesign pass; both `cmp` commands exit 0, proving database bytes and mtime/change-time/size are unchanged. Run independent product, accessibility/visual, security, and final regression reviews over the complete three-plan diff and audit evidence.

- [ ] **Step 5: Run final full suite and commit the audit harness**

Run: `bun run test && bun run typecheck && VITE_RALPHY_ENABLE_MOCKS=false bun run build && bun run audit:instrument:source && git diff --check`

Expected: all tests pass or only a baseline failure recorded before Plan 1 remains; typecheck/build/source audit pass; final production package is the mock-free Core 0.3.0 build.

```bash
git add scripts/audit-instrument-electron.mjs scripts/smoke-electron.mjs scripts/package-mac.mjs package.json tests/instrument-electron-audit.test.ts tests/bundled-core.test.ts
gitleaks protect --staged --redact
git commit -m "test: verify instrument electron release"
```

## Plan 3 Acceptance Gate

Run:

```bash
bun run test
bun run typecheck
VITE_RALPHY_ENABLE_MOCKS=false bun run build
bun run audit:instrument:source
git diff --check "$NOTHING_POLISH_BASE"..HEAD
git log --oneline "$NOTHING_POLISH_BASE"..HEAD
```

Expected: complete green regression gate, production mock exclusion, no reachable legacy chrome/effects/colors, and seven scoped implementation commits. Preserve the final `.superpowers/sdd/nothing-instrument-electron/` JSON/contact-sheet evidence outside Git for handoff; do not commit live DB material, packaged binaries, screenshots, user data, or prototype files.
