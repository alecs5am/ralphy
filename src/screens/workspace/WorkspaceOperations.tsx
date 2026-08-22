import { AlertTriangle, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { ProjectSummary } from "../../lib/ipc";
import { projectGlyphVars } from "../../lib/project-glyph";
import type { WorkspacePage } from "../../state/workbench";
import {
  ACTION_ON_SUNKEN,
  ACTION_ON_SURFACE,
  PLATE,
  PLATE_COPY,
  PLATE_ON_SUNKEN,
  PLATE_TITLE,
  ROW_ACTION_STACKED,
  ROW_THREE,
  ROW_COPY,
  ROW_NOTE,
  ROW_TITLE,
  SECTION,
  SECTION_HALF,
  SECTION_HEADING,
  SECTION_META,
  SECTION_TITLE,
} from "./overview-chrome";
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

/* One of the two Operations panels: a widget standing inside the Operations widget. */
const PANEL = "workspace-operations-panel min-w-0 rounded-cell bg-surface-sunken p-3";
const BANNER = "workspace-operation-banner mb-3 flex items-center justify-between gap-3 rounded-control bg-surface-sunken p-3 text-muted";
const BANNER_TITLE = "type-xs font-normal";
const BANNER_NOTE = "type-xs font-normal text-muted";
const NOTE = "m-0 type-sm leading-5 text-muted";
const EMPTY_NOTE = `workspace-operation-empty ${NOTE}`;

function RetryBanner({ title, reason, label, onRetry }: {
  title: string;
  reason: string;
  label: string;
  onRetry(): void;
}) {
  return <div className={BANNER} role="status">
    <span className={ROW_COPY}><strong className={BANNER_TITLE}>{title}</strong><small className={BANNER_NOTE}>{reason}</small></span>
    <button className={ACTION_ON_SURFACE} type="button" onClick={onRetry}><RefreshCw size={13} aria-hidden="true" />{label}</button>
  </div>;
}

function InfoBanner({ title, reason }: { title: string; reason: string }) {
  return <div className={BANNER} role="note">
    <span className={ROW_COPY}><strong className={BANNER_TITLE}>{title}</strong><small className={BANNER_NOTE}>{reason}</small></span>
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
  return <section className={`${PANEL} workspace-attention`} aria-labelledby="workspace-attention-heading">
    <div className={SECTION_HEADING}>
      <h2 className={SECTION_TITLE} id="workspace-attention-heading">Attention</h2>
      {available && <span className={SECTION_META}>{total > 5
        ? expanded ? `Showing all ${total} actionable items` : `Showing 5 of ${total} actionable items`
        : `${total} actionable`}</span>}
    </div>
    {value.status === "partial" && <InfoBanner title="Bounded attention data" reason={value.reason} />}
    {value.status === "unavailable" && <RetryBanner title="Attention unavailable" reason={value.reason} label="Retry attention" onRetry={onRetry} />}
    {available && items.length === 0 && <p className={EMPTY_NOTE}>
      {value.status === "ready" ? "Nothing needs attention." : "No actionable items were returned in this partial page."}
    </p>}
    {items.length > 0 && <ul className="workspace-attention-list m-0 grid list-none gap-2 p-0">
      {items.map((item) => {
        const focusId = `workspace-attention-${item.kind}-${item.accountId ?? "unassigned"}`;
        const critical = item.severity === "critical";
        return <li className={`${ROW_THREE} rounded-control bg-surface px-0 py-3`} key={focusId}>
          {/* The alarm tone stays on the glyph: the alert red is under 4.5:1 as 11px text on
              both widget surfaces, and the label already says which severity this is. */}
          <span className={`workspace-attention-severity is-${item.severity} inline-flex items-center gap-1 type-xs ${critical ? "text-ink" : "text-muted"}`}>
            <AlertTriangle className={critical ? "text-alert" : "text-muted"} size={15} aria-hidden="true" />{critical ? "Critical" : "Warning"}
          </span>
          <span className={`workspace-attention-copy ${ROW_COPY}`}><strong className={ROW_TITLE}>{item.title}</strong><small className={ROW_NOTE}>{affectedLabel(item.affectedCount)}</small></span>
          <button className={`${ACTION_ON_SUNKEN} ${ROW_ACTION_STACKED}`} id={focusId} type="button" aria-label={`${attentionAction(item)} for ${item.title}`} onClick={() => onOpenPage("calendar", focusId)}>{attentionAction(item)}</button>
        </li>;
      })}
    </ul>}
    {total > 5 && !expanded && <button className={`workspace-attention-more mt-3 ${ACTION_ON_SURFACE}`} type="button" onClick={() => setExpanded(true)}>View all attention</button>}
  </section>;
}

const pulseStages = ["In production", "Needs review", "Ready", "Scheduled", "Published in selected period", "Blocked or failed"];

function ProductionState({ value }: { value: OperationsValue["pulse"] }) {
  const available = value.status === "ready" || value.status === "partial";
  return <section className={`${PANEL} workspace-production-state`} aria-labelledby="workspace-pulse-heading">
    <div className={SECTION_HEADING}><h2 className={SECTION_TITLE} id="workspace-pulse-heading">Production pulse</h2><span className={SECTION_META}>Lifecycle</span></div>
    <ul className="workspace-pulse-list m-0 mb-3 grid list-none grid-cols-3 gap-2 bg-transparent p-0" aria-label="Production lifecycle summary">
      {pulseStages.map((stage) => <li className="grid gap-1 rounded-control bg-surface p-3" key={stage}><span className="font-code type-lg text-muted" aria-hidden="true">—</span><small className="type-xs text-muted">{stage}</small></li>)}
    </ul>
    {value.status !== "ready" && <div className={PLATE_ON_SUNKEN}>
      <strong className={PLATE_TITLE}>{value.status === "partial" ? "Partial production data" : "Production pulse unavailable"}</strong>
      <p className={PLATE_COPY}>{value.reason}</p>
    </div>}
    <div className="workspace-in-progress pt-4">
      <h3 className={`${ROW_TITLE} m-0 mb-2`}>In progress</h3>
      {value.status === "ready" && value.value.stages.length === 0
        ? <p className={NOTE}>No Units are currently in production.</p>
        : value.status === "partial"
          ? <p className={NOTE}>Active production work is partial; Core did not return normalized work items.</p>
          : !available
            ? <p className={NOTE}>Active production work is unavailable from the current Core contract.</p>
            : <p className={NOTE}>Active work details are not available from the current Core contract.</p>}
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
  return <li className={`${ROW_THREE} rounded-control bg-surface-sunken p-3`}>
    {/* The identity tone is per-project and arrives as an inline custom property, so the tint
        it is mixed into is an arbitrary property: no scale names a mix of a runtime colour. */}
    <span className="workspace-active-project-glyph grid size-12 place-items-center rounded-field font-code type-sm text-(--glyph-color) [background:color-mix(in_srgb,var(--glyph-color)_18%,var(--instrument-widget-light-sunken))]" style={projectGlyphVars(value.name)} aria-hidden="true">
      {initials(value.name)}
    </span>
    <span className={`workspace-active-project-copy ${ROW_COPY}`}>
      <strong className={`${ROW_TITLE} truncate`}>{value.name}</strong>
      <small className={`${ROW_NOTE} truncate`}>{value.catalog?.brief || "Purpose not available from the project catalog."}</small>
      <span className={ROW_NOTE}>{value.catalog ? `${value.catalog.unitCount} Unit${value.catalog.unitCount === 1 ? "" : "s"} · ` : ""}{updatedLabel(value.updatedAt)}</span>
    </span>
    <button className={`${ACTION_ON_SURFACE} ${ROW_ACTION_STACKED}`} id={focusId} type="button" aria-label={`${label} ${value.name}`} onClick={action}>{label}</button>
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
  return <section className={`${SECTION_HALF} workspace-active-projects`} aria-labelledby="workspace-active-projects-heading">
    <div className={SECTION_HEADING}>
      <h2 className={SECTION_TITLE} id="workspace-active-projects-heading">Active projects</h2>
      {available && <button className={ACTION_ON_SUNKEN} id="workspace-view-all-projects" type="button" onClick={() => onOpenPage("projects", "workspace-view-all-projects")}>View all projects</button>}
    </div>
    {value.status === "partial" && <InfoBanner title="Bounded project data" reason={value.reason} />}
    {value.status === "unavailable" && <RetryBanner title="Active projects unavailable" reason={value.reason} label="Retry projects" onRetry={onRetry} />}
    {available && projects.length === 0 && <p className={EMPTY_NOTE}>No active projects were returned by Core.</p>}
    {projects.length > 0 && <ul className="workspace-active-project-list m-0 grid list-none gap-2 p-0">
      {projects.map((project) => <ActiveProjectRow key={project.id} value={project} onOpenProject={onOpenProject} onOpenPage={onOpenPage} />)}
    </ul>}
  </section>;
}

function RecentChanges({ value }: { value: OperationsValue["recentChanges"] }) {
  const available = value.status === "ready" || value.status === "partial";
  return <section className={`${SECTION_HALF} workspace-recent-changes`} aria-labelledby="workspace-recent-changes-heading">
    <div className={SECTION_HEADING}><h2 className={SECTION_TITLE} id="workspace-recent-changes-heading">Recent changes</h2><span className={SECTION_META}>Meaningful activity</span></div>
    <div className={PLATE}>
      <strong className={PLATE_TITLE}>{available && value.value.length === 0 ? "No recent changes" : "Human-readable changes unavailable"}</strong>
      <p className={PLATE_COPY}>{available
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
  return <section className={`${SECTION} workspace-onboarding`} aria-labelledby="workspace-onboarding-heading">
    <div className={SECTION_HEADING}><h2 className={SECTION_TITLE} id="workspace-onboarding-heading">Start producing in this workspace</h2><span className={SECTION_META}>Getting started</span></div>
    <ol className="m-0 grid list-none gap-2 p-0">
      {/* The step number is content, so it is rendered rather than drawn by a CSS counter. */}
      {steps.map((step, index) => <li className="grid items-center gap-4 grid-cols-(--workspace-row-columns) rounded-control bg-surface-sunken p-4 @max-workspace-row/main-region:grid-cols-(--workspace-glyph-columns)" key={step.page}>
        <span className={ROW_COPY}><strong className={ROW_TITLE}><span className="font-code text-muted">{index + 1}. </span>{step.title}</strong><small className={ROW_NOTE}>{step.detail}</small></span>
        <button className={`${ACTION_ON_SURFACE} ${ROW_ACTION_STACKED}`} id={`workspace-onboarding-${step.page}`} type="button" onClick={() => onOpenPage(step.page, `workspace-onboarding-${step.page}`)}>{step.label}</button>
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
    {value.onboarding.status !== "ready" && <div className={SECTION}>
      <RetryBanner title="Workspace setup state unavailable" reason={value.onboarding.reason} label="Retry workspace state" onRetry={onRetry} />
    </div>}
    {/* The two Operations panels sit side by side once the desk is wide enough for the
        sections themselves to split, and stack below that. */}
    <section className="workspace-overview-section workspace-operations-grid col-span-12 grid min-w-0 grid-cols-1 gap-2 bg-transparent p-0 @min-workspace-section/instrument-desk:grid-cols-2" aria-label="Workspace operations">
      <AttentionQueue value={value.attention} onOpenPage={onOpenPage} onRetry={onRetry} expanded={attentionExpanded} onExpandedChange={onAttentionExpandedChange} />
      <ProductionState value={value.pulse} />
    </section>
    {onboarding && <WorkspaceOnboarding onOpenPage={onOpenPage} />}
    <ActiveProjects value={value.projects} onOpenProject={onOpenProject} onOpenPage={onOpenPage} onRetry={onRetry} />
    <RecentChanges value={value.recentChanges} />
  </>;
}
