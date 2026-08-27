/**
 * The island, and the one place a destination becomes navigation.
 *
 * A notification names where it happened -- a library, a workspace, a project, or a Marketplace
 * location -- and following it has to put the app in the right mode first. Every other control in
 * the app is already in a mode; the island is not, which is why the mode switch is stated here.
 */
import { DynamicIsland, type DynamicIslandFeed, type IslandContext } from "@/widgets/dynamic-island";
import type { AppMode, MarketplaceLocation } from "@/shared/model/routes";
import type { WorkbenchAction } from "@/shared/model/workbench";

import { InstrumentRightRailShortcut } from "./app-frames";

export function AppIsland({
  feed,
  context,
  projectName,
  mock,
  onToggleViewPanel,
  onSwitchMode,
  onOpenWorkspace,
  onNavigateMarketplace,
  dispatch,
}: {
  feed: DynamicIslandFeed;
  context: IslandContext;
  projectName: string | null;
  mock: boolean;
  onToggleViewPanel(): void;
  onSwitchMode(mode: AppMode): void;
  onOpenWorkspace(workspaceId: string): void;
  onNavigateMarketplace(location: MarketplaceLocation): void;
  dispatch(action: WorkbenchAction): void;
}) {
  return <InstrumentRightRailShortcut onToggle={onToggleViewPanel}><DynamicIsland
    feed={feed}
    context={context}
    projectName={projectName}
    mock={mock}
    onNavigate={(destination) => {
      if ("kind" in destination) {
        onSwitchMode("work");
        if (destination.kind === "library") dispatch({ type: "open-library" });
        else if (destination.kind === "workspace") onOpenWorkspace(destination.workspaceId);
        else dispatch({ type: "open-project", project: destination });
      } else {
        onSwitchMode("marketplace");
        onNavigateMarketplace(destination);
      }
    }}
  /></InstrumentRightRailShortcut>;
}
