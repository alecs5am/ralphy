# Desktop Domain Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Desktop's path-scanned media library with the installed core bridge and present Workspaces, Projects, Documents, Media revisions, Compositions/Builds, Units/platforms, publications, metrics, working files, feedback, and activity as first-class entities.

**Architecture:** Electron main owns one root-bound `ralphy bridge --stdio` child and translates its explicit success/error envelopes into typed IPC. The renderer stores stable entity/revision IDs only, requests scoped locators for previews through main, and reuses the existing workbench/viewers/chat/terminal shell while deleting the scanner, watcher, local annotations, and app-owned credential store.

**Tech Stack:** Electron, React, TypeScript, Vite, Vitest, Node child processes/streams, existing CSS/media viewers

## Global Constraints

- Complete and release the core entity CLI/bridge before implementing this plan.
- Preserve the current dirty Desktop chat, terminal, settings, design-system, and media-viewer work; it is the implementation baseline, not disposable output.
- Do not open `.ralphy/ralphy.db`, import sibling core source, call Postiz directly, or derive domain identity from paths.
- Renderer state and IPC inputs contain stable IDs, never absolute paths. Electron main alone may receive a validated locator from core.
- IPC errors use explicit `{ ok: false, error: { code, message, details? } }` envelopes because Electron does not preserve custom error fields on rejected invokes.
- Never automatically retry mutations after `E_CONFLICT`; reload and show the user what changed.
- Cache/temp/diagnostic files remain visible through filters and Run context.
- Reuse the existing virtual grid, image/video/audio viewers, Markdown renderer, chat/terminal shell, layout, and design tokens.
- Add no client query/state framework; page loaders plus one monotonic activity sequence are sufficient.
- Desktop never persists or retrieves stored provider secret values after migration.
- Use Bun for package operations and keep repository files/commits English-only.

---

### Task 1: Stabilize and checkpoint the existing Desktop WIP

**Files:**
- Modify: the ten current tests that import `bun:test` under Vitest
- Preserve: all current tracked/untracked Desktop WIP shown by `git status --short`

**Interfaces:**
- Consumes: branch `feat/electron-media-workbench` with its existing agent/chat/terminal/settings work
- Produces: one tested baseline commit from which domain integration can safely proceed

- [ ] **Step 1: Record the exact WIP inventory before editing**

Run:

```bash
git status --short
git diff --stat
fd -t f . electron/agent electron/claude electron/terminal src/chat src/terminal tests
```

Expected: the inventory includes the current 76 dirty entries, especially `electron/main.ts`, `electron/media/types.ts`, `electron/preload.ts`, `src/App.tsx`, `src/lib/ipc.ts`, `src/styles/workbench.css`, and the untracked chat/terminal modules.

- [ ] **Step 2: Make the current test runner load every suite**

Replace `from "bun:test"` with `from "vitest"` only in Desktop Vitest tests. Do not change runtime code or switch test runners.

Run: `bun run typecheck && bun run test`

Expected: typecheck passes and all suites load; zero suite-load errors remain.

- [ ] **Step 3: Review the complete checkpoint diff**

Run `git diff --check`, targeted no-Cyrillic search across changed source/docs, and `gitleaks protect --staged --redact` after staging. Inspect staged filenames against the Step 1 inventory; do not include build/release output or local credentials.

- [ ] **Step 4: Commit the preserved baseline**

```bash
git add AGENTS.md package.json bun.lock electron public scripts src tests docs
git status --short
git commit -m "feat(desktop): checkpoint agent media workbench"
```

Expected: the commit contains the intended existing WIP, tests are green, and the working tree has no omitted source file from the inventory.

### Task 2: Add the long-lived typed Ralphy bridge client

**Files:**
- Create: `electron/ralphy/types.ts`
- Create: `electron/ralphy/client.ts`
- Create: `electron/ralphy/session.ts`
- Test: `tests/ralphy-client.test.ts`
- Test: `tests/ralphy-session.test.ts`

**Interfaces:**
- Consumes: installed `RALPHY_BIN || "ralphy"` and core protocol v1
- Produces: `RalphyBridgeClient` and one active-root `RalphySession`

