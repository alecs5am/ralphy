import { PageHeader, PAGE_HEADER_BUTTON } from "@/shared/ui/PageHeader";
import { FileText, Film, Image, Images, Layers3, LayoutGrid, List, Music2, Search } from "@/shared/ui/icons";
import { useEffect, useState } from "react";

import type { OverviewPublicationDto, UnitDto } from "../../../../electron/ralphy/types";
import { entityDragProps } from "@/features/agent-chat";
import { UnitRevisionPreview, unitPreviewKind } from "@/entities/unit";
import { projectGlyphVars } from "@/shared/lib/project-glyph";
import { bridge, type ProjectReference, type ProjectSummary } from "@/shared/api/ipc";
import { defineInstrumentScreenStates, InstrumentScreenRoot } from "@/shared/instrument/screen-state-registry";
import { WORKSPACE_PAGE_LABELS } from "@/shared/model/workbench";
import { COMMAND_BUTTON, STATE_BOX, STATE_COLUMN, STATE_INK, STATE_PAD } from "@/shared/ui/route-chrome";
import { SelectMenu } from "@/shared/ui/SelectMenu";
import { SegmentedControl } from "@/shared/ui/SegmentedControl";
import { loadWorkspaceUnits } from "../api/load-workspace-units";

export const workspaceUnitsInstrumentStates = defineInstrumentScreenStates({
  routeKey: "workspace.units",
  states: ["loading", "ready", "empty", "partial", "error"],
  rootMarker: "workspace-units",
  landmarks: ["Content", "All content"],
} as const);

interface WorkspaceUnit {
  unit: UnitDto;
  project: ProjectSummary | null;
  published: Publication;
}

/* What this page can actually establish about a Unit. A publication is a fact in the project's
   overview, and it is the only lifecycle fact one list-wide read carries: the fuller ladder --
   rendering, render failed, preview ready, selected -- needs the Unit's revision and its builds,
   which this page does not read. Resolving a cover is not a lifecycle check. A row here therefore
   states a publication or states nothing, rather than reporting "Selected" for every Unit that
   merely has a selected revision. */
type Publication = "published" | "scheduled" | null;

export function publicationOf(unit: UnitDto, publications: readonly OverviewPublicationDto[]): Publication {
  const mine = publications.filter((item) => item.unitId === unit.id);
  if (mine.some((item) => item.state === "published")) return "published";
  return mine.some((item) => item.state === "scheduled") ? "scheduled" : null;
}

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; units: UnitDto[]; publications: OverviewPublicationDto[]; warning: string | null };

/* The app has no green: a publication state is told the way the calendar tells it, in ink for what
   has happened and a quiet plate for what is only planned. `bg-ok`/`bg-warn` named colours that do
   not exist in any theme, so those chips rendered with no plate at all. */
const CHIP: Record<"published" | "scheduled", { label: string; skin: string }> = {
  published: { label: "Published", skin: "bg-instrument text-on-instrument" },
  scheduled: { label: "Scheduled", skin: "bg-surface-sunken text-muted" },
};

const ROW = "workspace-unit-row grid min-h-10 w-full grid-cols-(--workspace-unit-columns) items-center gap-2 rounded-cell bg-surface px-2 py-2 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink @max-workspace-row/main-region:grid-cols-(--workspace-unit-narrow-columns)";
const META = "type-xs text-muted";
const FILTER = "h-8 min-w-0 max-w-workspace-search flex-1 rounded-full bg-field px-3 type-xs text-ink hover:bg-row-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink";
const FORMAT_ICON = { video: Film, longform: Film, carousel: Images, post: FileText, generic: Layers3 };
const formatLabel = (format: string) => format === "longform" ? "Long video" : format.replaceAll("-", " ").replace(/^./, (letter) => letter.toUpperCase());

