# Project Tabs Responsive Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign all six Project tabs as full-width responsive work surfaces and populate the archived Denti AI project with realistic production history for visual verification.

**Architecture:** Preserve the existing Project screen controller, DTOs, virtual paging, and independent scroll owners. Implement the redesign primarily in `workbench.css`, add one bounded column option to the existing media geometry helper, and add milestone presentation to the existing Activity timeline. Seed only missing Denti AI history with an idempotent SQLite transaction after a backup.

**Tech Stack:** React 19, TypeScript, CSS container queries, TanStack Virtual, Vitest, Electron geometry smoke tests, SQLite.

**Spec:** `docs/superpowers/specs/2026-08-17-project-tabs-responsive-redesign.md`

## Global Constraints

- Work only in `ralphy-desktop`; do not change sibling repositories.
- Do not add packages, routes, IPC channels, database tables, or DTO fields.
- Preserve every current Project controller, paging, mutation, scroll-memory, focus, and unsaved-document behavior.
- Keep Project content full-width on 2K and stack master/detail below the existing 720px project container breakpoint.
- Use existing `--canvas`, `--raised`, `--panel-solid`, `--hover`, `--selected`, radii, focus rings, and 4/8 spacing rhythm.
- Never update or delete existing Denti AI records. Fixture inserts must be scoped to workspace `ws_0f2fd33c-bfc6-4a75-83b4-2e1966aafe9f` and project `prj_2d9cceda-aacb-4675-821d-dd79d9623d68`.
- Preserve unrelated dirty-tree changes. Stage only reviewed task hunks with `git add -p` if committing.

---

### Task 1: Lock the 2K shell and Overview geometry

**Files:**
- Modify: `tests/design-system.test.ts:180-390`
- Modify: `src/styles/workbench.css:1820-2385`

**Interfaces:**
- Consumes: existing `.project-domain-body`, `.overview-dashboard`, and `@container project-domain` selectors.
- Produces: full-width Overview geometry used unchanged by the five other tab bodies.

- [ ] **Step 1: Extend the Chromium geometry test with a 2K viewport**

Add one shared viewport list inside the generated Electron script and use it for every screen:

```ts
const viewports = [[2560, 1400], [1360, 900], [1100, 720]];
for (const [screen, width, height] of ["workspace", "overview", "documents", "media", "compositions", "units", "activity"]
  .flatMap((screen) => viewports.map(([width, height]) => [screen, width, height]))) {
```

Update the result count to `21`, and add assertions that the 2K Overview is not capped:

```ts
const overview2k = results.find(({ screen, width }) => screen === "overview" && width === 2560)!;
expect(overview2k.overviewWidth).toBeGreaterThan(1440);
expect(overview2k.overviewColumns).toBe(12);
expect(workbenchStyles).not.toMatch(/\.overview-dashboard\s*\{[^}]*max-width:/s);
```

Keep the existing no-overflow, focus contrast, scroll-owner, readable document width, and forbidden-control assertions for all three viewports.

- [ ] **Step 2: Run the test and confirm the cap fails**

Run: `bun test tests/design-system.test.ts`

Expected: FAIL because `.overview-dashboard` still has `max-width: 1440px` and the 2K width is capped.

- [ ] **Step 3: Remove the artificial cap and balance the full-width cards**

Change only the existing Overview rules:

```css
.overview-dashboard {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  margin: 0;
}

.project-domain-body {
  min-height: 0;
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 20px 24px 32px;
  container-name: project-domain;
  container-type: inline-size;
}
```

Keep the existing two-column and 12-column container rules, but ensure all four main cards use their approved spans and no card introduces an outer border.

- [ ] **Step 4: Run the focused geometry test**

Run: `bun test tests/design-system.test.ts`

Expected: the new full-width assertions pass. If the pre-existing 1100x720 split-containment assertion still fails, leave it for Task 2 rather than weakening it.

- [ ] **Step 5: Commit the reviewed task hunks**

```bash
git add -p tests/design-system.test.ts src/styles/workbench.css
git commit -m "style: expand project overview across wide screens"
```

---

### Task 2: Normalize Documents, Compositions, and Units master/detail surfaces