```ts
export class RalphyBridgeClient {
  constructor(options: { bin?: string; root: string; env?: NodeJS.ProcessEnv });
  start(): Promise<BridgeHello>;
  request<M extends BridgeMethod>(method: M, params: ParamsFor<M>): Promise<ResultFor<M>>;
  onEvent(listener: (event: BridgeEvent) => void): () => void;
  close(): Promise<void>;
}
```

- [ ] **Step 1: Write a fake bridge fixture and failing concurrent-request test**

The fixture reads JSONL stdin and deliberately answers requests out of order. Assert two concurrent calls resolve by request ID, an activity event reaches listeners, stderr is kept out of the JSON parser, and `close()` rejects pending requests with `E_BRIDGE_CLOSED`.

- [ ] **Step 2: Implement line parsing and request correlation**

Spawn `[bin, "bridge", "--stdio", "--root", root]` with piped stdio. Assign `crypto.randomUUID()` request IDs, retain one deferred promise per ID, parse newline-delimited responses/events, cap a buffered line at 1 MiB, and reject all pending calls on process exit. Never replay a mutation automatically.

- [ ] **Step 3: Enforce handshake compatibility**

`start()` waits for `system.hello`, requires protocol `1`, records core/schema versions and capabilities, and rejects mismatches with a user-actionable upgrade error. Do not send domain requests before hello succeeds.

- [ ] **Step 4: Add active-root session replacement**

`RalphySession.open(root)` starts the new client and confirms hello before closing the prior client. If the new root fails, retain the prior working session. Serialize root changes so a slower earlier open cannot replace a newer selection.

- [ ] **Step 5: Verify and commit the client**

Run: `bun run test -- tests/ralphy-client.test.ts tests/ralphy-session.test.ts && bun run typecheck`

```bash
git add electron/ralphy tests/ralphy-client.test.ts tests/ralphy-session.test.ts
git commit -m "feat(desktop): connect to the ralphy bridge"
```

