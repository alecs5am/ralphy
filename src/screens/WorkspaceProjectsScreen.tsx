import { FolderOpen, Pin, Search } from "lucide-react";

import { Keycap } from "../components/ui/Keycap";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MediaCardDto } from "../../electron/ralphy/types";
import { MediaCardPreview } from "../components/VirtualAssetGrid";
import type { ProjectSummary } from "../lib/ipc";
import { bridge } from "../lib/ipc";
import { projectGlyphVars } from "../lib/project-glyph";
import { defineInstrumentScreenStates, InstrumentScreenRoot } from "../instrument/screen-state-registry";
import { sortProjects } from "../state/workbench";
import { EMPTY_SECTION } from "./route-chrome";

export const workspaceProjectsInstrumentStates = defineInstrumentScreenStates({
  routeKey: "workspace.projects",
  states: ["ready", "empty"],
  rootMarker: "workspace-projects",
  landmarks: ["Projects", "All projects"],
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

/* One metric tile. `metric` stays as the class the shared metrics band selects. */
const METRIC = "metric flex min-h-16 min-w-0 items-center gap-3 rounded-cell bg-surface px-4 py-3";

/* The collage is a flush mosaic, so its tiles give up the radius MediaCardPreview's shared base
   carries and the extension badge that labels an empty frame. Both are stated from the collage
   rather than on the tile: the tile is another area's component, and appending `rounded-none` to
   its base's `rounded-cell` would leave two radius utilities on one element with the generated
   order deciding which wins. */
const COLLAGE = "workspace-project-preview-collage absolute inset-0 grid bg-frame [&>.asset-preview]:rounded-none [&_.asset-extension]:hidden";
/* One track per tile: a single file fills the frame, two split it, three and four stack. */
const COLLAGE_TRACKS = ["grid-cols-1 grid-rows-1", "grid-cols-1 grid-rows-1", "grid-cols-2 grid-rows-1", "grid-cols-2 grid-rows-2", "grid-cols-2 grid-rows-2"];

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

  const tracks = COLLAGE_TRACKS[Math.min(media.length, 4)];

  return (
    <div className="workspace-project-preview relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-cell bg-frame text-(--glyph-color)" style={projectGlyphVars(project.name)} aria-hidden="true">
      {media.length > 0 ? (
        // Read out of the map before the class string: the style audit scans class attributes for
        // arbitrary values, and a `${MAP[key]}` interpolation reads as one.
        <div className={`${COLLAGE} ${tracks}`} data-count={media.length}>
          {media.map((card, index) => (
            <MediaCardPreview
              key={`${card.ref.type}:${card.ref.id}`}
              card={card}
              project={project}
              rootEpoch={rootEpoch}
              resolvePreview={bridge.resolveProjectPreview}
              fill
              className={`workspace-project-preview-file min-h-0 ${media.length === 3 && index === 0 ? "row-span-2" : ""}`}
            />
          ))}
        </div>
      ) : (
        <span className="workspace-project-preview-mark relative z-base font-code type-xl">
          {initials(project.name)}
        </span>
      )}
    </div>
  );
}

/* The pin fades in with the card and stays in once it is set, so exactly one opacity utility
   lands on it in either state. `row-pin` stays as the shared pin hook. */
const PIN = "row-pin workspace-project-card-pin absolute top-2 right-2 z-base grid size-5.5 place-items-center rounded-control text-muted hover:bg-surface-sunken/72 [transition:opacity_var(--dur-fast)_var(--ease),background-color_var(--dur-fast)_var(--ease)] motion-reduce:transition-none";

function PinButton({ project, active, onToggle }: { project: ProjectSummary; active: boolean; onToggle(): void }) {
  const label = active ? `Unpin project ${project.name}` : `Pin project ${project.name}`;
  return (
    <button
      className={`${PIN} ${active ? "is-pinned opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}
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
    <article className="workspace-project-card-shell group relative min-w-0 bg-transparent text-ink">
      <button className="workspace-project-card flex w-full min-w-0 flex-col gap-2 rounded-cell bg-transparent p-0 text-left text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink" type="button" aria-label={`Open project ${project.name}`} onClick={onOpen}>
        <ProjectPreview project={project} rootEpoch={rootEpoch} />
        <span className="workspace-project-card-details flex min-h-0 w-full min-w-0 flex-row items-end justify-between gap-4">
          <span className="workspace-project-card-copy flex min-w-0 flex-1 flex-col gap-1">
            <strong className="flex min-w-0 items-center gap-1.5 overflow-hidden type-label leading-4 font-normal text-ink">
              {/* Decorative: no rule has ever read `data-status`, so every status paints one tone. */}
              <i className="status-dot size-1.25 flex-none rounded-control bg-muted" data-status={project.status} />
              <span className="truncate">{project.name}</span>
            </strong>
            <small className="block truncate font-code type-mono-xs tracking-caps text-muted uppercase">{project.finalCount} final{project.finalCount === 1 ? "" : "s"} · {relativeActivity(project.recentActivity)}</small>
          </span>
          <span className="workspace-project-card-status mt-auto flex shrink-0 items-center text-right font-code type-mono-xs tracking-caps text-muted uppercase">{project.status}</span>
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
    <main className="main-region workspace-projects-region @container/main-region flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-auto bg-transparent p-2 pb-6 type-base text-ink">
      <div className="screen-header workspace-header m-0 flex min-h-0 w-full max-w-none flex-wrap items-center justify-between gap-4 rounded-panel bg-instrument px-5 py-4 text-on-instrument @max-workspace-projects-header/main-region:flex-col">
        <div>
          <div className="screen-kicker mb-1 type-xs uppercase tracking-wide text-on-instrument-muted">{workspaceName}</div>
          <h2 className="mt-1 mb-1.25 type-hero font-semibold leading-none tracking-tight text-on-instrument">Projects</h2>
          <p className="mt-1 max-w-screen-copy type-base text-on-instrument-muted">{workspaceDescription || "Projects in this workspace"}</p>
        </div>
        <div className="workspace-header-actions flex min-w-workspace-search flex-1 items-center gap-3.5 @min-workspace-header/instrument-desk:max-w-workspace-search-max @max-workspace-projects-header/main-region:w-full">
          <label className="workspace-search flex h-9 w-full items-center gap-2 rounded-control bg-instrument-raised px-3 text-on-instrument-muted focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-focus-on-instrument">
            <Search size={14} aria-hidden="true" />
            <input className="min-w-0 flex-1 bg-transparent type-base text-on-instrument outline-none placeholder:text-on-instrument-muted" ref={searchRef} type="search" value={query} placeholder="Filter projects" aria-label="Filter projects" onChange={(event) => setQuery(event.target.value)} />
            <Keycap tokens={["⌘", "F"]} tone="on-dark" />
          </label>
        </div>
      </div>

      <section className="metrics-band m-0 grid w-full max-w-none grid-cols-(--metrics-band-columns) gap-px overflow-hidden rounded-panel bg-divider p-0" aria-label="Workspace project summary">
        <div className={METRIC}><span className="metric-icon grid size-6 shrink-0 place-items-center self-center rounded-field bg-surface-sunken text-muted"><FolderOpen size={15} aria-hidden="true" /></span><span className="metric-value truncate font-code type-metric font-semibold leading-none text-ink">{projects.length}</span><span className="metric-label type-sm text-muted">Projects</span></div>
        <div className={METRIC}><span className="metric-value truncate font-code type-metric font-semibold leading-none text-ink">{finals}</span><span className="metric-label type-sm text-muted">Final renders</span></div>
        <div className={METRIC}><span className="metric-value truncate font-code type-metric font-semibold leading-none text-ink">{spendCount === 0 ? "—" : `$${spend.toFixed(2)}`}</span><span className="metric-label type-sm text-muted">Indexed spend</span></div>
      </section>

      <section className="content-section workspace-projects m-0 w-full min-w-0 max-w-none bg-transparent p-0" aria-label="Projects">
        <div className="section-heading mb-3 flex h-8 items-center justify-between"><h3 className="type-lg font-semibold text-ink">All projects</h3><span className="type-sm text-muted">{ordered.length}{query ? " matching" : " total"}</span></div>
        {ordered.length === 0 ? (
          <div className={EMPTY_SECTION}>{query ? "No projects match this filter." : "No projects in this workspace."}</div>
        ) : (
          <div className="workspace-project-grid grid grid-cols-(--workspace-project-grid-columns) gap-2">
            {ordered.map((project) => <ProjectCard key={project.id} project={project} rootEpoch={rootEpoch} pinned={pinnedProjectIds.includes(project.id)} onOpen={() => onOpenProject(project)} onTogglePin={() => onToggleProjectPin(project.id)} />)}
          </div>
        )}
      </section>
    </main>
    </InstrumentScreenRoot>
  );
}

