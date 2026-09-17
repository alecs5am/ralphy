import { PageHeader, PAGE_HEADER_BUTTON } from "@/shared/ui/PageHeader";
import { FileText, Film, Images, Layers3, LayoutGrid, List, Search } from "@/shared/ui/icons";
import { useEffect, useState } from "react";

import type { OverviewPublicationDto, UnitDto } from "../../../../electron/ralphy/types";
import { entityDragProps } from "@/features/agent-chat";
import { unitPreviewKind } from "@/entities/unit";
import { projectGlyphVars } from "@/shared/lib/project-glyph";
import { bridge, type ProjectReference, type ProjectSummary } from "@/shared/api/ipc";
import { defineInstrumentScreenStates, InstrumentScreenRoot } from "@/shared/instrument/screen-state-registry";
import { WORKSPACE_PAGE_LABELS } from "@/shared/model/workbench";
import { COMMAND_BUTTON, STATE_BOX, STATE_COLUMN, STATE_INK, STATE_PAD } from "@/shared/ui/route-chrome";
import { SelectMenu } from "@/shared/ui/SelectMenu";
import { Window, WindowBody, WindowTitlebar } from "@/shared/ui/Window";
import { loadWorkspaceUnits } from "../api/load-workspace-units";

export const workspaceUnitsInstrumentStates = defineInstrumentScreenStates({
  routeKey: "workspace.units",
  states: ["loading", "ready", "empty", "partial", "error"],
  rootMarker: "workspace-units",
  landmarks: ["Units", "All units"],
} as const);

interface WorkspaceUnit {
  unit: UnitDto;
  project: ProjectSummary | null;
  published: Publication;
}

