import { AlertTriangle, FolderOpen, ListTodo, RefreshCw } from "@/shared/ui/icons";
import { useState } from "react";
import type { ProjectSummary } from "@/shared/api/ipc";
import { DitherIdentity } from "@/shared/instrument/primitives";
import type { WorkspaceCalendarNavigationContext, WorkspacePage } from "@/shared/model/workbench";
import { OverviewHeading } from "./OverviewHeading";
import {
  ACTION_ON_SUNKEN,
  ACTION_ON_SURFACE,
  ROW_ACTION_STACKED,
  ROW_THREE,
  ROW_COPY,
  ROW_NOTE,
  ROW_TITLE,
  SECTION,
} from "../lib/overview-chrome";
import type {
  ActiveProjectPresentation,
  AttentionPresentation,
  WorkspaceOverviewPresentation,
} from "../lib/overview-presentation";

type OperationsValue = Pick<
  WorkspaceOverviewPresentation,
  "attention" | "pulse" | "projects" | "recentChanges" | "onboarding"
>;

interface Props {
  value: OperationsValue;
  onOpenProject(project: ProjectSummary): void;
  onOpenPage(page: WorkspacePage, returnFocusId: string): void;
  onOpenCalendar?(context: WorkspaceCalendarNavigationContext, returnFocusId: string): void;
  onRetry(): void;
}

const PANEL = `${SECTION} workspace-operations-panel`;
const BANNER = "workspace-operation-banner flex items-center justify-between gap-3 rounded-inner bg-card p-3 text-muted";
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
    : item.kind === "account-relink" ? "Relink account" : "Connect account";
}

