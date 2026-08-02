# Desktop Domain Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Desktop's path-scanned media library with the installed core bridge and present Workspaces, Projects, Documents, Media revisions, Compositions/Builds, Units/platforms, publications, metrics, working files, feedback, and activity as first-class entities.

**Architecture:** Electron main owns one root-bound `ralphy bridge --stdio` child and translates its explicit success/error envelopes into typed IPC. The renderer stores stable entity/revision IDs only, requests scoped locators for previews through main, and reuses the existing workbench/viewers/chat/terminal shell while deleting the scanner, watcher, local annotations, and app-owned credential store.

**Tech Stack:** Electron, React, TypeScript, Vite, Vitest, Node child processes/streams, existing CSS/media viewers

## Global Constraints

- Complete and release the core entity CLI/bridge before implementing this plan.
- Preserve the current dirty Desktop chat, terminal, settings, design-system, and media-viewer work; it is the implementation baseline, not disposable output.
- Do not open `.ralphy/ralphy.db`, import sibling core source, call Postiz directly, or derive domain identity from paths.
- Renderer state and IPC inputs contain stable IDs, never the `.ralphy` root, bucket keys, locators, terminal cwd as identity, or absolute paths. Electron main alone retains the root and may receive a validated locator from core.
- IPC errors use explicit `{ ok: false, error: { code, message, details? } }` envelopes because Electron does not preserve custom error fields on rejected invokes.
- Never automatically retry mutations after `E_CONFLICT`; reload and show the user what changed.
- Working/diagnostic Objects and cache/temp RunObjects remain visible through explicit filters and Run context.
- Reuse the existing virtual grid, image/video/audio viewers, Markdown renderer, chat/terminal shell, layout, and design tokens.
- Add no client query/state framework; page loaders plus one monotonic activity sequence are sufficient.
- Desktop never persists or retrieves stored provider secret values after migration.
- Every IPC handler validates a trusted sender, returns `IpcResult<T>`, and has an explicit preload method; expose no generic renderer-controlled bridge dispatcher.
- Browser windows use `sandbox: true`, a restrictive CSP, denied permission requests, and navigation limited to the exact packaged/dev origin.
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

Expected: branch `feat/electron-media-workbench` at `621568f`, empty index, 76 status entries representing exactly 106 leaf paths (35 modified, 71 untracked), and sorted path-set SHA-256 `40a761ed8288129ff783903c17d615b759b5b8e02190186cade0bf5c062c7521`. The inventory includes `electron/main.ts`, `electron/media/types.ts`, `electron/preload.ts`, `src/App.tsx`, `src/lib/ipc.ts`, `src/styles/workbench.css`, and the untracked chat/terminal modules.

- [ ] **Step 2: Make the current test runner load every suite**

Replace `from "bun:test"` with `from "vitest"` only in the ten Desktop tests for agent models, audio preview, Claude session, agent request, terminal manager, Claude credentials, agent bridge, Codex session, chat state, and AI brand icon. Do not change runtime code or switch test runners.

Run: `bun run typecheck && bun run test`

Expected: typecheck passes and all suites load; zero suite-load errors remain.

- [ ] **Step 3: Review the complete checkpoint diff**

Run `git diff --check`, targeted no-Cyrillic search across changed source/docs, and `gitleaks protect --staged --redact` after staging. Stage only `package.json bun.lock electron public scripts src tests docs`, then require exactly the same 106 sorted paths and path-set hash, no unstaged/untracked source, and no build/release/userData/credential files.

- [ ] **Step 4: Commit the preserved baseline**

```bash
git add package.json bun.lock electron public scripts src tests docs
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
  constructor(options: { bin: string; root: string; env?: Record<string, string> });
  start(): Promise<BridgeHello>;
  request<M extends BridgeMethod>(method: M, params: ParamsFor<M>): Promise<ResultFor<M>>;
  onEvent(listener: (event: BridgeEvent) => void): () => void;
  close(): Promise<void>;
}
```

- [ ] **Step 1: Write a fake bridge fixture and failing concurrent-request test**

The fixture reads JSONL stdin and deliberately answers requests out of order. Assert two concurrent calls resolve by request ID, discriminated activity and agent events reach listeners, stderr is kept out of the JSON parser, and `close()` rejects pending requests with `E_BRIDGE_CLOSED`.

- [ ] **Step 2: Implement line parsing and request correlation**

