import type { MediaWorkbenchBridge } from "../../electron/media/types";
import {
  marketplaceModelProviders,
  presentMarketplaceSources,
  type MarketplaceSnapshot,
  type MarketplaceSourceHealth,
  type MarketplaceSourceIssue,
} from "../screens/marketplace/presentation";
import type { MarketplaceQueryState } from "./marketplace-navigation";

export interface MarketplaceController {
  subscribe(listener: () => void): () => void;
  getSnapshot(): MarketplaceSnapshot;
  start(): Promise<void>;
  refresh(): Promise<void>;
  setQuery(query: MarketplaceQueryState): void;
  dispose(): void;
}

export type MarketplaceApi = Pick<MediaWorkbenchBridge, "loadMarketplacePublicLibrary" | "searchLocalModels">;

export function createMarketplaceController(
  api: MarketplaceApi,
  initialQuery: MarketplaceQueryState,
): MarketplaceController {
  let query = initialQuery;
  let snapshot: MarketplaceSnapshot = { status: "loading", query };
  let started = false;
  let disposed = false;
  let activeRequest = 0;
  let lastPublic: Awaited<ReturnType<MarketplaceApi["loadMarketplacePublicLibrary"]>> | null = null;
  let lastModels: Awaited<ReturnType<MarketplaceApi["searchLocalModels"]>> | null = null;
  const listeners = new Set<() => void>();
  const emit = (next: MarketplaceSnapshot) => {
    if (disposed) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const load = async () => {
    if (disposed) return;
    const requestId = ++activeRequest;
    const requestQuery = query;
    if (snapshot.status === "ready") emit({ ...snapshot, query: requestQuery, refreshing: true });
    else emit({ status: "loading", query: requestQuery });
    const modelQuery = requestQuery.text.trim();
    const [library, models] = await Promise.allSettled([
      api.loadMarketplacePublicLibrary(),
      api.searchLocalModels({
        ...(modelQuery ? { query: modelQuery } : {}),
        provider: requestQuery.filters.source === "all" || requestQuery.filters.source === "ralphy"
          ? "all"
          : requestQuery.filters.source,
        sort: "updated",
        limit: 24,
      }),
    ]);
    if (disposed || requestId !== activeRequest) return;

    const attemptedProviders = marketplaceModelProviders(requestQuery.filters.source);
    const providerIssues: MarketplaceSourceIssue[] = models.status === "fulfilled"
      ? models.value.errors.map(({ provider, message }) => ({ source: provider, scope: "model-provider", message }))
      : [];
    const sourceErrors: MarketplaceSourceIssue[] = [
      ...(library.status === "rejected"
        ? [{ source: "ralphy-public", scope: "public-library", message: "Ralphy public library is unavailable" } satisfies MarketplaceSourceIssue]
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
    if (library.status === "rejected" && modelHealth === "unavailable") {
      emit({ status: "error", error: "Marketplace sources are unavailable", sourceErrors, sourceHealth, query: requestQuery });
      return;
    }
    lastPublic = library.status === "fulfilled" ? library.value : null;
    lastModels = models.status === "fulfilled" ? models.value : null;
    emit(presentMarketplaceSources(lastPublic, lastModels, requestQuery, sourceErrors, sourceHealth));
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
      query = nextQuery;
      if (!started) {
        emit({ status: "loading", query });
        return;
      }
      if (snapshot.status === "ready") {
        emit({
          ...presentMarketplaceSources(lastPublic, lastModels, query, snapshot.sourceErrors, snapshot.sourceHealth),
          refreshing: true,
        });
      }
      void load();
    },
    dispose() {
      disposed = true;
      activeRequest += 1;
      listeners.clear();
    },
  };
}
