import {
  Brain,
  Calendar,
  ChevronRight,
  Folder,
  Layers,
  LayoutDashboard,
  Library,
  ScrollText,
  Search,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { Keycap } from "@/shared/ui/Keycap";
import type { ProjectSummary, WorkspaceSummary } from "../../../../electron/media/types";
import {
  WORKSPACE_VIEW_TYPES,
  type OpenViewRequest,
  type ViewTabType,
  type WorkspaceViewType,
} from "../model/view-panel";

/**
 * The home tab's page: the workspace hub. It is the panel's point of return, so it answers the two
 * questions a return asks -- which projects are here, and which workspace pages exist -- and does
 * it with the workspace's own counts rather than a copy of the overview screen.
 *
 * The handoff's third block, `НЕДАВНЕЕ`, is not here: it needs a per-workspace recents log that
 * nothing in the app writes today, and a "recent" list backed by nothing is a worse answer than
 * no list. The two blocks that are here are backed by the catalog.
 */

const SECTION = "m-0 px-1 pt-2.75 pb-1.25 font-code type-mono-xs tracking-mono text-muted";
const ROW = "grid w-full items-center gap-2.5 rounded-field px-2.5 text-left hover:bg-panel focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink";
const TILE = "flex flex-col gap-2.25 rounded-cell bg-panel p-2.75 text-left hover:bg-chip focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink";

/* One tile per workspace page, and the type says so: `WorkspaceViewType` is the key set of the
   table in view-panel.ts that decides which types are pages, so a page added there without an icon
   here fails the typecheck. It used to be a Partial read through a `!`, and the Context page shipped
   without a tile -- `TILE_ICONS.context` was undefined, React threw on an undefined element type,
   and the whole tree unmounted, leaving the window grey the moment anyone opened the hub. */
const TILE_ICONS: Record<WorkspaceViewType, LucideIcon> = {
  overview: LayoutDashboard,
  projects: Folder,
  units: Layers,
  context: ScrollText,
  calendar: Calendar,
  shared: Library,
  memory: Brain,
};

/** A project's dot: the same three-state vocabulary the rest of the app reads. */
function statusTone(project: ProjectSummary): string {
  const status = project.status.toLocaleLowerCase();
  if (status.includes("review") || status.includes("render")) return "bg-transparent [box-shadow:inset_0_0_0_1.5px_var(--instrument-text-secondary-readable)]";
  if (status.includes("final") || status.includes("done") || status.includes("approved")) return "bg-ink";
  return "bg-unreviewed";
}

export interface ViewPanelHubProps {
  workspace: WorkspaceSummary | null;
  projects: readonly ProjectSummary[];
  workspaces: readonly WorkspaceSummary[];
  chords: Record<string, readonly string[]>;
  onOpen(request: OpenViewRequest): void;
  onOpenProject(project: ProjectSummary): void;
  onOpenWorkspace(workspaceId: string): void;
}

export function ViewPanelHub({ workspace, projects, workspaces, chords, onOpen, onOpenProject, onOpenWorkspace }: ViewPanelHubProps) {
  const [query, setQuery] = useState("");

  /* The handoff's empty state belongs to the iteration before the permanent home tab: with home
     always present and always the hub, the panel is never empty *of tabs*. What it can be empty of
     is a workspace, and that is the state this shape now serves -- the same geometry, offering the
     workspaces there are instead of three pages that need a workspace to mean anything. */
  if (!workspace) return <div className="view-panel-empty flex min-h-full w-full min-w-0 flex-col justify-center gap-1 px-3.5">
    <strong className="type-lg font-normal text-ink">No workspace is open</strong>
    <p className="m-0 mb-1.5 type-ui leading-copy text-muted">A view is a place inside a workspace, so the panel opens one first.</p>
    {workspaces.slice(0, 3).map((candidate) => <button
      className={`${ROW} h-9 grid-cols-(--view-menu-columns)`}
      type="button"
      key={candidate.id}
      onClick={() => onOpenWorkspace(candidate.id)}
    >
      <Folder size={15} strokeWidth={1.8} className="text-muted" aria-hidden="true" />
      <span className="min-w-0 truncate type-ui text-ink">{candidate.name}</span>
      <ChevronRight size={11} strokeWidth={2} className="text-muted-decorative" aria-hidden="true" />
    </button>)}
    {workspaces.length === 0 && <p className="m-0 type-ui text-muted">The library has no workspaces yet.</p>}
  </div>;

  const term = query.trim().toLocaleLowerCase();
  const visible = term ? projects.filter(({ name }) => name.toLocaleLowerCase().includes(term)) : projects;
  const counts: Partial<Record<ViewTabType, { value: string; meta: string }>> = {
    projects: { value: String(workspace.projectCount), meta: "IN THIS WORKSPACE" },
    units: { value: String(workspace.unitCount), meta: `${workspace.finalCount} FINAL` },
    shared: { value: String(workspace.sharedCount), meta: "SHARED ASSETS" },
  };

  /* The hub stands inside the desk's own scroller, which is the page card's scroll surface, so it
     does not open a second one: the toolbar sticks to the top of that scroller instead. */
  return <div className="view-panel-hub flex min-h-full w-full min-w-0 flex-col">
    {/* The toolbar row every view type carries, at the handoff's 34: here it is the hub's search. */}
    <div className="view-panel-toolbar sticky top-0 z-sticky flex h-8.5 flex-none items-center gap-1.5 bg-card px-2">
      <label className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-control bg-panel px-2.75 text-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
        <Search size={13} strokeWidth={1.9} aria-hidden="true" />
        <input
          className="min-w-0 flex-1 bg-transparent type-ui text-ink placeholder:text-muted"
          value={query}
          placeholder="Search projects"
          aria-label="Search projects in this workspace"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
    </div>
    <div className="flex-1 px-2 pb-2">
      <h2 className={SECTION}>PROJECTS</h2>
      {visible.map((project) => <button
        className={`${ROW} grid h-8.5 grid-cols-(--view-hub-project-columns)`}
        type="button"
        key={project.id}
        onClick={() => onOpenProject(project)}
      >
        <i className={`size-1.75 rounded-full ${statusTone(project)}`} aria-hidden="true" />
        <span className="min-w-0 truncate type-base text-ink">{project.name}</span>
        <span className="flex-none font-code type-mono-xs tracking-mono text-muted">{project.status.toLocaleUpperCase()}</span>
        <ChevronRight size={11} strokeWidth={2} className="text-muted-decorative" aria-hidden="true" />
      </button>)}
      {visible.length === 0 && <p className="m-0 px-2.5 py-1.5 type-ui text-muted">
        {term ? `No project matches “${query.trim()}”.` : "This workspace has no projects yet."}
      </p>}

      <h2 className={SECTION}>WORKSPACE PAGES</h2>
      <div className="grid grid-cols-2 gap-1.5">
        {WORKSPACE_VIEW_TYPES.map((descriptor) => {
          const Icon = TILE_ICONS[descriptor.type as WorkspaceViewType];
          const cap = descriptor.command ? chords[descriptor.command] : undefined;
          const count = counts[descriptor.type];
          return <button
            className={TILE}
            type="button"
            key={descriptor.type}
            onClick={() => onOpen({ type: descriptor.type, label: descriptor.label })}
          >
            <span className="flex min-w-0 items-center gap-2.25">
              <Icon size={15} strokeWidth={1.8} className="flex-none text-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate type-ui text-ink">{descriptor.label}</span>
              {cap && <Keycap tokens={cap} />}
            </span>
            {/* A tile with no count states nothing rather than a zero: the page is real, the
                reading is what Core does not report for it. */}
            {count
              ? <span className="flex min-w-0 items-baseline gap-1.5">
                <b className="font-display type-title font-extrabold text-ink">{count.value}</b>
                <span className="min-w-0 truncate font-code type-mono-2xs tracking-mono text-muted">{count.meta}</span>
              </span>
              : <span className="font-code type-mono-2xs tracking-mono text-muted">NOT COUNTED BY CORE</span>}
          </button>;
        })}
      </div>
    </div>
  </div>;
}
