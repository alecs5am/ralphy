/**
 * The two app modes on one stage.
 *
 * My Work and the Marketplace are both mounted, and exactly one is live: the other keeps its
 * scroll, its selection and its focus for the way back, and is `hidden` and `inert` so nothing in
 * it is reachable, focusable or announced while it waits. That pairing is the whole point of this
 * component -- a mode surface that is only visually hidden is a keyboard trap.
 */
import { PageHeaderHost } from "@/shared/ui/PageHeader";
import type { CSSProperties, ReactNode } from "react";

import { MARKETPLACE_SIDEBAR_WIDTH, MarketplaceScreen, type MarketplaceMemoryPatch, type MarketplaceAgentRequest } from "@/pages/marketplace";
import type { CatalogResult } from "@/shared/api/ipc";
import type { AppMode, MarketplaceLocation } from "@/shared/model/routes";
import type { WorkbenchRoute } from "@/shared/model/workbench";

import { InstrumentFloatHost } from "../layout/InstrumentShell";

export function AppDesk({
  mode,
  fillHeight = false,
  pageHeaderHost,
  catalog,
  workRoute,
  location,
  marketplaceSidebarVisible,
  onBack,
  onNavigate,
  onRememberLocation,
  onRequestAgent,
  children,
}: {
  mode: AppMode;
  fillHeight?: boolean;
  pageHeaderHost?: HTMLElement | null;
  catalog: CatalogResult | null;
  workRoute: WorkbenchRoute;
  location: MarketplaceLocation;
  marketplaceSidebarVisible: boolean;
  onBack(): void;
  onNavigate(location: MarketplaceLocation): void;
  onRememberLocation(patch: MarketplaceMemoryPatch): void;
  onRequestAgent?(request: MarketplaceAgentRequest): void;
  children: ReactNode;
}) {
  return <div className={`main-content-stage flex min-w-0 flex-1 ${fillHeight ? "h-full min-h-0 overflow-hidden" : ""}`}>
    {/* Neither mode paints: the content column is the card both of them stand on. A wash here
        would repaint that card with the backdrop it is supposed to float over. */}
    <div className={`app-mode-surface app-mode-work min-h-0 min-w-0 flex-1 text-ink ${mode === "work" ? "flex" : "hidden"}`} hidden={mode !== "work"} inert={mode !== "work"}>
      <PageHeaderHost.Provider value={mode === "work" ? pageHeaderHost ?? null : null}><InstrumentFloatHost escape={mode === "work"}>{children}</InstrumentFloatHost></PageHeaderHost.Provider>
    </div>
    <div
      className={`app-mode-surface app-mode-marketplace min-h-0 min-w-0 flex-1 ${mode === "marketplace" ? "flex" : "hidden"}`}
      hidden={mode !== "marketplace"}
      inert={mode !== "marketplace"}
      style={{ "--sidebar-w": `${MARKETPLACE_SIDEBAR_WIDTH}px` } as CSSProperties}
    >
      <PageHeaderHost.Provider value={mode === "marketplace" ? pageHeaderHost ?? null : null}><MarketplaceScreen
        catalog={catalog}
        workRoute={workRoute}
        location={location}
        sidebarVisible={marketplaceSidebarVisible}
        onBack={onBack}
        onNavigate={onNavigate}
        onRememberLocation={onRememberLocation}
        onRequestAgent={onRequestAgent}
      /></PageHeaderHost.Provider>
    </div>
  </div>;
}
