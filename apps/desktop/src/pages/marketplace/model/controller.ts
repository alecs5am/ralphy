import type { MarketplaceInstallMutation, MediaWorkbenchBridge } from "../../../../electron/media/types";
import {
  marketplaceModelProviders,
  presentMarketplaceSources,
  type MarketplaceSnapshot,
  type MarketplaceSourceHealth,
  type MarketplaceSourceIssue,
} from "../lib/presentation";
import type { MarketplaceQueryState } from "./navigation";

export interface MarketplaceController {
  subscribe(listener: () => void): () => void;
  getSnapshot(): MarketplaceSnapshot;
  start(): Promise<void>;
  refresh(): Promise<void>;
  setQuery(query: MarketplaceQueryState): void;
  /** Install, uninstall, enable, disable, or change the workspace being installed into. */
  mutateInstall(mutation: MarketplaceInstallMutation): Promise<void>;
  dispose(): void;
}

export type MarketplaceApi = Pick<
  MediaWorkbenchBridge,
  "loadMarketplacePublicLibrary"
  | "loadMarketplacePackCatalog"
  | "loadMarketplaceInstalls"
  | "mutateMarketplaceInstalls"
  | "searchLocalModels"
>;

type ModelProviderRequest = Exclude<MarketplaceQueryState["filters"]["source"], "ralphy">;
const SEARCH_DEBOUNCE_MS = 250;

function modelProviderRequest(query: MarketplaceQueryState): ModelProviderRequest {
  return query.filters.source === "all" || query.filters.source === "ralphy"
    ? "all"
    : query.filters.source;
}

