/**
 * The two app modes on one stage.
 *
 * My Work and the Marketplace are both mounted, and exactly one is live: the other keeps its
 * scroll, its selection and its focus for the way back, and is `hidden` and `inert` so nothing in
 * it is reachable, focusable or announced while it waits. That pairing is the whole point of this
 * component -- a mode surface that is only visually hidden is a keyboard trap.
 */
import type { CSSProperties, ReactNode } from "react";

import { MARKETPLACE_SIDEBAR_WIDTH, MarketplaceScreen, type MarketplaceMemoryPatch } from "@/pages/marketplace";
import type { CatalogResult } from "@/shared/api/ipc";
import type { AppMode, MarketplaceLocation } from "@/shared/model/routes";
import type { WorkbenchRoute } from "@/shared/model/workbench";

import { InstrumentFloatHost } from "../layout/InstrumentShell";

export function AppDesk({
  mode,
  viewFrameActive,
  catalog,
  workRoute,
  location,
  marketplaceSidebarVisible,
  onBack,
  onNavigate,
  onRememberLocation,
  children,
}: {
  mode: AppMode;
  viewFrameActive: boolean;
  catalog: CatalogResult | null;
  workRoute: WorkbenchRoute;
  location: MarketplaceLocation;
  marketplaceSidebarVisible: boolean;
  onBack(): void;
  onNavigate(location: MarketplaceLocation): void;
  onRememberLocation(patch: MarketplaceMemoryPatch): void;
  children: ReactNode;
}) {
  return <div className="main-content-stage flex min-w-0 flex-1">
    {/* The work surface paints the desk, except inside the view panel: there the page card
        is the surface the route stands on, and a desk wash over it turned a white card
        grey -- visible in the light theme, and the same error in the dark one. */}
    <div className={`app-mode-surface app-mode-work min-h-0 min-w-0 flex-1 text-ink ${viewFrameActive ? "bg-transparent" : "bg-desk"} ${mode === "work" ? "flex" : "hidden"}`} hidden={mode !== "work"} inert={mode !== "work"}>
      <InstrumentFloatHost escape={mode === "work"}>{children}</InstrumentFloatHost>
    </div>
    <div
      className={`app-mode-surface app-mode-marketplace min-h-0 min-w-0 flex-1 ${mode === "marketplace" ? "flex" : "hidden"}`}
      hidden={mode !== "marketplace"}
      inert={mode !== "marketplace"}
      style={{ "--sidebar-w": `${MARKETPLACE_SIDEBAR_WIDTH}px` } as CSSProperties}
    >
      <MarketplaceScreen
        catalog={catalog}
        workRoute={workRoute}
        location={location}
        sidebarVisible={marketplaceSidebarVisible}
        onBack={onBack}
        onNavigate={onNavigate}
        onRememberLocation={onRememberLocation}
      />
    </div>
  </div>;
}
