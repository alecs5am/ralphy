import { AlertCircle, ArrowRight, FolderKanban, LayoutGrid, List, RefreshCw } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type {
  ActivityDto,
  MediaCardDto,
  OverviewAccountDto,
  OverviewPublicationDto,
  Page,
  ProjectDto,
  UnitDto,
  WorkspaceOverviewDto,
} from "../../electron/ralphy/types";
import { bridge, type ProjectSummary } from "../lib/ipc";
import {
  createWorkspaceScreenController,
  type WorkspaceScreenApi,
  type WorkspaceScreenController,
  type WorkspaceScreenSnapshot,
} from "../state/workspace-screen-controller";
import type { WorkspaceView } from "../state/workbench";

export { createWorkspaceScreenController } from "../state/workspace-screen-controller";

export function startWorkspaceScreenController(
  api: WorkspaceScreenApi,
  workspaceId: string,
  activitySequence: number,
  setController: (controller: WorkspaceScreenController) => void,
): () => void {
  const controller = createWorkspaceScreenController(api, workspaceId, activitySequence);
  setController(controller);
  void controller.start();
  return () => controller.dispose();
}

function formatTime(value: number): string {
  return new Date(value < 1_000_000_000_000 ? value * 1000 : value).toLocaleString();
}

export function catalogProjectForOverview(
  projects: ProjectSummary[],
  project: ProjectDto,
): ProjectSummary | null {
  return projects.find((candidate) => (
    candidate.workspaceId === project.workspaceId && candidate.projectId === project.id
  )) ?? null;
}

function BoundedSection<Item>({
  title,
  page,
  empty,
  children,
}: {
  title: string;
  page: Page<Item, string | number> | undefined;
  empty: string;
  children(item: Item): React.ReactNode;
}) {
  return <section className="project-domain-card workspace-domain-section">
    <div className="section-heading"><h3>{title}</h3><span>Bounded records{page?.nextCursor !== null && page ? " · More available" : ""}</span></div>
    {!page || page.items.length === 0
      ? <div className="empty-section">{empty}</div>
      : <div className="project-domain-list">{page.items.map(children)}</div>}
  </section>;
}

function mediaName(item: MediaCardDto): string {
  if ("slug" in item) return item.slug;
  if ("purpose" in item) return item.purpose;
  return item.ref.id;
}

