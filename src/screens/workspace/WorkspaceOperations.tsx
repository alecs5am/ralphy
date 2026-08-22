import { AlertTriangle, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { ProjectSummary } from "../../lib/ipc";
import { projectGlyphVars } from "../../lib/project-glyph";
import type { WorkspacePage } from "../../state/workbench";
import type {
  ActiveProjectPresentation,
  AttentionPresentation,
  WorkspaceOverviewPresentation,
} from "./overview-presentation";

type OperationsValue = Pick<
  WorkspaceOverviewPresentation,
  "attention" | "pulse" | "projects" | "recentChanges" | "onboarding"
>;

interface Props {
  value: OperationsValue;
  onOpenProject(project: ProjectSummary): void;
  onOpenPage(page: WorkspacePage, returnFocusId: string): void;
  onRetry(): void;
}

function RetryBanner({ title, reason, label, onRetry }: {
  title: string;
  reason: string;
  label: string;
  onRetry(): void;
}) {
  return <div className="workspace-operation-banner rounded-control bg-surface-sunken" role="status">
    <span><strong>{title}</strong><small>{reason}</small></span>
    <button type="button" onClick={onRetry}><RefreshCw size={13} aria-hidden="true" />{label}</button>
  </div>;
}

function InfoBanner({ title, reason }: { title: string; reason: string }) {
  return <div className="workspace-operation-banner rounded-control bg-surface-sunken" role="note">
    <span><strong>{title}</strong><small>{reason}</small></span>
  </div>;
}

function affectedLabel(value: AttentionPresentation["affectedCount"]): string {
  if (value.status === "ready") return `Affects ${value.value} publication${value.value === 1 ? "" : "s"}`;
  if (value.status === "partial") return `Affects at least ${value.value} publication${value.value === 1 ? "" : "s"} · count limited`;
  return value.reason;
}

function attentionAction(item: AttentionPresentation): string {
  return item.kind === "publication-failure" || item.kind === "publication-reconciliation"
    ? "Review publications"
    : "Review account publications";
}

function AttentionQueue({ value, onOpenPage, onRetry, expanded: controlledExpanded, onExpandedChange }: {
  value: OperationsValue["attention"];
  onOpenPage(page: WorkspacePage, returnFocusId: string): void;
  onRetry(): void;
  expanded?: boolean;
  onExpandedChange?(expanded: boolean): void;
}) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const setExpanded = onExpandedChange ?? setLocalExpanded;
  const available = value.status === "ready" || value.status === "partial";
  const total = available ? value.value.items.length : 0;
  const items = available ? value.value.items.slice(0, expanded ? total : 5) : [];
  return <section className="workspace-operations-panel workspace-attention rounded-cell bg-surface-sunken p-3 [&_.workspace-attention-list>li]:rounded-control [&_.workspace-attention-list>li]:bg-surface [&_.workspace-attention-list_button]:rounded-control [&_.workspace-attention-list_button]:bg-surface-sunken" aria-labelledby="workspace-attention-heading">
    <div className="workspace-section-heading">
      <h2 id="workspace-attention-heading">Attention</h2>
      {available && <span>{total > 5
        ? expanded ? `Showing all ${total} actionable items` : `Showing 5 of ${total} actionable items`
        : `${total} actionable`}</span>}
    </div>
    {value.status === "partial" && <InfoBanner title="Bounded attention data" reason={value.reason} />}
    {value.status === "unavailable" && <RetryBanner title="Attention unavailable" reason={value.reason} label="Retry attention" onRetry={onRetry} />}
    {available && items.length === 0 && <p className="workspace-operation-empty">
      {value.status === "ready" ? "Nothing needs attention." : "No actionable items were returned in this partial page."}
    </p>}
    {items.length > 0 && <ul className="workspace-attention-list">
      {items.map((item) => {
        const focusId = `workspace-attention-${item.kind}-${item.accountId ?? "unassigned"}`;
        return <li key={focusId}>
          <span className={`workspace-attention-severity is-${item.severity}`}>
            <AlertTriangle size={15} aria-hidden="true" />{item.severity === "critical" ? "Critical" : "Warning"}
          </span>
          <span className="workspace-attention-copy"><strong>{item.title}</strong><small>{affectedLabel(item.affectedCount)}</small></span>
          <button id={focusId} type="button" aria-label={`${attentionAction(item)} for ${item.title}`} onClick={() => onOpenPage("calendar", focusId)}>{attentionAction(item)}</button>
        </li>;
      })}
    </ul>}
    {total > 5 && !expanded && <button className="workspace-attention-more" type="button" onClick={() => setExpanded(true)}>View all attention</button>}
  </section>;
}

