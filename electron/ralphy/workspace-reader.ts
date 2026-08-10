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

export function createWorkspaceReader({ request }: { request: Request }) {
  return {
    async loadOverview(workspaceId: string): Promise<WorkspaceOverviewDto> {
      const overview = await request("workspace.overview", {
        context: { workspaceId },
        workspaceId,
        sections: {
          documents: { limit: 5 },
          units: { limit: 5 },
          accounts: { limit: 5 },
          projects: { limit: 5 },
          activity: { afterSequence: 0, limit: 10 },
          sharedMedia: { limit: 5 },
          publications: { limit: 5 },
          metrics: true,
        },
      });
      if (!overview.projects) return overview;
      return {
        ...overview,
        projects: {
          ...overview.projects,
          items: overview.projects.items.filter((project) => !isLegacyCatalogGhost("project", project)),
        },
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