**Files:**
- Modify: `tests/design-system.test.ts:360-430`
- Modify: `src/styles/workbench.css:2484-3186`

**Interfaces:**
- Consumes: existing DOM from `DocumentsPanel`, `CompositionsPanel`, and `UnitsPanel`; existing 720px project container breakpoint.
- Produces: consistent two-pane geometry, compact empty states, and vertically contained narrow layouts without changing component logic.

- [ ] **Step 1: Add failing static and geometry expectations**

Add a focused contract test:

```ts
test("uses one calm responsive master detail language", () => {
  expect(workbenchStyles).toMatch(/\.documents-workbench,[\s\S]*gap:\s*16px/s);
  expect(workbenchStyles).toMatch(/\.documents-detail[\s\S]*border-radius:\s*var\(--radius-lg\)[^}]*background:\s*var\(--raised\)/s);
  expect(workbenchStyles).toMatch(/\.composition-detail[\s\S]*border-radius:\s*var\(--radius-lg\)[^}]*background:\s*var\(--raised\)/s);
  expect(workbenchStyles).toMatch(/\.units-detail[\s\S]*border-radius:\s*var\(--radius-lg\)[^}]*background:\s*var\(--raised\)/s);
  expect(workbenchStyles).toMatch(/\.composition-output-preview:has\(\.preview-empty\)[^}]*height:\s*160px/s);
  expect(workbenchStyles).not.toMatch(/\.(?:documents-detail|composition-detail|units-detail)\s*\{[^}]*border:\s*1px/s);
});
```

Retain the geometry assertion that every master/detail split and both panes are vertically contained at 1100x720.

- [ ] **Step 2: Run the test and confirm Compositions fails the shared surface contract**

Run: `bun test tests/design-system.test.ts`

Expected: FAIL because `.composition-detail` still uses the canvas and no rounded raised surface; the known 1100x720 containment failure may also remain.

- [ ] **Step 3: Apply the minimum shared geometry using existing selectors**

Keep three existing workbench classes and group only identical declarations:

```css
.documents-workbench,
.composition-workbench,
.units-workbench {
  display: grid;
  height: 100%;
  min-width: 0;
  min-height: 0;
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
  gap: 16px;
}

.documents-detail,
.composition-detail,
.units-detail {
  min-width: 0;
  min-height: 0;
  border: 0;
  border-radius: var(--radius-lg);
  background: var(--raised);
}
```

Update sticky detail headers to use `background: var(--raised)`. Scope the compact empty state to direct detail children so global loading and error states stay unchanged:

```css
.documents-detail > .empty-section,
.composition-detail > .empty-section,
.units-detail > .empty-section {
  height: 100%;
  min-height: 0;
  padding: 24px;
  text-align: center;
}
```

At `max-width: 719px`, keep a single column and use bounded master rows plus `minmax(0, 1fr)` for detail. Remove duplicate composition-only breakpoint rules once the common rule covers them.

- [ ] **Step 4: Keep section hierarchy calm inside detail panes**

Use `var(--panel-solid)` for meaningful detail sections and `var(--raised)` for the containing detail. Replace separator-only Unit sections with borderless cards, and collapse an empty Composition output without changing a real preview:

```css
.unit-items,
.unit-presentations,
.unit-visual-section,
.composition-revision-detail section {
  margin-top: 12px;
  padding: 16px;
  border: 0;
  border-radius: var(--radius-md);
  background: var(--panel-solid);
}

.composition-output-preview:has(.preview-empty) {
  height: 160px;
  min-height: 160px;
}
```

Keep Technical details as a low-contrast disclosure outside these cards. Do not add borders to rows or nested cards. Keep hover and selection geometry identical.

- [ ] **Step 5: Run the geometry and component tests**

Run:

```bash
bun test tests/design-system.test.ts tests/documents-panel.test.tsx tests/composition-view.test.tsx tests/units-panel.test.tsx
```

Expected: PASS, including `splitVerticalContained: true` at 1100x720.

- [ ] **Step 6: Commit the reviewed task hunks**

```bash
git add -p tests/design-system.test.ts src/styles/workbench.css
git commit -m "style: unify project master detail tabs"
```

---

