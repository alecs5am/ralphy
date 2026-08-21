import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CatalogResult } from "../lib/ipc";
import { bridge } from "../lib/ipc";
import { defineInstrumentScreenStates, InstrumentScreenRoot, type InstrumentScenarioState } from "../instrument/screen-state-registry";
import type { WorkbenchRoute } from "../state/workbench";
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
  MARKETPLACE_LIBRARY_SECTIONS,
  MARKETPLACE_UNAVAILABLE_DETAIL_CATEGORIES,
} from "../state/marketplace-navigation";
import {
  MarketplaceBrowse,
  marketplaceItemDomId,
} from "./marketplace/MarketplaceBrowse";
import { MarketplaceHeader } from "./marketplace/MarketplaceHeader";
import { MarketplaceModelDetail, marketplaceDetailInstrumentStates, marketplaceInstalledInstrumentStates } from "./marketplace/MarketplaceModelViews";
import { MarketplaceMyLibrary } from "./marketplace/MarketplaceMyLibrary";
import { MarketplacePublicItemDetail } from "./marketplace/MarketplacePublicItemDetail";
import {
  MarketplaceActionReview,
  marketplaceTargets,
  type MarketplaceWorkflowKind,
} from "./marketplace/MarketplaceWorkflows";
import {
  marketplaceUnavailableDetailOriginId,
  MarketplaceUnavailableDetail,
} from "./marketplace/MarketplaceUnavailableViews";
import {
  projectMarketplacePublicItem,
  type MarketplaceSnapshot,
} from "./marketplace/presentation";

