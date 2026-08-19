# Workspace Calendar Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved Calendar workspace tab over canonical Unit, Calendar Entry, Publication, Account, Metric, and Postiz data with pixel-faithful Month, Week, Agenda, Inspector, Ready drawer, and Schedule modal views.

**Architecture:** Core owns one transactional Calendar projection and all scheduling/cancellation business rules. Electron exposes narrow root-guarded IPC methods, and React renders the three views from the projection while keeping only transient view state. Existing SQLite columns, publication adapters, media preview resolution, design tokens, and dependencies are reused.

**Tech Stack:** Bun, TypeScript, `bun:sqlite`, the fixed Ralphy JSON bridge, Electron IPC, React 19, `lucide-react`, CSS, Vitest/Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-18-calendar-workbench-design.md`

## Global Constraints

- The supplied Calendar handoff is the visual and interaction source of truth.
- Calendar remains a projection over Unit, Calendar Entry, Publication, Account, and Metric records; do not add a renderer store or duplicate Postiz state.
- Use existing SQLite columns. Schema v9 only relaxes the publication-options integrity trigger so per-publication settings can differ from presentation defaults; it adds no tables or columns.
- Use native `Date` and `Intl.DateTimeFormat`; add no date/calendar dependency.
- Files written to either repository must contain English only.
- Preserve all unrelated dirty-worktree changes.
- UX Testing Lab QA may change local SQLite data but must not send, cancel, or update external Postiz publications.

---

### Task 1: Core Calendar Projection

**Files:**
- Create: `/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/cli/lib/calendar/workbench.ts`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/cli/lib/store/types.ts`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/cli/lib/bridge/methods.ts`
- Test: `/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/tests/integration/domain-calendar-workbench.test.ts`
- Test: `/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/tests/integration/cli-bridge-domain-contract.test.ts`

**Interfaces:**
- Produces: `getCalendarWorkspace({ context, from, to, timezone }): CalendarWorkspaceDto`.
- Produces bridge method: `calendar.overview` with workspace context, ISO range, and IANA timezone.
- Consumes existing Units, Unit Revisions, Presentations, Publications, Accounts, Projects, Metric Snapshots, Calendar Entries, and media relations.

- [ ] **Step 1: Write the failing projection test**

Create Unit revisions, presentations, one Calendar Entry, several Publications, an account with `relink_required`, and Metric Snapshots. Assert that one event groups the channel publications by pinned Unit revision, carries project/title/revision/preview data, derives `partial`, and reports account disconnection. Add unscheduled Units covering ready, review, blocked, and draft derivations.

```ts
const calendar = getCalendarWorkspace({
  context: { workspaceId },
  from: "2026-08-01T00:00:00.000Z",
  to: "2026-09-01T00:00:00.000Z",
  timezone: "Europe/Berlin",
});
expect(calendar.events).toHaveLength(1);
expect(calendar.events[0]).toMatchObject({ status: "partial", pinnedRevision: 3 });
expect(calendar.events[0]!.channels.map((channel) => channel.status)).toEqual([
  "published",
  "failed",
]);
expect(calendar.readyUnits.map((unit) => unit.readiness)).toEqual([
  "ready",
  "review",
  "blocked",
  "draft",
]);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `bun test tests/integration/domain-calendar-workbench.test.ts`

Expected: FAIL because `getCalendarWorkspace` and its DTOs do not exist.

- [ ] **Step 3: Implement the minimal transactional projection**

Add exact DTOs for `CalendarWorkspaceDto`, `CalendarEventDto`, `CalendarChannelPublicationDto`, `CalendarReadyUnitDto`, `CalendarAccountDto`, `CalendarProjectDto`, and `CalendarMetricsDto`. Use one read transaction and explicit SQL columns. Group Publications in memory by Calendar Entry `unit_revision_id`; derive statuses with pure functions exported for direct testing. Return preview references, not filesystem paths.

- [ ] **Step 4: Add and test the bridge read method**

Register `calendar.overview` as a read method, validate ISO range and timezone, add it to the capability inventory, and extend the bridge contract test to assert the exact result shape.

- [ ] **Step 5: Run focused Core tests**

Run: `bun test tests/integration/domain-calendar-workbench.test.ts tests/integration/cli-bridge-domain-contract.test.ts tests/integration/cli-bridge.test.ts`

Expected: PASS.

### Task 2: Core Calendar Draft and Postiz Mutations

**Files:**
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/cli/lib/calendar/workbench.ts`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/cli/lib/bridge/methods.ts`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/cli/lib/publication.ts`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/cli/lib/publish/mapping.ts`
- Test: `/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/tests/integration/domain-calendar-workbench.test.ts`
- Test: `/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/tests/integration/cli-publication-domain.test.ts`