export function createMarketplaceController(
  api: MarketplaceApi,
  initialQuery: MarketplaceQueryState,
): MarketplaceController {
  let query = initialQuery;
  let snapshot: MarketplaceSnapshot = { status: "loading", query };
  let started = false;
  let disposed = false;
  let activeRequest = 0;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let lastPublic: Awaited<ReturnType<MarketplaceApi["loadMarketplacePublicLibrary"]>> | null = null;
  let lastPack: Awaited<ReturnType<MarketplaceApi["loadMarketplacePackCatalog"]>> | null = null;
  let lastInstalls: Awaited<ReturnType<MarketplaceApi["loadMarketplaceInstalls"]>> | null = null;
  let lastModels: {
    provider: ModelProviderRequest;
    value: Awaited<ReturnType<MarketplaceApi["searchLocalModels"]>>;
  } | null = null;
  const retainedModels = (forQuery: MarketplaceQueryState) => (
    lastModels?.provider === modelProviderRequest(forQuery) ? lastModels.value : null
  );
  const listeners = new Set<() => void>();
  const clearScheduledSearch = () => {
    if (searchTimer === null) return;
    clearTimeout(searchTimer);
    searchTimer = null;
  };
  const emit = (next: MarketplaceSnapshot) => {
    if (disposed) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const load = async () => {
    if (disposed) return;
    clearScheduledSearch();
    const requestId = ++activeRequest;
    const requestQuery = query;
    const requestProvider = modelProviderRequest(requestQuery);
    if (snapshot.status === "ready") emit({ ...snapshot, query: requestQuery, refreshing: true });
    else emit({ status: "loading", query: requestQuery });
    const modelQuery = requestQuery.text.trim();
    const [library, pack, installs, models] = await Promise.allSettled([
      api.loadMarketplacePublicLibrary(),
      api.loadMarketplacePackCatalog(),
      api.loadMarketplaceInstalls(),
      api.searchLocalModels({
        ...(modelQuery ? { query: modelQuery } : {}),
        provider: requestProvider,
        sort: "updated",
        limit: 24,
      }),
    ]);
    if (disposed || requestId !== activeRequest) return;

    const resultQuery = query;
    const attemptedProviders = marketplaceModelProviders(resultQuery.filters.source);
    const providerIssues: MarketplaceSourceIssue[] = models.status === "fulfilled"
      ? models.value.errors.map(({ provider, message }) => ({ source: provider, scope: "model-provider", message }))
      : [];
    /* The bundled shelf lives in this build's own resources, so it failing is a
       build fault worth naming rather than a network condition to retry. */
    const packCatalog = pack.status === "fulfilled" && pack.value.unavailable === null ? pack.value : null;
    const sourceErrors: MarketplaceSourceIssue[] = [
      ...(library.status === "rejected"
        ? [{ source: "ralphy-public", scope: "public-library", message: "Ralphy public library is unavailable" } satisfies MarketplaceSourceIssue]
        : []),
      ...(packCatalog === null
        ? [{
          source: "ralphy-bundled",
          scope: "bundled-catalog",
          message: pack.status === "fulfilled"
            ? pack.value.unavailable ?? "The bundled catalog is unavailable"
            : "The bundled catalog is unavailable",
        } satisfies MarketplaceSourceIssue]
        : []),
      ...(models.status === "rejected"
        ? [{ source: "models", scope: "model-catalog", message: "Model catalog is unavailable" } satisfies MarketplaceSourceIssue]
        : []),
      ...providerIssues,
    ];
    const failedProviders = new Set(providerIssues.flatMap(({ source }) => (
      attemptedProviders.includes(source as (typeof attemptedProviders)[number]) ? [source] : []
    )));
    const allAttemptedProvidersFailed = attemptedProviders.every((provider) => failedProviders.has(provider));
    const modelHealth: MarketplaceSourceHealth["models"] = models.status === "rejected" || allAttemptedProvidersFailed
      ? "unavailable"
      : failedProviders.size > 0 ? "partial" : "ready";
    const sourceHealth: MarketplaceSourceHealth = {
      publicLibrary: library.status === "fulfilled" ? "ready" : "unavailable",
      models: modelHealth,
    };
    /* One live source is enough to render a Marketplace. Only when nothing this
       build can reach answers is the screen actually in error. */
    if (library.status === "rejected" && modelHealth === "unavailable" && packCatalog === null) {
      emit({ status: "error", error: "Marketplace sources are unavailable", sourceErrors, sourceHealth, query: resultQuery });
      return;
    }
    lastPublic = library.status === "fulfilled" ? library.value : null;
    lastPack = packCatalog;
    /* A record this machine could not read is an empty shelf, not a failed
       screen: the catalog is still true, only the choices are missing. */
    lastInstalls = installs.status === "fulfilled" ? installs.value : null;
    lastModels = models.status === "fulfilled" ? { provider: requestProvider, value: models.value } : null;
    emit(presentMarketplaceSources(lastPublic, retainedModels(resultQuery), resultQuery, sourceErrors, sourceHealth, lastPack, lastInstalls));
  };

  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot,
    async start() {
      if (started || disposed) return;
      started = true;
      await load();
    },
    async refresh() {
      if (disposed) return;
      started = true;
      await load();
    },
    setQuery(nextQuery) {
      if (disposed || JSON.stringify(query) === JSON.stringify(nextQuery)) return;
      const providerChanged = modelProviderRequest(query) !== modelProviderRequest(nextQuery);
      const textChanged = query.text.trim() !== nextQuery.text.trim();
      query = nextQuery;
      if (!started) {
        emit({ status: "loading", query });
        return;
      }
      if (providerChanged) {
        clearScheduledSearch();
        emit({ status: "loading", query });
        void load();
        return;
      }
      if (snapshot.status === "ready") {
        emit({
          ...presentMarketplaceSources(lastPublic, retainedModels(query), query, snapshot.sourceErrors, snapshot.sourceHealth, lastPack, lastInstalls),
          refreshing: textChanged ? false : snapshot.refreshing,
        });
      } else if (snapshot.status === "loading") {
        emit({ status: "loading", query });
      }
      if (textChanged) {
        clearScheduledSearch();
        activeRequest += 1;
        searchTimer = setTimeout(() => {
          searchTimer = null;
          void load();
        }, SEARCH_DEBOUNCE_MS);
      }
    },
    /* The record is authoritative and main returns the whole of it, so the
       screen re-projects from what came back rather than guessing the new
       state locally and hoping the two agree. */
    async mutateInstall(mutation) {
      if (disposed) return;
      const next = await api.mutateMarketplaceInstalls(mutation).catch(() => null);
      if (disposed || next === null) return;
      lastInstalls = next;
      if (snapshot.status !== "ready") return;
      emit(presentMarketplaceSources(
        lastPublic, retainedModels(query), query, snapshot.sourceErrors, snapshot.sourceHealth, lastPack, lastInstalls,
      ));
    },
    dispose() {
      disposed = true;
      activeRequest += 1;
      clearScheduledSearch();
      listeners.clear();
    },
  };
}
