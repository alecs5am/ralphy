import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CatalogResult, MarketplaceInstallMutation } from "@/shared/api/ipc";
import { bridge } from "@/shared/api/ipc";
import { InstrumentScreenRoot, type InstrumentScenarioState } from "@/shared/instrument/screen-state-registry";
import type { WorkbenchRoute } from "@/shared/model/workbench";
import {
  createMarketplaceController,
  type MarketplaceController,
} from "../model/controller";
import {
  type MarketplaceCategory,
  type MarketplaceLocation,
  type MarketplaceMemoryPatch,
  type MarketplaceQueryState,
} from "../model/navigation";
import {
  MarketplaceBrowse,
  marketplaceItemDomId,
} from "./MarketplaceBrowse";
import { MarketplaceHeader } from "./MarketplaceHeader";
import { marketplaceAgentRequest, type MarketplaceAgentRequest } from "../lib/agent-request";
import {
  browseRoute,
  clearedFilters,
  modelReference,
  packEntryCategory,
  packItemReference,
  publicItemReference,
} from "./screen-references";
import { categoryLabels } from "./browse-discover";
import { studioCatalog } from "../lib/studio-catalog";
import { marketplaceInstrumentStates } from "./screen-routes";
import { marketplaceIntents } from "./screen-intents";
import { useMarketplaceRestore } from "./use-marketplace-restore";
import { MarketplaceModelDetail } from "./MarketplaceModelViews";
import { MarketplaceMyLibrary } from "./MarketplaceMyLibrary";
import { MarketplacePackItemDetail } from "./MarketplacePackItemDetail";
import { MarketplacePublicItemDetail } from "./MarketplacePublicItemDetail";
import {
  MarketplaceActionReview,
  marketplaceTargets,
  type MarketplaceWorkflowKind,
} from "./MarketplaceWorkflows";
import { MarketplaceUnavailableDetail } from "./MarketplaceUnavailableViews";
import {
  marketplaceInstallState,
  projectMarketplacePackItem,
  projectMarketplacePublicItem,
  type MarketplaceSnapshot,
} from "../lib/presentation";

export interface MarketplaceScreenProps {
  catalog: CatalogResult | null;
  workRoute?: WorkbenchRoute;
  location: MarketplaceLocation;
  sidebarVisible: boolean;
  onBack(): void;
  onNavigate(location: MarketplaceLocation): void;
  onRememberLocation(patch: MarketplaceMemoryPatch): void;
  onRequestAgent?(request: MarketplaceAgentRequest): void;
}

function marketplaceRouteKey(route: MarketplaceLocation["route"]) {
  if (route.kind === "category") return `marketplace.category.${route.category}` as const;
  if (route.kind === "library") return `marketplace.library.${route.section}` as const;
  if (route.kind === "unavailable-detail") return `marketplace.unavailable-detail.${route.category}` as const;
  return `marketplace.${route.kind}` as const;
}

function routeTitle(location: MarketplaceLocation): string {
  const route = location.route;
  if (route.kind === "discover") return "Templates";
  if (route.kind === "results") return "Search results";
  if (route.kind === "category" || route.kind === "unavailable-detail") return categoryLabels[route.category];
  if (route.kind === "library") return route.section === "attention" ? "Needs attention" : `${route.section[0].toLocaleUpperCase()}${route.section.slice(1)}`;
  if (route.kind === "collection") return "Collection";
  return "Item details";
}

function isUnfilteredQuery(query: MarketplaceQueryState): boolean {
  const { tag, ...filters } = query.filters;
  return !query.text.trim() && !tag && Object.values(filters).every((value) => value === "all");
}

/* The route surface and its one scroll region. Both names are exported because the geometry
   harness mounts a supplied-presentation Downloads route of its own and has to measure the
   real screen, not a hand-written copy of it. The `main-region` class stays as a hook:
   instrument.css names it, and this screen's own layout is stated here. */
export const MARKETPLACE_SCREEN = "marketplace-screen main-region @container/main-region flex h-full max-h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-desk p-1 text-ink";
export const MARKETPLACE_SCROLL = "marketplace-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain";
const ROUTE_PLACEHOLDER = "marketplace-route-placeholder mt-4 grid min-h-64 place-items-center rounded-panel bg-surface p-6 text-center";

export interface MarketplaceScreenViewProps extends MarketplaceScreenProps {
  snapshot: MarketplaceSnapshot;
  onRetry(): void;
  onInstallAction(mutation: MarketplaceInstallMutation): void;
}

