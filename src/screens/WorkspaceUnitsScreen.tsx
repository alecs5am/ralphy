import { Layers3 } from "lucide-react";
import { useEffect, useState } from "react";

import type { OverviewPublicationDto, ProjectOverviewDto, UnitDto } from "../../electron/ralphy/types";
import { entityDragProps } from "../chat/attachments";
import { bridge, type ProjectSummary } from "../lib/ipc";
import { defineInstrumentScreenStates, InstrumentScreenRoot } from "../instrument/screen-state-registry";
import { WORKSPACE_PAGE_LABELS } from "../state/workbench";
import { STATE_BOX, STATE_COLUMN, STATE_INK, STATE_PAD } from "./route-chrome";

export const workspaceUnitsInstrumentStates = defineInstrumentScreenStates({
  routeKey: "workspace.units",
  states: ["loading", "ready", "empty", "partial", "error"],
  rootMarker: "workspace-units",
  landmarks: ["Units", "All units"],
} as const);

/* A Unit and the project it belongs to. The workspace has no Unit query of its own -- in Core a
   workspace-scoped `unit.list` means "Units owned by the workspace itself", which is
   `project_id IS NULL` and not what the sidebar counts -- so the page is the fan-out over the
   workspace's projects, which is what the count has always been. */
interface WorkspaceUnit {
  unit: UnitDto;
  project: ProjectSummary;
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
  | { state: "ready"; units: WorkspaceUnit[]; missing: number };

/* The app has no green: a publication state is told the way the calendar tells it, in ink for what
   has happened and a quiet plate for what is only planned. `bg-ok`/`bg-warn` named colours that do
   not exist in any theme, so those chips rendered with no plate at all. */
const CHIP: Record<"published" | "scheduled", { label: string; skin: string }> = {
  published: { label: "Published", skin: "bg-instrument text-on-instrument" },
  scheduled: { label: "Scheduled", skin: "bg-surface-sunken text-muted" },
};

const ROW = "workspace-unit-row grid min-h-14 w-full grid-cols-(--workspace-unit-columns) items-center gap-4 rounded-cell bg-surface px-4 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink";
const META = "font-code type-mono-xs tracking-mono text-muted";

async function readProject(project: ProjectSummary): Promise<{ units: UnitDto[]; publications: OverviewPublicationDto[] } | null> {
  /* Two calls per project, and the overview is the one that knows a Unit's publication state --
     the same pair the project's own Units panel makes. A project that answers neither is reported
     as missing rather than as having no Units. */
  const [page, overview] = await Promise.all([
    bridge.loadProjectPage({ tab: "units", project: { workspaceId: project.workspaceId, projectId: project.projectId } }),
    bridge.loadProjectOverview({ workspaceId: project.workspaceId, projectId: project.projectId })
      .catch((): ProjectOverviewDto | null => null),
  ]);
  return { units: page.items as UnitDto[], publications: overview?.publications?.items ?? [] };
}

export function WorkspaceUnitsScreen({ workspaceName, projects, rootEpoch, onOpenUnit }: {
  workspaceName: string;
  projects: ProjectSummary[];
  rootEpoch: number;
  onOpenUnit(project: ProjectSummary, unitId: string): void;
}) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const key = `${rootEpoch}:${projects.map(({ projectId }) => projectId).join(",")}`;