### Task 3: Replace path scanner IPC with stable domain DTOs and locators

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/media/types.ts`
- Modify: `electron/media/protocol-access.ts`
- Modify: `src/lib/ipc.ts`
- Modify: `src/state/workbench.ts`
- Modify: `src/lib/media.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/AssetTile.tsx`
- Modify: `src/components/Inspector.tsx`
- Modify: `src/components/media/AssetContent.tsx`
- Modify: `src/lib/agent-feedback.ts`
- Test: `tests/protocol-access.test.ts`
- Test: `tests/workbench-state.test.ts`
- Test: `tests/media-query.test.ts`

**Interfaces:**
- Consumes: `media.list`, `media.review`, and `locator.resolve`
- Produces: renderer-safe `MediaCard`, `MediaReview`, and explicit IPC result envelopes

```ts
export interface MediaCard {
  id: string;
  artifactId: string | null;
  artifactRevisionId: string | null;
  runObjectId: string | null;
  target: { type: "object" | "run-object"; id: string };
  name: string;
  kind: MediaKind;
  mime: string;
  bytes: number;
  createdAt: string;
  lifecycle: string;
  usageRoles: string[];
  storageClass: "durable" | "cache" | "temp";
  review: MediaReview | null;
}
```

- [ ] **Step 1: Write failing DTO and locator authorization tests**

Assert renderer-visible cards contain no `absolutePath`/`projectRelativePath`; preview IPC accepts only `{ target, range? }`; main calls `locator.resolve(..., purpose: "preview")`; cross-root IDs return an explicit core error; valid byte ranges retain current streaming behavior.

- [ ] **Step 2: Wire bridge requests into Electron main and preload**

Replace `MediaWorkerClient`/`MediaSessionState` registration with one `RalphySession`. IPC methods return:

```ts
type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };
```

Main resolves locators immediately before Finder/open/drag/preview actions and never caches an absolute path across root changes.

- [ ] **Step 3: Move reviews to core entities**

Delete local annotation writes. Map Unreviewed to no state, Shortlist to Artifact `candidate`, Approved to `approved`, Reject to `rejected`, and Needs Work to open feedback. Send optimistic review version; keep favorite/rating/tags/notes in evaluation/feedback metadata returned by `media.review`.

- [ ] **Step 4: Replace agent copy payloads**

`Copy for Agent` emits stable IDs and commands such as `ralphy artifact show <artifact-id> --project <project-id> --json`; it never copies an absolute path as identity.

- [ ] **Step 5: Verify and commit the stable media boundary**

Run: `bun run test -- tests/protocol-access.test.ts tests/workbench-state.test.ts tests/media-query.test.ts && bun run typecheck`

```bash
git commit -m "refactor(desktop): use stable media entities"
```

### Task 4: Build Workspace/Project overview, Documents, Media, and Activity surfaces

**Files:**
- Modify: `src/screens/LibraryScreen.tsx`
- Modify: `src/screens/WorkspaceScreen.tsx`
- Modify: `src/screens/ProjectScreen.tsx`
- Modify: `src/components/ProjectHeader.tsx`
- Modify: `src/components/ProjectControls.tsx`
- Modify: `src/components/ContextSidebar.tsx`
- Create: `src/screens/project/ProjectOverview.tsx`
- Create: `src/screens/project/DocumentsPanel.tsx`
- Create: `src/screens/project/MediaPanel.tsx`
- Create: `src/screens/project/ActivityPanel.tsx`
- Modify: `src/styles/workbench.css`
- Test: `tests/project-domain-navigation.test.tsx`
- Test: `tests/documents-panel.test.tsx`

**Interfaces:**
- Consumes: Workspace/Project overview, Document, media, feedback, and activity bridge methods
- Produces: tabs `Overview`, `Documents`, `Media`, `Compositions`, `Units`, `Activity`

- [ ] **Step 1: Write failing navigation and overview tests**

Render a fixture Workspace/Project and assert the six tabs, current Iteration, open feedback, changed-since-prior summary, operating Document revisions, Composition/Build summaries, Unit/publication/metric summaries, working files, and recent activity are visible. Assert `Finals`, `Assets`, `Refs`, and `Files` are absent as peer tabs.

- [ ] **Step 2: Implement Workspace and Project loaders**

Workspace overview shows social accounts/public identity, current Documents, shared media/references, Projects, recent Units/publications, and aggregate metrics. Project overview shows current Iteration, purpose, feedback, prior-Iteration changes, exact Document bindings, Compositions/Builds, Units/distribution, working/RunObjects, and activity.

- [ ] **Step 3: Implement Document revision viewing and editing**

List kind/title/current revision and binding context. Use the existing Markdown renderer for Markdown, `<pre>` for formatted JSON/text, a normal `<textarea>` for edits, and `document.revise` with `expectedRevisionId`. On conflict, keep the user's draft locally, reload current revision, and present both versions without overwriting.

- [ ] **Step 4: Implement Media filters without hiding evidence**

Filters are References, Working, Candidate, Approved, Rejected, Superseded, Run diagnostics, Cache/temp, and Advanced Objects. A RunObject card shows Run/attempt, purpose, state, retention, and promotion target.

- [ ] **Step 5: Subscribe to monotonic activity**

After hello call `activity.subscribe({ since: lastSequence })`. Detect a sequence gap, fetch `activity.list`, then update one app-level `activitySequence` used as a refresh token by active loaders. Do not install a query library.

- [ ] **Step 6: Verify and commit core navigation**

Run: `bun run test -- tests/project-domain-navigation.test.tsx tests/documents-panel.test.tsx && bun run typecheck`

```bash
git commit -m "feat(desktop): add domain project overview"
```

### Task 5: Present Composition revision history with nested Builds

**Files:**
- Create: `src/screens/project/CompositionsPanel.tsx`
- Create: `src/lib/compositions.ts`
- Test: `tests/composition-view.test.tsx`

**Interfaces:**
- Consumes: `composition.list/show/revise/build/select` and media preview by output target
- Produces: one Composition aggregate containing revisions and nested Builds/outputs

- [ ] **Step 1: Write failing format-label and switching tests**

```ts
expect(buildLabel("video")).toBe("Render");
expect(buildLabel("carousel")).toBe("Export");
expect(buildLabel("sticker-pack")).toBe("Pack build");
```

Render HyperFrames v1 and Remotion v2 of one Composition, switch selected revision to v1, and assert its exact Build/output preview appears without changing history.

- [ ] **Step 2: Implement pure display helpers**

`src/lib/compositions.ts` sorts immutable revisions/builds/outputs, formats engine/version/state, and maps kind to the three UI labels above. Keep these helpers independent of React for direct Vitest coverage.

- [ ] **Step 3: Implement the panel and optimistic mutations**

Show kind, selected/head revision, parent, Iteration, engine/version, draft/sealed state, source/input summary, Builds with profile/status/error, evaluations, and output previews. `revise`, `build`, and `select` include expected IDs. `E_CONFLICT` reloads and shows a non-destructive conflict banner.

- [ ] **Step 4: Verify and commit Compositions**

Run: `bun run test -- tests/composition-view.test.tsx && bun run typecheck`

```bash
git add src/screens/project/CompositionsPanel.tsx src/lib/compositions.ts tests/composition-view.test.tsx
git commit -m "feat(desktop): show composition builds and revisions"
```

### Task 6: Present flexible Units and platform-specific publication previews

**Files:**
- Create: `src/screens/project/UnitsPanel.tsx`
- Create: `src/components/unit/PlatformPreview.tsx`
- Create: `src/lib/unit-preview.ts`
- Test: `tests/unit-preview.test.tsx`

**Interfaces:**
- Consumes: `unit.list/show/revise/select`, `publication.publish/refresh`, and stable media targets
- Produces: ordered heterogeneous Unit revisions and TikTok/Reels/Shorts-specific preview models

- [ ] **Step 1: Write failing multi-item and shared-video tests**

Assert a 32-sticker Telegram pack and eight-image Instagram carousel retain order. Assert one video Artifact revision with TikTok, Instagram Reels, and YouTube Shorts presentations renders three different platform chrome/caption/safe-area views while retaining one Unit ID.

- [ ] **Step 2: Implement pure platform preview mapping**

`buildPlatformPreview(unit, platform)` returns platform name, ordered media, cover, crop, safe-area overlay, caption/title, and platform options. It does not duplicate media or infer platform from file paths.

- [ ] **Step 3: Implement Unit history and distribution state**

Show Unit revisions, ordered item roles/types, presentation overrides, selected revision, Publication attempt history, Postiz state/URL/error/timestamps, and immutable Metric snapshots. Publish/refresh calls core only; Desktop never calls Postiz.

- [ ] **Step 4: Verify and commit Units**

Run: `bun run test -- tests/unit-preview.test.tsx && bun run typecheck`

```bash
git add src/screens/project/UnitsPanel.tsx src/components/unit/PlatformPreview.tsx src/lib/unit-preview.ts tests/unit-preview.test.tsx
git commit -m "feat(desktop): add unit platform previews"
```

### Task 7: Move agent credentials and execution behind the core bridge

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/agent/request.ts`
- Modify: `src/chat/useAgentChat.ts`
- Modify: `src/screens/SettingsScreen.tsx`
- Modify: `electron/terminal/manager.ts`
- Delete: `electron/claude/credentials.ts`
- Modify: `tests/agent-bridge.test.ts`
- Modify: `tests/claude-credentials.test.ts`
- Test: `tests/agent-core-session.test.ts`