### Task 3: Keep the Media grid readable on 2K

**Files:**
- Modify: `src/lib/media.ts:1-18`
- Modify: `src/components/VirtualAssetGrid.tsx:205-235`
- Modify: `src/styles/workbench.css:3240-3585`
- Test: `tests/media-grid.test.ts:125-140`
- Test: `tests/project-media-presentation.test.tsx:70-150`

**Interfaces:**
- Consumes: `assetGridGeometry(width, targetTileWidth, gap)` and existing density values.
- Produces: `assetGridGeometry(width, targetTileWidth, gap, maxColumns?)` with the original three-argument behavior preserved.

- [ ] **Step 1: Add a failing bounded-column test**

```ts
test("caps project media density without changing normal geometry", () => {
  expect(assetGridGeometry(1000, 190, 16)).toMatchObject({ columns: 4 });
  expect(assetGridGeometry(2300, 230, 16, 7)).toMatchObject({ columns: 7 });
});
```

- [ ] **Step 2: Run the focused test and confirm the fourth argument is unsupported**

Run: `bun test tests/media-grid.test.ts`

Expected: FAIL because the existing helper produces more than seven columns.

- [ ] **Step 3: Add the optional native clamp**

```ts
export function assetGridGeometry(
  width: number,
  targetTileWidth: number,
  gap: number,
  maxColumns = Number.POSITIVE_INFINITY,
): AssetGridGeometry {
  const safeWidth = Math.max(1, Number.isFinite(width) ? width : 1);
  const safeGap = Math.max(0, Number.isFinite(gap) ? gap : 0);
  const naturalColumns = Math.max(1, Math.floor((safeWidth + safeGap) / (Math.max(1, Number.isFinite(targetTileWidth) ? targetTileWidth : 1) + safeGap)));
  const columns = Math.min(naturalColumns, Math.max(1, Math.floor(maxColumns)));
  const tileWidth = Math.max(1, (safeWidth - safeGap * (columns - 1)) / columns);
  const tileHeight = Math.max(1, tileWidth * 0.625) + 54;
  return { columns, tileWidth, tileHeight, rowHeight: tileHeight + safeGap, gap: safeGap };
}
```

Call it from the Project grid with `assetGridGeometry(width, density, 16, 7)`. No other caller changes.

- [ ] **Step 4: Tighten the toolbar and card presentation in CSS**

Keep the existing borderless tile and rounded `.asset-preview`. Reduce toolbar gap to `8px`, preserve wrapping, keep `.media-item-count { margin-left: auto; }`, and ensure the preview remains flush to the tile with copy padding only below it. Add no card border or nested background.

- [ ] **Step 5: Run Media tests**

Run:

```bash
bun test tests/media-grid.test.ts tests/project-media-presentation.test.tsx tests/design-system.test.ts
```

Expected: PASS; existing keyboard selection, double-click, context menu, paging, and preview behavior remain unchanged.

- [ ] **Step 6: Commit the reviewed task hunks**

```bash
git add -p src/lib/media.ts src/components/VirtualAssetGrid.tsx src/styles/workbench.css tests/media-grid.test.ts tests/project-media-presentation.test.tsx
git commit -m "style: keep project media readable on wide screens"
```

---

### Task 4: Turn Activity into a realistic milestone timeline

**Files:**
- Modify: `src/screens/project/ActivityTimeline.tsx:8-70`
- Modify: `src/styles/workbench.css:3387-3475`
- Test: `tests/activity-timeline.test.tsx:10-120`

**Interfaces:**
- Consumes: unchanged `ActivityDto` fields `sequence`, `entityType`, `entityId`, `action`, and `createdAt`.
- Produces: `activity-event is-milestone` presentation derived only from action text; no DTO or IPC changes.

- [ ] **Step 1: Add a failing milestone presentation assertion**

Change the test helper so event 1 is a completed milestone and assert one marker:

