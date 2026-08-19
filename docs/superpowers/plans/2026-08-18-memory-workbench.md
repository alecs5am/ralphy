# Workspace Memory Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the supplied workspace Memory rulebook as a functional Desktop page backed by the current SQLite Core contract.

**Architecture:** Complete the existing Hermes-to-SQLite Memory adapter, anchor global entries in one hidden system workspace, and expose typed `memory.*` bridge methods. Desktop validates that contract in Electron and renders one stateful Memory screen; it never opens `ralphy.db` directly.

**Tech Stack:** Bun, `bun:sqlite`, TypeScript, Electron IPC, React 19, Radix Dialog, Lucide React, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-18-memory-workbench-design.md`

## Global Constraints

- Preserve the Hermes states, tier override rule, append-only revisions, 100-entry active cap, and approve/reject/retire vocabulary.
- Keep all source, tests, fixtures, and commit messages in English.
- Add no dependency and do not copy the prototype runtime.
- Desktop must not read or write SQLite directly.
- The hidden global Memory workspace must never appear in user-facing workspace lists.
- Preserve every unrelated change in both dirty worktrees.
- Do not create implementation commits from overlapping dirty files; verify with scoped diffs and leave the implementation uncommitted for the user.

---

### Task 1: SQLite Memory domain store

**Files:**
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/cli/lib/store/schema.ts`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/cli/lib/store/scopes.ts`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/cli/lib/memory/store.ts`
- Create: `/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/tests/integration/domain-memory.test.ts`

**Interfaces:**
- Extends the existing `MemoryTier`, `MemoryStatus`, `MemoryType`, `MemoryEntry`, and `RecallResult` contracts with structured body, quality, history, and global-SQL support.
- Produces `listMemories`, `getMemory`, `createMemory`, `reviseMemory`, `approveMemory`, `rejectMemory`, `retireMemory`, `listMemoryHistory`, `recallMemory`, and `getMemoryHealth`.

```ts
export type MemoryTier = "workspace" | "global";
export type MemoryStatus = "active" | "proposed" | "rejected" | "archived";
export type MemoryType = "model" | "craft" | "tooling" | "client" | "style" | "user" | "legacy";
export type MemoryBodyInput = {
  rule: string;
  why: string;
  howToApply: string[];
  doesNotApplyTo: string[];
};
export type MemoryQualityFlag = "missing-rule" | "missing-why" | "missing-how-to-apply" | "missing-negative-scope" | "malformed-body";
export type MemorySummaryDto = {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  description: string;
  type: MemoryType;
  tier: MemoryTier;
  status: MemoryStatus;
  revisionId: string;
  revisionNo: number;
  filedAt: string;
  source: string;
  qualityFlags: MemoryQualityFlag[];
  overridesGlobal: boolean;
};
export type MemoryDetailDto = MemorySummaryDto & { body: MemoryBodyInput; rawBody: string };
export type MemoryRevisionDto = {
  id: string;
  memoryEntryId: string;
  revisionNo: number;
  parentRevisionId: string | null;
  status: MemoryStatus;
  filedAt: string;
  source: string;
  name: string;
  description: string;
  type: MemoryType;
  body: MemoryBodyInput;
  rawBody: string;
};
export type MemoryRecallDto = {
  workspaceId: string;
  count: number;
  workspaceCount: number;
  globalCount: number;
  overriddenGlobalSlugs: string[];
  entries: Array<MemorySummaryDto | MemoryDetailDto>;
};
export type MemoryHealthDto = {
  scanned: number;
  findings: Array<{ memoryEntryId: string; slug: string; flags: MemoryQualityFlag[] }>;
};
```

`createMemory` accepts the editable summary fields, `MemoryBodyInput`, `tier`, `status: "active" | "proposed"`, and `workspaceId`. `reviseMemory` adds `memoryEntryId` and `expectedRevisionId`. Approval and rejection target a proposed revision ID; retirement targets an entry ID plus its expected active revision ID. Read functions take a workspace ID and explicit filters rather than ambient command context.

- [ ] **Step 1: Write the failing migration and lifecycle tests**