  useEffect(() => {
    let live = true;
    setLoad({ state: "loading" });
    void (async () => {
      const results = await Promise.all(projects.map(async (project) => {
        const read = await readProject(project).catch(() => null);
        return read && { project, ...read };
      }));
      if (!live) return;
      const answered = results.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
      if (projects.length > 0 && answered.length === 0) {
        setLoad({ state: "error", message: "The library did not answer for any project in this workspace." });
        return;
      }
      const units = answered
        .flatMap(({ project, units: rows, publications }) => rows.map((unit) => ({
          unit,
          project,
          published: publicationOf(unit, publications),
        })))
        .sort((left, right) => right.unit.updatedAt - left.unit.updatedAt);
      setLoad({ state: "ready", units, missing: projects.length - answered.length });
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the identity of this fetch
  }, [key]);

  const state = load.state === "ready"
    ? load.units.length === 0 ? "empty" : load.missing > 0 ? "partial" : "ready"
    : load.state;

  return (
    <InstrumentScreenRoot descriptor={workspaceUnitsInstrumentStates} state={state}>
      <main className="main-region @container/main-region flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-auto bg-transparent p-2 pb-6 type-base text-ink">
        <div className="screen-header m-0 flex min-h-18 w-full max-w-none items-start justify-between gap-6 rounded-panel bg-instrument px-5 py-4 text-on-instrument">
          <div>
            <div className="screen-kicker mb-1 type-xs uppercase tracking-wide text-on-instrument-muted">{workspaceName}</div>
            <h2 className="mt-1 mb-1.25 type-hero font-semibold leading-none tracking-tight text-on-instrument">{WORKSPACE_PAGE_LABELS.units}</h2>
            <p className="mt-1 max-w-screen-copy type-base text-on-instrument-muted">
              Every Unit in this workspace, newest first. A Unit opens in the project that owns it.
            </p>
          </div>
          {load.state === "ready" && <span className={`${META} pt-2 text-on-instrument-muted`}>
            {load.units.length} {load.units.length === 1 ? "UNIT" : "UNITS"} · {projects.length} {projects.length === 1 ? "PROJECT" : "PROJECTS"}
          </span>}
        </div>

        <section className="content-section m-0 grid min-h-48 w-full min-w-0 max-w-none content-start gap-1 rounded-panel bg-surface p-2" aria-label="All units">
          {load.state === "loading" && <div className={`${STATE_BOX} ${STATE_PAD} ${STATE_INK}`}>Reading the workspace's projects</div>}
          {load.state === "error" && <div className={`${STATE_BOX} ${STATE_COLUMN} ${STATE_PAD} ${STATE_INK}`}>{load.message}</div>}
          {load.state === "ready" && load.units.length === 0 && <div className={`${STATE_BOX} ${STATE_PAD} ${STATE_INK}`}>
            {projects.length === 0 ? "This workspace has no projects yet." : "No Units in this workspace yet."}
          </div>}
          {load.state === "ready" && load.missing > 0 && <div className={`${STATE_BOX} ${STATE_PAD} ${STATE_INK}`}>
            {load.missing} {load.missing === 1 ? "project" : "projects"} did not answer, so their Units are not listed.
          </div>}
          {load.state === "ready" && load.units.map(({ unit, project, published }) => {
            /* Hoisted, not inlined: a member access inside a className template reads to the style
               ratchet as a hardcoded arbitrary value. */
            const chip = published && CHIP[published];
            return <button
              {...entityDragProps({ kind: "unit", ref: unit.slug, label: unit.slug })}
              className={ROW}
              type="button"
              key={unit.id}
              onClick={() => onOpenUnit(project, unit.id)}
            >
              <Layers3 className="flex-none text-muted" size={15} strokeWidth={1.8} aria-hidden="true" />
              <span className="min-w-0 truncate type-md text-ink">{unit.slug}</span>
              <span className={`${META} uppercase`}>{unit.format}</span>
              {chip
                ? <span className={`inline-flex h-6 flex-none items-center rounded-full px-2.5 type-label ${chip.skin}`}>{chip.label}</span>
                : <span aria-hidden="true" />}
              <span className="min-w-0 truncate type-sm text-muted">{project.name}</span>
              <time className={META} dateTime={new Date(unit.updatedAt).toISOString()}>
                {new Date(unit.updatedAt).toLocaleDateString([], { day: "2-digit", month: "short" })}
              </time>
            </button>;
          })}
        </section>
      </main>
    </InstrumentScreenRoot>
  );
}
