import { AlertTriangle, ArrowUpRight, CalendarDays } from "@/shared/ui/icons";
import type { WorkspaceCalendarNavigationContext, WorkspacePage } from "@/shared/model/workbench";
import { OverviewHeading } from "./OverviewHeading";
import { WorkspaceUnitOutcomes } from "./WorkspaceUnitOutcomes";
import {
  ACTION_QUIET,
  SUBSECTION_TITLE,
  PLATE,
  PLATE_COPY,
  PLATE_TITLE,
  ROW,
  ROW_SPLIT,
  SECTION,
} from "../lib/overview-chrome";
import type {
  Availability,
  PlanCoveragePresentation,
  PublishingEventPresentation,
  ReadyUnscheduledPresentation,
  WorkspaceOverviewPresentation,
  WorkspacePlanPresentation,
} from "../lib/overview-presentation";
import { COMMAND_BUTTON } from "@/shared/ui/route-chrome";

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
const COVERAGE_BAR = "col-span-full h-1.5 w-full appearance-none overflow-hidden rounded-control bg-field [&::-webkit-progress-bar]:bg-field [&::-webkit-progress-value]:bg-ink";
const EVENT_ACTION = "inline-flex size-7 shrink-0 items-center justify-center rounded-control bg-field text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-ink";

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
  const peak = Math.max(...counts.values(), 1);
  return <ol className="workspace-plan-days" aria-label="Next 14 days publishing density">
    {days.map((value) => {
      const date = new Date(value);
      const count = counts.get(date.toDateString()) ?? 0;
      return <li className="workspace-plan-step font-code type-xs text-muted" key={date.toISOString()} data-active={count > 0} aria-label={`${date.toLocaleDateString(undefined, { dateStyle: "full" })}: ${count} scheduled content event${count === 1 ? "" : "s"}`}>
        <time dateTime={date.toISOString()}><span>{date.toLocaleDateString(undefined, { weekday: "short" })}</span><strong>{date.getDate()}</strong></time>
        <svg viewBox="0 0 24 28" className="workspace-step-meter" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <g key={index} opacity={count / peak * 6 > index ? 1 : .13}>{[4, 12, 20].map((x) => <rect key={x} x={x - 1.5} y={24 - index * 4} width="3" height="2" fill="currentColor" />)}</g>)}</svg>
        <span className="workspace-step-count">{count}</span>
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
  return <li className="workspace-plan-event grid grid-cols-(--workspace-row-columns) items-center gap-2 rounded-frame bg-card px-3 py-2" data-content-event>
    <div className="workspace-plan-event-main min-w-0">
      <h3 className="m-0 truncate type-sm font-medium" title={unitLabel}>{unitLabel}</h3>
      <time className="font-code type-xs text-muted" title={dateLabel} dateTime={new Date(event.scheduledAt).toISOString()}>{new Date(event.scheduledAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
      <details className="mt-1 type-xs text-muted"><summary className="cursor-pointer truncate">{[...new Set(event.publications.map((publication) => publication.platform))].join(", ")} · {blocked ? `${blocked} channel${blocked === 1 ? "" : "s"} needs attention` : [...new Set(event.publications.map((publication) => statusLabel(publication.state)))].join(", ")}</summary>
        <p className="my-1">{event.project?.name ?? "Project unavailable"} · {event.unit?.selectedRevisionId ? "Selected revision set" : "Selected revision unavailable"}</p>
        <ul className="workspace-publication-list m-0 grid list-none gap-1 p-0" aria-label="Child publications">{event.publications.map((publication) => <li className="flex flex-wrap justify-between gap-x-2" key={publication.id}><span>{publication.platform} · {accountLabel(event, publication.socialAccountId)}</span><strong className={attentionStates.has(publication.state) ? "is-warning font-normal text-muted" : "font-normal text-ink"}>{statusLabel(publication.state)}</strong></li>)}</ul>
      </details>
    </div>
    <div className="workspace-plan-actions flex items-center gap-1">
      <button className={EVENT_ACTION} id={eventFocusId} type="button" title="Open in Calendar" aria-label={`Open ${unitLabel} scheduled ${dateLabel} in Calendar`} onClick={() => onOpenCalendar(calendarContext, eventFocusId)}><CalendarDays size={13} aria-hidden="true" /><span className="sr-only">Open in Calendar</span></button>
      <button className={EVENT_ACTION} id={unitFocusId} type="button" title={event.unit?.projectId ? "Open Unit" : "Open Units"} aria-label={`${event.unit?.projectId ? "Open Unit" : "Open Units for"} ${unitLabel} scheduled ${dateLabel}`} onClick={openUnit}><ArrowUpRight size={13} aria-hidden="true" /><span className="sr-only">{event.unit?.projectId ? "Open Unit" : "Open Units"}</span></button>
      {blocked > 0 && <button className={EVENT_ACTION} id={problemFocusId} type="button" title="Review problem" aria-label={`Review problem for ${unitLabel} scheduled ${dateLabel}`} onClick={() => onOpenCalendar(calendarContext, problemFocusId)}><AlertTriangle size={13} aria-hidden="true" /><span className="sr-only">Review problem</span></button>}
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
      <button className="inline-flex flex-none items-center justify-center rounded-control bg-field px-3 py-2 type-sm text-muted" id={`workspace-ready-unit-${unit.unitId}`} type="button" onClick={() => unit.projectId
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
  return <section className={`${SECTION} workspace-content-plan @container/workspace-plan`} aria-labelledby="workspace-content-plan-title">
    <OverviewHeading id="workspace-content-plan-title" title="Content plan" icon={CalendarDays} meta="Next 14 days" />
    <p className="workspace-plan-timezone m-0 px-3 type-xs leading-5 text-muted">Your local timezone · {events.length} upcoming {events.length === 1 ? "release" : "releases"}</p>
    {value.upcoming.status !== "unavailable" && <DayStrip days={value.days} events={events} />}
    {value.upcoming.status === "partial" && unavailable("Partial publishing data", value.upcoming.reason)}
    {value.upcoming.status === "unavailable" && unavailable("Publishing schedule unavailable", value.upcoming.reason)}
    {value.upcoming.status === "empty" && <div className="workspace-plan-empty flex items-center justify-between gap-4 p-4 @max-workspace-row/main-region:grid @max-workspace-row/main-region:grid-cols-1 @max-workspace-row/main-region:justify-items-start">
      <p className="m-0 type-base leading-5 text-muted">{value.upcoming.reason}</p>
      <button id="workspace-empty-calendar" type="button" className={COMMAND_BUTTON} onClick={() => onOpenCalendar(undefined, "workspace-empty-calendar")}><CalendarDays aria-hidden="true" />Open Calendar</button>
    </div>}
    {events.length > 0 && <ol className={`workspace-plan-events gap-1 ${PLAIN_LIST}`}>
      {events.slice(0, 5).map((event) => <ContentEvent key={`${event.unitId}:${event.scheduledAt}`} event={event} onOpenCalendar={onOpenCalendar} onOpenUnit={onOpenUnit} onOpenUnits={onOpenUnits} />)}
    </ol>}
    {events.length > 5 && <button id="workspace-more-calendar" className={ACTION_QUIET} type="button" onClick={() => onOpenCalendar({ label: "Upcoming releases", date: events[5]!.scheduledAt }, "workspace-more-calendar")}>{events.length - 5} more in Calendar <ArrowUpRight size={13} aria-hidden="true" /></button>}
    {(value.coverage.status === "ready" || value.coverage.status === "partial" || value.readyUnscheduled.status === "ready" || value.readyUnscheduled.status === "partial") && <details className="workspace-ready-unscheduled grid gap-1.5 px-2 py-2 type-sm text-muted">
      <summary className="cursor-pointer">Readiness & cadence details</summary>
      <p className="type-xs text-muted">Dates and times use this device’s timezone.</p>
      <PlanCoverage value={value.coverage} />
      <h3 className={SUBSECTION_TITLE}>Ready, not scheduled</h3>
      <ReadyUnscheduled value={value.readyUnscheduled} onOpenUnit={onOpenUnit} onOpenUnits={onOpenUnits} />
    </details>}
  </section>;
}









export function WorkspacePlanAndOutcomes({ value, onOpenPage, onOpenCalendar, onOpenUnit }: Props) {
  const openCalendar = (context: WorkspaceCalendarNavigationContext | undefined, returnFocusId: string) => onOpenCalendar
    ? onOpenCalendar(context, returnFocusId)
    : onOpenPage("calendar", returnFocusId);
  return <>
    <ContentPlan value={value.plan} onOpenCalendar={openCalendar} onOpenUnits={(returnFocusId) => onOpenPage("units", returnFocusId)} onOpenUnit={onOpenUnit} />
    <WorkspaceUnitOutcomes value={value.outcomes} onOpenUnit={onOpenUnit} />
  </>;
}