```ts
const event = (sequence: number, createdAt = 1_767_225_600 + sequence): ActivityDto => ({
  sequence,
  workspaceId: "workspace-1",
  projectId: "project-1",
  entityType: sequence === 1 ? "project" : "run",
  entityId: sequence === 1 ? "Launch" : `run-${sequence}`,
  action: sequence === 1 ? "project.completed" : "generation.updated",
  createdAt,
});

expect(host.container.querySelectorAll(".activity-event.is-milestone")).toHaveLength(1);
expect(host.container.querySelectorAll(".activity-marker")).toHaveLength(1);
expect(host.container.textContent).toContain("Project completed");
```

- [ ] **Step 2: Run the Activity test and confirm it fails**

Run: `bun test tests/activity-timeline.test.tsx`

Expected: FAIL because the milestone class and marker do not exist.

- [ ] **Step 3: Add one local action classifier and marker**

```tsx
const isMilestone = (action: string) => /(?:completed|archived|selected|sealed|resolved)$/i.test(action);

const milestone = isMilestone(value.value.action);
return <li
  className={`activity-row activity-event${milestone ? " is-milestone" : ""}`}
  data-action={value.value.action}
  key={row.key}
  style={{ height: row.size, transform: `translateY(${row.start}px)` }}
>
  {milestone ? <span className="activity-marker" aria-hidden="true" /> : null}
  <time dateTime={date.toISOString()}>{time}</time>
  <strong>{humanize(value.value.action)}</strong>
  <span>{humanize(value.value.entityType)} · {value.value.entityId}</span>
</li>;
```

Keep the existing virtualization, order, day grouping, cursor tail, scroll memory, and non-interactive rows.

- [ ] **Step 4: Style full-width calm event surfaces**

Use a stable four-column grid for marker, time, action, and entity; reserve the marker column for every row so milestone state cannot move content. Use `var(--raised)` only on hover and milestone rows, a semantic dot for `.activity-marker`, no border, and the existing two-row compact layout below 720px. Increase the virtualizer event estimate only if the measured narrow row height requires it.

- [ ] **Step 5: Run Activity and geometry tests**

Run:

```bash
bun test tests/activity-timeline.test.tsx tests/design-system.test.ts
```

Expected: PASS; Activity retains one scroll owner and no buttons or loaded-page filters.

- [ ] **Step 6: Commit the reviewed task hunks**

```bash
git add -p src/screens/project/ActivityTimeline.tsx src/styles/workbench.css tests/activity-timeline.test.tsx
git commit -m "style: present project activity as milestones"
```

---

### Task 5: Seed the archived Denti AI production history

**Files:**
- Read/write: `/Users/maximovchinnikov/.ralphy/ralphy.db`
- Create backup: `/Users/maximovchinnikov/.ralphy/ralphy.db.backup-20260817-project-tabs`

**Interfaces:**
- Consumes: existing `activity_events`, `project_iterations`, and `feedback_items` tables.
- Produces: 18 Activity rows, two closed iterations, and three resolved feedback rows scoped to `Denti Perio Pitch 001`.

- [ ] **Step 1: Confirm the exact target and absence of the fixture history**

Run:

```bash
sqlite3 /Users/maximovchinnikov/.ralphy/ralphy.db "SELECT id,name FROM projects WHERE id='prj_2d9cceda-aacb-4675-821d-dd79d9623d68'; SELECT count(*) FROM activity_events WHERE project_id='prj_2d9cceda-aacb-4675-821d-dd79d9623d68'; SELECT count(*) FROM project_iterations WHERE project_id='prj_2d9cceda-aacb-4675-821d-dd79d9623d68';"
```

Expected: exact project name `Denti Perio Pitch 001`; Activity and iterations are still empty before insertion.

- [ ] **Step 2: Create and verify the recoverable backup**

Run only if the destination does not already exist:

```bash
test ! -e /Users/maximovchinnikov/.ralphy/ralphy.db.backup-20260817-project-tabs
cp /Users/maximovchinnikov/.ralphy/ralphy.db /Users/maximovchinnikov/.ralphy/ralphy.db.backup-20260817-project-tabs
sqlite3 /Users/maximovchinnikov/.ralphy/ralphy.db.backup-20260817-project-tabs "PRAGMA integrity_check;"
```

Expected: `ok`.

- [ ] **Step 3: Insert the approved history in one idempotent transaction**

Execute this SQL with `sqlite3 /Users/maximovchinnikov/.ralphy/ralphy.db`:

