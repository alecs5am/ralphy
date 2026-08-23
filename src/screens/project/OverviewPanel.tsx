import { Boxes, Radio } from "lucide-react";

import type { ProjectOverviewDto } from "../../../electron/ralphy/types";
import type { ProjectView } from "../../state/project-screen-controller";

type OverviewPanelProps = {
  value: ProjectOverviewDto;
  onViewTab(tab: ProjectView): void;
  onOpenDocument(documentId: string): void;
  onOpenUnit(unitId: string): void;
};

// The overview stands on the light desk inside the work-mode scope, so every surface and ink
// here is the theme pair. Each band states its own span; the desk grid decides the rest.
const SECTION = "overview-section min-w-0 rounded-none bg-transparent p-4.5";
const HEADING = "overview-section-heading mb-2.5 flex min-w-0 items-center justify-between gap-3 [&_h3]:m-0 [&_h3]:type-lg [&_h3]:text-ink";
const COUNT = "[&_span]:type-xs [&_span]:text-muted [&_strong]:font-code [&_strong]:type-xl [&_strong]:text-ink";
const dotTone = (tone: string) => ({ ok: "bg-ink", warn: "bg-muted", danger: "bg-alert", idle: "bg-unreviewed" } as Record<string, string>)[tone] ?? "bg-unreviewed";

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
  return <span className="overview-status flex flex-none items-center gap-1.5 type-xs text-muted"><span className={`status-dot dot-${tone} size-1.5 flex-none rounded-control ${dotTone(tone)}`} aria-hidden="true" />{label(value)}</span>;
}

function SectionHeading({ title, action, onAction }: { title: string; action?: string; onAction?(): void }) {
  return <header className={HEADING}><h3>{title}</h3>{action && onAction ? <button className="overview-link flex-none rounded-control bg-transparent px-1.5 py-1 type-xs text-muted hover:bg-surface-hover hover:text-ink" type="button" onClick={onAction}>{action}</button> : null}</header>;
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

  return <div className="overview-dashboard overview-main-layout m-0 grid w-full min-w-0 grid-cols-1 gap-4 @min-project-dashboard/project-domain:grid-cols-(--project-dashboard-columns) @min-project-dashboard/project-domain:content-start">
    {hasMetrics ? <section className={`overview-metrics order-first grid min-w-0 grid-cols-2 rounded-cell bg-surface-sunken p-2 @min-project-metrics/project-domain:col-span-full @min-project-metrics/project-domain:grid-cols-6 ${COUNT} [&>div]:grid [&>div]:min-w-0 [&>div]:gap-0.75 [&>div]:p-2.5`} aria-label="Production metrics">
      <div><strong>{compactNumber.format(metrics.publicationCount)}</strong><span>Publications</span></div>
      <div><strong>{metrics.views === null ? "—" : compactNumber.format(metrics.views)}</strong><span>Views</span></div>
      <div><strong>{metrics.likes === null ? "—" : compactNumber.format(metrics.likes)}</strong><span>Likes</span></div>
      <div><strong>{metrics.comments === null ? "—" : compactNumber.format(metrics.comments)}</strong><span>Comments</span></div>
      <div><strong>{metrics.shares === null ? "—" : compactNumber.format(metrics.shares)}</strong><span>Shares</span></div>
      <div><strong>{formatDuration(metrics.watchTimeMs)}</strong><span>Watch time</span></div>
    </section> : null}

    <section className={`${SECTION} overview-pulse @min-project-dashboard/project-domain:col-span-4`}>
      <SectionHeading title="Project pulse" />
      <div className="overview-pulse-main flex min-w-0 items-start justify-between gap-3 [&_p]:mt-1.25 [&_p]:mb-0 [&_p]:text-muted [&_strong]:type-lg"><div><strong>{value.project.name}</strong><p>{value.project.purpose ?? "No project purpose has been added yet."}</p></div><Status value={value.project.state} /></div>
      <dl className="overview-inline-facts mt-4 mb-0 grid grid-cols-2 gap-3 [&>div]:min-w-0 [&_dd]:m-0 [&_dd]:mt-0.75 [&_dd]:truncate [&_dd]:text-muted [&_dt]:m-0 [&_dt]:truncate [&_dt]:type-xs [&_dt]:text-muted"><div><dt>Current iteration</dt><dd>{activeIteration?.title ?? "None active"}</dd></div><div><dt>Updated</dt><dd>{formatTime(value.project.updatedAt)}</dd></div><div><dt>Spent</dt><dd className="mono-number font-code">{spendUsd === null ? "—" : `$${spendUsd.toFixed(2)}`}</dd></div></dl>
      <div className="overview-pulse-counts mt-3.5 grid grid-cols-3 gap-2 [&>div]:grid [&>div]:gap-0.5 [&>div]:rounded-field [&>div]:bg-surface [&>div]:p-2.5 [&_span]:type-xs [&_span]:text-muted [&_strong]:font-code [&_strong]:type-lg"><div><strong>{openFeedback}</strong><span>Open feedback</span></div><div><strong>{activeWork}</strong><span>Active work</span></div><div><strong>{failedWork}</strong><span>Failed / cancelled</span></div></div>
    </section>

    <section className={`${SECTION} overview-ready-units @min-project-dashboard/project-domain:col-span-5`}>
      <SectionHeading title="Ready units" action="View all units" onAction={() => onViewTab("units")} />
      {units.length ? <div className="overview-unit-grid grid grid-cols-2 gap-2">{units.map((unit) => <button className={`overview-unit-card format-${unit.format} grid min-w-0 grid-cols-(--project-overview-unit-columns) items-center gap-2.5 rounded-field bg-surface p-1.75 text-left text-ink hover:bg-surface-hover [&>span:last-child]:grid [&>span:last-child]:min-w-0 [&>span:last-child]:gap-0.75 [&_small]:truncate [&_small]:type-xs [&_small]:text-muted [&_strong]:truncate`} type="button" key={unit.id} onClick={() => onOpenUnit(unit.id)}><span className="overview-unit-visual grid h-12 place-items-center rounded-field bg-surface-hover text-muted [&_em]:type-xs [&_em]:not-italic"><Boxes size={22} aria-hidden="true" /><em>{label(unit.format)}</em></span><span><strong>{unit.slug}</strong><small>{unit.selectedRevisionId === unit.latestRevisionId ? "Selected · Latest" : "Selected"}</small></span></button>)}</div> : <p className="overview-empty mt-5 mb-1 text-muted">No selected units yet.</p>}
    </section>

    {publications.length ? <section className={`${SECTION} overview-distribution @min-project-dashboard/project-domain:col-span-3`}><SectionHeading title="Distribution" /><div className="overview-rows min-w-0">{publications.map((item) => <article className="overview-row flex w-full min-w-0 items-center gap-2.5 rounded-field bg-transparent px-2 py-2.5 text-left text-ink [&>span:nth-child(2)]:grid [&>span:nth-child(2)]:min-w-0 [&>span:nth-child(2)]:flex-1 [&>span:nth-child(2)]:gap-0.5 [&_small]:truncate [&_small]:type-sm [&_small]:text-muted [&_strong]:truncate [&_strong]:type-base" key={item.id}><span className="overview-row-icon grid size-7 flex-none place-items-center rounded-field bg-surface text-muted"><Radio size={15} aria-hidden="true" /></span><span><strong>{label(item.platform)}</strong><small>{label(item.rail)} · {formatTime(item.publishedAt ?? item.updatedAt)}</small></span><Status value={item.state} /></article>)}</div></section> : null}
  </div>;
}