/* What this page can actually establish about a Unit. A publication is a fact in the project's
   overview, and it is the only lifecycle fact one list-wide read carries: the fuller ladder --
   rendering, render failed, preview ready, selected -- needs the Unit's revision and its builds,
   which is a call per Unit and is what the project's own Units panel is for. A row here therefore
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

const ROW = "workspace-unit-row grid min-h-14 w-full grid-cols-(--workspace-unit-columns) items-center gap-4 rounded-cell bg-surface px-4 py-3 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink @max-workspace-row/main-region:grid-cols-(--workspace-unit-narrow-columns)";
const META = "font-code type-mono-xs tracking-mono text-muted";
const FORMAT_ICON = { video: Film, longform: Film, carousel: Images, post: FileText, generic: Layers3 };

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
  const [view, setView] = useState<"gallery" | "list">("gallery");
  const [retry, setRetry] = useState(0);

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
  const formats = [...new Set(units.map(({ unit }) => unit.format))].sort();
  const ownerName = ({ unit, project }: WorkspaceUnit) => project?.name ?? (unit.projectId ? "Project unavailable" : "Workspace-owned");
  const visible = units.filter((row) => matchesWorkspaceUnit(row.unit, ownerName(row), query, format));
  const retryButton = <button type="button" className={COMMAND_BUTTON} onClick={() => setRetry((value) => value + 1)}>Retry</button>;

  return (
    <InstrumentScreenRoot descriptor={workspaceUnitsInstrumentStates} state={state}>
      <main className="main-region @container/main-region flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-auto bg-transparent p-2 type-base text-ink">
        <PageHeader title={WORKSPACE_PAGE_LABELS.units} icon={Layers3} meta={workspaceName}>
          <label className="page-header-search flex h-8 min-w-0 items-center gap-2 rounded-full bg-card px-3 text-muted focus-within:outline-2 focus-within:outline-ink"><Search className="size-4 flex-none" aria-hidden="true" /><input className="min-w-0 flex-1 bg-transparent type-xs text-ink outline-none" type="search" aria-label="Search units" placeholder="Search units or projects…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="page-header-segments flex items-center gap-0.5 rounded-full bg-panel p-0.5" aria-label="Unit view">
            <button type="button" className={PAGE_HEADER_BUTTON} aria-label="Gallery view" aria-pressed={view === "gallery"} onClick={() => setView("gallery")}><LayoutGrid className="size-4" aria-hidden="true" /></button>
            <button type="button" className={PAGE_HEADER_BUTTON} aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><List className="size-4" aria-hidden="true" /></button>
          </div>
        </PageHeader>
        <div className="flex items-center justify-between gap-2 px-1 py-1"><SelectMenu overlayOwner="workspace.units" ariaLabel="Filter by format" value={format ? `format:${format}` : "all"} options={[{ value: "all", label: "All formats" }, ...formats.map((item) => ({ value: `format:${item}`, label: item }))]} onValueChange={(value) => setFormat(value === "all" ? "" : value.slice("format:".length))} />{load.state === "ready" && <span className={META} role="status">{visible.length}{query || format ? ` / ${units.length}` : ""} UNITS · {projects.length} PROJECTS · RECENTLY UPDATED</span>}</div>

        <section className="content-section m-0 grid min-h-48 w-full min-w-0 max-w-none content-start gap-3 rounded-panel bg-transparent p-0" aria-label="All units">
          {load.state === "loading" && <div className={`${STATE_BOX} ${STATE_PAD} ${STATE_INK}`} role="status">Reading workspace Units…</div>}
          {load.state === "error" && <div className={`${STATE_BOX} ${STATE_COLUMN} ${STATE_PAD} ${STATE_INK}`} role="alert">{load.message}{retryButton}</div>}
          {load.state === "ready" && load.units.length === 0 && <div className={`${STATE_BOX} ${STATE_PAD} ${STATE_INK}`}>
            <div className="grid justify-items-center gap-3 py-6 text-center"><Layers3 className="size-8 text-muted" aria-hidden="true" /><strong className="type-lg font-medium">Your next idea starts here</strong><span>{projects.length === 0 ? "Create a project to start your content library." : "Open a project and create its first Unit."}</span></div>
          </div>}
          {load.state === "ready" && load.warning && <div className={`${STATE_BOX} ${STATE_PAD} ${STATE_INK}`} role="alert">
            Some Units or publication statuses could not be read. {load.warning} {retryButton}
          </div>}
          {load.state === "ready" && units.length > 0 && visible.length === 0 && <div className={`${STATE_BOX} ${STATE_PAD} ${STATE_INK}`}>No units match. Try another search or format.</div>}
          <div className={view === "gallery" ? "workspace-unit-gallery grid grid-cols-(--workspace-unit-gallery-columns) gap-2" : "grid gap-2"}>
          {load.state === "ready" && visible.map(({ unit, project, published }) => {
            /* Hoisted, not inlined: a member access inside a className template reads to the style
               ratchet as a hardcoded arbitrary value. */
            const chip = published && CHIP[published];
            const Icon = FORMAT_ICON[unitPreviewKind(unit.format)];
            const name = ownerName({ unit, project, published });
            const reference = { workspaceId: unit.workspaceId, projectId: unit.projectId };
            if (view === "gallery") return <button key={unit.id} {...entityDragProps({ kind: "unit", ref: unit.slug, label: unit.slug })} type="button" className="workspace-unit-card group min-w-0 rounded-window bg-transparent p-0 text-left text-ink focus-visible:outline-2 focus-visible:outline-ink" onClick={() => onOpenUnit(reference, unit.id, unit.slug)}>
              <Window className="h-full">
                <WindowBody className="gap-2 p-3 group-hover:bg-row-hover">
                  <div className="flex items-center gap-3"><span className="workspace-unit-art flex size-10 shrink-0 items-center justify-center rounded-field text-(--glyph-color) [background:color-mix(in_srgb,var(--glyph-color)_12%,var(--instrument-widget-light-sunken))]" style={projectGlyphVars(name)} aria-hidden="true"><Icon className="size-5" strokeWidth={1.4} /></span><span className="min-w-0 flex-1"><strong className="block truncate type-sm font-medium">{unit.slug}</strong><span className={`${META} uppercase`}>{unit.format}</span></span></div>
                  {chip && <span className={`inline-flex self-start rounded-control px-2 py-0.5 type-xs ${chip.skin}`}>{chip.label}</span>}
                </WindowBody>
                <WindowTitlebar><span className="min-w-0 flex-1 truncate type-xs text-muted">{name}</span><time className={META} dateTime={new Date(unit.updatedAt).toISOString()}>{new Date(unit.updatedAt).toLocaleDateString([], { day: "2-digit", month: "short" })}</time></WindowTitlebar>
              </Window>
            </button>;
            return <button
              {...entityDragProps({ kind: "unit", ref: unit.slug, label: unit.slug })}
              className={ROW}
              type="button"
              key={unit.id}
              onClick={() => onOpenUnit(reference, unit.id, unit.slug)}
            >
              <span className="flex-none text-muted" style={projectGlyphVars(name)} aria-hidden="true"><Icon className="size-4" strokeWidth={1.4} /></span>
              <span className="min-w-0 max-w-full truncate type-md font-medium text-ink">{unit.slug}</span>
              <span className={`${META} uppercase`}>{unit.format}</span>
              {chip
                ? <span className={`inline-flex h-6 flex-none items-center rounded-full px-2.5 type-label ${chip.skin}`}>{chip.label}</span>
                : <span aria-hidden="true" />}
              <span className="min-w-0 truncate type-sm text-muted">{name}</span>
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
