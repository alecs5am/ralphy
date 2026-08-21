import { FolderOpen, Pin, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MediaCardDto } from "../../electron/ralphy/types";
import { MediaCardPreview } from "../components/VirtualAssetGrid";
import type { ProjectSummary } from "../lib/ipc";
import { bridge } from "../lib/ipc";
import { projectGlyphSlot, projectGlyphVars } from "../lib/project-glyph";
import { defineInstrumentScreenStates, InstrumentScreenRoot } from "../instrument/screen-state-registry";
import { sortProjects, WORKSPACE_PAGE_LABELS, type WorkspacePage } from "../state/workbench";

export const workspaceProjectsInstrumentStates = defineInstrumentScreenStates({
  routeKey: "workspace.projects",
  states: ["ready", "empty"],
  rootMarker: "workspace-projects",
  landmarks: ["Projects", "All projects"],
} as const);

export const workspaceUnitsInstrumentStates = defineInstrumentScreenStates({
  routeKey: "workspace.units",
  states: ["unavailable"],
  rootMarker: "workspace-units",
  landmarks: ["Units", "Units is not wired yet."],
} as const);

interface WorkspaceProjectsScreenProps {
  workspaceName: string;
  workspaceDescription: string;
  projects: ProjectSummary[];
  rootEpoch: number;
  pinnedProjectIds: string[];
  searchRequest: number;
  onOpenProject(project: ProjectSummary): void;
  onToggleProjectPin(projectId: string): void;
}

function relativeActivity(value: string): string {
  const elapsed = Date.now() - Date.parse(value);
  if (!Number.isFinite(elapsed) || elapsed < 0) return "now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d` : new Date(value).toLocaleDateString();
}

function initials(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase();
}

function ProjectPreview({ project, rootEpoch }: { project: ProjectSummary; rootEpoch: number }) {
  const [media, setMedia] = useState<MediaCardDto[]>([]);

  useEffect(() => {
    let current = true;
    setMedia([]);
    void bridge.loadProjectPage({
      tab: "media",
      project,
      mediaQuery: { filter: "all" },
    }).then((page) => {
      if (!current) return;
      setMedia((page.items as MediaCardDto[])
        .filter((item) => item.mediaKind === "image" || item.mediaKind === "video")
        .slice(0, 4));
    }).catch(() => undefined);
    return () => { current = false; };
  }, [project.projectId, project.workspaceId, rootEpoch]);

  return (
    <div className="workspace-project-preview" style={projectGlyphVars(project.name)} aria-hidden="true">
      {media.length > 0 ? (
        <div className="workspace-project-preview-collage" data-count={media.length}>
          {media.map((card) => (
            <MediaCardPreview
              key={`${card.ref.type}:${card.ref.id}`}
              card={card}
              project={project}
              rootEpoch={rootEpoch}
              resolvePreview={bridge.resolveProjectPreview}
              fill
              className="workspace-project-preview-file"
            />
          ))}
        </div>
      ) : (
        <span className="workspace-project-preview-mark" data-glyph={projectGlyphSlot(project.name)}>
          {initials(project.name)}
        </span>
      )}
      <span className="workspace-project-preview-meta">{project.aspectRatio ?? "Project"}</span>
    </div>
  );
}

