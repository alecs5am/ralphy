import { describe, expect, test, vi } from "vitest";
import type {
  LocalModelCatalog,
  LocalModelSummary,
  MarketplacePublicSnapshotDto,
  MediaWorkbenchBridge,
} from "../electron/media/types";
import { createMarketplaceController, type MarketplaceApi } from "../src/state/marketplace-controller";
import type { MarketplaceQueryState } from "../src/state/marketplace-navigation";

const machine = {
  platform: "macOS",
  architecture: "arm64",
  cpu: "Apple M3 Max",
  totalMemoryBytes: 36 * 1024 ** 3,
  freeDiskBytes: 200 * 1024 ** 3,
  runtimes: [{ id: "ollama" as const, label: "Ollama", available: true, detail: "Detected" }],
  installed: [],
};

const model: LocalModelSummary = {
  provider: "huggingface",
  id: "Acme/alpha",
  name: "Alpha model",
  author: "Acme",
  task: "text-generation",
  modality: "text",
  modelType: "base",
  baseModel: "Alpha",
  license: "apache-2.0",
  gated: false,
  revision: "abc123",
  lastModified: "2026-08-19T10:00:00.000Z",
  downloads: 98_765,
  likes: 432,
  tags: ["assistant", "gguf"],
  iconUrl: null,
  previewUrl: null,
  providerUrl: "https://huggingface.co/Acme/alpha",
  recommendedPackage: { format: "GGUF", bytes: 8 * 1024 ** 3, files: ["alpha.gguf"] },
  comfort: { level: "comfortable", label: "Comfortable here", score: 4, runtime: "ollama", estimatedMemoryBytes: 10 * 1024 ** 3, evidence: ["Fits available memory"] },
  state: "remote",
  permissions: [],
};

function publicSnapshot(items = [{
  id: "clean-cut",
  category: "template" as const,
  name: "Clean cut",
  summary: "A concise product-reveal structure",
  referenceUrls: [],
  recipe: null,
}]): MarketplacePublicSnapshotDto {
  return { schemaVersion: 1, source: "live", refreshedAt: "2026-08-20T10:00:00Z", sourceUpdatedAt: null, warning: null, items };
}

function catalog(items: LocalModelSummary[] = [model], errors: LocalModelCatalog["errors"] = []): LocalModelCatalog {
  return { items, machine, refreshedAt: "2026-08-20T10:00:00Z", errors };
}

function query(source: MarketplaceQueryState["filters"]["source"] = "all", text = ""): MarketplaceQueryState {
  return {
    text,
    filters: { category: "all", source, license: "all", compatibility: "all", modality: "all", format: "all" },
    sort: "relevance",
  };
}