```ts
test("workspace memory overrides the global slug without mutating either entry", () => {
  const workspace = createWorkspace({ slug: "acme", name: "Acme" });
  createMemory({ workspaceId: workspace.id, tier: "global", status: "active", slug: "caption-style", type: "style", name: "Global caption style", description: "Use sentence case.", body: COMPLETE_BODY });
  createMemory({ workspaceId: workspace.id, tier: "workspace", status: "active", slug: "caption-style", type: "style", name: "Acme caption style", description: "Use flat declarative captions.", body: COMPLETE_BODY });

  expect(recallMemory({ workspaceId: workspace.id, full: false })).toMatchObject({
    count: 1,
    workspaceCount: 1,
    globalCount: 0,
    overriddenGlobalSlugs: ["caption-style"],
    entries: [{ slug: "caption-style", tier: "workspace" }],
  });
});
```

Add independent tests for: hidden global workspace filtering, active/proposed creation, append-only revision numbers, proposal approval, proposal rejection, retirement of all revisions, per-tier capacity, case-insensitive body search, and missing-negative-scope health flags.

- [ ] **Step 2: Run the test and verify RED**

Run: `bun test tests/integration/domain-memory.test.ts`

Expected: FAIL because global Memory still uses files and the hidden scope migration does not exist.

- [ ] **Step 3: Add the minimal schema migration**

Add one migration after the current version:

```sql
INSERT OR IGNORE INTO workspaces
  (id, slug, name, metadata_json, row_version, created_at, updated_at)
VALUES
  ('ws_00000000-0000-0000-0000-000000000000', '__global-memory__', 'Global Memory', '{"system":"global-memory"}', 1, 0, 0);
```

Export `GLOBAL_MEMORY_WORKSPACE_ID` and exclude it in `listWorkspaces`. Tier is derived: the reserved ID is global and every other workspace ID is workspace tier.

- [ ] **Step 4: Implement the store with one transaction per mutation**

Refactor the existing `writeWorkspaceEntry`, `listWorkspaceEntries`, `getWorkspaceEntry`, and `moveWorkspaceEntry` helpers into scope-neutral SQL helpers. Both tiers use the existing `documents` and `document_revisions` tables for immutable body storage. Canonical structured bodies render as:

```md
## Rule

Use flat declarative captions.

## Why

The client rejects promotional punctuation.

## How to apply

- Remove exclamation marks and emoji.

## Does NOT apply to

- Internal scratch notes.
```

Legacy or malformed Markdown remains readable through a tolerant parser and receives quality flags instead of disappearing.

- [ ] **Step 5: Run the domain test and verify GREEN**

Run: `bun test tests/integration/domain-memory.test.ts`

Expected: PASS.

---

### Task 2: Core Memory bridge and Hermes curation adapter

**Files:**
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/cli/lib/bridge/methods.ts`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/cli/lib/memory/curate.ts`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/tests/integration/cli-bridge-domain-contract.test.ts`
- Test: `/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/tests/integration/domain-memory.test.ts`

**Interfaces:**
- Consumes the Task 1 store functions.
- Produces bridge methods `memory.list`, `memory.show`, `memory.create`, `memory.revise`, `memory.approve`, `memory.reject`, `memory.retire`, `memory.history`, `memory.recall`, `memory.health`, and `memory.curate`.

- [ ] **Step 1: Write failing bridge tests**

```ts
const created = await call("memory.create", {
  context: { workspaceId: workspace.id },
  tier: "workspace",
  status: "active",
  slug: "caption-style",
  type: "style",
  name: "Caption style",
  description: "Use flat declarative captions.",
  body: COMPLETE_BODY,
  source: "Desktop",
});
expect(created).toMatchObject({ slug: "caption-style", tier: "workspace", status: "active", revisionNo: 1 });
```

Cover invalid scope, stale expected revision, cross-tier bulk approval, cap errors, and exact `system.hello.capabilities` membership.

- [ ] **Step 2: Run the bridge tests and verify RED**

Run: `bun test tests/integration/cli-bridge-domain-contract.test.ts -t memory`

Expected: FAIL with `Missing bridge method: memory.create`.

- [ ] **Step 3: Register strict bridge handlers**

Parse every object and enum through the existing bridge validators. Mutation inputs use IDs and optimistic fields:

```ts
memory.revise: {
  context: BridgeContext;
  memoryEntryId: string;
  expectedRevisionId: string;
  status: "active" | "proposed";
  name: string;
  description: string;
  type: MemoryType;
  body: MemoryBodyInput;
  source: string;
}
```

Bulk approval requires one explicit tier and never mixes workspace and global proposals.

- [ ] **Step 4: Reuse the Hermes curation analysis**

Extract the analysis portion of `curateMemory` so both file-backed CLI compatibility and SQLite bridge input can pass `MemoryEntry[]`. The SQLite adapter stages returned survivors with `createMemory(... status: "proposed")`; it never retires originals.

- [ ] **Step 5: Run the bridge and domain tests and verify GREEN**

Run: `bun test tests/integration/domain-memory.test.ts tests/integration/cli-bridge-domain-contract.test.ts`

Expected: PASS.

---

### Task 3: Desktop contract validation and IPC

**Files:**
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/electron/ralphy/types.ts`
- Create: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/electron/ralphy/memory-reader.ts`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/electron/main.ts`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/electron/media/types.ts`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/electron/preload.ts`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/src/lib/ipc.ts`
- Create: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/tests/memory-contract.test.ts`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/tests/ipc-security.test.ts`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/tests/ralphy-client.test.ts`

