import { Boxes, CalendarDays } from "lucide-react";
import { useState } from "react";
import type { WorkspaceCalendarNavigationContext, WorkspacePage } from "../../state/workbench";
import { DetailDialog } from "./DetailDialog";
import {
  ACTION_QUIET,
  BLOCK_TITLE,
  DRAWER_ACTION,
  DRAWER_CELL,
  DRAWER_CELL_TITLE,
  GLYPH,
  GLYPH_MARK,
  PLATE,
  PLATE_COPY,
  PLATE_TITLE,
  ROW,
  ROW_SPLIT,
  SECTION_HALF,
  SECTION_HEADING,
  SECTION_META,
  SECTION_TITLE,
} from "./overview-chrome";
import type {
  Availability,
  PlanCoveragePresentation,
  PublishingEventPresentation,
  ReadyUnscheduledPresentation,
  UnitOutcomeGroups,
  UnitOutcomePresentation,
  WorkspaceOverviewPresentation,
  WorkspacePlanPresentation,
} from "./overview-presentation";
import { COMMAND_BUTTON } from "../route-chrome";

interface Props {
  value: Pick<WorkspaceOverviewPresentation, "plan" | "outcomes">;
  onOpenPage(page: WorkspacePage, returnFocusId: string): void;
  onOpenCalendar?(context: WorkspaceCalendarNavigationContext | undefined, returnFocusId: string): void;
  onOpenUnit(projectId: string, unitId: string, unitLabel: string, returnFocusId: string): void;
}

const attentionStates = new Set(["failed", "reconciliation_required", "unknown"]);

/* A list that draws its own rows: the list resets the browser's own list geometry, each row
   states the cell surface it stands on. */
const PLAIN_LIST = "m-0 grid list-none p-0";
const ROW_LABEL = "type-xs font-normal text-muted";
/* The coverage bar. A native <progress> paints the platform's own accent — a raw green on a
   monochrome desk — so the element drops its appearance and states both of its parts as
   surfaces. The two pseudo-elements have no utility of their own, hence the two selectors. */
const COVERAGE_BAR = "col-span-full h-1.5 w-full appearance-none overflow-hidden rounded-control bg-surface [&::-webkit-progress-bar]:bg-surface [&::-webkit-progress-value]:bg-ink";
const EVENT_NOTE = "m-0 mt-1 block type-xs leading-5 text-muted";

function unavailable(title: string, reason: string) {
  return <div className={PLATE} role="note"><strong className={PLATE_TITLE}>{title}</strong><p className={PLATE_COPY}>{reason.replace(/^./, (letter) => letter.toUpperCase())}</p></div>;
}

function statusLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function accountLabel(event: PublishingEventPresentation, accountId: string | null): string {
  if (!accountId) return "Account unavailable";
  const account = event.accounts?.find((candidate) => candidate.id === accountId);
  return account?.username ? `@${account.username.replace(/^@/, "")}` : account?.displayName ?? "Account details unavailable";
}