**Interfaces:**
- Produces: `createCalendarEvent`, `submitCalendarEvent`, `rescheduleCalendarEvent`, `removeCalendarEvent`, and `retryCalendarEvent`.
- Produces bridge methods: `calendar.create`, `calendar.submit`, `calendar.reschedule`, `calendar.remove`, and `calendar.retry`.
- Accepts typed `CalendarChannelInput { presentationId, socialAccountId, settings }` and an injectable `PublicationProviderAdapter` in tests.

- [ ] **Step 1: Write failing local-draft and validation tests**

Assert that Save as draft creates one row-versioned Calendar Entry with no external adapter calls, stores pinned revision/channel/settings metadata, rejects cross-workspace revisions/accounts, rejects account/platform mismatches, and rejects unknown platform setting keys.

- [ ] **Step 2: Run and verify RED**

Run: `bun test tests/integration/domain-calendar-workbench.test.ts`

Expected: FAIL because Calendar workbench mutation functions do not exist.

- [ ] **Step 3: Implement the local draft mutation**

Use `withImmediateTransaction`, `newDomainId("calendar")`, explicit ownership queries, row-versioning, `metadata_json` for draft channel choices/settings, and `appendActivity`. Do not create Publications or call Postiz when `submit` is false.

- [ ] **Step 4: Write failing submit/reschedule/remove/retry tests**

Use an injected adapter that records operations. Assert deterministic idempotency, one immutable Publication per selected channel, partial failure preservation, remote cancel-before-replacement for reschedule, targeted retry of failed channels, and history-preserving removal.

- [ ] **Step 5: Run and verify RED**

Run: `bun test tests/integration/domain-calendar-workbench.test.ts tests/integration/cli-publication-domain.test.ts`

Expected: FAIL on missing scheduling behavior or settings passthrough.

- [ ] **Step 6: Implement minimal external orchestration and settings mapping**

Reuse `submitPublication` and `cancelPublication`. Extend their inputs only enough to accept per-publication settings and persist them in `effective_options_json`. Map the approved TikTok, Instagram, YouTube, and X fields into Postiz settings; reject unknown values at the Calendar boundary. A partial provider result updates the event projection but never erases successful channels.

- [ ] **Step 7: Register and verify bridge mutations**

Validate exact keys and workspace ownership in bridge methods. Return refreshed `CalendarEventDto` values. Keep external calls unreachable from local-draft tests.

- [ ] **Step 8: Run focused Core tests**

Run: `bun test tests/integration/domain-calendar-workbench.test.ts tests/integration/cli-publication-domain.test.ts tests/integration/cli-bridge-domain-contract.test.ts tests/integration/cli-bridge.test.ts`

Expected: PASS.

### Task 3: Desktop Calendar IPC Contract

**Files:**
- Create: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/electron/ralphy/calendar-reader.ts`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/electron/ralphy/types.ts`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/electron/media/types.ts`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/electron/main.ts`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/electron/preload.ts`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/src/lib/ipc.ts`
- Test: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/tests/calendar-contract.test.ts`
- Test: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/tests/ipc-security.test.ts`

**Interfaces:**
- Produces renderer bridge methods `loadCalendar`, `createCalendarDraft`, `submitCalendarEvent`, `rescheduleCalendarEvent`, `removeCalendarEvent`, and `retryCalendarEvent`.
- Consumes the Core Calendar methods from Tasks 1–2.

- [ ] **Step 1: Write failing contract and IPC tests**

Assert exact bridge capability/type coverage, root capture before requests, root assertion after requests, sender validation, bounded strings/arrays/settings, and rejection of unknown mutation actions.

- [ ] **Step 2: Run and verify RED**

Run: `bun run test -- tests/calendar-contract.test.ts tests/ipc-security.test.ts`

Expected: FAIL because Calendar IPC channels and reader do not exist.

- [ ] **Step 3: Implement narrow Calendar types and reader**

Mirror the Core DTOs in the fixed Desktop bridge contract. Follow `memory-reader.ts` for guarded requests and `workspace-reader.ts` for IPC registration. Resolve preview refs using existing media helpers; never expose absolute paths.

- [ ] **Step 4: Wire preload and renderer types**

Add explicit Calendar methods to `MediaWorkbenchBridge`, preload, and the renderer fallback. Do not expose generic bridge invocation.

- [ ] **Step 5: Run focused Desktop contract tests**

Run: `bun run test -- tests/calendar-contract.test.ts tests/ipc-security.test.ts tests/ralphy-client.test.ts tests/ralphy-current-core.test.ts`

Expected: PASS.

### Task 4: Calendar Presentation Logic

**Files:**
- Create: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/src/screens/calendar-presentation.ts`
- Test: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/tests/calendar-presentation.test.ts`