function WorkspaceOverview({
  value,
  catalogProjects,
  view,
  onViewChange,
  onOpenProject,
}: {
  value: WorkspaceOverviewDto;
  catalogProjects: ProjectSummary[];
  view: WorkspaceView;
  onViewChange(view: WorkspaceView): void;
  onOpenProject(project: ProjectSummary): void;
}) {
  const metrics = value.metrics;
  return <>
    <div className="screen-header workspace-header">
      <div><div className="screen-kicker">Workspace</div><h2>{value.workspace.name}</h2><p>{value.workspace.slug}</p></div>
      <div className="workspace-header-actions">
        <span className="activity-stamp">Updated {formatTime(value.workspace.updatedAt)}</span>
        <div className="view-segments" role="group" aria-label="Project view">
          <button className={view === "grid" ? "is-active" : ""} type="button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => onViewChange("grid")}><LayoutGrid size={15} aria-hidden="true" /></button>
          <button className={view === "list" ? "is-active" : ""} type="button" aria-label="List view" aria-pressed={view === "list"} onClick={() => onViewChange("list")}><List size={15} aria-hidden="true" /></button>
        </div>
      </div>
    </div>
    <section className="metrics-band" aria-label="Workspace metrics">
      <div className="metric"><span className="metric-value">{metrics?.publicationCount ?? "—"}</span><span className="metric-label">Publications</span></div>
      <div className="metric"><span className="metric-value">{metrics?.views ?? "—"}</span><span className="metric-label">Views</span></div>
      <div className="metric"><span className="metric-value">{metrics?.likes ?? "—"}</span><span className="metric-label">Likes</span></div>
      <div className="metric"><span className="metric-value">{metrics?.watchTimeMs ?? "—"}</span><span className="metric-label">Watch time (ms)</span></div>
      <div className="metric"><span className="metric-value">{metrics?.comments ?? "—"}</span><span className="metric-label">Comments</span></div>
      <div className="metric"><span className="metric-value">{metrics?.shares ?? "—"}</span><span className="metric-label">Shares</span></div>
    </section>
    <div className="workspace-domain-body">
      <BoundedSection<OverviewAccountDto> title="Accounts" page={value.accounts} empty="No accounts returned.">
        {(account) => <article key={account.id}><strong>{account.displayName ?? account.username ?? account.externalId}</strong><span>{account.username ? `@${account.username} · ` : ""}{account.platform}</span><small>{account.credentialConfigured ? "Configured" : "Not configured"}{account.relinkRequired ? " · Relink required" : " · Linked"}</small></article>}
      </BoundedSection>
      <BoundedSection title="Documents" page={value.documents} empty="No documents returned.">
        {(document) => <article key={document.id}><strong>{document.title}</strong><span>{document.kind}</span><small>Updated {formatTime(document.updatedAt)}</small></article>}
      </BoundedSection>
      <BoundedSection title="Shared Media" page={value.sharedMedia} empty="No shared Media returned.">
        {(item) => <article key={`${item.ref.type}:${item.ref.id}`}><strong>{mediaName(item)}</strong><span>{item.mime ?? "Unknown media type"}</span><small>{"usageRoles" in item && item.usageRoles.length > 0 ? item.usageRoles.join(" · ") : "No reference evidence"}</small></article>}
      </BoundedSection>
      <section className="content-section workspace-projects">
        <div className="section-heading"><h3>Projects</h3><span>Bounded records{value.projects && value.projects.nextCursor !== null ? " · More available" : ""}</span></div>
        {!value.projects || value.projects.items.length === 0 ? <div className="empty-section">No projects returned.</div> : view === "grid" ? (
          <div className="workspace-project-grid">{value.projects.items.map((project) => {
            const catalogProject = catalogProjectForOverview(catalogProjects, project);
            const content = <><span className="workspace-project-card-head"><span className="workspace-project-icon"><FolderKanban size={16} aria-hidden="true" /></span><span className="workspace-project-phase"><i className="status-dot" />{project.state}</span></span><span className="workspace-project-card-copy"><strong>{project.name}</strong><small>{project.slug}</small></span><span className="workspace-project-card-footer"><span>{project.state}</span><span>Updated {formatTime(project.updatedAt)}</span>{catalogProject && <ArrowRight size={14} aria-hidden="true" />}</span></>;
            return catalogProject ? <button className="workspace-project-card" type="button" key={project.id} onClick={() => onOpenProject(catalogProject)}>{content}</button> : <article className="workspace-project-card" key={project.id}>{content}</article>;
          })}</div>
        ) : (
          <ul className="project-table workspace-project-list" aria-label="Projects">
            {value.projects.items.map((project) => {
              const catalogProject = catalogProjectForOverview(catalogProjects, project);
              const content = <><span className="project-name-cell"><strong>{project.name}</strong><small>{project.slug}</small></span><span><i className="status-dot" />{project.state}</span><span>{formatTime(project.updatedAt)}</span>{catalogProject && <ArrowRight size={14} aria-hidden="true" />}</>;
              return <li key={project.id}>{catalogProject ? <button className="project-table-row" type="button" onClick={() => onOpenProject(catalogProject)}>{content}</button> : <div className="project-table-row">{content}</div>}</li>;
            })}
          </ul>
        )}
      </section>
      <BoundedSection<UnitDto> title="Units" page={value.units} empty="No units returned.">
        {(unit) => <article key={unit.id}><strong>{unit.slug}</strong><span>{unit.format}</span><small>Selected {unit.selectedRevisionId ?? "None"} · Latest {unit.latestRevisionId ?? "None"}</small></article>}
      </BoundedSection>
      <BoundedSection<OverviewPublicationDto> title="Publications" page={value.publications} empty="No publications returned.">
        {(publication) => <article key={publication.id}><strong>{publication.platform} · {publication.state}</strong><span>{publication.rail}</span><small>{publication.url ?? "No URL returned"}</small></article>}
      </BoundedSection>
      <BoundedSection<ActivityDto> title="Activity" page={value.activity} empty="No activity returned.">
        {(event) => <article key={event.sequence}><strong>#{event.sequence} · {event.action}</strong><span>{event.entityType} · {event.entityId}</span><time dateTime={new Date(event.createdAt).toISOString()}>{formatTime(event.createdAt)}</time></article>}
      </BoundedSection>
    </div>
  </>;
}

export function WorkspaceScreenView({
  controller,
  snapshot,
  catalogProjects,
  view,
  onViewChange,
  onOpenProject,
}: {
  controller: WorkspaceScreenController;
  snapshot: WorkspaceScreenSnapshot;
  catalogProjects: ProjectSummary[];
  view: WorkspaceView;
  onViewChange(view: WorkspaceView): void;
  onOpenProject(project: ProjectSummary): void;
}) {
  if (snapshot.status === "loading" || snapshot.status === "idle") return <main className="main-region"><div className="project-skeleton" role="status">Loading workspace overview…</div></main>;
  if (snapshot.status === "error") return <main className="main-region"><div className="project-local-error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{snapshot.error ?? "Workspace overview could not be loaded."}</span><button type="button" onClick={() => { void controller.retry(); }}><RefreshCw size={14} aria-hidden="true" />Retry</button></div></main>;
  return <main className="main-region">{snapshot.value && <WorkspaceOverview value={snapshot.value} catalogProjects={catalogProjects} view={view} onViewChange={onViewChange} onOpenProject={onOpenProject} />}</main>;
}

function ConnectedWorkspaceScreen({
  controller,
  catalogProjects,
  view,
  onViewChange,
  onOpenProject,
}: {
  controller: WorkspaceScreenController;
  catalogProjects: ProjectSummary[];
  view: WorkspaceView;
  onViewChange(view: WorkspaceView): void;
  onOpenProject(project: ProjectSummary): void;
}) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return <WorkspaceScreenView controller={controller} snapshot={snapshot} catalogProjects={catalogProjects} view={view} onViewChange={onViewChange} onOpenProject={onOpenProject} />;
}

export function WorkspaceScreen({
  workspaceId,
  rootEpoch,
  activitySequence,
  catalogProjects,
  view,
  onViewChange,
  onOpenProject,
}: {
  workspaceId: string;
  rootEpoch: number;
  activitySequence: number;
  catalogProjects: ProjectSummary[];
  view: WorkspaceView;
  onViewChange(view: WorkspaceView): void;
  onOpenProject(project: ProjectSummary): void;
}) {
  const [controller, setController] = useState<WorkspaceScreenController | null>(null);
  useEffect(
    () => startWorkspaceScreenController(bridge, workspaceId, activitySequence, setController),
    [rootEpoch, workspaceId],
  );
  useEffect(() => { void controller?.refresh(activitySequence); }, [activitySequence, controller]);
  return controller
    ? <ConnectedWorkspaceScreen controller={controller} catalogProjects={catalogProjects} view={view} onViewChange={onViewChange} onOpenProject={onOpenProject} />
    : <main className="main-region"><div className="project-skeleton" role="status">Loading workspace overview…</div></main>;
}