function DayStrip({ days, events }: { days: number[]; events: PublishingEventPresentation[] }) {
  const counts = new Map<string, number>();
  for (const event of events) {
    const key = new Date(event.scheduledAt).toDateString();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return <ol className="workspace-plan-days my-4 grid list-none grid-cols-(--workspace-day-columns) gap-1 overflow-x-hidden bg-transparent p-0" aria-label="Next 14 days publishing density">
    {days.map((value) => {
      const date = new Date(value);
      const count = counts.get(date.toDateString()) ?? 0;
      return <li className="grid gap-1 rounded-control bg-surface-sunken p-2 text-center font-code type-xs text-muted" key={date.toISOString()} aria-label={`${date.toLocaleDateString(undefined, { dateStyle: "full" })}: ${count} scheduled content event${count === 1 ? "" : "s"}`}>
        <time dateTime={date.toISOString()}>{date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</time>
        <span className="text-muted">{count}</span>
      </li>;
    })}
  </ol>;
}

function ContentEvent({ event, onOpenCalendar, onOpenUnit, onOpenUnits }: {
  event: PublishingEventPresentation;
  onOpenCalendar(context: WorkspaceCalendarNavigationContext, returnFocusId: string): void;
  onOpenUnit(projectId: string, unitId: string, unitLabel: string, returnFocusId: string): void;
  onOpenUnits(returnFocusId: string): void;
}) {
  const blocked = event.publications.filter((publication) => attentionStates.has(publication.state)).length;
  const unitLabel = event.unit?.slug ?? "Unit details unavailable";
  const dateLabel = new Date(event.scheduledAt).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });
  const firstAccount = event.accounts[0];
  const calendarContext = {
    label: unitLabel,
    date: event.scheduledAt,
    unitId: event.unitId,
    accountId: firstAccount?.id,
    accountLabel: firstAccount?.username ? `@${firstAccount.username.replace(/^@/, "")}` : firstAccount?.displayName ?? undefined,
  } satisfies WorkspaceCalendarNavigationContext;
  const eventFocusId = `workspace-calendar-event-${event.unitId}-${event.scheduledAt}`;
  const problemFocusId = `workspace-calendar-problem-${event.unitId}-${event.scheduledAt}`;
  const unitFocusId = `workspace-open-unit-${event.unitId}-${event.scheduledAt}`;
  const openUnit = () => event.unit?.projectId
    ? onOpenUnit(event.unit.projectId, event.unitId, unitLabel, unitFocusId)
    : onOpenUnits(unitFocusId);
  return <li className="workspace-plan-event grid grid-cols-(--workspace-glyph-columns) gap-4 rounded-cell bg-surface-sunken p-3 @max-workspace-row/main-region:grid-cols-1" data-content-event>
    <span className={GLYPH} aria-hidden="true"><Boxes className={GLYPH_MARK} /></span>
    <div className="workspace-plan-event-main min-w-0">
      <h3 className={BLOCK_TITLE}>{unitLabel}</h3>
      <p className={EVENT_NOTE}>{event.project?.name ?? "Project unavailable"} · {event.unit?.selectedRevisionId ? "Selected revision set" : "Selected revision unavailable"}</p>
      <time className={`${EVENT_NOTE} font-code`} dateTime={new Date(event.scheduledAt).toISOString()}>{new Date(event.scheduledAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}</time>
      <ul className="workspace-publication-list m-0 mt-3 list-none p-0" aria-label="Child publications">
        {event.publications.map((publication) => <li className="flex justify-between gap-4 py-2 type-xs text-muted" key={publication.id}>
          <span>{publication.platform} · {accountLabel(event, publication.socialAccountId)}</span>
          <strong className={attentionStates.has(publication.state) ? "is-warning font-normal text-muted" : "font-normal text-ink"}>{statusLabel(publication.state)}</strong>
        </li>)}
      </ul>
      {blocked > 0 && <p className={`workspace-plan-warning ${EVENT_NOTE}`}>{blocked} channel{blocked === 1 ? "" : "s"} needs attention</p>}
      <div className="workspace-plan-actions mt-3 flex flex-wrap gap-2">
        <button className={ACTION_QUIET} id={eventFocusId} type="button" aria-label={`Open ${unitLabel} scheduled ${dateLabel} in Calendar`} onClick={() => onOpenCalendar(calendarContext, eventFocusId)}>Open in Calendar</button>
        <button className={ACTION_QUIET} id={unitFocusId} type="button" aria-label={`${event.unit?.projectId ? "Open Unit" : "Open Units for"} ${unitLabel} scheduled ${dateLabel}`} onClick={openUnit}>{event.unit?.projectId ? "Open Unit" : "Open Units"}</button>
        {blocked > 0 && <button className={ACTION_QUIET} id={problemFocusId} type="button" aria-label={`Review problem for ${unitLabel} scheduled ${dateLabel}`} onClick={() => onOpenCalendar(calendarContext, problemFocusId)}>Review problem</button>}
      </div>
    </div>
  </li>;
}

function PlanCoverage({ value }: { value: Availability<PlanCoveragePresentation[]> }) {
  if (value.status !== "ready" && value.status !== "partial") return unavailable(value.status === "empty" ? "No plan coverage" : "Plan coverage unavailable", value.reason);
  return <>
    {value.status === "partial" && unavailable("Partial cadence coverage", value.reason)}
    {value.value.length > 0 ? <ul className={`workspace-plan-coverage my-3 gap-2 ${PLAIN_LIST}`}>
      {value.value.map((item) => <li className={`${ROW} ${ROW_SPLIT}`} key={item.id}><span>{item.label}</span><strong className={ROW_LABEL}>{item.planned} of {item.target} planned</strong><progress className={COVERAGE_BAR} value={item.planned} max={item.target} aria-label={`${item.label}: ${item.planned} of ${item.target} planned`} /></li>)}
    </ul> : unavailable("Plan coverage empty", "No plan coverage values were returned.")}
  </>;
}

function ReadyUnscheduled({ value, onOpenUnit, onOpenUnits }: {
  value: Availability<ReadyUnscheduledPresentation[]>;
  onOpenUnit(projectId: string, unitId: string, unitLabel: string, returnFocusId: string): void;
  onOpenUnits(returnFocusId: string): void;
}) {
  if (value.status !== "ready" && value.status !== "partial") return unavailable(value.status === "empty" ? "No ready Units" : "Ready Unit count unavailable", value.reason);
  return <>
    {value.status === "partial" && unavailable("Partial ready Unit data", value.reason)}
    {value.value.length > 0 ? <ul className={`workspace-ready-list my-3 gap-2 ${PLAIN_LIST}`}>{value.value.map((unit) => <li className={`${ROW} ${ROW_SPLIT}`} key={unit.unitId}>
      <span className="grid gap-1"><strong className={ROW_LABEL}>{unit.title}</strong><small className="text-muted">{unit.projectTitle ?? "Project unavailable"}</small></span>
      <button className="inline-flex flex-none items-center justify-center rounded-control bg-surface px-3 py-2 type-sm text-muted" id={`workspace-ready-unit-${unit.unitId}`} type="button" onClick={() => unit.projectId
        ? onOpenUnit(unit.projectId, unit.unitId, unit.title, `workspace-ready-unit-${unit.unitId}`)
        : onOpenUnits(`workspace-ready-unit-${unit.unitId}`)}>{unit.projectId ? "Open Unit" : "Open Units"}</button>
    </li>)}</ul> : unavailable("No ready Units", "No ready, unscheduled Units were returned.")}
  </>;
}

function ContentPlan({ value, onOpenCalendar, onOpenUnits, onOpenUnit }: {
  value: WorkspacePlanPresentation;
  onOpenCalendar(context: WorkspaceCalendarNavigationContext | undefined, returnFocusId: string): void;
  onOpenUnits(returnFocusId: string): void;
  onOpenUnit(projectId: string, unitId: string, unitLabel: string, returnFocusId: string): void;
}) {
  const events = value.upcoming.status === "ready" || value.upcoming.status === "partial" ? value.upcoming.value : [];
  return <section className={`${SECTION_HALF} workspace-content-plan`} aria-labelledby="workspace-content-plan-title">
    <header className={SECTION_HEADING}><h2 className={SECTION_TITLE} id="workspace-content-plan-title">Content plan</h2><span className={SECTION_META}>Next 14 days</span></header>
    <p className="workspace-plan-timezone m-0 mb-3 type-xs leading-5 text-muted">Dates and times use this device’s timezone; workspace timezone is not available from the current Core contract.</p>
    <PlanCoverage value={value.coverage} />
    {value.upcoming.status !== "unavailable" && <DayStrip days={value.days} events={events} />}
    {value.upcoming.status === "partial" && unavailable("Partial publishing data", value.upcoming.reason)}
    {value.upcoming.status === "unavailable" && unavailable("Publishing schedule unavailable", value.upcoming.reason)}
    {value.upcoming.status === "empty" && <div className="workspace-plan-empty flex items-center justify-between gap-4 p-4 @max-workspace-row/main-region:grid @max-workspace-row/main-region:grid-cols-1 @max-workspace-row/main-region:justify-items-start">
      <p className="m-0 type-base leading-5 text-muted">{value.upcoming.reason}</p>
      <button id="workspace-empty-calendar" type="button" className={COMMAND_BUTTON} onClick={() => onOpenCalendar(undefined, "workspace-empty-calendar")}><CalendarDays aria-hidden="true" />Open Calendar</button>
    </div>}
    {events.length > 0 && <ol className={`workspace-plan-events gap-3 ${PLAIN_LIST}`}>
      {events.map((event) => <ContentEvent key={`${event.unitId}:${event.scheduledAt}`} event={event} onOpenCalendar={onOpenCalendar} onOpenUnit={onOpenUnit} onOpenUnits={onOpenUnits} />)}
    </ol>}
    <div className="workspace-ready-unscheduled mt-4 grid gap-2">
      <h3 className={BLOCK_TITLE}>Ready, not scheduled</h3>
      <ReadyUnscheduled value={value.readyUnscheduled} onOpenUnit={onOpenUnit} onOpenUnits={onOpenUnits} />
    </div>
  </section>;
}

function OutcomeGroup({ title, value, onSelect }: { title: string; value: UnitOutcomePresentation[]; onSelect(value: UnitOutcomePresentation): void }) {
  return <section className="workspace-outcome-group min-w-0"><h3 className={BLOCK_TITLE}>{title}</h3>
    {value.length === 0 ? <p className="m-0 mt-1 block type-xs leading-5 text-muted">No comparable performance data is available yet.</p> : <div className="workspace-outcome-cards mt-2 grid gap-2">
      {value.map((outcome) => <button id={`workspace-outcome-${outcome.id}`} type="button" key={outcome.id} className="workspace-outcome-card flex w-full items-center gap-3 rounded-control bg-surface-sunken p-2 text-left type-base text-ink hover:bg-surface-hover" onClick={() => onSelect(outcome)}>
        <span className={GLYPH} aria-hidden="true"><Boxes className={GLYPH_MARK} /></span>
        <span className="grid min-w-0 gap-1"><strong className="truncate font-normal text-ink">{outcome.title}</strong><small className="text-muted">{outcome.projectTitle} · {outcome.revisionLabel}</small><small className="text-muted">Comparable metrics unavailable</small></span>
      </button>)}
    </div>}
  </section>;
}

function DetailSection({ title, reason }: { title: string; reason: string }) {
  return <section className={DRAWER_CELL}><h3 className={DRAWER_CELL_TITLE}>{title}</h3>{unavailable("Unavailable", reason)}</section>;
}

function UnitOutcomeDetailDialog({ value, onOpenChange, onOpenUnit }: {
  value: UnitOutcomePresentation | null;
  onOpenChange(open: boolean): void;
  onOpenUnit(projectId: string, unitId: string, unitLabel: string, returnFocusId: string): void;
}) {
  return <DetailDialog
    id="workspace-unit-outcome-detail"
    open={value !== null}
    className="unit-outcome-dialog"
    title={value?.title}
    description={value && `Unit outcome detail · ${value.projectTitle} · ${value.revisionLabel}`}
    closeLabel="Close Unit outcome detail"
    footer={value && <button type="button" className={DRAWER_ACTION} onClick={() => onOpenUnit(value.projectId, value.unitId, value.title, `workspace-outcome-${value.id}`)}>Open Unit</button>}
    onOpenChange={onOpenChange}
  >
    <DetailSection title="Result" reason="Normalized result is not available from the current Core contract." />
    <DetailSection title="Benchmark method" reason="Benchmark method is not available from the current Core contract." />
    <DetailSection title="Child publications" reason="Child publication metrics are not available from the current Core contract." />
    <DetailSection title="Observation window" reason="Observation windows are not available from the current Core contract." />
    <DetailSection title="Destination" reason="Destination outcomes are not available from the current Core contract." />
  </DetailDialog>;
}

function UnitOutcomes({ value, onOpenUnit }: { value: Availability<UnitOutcomeGroups>; onOpenUnit(projectId: string, unitId: string, unitLabel: string, returnFocusId: string): void }) {
  const [selected, setSelected] = useState<UnitOutcomePresentation | null>(null);
  const groups = value.status === "ready" || value.status === "partial" ? value.value : { top: [], emerging: [], learningOpportunities: [] };
  return <section className={`${SECTION_HALF} workspace-unit-outcomes`} aria-labelledby="workspace-unit-outcomes-title">
    <header className={SECTION_HEADING}><h2 className={SECTION_TITLE} id="workspace-unit-outcomes-title">Top and emerging Units</h2><span className={SECTION_META}>Comparable performance</span></header>
    {value.status === "partial" && unavailable("Partial outcome data", value.reason)}
    {(value.status === "empty" || value.status === "unavailable") && unavailable("Comparable performance data is not available yet", value.reason)}
    {/* Three groups across, and the count follows the space the row has rather than a
        breakpoint: the section is already half the desk when the desk is wide. */}
    <div className="workspace-outcome-groups mt-4 grid grid-cols-(--workspace-outcome-columns) gap-4">
      <OutcomeGroup title="Top performers" value={groups.top} onSelect={setSelected} />
      <OutcomeGroup title="Emerging" value={groups.emerging} onSelect={setSelected} />
      <OutcomeGroup title="Learning opportunities" value={groups.learningOpportunities} onSelect={setSelected} />
    </div>
    <UnitOutcomeDetailDialog value={selected} onOpenChange={(open) => { if (!open) setSelected(null); }} onOpenUnit={onOpenUnit} />
  </section>;
}

export function WorkspacePlanAndOutcomes({ value, onOpenPage, onOpenCalendar, onOpenUnit }: Props) {
  const openCalendar = (context: WorkspaceCalendarNavigationContext | undefined, returnFocusId: string) => onOpenCalendar
    ? onOpenCalendar(context, returnFocusId)
    : onOpenPage("calendar", returnFocusId);
  return <>
    <ContentPlan value={value.plan} onOpenCalendar={openCalendar} onOpenUnits={(returnFocusId) => onOpenPage("units", returnFocusId)} onOpenUnit={onOpenUnit} />
    <UnitOutcomes value={value.outcomes} onOpenUnit={onOpenUnit} />
  </>;
}