Spawn `[bin, "bridge", "--stdio", "--root", root]` with piped stdio. Assign `crypto.randomUUID()` request IDs, retain one deferred promise per ID, parse newline-delimited responses/events, cap a buffered line at 1 MiB, and reject all pending calls on process exit. Never replay a mutation automatically.

- [ ] **Step 3: Enforce handshake compatibility**

`start()` sends an ordinary `system.hello` request, requires protocol `1`, records `storeId`, opaque `rootId`, core/schema versions, capabilities, current activity sequence, and migration/startup state, and rejects mismatches with a user-actionable upgrade error. Do not send domain requests before hello succeeds and do not expect an unsolicited handshake.

- [ ] **Step 4: Add active-root session replacement**

`RalphySession.open(root)` starts the new client and confirms hello before closing the prior client. If the new root fails, retain the prior working session. Serialize root changes so a slower earlier open cannot replace a newer selection. A successful switch increments a root epoch used to invalidate every locator/drag token.

Discover the executable without a shell: `RALPHY_BIN` is test/dev override; production checks explicit executable candidates and a sanitized GUI-safe PATH because Finder launches may not inherit Homebrew/Bun paths. Never construct a shell command or pass the full Electron environment.

- [ ] **Step 5: Verify and commit the client**

Run: `bun run test -- tests/ralphy-client.test.ts tests/ralphy-session.test.ts && bun run typecheck`

```bash
git add electron/ralphy tests/ralphy-client.test.ts tests/ralphy-session.test.ts
git commit -m "feat(desktop): connect to the ralphy bridge"
```

### Task 2A: Secure startup, canonical root ownership, and migration recovery

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/agent/request.ts`
- Modify: `electron/terminal/manager.ts`
- Modify: `src/lib/ipc.ts`
- Modify: `src/App.tsx`
- Create: `src/screens/MigrationRecoveryScreen.tsx`
- Modify: `index.html`
- Test: `tests/ipc-security.test.ts`
- Test: `tests/root-session.test.ts`
- Test: `tests/migration-recovery.test.tsx`

**Interfaces:**
- Consumes: `RalphySession`, `system.hello`, and `E_MIGRATION_INCOMPLETE`
- Produces: one main-owned canonical root/store identity, secured explicit IPC, root-switch cleanup, and a blocking interrupted-migration screen

- [ ] **Step 1: Lock Electron's trust boundary**

Enable `sandbox: true`, add restrictive CSP, deny permission requests, block `will-navigate` outside the exact local/dev origin, and call `assertTrustedSender` from every `ipcMain.handle/on`. Preload exposes an explicit allowlist of typed methods, never a generic `request(method)`. Every result is `IpcResult<T>` preserving safe core codes; unknown errors become `E_INTERNAL` without raw bridge stderr. Production mock behavior is impossible unless an explicit dev/test flag is set.

- [ ] **Step 2: Make the bridge Session the only root owner**

Move agent and terminal root binding from scanner state to the root/store identity confirmed by hello before Task 3 removes scanner session ownership. On a successful root switch, invalidate preview/drag tokens, stop old-root agent turns, close the old bridge, terminate old-root terminals, and resubscribe activity. On failure retain the prior bridge, turns, terminals, and saved root. Renderer sees only `storeId` plus a display label; the local root path remains main-only.

- [ ] **Step 3: Block interrupted cutover at startup**

When hello returns `E_MIGRATION_INCOMPLETE` or a non-terminal journal phase (`prepared`, `source-moved`, or `rollback-new-moved`, including installed-root-before-journal-update), show a blocking Recovery screen. Do not start scanner/fallback/mock, clear the saved root, or auto-recover/rollback. Show safe Run ID/phase, allow main to copy a sanitized recovery command, and allow selecting another library.

- [ ] **Step 4: Verify and commit secure root ownership**

Test trusted/untrusted senders, navigation/permission denial, explicit preload surface, root switch success/failure races, cleanup ordering, safe error mapping, and every interrupted journal phase.

```bash
bun run test -- tests/ipc-security.test.ts tests/root-session.test.ts tests/migration-recovery.test.tsx
bun run typecheck
git commit -m "feat(desktop): secure bridge root startup"
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
type MediaCard = ArtifactMediaCard | RunObjectMediaCard | ObjectMediaCard;
interface MediaCardBase {
  id: string;
  target: { type: "object" | "run-object"; id: string };
  name: string;
  kind: MediaKind;
  mime: string;
  bytes: number;
  createdAt: string;
  lifecycle: string;
  usageRoles: string[];
  review: MediaReview | null;
}
interface ArtifactMediaCard extends MediaCardBase {
  type: "artifact";
  artifactId: string;
  artifactRevisionId: string;
  storageClass: "durable" | "working" | "diagnostic";
}
interface RunObjectMediaCard extends MediaCardBase {
  type: "run-object";
  runObjectId: string;
  runId: string;
  attemptId: string | null;
  purpose: string;
  state: string;
  retention: string;
  locationClass: "run" | "cache" | "temp";
  promotedObjectId: string | null;
}
interface ObjectMediaCard extends MediaCardBase {
  type: "object";
  objectId: string;
  storageClass: "durable" | "working" | "diagnostic";
}
```

- [ ] **Step 1: Write failing DTO and locator authorization tests**

Assert renderer-visible cards contain no root, locator, `absolutePath`, or `projectRelativePath`; preview IPC accepts only `{ target, range? }`; main calls `locator.resolve(..., purpose: "preview")`; cross-root IDs return an explicit core error; valid byte ranges retain current streaming behavior.

- [ ] **Step 2: Wire bridge requests into Electron main and preload**

Replace `MediaWorkerClient`/remaining scanner registration with the canonical `RalphySession` established in Task 2A. IPC methods return:

```ts
type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };
```

Main stores opaque preview tokens containing stable target plus root epoch. The `ralphy-media://` protocol resolves the locator again for each request, validates a regular file/session, and never caches an absolute path across root changes. Root switch invalidates all tokens.