**Interfaces:**
- Consumes: core `agent.*` and `migration.secret.import` bridge methods plus current normalized `AgentChatEvent`
- Produces: bridge-owned agent turns, write-only credentials, and stable Workspace/Project chat context

- [ ] **Step 1: Write failing secret-ownership tests**

Assert Settings sends credential values once to `agent.credential.set`, never reads them back, and stores only `{ configured: true }`. Assert no `claude-api-key.bin`, `openrouter-api-key.bin`, or Electron `safeStorage` write occurs for new credentials.

- [ ] **Step 2: Route agent turns through core**

Preserve the existing normalized chat event DTO, but `useAgentChat` calls `agent.turn.start` with stable Workspace/Project/Agent Session IDs and listens for bridge `agent` events. Stop uses `agent.turn.stop`. Core launches the process and injects secrets; Electron does not.

- [ ] **Step 3: Migrate existing Electron secrets and chat preferences**

On first v2 bridge connection, Electron decrypts its own old safeStorage blobs in memory and sends each value once through `migration.secret.import`; after success it moves the exact old file to a migration recovery location instead of deleting it. Export non-secret localStorage chat/settings state as typed data for core import, then mark migration complete.

- [ ] **Step 4: Bind terminals to the canonical bridge root**

Replace `validateLibraryRoot` scanner dependency with the root confirmed by `system.hello`. Terminal working directories may be resolved debug/export/checkouts from core but never define domain identity.

- [ ] **Step 5: Verify and commit agent ownership**

