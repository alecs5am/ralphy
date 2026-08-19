import { Boxes, Radio } from "lucide-react";

import type { ProjectOverviewDto } from "../../../electron/ralphy/types";
import type { ProjectView } from "../../state/project-screen-controller";

type OverviewPanelProps = {
  value: ProjectOverviewDto;
  onViewTab(tab: ProjectView): void;
  onOpenDocument(documentId: string): void;
  onOpenUnit(unitId: string): void;
};

const compactNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const compactDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

function formatTime(value: number): string {
  return compactDate.format(new Date(value < 1_000_000_000_000 ? value * 1000 : value));
}

function formatDuration(value: number | null): string {
  if (value === null) return "—";
  const seconds = Math.round(value / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

const label = (value: string) => value.replaceAll(/[-_]/g, " ");

function Status({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone = /active|approved|published|ready|succeeded|resolved/.test(normalized)
    ? "ok"
    : /failed|cancelled|rejected/.test(normalized) ? "danger" : /running|working|open|pending|scheduled/.test(normalized) ? "warn" : "idle";
  return <span className="overview-status"><span className={`status-dot dot-${tone}`} aria-hidden="true" />{label(value)}</span>;
}

function SectionHeading({ title, action, onAction }: { title: string; action?: string; onAction?(): void }) {
  return <header className="overview-section-heading"><h3>{title}</h3>{action && onAction ? <button className="overview-link" type="button" onClick={onAction}>{action}</button> : null}</header>;
}

export function OverviewPanel({ value, onViewTab, onOpenUnit }: OverviewPanelProps) {
  const iterations = value.iterations?.items ?? [];
  const feedback = value.feedback?.items ?? [];
  const stages = value.stages?.items ?? [];
  const units = (value.units?.items ?? []).filter((unit) => unit.selectedRevisionId).slice(0, 4);
  const runs = value.runs?.items ?? [];
  const publications = value.publications?.items.slice(0, 4) ?? [];
  const activeIteration = iterations.find((item) => item.state === "active");
  const metrics = value.metrics;
  const spendUsd = Number.isFinite(value.spendUsd) ? value.spendUsd : null;
  const hasMetrics = metrics && [metrics.publicationCount, metrics.views, metrics.likes, metrics.comments, metrics.shares, metrics.watchTimeMs].some((item) => item !== null && item !== 0);
  const feedbackState = (item: unknown) => (item as { status?: string; state?: string }).status ?? (item as { state?: string }).state ?? "unknown";
  const openFeedback = feedback.filter((item) => /open|pending/i.test(feedbackState(item))).length;
  const activeWork = stages.filter((item) => /working|running|active/i.test(item.state)).length
    + runs.filter((item) => /working|running|active/i.test(item.state)).length;
  const failedWork = stages.filter((item) => /failed|cancelled|rejected/i.test(item.state)).length
    + runs.filter((item) => /failed|cancelled|rejected/i.test(item.state)).length;

  return <div className="overview-dashboard overview-main-layout">
    {hasMetrics ? <section className="overview-metrics" aria-label="Production metrics">
      <div><strong>{compactNumber.format(metrics.publicationCount)}</strong><span>Publications</span></div>
      <div><strong>{metrics.views === null ? "—" : compactNumber.format(metrics.views)}</strong><span>Views</span></div>
      <div><strong>{metrics.likes === null ? "—" : compactNumber.format(metrics.likes)}</strong><span>Likes</span></div>
      <div><strong>{metrics.comments === null ? "—" : compactNumber.format(metrics.comments)}</strong><span>Comments</span></div>
      <div><strong>{metrics.shares === null ? "—" : compactNumber.format(metrics.shares)}</strong><span>Shares</span></div>
      <div><strong>{formatDuration(metrics.watchTimeMs)}</strong><span>Watch time</span></div>
    </section> : null}

    <section className="overview-section overview-pulse">
      <SectionHeading title="Project pulse" />
      <div className="overview-pulse-main"><div><strong>{value.project.name}</strong><p>{value.project.purpose ?? "No project purpose has been added yet."}</p></div><Status value={value.project.state} /></div>
      <dl className="overview-inline-facts"><div><dt>Current iteration</dt><dd>{activeIteration?.title ?? "None active"}</dd></div><div><dt>Updated</dt><dd>{formatTime(value.project.updatedAt)}</dd></div><div><dt>Spent</dt><dd className="mono-number">{spendUsd === null ? "—" : `$${spendUsd.toFixed(2)}`}</dd></div></dl>
      <div className="overview-pulse-counts"><div><strong>{openFeedback}</strong><span>Open feedback</span></div><div><strong>{activeWork}</strong><span>Active work</span></div><div><strong>{failedWork}</strong><span>Failed / cancelled</span></div></div>
    </section>

    <section className="overview-section overview-ready-units">
      <SectionHeading title="Ready units" action="View all units" onAction={() => onViewTab("units")} />
      {units.length ? <div className="overview-unit-grid">{units.map((unit) => <button className={`overview-unit-card format-${unit.format}`} type="button" key={unit.id} onClick={() => onOpenUnit(unit.id)}><span className="overview-unit-visual"><Boxes size={22} aria-hidden="true" /><em>{label(unit.format)}</em></span><span><strong>{unit.slug}</strong><small>{unit.selectedRevisionId === unit.latestRevisionId ? "Selected · Latest" : "Selected"}</small></span></button>)}</div> : <p className="overview-empty">No selected units yet.</p>}
    </section>

    {publications.length ? <section className="overview-section overview-distribution"><SectionHeading title="Distribution" /><div className="overview-rows">{publications.map((item) => <article className="overview-row" key={item.id}><span className="overview-row-icon"><Radio size={15} aria-hidden="true" /></span><span><strong>{label(item.platform)}</strong><small>{label(item.rail)} · {formatTime(item.publishedAt ?? item.updatedAt)}</small></span><Status value={item.state} /></article>)}</div></section> : null}
  </div>;
}