```sql
BEGIN IMMEDIATE;

INSERT OR IGNORE INTO project_iterations
  (id, project_id, number, title, reason, state, created_at, closed_at)
VALUES
  ('iter_denti_perio_01', 'prj_2d9cceda-aacb-4675-821d-dd79d9623d68', 1, 'Initial product demo', 'Establish the Perio narrative and visual direction.', 'closed', 1784795505348, 1784819459036),
  ('iter_denti_perio_02', 'prj_2d9cceda-aacb-4675-821d-dd79d9623d68', 2, 'Clinic CTA refinement', 'Refine the voiceover, Dentrix proof, and final CTA.', 'closed', 1785250051995, 1786301683658);

INSERT OR IGNORE INTO feedback_items
  (id, iteration_id, target_type, target_id, timecode_ms, body, status, resolution_note, created_at, resolved_at)
VALUES
  ('fb_denti_perio_01', 'iter_denti_perio_01', 'composition', 'comp_1c99098a-c9bc-42d0-8d64-cace8dbd3a38', 8200, 'Bring the product proof earlier in the cut.', 'resolved', 'Proof moved before the first CTA.', 1784812000000, 1784819459036),
  ('fb_denti_perio_02', 'iter_denti_perio_02', 'unit', 'unit_fdea1df9-5b20-4065-823b-51c4a8e09677', 14600, 'Hold the Dentrix result long enough to read.', 'resolved', 'Result hold extended in the selected revision.', 1785313000000, 1785317174318),
  ('fb_denti_perio_03', 'iter_denti_perio_02', 'unit', 'unit_ebc8f53b-fec7-4878-80c9-ce4d79932a4a', 22100, 'Use the clinic CTA for the delivery cut.', 'resolved', 'Clinic CTA unit selected for delivery.', 1785863200000, 1786301683658);

WITH events(entity_type, entity_id, action, created_at) AS (VALUES
  ('document', 'doc_b36d7ccc-4c9b-4c00-8a39-cfe52a620fab', 'brief.created', 1784795505348),
  ('document', 'doc_620c139f-2913-4974-88ae-33f8631def38', 'production-plan.created', 1784796329647),
  ('document', 'doc_a583e55b-4a2e-4712-844a-55a0423d017e', 'style-lock.approved', 1784796385352),
  ('iteration', 'iter_denti_perio_01', 'iteration.started', 1784806423440),
  ('composition', 'comp_1c99098a-c9bc-42d0-8d64-cace8dbd3a38', 'composition.created', 1784810084453),
  ('run', 'run_3b1672dc-a78c-4796-8ff3-92c10588b322', 'generation.completed', 1784810145641),
  ('run', 'run_9a6d78f7-b996-4b05-8325-c635b06084f0', 'generation.completed', 1784810219959),
  ('iteration', 'iter_denti_perio_01', 'iteration.completed', 1784819459036),
  ('unit', 'unit_d857ce16-73bf-48eb-8ffb-a7c3fed2be60', 'unit.assembled', 1785250051995),
  ('unit', 'unit_9badc38c-e05e-4117-88c4-b02d70d4f3c2', 'unit.revised', 1785250145801),
  ('iteration', 'iter_denti_perio_02', 'iteration.started', 1785250200000),
  ('unit', 'unit_fdea1df9-5b20-4065-823b-51c4a8e09677', 'unit.assembled', 1785312665335),
  ('unit', 'unit_e9b533a9-ab57-4771-8404-a387f4ba571d', 'unit.selected', 1785317174318),
  ('unit', 'unit_ebc8f53b-fec7-4878-80c9-ce4d79932a4a', 'unit.assembled', 1785863032476),
  ('composition', 'comp_1c99098a-c9bc-42d0-8d64-cace8dbd3a38', 'revision.sealed', 1786301500000),
  ('composition', 'comp_1c99098a-c9bc-42d0-8d64-cace8dbd3a38', 'final.selected', 1786301683658),
  ('iteration', 'iter_denti_perio_02', 'iteration.completed', 1786301683658),
  ('project', 'prj_2d9cceda-aacb-4675-821d-dd79d9623d68', 'project.archived', 1786388083658)
)
INSERT INTO activity_events
  (workspace_id, project_id, entity_type, entity_id, action, payload_json, created_at)
SELECT
  'ws_0f2fd33c-bfc6-4a75-83b4-2e1966aafe9f',
  'prj_2d9cceda-aacb-4675-821d-dd79d9623d68',
  entity_type,
  entity_id,
  action,
  '{}',
  created_at
FROM events
WHERE NOT EXISTS (
  SELECT 1 FROM activity_events existing
  WHERE existing.project_id='prj_2d9cceda-aacb-4675-821d-dd79d9623d68'
    AND existing.entity_type=events.entity_type
    AND existing.entity_id=events.entity_id
    AND existing.action=events.action
);

COMMIT;
```

