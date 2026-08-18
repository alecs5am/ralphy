# Workspace Calendar Workbench Design

## Goal

Implement the approved Calendar handoff as a production workspace tab backed by the canonical Ralphy Unit, Calendar Entry, Publication, Social Account, and Metric records. The result must be visually faithful to the supplied Month, Week, Agenda, Inspector, Ready drawer, Schedule modal, Platform settings, empty, error, and read-only designs.

Calendar is not a second publishing system. One visible event represents one pinned Unit revision and groups its channel publications. Postiz remains the external scheduling rail, while SQLite remains the local durable source for Unit identity, pinned revision, event placement, publication snapshots, account health, and operation history.

## Scope

The implementation includes:

- Month, Week, and Agenda views with the exact layout, surfaces, typography, spacing, states, and copy from the handoff.
- Event inspector, Ready to schedule drawer, day overflow popover, filter controls with Clear all, and the two-screen Schedule content modal.
- Real workspace data for events, ready units, projects, accounts, publication status, pinned revisions, thumbnails, and metrics.
- Local draft creation and editing.
- Postiz scheduling, publish-now, retry, move/reschedule, cancellation, and reconnect affordances through canonical publication operations.
- Read-only degradation when Postiz is unavailable and non-blocking metric refresh failures.
- Keyboard navigation and the documented Escape close order.
- Representative UX Testing Lab records for visual verification without sending external publications.

The implementation does not add a second calendar table, copy Postiz state into renderer-owned storage, or add a general scheduling framework.

## Approved Visual Contract

The files under `design_handoff_calendar/` are the visual source of truth. Product code must use the existing local AWS Diatype fonts, `lucide-react`, and existing preview/media resolution instead of prototype-only scripts or fixture images.

Key invariants:

- Canvas `#181818`; day/panel surface `#1D1D1D`; raised controls `#2D2D2D`; selected rows `#3A3A3A`; dark segmented wells `#111111`.
- No decorative borders. Inset highlights and the documented hour/grid lines are the only separators.
- Month is a seven-column, six-row grid with 6 px gaps and 14 px day-cell radii.
- Week covers 08:00–21:00 with 46 px hour rows and a separate NO TIME lane.
- Agenda is a flat review list with All, Needs attention, and Drafts filters.
- Inspector is a 372 px overlay; Ready drawer is a 312–316 px overlay. Neither shrinks the calendar grid, and they are mutually exclusive.
- The Schedule content modal is a 1280 px, 24 px radius window. Platform settings is its second screen, not a nested modal.
- Event thumbnails come from the pinned revision. Account identity uses the existing deterministic dither treatment; dither never encodes status.
- Motion uses the handoff's 90/160/220 ms timings and is disabled by `prefers-reduced-motion`.
- Empty and error states preserve the calendar geometry.

## Canonical Data Model

The existing tables remain authoritative:

- `units` identifies content and the current selected revision.
- `unit_revisions` and `unit_presentations` provide the pinned revision, channel presentation, captions, preview sources, and platform defaults.
- `calendar_entries` stores one planned event: workspace, scheduled instant or no-time draft, pinned Unit revision, target platforms, state, and row version.
- `publications` stores immutable per-channel submission snapshots, including account, effective settings, remote identifier, scheduled time, state, errors, and URLs.
- `social_accounts` stores account identity and reconnect state.
- `metric_snapshots` stores published performance data.

No schema expansion is required for the first implementation. Existing `calendar_entries.unit_revision_id`, `scheduled_at`, `platforms_json`, `state`, `metadata_json`, and row-version fields cover the event and draft state. Existing publication `effective_options_json` stores per-publication settings.

The Calendar projection exposes the handoff shape:

```ts
type CalendarWorkspace = {
  timezone: string;
  postiz: { available: boolean; lastSyncedAt: number | null; error: string | null };
  events: CalendarEvent[];
  readyUnits: ReadyUnit[];
  projects: CalendarProject[];
  accounts: CalendarAccount[];
};

type CalendarEvent = {
  id: string;
  rowVersion: number;
  unitId: string;
  unitRevisionId: string;
  title: string;
  projectId: string | null;
  project: string;
  kind: string;
  thumbnail: CalendarPreviewRef | null;
  at: number | null;
  timezone: string;
  pinnedRevision: number;
  unitSelectedRevision: number | null;
  status: "draft" | "scheduled" | "uploading" | "published" | "partial" | "failed";
  channels: CalendarChannelPublication[];
  metrics: CalendarMetrics | null;
};
```

Event status is derived, never separately edited: all published means published; published plus a failed/disconnected channel means partial; any remaining failure means failed; an in-flight submission means uploading; no time means draft; otherwise scheduled.

Ready status is also derived: a Unit is ready when it has a selected revision, usable presentations, resolved accounts, and no active calendar event; latest-versus-selected divergence is review; missing selection/presentation/account or a relink requirement is blocked; existing Postiz/local no-time work is draft.

## Core Contract

Core adds the smallest Calendar-specific contract needed by Desktop:

- `calendar.overview`: a bounded workspace/range read returning the composite projection in one consistent SQLite transaction.
- `calendar.create`: create a local event or no-time draft with a pinned revision, selected accounts, per-publication options, timezone, and row-versioned Calendar Entry.
- `calendar.update`: retain the existing row-versioned local patch operation for draft placement and event metadata.
- `calendar.submit`: schedule or publish-now selected channel publications using deterministic idempotency keys, then return the refreshed event.
- `calendar.reschedule`: cancel affected remote scheduled publications, submit immutable replacements linked through `revisedFromPublicationId`, and update the Calendar Entry.
- `calendar.remove`: cancel cancellable channel publications and move the Unit out of the visible schedule without deleting history.
- Existing publication retry, lookup, cancel, metric refresh, and account relink capabilities remain the implementation primitives and are not duplicated.

All Calendar mutation methods validate workspace ownership, pinned revision ownership, presentation/account/platform compatibility, date/time values, settings shape, and row version before side effects. External operations are idempotent. Partial provider outcomes remain visible as per-channel failures; they do not roll back successful remote publications or erase local evidence.

`calendar.create` with `submit: false` performs only local SQLite writes. This is the path used by Save as draft and by UX Testing Lab visual QA. Drag-and-drop only opens the modal and performs no write.

## Desktop Boundary

Electron adds one guarded Calendar reader/command module following the existing Memory and Workspace readers. It validates IPC payloads, captures the active root, calls the fixed Core bridge methods, and resolves preview references through the existing media protocol. No unrestricted bridge method or filesystem path is exposed to the renderer.

The renderer receives typed Calendar methods on `window.ralphy`:

- load a date range;
- create/save a draft;
- submit, reschedule, retry, publish now, or remove an event;
- refresh metrics;
- open the associated Unit or published URL.

Activity synchronization invalidates the current range after Calendar, Publication, Unit selection, Account, or Metric changes. The screen keeps its selected event when switching view modes and refreshes the inspector from the returned projection.

## Renderer Components and State

`CalendarScreen` owns only view state:

```ts
type CalendarViewState = {
  view: "month" | "week" | "agenda";
  anchorDate: Date;
  filters: { projectIds: string[]; platforms: string[]; statuses: string[] };
  selectedEventId: string | null;
  rightPanel: "inspector" | "drawer" | null;
  openDayPopover: string | null;
  agendaFilter: "all" | "attention" | "drafts";
};
```

Small view components cover the three modes, right overlay, modal, filters, and states. Date grouping, month matrix construction, event status, counts, and filter predicates live in one pure presentation module with focused tests. Native `Date` and `Intl.DateTimeFormat` provide calendar/timezone formatting; no date or calendar dependency is added.

Interaction rules follow the handoff exactly:

- event click opens/replaces the inspector;
- inspector and Ready drawer are exclusive;
- day overflow closes on outside click, close, or Escape;
- Escape closes popover, then right panel, then modal;
- drag from Ready opens the modal with a prefilled date and never publishes;
- filter chips remove individually and Clear all removes every filter;
- view changes preserve the selected event and focus its period;
- arrow keys navigate days and Enter opens the first event in the focused day;
- unavailable Postiz leaves reads enabled and disables every remote mutation.

## Platform Settings

Settings are stored on the publication snapshot, not the social account. The modal exposes the exact approved fields:

- TikTok: visibility, comments, duet, stitch, branded content, trending audio.
- Instagram: Reel/Post/Story, share to feed, collaborator, location.
- YouTube: title, description, visibility, made for kids, playlist.
- X: reply audience, thread, copy alt text.

Core maps these typed values to the existing Postiz settings payload. Unknown keys are rejected at the bridge boundary. Reconnect-required accounts cannot be selected, but their edited settings remain local when a draft is saved.

## Failure and Read-only Behavior

- Postiz unavailable: show the handoff banner and cached/local schedule, disable remote mutations, allow local draft editing, and expose Try again.
- Account disconnected: show account and affected-event warnings; exclude the account from the schedule count until relinked.
- Partial schedule: retain all channel results and show retry only for failed channels.
- Range load failure: keep the grid skeleton and show error code, timestamp, Try again, and Copy log.
- Metrics refresh failure: retain the event and previous metrics with the last successful sync time.
- Row-version conflict: reload the affected event and ask the user to repeat the edit against current data.

## Verification

Core tests cover projection grouping, status derivation, ready derivation, workspace isolation, row-version conflicts, settings validation, idempotent scheduling, partial outcomes, reschedule cancellation/replacement, and local-only drafts with injected provider adapters.

Desktop tests cover IPC allowlisting and validation, pure date/filter/status derivations, all three view states, Clear all, overlay exclusivity, Escape order, modal channel counts, disconnected accounts, and read-only behavior.

Visual verification uses the packaged app on UX Testing Lab at the handoff's reference viewport. The workspace may be seeded with local Calendar Entry, Publication, Account, Metric, and Unit records and real local previews. Verification must not call Postiz or publish externally. Month, Week, Agenda, Inspector, Ready drawer, Schedule modal, Platform settings, empty, filter-empty, load-error, and Postiz-read-only states are compared against the supplied HTML references.

## Rejected Approaches

- Renderer-side joins over many generic bridge calls: rejected because they are inconsistent across pages, expensive, and duplicate domain derivation.
- A separate Calendar/renderer event store: rejected because it would drift from Unit and Publication state.
- Fixture-backed product UI: rejected because the user requested the same production integration standard as Memory.
- Nested Platform settings modal or a channels-by-days Week grid: rejected by the approved handoff.
