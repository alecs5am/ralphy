# Project View and Social Unit Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This session executes the plan inline because the user asked to proceed and delegation is disabled.

**Goal:** Make Project View compact and calm, fix document formats, replace Units with a preview grid, and open type-aware social previews from Unit cards.

**Architecture:** Keep the existing Project controller, paging, mutations, and CLI contracts. Add one reusable CSS-driven Gooey tab control, enrich document list pages inside the desktop reader, reuse existing artifact/document renderers for Unit media, and map `unit.format + platform` to composed social shells in the renderer.

**Tech Stack:** React 19, TypeScript, CSS, existing Radix Dialog/Select, Electron IPC, Bun tests.

**Spec:** `docs/superpowers/specs/2026-08-17-project-view-social-previews-design.md`

## Global Constraints

- Work only in `ralphy-desktop`; add no package and change no Core contract.
- Preserve user-owned dirty-tree changes, document conflict guards, paging, scroll memory, and Unit selection mutations.
- Use the existing `unit.items`, `unit.presentations`, and `unit.preview` methods.
- Keep keyboard focus visible and make the Unit dialog reachable with Enter, not only double click.
- Stage no unrelated hunks; implementation commits are optional in the dirty worktree.

### Task 1: Add Gooey tabs and calm Project selection

**Files:**
- Add: `src/components/ui/GooeyTabs.tsx`
- Modify: `src/components/ProjectControls.tsx`
- Modify: `src/styles/workbench.css`
- Test: `tests/project-screen-behavior.test.tsx`
- Test: `tests/design-system.test.ts`

1. Add a failing interaction test for `role=tablist`, roving tab index, Arrow/Home/End movement, and project tab activation.
2. Add a failing CSS contract test for the M/S geometry, two blobs, reduced-motion fallback, and project-scoped neutral selection.
3. Implement `GooeyTabs<Value extends string>` with a native button per tab, `useId()` for the SVG filter, and this public shape:

```ts
type GooeyTab<Value extends string> = { value: Value; label: string; count?: number };

type GooeyTabsProps<Value extends string> = {
  tabs: readonly GooeyTab<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
  size?: "m" | "s";
  ariaLabel: string;
};
```

4. Reuse it in `ProjectControls`; keep current labels and controller calls.
5. Scope `--ring-select` inside `.project-region` to `inset 0 0 0 1px var(--line-strong)` while leaving `:focus-visible` on the two-pixel accent ring.
6. Run `bun test tests/project-screen-behavior.test.tsx tests/design-system.test.ts`.

### Task 2: Collapse Overview into a one-screen dashboard

**Files:**
- Modify: `src/screens/project/OverviewPanel.tsx`
- Modify: `src/styles/workbench.css`
- Test: `tests/project-media-presentation.test.tsx`
- Test: `tests/design-system.test.ts`

1. Add a failing test that expects metrics, Project pulse, Ready units, and Distribution while rejecting Production stream, Deliverables, build lists, and Recent activity.
2. Render the existing six metrics as one compact strip.
3. Derive pulse counts from already-loaded feedback/stages/runs and show no more than four selected Units.
4. Keep Distribution compact and collapse empty sections.
5. Use a bounded dashboard grid at normal desktop height; allow scrolling only at smaller container heights.
6. Run `bun test tests/project-media-presentation.test.tsx tests/design-system.test.ts`.

### Task 3: Fix document formats at the reader boundary and update Documents UI

**Files:**
- Modify: `electron/ralphy/project-reader.ts`
- Modify: `src/screens/project/DocumentsPanel.tsx`
- Modify: `src/styles/workbench.css`
- Test: `tests/project-reader.test.ts`
- Test: `tests/documents-panel.test.tsx`

1. Add a failing reader test proving all document rows have exact `currentRevision.format` before selection and unchanged details are cached by `document.id + currentRevisionId`.
2. In the Documents branch of `loadProjectPage`, call `document.show` for each returned row, cache only successful details, and retain the base row with unknown format if one detail fails.
3. Remove title/slug format guessing from the renderer; display `currentRevision?.format ?? "unknown"`.
4. Add local `render | source` view state. Render keeps existing Markdown/JSON/text viewers; Source shows current source and preserves existing edit/save/conflict behavior.
5. Restyle the left rail with sticky search and compact thumbnails; keep the right body centered and its identity/view switch sticky.
6. Run `bun test tests/project-reader.test.ts tests/documents-panel.test.tsx`.

### Task 4: Expose `unit.preview` and define the renderer Unit model

