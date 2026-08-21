import * as Dialog from "@radix-ui/react-dialog";
import { Boxes, CalendarDays, X } from "lucide-react";
import { useState } from "react";
import type { WorkspaceCalendarNavigationContext, WorkspacePage } from "../../state/workbench";
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

interface Props {
  value: Pick<WorkspaceOverviewPresentation, "plan" | "outcomes">;
  onOpenPage(page: WorkspacePage, returnFocusId: string): void;
  onOpenCalendar?(context: WorkspaceCalendarNavigationContext | undefined, returnFocusId: string): void;
  onOpenUnit(projectId: string, unitId: string, unitLabel: string, returnFocusId: string): void;
}

const attentionStates = new Set(["failed", "reconciliation_required", "unknown"]);

function unavailable(title: string, reason: string) {
  return <div className="workspace-unavailable" role="note"><strong>{title}</strong><p>{reason.replace(/^./, (letter) => letter.toUpperCase())}</p></div>;
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
  return <ol className="workspace-plan-days" aria-label="Next 14 days publishing density">
    {days.map((value) => {
      const date = new Date(value);
      const count = counts.get(date.toDateString()) ?? 0;
      return <li key={date.toISOString()} aria-label={`${date.toLocaleDateString(undefined, { dateStyle: "full" })}: ${count} scheduled content event${count === 1 ? "" : "s"}`}>
        <time dateTime={date.toISOString()}>{date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</time>
        <span>{count}</span>
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
  return <li className="workspace-plan-event" data-content-event>
    <span className="workspace-unit-glyph" aria-hidden="true"><Boxes /></span>
    <div className="workspace-plan-event-main">
      <h3>{unitLabel}</h3>
      <p>{event.project?.name ?? "Project unavailable"} · {event.unit?.selectedRevisionId ? "Selected revision set" : "Selected revision unavailable"}</p>
      <time dateTime={new Date(event.scheduledAt).toISOString()}>{new Date(event.scheduledAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}</time>
      <ul className="workspace-publication-list" aria-label="Child publications">
        {event.publications.map((publication) => <li key={publication.id}>
          <span>{publication.platform} · {accountLabel(event, publication.socialAccountId)}</span>
          <strong className={attentionStates.has(publication.state) ? "is-warning" : undefined}>{statusLabel(publication.state)}</strong>
        </li>)}
      </ul>
      {blocked > 0 && <p className="workspace-plan-warning">{blocked} channel{blocked === 1 ? "" : "s"} needs attention</p>}
      <div className="workspace-plan-actions">
        <button id={eventFocusId} type="button" aria-label={`Open ${unitLabel} scheduled ${dateLabel} in Calendar`} onClick={() => onOpenCalendar(calendarContext, eventFocusId)}>Open in Calendar</button>
        <button id={unitFocusId} type="button" aria-label={`${event.unit?.projectId ? "Open Unit" : "Open Units for"} ${unitLabel} scheduled ${dateLabel}`} onClick={openUnit}>{event.unit?.projectId ? "Open Unit" : "Open Units"}</button>
        {blocked > 0 && <button id={problemFocusId} type="button" aria-label={`Review problem for ${unitLabel} scheduled ${dateLabel}`} onClick={() => onOpenCalendar(calendarContext, problemFocusId)}>Review problem</button>}
      </div>
    </div>
  </li>;
}

function PlanCoverage({ value }: { value: Availability<PlanCoveragePresentation[]> }) {
  if (value.status !== "ready" && value.status !== "partial") return unavailable(value.status === "empty" ? "No plan coverage" : "Plan coverage unavailable", value.reason);
  return <>
    {value.status === "partial" && unavailable("Partial cadence coverage", value.reason)}
    {value.value.length > 0 ? <ul className="workspace-plan-coverage">
      {value.value.map((item) => <li key={item.id}><span>{item.label}</span><strong>{item.planned} of {item.target} planned</strong><progress value={item.planned} max={item.target} aria-label={`${item.label}: ${item.planned} of ${item.target} planned`} /></li>)}
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
    {value.value.length > 0 ? <ul className="workspace-ready-list">{value.value.map((unit) => <li key={unit.unitId}>
      <span><strong>{unit.title}</strong><small>{unit.projectTitle ?? "Project unavailable"}</small></span>
      <button id={`workspace-ready-unit-${unit.unitId}`} type="button" onClick={() => unit.projectId
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
  return <section className="workspace-overview-section workspace-content-plan col-span-12 m-0 min-w-0 max-w-none rounded-panel border-0 bg-surface p-4 shadow-none xl:col-span-6" aria-labelledby="workspace-content-plan-title">
    <header className="workspace-section-heading"><h2 id="workspace-content-plan-title">Content plan</h2><span>Next 14 days</span></header>
    <p className="workspace-plan-timezone">Dates and times use this device’s timezone; workspace timezone is not available from the current Core contract.</p>
    <PlanCoverage value={value.coverage} />
    {value.upcoming.status !== "unavailable" && <DayStrip days={value.days} events={events} />}
    {value.upcoming.status === "partial" && unavailable("Partial publishing data", value.upcoming.reason)}
    {value.upcoming.status === "unavailable" && unavailable("Publishing schedule unavailable", value.upcoming.reason)}
    {value.upcoming.status === "empty" && <div className="workspace-plan-empty">
      <p>{value.upcoming.reason}</p>
      <button id="workspace-empty-calendar" type="button" className="command-button" onClick={() => onOpenCalendar(undefined, "workspace-empty-calendar")}><CalendarDays aria-hidden="true" />Open Calendar</button>
    </div>}
    {events.length > 0 && <ol className="workspace-plan-events">
      {events.map((event) => <ContentEvent key={`${event.unitId}:${event.scheduledAt}`} event={event} onOpenCalendar={onOpenCalendar} onOpenUnit={onOpenUnit} onOpenUnits={onOpenUnits} />)}
    </ol>}
    <div className="workspace-ready-unscheduled">
      <h3>Ready, not scheduled</h3>
      <ReadyUnscheduled value={value.readyUnscheduled} onOpenUnit={onOpenUnit} onOpenUnits={onOpenUnits} />
    </div>
  </section>;
}

function OutcomeGroup({ title, value, onSelect }: { title: string; value: UnitOutcomePresentation[]; onSelect(value: UnitOutcomePresentation): void }) {
  return <section className="workspace-outcome-group"><h3>{title}</h3>
    {value.length === 0 ? <p>No comparable performance data is available yet.</p> : <div className="workspace-outcome-cards">
      {value.map((outcome) => <button id={`workspace-outcome-${outcome.id}`} type="button" key={outcome.id} className="workspace-outcome-card" onClick={() => onSelect(outcome)}>
        <span className="workspace-unit-glyph" aria-hidden="true"><Boxes /></span>
        <span><strong>{outcome.title}</strong><small>{outcome.projectTitle} · {outcome.revisionLabel}</small><small>Comparable metrics unavailable</small></span>
      </button>)}
    </div>}
  </section>;
}

function DetailSection({ title, reason }: { title: string; reason: string }) {
  return <section className="account-detail-section"><h3>{title}</h3>{unavailable("Unavailable", reason)}</section>;
}

function UnitOutcomeDetailDialog({ value, onOpenChange, onOpenUnit }: {
  value: UnitOutcomePresentation | null;
  onOpenChange(open: boolean): void;
  onOpenUnit(projectId: string, unitId: string, unitLabel: string, returnFocusId: string): void;
}) {
  return <Dialog.Root open={value !== null} onOpenChange={onOpenChange}>
    {value && <Dialog.Portal forceMount container={typeof document === "undefined" ? undefined : document.body}>
      <Dialog.Overlay forceMount className="account-detail-overlay" data-instrument-overlay-backdrop="" />
      <Dialog.Content forceMount className="account-detail-dialog unit-outcome-dialog" data-instrument-overlay="workspace-unit-outcome-detail">
        <header className="account-detail-header"><span><Dialog.Title>{value.title}</Dialog.Title><Dialog.Description>Unit outcome detail · {value.projectTitle} · {value.revisionLabel}</Dialog.Description></span><Dialog.Close asChild><button type="button" aria-label="Close Unit outcome detail"><X aria-hidden="true" /></button></Dialog.Close></header>
        <div className="account-detail-body">
          <DetailSection title="Result" reason="Normalized result is not available from the current Core contract." />
          <DetailSection title="Benchmark method" reason="Benchmark method is not available from the current Core contract." />
          <DetailSection title="Child publications" reason="Child publication metrics are not available from the current Core contract." />
          <DetailSection title="Observation window" reason="Observation windows are not available from the current Core contract." />
          <DetailSection title="Destination" reason="Destination outcomes are not available from the current Core contract." />
        </div>
        <footer className="account-detail-footer"><button type="button" className="command-button" onClick={() => onOpenUnit(value.projectId, value.unitId, value.title, `workspace-outcome-${value.id}`)}>Open Unit</button></footer>
      </Dialog.Content>
    </Dialog.Portal>}
  </Dialog.Root>;
}

function UnitOutcomes({ value, onOpenUnit }: { value: Availability<UnitOutcomeGroups>; onOpenUnit(projectId: string, unitId: string, unitLabel: string, returnFocusId: string): void }) {
  const [selected, setSelected] = useState<UnitOutcomePresentation | null>(null);
  const groups = value.status === "ready" || value.status === "partial" ? value.value : { top: [], emerging: [], learningOpportunities: [] };
  return <section className="workspace-overview-section workspace-unit-outcomes col-span-12 m-0 min-w-0 max-w-none rounded-panel border-0 bg-surface p-4 shadow-none xl:col-span-6" aria-labelledby="workspace-unit-outcomes-title">
    <header className="workspace-section-heading"><h2 id="workspace-unit-outcomes-title">Top and emerging Units</h2><span>Comparable performance</span></header>
    {value.status === "partial" && unavailable("Partial outcome data", value.reason)}
    {(value.status === "empty" || value.status === "unavailable") && unavailable("Comparable performance data is not available yet", value.reason)}
    <div className="workspace-outcome-groups">
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