function PinButton({ project, active, onToggle }: { project: ProjectSummary; active: boolean; onToggle(): void }) {
  const label = active ? `Unpin project ${project.name}` : `Pin project ${project.name}`;
  return (
    <button
      className={`row-pin workspace-project-card-pin${active ? " is-pinned" : ""}`}
      type="button"
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <Pin size={13} fill={active ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}

function ProjectCard({ project, rootEpoch, pinned, onOpen, onTogglePin }: { project: ProjectSummary; rootEpoch: number; pinned: boolean; onOpen(): void; onTogglePin(): void }) {
  return (
    <article className="workspace-project-card-shell">
      <button className="workspace-project-card" type="button" aria-label={`Open project ${project.name}`} onClick={onOpen}>
        <ProjectPreview project={project} rootEpoch={rootEpoch} />
        <span className="workspace-project-card-details">
          <span className="workspace-project-card-copy">
            <strong>{project.name}</strong>
            <small>{project.brief || "No brief available"}</small>
          </span>
          <span className="workspace-project-card-status">
            <span className="workspace-project-phase" data-status={project.status}><i className="status-dot" />{project.status}</span>
            <span>{project.finalCount} final{project.finalCount === 1 ? "" : "s"} · {relativeActivity(project.recentActivity)}</span>
          </span>
        </span>
      </button>
      <PinButton project={project} active={pinned} onToggle={onTogglePin} />
    </article>
  );
}

export function WorkspaceProjectsScreen({
  workspaceName,
  workspaceDescription,
  projects,
  rootEpoch,
  pinnedProjectIds,
  searchRequest,
  onOpenProject,
  onToggleProjectPin,
}: WorkspaceProjectsScreenProps) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchRequest === 0) return;
    searchRef.current?.focus();
    searchRef.current?.select();
  }, [searchRequest]);

  const ordered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return sortProjects(
      projects.filter((project) => !needle || [project.name, project.brief, project.status, project.phase ?? ""].some((value) => value.toLocaleLowerCase().includes(needle))),
      pinnedProjectIds,
    );
  }, [pinnedProjectIds, projects, query]);

  const spend = projects.reduce((total, project) => total + (project.spendUsd ?? 0), 0);
  const spendCount = projects.filter((project) => project.spendUsd !== null).length;
  const finals = projects.reduce((total, project) => total + project.finalCount, 0);

  return (
    <InstrumentScreenRoot descriptor={workspaceProjectsInstrumentStates} state={projects.length === 0 ? "empty" : "ready"}>
    <main className="main-region workspace-projects-region">
      <div className="screen-header workspace-header">
        <div>
          <div className="screen-kicker">{workspaceName}</div>
          <h2>Projects</h2>
          <p>{workspaceDescription || "Projects in this workspace"}</p>
        </div>
        <div className="workspace-header-actions">
          <label className="workspace-search">
            <Search size={14} aria-hidden="true" />
            <input ref={searchRef} type="search" value={query} placeholder="Filter projects" aria-label="Filter projects" onChange={(event) => setQuery(event.target.value)} />
            <kbd>⌘F</kbd>
          </label>
        </div>
      </div>

      <section className="metrics-band" aria-label="Workspace project summary">
        <div className="metric"><span className="metric-icon"><FolderOpen size={15} aria-hidden="true" /></span><span className="metric-value">{projects.length}</span><span className="metric-label">Projects</span></div>
        <div className="metric"><span className="metric-value">{finals}</span><span className="metric-label">Final renders</span></div>
        <div className="metric"><span className="metric-value">{spendCount === 0 ? "—" : `$${spend.toFixed(2)}`}</span><span className="metric-label">Indexed spend</span></div>
      </section>

      <section className="content-section workspace-projects" aria-label="Projects">
        <div className="section-heading"><h3>All projects</h3><span>{ordered.length}{query ? " matching" : " total"}</span></div>
        {ordered.length === 0 ? (
          <div className="empty-section">{query ? "No projects match this filter." : "No projects in this workspace."}</div>
        ) : (
          <div className="workspace-project-grid">
            {ordered.map((project) => <ProjectCard key={project.id} project={project} rootEpoch={rootEpoch} pinned={pinnedProjectIds.includes(project.id)} onOpen={() => onOpenProject(project)} onTogglePin={() => onToggleProjectPin(project.id)} />)}
          </div>
        )}
      </section>
    </main>
    </InstrumentScreenRoot>
  );
}

export function WorkspacePagePlaceholder({ workspaceName, page }: { workspaceName: string; page: Exclude<WorkspacePage, "projects"> }) {
  if (page !== "units") throw new Error(`WorkspacePagePlaceholder cannot render workspace.${page}`);
  return (
    <InstrumentScreenRoot descriptor={workspaceUnitsInstrumentStates} state="unavailable">
    <main className="main-region">
      <div className="screen-header"><div><div className="screen-kicker">{workspaceName}</div><h2>{WORKSPACE_PAGE_LABELS[page]}</h2><p>Workspace tools are ready to be connected to the Core contract.</p></div></div>
      <section className="content-section"><div className="empty-section">{WORKSPACE_PAGE_LABELS[page]} is not wired yet.</div></section>
    </main>
    </InstrumentScreenRoot>
  );
}