**Files:**
- Modify: `electron/media/types.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/ralphy/project-reader.ts`
- Modify: `src/lib/ipc.ts`
- Add: `src/lib/unit-previews.ts`
- Test: `tests/ipc-security.test.ts`
- Add: `tests/unit-previews.test.ts`

1. Add a failing IPC test for a validated `loadProjectUnitPreview(project, revisionId, platform)` channel.
2. Add the channel, bridge method, preload exposure, main handler, and exact `UnitPreviewDto` response validation using the existing `unit.preview` CLI method.
3. Add the minimal pure renderer model:

```ts
type UnitMedia = {
  id: string;
  role: string;
  position: number;
  kind: "image" | "video" | "audio" | "document" | "other";
  preview: CompositionOutputPreview | DocumentPreview;
};

type SocialTarget = {
  id: string;
  platform: string;
  variant: "video" | "reels" | "shorts" | "carousel" | "post" | "pin" | "generic";
  label: string;
};
```

4. Add one tested `socialTargets(format, presentations)` registry: video and audio map to TikTok/Instagram/YouTube Shorts; carousel maps to TikTok/Instagram/LinkedIn/Pinterest; actual presentations add supported targets without duplicates; unknown formats return Generic.
5. Add one tested resolver that sorts Unit items by position and reuses existing artifact/document preview bridge methods. Failed items are omitted individually.
6. Run `bun test tests/ipc-security.test.ts tests/unit-previews.test.ts`.

### Task 5: Replace Units master/detail with a lazy preview grid

**Files:**
- Modify: `src/screens/project/UnitsPanel.tsx`
- Modify: `src/styles/workbench.css`
- Test: `tests/units-panel.test.tsx`

1. Add failing tests for grid cards, visible slug/format/revision labels, single-click selection, double-click open, and Enter open.
2. Render a responsive grid using the existing Media-card rhythm.
3. Resolve only the first previewable item when a card approaches the viewport; cache by `unit.id + selected/latest revision id` in a module Map.
4. Use a format fallback when thumbnail resolution fails and disable opening only when no revision exists.
5. Keep the existing controller `openUnit` path so revision data, conflict safety, and selection mutation remain unchanged.
6. Run `bun test tests/units-panel.test.tsx`.

### Task 6: Add the revision-aware social preview dialog

**Files:**
- Add: `src/screens/project/UnitViewer.tsx`
- Add: `src/screens/project/UnitSocialPreview.tsx`
- Modify: `src/screens/project/UnitsPanel.tsx`
- Modify: `src/state/project-screen-controller.ts`
- Modify: `src/styles/workbench.css`
- Test: `tests/units-panel.test.tsx`
- Test: `tests/project-domain-state.test.ts`

1. Add failing tests for dialog opening/focus restoration, revision dropdown, selected/latest labels, Make selected, platform switching, and stale preview responses.
2. Add a controller method that drains remaining Unit item/presentation pages for the inspected revision using existing load-more methods; abort naturally when Unit/revision tokens change.
3. Resolve the ordered Unit media array and derive platform tabs from the registry.
4. Use existing Radix Dialog and Select. Revision selection calls the existing inspection method; Make selected calls the existing mutation.
5. Compose recognizable platform shells with content variants rather than inheritance:

```tsx
function TikTokVideo(props: SocialPreviewProps) {
  return <TikTokShell><VerticalVideo {...props} /></TikTokShell>;
}

function InstagramReels(props: SocialPreviewProps) {
  return <InstagramShell><VerticalVideo {...props} /></InstagramShell>;
}
```

6. Load `unit.preview` lazily for the active revision/platform. Ignore stale results after platform, revision, Unit, or dialog changes; missing metadata falls back to shell defaults while media remains visible.
7. Run `bun test tests/units-panel.test.tsx tests/project-domain-state.test.ts`.

### Task 7: Verify the integrated Project View

**Files:**
- Modify only if verification reveals a scoped defect.

1. Run focused Project tests:

```bash
bun test tests/project-screen-behavior.test.tsx tests/project-media-presentation.test.tsx tests/documents-panel.test.tsx tests/units-panel.test.tsx tests/project-domain-state.test.ts tests/project-reader.test.ts tests/ipc-security.test.ts tests/design-system.test.ts
```

2. Run `bun run typecheck`, `bun test`, and `bun run build`.
3. Open workspace `UX Testing Lab`, project `UX Tester`; verify Overview at normal desktop height, all document formats before selection, and video/audio/carousel Unit dialogs across every available social tab.
4. Confirm no purple selection ring remains inside Project content, keyboard focus is still obvious, and dialog close restores focus to the originating card.
5. Review `git diff --check` and the final scoped diff; leave unrelated dirty files unchanged.
