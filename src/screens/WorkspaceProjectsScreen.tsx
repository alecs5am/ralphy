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
    <div className="workspace-project-preview relative aspect-[16/9] w-full overflow-hidden rounded-[14px] bg-surface-sunken" style={projectGlyphVars(project.name)} aria-hidden="true">
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
    <article className="workspace-project-card-shell group relative min-w-0 overflow-hidden rounded-panel bg-instrument text-on-instrument shadow-none">
      <button className="workspace-project-card flex w-full min-w-0 flex-col gap-3 border-0 bg-transparent p-2 text-left text-on-instrument" type="button" aria-label={`Open project ${project.name}`} onClick={onOpen}>
        <ProjectPreview project={project} rootEpoch={rootEpoch} />
        <span className="workspace-project-card-details flex w-full min-w-0 flex-row items-end justify-between gap-4 px-1 pb-1">
          <span className="workspace-project-card-copy min-w-0">
            <strong className="block truncate text-[15px] font-semibold leading-5 text-on-instrument">{project.name}</strong>
            <small className="mt-0.5 block truncate text-[12px] leading-4 text-on-instrument-muted">{project.brief || "No brief available"}</small>
          </span>
          <span className="workspace-project-card-status shrink-0 text-right text-[11px] leading-4 text-on-instrument-muted">
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
    <main className="main-region workspace-projects-region flex min-h-0 flex-1 flex-col gap-2 overflow-auto bg-transparent p-2 pb-6 text-[13px] text-ink">
      <div className="screen-header workspace-header m-0 flex min-h-0 w-full max-w-none flex-wrap items-center justify-between gap-4 rounded-panel border-0 bg-instrument px-5 py-4 text-on-instrument shadow-none">
        <div>
          <div className="screen-kicker text-[11px] uppercase tracking-[0.14em] text-on-instrument-muted">{workspaceName}</div>
          <h2 className="mt-1 text-[28px] font-semibold leading-none tracking-[-0.03em] text-on-instrument">Projects</h2>
          <p className="mt-1 text-[13px] text-on-instrument-muted">{workspaceDescription || "Projects in this workspace"}</p>
        </div>
        <div className="workspace-header-actions min-w-[240px] flex-1 sm:max-w-[340px]">
          <label className="workspace-search flex h-9 w-full items-center gap-2 rounded-control bg-instrument-raised px-3 text-on-instrument-muted">
            <Search size={14} aria-hidden="true" />
            <input className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-on-instrument outline-none placeholder:text-on-instrument-muted" ref={searchRef} type="search" value={query} placeholder="Filter projects" aria-label="Filter projects" onChange={(event) => setQuery(event.target.value)} />
            <kbd className="text-[10px] text-on-instrument-muted">⌘F</kbd>
          </label>
        </div>
      </div>

      <section className="metrics-band m-0 grid w-full max-w-none grid-cols-1 gap-px overflow-hidden rounded-panel border-0 bg-divider p-0 shadow-none sm:grid-cols-3" aria-label="Workspace project summary">
        <div className="metric flex min-h-16 items-center gap-3 bg-surface px-4 py-3"><span className="metric-icon text-muted"><FolderOpen size={15} aria-hidden="true" /></span><span className="metric-value text-[22px] font-semibold leading-none text-ink">{projects.length}</span><span className="metric-label text-[12px] text-muted">Projects</span></div>
        <div className="metric flex min-h-16 items-center gap-3 bg-surface px-4 py-3"><span className="metric-value text-[22px] font-semibold leading-none text-ink">{finals}</span><span className="metric-label text-[12px] text-muted">Final renders</span></div>
        <div className="metric flex min-h-16 items-center gap-3 bg-surface px-4 py-3"><span className="metric-value text-[22px] font-semibold leading-none text-ink">{spendCount === 0 ? "—" : `$${spend.toFixed(2)}`}</span><span className="metric-label text-[12px] text-muted">Indexed spend</span></div>
      </section>

      <section className="content-section workspace-projects m-0 w-full max-w-none rounded-panel border-0 bg-surface p-4 shadow-none" aria-label="Projects">
        <div className="section-heading mb-3 flex items-center justify-between"><h3 className="text-[15px] font-semibold text-ink">All projects</h3><span className="text-[12px] text-muted">{ordered.length}{query ? " matching" : " total"}</span></div>
        {ordered.length === 0 ? (
          <div className="empty-section">{query ? "No projects match this filter." : "No projects in this workspace."}</div>
        ) : (
          <div className="workspace-project-grid grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3">
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
    <main className="main-region flex min-h-0 flex-1 flex-col gap-2 overflow-auto bg-transparent p-2 pb-6 text-[13px] text-ink">
      <div className="screen-header m-0 w-full max-w-none rounded-panel border-0 bg-instrument px-5 py-4 text-on-instrument shadow-none"><div><div className="screen-kicker text-[11px] uppercase tracking-[0.14em] text-on-instrument-muted">{workspaceName}</div><h2 className="mt-1 text-[28px] font-semibold leading-none tracking-[-0.03em] text-on-instrument">{WORKSPACE_PAGE_LABELS[page]}</h2><p className="mt-1 text-[13px] text-on-instrument-muted">Workspace tools are ready to be connected to the Core contract.</p></div></div>
      <section className="content-section m-0 grid min-h-48 w-full max-w-none place-items-center rounded-panel border-0 bg-surface p-6 shadow-none"><div className="empty-section max-w-lg text-center text-[14px] text-muted">{WORKSPACE_PAGE_LABELS[page]} is not wired yet.</div></section>
    </main>
    </InstrumentScreenRoot>
  );
}
