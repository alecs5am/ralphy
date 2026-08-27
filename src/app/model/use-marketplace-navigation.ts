/**
 * The Marketplace half of navigation: its own history, its own persisted location, and the focus
 * that follows a mode switch.
 *
 * My Work and the Marketplace are two histories, not one, and the back control has to mean the
 * right one -- from the Marketplace's first page, back leaves the Marketplace. That decision, the
 * focus hand-off between modes, and the write-through to storage travel together, so they live
 * here rather than as three loose effects in the app component.
 */
import { useCallback, useEffect, useReducer, useRef } from "react";

import {
  marketplaceReducer,
  readMarketplaceNavigation,
  writeMarketplaceNavigation,
  type MarketplaceMemoryPatch,
} from "@/pages/marketplace";
import type { AppMode, MarketplaceBrowseRoute, MarketplaceLocation } from "@/shared/model/routes";
import type { WorkbenchAction } from "@/shared/model/workbench";

export function useMarketplaceNavigation(workbenchDispatch: (action: WorkbenchAction) => void) {
  const [marketplace, dispatchMarketplace] = useReducer(
    marketplaceReducer,
    localStorage,
    readMarketplaceNavigation,
  );
  const previousAppMode = useRef(marketplace.mode);

  useEffect(() => {
    writeMarketplaceNavigation(localStorage, marketplace);
  }, [marketplace]);

  useEffect(() => {
    const previous = previousAppMode.current;
    previousAppMode.current = marketplace.mode;
    const focusId = previous === "marketplace" && marketplace.mode === "work"
      ? marketplace.workReturnFocusId
      : previous === "work" && marketplace.mode === "marketplace"
        ? marketplace.location.focusId ?? "marketplace-heading"
        : previous === "marketplace" && marketplace.mode === "marketplace"
          ? marketplace.location.focusId ?? "marketplace-heading"
          : null;
    if (!focusId) return;
    document.getElementById(focusId)?.focus({ preventScroll: true });
  }, [marketplace.location.focusId, marketplace.location.route, marketplace.mode, marketplace.workReturnFocusId]);

  const switchAppMode = useCallback((mode: AppMode) => {
    const returnFocusId = mode === "marketplace"
      ? (document.activeElement as HTMLElement | null)?.getAttribute("id") || null
      : null;
    dispatchMarketplace({ type: "switch-mode", mode, returnFocusId });
  }, []);

  const navigateMarketplace = useCallback((location: MarketplaceLocation) => {
    dispatchMarketplace({ type: "navigate", location });
  }, []);

  const rememberMarketplace = useCallback((patch: MarketplaceMemoryPatch) => {
    dispatchMarketplace({ type: "remember", patch });
  }, []);

  const openMarketplaceRoute = useCallback((route: MarketplaceBrowseRoute) => {
    dispatchMarketplace({
      type: "navigate",
      location: {
        ...marketplace.location,
        route,
        query: route.kind === "category"
          ? {
              ...marketplace.location.query,
              filters: { ...marketplace.location.query.filters, category: route.category },
            }
          : marketplace.location.query,
        selectedItemId: null,
        scrollTop: 0,
        focusId: null,
      },
    });
  }, [marketplace.location]);

  const navigateBack = useCallback(() => {
    if (marketplace.mode === "marketplace") {
      if (marketplace.historyIndex > 0) dispatchMarketplace({ type: "back" });
      else switchAppMode("work");
      return;
    }
    workbenchDispatch({ type: "back" });
  }, [marketplace.historyIndex, marketplace.mode, switchAppMode, workbenchDispatch]);

  const navigateForward = useCallback(() => {
    if (marketplace.mode === "marketplace") dispatchMarketplace({ type: "forward" });
    else workbenchDispatch({ type: "forward" });
  }, [marketplace.mode, workbenchDispatch]);

  return {
    marketplace,
    dispatchMarketplace,
    switchAppMode,
    navigateMarketplace,
    rememberMarketplace,
    openMarketplaceRoute,
    navigateBack,
    navigateForward,
  };
}