**Interfaces:**
- Mirrors the Core DTOs and bridge contracts exactly.
- Exposes `bridge.listMemory`, `bridge.showMemory`, `bridge.mutateMemory`, `bridge.loadMemoryHistory`, `bridge.recallMemory`, `bridge.loadMemoryHealth`, and `bridge.curateMemory` to the renderer.

- [ ] **Step 1: Write failing contract and IPC tests**

The break caught is accepting malformed Core data or allowing a renderer to pass an arbitrary method name.

```ts
expect(validateMemorySummary({ ...VALID_SUMMARY, tier: "account" })).toThrow();
expect(MEDIA_CHANNELS).toMatchObject({ listMemory: "media:list-memory" });
```

- [ ] **Step 2: Run targeted Desktop tests and verify RED**

Run: `bun run test -- tests/memory-contract.test.ts tests/ipc-security.test.ts tests/ralphy-client.test.ts`

Expected: FAIL because the Memory contract and channels are missing.

- [ ] **Step 3: Mirror the bridge types and add strict validators**

Add all methods to `BRIDGE_METHODS` and `BridgeMethodContract`; keep the exact-capability handshake. `memory-reader.ts` accepts a selected `WorkspaceSummary`, builds `{ workspaceId }` context itself, calls only named Memory methods, and validates every result before returning it.

- [ ] **Step 4: Add secured IPC handlers and renderer wrappers**

Follow the existing `securedHandle`/preload allowlist pattern. The renderer sends typed Memory inputs only; it cannot choose a Core method or data root.

- [ ] **Step 5: Run targeted tests and verify GREEN**

Run: `bun run test -- tests/memory-contract.test.ts tests/ipc-security.test.ts tests/ralphy-client.test.ts`

Expected: PASS.

---

### Task 4: Memory rulebook page

**Files:**
- Create: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/src/screens/MemoryScreen.tsx`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/src/App.tsx`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/src/components/ContextSidebar.tsx`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/src/styles/workbench.css`
- Create: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/tests/memory-screen.test.tsx`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/tests/workspace-navigation.test.tsx`

**Interfaces:**
- Consumes the Task 3 renderer bridge.
- Produces `MemoryScreen({ workspace })` and no reusable abstraction until another page needs one.

- [ ] **Step 1: Write failing mounted behavior tests**

Test real rendered behavior: Memory replaces the placeholder; filters change visible rules; one accordion item expands at a time; review mode groups proposals by tier; recall opens a dialog/drawer; status and tier remain present in accessible text.

```tsx
await act(async () => root.render(<MemoryScreen workspace={WORKSPACE} />));
expect(host.textContent).toContain("Durable context agents reuse across future work");
click(button(host, "Workspace"));
expect(host.textContent).toContain("Workspace rule");
expect(host.textContent).not.toContain("Inherited rule");
```

- [ ] **Step 2: Run the screen tests and verify RED**

Run: `bun run test -- tests/memory-screen.test.tsx tests/workspace-navigation.test.tsx`

Expected: FAIL because `MemoryScreen` does not exist and navigation renders the placeholder.

- [ ] **Step 3: Implement loading, filters, rulebook, review mode, and recall drawer**

