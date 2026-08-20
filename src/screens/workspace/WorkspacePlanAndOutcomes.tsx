import * as Dialog from "@radix-ui/react-dialog";
import { Boxes, CalendarDays, X } from "lucide-react";
import { useState } from "react";
import type { WorkspacePage } from "../../state/workbench";
import type {
  Availability,
  PublishingEventPresentation,
  UnitOutcomeGroups,
  UnitOutcomePresentation,
  WorkspaceOverviewPresentation,
  WorkspacePlanPresentation,
} from "./overview-presentation";

interface Props {
  value: Pick<WorkspaceOverviewPresentation, "plan" | "outcomes">;
  onOpenPage(page: WorkspacePage): void;
  onOpenUnit(projectId: string, unitId: string): void;
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
  return account?.username ?? account?.displayName ?? account?.externalId ?? `Account ${accountId}`;
}

function DayStrip({ events }: { events: PublishingEventPresentation[] }) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const counts = new Map<string, number>();
  for (const event of events) {
    const key = new Date(event.scheduledAt).toDateString();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return <ol className="workspace-plan-days" aria-label="Next 14 days publishing density">
    {Array.from({ length: 14 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
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
  onOpenCalendar(): void;
  onOpenUnit(projectId: string, unitId: string): void;
  onOpenUnits(): void;
}) {
  const blocked = event.publications.filter((publication) => attentionStates.has(publication.state)).length;
  const openUnit = () => event.unit?.projectId ? onOpenUnit(event.unit.projectId, event.unitId) : onOpenUnits();
  return <li className="workspace-plan-event" data-content-event={event.unitId}>
    <span className="workspace-unit-glyph" aria-hidden="true"><Boxes /></span>
    <div className="workspace-plan-event-main">
      <h3>{event.unit?.slug ?? event.unitId}</h3>
      <p>{event.project?.name ?? "Project unavailable"} · {event.unit?.selectedRevisionId ? `Selected revision ${event.unit.selectedRevisionId}` : "Selected revision unavailable"}</p>
      <time dateTime={new Date(event.scheduledAt).toISOString()}>{new Date(event.scheduledAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}</time>
      <ul className="workspace-publication-list" aria-label="Child publications">
        {event.publications.map((publication) => <li key={publication.id}>
          <span>{publication.platform} · {accountLabel(event, publication.socialAccountId)}</span>
          <strong className={attentionStates.has(publication.state) ? "is-warning" : undefined}>{statusLabel(publication.state)}</strong>
        </li>)}
      </ul>
      {blocked > 0 && <p className="workspace-plan-warning">{blocked} channel{blocked === 1 ? "" : "s"} needs attention</p>}
      <div className="workspace-plan-actions">
        <button type="button" onClick={onOpenCalendar}>Open in Calendar</button>
        <button type="button" onClick={openUnit}>Open Unit</button>
        {blocked > 0 && <button type="button" onClick={onOpenCalendar}>Review problem</button>}
      </div>
    </div>
  </li>;
}

function ContentPlan({ value, onOpenCalendar, onOpenUnits, onOpenUnit }: {
  value: WorkspacePlanPresentation;
  onOpenCalendar(): void;
  onOpenUnits(): void;
  onOpenUnit(projectId: string, unitId: string): void;
}) {
  const events = value.upcoming.status === "ready" || value.upcoming.status === "partial" ? value.upcoming.value : [];
  return <section className="workspace-overview-section workspace-content-plan" aria-labelledby="workspace-content-plan-title">
    <header className="workspace-section-heading"><h2 id="workspace-content-plan-title">Content plan</h2><span>Next 14 days</span></header>
    <p className="workspace-plan-timezone">Dates and times use this device’s timezone; workspace timezone is not available from the current Core contract.</p>
    {value.coverage.status === "ready" || value.coverage.status === "partial"
      ? value.coverage.status === "partial" && unavailable("Partial cadence coverage", value.coverage.reason)
      : unavailable("Plan coverage unavailable", value.coverage.reason)}
    <DayStrip events={events} />
    {value.upcoming.status === "partial" && unavailable("Partial publishing data", value.upcoming.reason)}
    {value.upcoming.status === "unavailable" && unavailable("Publishing schedule unavailable", value.upcoming.reason)}
    {value.upcoming.status === "empty" && <div className="workspace-plan-empty">
      <p>{value.upcoming.reason}</p>
      <button type="button" className="command-button" onClick={onOpenCalendar}><CalendarDays aria-hidden="true" />Open Calendar</button>
    </div>}
    {events.length > 0 && <ol className="workspace-plan-events">
      {events.map((event) => <ContentEvent key={`${event.unitId}:${event.scheduledAt}`} event={event} onOpenCalendar={onOpenCalendar} onOpenUnit={onOpenUnit} onOpenUnits={onOpenUnits} />)}
    </ol>}
    <div className="workspace-ready-unscheduled">
      <h3>Ready, not scheduled</h3>
      {value.readyUnscheduled.status === "ready" || value.readyUnscheduled.status === "partial"
        ? value.readyUnscheduled.status === "partial" && unavailable("Partial ready Unit data", value.readyUnscheduled.reason)
        : unavailable("Ready Unit count unavailable", value.readyUnscheduled.reason)}
    </div>
  </section>;
}

function OutcomeGroup({ title, value, onSelect }: { title: string; value: UnitOutcomePresentation[]; onSelect(value: UnitOutcomePresentation): void }) {
  return <section className="workspace-outcome-group"><h3>{title}</h3>
    {value.length === 0 ? <p>No comparable performance data is available yet.</p> : <div className="workspace-outcome-cards">
      {value.map((outcome) => <button type="button" key={outcome.id} className="workspace-outcome-card" onClick={() => onSelect(outcome)}>
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
  onOpenUnit(projectId: string, unitId: string): void;
}) {
  return <Dialog.Root open={value !== null} onOpenChange={onOpenChange}>
    {value && <Dialog.Portal forceMount container={typeof document === "undefined" ? undefined : document.body}>
      <Dialog.Overlay forceMount className="account-detail-overlay" />
      <Dialog.Content forceMount className="account-detail-dialog unit-outcome-dialog">
        <header className="account-detail-header"><span><Dialog.Title>{value.title}</Dialog.Title><Dialog.Description>Unit outcome detail · {value.projectTitle} · {value.revisionLabel}</Dialog.Description></span><Dialog.Close asChild><button type="button" aria-label="Close Unit outcome detail"><X aria-hidden="true" /></button></Dialog.Close></header>
        <div className="account-detail-body">
          <DetailSection title="Result" reason="Normalized result is not available from the current Core contract." />
          <DetailSection title="Benchmark method" reason="Benchmark method is not available from the current Core contract." />
          <DetailSection title="Child publications" reason="Child publication metrics are not available from the current Core contract." />
          <DetailSection title="Observation window" reason="Observation windows are not available from the current Core contract." />
          <DetailSection title="Destination" reason="Destination outcomes are not available from the current Core contract." />
        </div>
        <footer className="account-detail-footer"><button type="button" className="command-button" onClick={() => onOpenUnit(value.projectId, value.unitId)}>Open Unit</button></footer>
      </Dialog.Content>
    </Dialog.Portal>}
  </Dialog.Root>;
}

function UnitOutcomes({ value, onOpenUnit }: { value: Availability<UnitOutcomeGroups>; onOpenUnit(projectId: string, unitId: string): void }) {
  const [selected, setSelected] = useState<UnitOutcomePresentation | null>(null);
  const groups = value.status === "ready" || value.status === "partial" ? value.value : { top: [], emerging: [], learningOpportunities: [] };
  return <section className="workspace-overview-section workspace-unit-outcomes" aria-labelledby="workspace-unit-outcomes-title">
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

export function WorkspacePlanAndOutcomes({ value, onOpenPage, onOpenUnit }: Props) {
  return <>
    <ContentPlan value={value.plan} onOpenCalendar={() => onOpenPage("calendar")} onOpenUnits={() => onOpenPage("units")} onOpenUnit={onOpenUnit} />
    <UnitOutcomes value={value.outcomes} onOpenUnit={onOpenUnit} />
  </>;
}