Native drag uses a two-stage flow because `dragstart` is synchronous: renderer calls `prepareDrag(target)` on pointer-down; main returns a short-lived one-shot root-epoch token; `startDrag(token)` consumes it synchronously. Finder/open follow the same trusted-main locator boundary.

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

Workspace overview shows social accounts/public identity, current Workspace Documents, shared media/references, Projects, recent Units/publications, and aggregate metrics. Project overview shows current Iteration, purpose, feedback, prior-Iteration changes, inherited and Project Documents, exact bound revisions with a `newer revision available` indicator, Compositions/Builds, Units/distribution, working/RunObjects, and activity.

- [ ] **Step 3: Implement Document revision viewing and editing**

List kind/title/content format/current revision and binding context, with FTS-backed `document.search`. Use the existing Markdown renderer for Markdown, `<pre>` for formatted JSON/text, a normal `<textarea>` for edits, and `document.revise` with `expectedRevisionId`. On conflict, keep the user's draft locally, reload current revision, and present both versions without auto-retry or overwrite.

- [ ] **Step 4: Implement Media filters without hiding evidence**

Filters are References, Working, Candidate, Approved, Rejected, Superseded, Run diagnostics, Cache/temp RunObjects, and Advanced Objects. A RunObject card shows Run/attempt, purpose, state, retention, logical path, location class, and promotion target. Local `Move to Bin` is removed; future cleanup is an explicit core archive/compact operation.

- [ ] **Step 5: Subscribe to monotonic activity**

After hello call `activity.subscribe({ afterSequence: lastSequence })` and wait for its acknowledgment before accepting events. Detect a sequence gap, page `activity.list` until caught up, then update one app-level `activitySequence` used as a refresh token by active loaders. Unsubscribe on root/scope changes. Agent event ordinals are turn-local and never mixed with the global activity sequence. Do not install a query library.

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

Show kind, selected/head revision separately, parent/ancestry, Iteration, engine/version, draft/sealed state, ordered sources/inputs, Builds with profile/status/error, evaluations, and every ordered output/preview target. `revise` sends expected latest, `select` sends expected selected, and `build` sends expected revision/state; these guards are never substituted for one another. `E_CONFLICT` reloads and shows a non-destructive conflict banner.

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

Show Workspace- or Project-owned Unit revisions, ordered heterogeneous item roles/types with exact Artifact/Document revision IDs, presentation overrides, selected revision, Publication attempt history, Postiz state/URL/error/timestamps, and immutable Metric snapshots. Publish/refresh calls core only; Desktop never calls or mocks Postiz directly—tests mock typed bridge responses.

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
- Delete: `electron/claude/session.ts`
- Delete: `electron/agent/codex-session.ts`
- Delete: `electron/agent/models.ts`
- Modify: `tests/agent-bridge.test.ts`
- Modify: `tests/claude-credentials.test.ts`
- Test: `tests/agent-core-session.test.ts`

**Interfaces:**
- Consumes: core `agent.*` and `migration.secret.import` bridge methods plus current normalized `AgentChatEvent`
- Produces: bridge-owned agent turns, write-only credentials, and stable Workspace/Project chat context