**Interfaces:**
- Produces: `monthDays`, `weekDays`, `groupAgenda`, `filterCalendarEvents`, `eventStatusSummary`, `calendarRange`, and `formatCalendarTime`.
- Consumes `CalendarEventDto` only and has no React/Electron dependency.

- [ ] **Step 1: Write failing pure-function tests**

Cover a six-row Month matrix across month boundaries, Monday-start Week range, NO TIME events, Agenda day groups, Needs attention/Drafts, project/platform/status filters, Clear all identity behavior, DST-safe display formatting, and hidden `+N` counts.

- [ ] **Step 2: Run and verify RED**

Run: `bun run test -- tests/calendar-presentation.test.ts`

Expected: FAIL because the presentation module does not exist.

- [ ] **Step 3: Implement with native Date and Intl only**

Keep functions small and deterministic. Represent day keys as local `YYYY-MM-DD` values derived through `Intl.DateTimeFormat(...).formatToParts`, not UTC string slicing.

- [ ] **Step 4: Run and verify GREEN**

Run: `bun run test -- tests/calendar-presentation.test.ts`

Expected: PASS.

### Task 5: Pixel-faithful Calendar Screen

**Files:**
- Create: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/src/screens/CalendarScreen.tsx`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/src/App.tsx`
- Modify: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/src/styles/workbench.css`
- Test: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/tests/calendar-screen.test.tsx`
- Test: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/tests/workspace-navigation.test.tsx`

**Interfaces:**
- Consumes the Calendar IPC methods from Task 3 and pure helpers from Task 4.
- Produces the workspace `calendar` route.

- [ ] **Step 1: Write failing screen behavior tests**

Render with a real Calendar projection and assert Month default, exact seven-day headings, view switching with selected event preserved, Filters/Clear all, day overflow, inspector/drawer exclusivity, Agenda filters, disconnected banners, local draft modal, Schedule N count, Platform settings screen, read-only mutations, keyboard day navigation, and Escape order.

- [ ] **Step 2: Run and verify RED**

Run: `bun run test -- tests/calendar-screen.test.tsx tests/workspace-navigation.test.tsx`

Expected: FAIL because the Calendar route still renders a placeholder.

- [ ] **Step 3: Implement the three views and shared chrome**

Build `CalendarScreen` from small local components in the same file until a component is genuinely reused elsewhere. Use semantic buttons/dialogs, focus-visible states, ARIA labels, and existing `lucide-react`. Keep Month/Week/Agenda geometry and copy literal to the handoff.

- [ ] **Step 4: Implement overlays, modal, and states**

Add the 372 px inspector, 312 px Ready drawer, day popover, 1280 px two-screen modal, Platform settings fields, empty cards, banners, loading skeleton, and load error. Make overlays absolute so the grid never shrinks. Drag opens the modal only.

- [ ] **Step 5: Apply exact Calendar CSS**

Use the approved surfaces, radii, spacing, fonts, opacity, status tones, motion durations, and reduced-motion rule. Add no decorative borders or inactive-row backgrounds not present in the handoff.

- [ ] **Step 6: Run focused renderer tests**

Run: `bun run test -- tests/calendar-screen.test.tsx tests/calendar-presentation.test.ts tests/workspace-navigation.test.tsx tests/design-system.test.ts`

Expected: PASS.

### Task 6: UX Testing Lab Data and Visual QA

**Files:**
- Modify local data only: the active UX Testing Lab SQLite database after a timestamped backup.
- Modify product files from earlier tasks only when visual comparison finds a verified mismatch.

**Interfaces:**
- Consumes the packaged Desktop app and the approved HTML references.
- Produces no fixture-only product path.

- [ ] **Step 1: Back up and seed UX Testing Lab locally**

Create a timestamped database backup. Add representative local Units, revisions, presentations, Calendar Entries, Accounts, Publications, and Metrics for scheduled, published, partial, failed, disconnected, no-time, ready, review, blocked, dense-day, and empty-filter cases. Use only local records and existing preview objects.

- [ ] **Step 2: Run full automated verification**

Core: `bun run lint && bun test tests/integration/`

Desktop: `bun run test && bun run build`

Expected: both commands exit 0 with no failing tests.

- [ ] **Step 3: Package and open the app**

Build/sign the normal app bundle, launch it, open UX Testing Lab → Calendar, and use the handoff reference viewport.

- [ ] **Step 4: Compare every approved state**

Verify Month, Week, Agenda, Inspector, Ready drawer, day overflow, Schedule content, Platform settings, empty Month, empty Ready drawer, empty Needs attention, Postiz read-only, account disconnected, failed publication, and load error. Correct only observed differences, adding a failing behavior test first for any functional defect.

- [ ] **Step 5: Re-run final verification after visual fixes**

Run the complete Core and Desktop commands again, inspect `git diff --check`, and run the Desktop signing verification.
