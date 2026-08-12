import { Activity, Boxes, FileText, Film, Image, Radio } from "lucide-react";

import type { ProjectOverviewDto } from "../../../electron/ralphy/types";
import type { ProjectView } from "../../state/project-screen-controller";

type OverviewPanelProps = {
  value: ProjectOverviewDto;
  onViewTab(tab: ProjectView): void;
  onOpenDocument(documentId: string): void;
  onOpenComposition(compositionId: string): void;
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

function Empty({ children }: { children: string }) {
  return <p className="overview-empty">{children}</p>;
}

export function OverviewPanel({ value, onViewTab, onOpenDocument, onOpenComposition, onOpenUnit }: OverviewPanelProps) {
  const documents = value.documents?.items.slice(0, 5) ?? [];
  const iterations = value.iterations?.items.slice(0, 5) ?? [];
  const feedback = value.feedback?.items.slice(0, 5) ?? [];
  const stages = value.stages?.items.slice(0, 5) ?? [];
  const compositions = value.compositions?.items.slice(0, 5) ?? [];
  const builds = value.builds?.items.slice(0, 5) ?? [];
  const units = value.units?.items.slice(0, 5) ?? [];
  const runs = value.runs?.items.slice(0, 5) ?? [];
  const activity = value.activity?.items.slice(0, 5) ?? [];
  const publications = value.publications?.items.slice(0, 5) ?? [];
  const activeIteration = iterations.find((item) => item.state === "active");
  const currentComposition = compositions[0];
  const media = value.mediaCounts ?? { artifacts: 0, objects: 0, runObjects: 0 };
  const mediaTotal = media.artifacts + media.objects + media.runObjects;
  const metrics = value.metrics;
  const hasMetrics = metrics && [metrics.publicationCount, metrics.views, metrics.likes, metrics.comments, metrics.shares, metrics.watchTimeMs].some((item) => item !== null && item !== 0);
  const hasProduction = iterations.length + feedback.length + stages.length + runs.length > 0;
  const hasDeliverables = documents.length + compositions.length + builds.length + units.length > 0;

  return <div className="overview-dashboard">
    <section className="overview-card overview-state-card">
      <div className="overview-card-icon"><Radio size={17} aria-hidden="true" /></div>
      <div className="overview-card-body">
        <span className="overview-eyebrow">Current state</span>
        <div className="overview-card-title"><h3>{value.project.name}</h3><Status value={value.project.state} /></div>
        <p>{value.project.purpose ?? "No project purpose has been added yet."}</p>
        <dl className="overview-inline-facts"><div><dt>Current iteration</dt><dd>{activeIteration?.title ?? "None active"}</dd></div><div><dt>Updated</dt><dd>{formatTime(value.project.updatedAt)}</dd></div><div><dt>Spent</dt><dd className="mono-number">${value.spendUsd.toFixed(2)}</dd></div></dl>
        {currentComposition ? <button className="command-button overview-primary-action" type="button" onClick={() => onOpenComposition(currentComposition.id)}>Continue production</button> : documents[0] ? <button className="command-button overview-primary-action" type="button" onClick={() => onOpenDocument(documents[0].id)}>Open latest document</button> : null}
      </div>
    </section>

    <section className="overview-card overview-media-card">
      <div className="overview-card-icon"><Image size={17} aria-hidden="true" /></div>
      <div className="overview-card-body">
        <span className="overview-eyebrow">Media library</span>
        <div className="overview-card-title"><h3>{compactNumber.format(mediaTotal)} items</h3><button className="overview-link" type="button" onClick={() => onViewTab("media")}>Browse media</button></div>
        <div className="overview-media-counts"><div><strong>{compactNumber.format(media.artifacts)}</strong><span>Artifacts</span></div><div><strong>{compactNumber.format(media.runObjects)}</strong><span>Run objects</span></div><div><strong>{compactNumber.format(media.objects)}</strong><span>Objects</span></div></div>
      </div>
    </section>

    {hasMetrics ? <section className="overview-metrics" aria-label="Production metrics">
      <div><strong>{compactNumber.format(metrics.publicationCount)}</strong><span>Publications</span></div>
      <div><strong>{metrics.views === null ? "—" : compactNumber.format(metrics.views)}</strong><span>Views</span></div>
      <div><strong>{metrics.likes === null ? "—" : compactNumber.format(metrics.likes)}</strong><span>Likes</span></div>
      <div><strong>{metrics.comments === null ? "—" : compactNumber.format(metrics.comments)}</strong><span>Comments</span></div>
      <div><strong>{metrics.shares === null ? "—" : compactNumber.format(metrics.shares)}</strong><span>Shares</span></div>
      <div><strong>{formatDuration(metrics.watchTimeMs)}</strong><span>Watch time</span></div>
    </section> : null}

    <section className="overview-section overview-production">
      <SectionHeading title="Production stream" />
      {!hasProduction ? <Empty>No production activity yet.</Empty> : <div className="overview-rows">
        {iterations.map((item) => <article className="overview-row" key={item.id}><span className="overview-row-icon"><Activity size={15} aria-hidden="true" /></span><span><strong>{item.title}</strong><small>Iteration {item.number} · {formatTime(item.createdAt)}</small></span><Status value={item.state} /></article>)}
        {stages.map((item) => item.entityType === "composition" && item.entityId
          ? <button className="overview-row overview-row-button" type="button" key={item.id} onClick={() => onOpenComposition(item.entityId!)}><span className="overview-row-icon"><Film size={15} aria-hidden="true" /></span><span><strong>{label(item.stage)}</strong><small>Composition stage · {formatTime(item.updatedAt)}</small></span><Status value={item.state} /></button>
          : <article className="overview-row" key={item.id}><span className="overview-row-icon"><Film size={15} aria-hidden="true" /></span><span><strong>{label(item.stage)}</strong><small>Production stage · {formatTime(item.updatedAt)}</small></span><Status value={item.state} /></article>)}
        {runs.map((item) => <article className="overview-row" key={item.id}><span className="overview-row-icon"><Radio size={15} aria-hidden="true" /></span><span><strong>{item.label ?? label(item.kind)}</strong><small>{label(item.kind)} · {formatTime(item.createdAt)}</small></span><Status value={item.state} /></article>)}
        {feedback.map((item) => <article className="overview-row" key={item.id}><span className="overview-row-icon"><Activity size={15} aria-hidden="true" /></span><span><strong>Feedback</strong><small>{formatTime(item.createdAt)}</small></span><Status value={item.status} /></article>)}
      </div>}
    </section>

    <section className="overview-section overview-deliverables">
      <SectionHeading title="Deliverables" />
      {!hasDeliverables ? <Empty>No deliverables yet.</Empty> : <div className="overview-deliverable-groups">
        {documents.length ? <div><SectionHeading title="Documents" action="View all documents" onAction={() => onViewTab("documents")} /><div className="overview-rows">{documents.map((item) => <button className="overview-row overview-row-button" type="button" key={item.id} onClick={() => onOpenDocument(item.id)}><span className="overview-row-icon"><FileText size={15} aria-hidden="true" /></span><span><strong>{item.title}</strong><small>{label(item.kind)} · {item.currentRevisionId ? "current revision" : "no revision"}</small></span></button>)}</div></div> : null}
        {compositions.length ? <div><SectionHeading title="Compositions" action="View all compositions" onAction={() => onViewTab("compositions")} /><div className="overview-rows">{compositions.map((item) => <button className="overview-row overview-row-button" type="button" key={item.id} onClick={() => onOpenComposition(item.id)}><span className="overview-row-icon"><Film size={15} aria-hidden="true" /></span><span><strong>{item.slug}</strong><small>{label(item.kind)} · {item.selectedRevisionId ? "selected" : "not selected"}</small></span></button>)}</div></div> : null}
        {units.length ? <div><SectionHeading title="Units" action="View all units" onAction={() => onViewTab("units")} /><div className="overview-rows">{units.map((item) => <button className="overview-row overview-row-button" type="button" key={item.id} onClick={() => onOpenUnit(item.id)}><span className="overview-row-icon"><Boxes size={15} aria-hidden="true" /></span><span><strong>{item.slug}</strong><small>{item.format} · {item.selectedRevisionId ? "selected" : "not selected"}</small></span></button>)}</div></div> : null}
        {builds.length ? <div><SectionHeading title="Latest builds" /><div className="overview-rows">{builds.map((item) => <article className="overview-row" key={item.id}><span className="overview-row-icon"><Boxes size={15} aria-hidden="true" /></span><span><strong>Build</strong><small>{formatTime(item.createdAt)}</small></span><Status value={item.state} /></article>)}</div></div> : null}
      </div>}
    </section>

    {publications.length ? <section className="overview-section overview-distribution"><SectionHeading title="Distribution" /><div className="overview-rows">{publications.map((item) => <article className="overview-row" key={item.id}><span className="overview-row-icon"><Radio size={15} aria-hidden="true" /></span><span><strong>{label(item.platform)}</strong><small>{label(item.rail)} · {formatTime(item.publishedAt ?? item.updatedAt)}</small></span><Status value={item.state} /></article>)}</div></section> : null}

    {activity.length ? <section className="overview-section overview-activity"><SectionHeading title="Recent activity" action="View all activity" onAction={() => onViewTab("activity")} /><div className="overview-rows">{activity.map((item) => <article className="overview-row" key={item.sequence}><span className="overview-row-icon"><Activity size={15} aria-hidden="true" /></span><span><strong>{label(item.action)}</strong><small>{label(item.entityType)} · {formatTime(item.createdAt)}</small></span></article>)}</div></section> : null}
  </div>;
}