Keep query, scope, type, order, expanded ID, and review mode in `MemoryScreen`. Fetch filtered lists through Core; preserve these states while overlays open. Use semantic buttons, `aria-expanded`, `aria-controls`, a live status region, and existing Lucide icons.

- [ ] **Step 4: Recreate the supplied visual system in scoped CSS**

Use `.memory-*` selectors, the existing tokens and fonts, borderless surfaces, the specified 28px controls, 16px rule radii, 392px recall width, and responsive density at 1280px. Add no generic component classes unless an existing class already covers the control.

- [ ] **Step 5: Run screen tests and verify GREEN**

Run: `bun run test -- tests/memory-screen.test.tsx tests/workspace-navigation.test.tsx`

Expected: PASS.

---

### Task 5: Memory mutations, history, and confirmations

**Files:**
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/src/screens/MemoryScreen.tsx`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/src/styles/workbench.css`
- Test: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/tests/memory-screen.test.tsx`

**Interfaces:**
- Consumes all Task 3 mutation/history methods.
- Produces Add/Revise editor, history comparison, approve/reject/retire confirmations, deterministic health review, and mutation refresh behavior.

- [ ] **Step 1: Add failing tests for each mutation outcome**

Name the observable break: wrong tier submitted, revision overwritten instead of appended, proposal approved without confirmation, reject/retire missing provenance copy, stale mutation not surfaced, or focus not returned.

- [ ] **Step 2: Run the mutation tests and verify RED**

Run: `bun run test -- tests/memory-screen.test.tsx -t "memory mutation"`

Expected: FAIL because the dialogs and handlers are absent.

- [ ] **Step 3: Implement one structured editor and reuse it for Add and Revise**

Required fields are Rule, Scope, and Type. Why, How to apply, and Does not apply to are encouraged but not blocking. Advanced name, slug, description, and source fields stay collapsed. Revise submits the exact `expectedRevisionId` and labels the action `Save as version N`.

- [ ] **Step 4: Implement history and explicit confirmations**

History compares selected immutable revisions without promoting an old revision. Approve, Reject, and Retire each use distinct copy and buttons. Successful mutation reloads active/proposed counts and announces the result without moving focus unexpectedly.

- [ ] **Step 5: Run the full Memory test and verify GREEN**

Run: `bun run test -- tests/memory-screen.test.tsx tests/memory-contract.test.ts tests/workspace-navigation.test.tsx`

Expected: PASS.

---

### Task 6: Fixtures, full verification, and packaged visual QA

**Files:**
- No tracked fixture script; seed through the new bridge using an ephemeral Bun process.
- Modify only if QA exposes a tested defect: files from Tasks 1-5.

**Interfaces:**
- Uses the packaged Core binary and Desktop app produced by prior tasks.
- Leaves an idempotent workspace fixture in `UX Testing Lab`; global fixtures stay in a copied root.

- [ ] **Step 1: Back up and inspect the live test root**

Create a timestamped copy under `/Users/maximovchinnikov/.ralphy/backups/`, resolve the exact `UX Testing Lab` workspace ID, and query existing fixture slugs before writing.

- [ ] **Step 2: Seed workspace fixtures through `memory.create` only when absent**

Create active, proposed, multi-version, missing-negative-scope, and all-type cases with stable `ux-memory-*` slugs. Never update or delete an existing non-fixture entry.

- [ ] **Step 3: Run repository verification**

Core:

```bash
bun test tests/integration/domain-memory.test.ts tests/integration/cli-bridge-domain-contract.test.ts
bun run lint
bun test tests/integration/
```

Desktop:

```bash
bun run typecheck
bun run test
bun run build
git diff --check
```

- [ ] **Step 4: Package and sign the UX build**

Build the packaged app with the updated Core binary, verify code signing, and launch it against the test root with the right panel closed.

- [ ] **Step 5: Run visual and interaction QA**

At 1440×900 and 1280Ø00 verify: exact header/filter geometry, one expanded rule, review mode, Add/Revise, history, confirmations, keyboard focus, recall drawer, empty/no-results/error states, sidebar collapsed state, and increased text size. Compare screenshots with `Memory Page.dc.html` and `Memory Recall.dc.html`.

- [ ] **Step 6: Inspect final scoped diffs**

Run `git diff --check`, list only files changed for Memory, and confirm unrelated pre-existing changes remain untouched.
