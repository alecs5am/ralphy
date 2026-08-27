/**
 * Two facts the shell derives from wherever the app is: whether history can move, and what
 * counts as "the same place" for scroll restoration.
 *
 * Both have to answer for two histories. In the Marketplace, back always means something -- from
 * its first page it leaves the Marketplace -- while My Work reports the edges of its own stack.
 * The scroll key is a place, not a route object: a workspace page is a place, and a Marketplace
 * location is one down to its filters, which is why that half is the route serialised.
 */
import type { MarketplaceNavigationState } from "@/pages/marketplace";
import type { WorkbenchState, WorkspacePage } from "@/shared/model/workbench";

export function historyEdges(marketplace: MarketplaceNavigationState, state: WorkbenchState) {
  return marketplace.mode === "marketplace"
    ? {
        canGoBack: true,
        canGoForward: marketplace.historyIndex < marketplace.history.length - 1,
      }
    : {
        canGoBack: state.historyIndex > 0,
        canGoForward: state.historyIndex < state.history.length - 1,
      };
}

export function routeScrollKey(
  marketplace: MarketplaceNavigationState,
  state: WorkbenchState,
  workspacePage: WorkspacePage,
): string {
  if (marketplace.mode === "marketplace") return `marketplace:${JSON.stringify(marketplace.location.route)}`;
  if (state.route.kind === "library") return "work:library";
  if (state.route.kind === "workspace") return `work:workspace:${state.route.workspaceId}:${workspacePage}`;
  return `work:project:${state.route.workspaceId}:${state.route.projectId}`;
}
