import {
  ArrowRight,
  CircleDollarSign,
  FolderOpen,
  GalleryHorizontalEnd,
  Layers3,
} from "lucide-react";
import type {
  CatalogResult,
  ProjectSummary,
  WorkspaceSummary,
} from "../lib/ipc";
import { sortWorkspaces } from "../state/workbench";
import { defineInstrumentScreenStates, InstrumentScreenRoot } from "../instrument/screen-state-registry";

export const libraryInstrumentStates = defineInstrumentScreenStates({
  routeKey: "startup.library",
  states: ["restoring", "ready", "empty", "unavailable", "error"],
  rootMarker: "startup-library",
  landmarks: ["Workspace overview", "Production library"],
} as const);

interface LibraryScreenProps {
  catalog: CatalogResult | null;
  error?: string | null;
  restoring?: boolean;
  pinnedWorkspaceIds: string[];
  onRetry(): void;
  onOpenWorkspace(workspaceId: string): void;
  onOpenProject(project: ProjectSummary): void;
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="metric">
      <span className="metric-icon">{icon}</span>
      <span className="metric-value">{value}</span>
      <span className="metric-label">{label}</span>
    </div>
  );
}

function WorkspaceLine({
  workspace,
  onOpen,
}: {
  workspace: WorkspaceSummary;
  onOpen(): void;
}) {
  return (
    <button className="entity-line" type="button" onClick={onOpen}>
      <span className="entity-monogram">
        {workspace.name.slice(0, 2).toLocaleUpperCase()}
      </span>
      <span className="entity-line-copy">
        <strong>{workspace.name}</strong>
        <small>
          {workspace.description || "Ralphy production workspace"}
        </small>
      </span>
      <span className="entity-line-stats">
        <span>{workspace.projectCount} projects</span>
        <span>{workspace.finalCount} finals</span>
      </span>
      <ArrowRight size={15} aria-hidden="true" />
    </button>
  );
}

export function LibraryScreen({
  catalog,
  error,
  restoring,
  pinnedWorkspaceIds,
  onRetry,
  onOpenWorkspace,
  onOpenProject,
}: LibraryScreenProps) {
  if (!catalog) {
    const state = restoring ? "restoring" : error ? "error" : "unavailable";
    return (
      <InstrumentScreenRoot descriptor={libraryInstrumentStates} state={state}>
      <main className="main-region empty-library">
        <div className="empty-library-content">
          <div className="ralphy-wordmark">RALPHY</div>
          <h2>Home library unavailable</h2>
          <p>{error ?? "Ralphy could not open ~/.ralphy."}</p>
          <button className="command-button is-primary" type="button" disabled={restoring} onClick={onRetry}>
            {restoring ? "Opening…" : "Retry"}
          </button>
        </div>
      </main>
      </InstrumentScreenRoot>
    );
  }

  const ordered = sortWorkspaces(catalog.workspaces, pinnedWorkspaceIds);
  const projects = catalog.projects;
  const projectsWithSpend = projects.filter((project) => project.spendUsd !== null);
  const spend = projectsWithSpend.reduce(
    (total, project) => total + (project.spendUsd ?? 0),
    0,
  );
  const finals = projects.reduce((total, project) => total + project.finalCount, 0);
  const attention = projects.filter(
    (project) => project.finalCount === 0 && project.status !== "done",
  );

  return (
    <InstrumentScreenRoot descriptor={libraryInstrumentStates} state={catalog.workspaces.length === 0 ? "empty" : "ready"}>
    <main className="main-region">
      <div className="screen-header">
        <div>
          <div className="screen-kicker">Production library</div>
          <h2>Workspace overview</h2>
          <p className="screen-path" title={catalog.rootPath}>{catalog.rootPath}</p>
        </div>
      </div>

      <section className="metrics-band" aria-label="Library summary">
        <Metric
          label="Workspaces"
          value={catalog.workspaces.length}
          icon={<Layers3 size={15} />}
        />
        <Metric label="Projects" value={projects.length} icon={<FolderOpen size={15} />} />
        <Metric label="Final renders" value={finals} icon={<GalleryHorizontalEnd size={15} />} />
        <Metric
          label="Indexed project spend"
          value={projectsWithSpend.length === 0 ? "—" : `$${spend.toFixed(2)}`}
          icon={<CircleDollarSign size={15} />}
        />
      </section>

      <div className="overview-columns">
        <section className="content-section">
          <div className="section-heading">
            <h3>Recent workspaces</h3>
            <span>By activity</span>
          </div>
          <div className="entity-list">
            {ordered.slice(0, 8).map((workspace) => (
              <WorkspaceLine
                key={workspace.id}
                workspace={workspace}
                onOpen={() => onOpenWorkspace(workspace.id)}
              />
            ))}
          </div>
        </section>

        <section className="content-section attention-section">
          <div className="section-heading">
            <h3>Needs attention</h3>
            <span>{attention.length}</span>
          </div>
          <div className="attention-list">
            {attention.slice(0, 8).map((project) => (
              <button
                type="button"
                className="attention-line"
                key={project.id}
                onClick={() => onOpenProject(project)}
              >
                <span className="status-dot" />
                <span>
                  <strong>{project.name}</strong>
                  <small>{project.phase ?? project.status} · no final render</small>
                </span>
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            ))}
            {attention.length === 0 && (
              <div className="empty-section">No projects need attention.</div>
            )}
          </div>
        </section>
      </div>
    </main>
    </InstrumentScreenRoot>
  );
}