export interface MarketplaceScreenProps {
  catalog: CatalogResult | null;
  workRoute?: WorkbenchRoute;
  location: MarketplaceLocation;
  sidebarVisible: boolean;
  onBack(): void;
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

const marketplaceBaseInstrumentStates = [
  ["discover", "Marketplace", ["loading", "error", "partial", "ready"]],
  ["results", "Search results", ["loading", "error", "partial", "empty", "ready"]],
  ["collection", "Collection", ["loading", "error", "unavailable"]],
] as const;
export const MARKETPLACE_BASE_ROUTE_KINDS = [...marketplaceBaseInstrumentStates.map(([route]) => route), "detail"] as const;
export const MARKETPLACE_CATEGORY_ROUTE_VALUES = Object.keys(categoryLabels) as MarketplaceCategory[];
export const MARKETPLACE_LIBRARY_ROUTE_VALUES = MARKETPLACE_LIBRARY_SECTIONS;
export const MARKETPLACE_UNAVAILABLE_DETAIL_ROUTE_VALUES = MARKETPLACE_UNAVAILABLE_DETAIL_CATEGORIES;

export const marketplaceInstrumentStates = [
  ...marketplaceBaseInstrumentStates.map(([route, title, states]) => defineInstrumentScreenStates({
    routeKey: `marketplace.${route}`,
    states,
    rootMarker: `marketplace-${route}`,
    landmarks: [title, "Marketplace"],
  } as const)),
  marketplaceDetailInstrumentStates,
  ...MARKETPLACE_CATEGORY_ROUTE_VALUES.map((category) => defineInstrumentScreenStates({
    routeKey: `marketplace.category.${category}`,
    states: category === "prompts" || category === "components" || category === "skills"
      ? ["loading", "error", "partial", "empty", "unavailable"]
      : ["loading", "error", "partial", "empty", "ready"],
    rootMarker: `marketplace-category-${category}`,
    landmarks: [categoryLabels[category], "Marketplace"],
  } as const)),
  marketplaceInstalledInstrumentStates,
  ...MARKETPLACE_LIBRARY_ROUTE_VALUES.filter((section) => section !== "installed").map((section) => defineInstrumentScreenStates({
    routeKey: `marketplace.library.${section}`,
    states: ["unavailable"],
    rootMarker: `marketplace-library-${section}`,
    landmarks: [section === "attention" ? "Needs attention" : `${section[0].toLocaleUpperCase()}${section.slice(1)}`, "My Library"],
  } as const)),
  ...MARKETPLACE_UNAVAILABLE_DETAIL_ROUTE_VALUES.map((category) => defineInstrumentScreenStates({
    routeKey: `marketplace.unavailable-detail.${category}`,
    states: ["unavailable"],
    rootMarker: `marketplace-unavailable-detail-${category}`,
    landmarks: [categoryLabels[category], "Marketplace"],
  } as const)),
];

function marketplaceRouteKey(route: MarketplaceLocation["route"]) {
  if (route.kind === "category") return `marketplace.category.${route.category}` as const;
  if (route.kind === "library") return `marketplace.library.${route.section}` as const;
  if (route.kind === "unavailable-detail") return `marketplace.unavailable-detail.${route.category}` as const;
  return `marketplace.${route.kind}` as const;
}

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

function modelReference(itemId: string) {
  const match = /^model:(huggingface|civitai|modelscope):(.{1,256})$/.exec(itemId);
  if (!match) return null;
  const provider = match[1] as "huggingface" | "civitai" | "modelscope";
  const id = match[2]!;
  const repositoryId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
  if (provider === "civitai" ? !/^\d{1,12}$/.test(id) : !repositoryId.test(id)) return null;
  return { provider, id };
}

function publicItemReference(itemId: string) {
  const match = /^(template|recipe):([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/.exec(itemId);
  return match ? { category: match[1] as "template" | "recipe", id: match[2]! } : null;
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
  workRoute,
  location,
  sidebarVisible,
  snapshot,
  onBack,
  onNavigate,
  onRememberLocation,
  onRetry,
}: MarketplaceScreenViewProps) {
  const [workflow, setWorkflow] = useState<{ kind: MarketplaceWorkflowKind; itemLabel: string | null } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const focusId = location.focusId ?? "marketplace-heading";
  const focusRouteKey = JSON.stringify(location.route);
  const route = browseRoute(location.route);
  const detailItemId = location.route.kind === "detail" ? location.route.itemId : null;
  const detailReference = detailItemId === null ? null : modelReference(detailItemId);
  const publicReference = detailItemId === null ? null : publicItemReference(detailItemId);
  const selectedCategory: MarketplaceCategory | "all" | null = location.route.kind === "collection"
    ? "all"
    : location.route.kind === "category" || location.route.kind === "unavailable-detail"
      ? location.route.category
      : detailReference
        ? "models"
        : publicReference?.category === "template"
          ? "templates"
          : publicReference?.category === "recipe"
            ? "recipes"
            : null;
  const itemOrigin = focusId.startsWith("marketplace-item-");
  const originItems = snapshot.status === "ready" && route?.kind === "results"
    ? snapshot.items
    : snapshot.status === "ready" && route?.kind === "category"
      ? snapshot.items.filter(({ category }) => category === route.category)
      : [];
  const originItem = itemOrigin
    ? originItems.find(({ key }) => marketplaceItemDomId(key) === focusId)
    : undefined;
  const originAvailability = !itemOrigin
    ? "not-item"
    : snapshot.status === "loading"
      ? "pending"
      : snapshot.status === "ready" && originItem
        ? "available"
        : "missing";
  const restoredOrigin = useRef<string | null>(null);
  const originRequestKey = `${focusRouteKey}:${focusId}`;

  useEffect(() => {
    if (!itemOrigin) {
      scrollRef.current?.scrollTo({ top: location.scrollTop });
      return;
    }
    const frame = window.requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: location.scrollTop }));
    return () => window.cancelAnimationFrame(frame);
  }, [focusId, focusRouteKey, itemOrigin, location.scrollTop, originAvailability]);

  useEffect(() => {
    if (!itemOrigin) {
      restoredOrigin.current = null;
      const target = document.getElementById(focusId) ?? document.getElementById("marketplace-heading");
      if (!target?.closest("[hidden]")) target?.focus({ preventScroll: true });
      return;
    }
    if (restoredOrigin.current === originRequestKey) return;
    if (originAvailability === "pending") return;
    const heading = document.getElementById("marketplace-heading");
    if (heading?.closest("[hidden]")) return;
    if (originAvailability === "missing") {
      heading?.focus({ preventScroll: true });
      restoredOrigin.current = originRequestKey;
      return;
    }
    let frame = 0;
    let attempts = 0;
    const restoreFocus = () => {
      if (heading?.closest("[hidden]")) return;
      const target = document.getElementById(focusId);
      if (target) {
        target.focus({ preventScroll: true });
        restoredOrigin.current = originRequestKey;
        return;
      }
      if (attempts < 12) {
        attempts += 1;
        frame = window.requestAnimationFrame(restoreFocus);
        return;
      }
      heading?.focus({ preventScroll: true });
      restoredOrigin.current = originRequestKey;
    };
    frame = window.requestAnimationFrame(restoreFocus);
    return () => window.cancelAnimationFrame(frame);
  }, [focusId, focusRouteKey, itemOrigin, originAvailability, originRequestKey]);

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
  const openUnavailableDetail = (category: "prompts" | "components" | "skills") => {
    onRememberLocation({ focusId: marketplaceUnavailableDetailOriginId(category) });
    onNavigate({
      ...location,
      route: { kind: "unavailable-detail", category },
      selectedItemId: null,
      scrollTop: 0,
      focusId: "marketplace-heading",
    });
  };
  const openCollection = () => {
    onNavigate({ ...location, route: { kind: "collection" }, selectedItemId: null, scrollTop: 0, focusId: "marketplace-heading" });
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
    ? "Project targets are unavailable until the home library reconnects."
    : catalog.projects.length === 0
      ? "No named project targets are available in the current home library."
      : "Named project targets are available for supported review-only flows.";
  const changeQuery = (query: MarketplaceQueryState) => {
    if (location.route.kind === "category" && location.query.filters.category !== "all" && query.filters.category === "all") {
      onNavigate({ ...location, route: { kind: "results" }, query, selectedItemId: null, scrollTop: 0, focusId: "marketplace-heading" });
      return;
    }
    onRememberLocation({ query });
  };
  const publicDto = publicReference !== null && snapshot.status === "ready"
    ? snapshot.publicSource?.items.find(({ category, id }) => category === publicReference.category && id === publicReference.id)
    : undefined;
  const detailItem = publicDto && snapshot.status === "ready" && snapshot.publicSource
    ? projectMarketplacePublicItem(publicDto, snapshot.publicSource.source)
    : undefined;
  const publicDetailState = publicReference === null
    ? null
    : snapshot.status === "loading"
      ? "loading"
      : snapshot.status === "error" || snapshot.publicSource === null
        ? "unavailable"
        : detailItem
          ? "ready"
          : "missing";
  const staleDetail = detailItemId !== null && ((detailReference === null && publicReference === null) || publicDetailState === "missing");
  const unavailableWorkflow = location.route.kind === "unavailable-detail"
    ? location.route.category === "prompts" ? "prompt-use" : location.route.category === "components" ? "component-target" : "skill-install"
    : null;
  const instrumentCategory = location.route.kind === "category" ? location.route.category : null;
  const instrumentItemCount = snapshot.status === "ready"
    ? snapshot.items.filter((item) => instrumentCategory === null || item.category === instrumentCategory).length
    : 0;
  const instrumentDescriptor = marketplaceInstrumentStates.find(({ routeKey }) => routeKey === marketplaceRouteKey(location.route))!;
  const instrumentState: InstrumentScenarioState = location.route.kind === "unavailable-detail"
    || (location.route.kind === "library" && location.route.section !== "installed")
    || staleDetail
    ? "unavailable"
    : location.route.kind === "collection"
      ? snapshot.status === "loading" ? "loading" : snapshot.status === "error" ? "error" : "unavailable"
      : location.route.kind === "detail"
        ? publicDetailState === "loading" ? "loading" : publicDetailState === "ready" ? "ready" : "unavailable"
        : snapshot.status === "loading"
          ? "loading"
          : snapshot.status === "error"
            ? "error"
            : instrumentCategory !== null
              && (instrumentCategory === "prompts" || instrumentCategory === "components" || instrumentCategory === "skills")
              && snapshot.categories.find(({ category }) => category === instrumentCategory)?.count.status === "unavailable"
              ? "unavailable"
              : snapshot.sourceHealth.publicLibrary !== "ready" || snapshot.sourceHealth.models !== "ready"
                ? "partial"
                : (location.route.kind === "results" || instrumentCategory !== null) && instrumentItemCount === 0
                  ? "empty"
                  : "ready";
  const content = <main className="marketplace-screen main-region" data-sidebar-visible={sidebarVisible ? "true" : "false"}>
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
      {detailReference
        ? <MarketplaceModelDetail reference={detailReference} onBack={onBack} onReviewDownload={(model) => setWorkflow({ kind: "model-download", itemLabel: model.name })} />
        : publicDetailState === "ready" && (detailItem?.category === "templates" || detailItem?.category === "recipes")
          ? <MarketplacePublicItemDetail
            item={detailItem}
            onBack={onBack}
            onReviewTemplateTarget={(item) => setWorkflow({ kind: "template-target", itemLabel: item.name })}
            onReviewRecipeTarget={(item) => setWorkflow({ kind: "recipe-target", itemLabel: item.name })}
          />
        : publicDetailState === "loading"
          ? <section className="marketplace-route-placeholder" role="status" aria-busy="true"><h2>Loading public item details…</h2></section>
        : publicDetailState === "unavailable"
          ? <section className="marketplace-route-placeholder" role="status"><h2>Public item details unavailable</h2><p>Public item details are unavailable because the Ralphy public library is unavailable.</p></section>
        : staleDetail
          ? <section className="marketplace-route-placeholder" role="status"><button className="marketplace-public-back" type="button" onClick={onBack}>Back to Marketplace</button><h2>Marketplace item unavailable</h2><p>This Marketplace item is unavailable because its saved reference is invalid or stale.</p></section>
        : location.route.kind === "library"
          ? <MarketplaceMyLibrary section={location.route.section} machine={snapshot.status === "ready" ? snapshot.machine : null} />
        : location.route.kind === "unavailable-detail"
          ? <MarketplaceUnavailableDetail
            category={location.route.category}
            onBack={onBack}
            onReview={() => unavailableWorkflow && setWorkflow({ kind: unavailableWorkflow, itemLabel: null })}
          />
        : route === null
            ? <section className="marketplace-route-placeholder" role="status"><h2>{routeTitle(location)}</h2><p>Full item details show only fields returned by the current source. This route does not expose a mutation yet.</p></section>
        : <MarketplaceBrowse
          route={route}
          snapshot={snapshot}
          originKey={originItem?.key ?? null}
          onOpenItem={openItem}
          onOpenCategory={openCategory}
          onOpenLibrary={openLibrary}
          onOpenCollection={openCollection}
          onOpenUnavailableDetail={openUnavailableDetail}
          onRetry={onRetry}
          onClearQuery={() => onRememberLocation({ query: { ...location.query, text: "" } })}
          onClearFilters={() => onRememberLocation({ query: clearedFilters(location.query, location.route.kind === "category" ? location.route.category : "all") })}
        />}
    </div>
    {workflow && <MarketplaceActionReview
      kind={workflow.kind}
      targets={marketplaceTargets(catalog, workRoute ?? { kind: "library" }, workflow.kind)}
      itemLabel={workflow.itemLabel}
      onCancel={() => setWorkflow(null)}
    />}
  </main>;
  const nestedOwner = detailReference || location.route.kind === "library" && location.route.section === "installed";
  return nestedOwner
    ? content
    : <InstrumentScreenRoot descriptor={instrumentDescriptor} state={instrumentState}>{content}</InstrumentScreenRoot>;
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