const pulseStages = ["In production", "Needs review", "Ready", "Scheduled", "Published in selected period", "Blocked or failed"];

function ProductionState({ value }: { value: OperationsValue["pulse"] }) {
  const available = value.status === "ready" || value.status === "partial";
  return <section className="workspace-operations-panel workspace-production-state rounded-cell bg-surface-sunken p-3" aria-labelledby="workspace-pulse-heading">
    <div className="workspace-section-heading"><h2 id="workspace-pulse-heading">Production pulse</h2><span>Lifecycle</span></div>
    <ul className="workspace-pulse-list gap-2 bg-transparent" aria-label="Production lifecycle summary">
      {pulseStages.map((stage) => <li className="rounded-control bg-surface" key={stage}><span aria-hidden="true">—</span><small>{stage}</small></li>)}
    </ul>
    {value.status !== "ready" && <div className="workspace-unavailable rounded-control bg-surface px-3 py-2">
      <strong>{value.status === "partial" ? "Partial production data" : "Production pulse unavailable"}</strong>
      <p>{value.reason}</p>
    </div>}
    <div className="workspace-in-progress">
      <h3>In progress</h3>
      {value.status === "ready" && value.value.stages.length === 0
        ? <p>No Units are currently in production.</p>
        : value.status === "partial"
          ? <p>Active production work is partial; Core did not return normalized work items.</p>
          : !available
            ? <p>Active production work is unavailable from the current Core contract.</p>
            : <p>Active work details are not available from the current Core contract.</p>}
    </div>
  </section>;
}