export function matchesWorkspaceUnit(unit: Pick<UnitDto, "slug" | "format">, projectName: string, query: string, format: string): boolean {
  return (!format || unit.format === format)
    && `${unit.slug} ${projectName} ${unit.format}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

export function WorkspaceUnitsScreen({ workspaceId, workspaceName, projects, rootEpoch, activitySequence = 0, onOpenUnit }: {
  workspaceId: string;
  workspaceName: string;
  projects: ProjectSummary[];
  rootEpoch: number;
  activitySequence?: number;
  onOpenUnit(reference: ProjectReference, unitId: string, label: string): void;
}) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("");
  const [publication, setPublication] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [view, setView] = useState<"gallery" | "list">("gallery");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setQuery(""); setFormat(""); setPublication(""); setProjectFilter("all");
  }, [workspaceId]);

  useEffect(() => {
    let live = true;
    setLoad({ state: "loading" });
    void loadWorkspaceUnits(workspaceId, bridge.loadWorkspaceUnitPage, () => live).then((result) => {
      if (!live) return;
      if (result.warning && result.units.length === 0) {
        setLoad({ state: "error", message: result.warning });
        return;
      }
      setLoad({ state: "ready", ...result });
    });
    return () => { live = false; };
  }, [workspaceId, rootEpoch, activitySequence, retry]);

  const state = load.state === "ready"
    ? load.warning ? "partial" : load.units.length === 0 ? "empty" : "ready"
    : load.state;
  const owners = new Map(projects.map((project) => [project.projectId, project]));
  const units: WorkspaceUnit[] = load.state === "ready" ? load.units.map((unit) => ({
    unit, project: unit.projectId ? owners.get(unit.projectId) ?? null : null,
    published: publicationOf(unit, load.publications),
  })).sort((a, b) => b.unit.updatedAt - a.unit.updatedAt) : [];
  const formats = [...new Set([...units.map(({ unit }) => unit.format), ...(format ? [format] : [])])].sort();
  const ownerName = ({ unit, project }: WorkspaceUnit) => project?.name ?? (unit.projectId ? "Project unavailable" : "Workspace-owned");
  const ownerKey = ({ unit }: WorkspaceUnit) => unit.projectId ? `project:${unit.projectId}` : "workspace";
  const projectNames = new Map(units.map((row) => [ownerKey(row), ownerName(row)]));
  if (projectFilter !== "all" && !projectNames.has(projectFilter)) projectNames.set(projectFilter, projectFilter === "workspace" ? "Workspace-owned" : owners.get(projectFilter.slice("project:".length))?.name ?? "Project unavailable");
  const projectOptions = [...projectNames].map(([value, label]) => ({ value, label: `${label} (${units.filter((row) => ownerKey(row) === value).length})` }));
  const visible = units.filter((row) => matchesWorkspaceUnit(row.unit, ownerName(row), query, format) && (!publication || row.published === publication) && (projectFilter === "all" || ownerKey(row) === projectFilter));
  const publicationOptions = (["published", "scheduled"] as const).map((value) => ({ value, count: units.filter((row) => row.published === value).length })).filter(({ value, count }) => count > 0 || value === publication);
  const filtered = Boolean(query.trim() || format || publication || projectFilter !== "all");
  const retryButton = <button type="button" className={COMMAND_BUTTON} onClick={() => setRetry((value) => value + 1)}>Retry</button>;

  return (
    <InstrumentScreenRoot descriptor={workspaceUnitsInstrumentStates} state={state}>
      <main className="main-region @container/main-region flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-auto bg-transparent p-1 type-base text-ink">
        <PageHeader title={WORKSPACE_PAGE_LABELS.units} icon={Layers3} meta={workspaceName}>
          <div className="page-header-segments flex items-center gap-0.5 rounded-full bg-panel p-0.5" aria-label="Content view">
            <button type="button" className={PAGE_HEADER_BUTTON} aria-label="Gallery view" aria-pressed={view === "gallery"} onClick={() => setView("gallery")}><LayoutGrid className="size-4" aria-hidden="true" /></button>
            <button type="button" className={PAGE_HEADER_BUTTON} aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><List className="size-4" aria-hidden="true" /></button>
          </div>
        </PageHeader>
        <div className="workspace-unit-filters grid min-w-0 gap-1" role="group" aria-label="Content filters">
          <div className="workspace-unit-primary-filters grid min-w-0 grid-cols-(--workspace-unit-filter-columns) items-center gap-1">
            <label className="flex h-8 min-w-0 items-center gap-2 rounded-full bg-card px-2 text-muted focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-ink"><Search className="size-4 flex-none" aria-hidden="true" /><input className="min-w-0 flex-1 bg-transparent type-xs text-ink outline-none" type="search" aria-label="Search content" placeholder="Search content…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <SegmentedControl ariaLabel="Filter by format" value={format} options={[{ value: "", label: "All formats", icon: <LayoutGrid size={14} />, count: load.state === "ready" ? units.length : undefined }, ...formats.map((item) => {
              const Icon = item === "image" ? Image : item === "audio" ? Music2 : FORMAT_ICON[unitPreviewKind(item)];
              return { value: item, label: formatLabel(item), icon: <Icon size={14} />, count: units.filter(({ unit }) => unit.format === item).length };
            })]} onValueChange={setFormat} />
          </div>
          <div className="workspace-unit-secondary-filters flex min-w-0 items-center gap-1">
          {projectOptions.length > 0 && <SelectMenu tone="caller" className={FILTER} overlayOwner="workspace.units" ariaLabel="Filter by project" value={projectFilter} options={[{ value: "all", label: "All projects" }, ...projectOptions]} onValueChange={setProjectFilter} />}
          {publicationOptions.length > 0 && <SelectMenu tone="caller" className={FILTER} overlayOwner="workspace.units" ariaLabel="Filter by publication" value={publication || "all"} options={[{ value: "all", label: "All publication states" }, ...publicationOptions.map(({ value, count }) => ({ value, label: `${CHIP[value].label} (${count})` }))]} onValueChange={(value) => setPublication(value === "all" ? "" : value)} />}
          {filtered && <button type="button" className={PAGE_HEADER_BUTTON} onClick={() => { setQuery(""); setFormat(""); setPublication(""); setProjectFilter("all"); }}>Clear filters</button>}
          {load.state === "ready" && units.length > 0 && <span className={`${META} whitespace-nowrap`} role="status" title="Most recently updated first">{filtered ? `${visible.length} of ${units.length}` : units.length} {units.length === 1 ? "item" : "items"}</span>}
          </div>
        </div>

        <section className="content-section m-0 grid min-h-48 w-full min-w-0 max-w-none content-start gap-1 rounded-panel bg-transparent p-0" aria-label="All content">
          {load.state === "loading" && <div className={`${STATE_BOX} ${STATE_PAD} ${STATE_INK}`} role="status">Loading content…</div>}
          {load.state === "error" && <div className={`${STATE_BOX} ${STATE_COLUMN} ${STATE_PAD} ${STATE_INK}`} role="alert">{load.message}{retryButton}</div>}
          {load.state === "ready" && load.units.length === 0 && <div className={`${STATE_BOX} ${STATE_PAD} ${STATE_INK}`}>
            <div className="grid justify-items-center gap-3 py-6 text-center"><Layers3 className="size-8 text-muted" aria-hidden="true" /><strong className="type-lg font-medium">No content yet</strong><span>{projects.length === 0 ? "Start a new chat to create your first piece of content." : "Create content in a project to see it here."}</span></div>
          </div>}
          {load.state === "ready" && load.warning && <div className={`${STATE_BOX} ${STATE_PAD} ${STATE_INK}`} role="alert">
            Some content or publication states could not be loaded. {load.warning} {retryButton}
          </div>}
          {load.state === "ready" && units.length > 0 && visible.length === 0 && <div className={`${STATE_BOX} ${STATE_PAD} ${STATE_INK}`} role="status">No content matches these filters. Try another search or clear the filters.</div>}
          <div className={view === "gallery" ? "workspace-unit-gallery grid grid-cols-(--workspace-unit-gallery-columns) gap-1" : "grid gap-1"}>
          {load.state === "ready" && visible.map(({ unit, project, published }) => {
            /* Hoisted, not inlined: a member access inside a className template reads to the style
               ratchet as a hardcoded arbitrary value. */
            const chip = published && CHIP[published];
            const Icon = FORMAT_ICON[unitPreviewKind(unit.format)];
            const name = ownerName({ unit, project, published });
            const ownerTone = project ? "font-medium text-ink" : "font-normal text-muted";
            const reference = { workspaceId: unit.workspaceId, projectId: unit.projectId };
            const revisionId = unit.selectedRevisionId ?? unit.latestRevisionId ?? unit.sourceRevisionId;
            if (view === "gallery") return <button key={unit.id} {...entityDragProps({ kind: "unit", ref: unit.slug, label: unit.slug })} type="button" className="workspace-unit-card media-caption-surface group relative flex min-w-0 flex-col rounded-cell bg-transparent p-0 text-left text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink" aria-label={`Open ${unit.slug}`} aria-describedby={`workspace-unit-${unit.id}-context`} onClick={() => onOpenUnit(reference, unit.id, unit.slug)}>
              <span className="workspace-unit-art relative block aspect-content w-full overflow-hidden rounded-cell bg-surface-sunken text-muted [&_img]:object-cover [&_video]:object-cover">
                {revisionId ? <UnitRevisionPreview key={`${rootEpoch}:${unit.updatedAt}`} project={reference} revisionId={revisionId} className="size-full" /> : <span className="grid size-full content-center justify-items-center gap-2" aria-hidden="true"><Icon className="size-6" strokeWidth={1.4} /><span className="type-xs">No preview yet</span></span>}
              </span>
              <span className="media-hover-caption absolute inset-x-1 bottom-1 grid min-w-0 gap-1 rounded-cell bg-card p-2">
                <strong className="block truncate type-sm font-medium">{unit.slug}</strong>
                <span id={`workspace-unit-${unit.id}-context`} className="flex min-w-0 items-center justify-between gap-2">
                  <span className={`workspace-unit-project truncate type-xs ${ownerTone}`}>{name}</span>
                  {chip ? <span className={`shrink-0 rounded-control px-1.5 py-0.5 type-xs ${chip.skin}`}>{chip.label}</span> : <span className={`${META} shrink-0`}>{formatLabel(unit.format)}</span>}
                </span>
              </span>
            </button>;
            return <button
              {...entityDragProps({ kind: "unit", ref: unit.slug, label: unit.slug })}
              className={ROW}
              type="button"
              key={unit.id}
              onClick={() => onOpenUnit(reference, unit.id, unit.slug)}
            >
              <span className="flex-none text-muted" style={projectGlyphVars(name)} aria-hidden="true"><Icon className="size-4" strokeWidth={1.4} /></span>
              <span className="min-w-0 max-w-full truncate type-sm font-medium text-ink">{unit.slug}</span>
              <span className={`${META} uppercase`}>{unit.format}</span>
              {chip
                ? <span className={`inline-flex h-6 flex-none items-center rounded-full px-2.5 type-label ${chip.skin}`}>{chip.label}</span>
                : <span aria-hidden="true" />}
              <span className={`workspace-unit-project min-w-0 truncate type-sm ${ownerTone}`}>{name}</span>
              <time className={META} dateTime={new Date(unit.updatedAt).toISOString()}>
                {new Date(unit.updatedAt).toLocaleDateString([], { day: "2-digit", month: "short" })}
              </time>
            </button>;
          })}
          </div>
        </section>
      </main>
    </InstrumentScreenRoot>
  );
}