function AttentionQueue({ value, onOpenPage, onOpenCalendar, onRetry, expanded: controlledExpanded, onExpandedChange }: {
  value: OperationsValue["attention"];
  onOpenPage(page: WorkspacePage, returnFocusId: string): void;
  onOpenCalendar?: Props["onOpenCalendar"];
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
    <OverviewHeading id="workspace-attention-heading" title="Attention" icon={AlertTriangle} meta={available && (total > 5
        ? expanded ? `Showing all ${total} actionable items` : `Showing 5 of ${total} actionable items`
        : `${total} actionable`)} />
    {value.status === "partial" && <InfoBanner title="Bounded attention data" reason={value.reason} />}
    {value.status === "unavailable" && <RetryBanner title="Attention unavailable" reason={value.reason} label="Retry attention" onRetry={onRetry} />}
    {available && items.length === 0 && <p className={EMPTY_NOTE}>
      {value.status === "ready" ? "Nothing needs attention." : "No actionable items were returned in this partial page."}
    </p>}
    {items.length > 0 && <ul className="workspace-attention-list m-0 grid list-none gap-2 p-0">
      {items.map((item) => {
        const focusId = `workspace-attention-${item.kind}-${item.accountId ?? "unassigned"}`;
        const critical = item.severity === "critical";
        return <li className={`${ROW_THREE} rounded-inner bg-card px-3 py-3`} key={focusId}>
          {/* The alarm tone stays on the glyph: the alert red is under 4.5:1 as 11px text on
              both widget surfaces, and the label already says which severity this is. */}
          <span className={`workspace-attention-severity is-${item.severity} inline-flex items-center gap-1 type-xs ${critical ? "text-ink" : "text-muted"}`}>
            <AlertTriangle className={critical ? "text-alert" : "text-muted"} size={15} aria-hidden="true" />{critical ? "Critical" : "Warning"}
          </span>
          <span className={`workspace-attention-copy ${ROW_COPY}`}><strong className={ROW_TITLE}>{item.title}</strong><small className={ROW_NOTE}>{affectedLabel(item.affectedCount)}</small></span>
          <button className={`${ACTION_ON_SUNKEN} ${ROW_ACTION_STACKED}`} id={focusId} type="button" aria-label={`${attentionAction(item)} for ${item.title}`} onClick={() => onOpenCalendar ? onOpenCalendar({
            label: item.title, ...(item.accountId ? { accountId: item.accountId } : {}),
            ...(["account-relink", "account-configuration"].includes(item.kind) ? { accountAction: "manage" as const } : {}),
          }, focusId) : onOpenPage("calendar", focusId)}>{attentionAction(item)}</button>
        </li>;
      })}
    </ul>}
    {total > 5 && !expanded && <button className={`workspace-attention-more mt-3 ${ACTION_ON_SURFACE}`} type="button" onClick={() => setExpanded(true)}>View all attention</button>}
  </section>;
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
  return <li className={`${ROW_THREE} rounded-inner bg-card p-3`}>
    <DitherIdentity name={value.catalog?.name ?? value.name} label="" className="workspace-active-project-glyph shrink-0" />
    <span className={`workspace-active-project-copy ${ROW_COPY}`}>
      <strong className="truncate type-sm font-medium text-ink">{value.name}</strong>
      {value.catalog?.brief && <small className={`${ROW_NOTE} truncate`}>{value.catalog.brief}</small>}
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
  return <section className={`${SECTION} workspace-active-projects`} aria-labelledby="workspace-active-projects-heading">
    <OverviewHeading id="workspace-active-projects-heading" title="Active projects" icon={FolderOpen}>
      {available && <button className={ACTION_ON_SUNKEN} id="workspace-view-all-projects" type="button" onClick={() => onOpenPage("projects", "workspace-view-all-projects")}>View all projects</button>}
    </OverviewHeading>
    {value.status === "partial" && <InfoBanner title="Bounded project data" reason={value.reason} />}
    {value.status === "unavailable" && <RetryBanner title="Active projects unavailable" reason={value.reason} label="Retry projects" onRetry={onRetry} />}
    {available && projects.length === 0 && <p className={EMPTY_NOTE}>No active projects yet.</p>}
    {projects.length > 0 && <ul className="workspace-active-project-list m-0 grid list-none gap-1 p-0">
      {projects.map((project) => <ActiveProjectRow key={project.id} value={project} onOpenProject={onOpenProject} onOpenPage={onOpenPage} />)}
    </ul>}
  </section>;
}



function WorkspaceOnboarding({ onOpenPage }: { onOpenPage(page: WorkspacePage, returnFocusId: string): void }) {
  const steps: Array<{ title: string; detail: string; label: string; page: WorkspacePage }> = [
    { title: "Create or import a project", detail: "Start with the campaign or content stream you want to produce.", label: "Open Projects", page: "projects" },
    { title: "Add reusable brand assets", detail: "Keep approved references and reusable media in the Shared library.", label: "Open Shared library", page: "shared" },
    { title: "Plan publishing", detail: "Use Calendar when the first Unit is ready for a publishing date.", label: "Open Calendar", page: "calendar" },
  ];
  return <section className={`${SECTION} workspace-onboarding`} aria-labelledby="workspace-onboarding-heading">
    <OverviewHeading id="workspace-onboarding-heading" title="Start producing in this workspace" icon={ListTodo} meta="Getting started" />
    <ol className="m-0 grid list-none gap-2 p-0">
      {/* The step number is content, so it is rendered rather than drawn by a CSS counter. */}
      {steps.map((step, index) => <li className="grid items-center gap-4 grid-cols-(--workspace-row-columns) rounded-inner bg-card p-4 @max-workspace-row/main-region:grid-cols-(--workspace-glyph-columns)" key={step.page}>
        <span className={ROW_COPY}><strong className={ROW_TITLE}><span className="font-code text-muted">{index + 1}. </span>{step.title}</strong><small className={ROW_NOTE}>{step.detail}</small></span>
        <button className={`${ACTION_ON_SURFACE} ${ROW_ACTION_STACKED}`} id={`workspace-onboarding-${step.page}`} type="button" onClick={() => onOpenPage(step.page, `workspace-onboarding-${step.page}`)}>{step.label}</button>
      </li>)}
    </ol>
  </section>;
}

export function WorkspaceOperations({ value, onOpenProject, onOpenPage, onOpenCalendar, onRetry, attentionExpanded, onAttentionExpandedChange }: Props & {
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
    <ActiveProjects value={value.projects} onOpenProject={onOpenProject} onOpenPage={onOpenPage} onRetry={onRetry} />
    {!attentionCompleteEmpty && <AttentionQueue value={value.attention} onOpenPage={onOpenPage} onOpenCalendar={onOpenCalendar} onRetry={onRetry} expanded={attentionExpanded} onExpandedChange={onAttentionExpandedChange} />}
    {onboarding && <WorkspaceOnboarding onOpenPage={onOpenPage} />}
  </>;
}