function api(
  loadMarketplacePublicLibrary: MarketplaceApi["loadMarketplacePublicLibrary"] = vi.fn(async () => publicSnapshot()),
  searchLocalModels: MarketplaceApi["searchLocalModels"] = vi.fn(async () => catalog()),
): MarketplaceApi {
  return { loadMarketplacePublicLibrary, searchLocalModels };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("Marketplace controller", () => {
  test("starts once and makes one combined bounded model request with the shared query state", async () => {
    const loadMarketplacePublicLibrary = vi.fn(async () => publicSnapshot());
    const searchLocalModels = vi.fn(async () => catalog());
    const controller = createMarketplaceController(api(loadMarketplacePublicLibrary, searchLocalModels), query("all", "  alpha  "));
    expect(controller.getSnapshot()).toEqual({ status: "loading", query: query("all", "  alpha  ") });

    await controller.start();
    await controller.start();

    expect(loadMarketplacePublicLibrary).toHaveBeenCalledTimes(1);
    expect(searchLocalModels).toHaveBeenCalledTimes(1);
    expect(searchLocalModels).toHaveBeenCalledWith({ query: "alpha", provider: "all", sort: "updated", limit: 24 });
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      refreshing: false,
      sourceHealth: { publicLibrary: "ready", models: "ready" },
      items: [{ category: "models", key: "model:huggingface:Acme/alpha" }],
    });
  });

  test("uses exactly one explicit provider request for provider filters", async () => {
    for (const source of ["huggingface", "civitai", "modelscope"] as const) {
      const searchLocalModels = vi.fn(async () => catalog([]));
      const controller = createMarketplaceController(api(undefined, searchLocalModels), query(source));
      await controller.start();
      expect(searchLocalModels).toHaveBeenCalledTimes(1);
      expect(searchLocalModels).toHaveBeenCalledWith({ provider: source, sort: "updated", limit: 24 });
    }
    const ralphySearch = vi.fn(async () => catalog([]));
    await createMarketplaceController(api(undefined, ralphySearch), query("ralphy")).start();
    expect(ralphySearch).toHaveBeenCalledTimes(1);
    expect(ralphySearch).toHaveBeenCalledWith({ provider: "all", sort: "updated", limit: 24 });
  });

  test("merges every fulfilled provider issue while degrading only attempted providers", async () => {
    const controller = createMarketplaceController(api(undefined, vi.fn(async () => catalog([model], [
      { provider: "huggingface", message: "rate limited" },
      { provider: "modelscope", message: "not configured" },
    ]))), query("all"));
    await controller.start();
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      sourceHealth: { models: "partial" },
      sourceErrors: [
        { source: "huggingface", scope: "model-provider", message: "rate limited" },
        { source: "modelscope", scope: "model-provider", message: "not configured" },
      ],
    });

    const irrelevant = createMarketplaceController(api(undefined, vi.fn(async () => catalog([], [
      { provider: "modelscope", message: "not configured" },
    ]))), query("all"));
    await irrelevant.start();
    expect(irrelevant.getSnapshot()).toMatchObject({ status: "ready", sourceHealth: { models: "ready" } });
  });

  test("marks Models unavailable when every attempted provider reports failure", async () => {
    const broad = createMarketplaceController(api(undefined, vi.fn(async () => catalog([], [
      { provider: "huggingface", message: "rate limited" },
      { provider: "civitai", message: "offline" },
    ]))), query("all"));
    await broad.start();
    expect(broad.getSnapshot()).toMatchObject({ status: "ready", sourceHealth: { publicLibrary: "ready", models: "unavailable" } });

    const explicit = createMarketplaceController(api(undefined, vi.fn(async () => catalog([], [
      { provider: "modelscope", message: "not available" },
    ]))), query("modelscope"));
    await explicit.start();
    expect(explicit.getSnapshot()).toMatchObject({ status: "ready", sourceHealth: { publicLibrary: "ready", models: "unavailable" } });
  });

  test("keeps healthy source data for one-source failures and distinguishes healthy-empty sources", async () => {
    const publicFailed = createMarketplaceController(api(
      vi.fn(async () => { throw new Error("private path must not surface"); }),
      vi.fn(async () => catalog()),
    ), query());
    await publicFailed.start();
    expect(publicFailed.getSnapshot()).toMatchObject({
      status: "ready",
      items: [{ category: "models" }],
      sourceHealth: { publicLibrary: "unavailable", models: "ready" },
      sourceErrors: [{ source: "ralphy-public", scope: "public-library", message: "Ralphy public library is unavailable" }],
    });

    const modelsFailed = createMarketplaceController(api(
      vi.fn(async () => publicSnapshot()),
      vi.fn(async () => { throw new Error("provider URL must not surface"); }),
    ), query());
    await modelsFailed.start();
    expect(modelsFailed.getSnapshot()).toMatchObject({
      status: "ready",
      items: [{ category: "templates" }],
      sourceHealth: { publicLibrary: "ready", models: "unavailable" },
      sourceErrors: [{ source: "models", scope: "model-catalog", message: "Model catalog is unavailable" }],
    });

    const healthyEmpty = createMarketplaceController(api(
      vi.fn(async () => publicSnapshot([])),
      vi.fn(async () => { throw new Error("offline"); }),
    ), query());
    await healthyEmpty.start();
    expect(healthyEmpty.getSnapshot()).toMatchObject({ status: "ready", items: [], sourceHealth: { publicLibrary: "ready", models: "unavailable" } });
  });

  test("publishes an error only when the public library and selected model source are both unavailable", async () => {
    const rejected = vi.fn(async () => { throw new Error("offline"); });
    const total = createMarketplaceController(api(rejected, rejected as MediaWorkbenchBridge["searchLocalModels"]), query());
    await total.start();
    expect(total.getSnapshot()).toMatchObject({
      status: "error",
      error: "Marketplace sources are unavailable",
      sourceHealth: { publicLibrary: "unavailable", models: "unavailable" },
    });

    const fulfilledFailure = createMarketplaceController(api(
      vi.fn(async () => { throw new Error("offline"); }),
      vi.fn(async () => catalog([], [
        { provider: "huggingface", message: "offline" },
        { provider: "civitai", message: "offline" },
      ])),
    ), query());
    await fulfilledFailure.start();
    expect(fulfilledFailure.getSnapshot()).toMatchObject({ status: "error", sourceHealth: { publicLibrary: "unavailable", models: "unavailable" } });

    const modelHealthyEmpty = createMarketplaceController(api(
      vi.fn(async () => { throw new Error("offline"); }),
      vi.fn(async () => catalog([])),
    ), query());
    await modelHealthyEmpty.start();
    expect(modelHealthyEmpty.getSnapshot()).toMatchObject({ status: "ready", items: [], sourceHealth: { publicLibrary: "unavailable", models: "ready" } });
  });

  test("suppresses stale query results and retains current content while refreshing", async () => {
    vi.useFakeTimers();
    try {
      const oldLibrary = deferred<MarketplacePublicSnapshotDto>();
      const oldModels = deferred<LocalModelCatalog>();
      const newLibrary = deferred<MarketplacePublicSnapshotDto>();
      const newModels = deferred<LocalModelCatalog>();
      const loadMarketplacePublicLibrary = vi.fn()
        .mockReturnValueOnce(oldLibrary.promise)
        .mockReturnValueOnce(newLibrary.promise);
      const searchLocalModels = vi.fn()
        .mockReturnValueOnce(oldModels.promise)
        .mockReturnValueOnce(newModels.promise);
      const controller = createMarketplaceController(api(loadMarketplacePublicLibrary, searchLocalModels), query("all", "old"));
      const oldRequest = controller.start();
      controller.setQuery(query("all", "new"));
      await vi.advanceTimersByTimeAsync(250);
      newLibrary.resolve(publicSnapshot([{ ...publicSnapshot().items[0], id: "new", name: "New template", summary: "new" }]));
      newModels.resolve(catalog([{ ...model, id: "Acme/new", name: "New model" }]));
      await Promise.resolve();
      oldLibrary.resolve(publicSnapshot([{ ...publicSnapshot().items[0], id: "old", name: "Old template", summary: "old" }]));
      oldModels.resolve(catalog([{ ...model, id: "Acme/old", name: "Old model" }]));
      await oldRequest;
      await Promise.resolve();
      expect(controller.getSnapshot()).toMatchObject({ status: "ready", query: { text: "new" } });
      expect(controller.getSnapshot()).not.toEqual(expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ name: "Old model" })]) }));

      const refreshLibrary = deferred<MarketplacePublicSnapshotDto>();
      const refreshModels = deferred<LocalModelCatalog>();
      loadMarketplacePublicLibrary.mockReturnValueOnce(refreshLibrary.promise);
      searchLocalModels.mockReturnValueOnce(refreshModels.promise);
      const refresh = controller.refresh();
      const refreshing = controller.getSnapshot();
      expect(refreshing).toMatchObject({ status: "ready", refreshing: true });
      expect(refreshing.status === "ready" ? refreshing.items.map(({ name }) => name).sort() : []).toEqual(["New model", "New template"]);
      refreshLibrary.resolve(publicSnapshot([]));
      refreshModels.resolve(catalog([]));
      await refresh;
      expect(controller.getSnapshot()).toMatchObject({ status: "ready", refreshing: false, items: [] });
    } finally {
      vi.useRealTimers();
    }
  });

  test("does not retain model catalog or health across effective-provider transitions", async () => {
    const modelScope = deferred<LocalModelCatalog>();
    const returnedAll = deferred<LocalModelCatalog>();
    const searchLocalModels = vi.fn()
      .mockResolvedValueOnce(catalog([model]))
      .mockReturnValueOnce(modelScope.promise)
      .mockReturnValueOnce(returnedAll.promise);
    const controller = createMarketplaceController(api(vi.fn(async () => publicSnapshot()), searchLocalModels), query("all"));
    await controller.start();
    expect(controller.getSnapshot()).toMatchObject({ status: "ready", sourceHealth: { models: "ready" }, items: [{ category: "models" }, { category: "templates" }] });

    controller.setQuery(query("modelscope"));
    expect(controller.getSnapshot()).toEqual({ status: "loading", query: query("modelscope") });
    expect(searchLocalModels).toHaveBeenNthCalledWith(2, { provider: "modelscope", sort: "updated", limit: 24 });

    controller.setQuery(query("all"));
    expect(controller.getSnapshot()).toEqual({ status: "loading", query: query("all") });
    expect(searchLocalModels).toHaveBeenNthCalledWith(3, { provider: "all", sort: "updated", limit: 24 });
    returnedAll.resolve(catalog([{ ...model, provider: "civitai", id: "84", name: "Fresh all", providerUrl: "https://civitai.com/models/84" }]));
    await Promise.resolve();
    await Promise.resolve();
    modelScope.resolve(catalog([{ ...model, provider: "modelscope", id: "Acme/stale", name: "Stale ModelScope", providerUrl: "https://modelscope.cn/models/Acme/stale" }]));
    await Promise.resolve();
    await Promise.resolve();

    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      query: { filters: { source: "all" } },
      sourceHealth: { models: "ready" },
      items: [{ category: "templates" }, { name: "Fresh all", model: { provider: "civitai" } }],
    });
    expect(JSON.stringify(controller.getSnapshot())).not.toContain("Stale ModelScope");
  });

  test("debounces text loads, projects immediately, and keeps local filters and sort network-free", async () => {
    vi.useFakeTimers();
    try {
      const loadMarketplacePublicLibrary = vi.fn(async () => publicSnapshot());
      const searchLocalModels = vi.fn(async () => catalog());
      const controller = createMarketplaceController(api(loadMarketplacePublicLibrary, searchLocalModels), query());
      await controller.start();

      controller.setQuery(query("all", "a"));
      controller.setQuery(query("all", "al"));
      controller.setQuery(query("all", "alpha"));
      expect(controller.getSnapshot()).toMatchObject({ status: "ready", query: { text: "alpha" }, refreshing: false });
      expect(loadMarketplacePublicLibrary).toHaveBeenCalledTimes(1);
      expect(searchLocalModels).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(249);
      expect(searchLocalModels).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      expect(loadMarketplacePublicLibrary).toHaveBeenCalledTimes(2);
      expect(searchLocalModels).toHaveBeenCalledTimes(2);
      expect(searchLocalModels).toHaveBeenLastCalledWith({ query: "alpha", provider: "all", sort: "updated", limit: 24 });

      const filtered = { ...query("all", "alpha"), filters: { ...query().filters, license: "declared" as const } };
      controller.setQuery(filtered);
      controller.setQuery({ ...filtered, sort: "name" });
      await vi.runAllTimersAsync();
      expect(controller.getSnapshot()).toMatchObject({ status: "ready", query: { sort: "name", filters: { license: "declared" } }, refreshing: false });
      expect(loadMarketplacePublicLibrary).toHaveBeenCalledTimes(2);
      expect(searchLocalModels).toHaveBeenCalledTimes(2);

      controller.setQuery({ ...filtered, filters: { ...filtered.filters, source: "civitai" } });
      expect(loadMarketplacePublicLibrary).toHaveBeenCalledTimes(3);
      expect(searchLocalModels).toHaveBeenCalledTimes(3);
      expect(searchLocalModels).toHaveBeenLastCalledWith({ query: "alpha", provider: "civitai", sort: "updated", limit: 24 });
    } finally {
      vi.useRealTimers();
    }
  });

  test("cancels scheduled text loads when a newer provider request or disposal takes over", async () => {
    vi.useFakeTimers();
    try {
      const loadMarketplacePublicLibrary = vi.fn(async () => publicSnapshot());
      const searchLocalModels = vi.fn(async () => catalog());
      const controller = createMarketplaceController(api(loadMarketplacePublicLibrary, searchLocalModels), query());
      await controller.start();
      controller.setQuery(query("all", "queued"));
      controller.setQuery(query("civitai", "provider-now"));
      expect(searchLocalModels).toHaveBeenCalledTimes(2);
      await vi.runAllTimersAsync();
      expect(searchLocalModels).toHaveBeenCalledTimes(2);

      controller.setQuery(query("civitai", "dispose-before-load"));
      controller.dispose();
      await vi.runAllTimersAsync();
      expect(searchLocalModels).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("stops publishing and loading after disposal", async () => {
    const pendingLibrary = deferred<MarketplacePublicSnapshotDto>();
    const pendingModels = deferred<LocalModelCatalog>();
    const loadMarketplacePublicLibrary = vi.fn(() => pendingLibrary.promise);
    const searchLocalModels = vi.fn(() => pendingModels.promise);
    const controller = createMarketplaceController(api(loadMarketplacePublicLibrary, searchLocalModels), query());
    const listener = vi.fn();
    controller.subscribe(listener);
    const request = controller.start();
    const beforeDispose = listener.mock.calls.length;
    controller.dispose();
    pendingLibrary.resolve(publicSnapshot());
    pendingModels.resolve(catalog());
    await request;
    controller.setQuery(query("civitai"));
    await controller.refresh();
    expect(listener).toHaveBeenCalledTimes(beforeDispose);
    expect(loadMarketplacePublicLibrary).toHaveBeenCalledTimes(1);
    expect(searchLocalModels).toHaveBeenCalledTimes(1);
  });
});
