import { assertTrustedSender, toIpcResult } from "../ipc-security";
import { isLegacyCatalogGhost } from "../media/catalog";
import { MEDIA_CHANNELS } from "../media/types";
import type { RalphyBridgeClient } from "./client";
import type { RalphySession } from "./session";
import type { BridgeMethod, ParamsFor, ResultFor, WorkspaceOverviewDto } from "./types";

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

export function createWorkspaceReader({ request }: { request: Request }) {
  return {
    async loadOverview(workspaceId: string): Promise<WorkspaceOverviewDto> {
      const overview = await request("workspace.overview", {
        context: { workspaceId },
        workspaceId,
        /* "Everything under this workspace, Projects included."

           Core's default scope is the narrower "rows the workspace itself owns" -- `project_id IS
           NULL` -- which for a workspace whose work lives in its Projects answers zero Units, zero
           publications and no metrics. The widening belongs to the query: composing it out here
           meant one request per Project, a page assembled from pages that could not be paginated,
           and a total no single query had ever produced. */
        include: "tree",
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
      return projects.length === overview.projects.items.length
        ? overview
        : { ...overview, projects: { ...overview.projects, items: projects } };
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