- [ ] **Step 1: Write failing secret-ownership tests**

Assert Settings sends credential values once to `agent.credential.set`, clears the input after success, never reads values back, and stores only `{ configured: true }` from `agent.credential.status`. Assert no `claude-api-key.bin`, `openrouter-api-key.bin`, or Electron `safeStorage` write occurs for new credentials and no value appears in status/error/activity/log output.

- [ ] **Step 2: Route agent turns through core**

Preserve the existing normalized chat event DTO, but distinguish domain `agentSessionId`, provider resume/session ID, and `turnId`. `useAgentChat` calls `agent.turn.start` with stable Workspace/Project/Agent Session IDs and listens for bridge events carrying Session/turn/chat/scope. Stop calls scoped `agent.turn.stop({ turnId })`. Core launches the process and injects secrets; Electron does not.

- [ ] **Step 3: Migrate existing Electron secrets and chat preferences**

Do not auto-import on first v2 connection. During the explicit pre-cutover migration handoff, under the maintenance lock and with exact migration Run/source-entry IDs, Electron decrypts its own old safeStorage blobs in main memory and sends each value once through `migration.secret.import`; after success the migration retains the exact old file below mode-0700 recovery rather than deleting it. Export non-secret localStorage chat/settings state through typed `migration.desktop.import`, then record completion. New secret input never enters renderer persistence.

- [ ] **Step 4: Bind terminals to the canonical bridge root**

Verify the Task 2A canonical root binding: terminal working directories may be resolved debug/export/checkouts from core but never define domain identity. Provider login is an explicit core operation or a documented terminal-only flow; Desktop does not resurrect provider-specific login ownership.

- [ ] **Step 5: Verify and commit agent ownership**

Run: `bun run test -- tests/agent-bridge.test.ts tests/claude-credentials.test.ts tests/agent-core-session.test.ts && bun run typecheck`

```bash
git add electron/main.ts electron/agent/request.ts src/chat/useAgentChat.ts src/screens/SettingsScreen.tsx electron/terminal/manager.ts tests/agent-bridge.test.ts tests/claude-credentials.test.ts tests/agent-core-session.test.ts
git add -u electron/claude/credentials.ts electron/claude/session.ts electron/agent/codex-session.ts electron/agent/models.ts
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
- Delete or rewrite: `scripts/benchmark-media.ts`
- Modify: `tests/design-system.test.ts`
- Modify: `tests/review-workflow.test.ts`

**Interfaces:**
- Consumes: all replacement bridge/domain surfaces from Tasks 2-7
- Produces: no path scanner, watcher, local annotation DB, bundled media worker, or peer `finals/assets/refs/files` categories

- [ ] **Step 1: Run dependency searches before deletion**

Use `rg` and TypeScript to identify every import/callsite of the five modules. Move any still-needed range/media helper into `protocol-access.ts`; do not retain a compatibility wrapper.

- [ ] **Step 2: Delete replaced modules and build entry**

Remove worker bundling from `scripts/build-electron.mjs`, scanner session state, local `Move to Bin`, production fallback mock, and scan-only/old agent-execution tests. Make the build script clean `dist-electron` before bundling so a stale `media/worker.cjs` cannot survive deletion. Delete `scripts/benchmark-media.ts` or rewrite it against bridge pagination. Raw Objects remain available through the Advanced Objects view, not filesystem traversal.

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
bun run smoke:packaged
codesign --verify --deep --strict "release/Ralphy Media.app"
gitleaks protect --staged --redact
```

Expected: every command exits 0.

The packaged smoke uses an absolute fake `RALPHY_BIN`, completes a real hello plus overview/Documents/media/Composition/Unit/activity requests, exercises preview/range and one real PTY create/close, proves scanner/worker files are absent, and proves production renderer never falls back to mock state. Before publishing, also run `gitleaks detect --source .`.

- [ ] **Step 4: Exercise representative migrated projects**

Open Denti.AI and switch Composition revisions/Build outputs; inspect R2/R3 feedback, Documents, working frames, and activity. Open a carousel/sticker/article Project; verify ordered Unit items, three-platform video previews, publication state, and metric snapshots. Start one agent turn with scoped context and confirm no stored secret appears in logs.

- [ ] **Step 5: Commit the packaged integration**

```bash
git add scripts/smoke-electron.mjs README.md
git commit -m "feat(desktop): complete domain store integration"
```