function initials(value: string): string {
  return value.split(/[\s_-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase();
}

function updatedLabel(value: number): string {
  const timestamp = value < 1_000_000_000_000 ? value * 1000 : value;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "Update time unavailable" : `Updated ${date.toLocaleDateString()}`;
}

function ActiveProjectRow({ value, onOpenProject, onOpenPage }: {
  value: ActiveProjectPresentation;
  onOpenProject(project: ProjectSummary): void;
  onOpenPage(page: WorkspacePage, returnFocusId: string): void;
}) {
  const focusId = `workspace-find-project-${value.id}`;
  const action = value.catalog ? () => onOpenProject(value.catalog!) : () => onOpenPage("projects", focusId);
  const label = value.catalog ? "Open project" : "Find in Projects";
  return <li>
    <span className="workspace-active-project-glyph" style={projectGlyphVars(value.name)} aria-hidden="true">
      {initials(value.name)}
    </span>
    <span className="workspace-active-project-copy">
      <strong>{value.name}</strong>
      <small>{value.catalog?.brief || "Purpose not available from the project catalog."}</small>
      <span>{value.catalog ? `${value.catalog.unitCount} Unit${value.catalog.unitCount === 1 ? "" : "s"} · ` : ""}{updatedLabel(value.updatedAt)}</span>
    </span>
    <button id={focusId} type="button" aria-label={`${label} ${value.name}`} onClick={action}>{label}</button>
  </li>;
}

function ActiveProjects({ value, onOpenProject, onOpenPage, onRetry }: {
  value: OperationsValue["projects"];
  onOpenProject(project: ProjectSummary): void;
  onOpenPage(page: WorkspacePage, returnFocusId: string): void;
  onRetry(): void;
}) {
  const available = value.status === "ready" || value.status === "partial";
  const projects = available ? value.value.slice(0, 4) : [];
  return <section className="workspace-overview-section workspace-active-projects col-span-12 m-0 min-w-0 max-w-none rounded-panel bg-surface p-4 @min-[860px]/instrument-desk:col-span-6" aria-labelledby="workspace-active-projects-heading">
    <div className="workspace-section-heading">
      <h2 id="workspace-active-projects-heading">Active projects</h2>
      {available && <button className="rounded-control bg-surface-sunken px-3 py-2 type-sm" id="workspace-view-all-projects" type="button" onClick={() => onOpenPage("projects", "workspace-view-all-projects")}>View all projects</button>}
    </div>
    {value.status === "partial" && <InfoBanner title="Bounded project data" reason={value.reason} />}
    {value.status === "unavailable" && <RetryBanner title="Active projects unavailable" reason={value.reason} label="Retry projects" onRetry={onRetry} />}
    {available && projects.length === 0 && <p className="workspace-operation-empty">No active projects were returned by Core.</p>}
    {projects.length > 0 && <ul className="workspace-active-project-list [&>li]:rounded-control [&>li]:bg-surface-sunken [&_button]:rounded-control [&_button]:bg-surface">
      {projects.map((project) => <ActiveProjectRow key={project.id} value={project} onOpenProject={onOpenProject} onOpenPage={onOpenPage} />)}
    </ul>}
  </section>;
}

function RecentChanges({ value }: { value: OperationsValue["recentChanges"] }) {
  const available = value.status === "ready" || value.status === "partial";
  return <section className="workspace-overview-section workspace-recent-changes col-span-12 m-0 min-w-0 max-w-none rounded-panel bg-surface p-4 @min-[860px]/instrument-desk:col-span-6" aria-labelledby="workspace-recent-changes-heading">
    <div className="workspace-section-heading"><h2 id="workspace-recent-changes-heading">Recent changes</h2><span>Meaningful activity</span></div>
    <div className="workspace-unavailable rounded-control bg-surface-sunken px-3 py-2">
      <strong>{available && value.value.length === 0 ? "No recent changes" : "Human-readable changes unavailable"}</strong>
      <p>{available
        ? value.value.length === 0
          ? "No recent meaningful changes were returned by Core."
          : "Core supplied activity without the normalized, human-readable labels this feed requires."
        : value.reason}</p>
    </div>
  </section>;
}

function WorkspaceOnboarding({ onOpenPage }: { onOpenPage(page: WorkspacePage, returnFocusId: string): void }) {
  const steps: Array<{ title: string; detail: string; label: string; page: WorkspacePage }> = [
    { title: "Create or import a project", detail: "Start with the campaign or content stream you want to produce.", label: "Open Projects", page: "projects" },
    { title: "Add reusable brand assets", detail: "Keep approved references and reusable media in the Shared library.", label: "Open Shared library", page: "shared" },
    { title: "Plan publishing", detail: "Use Calendar when the first Unit is ready for a publishing date.", label: "Open Calendar", page: "calendar" },
  ];
  return <section className="workspace-overview-section workspace-onboarding col-span-12 m-0 min-w-0 max-w-none rounded-panel bg-surface p-4" aria-labelledby="workspace-onboarding-heading">
    <div className="workspace-section-heading"><h2 id="workspace-onboarding-heading">Start producing in this workspace</h2><span>Getting started</span></div>
    <ol>
      {steps.map((step) => <li className="rounded-control bg-surface-sunken" key={step.page}>
        <span><strong>{step.title}</strong><small>{step.detail}</small></span>
        <button className="rounded-control bg-surface px-3 py-2 type-sm" id={`workspace-onboarding-${step.page}`} type="button" onClick={() => onOpenPage(step.page, `workspace-onboarding-${step.page}`)}>{step.label}</button>
      </li>)}
    </ol>
  </section>;
}

export function WorkspaceOperations({ value, onOpenProject, onOpenPage, onRetry, attentionExpanded, onAttentionExpandedChange }: Props & {
  attentionExpanded?: boolean;
  onAttentionExpandedChange?(expanded: boolean): void;
}) {
  const onboarding = value.onboarding.status === "ready" && value.onboarding.value;
  const attentionCompleteEmpty = value.attention.status === "ready" && value.attention.value.items.length === 0;
  if (onboarding && attentionCompleteEmpty) return <WorkspaceOnboarding onOpenPage={onOpenPage} />;
  return <>
    {value.onboarding.status !== "ready" && <div className="workspace-overview-section col-span-12 m-0 min-w-0 max-w-none rounded-panel bg-surface p-4">
      <RetryBanner title="Workspace setup state unavailable" reason={value.onboarding.reason} label="Retry workspace state" onRetry={onRetry} />
    </div>}
    <section className="workspace-overview-section workspace-operations-grid col-span-12 m-0 grid min-w-0 max-w-none grid-cols-1 gap-2 bg-transparent p-0 @min-[860px]/instrument-desk:grid-cols-2" aria-label="Workspace operations">
      <AttentionQueue value={value.attention} onOpenPage={onOpenPage} onRetry={onRetry} expanded={attentionExpanded} onExpandedChange={onAttentionExpandedChange} />
      <ProductionState value={value.pulse} />
    </section>
    {onboarding && <WorkspaceOnboarding onOpenPage={onOpenPage} />}
    <ActiveProjects value={value.projects} onOpenProject={onOpenProject} onOpenPage={onOpenPage} onRetry={onRetry} />
    <RecentChanges value={value.recentChanges} />
  </>;
}
