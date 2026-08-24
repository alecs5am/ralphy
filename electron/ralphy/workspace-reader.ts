import { assertTrustedSender, toIpcResult } from "../ipc-security";
import { isLegacyCatalogGhost } from "../media/catalog";
import { MEDIA_CHANNELS } from "../media/types";
import type { RalphyBridgeClient } from "./client";
import type { RalphySession } from "./session";
import type { BridgeMethod, MetricTotals, ParamsFor, ResultFor, WorkspaceOverviewDto } from "./types";

type Request = Pick<RalphyBridgeClient, "request">["request"];

interface WorkspaceIpcEvent {
  sender: unknown;
  senderFrame: unknown;
}

interface WorkspaceIpcWindow {
  isDestroyed(): boolean;
  webContents: { mainFrame: unknown };
}

export function createRootGuardedWorkspaceRequest(
  request: Request,
  assertCurrent: () => void,
): Request {
  return async <Method extends BridgeMethod>(
    method: Method,
    params: ParamsFor<Method>,
  ): Promise<ResultFor<Method>> => {
    assertCurrent();
    const result = await request(method, params);
    assertCurrent();
    return result;
  };
}

const OVERVIEW_UNITS = 20;
const OVERVIEW_PUBLICATIONS = 30;

const EMPTY_TOTALS: MetricTotals = {
  publicationCount: 0,
  views: null,
  likes: null,
  comments: null,
  shares: null,
  watchTimeMs: null,
};

/* Adding two totals where a null means "Core reported nothing": two nothings stay nothing, and a
   number plus nothing is that number rather than a zero the library never said. */
function addTotal(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  return right === null ? left : left + right;
}

export function mergeMetricTotals(rows: readonly MetricTotals[]): MetricTotals {
  return rows.reduce((sum, row) => ({
    publicationCount: sum.publicationCount + row.publicationCount,
    views: addTotal(sum.views, row.views),
    likes: addTotal(sum.likes, row.likes),
    comments: addTotal(sum.comments, row.comments),
    shares: addTotal(sum.shares, row.shares),
    watchTimeMs: addTotal(sum.watchTimeMs, row.watchTimeMs),
  }), EMPTY_TOTALS);
}

export function createWorkspaceReader({ request }: { request: Request }) {
  return {
    async loadOverview(workspaceId: string): Promise<WorkspaceOverviewDto> {
      const overview = await request("workspace.overview", {
        context: { workspaceId },
        workspaceId,
        sections: {
          units: { limit: OVERVIEW_UNITS },
          accounts: { limit: 20 },
          projects: { limit: 8 },
          activity: { afterSequence: 0, limit: 10 },
          publications: { limit: OVERVIEW_PUBLICATIONS },
          metrics: true,
        },
      });
      if (!overview.projects) return overview;
      const projects = overview.projects.items.filter((project) => !isLegacyCatalogGhost("project", project));

      /* Core's workspace sections mean "owned by the workspace itself" -- `project_id IS NULL` --
         and its tests state that on purpose: a workspace-scoped section never leaks a Project's
         rows. For a workspace whose work lives in projects that is always none, so an overview
         asking "how is this workspace doing" answered zero Units, zero publications and no metrics
         for a workspace holding eighteen Units and publications with real reach.
         So the reading is composed here, from the same per-project overviews the project screen
         reads, rather than by widening Core's own scope: the workspace's own rows first, then its
         projects'. Accounts, projects and activity are already workspace-wide and are untouched. */
      const fromProjects = await Promise.all(projects.map((project) => request("project.overview", {
        context: { workspaceId, projectId: project.id },
        projectId: project.id,
        sections: {
          units: { limit: OVERVIEW_UNITS },
          publications: { limit: OVERVIEW_PUBLICATIONS },
          metrics: true,
        },
      }).catch(() => null)));

      const answered = fromProjects.filter((row): row is NonNullable<typeof row> => row !== null);
      const units = [...overview.units?.items ?? [], ...answered.flatMap((row) => row.units?.items ?? [])];
      const publications = [
        ...overview.publications?.items ?? [],
        ...answered.flatMap((row) => row.publications?.items ?? []),
      ];
      return {
        ...overview,
        projects: { ...overview.projects, items: projects },
        units: { items: units.slice(0, OVERVIEW_UNITS), nextCursor: null },
        publications: { items: publications.slice(0, OVERVIEW_PUBLICATIONS), nextCursor: null },
        metrics: mergeMetricTotals([
          overview.metrics ?? EMPTY_TOTALS,
          ...answered.map((row) => row.metrics ?? EMPTY_TOTALS),
        ]),
      };
    },
  };
}

export function registerWorkspaceOverviewIpc<Root>({
  handle,
  getWindow,
  captureRoot,
  assertRoot,
  session,
}: {
  handle(
    channel: string,
    listener: (event: WorkspaceIpcEvent, workspaceId: unknown) => Promise<unknown>,
  ): void;
  getWindow(): WorkspaceIpcWindow | null;
  captureRoot(): Root;
  assertRoot(root: Root): void;
  session: Pick<RalphySession, "client">;
}): void {
  const request: Request = async <Method extends BridgeMethod>(
    method: Method,
    params: ParamsFor<Method>,
  ): Promise<ResultFor<Method>> => session.client.request(method, params);
  handle(MEDIA_CHANNELS.loadWorkspaceOverview, (event, rawWorkspaceId) => toIpcResult(() => {
    assertTrustedSender(event, getWindow());
    if (
      typeof rawWorkspaceId !== "string"
      || !rawWorkspaceId
      || rawWorkspaceId.length > 256
    ) throw new Error("Invalid workspace id");
    const root = captureRoot();
    return createWorkspaceReader({
      request: createRootGuardedWorkspaceRequest(request, () => assertRoot(root)),
    }).loadOverview(rawWorkspaceId);
  }));
}