Run: `bun run test -- tests/agent-bridge.test.ts tests/claude-credentials.test.ts tests/agent-core-session.test.ts && bun run typecheck`

```bash
git add electron/main.ts electron/agent/request.ts src/chat/useAgentChat.ts src/screens/SettingsScreen.tsx electron/terminal/manager.ts tests/agent-bridge.test.ts tests/claude-credentials.test.ts tests/agent-core-session.test.ts
git add -u electron/claude/credentials.ts
git commit -m "refactor(desktop): move agent secrets into core"
```

### Task 8: Remove the scanner stack and path-derived taxonomy

**Files:**
- Delete: `electron/media/catalog.ts`
- Delete: `electron/media/project-scanner.ts`
- Delete: `electron/media/worker.ts`
- Delete: `electron/media/watcher.ts`
- Delete: `electron/media/annotations.ts`
- Simplify: `electron/media/session.ts`
- Delete: `tests/catalog.test.ts`
- Delete: `tests/project-scanner.test.ts`
- Delete: `tests/worker.test.ts`
- Delete: `tests/watcher.test.ts`
- Delete: `tests/annotations.test.ts`
- Modify: `scripts/build-electron.mjs`
- Modify: `tests/design-system.test.ts`
- Modify: `tests/review-workflow.test.ts`

**Interfaces:**
- Consumes: all replacement bridge/domain surfaces from Tasks 2-7
- Produces: no path scanner, watcher, local annotation DB, bundled media worker, or peer `finals/assets/refs/files` categories

- [ ] **Step 1: Run dependency searches before deletion**

Use `rg` and TypeScript to identify every import/callsite of the five modules. Move any still-needed range/media helper into `protocol-access.ts`; do not retain a compatibility wrapper.

- [ ] **Step 2: Delete replaced modules and build entry**

Remove worker bundling from `scripts/build-electron.mjs`, scanner session state, local `Move to Bin`, and scan-only tests. Raw Objects remain available through the Advanced Objects view, not filesystem traversal.

- [ ] **Step 3: Lock the removal with static assertions**

Add these searches to `tests/design-system.test.ts` or a dedicated source invariant test and require zero matches:

```text
scanProject|includeIntermediate|media-library/library.json|project-scanner|media/worker
absolutePath|projectRelativePath  (under src/)
"finals"|"assets"|"refs"|"files"  (Project peer navigation)
```

- [ ] **Step 4: Verify and commit removal**

Run: `bun run typecheck && bun run test && bun run build`

```bash
git add scripts/build-electron.mjs electron/media/session.ts tests/design-system.test.ts tests/review-workflow.test.ts
git add -u electron/media tests
git commit -m "refactor(desktop): remove filesystem media scanning"
```

### Task 9: Package and smoke-test against a migrated real library

**Files:**
- Modify: `scripts/smoke-electron.mjs`
- Modify: `README.md`
- Modify: package/build files only when required by the existing packager

**Interfaces:**
- Consumes: packaged core v2, migrated rehearsal library, then verified live library
- Produces: signed packaged app with bridge/entity smoke evidence

- [ ] **Step 1: Make smoke use a fake v1 bridge fixture**

The smoke fixture must answer hello/overview/media/composition/unit/activity methods and prove the packaged app launches without `media/worker.cjs` or path scanner state.

- [ ] **Step 2: Document the domain UI and recovery behavior**

README covers installed core requirement, bridge version mismatch, stable entities/revisions, platform previews, visible working diagnostics, credential ownership, and migration/recovery roots.

- [ ] **Step 3: Run full package verification**

```bash
bun run typecheck
bun run test
bun run build
bun run smoke
bun run package:mac
codesign --verify --deep --strict "release/Ralphy Media.app"
gitleaks protect --staged --redact
```

Expected: every command exits 0.

- [ ] **Step 4: Exercise representative migrated projects**

Open Denti.AI and switch Composition revisions/Build outputs; inspect R2/R3 feedback, Documents, working frames, and activity. Open a carousel/sticker/article Project; verify ordered Unit items, three-platform video previews, publication state, and metric snapshots. Start one agent turn with scoped context and confirm no stored secret appears in logs.

- [ ] **Step 5: Commit the packaged integration**

```bash
git add scripts/smoke-electron.mjs README.md
git commit -m "feat(desktop): complete domain store integration"
```
