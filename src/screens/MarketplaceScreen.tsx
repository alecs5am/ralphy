import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CatalogResult } from "../lib/ipc";
import { bridge } from "../lib/ipc";
import {
  createMarketplaceController,
  type MarketplaceController,
} from "../state/marketplace-controller";
import {
  type MarketplaceBrowseRoute,
  type MarketplaceCategory,
  type MarketplaceLocation,
  type MarketplaceMemoryPatch,
  type MarketplaceQueryState,
} from "../state/marketplace-navigation";
import {
  MarketplaceBrowse,
  marketplaceItemDomId,
} from "./marketplace/MarketplaceBrowse";
import { MarketplaceHeader } from "./marketplace/MarketplaceHeader";
import type { MarketplaceSnapshot } from "./marketplace/presentation";

export interface MarketplaceScreenProps {
  catalog: CatalogResult | null;
  location: MarketplaceLocation;
  sidebarVisible: boolean;
  onNavigate(location: MarketplaceLocation): void;
  onRememberLocation(patch: MarketplaceMemoryPatch): void;
}

const categoryLabels: Record<MarketplaceCategory, string> = {
  models: "Models",
  templates: "Templates",
  recipes: "Recipes",
  prompts: "Prompts",
  components: "Components & Effects",
  skills: "Skills",
};

function routeTitle(location: MarketplaceLocation): string {
  const route = location.route;
  if (route.kind === "discover") return "Marketplace";
  if (route.kind === "results") return "Search results";
  if (route.kind === "category" || route.kind === "unavailable-detail") return categoryLabels[route.category];
  if (route.kind === "library") return route.section === "attention" ? "Needs attention" : `${route.section[0].toLocaleUpperCase()}${route.section.slice(1)}`;
  if (route.kind === "collection") return "Collection";
  return "Item details";
}

function browseRoute(route: MarketplaceLocation["route"]): MarketplaceBrowseRoute | null {
  return route.kind === "detail" || route.kind === "unavailable-detail" ? null : route;
}

function clearedFilters(query: MarketplaceQueryState, category: MarketplaceCategory | "all"): MarketplaceQueryState {
  return {
    ...query,
    filters: {
      category,
      source: "all",
      license: "all",
      compatibility: "all",
      modality: "all",
      format: "all",
    },
  };
}

export interface MarketplaceScreenViewProps extends MarketplaceScreenProps {
  snapshot: MarketplaceSnapshot;
  onRetry(): void;
}

export function MarketplaceScreenView({
  catalog,
  location,
  sidebarVisible,
  snapshot,
  onNavigate,
  onRememberLocation,
  onRetry,
}: MarketplaceScreenViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const focusId = location.focusId ?? "marketplace-heading";
  const focusRouteKey = JSON.stringify(location.route);
  const route = browseRoute(location.route);
  const selectedCategory = location.route.kind === "category" ? location.route.category : null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: location.scrollTop });
  }, [focusRouteKey, location.scrollTop]);

  useEffect(() => {
    const target = document.getElementById(focusId) ?? document.getElementById("marketplace-heading");
    if (target?.closest("[hidden]")) return;
    target?.focus({ preventScroll: true });
  }, [focusId, focusRouteKey]);

  const openCategory = (category: MarketplaceCategory) => {
    const filters = {
      ...location.query.filters,
      category,
      ...(category === "models" ? {} : { modality: "all" as const, format: "all" as const }),
    };
    onNavigate({
      ...location,
      route: { kind: "category", category },
      query: { ...location.query, filters },
      selectedItemId: null,
      scrollTop: 0,
      focusId: "marketplace-heading",
    });
  };
  const openResults = () => {
    onNavigate({
      ...location,
      route: { kind: "results" },
      selectedItemId: null,
      scrollTop: 0,
      focusId: "marketplace-heading",
    });
  };
  const openLibrary = (section: "installed" | "saved" | "added" | "downloads" | "updates" | "attention") => {
    onNavigate({ ...location, route: { kind: "library", section }, selectedItemId: null, scrollTop: 0, focusId: "marketplace-heading" });
  };
  const openItem = (itemId: string) => {
    onRememberLocation({ focusId: marketplaceItemDomId(itemId) });
    onNavigate({
      ...location,
      route: { kind: "detail", itemId },
      selectedItemId: itemId,
      scrollTop: 0,
      focusId: "marketplace-heading",
    });
  };
  const targetMessage = catalog === null
    ? "Workspace targets are unavailable until the home library reconnects."
    : catalog.workspaces.length + catalog.projects.length === 0
      ? "No workspace or project targets are available in the current home library."
      : "Workspace targets are available for supported reviews.";
  const changeQuery = (query: MarketplaceQueryState) => {
    if (location.route.kind === "category" && location.query.filters.category !== "all" && query.filters.category === "all") {
      onNavigate({ ...location, route: { kind: "results" }, query, selectedItemId: null, scrollTop: 0, focusId: "marketplace-heading" });
      return;
    }
    onRememberLocation({ query });
  };

  return <main className="marketplace-screen main-region" data-sidebar-visible={sidebarVisible ? "true" : "false"}>
    <MarketplaceHeader
      title={routeTitle(location)}
      query={location.query}
      selectedCategory={selectedCategory}
      sidebarVisible={sidebarVisible}
      refreshing={snapshot.status === "ready" && snapshot.refreshing}
      onQueryChange={changeQuery}
      onSearch={openResults}
      onOpenCategory={openCategory}
    />
    <div
      className="marketplace-scroll"
      ref={scrollRef}
      onScroll={(event) => onRememberLocation({ scrollTop: event.currentTarget.scrollTop })}
    >
      <p className="marketplace-target-state">{targetMessage}</p>
      {route === null
        ? <section className="marketplace-route-placeholder" role="status"><h2>{routeTitle(location)}</h2><p>Full item details show only fields returned by the current source. This route does not expose a mutation yet.</p></section>
        : <MarketplaceBrowse
          route={route}
          snapshot={snapshot}
          onOpenItem={openItem}
          onOpenCategory={openCategory}
          onOpenLibrary={openLibrary}
          onRetry={onRetry}
          onClearQuery={() => onRememberLocation({ query: { ...location.query, text: "" } })}
          onClearFilters={() => onRememberLocation({ query: clearedFilters(location.query, location.route.kind === "category" ? location.route.category : "all") })}
        />}
    </div>
  </main>;
}

function ConnectedMarketplaceScreen(props: MarketplaceScreenProps & { controller: MarketplaceController }) {
  const snapshot = useSyncExternalStore(props.controller.subscribe, props.controller.getSnapshot, props.controller.getSnapshot);
  useEffect(() => props.controller.setQuery(props.location.query), [props.controller, props.location.query]);
  return <MarketplaceScreenView {...props} snapshot={snapshot} onRetry={() => void props.controller.refresh()} />;
}

export function MarketplaceScreen(props: MarketplaceScreenProps) {
  const [controller, setController] = useState<MarketplaceController | null>(null);
  useEffect(() => {
    const next = createMarketplaceController(bridge, props.location.query);
    setController(next);
    void next.start();
    return () => next.dispose();
  }, []);
  return controller
    ? <ConnectedMarketplaceScreen {...props} controller={controller} />
    : <MarketplaceScreenView {...props} snapshot={{ status: "loading", query: props.location.query }} onRetry={() => undefined} />;
}