export function MarketplaceScreenView({
  catalog,
  workRoute,
  location,
  sidebarVisible,
  snapshot: sourceSnapshot,
  onBack,
  onNavigate,
  onRememberLocation,
  onRequestAgent,
  onRetry,
  onInstallAction,
}: MarketplaceScreenViewProps) {
  const [workflow, setWorkflow] = useState<{ kind: MarketplaceWorkflowKind; itemLabel: string | null } | null>(null);
  const [workspaceChoice, setWorkspaceChoice] = useState<{ scope: string; id: string } | null>(null);
  const workspaces = (catalog?.workspaces ?? []).map(({ id, name }) => ({ id, name }));
  const activeWorkspaceId = workRoute && workRoute.kind !== "library" ? workRoute.workspaceId : null;
  const workspaceScope = `${catalog?.rootPath ?? ""}:${activeWorkspaceId ?? ""}`;
  useEffect(() => setWorkspaceChoice(null), [workspaceScope]);
  const storedWorkspaceId = sourceSnapshot.status === "ready" ? sourceSnapshot.installs?.selectedWorkspaceId : null;
  const installWorkspaceId = [workspaceChoice?.scope === workspaceScope ? workspaceChoice.id : null, activeWorkspaceId, storedWorkspaceId]
    .find((id) => workspaces.some((workspace) => workspace.id === id)) ?? workspaces[0]?.id ?? null;
  /* The current workspace owns both the save action and every Saved badge. A persisted
     target is only a fallback; choosing a different one lasts until the work context changes. */
  const snapshot: MarketplaceSnapshot = sourceSnapshot.status === "ready" ? {
    ...sourceSnapshot,
    items: sourceSnapshot.items.map((item) => item.origin === "pack" ? { ...item, install: marketplaceInstallState(item.pack.id, installWorkspaceId, sourceSnapshot.installs?.installs ?? []) } : item),
  } : sourceSnapshot;
  const scrollRef = useRef<HTMLDivElement>(null);
  const focusId = location.focusId ?? "marketplace-heading";
  const focusRouteKey = JSON.stringify(location.route);
  const route = browseRoute(location.route);
  const detailItemId = location.route.kind === "detail" ? location.route.itemId : null;
  const studioItem = detailItemId?.startsWith("studio:") ? studioCatalog().find(({ key }) => key === detailItemId) : undefined;
  const detailReference = detailItemId === null ? null : modelReference(detailItemId);
  const publicReference = detailItemId === null ? null : publicItemReference(detailItemId);
  const packReference = detailItemId === null ? null : packItemReference(detailItemId);
  const selectedCategory: MarketplaceCategory | "all" | null = studioItem ? studioItem.category : location.route.kind === "discover" ? "templates" : location.route.kind === "collection"
    ? "all"
    : location.route.kind === "category" || location.route.kind === "unavailable-detail"
      ? location.route.category
      : detailReference
        ? "models"
        : publicReference?.category === "template"
          ? "templates"
          : publicReference?.category === "recipe"
            ? "recipes"
            : publicReference?.category === "asset" ? "sounds" : packEntryCategory(packReference?.id ?? null);
  const itemOrigin = focusId.startsWith("marketplace-item-");
  const originItems = snapshot.status === "ready" && (route?.kind === "results" || route?.kind === "discover")
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
  useMarketplaceRestore({
    scrollRef,
    scrollTop: location.scrollTop,
    focusId,
    focusRouteKey,
    itemOrigin,
    originAvailability,
  });

  const {
    openCategory,
    openResults,
    openUnavailableDetail,
    openCollection,
    openLibrary,
    openItem,
  } = marketplaceIntents(location, onNavigate, onRememberLocation);

  /* My Library reports what this workspace installed, so it reads the catalog
     and the record directly -- the shelf's items are narrowed by the current
     search and category, and would hide installs from the other shelves. */
  const installedPackItems = snapshot.status === "ready" && snapshot.packSource
    ? snapshot.packSource.entries
      .map((entry) => projectMarketplacePackItem(
        entry,
        snapshot.packSource!.cliVersion,
        marketplaceInstallState(entry.id, installWorkspaceId, snapshot.installs?.installs ?? []),
      ))
      .filter((item) => item.install.status === "installed")
    : [];
  const useItem = onRequestAgent ? (item: Parameters<typeof marketplaceAgentRequest>[0]) => onRequestAgent(marketplaceAgentRequest(item)) : undefined;
  const openTag = (tag: string) => onNavigate({ ...location, route: { kind: "results" },
    query: { ...location.query, text: "", filters: { ...clearedFilters(location.query, "all").filters, tag } },
    selectedItemId: null, scrollTop: 0, focusId: "marketplace-heading" });
  const changeQuery = (query: MarketplaceQueryState) => {
    if (location.route.kind === "results" && isUnfilteredQuery(query)) {
      onNavigate({ ...location, route: { kind: "discover" }, query, selectedItemId: null, scrollTop: 0, focusId: "marketplace-heading" });
      return;
    }
    if (location.route.kind === "category" && location.query.filters.category !== "all" && query.filters.category === "all") {
      onNavigate({ ...location, route: { kind: "results" }, query, selectedItemId: null, scrollTop: 0, focusId: "marketplace-heading" });
      return;
    }
    onRememberLocation({ query });
  };
  const search = () => isUnfilteredQuery(location.query)
    ? onNavigate({ ...location, route: { kind: "discover" }, selectedItemId: null, scrollTop: 0, focusId: "marketplace-heading" })
    : openResults();
  const publicDto = publicReference !== null && snapshot.status === "ready"
    ? snapshot.publicSource?.items.find(({ category, id }) => category === publicReference.category && id === publicReference.id)
    : undefined;
  const packEntry = packReference !== null && snapshot.status === "ready"
    ? snapshot.packSource?.entries.find(({ id }) => id === packReference.id)
    : undefined;
  const detailItem = packEntry && snapshot.status === "ready" && snapshot.packSource
    ? projectMarketplacePackItem(
      packEntry,
      snapshot.packSource.cliVersion,
      /* Keep the shelf's install state when re-projecting a detail. */
      marketplaceInstallState(packEntry.id, installWorkspaceId, snapshot.installs?.installs ?? []),
    )
    : publicDto && snapshot.status === "ready" && snapshot.publicSource
      ? projectMarketplacePublicItem(publicDto, snapshot.publicSource.source)
      : studioItem;
  const publicDetailState = studioItem ? "ready" : packReference !== null
    ? snapshot.status === "loading" ? "loading" : packEntry ? "ready" : "missing"
    : publicReference === null
    ? null
    : snapshot.status === "loading"
      ? "loading"
      : snapshot.status === "error" || snapshot.publicSource === null
        ? "unavailable"
        : detailItem
          ? "ready"
          : "missing";
  const staleDetail = detailItemId !== null && !studioItem
    && ((detailReference === null && publicReference === null && packReference === null) || publicDetailState === "missing");
  const unavailableWorkflow = location.route.kind === "unavailable-detail"
    ? location.route.category === "prompts" ? "prompt-use" : location.route.category === "components" ? "component-target" : "skill-install"
    : null;
  const instrumentCategory = location.route.kind === "category" ? location.route.category : null;
  const instrumentItemCount = snapshot.status === "ready"
    ? snapshot.items.filter((item) => instrumentCategory === null || item.category === instrumentCategory).length
    : 0;
  const instrumentDescriptor = marketplaceInstrumentStates.find(({ routeKey }) => routeKey === marketplaceRouteKey(location.route))!;
  const instrumentState: InstrumentScenarioState = location.route.kind === "library" && location.route.section === "saved"
    ? snapshot.status === "loading" ? "loading" : snapshot.status === "error" ? "error" : !snapshot.installs || !snapshot.packSource || snapshot.installs.warning && !installedPackItems.length ? "unavailable" : installedPackItems.length ? "ready" : "empty"
    : location.route.kind === "unavailable-detail"
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
  const content = <main className={MARKETPLACE_SCREEN} data-sidebar-visible={sidebarVisible ? "true" : "false"}>
    <MarketplaceHeader
      title={detailItem ? categoryLabels[detailItem.category] : routeTitle(location)}
      query={location.query}
      selectedCategory={selectedCategory}
      sidebarVisible={sidebarVisible}
      refreshing={snapshot.status === "ready" && snapshot.refreshing}
      workspaces={workspaces}
      selectedWorkspaceId={installWorkspaceId}
      onQueryChange={changeQuery}
      onSearch={search}
      onOpenCategory={openCategory}
      onOpenSaved={() => openLibrary("saved")}
      onOpenInstalled={() => openLibrary("installed")}
      onSelectWorkspace={(workspaceId) => {
        setWorkspaceChoice({ scope: workspaceScope, id: workspaceId });
        onInstallAction({ action: "select-workspace", workspaceId, entryId: null });
      }}
    />
    <div
      className={MARKETPLACE_SCROLL}
      ref={scrollRef}
      onScroll={(event) => onRememberLocation({ scrollTop: event.currentTarget.scrollTop })}
    >
      {snapshot.status === "ready" && snapshot.installs?.warning && <p className="m-3 text-sm text-alert" role="alert">{snapshot.installs.warning}</p>}
      {detailReference
        ? <MarketplaceModelDetail reference={detailReference} onBack={onBack} />
        : detailItem?.origin === "pack"
          ? <MarketplacePackItemDetail
            item={detailItem}
            workspaceName={workspaces.find(({ id }) => id === installWorkspaceId)?.name ?? null}
            onUse={useItem}
            onTag={openTag}
            onBack={onBack}
            onInstallAction={(action, entryId) => {
              if (installWorkspaceId === null) return;
              onInstallAction({ action, workspaceId: installWorkspaceId, entryId });
            }}
          />
        : publicDetailState === "ready" && detailItem?.origin === "public"
          ? <MarketplacePublicItemDetail
            item={detailItem}
            items={snapshot.status === "ready" ? snapshot.items : []}
            onOpenItem={openItem}
            onUse={useItem}
            onTag={openTag}
            onBack={onBack}
          />
        : publicDetailState === "loading"
          ? <section className={ROUTE_PLACEHOLDER} role="status" aria-busy="true"><h2>Loading public item details…</h2></section>
        : publicDetailState === "unavailable"
          ? <section className={ROUTE_PLACEHOLDER} role="status"><div><h2 className="m-0 text-lg">Public item details unavailable</h2><p className="mt-2 text-sm text-muted">Public item details are unavailable because the Ralphy public library is unavailable.</p></div></section>
        : staleDetail
          ? <section className={ROUTE_PLACEHOLDER} role="status"><div className="grid justify-items-center gap-2"><button className="marketplace-public-back inline-flex h-8 w-fit items-center gap-1.75 rounded-control bg-surface-sunken px-3 type-xs text-ink" type="button" onClick={onBack}>Back to creative library</button><h2 className="m-0 text-lg">Library item unavailable</h2><p className="m-0 text-sm text-muted">This library item is unavailable because its saved reference is invalid or stale.</p></div></section>
        : location.route.kind === "library"
          ? location.route.section === "saved" && (snapshot.status !== "ready" || !snapshot.installs || !snapshot.packSource || snapshot.installs.warning && !installedPackItems.length)
            ? <section className={ROUTE_PLACEHOLDER} role="status"><p>{snapshot.status === "loading" ? "Loading saved documents…" : snapshot.status === "ready" && snapshot.installs?.warning || "Saved documents could not be loaded. Please refresh the catalog."}</p><button type="button" onClick={onRetry}>Refresh</button></section>
            : <MarketplaceMyLibrary
            section={location.route.section}
            machine={snapshot.status === "ready" ? snapshot.machine : null}
            installedItems={installedPackItems}
            workspaceName={workspaces.find(({ id }) => id === installWorkspaceId)?.name ?? null}
            onOpenItem={openItem}
          />
        : location.route.kind === "unavailable-detail"
          ? <MarketplaceUnavailableDetail
            category={location.route.category}
            onBack={onBack}
            onReview={() => unavailableWorkflow && setWorkflow({ kind: unavailableWorkflow, itemLabel: null })}
          />
        : route === null
            ? <section className={ROUTE_PLACEHOLDER} role="status"><div><h2 className="m-0 text-lg">{routeTitle(location)}</h2><p className="mt-2 text-sm text-muted">Full item details show only fields returned by the current source. This route does not expose a mutation yet.</p></div></section>
        : <MarketplaceBrowse
          route={route}
          snapshot={snapshot}
          originKey={originItem?.key ?? null}
          onOpenItem={openItem}
          onUse={useItem}
          onOpenCategory={openCategory}
          onOpenLibrary={openLibrary}
          onOpenCollection={openCollection}
          onOpenUnavailableDetail={openUnavailableDetail}
          onRetry={onRetry}
          onClearQuery={() => changeQuery({ ...location.query, text: "" })}
          onClearFilters={() => changeQuery(clearedFilters(location.query, location.route.kind === "category" ? location.route.category : "all"))}
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
  return <MarketplaceScreenView
    {...props}
    snapshot={snapshot}
    onRetry={() => void props.controller.refresh()}
    onInstallAction={(mutation) => void props.controller.mutateInstall(mutation)}
  />;
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
    : <MarketplaceScreenView
      {...props}
      snapshot={{ status: "loading", query: props.location.query }}
      onRetry={() => undefined}
      onInstallAction={() => undefined}
    />;
}