- [ ] **Step 4: Verify scope and integrity**

Run:

```bash
sqlite3 /Users/maximovchinnikov/.ralphy/ralphy.db "PRAGMA integrity_check; SELECT count(*) FROM activity_events WHERE project_id='prj_2d9cceda-aacb-4675-821d-dd79d9623d68'; SELECT number,title,state FROM project_iterations WHERE project_id='prj_2d9cceda-aacb-4675-821d-dd79d9623d68' ORDER BY number; SELECT count(*) FROM feedback_items WHERE iteration_id IN ('iter_denti_perio_01','iter_denti_perio_02');"
```

Expected: `ok`, `18`, two closed iterations, and `3` feedback rows.

---

### Task 6: Run complete verification and leave Denti AI open

**Files:**
- Verify only: all files changed in Tasks 1-4
- Runtime: current Electron development app

**Interfaces:**
- Consumes: completed responsive styles, Media geometry clamp, Activity presentation, and seeded Denti AI history.
- Produces: evidence that the requested UI works at 2K and smaller sizes with no regressions.

- [ ] **Step 1: Run focused checks**

```bash
bun test tests/design-system.test.ts tests/documents-panel.test.tsx tests/composition-view.test.tsx tests/units-panel.test.tsx tests/media-grid.test.ts tests/project-media-presentation.test.tsx tests/activity-timeline.test.tsx
bun run typecheck
```

Expected: PASS.

- [ ] **Step 2: Run full repository checks**

```bash
bun test
bun run build
git diff --check
```

Expected: build and diff check pass. If the previously known `tests/design-system.test.ts` split-vertical assertion still fails unchanged, report it with exact output; do not weaken the assertion.

- [ ] **Step 3: Restart the current Electron development app against the bundled Ralphy CLI**

```bash
RALPHY_BIN='/Applications/Ralphy Media.app/Contents/Resources/bin/ralphy' bun run start
```

Expected: one current development window opens with the live `/Users/maximovchinnikov/.ralphy` library.

- [ ] **Step 4: Verify maximized 2K UI first**

Open `Denti Ai` → `Denti Perio Pitch 001` and inspect Overview, Documents, Media, Compositions, Units, and Activity. For each tab verify full-width use, calm borderless surfaces, stable hover/selection/focus geometry, correct scroll ownership, and readable card density. Open at least one Document, Composition, and Unit. Confirm Activity shows 18 events grouped across multiple days and highlights completion/archive milestones.

- [ ] **Step 5: Verify medium and narrow windows, then restore 2K**

Inspect a representative 1360x900 window and a width below the 720px project-container breakpoint. Confirm toolbar wrapping, master/detail stacking, no horizontal overflow, and reachable focused controls. Restore the maximized 2K window on Denti AI Activity before handoff.

- [ ] **Step 6: Review the final scoped diff and repository status**

```bash
git status --short
git diff -- src/styles/workbench.css src/lib/media.ts src/components/VirtualAssetGrid.tsx src/screens/project/ActivityTimeline.tsx tests/design-system.test.ts tests/media-grid.test.ts tests/project-media-presentation.test.tsx tests/activity-timeline.test.tsx docs/superpowers/specs/2026-08-17-project-tabs-responsive-redesign.md docs/superpowers/plans/2026-08-17-project-tabs-responsive-redesign.md
```

Expected: only intended hunks are present alongside previously existing unrelated dirty files; no `.ds-sync/` or `ds-bundle/` files are staged or modified.
