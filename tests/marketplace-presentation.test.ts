import { describe, expect, test } from "vitest";
import type {
  LocalModelCatalog,
  LocalModelDetail,
  LocalModelSummary,
  MarketplacePublicItemDto,
  MarketplacePublicSnapshotDto,
} from "../electron/media/types";
import {
  marketplaceModelProviders,
  presentMarketplaceSources,
  projectMarketplaceModel,
  projectMarketplaceModelDetail,
  type MarketplaceSourceHealth,
} from "../src/screens/marketplace/presentation";
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

function model(overrides: Partial<LocalModelSummary> = {}): LocalModelSummary {
  return {
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
    iconUrl: "https://huggingface.co/avatars/acme.png",
    previewUrl: null,
    providerUrl: "https://huggingface.co/Acme/alpha",
    recommendedPackage: { format: "GGUF", bytes: 8 * 1024 ** 3, files: ["alpha.gguf"] },
    comfort: {
      level: "comfortable",
      label: "Comfortable here",
      score: 4,
      runtime: "ollama",
      estimatedMemoryBytes: 10 * 1024 ** 3,
      evidence: ["Fits available memory"],
    },
    state: "remote",
    permissions: [],
    ...overrides,
  };
}

function publicItem(overrides: Partial<MarketplacePublicItemDto> = {}): MarketplacePublicItemDto {
  return {
    id: "clean-cut",
    category: "template",
    name: "Clean cut",
    summary: "A concise product-reveal structure",
    referenceUrls: ["https://ralphy.b-cdn.net/blocks/clean-cut.jpg"],
    recipe: null,
    ...overrides,
  };
}

function publicSnapshot(items: MarketplacePublicItemDto[], source: "live" | "cache" = "live"): MarketplacePublicSnapshotDto {
  return {
    schemaVersion: 1,
    source,
    refreshedAt: "2026-08-20T10:00:00.000Z",
    sourceUpdatedAt: "Wed, 19 Aug 2026 10:00:00 GMT",
    warning: null,
    items,
  };
}

function catalog(items: LocalModelSummary[], errors: LocalModelCatalog["errors"] = []): LocalModelCatalog {
  return { items, machine, refreshedAt: "2026-08-20T10:00:00.000Z", errors };
}

const allReady: MarketplaceSourceHealth = { publicLibrary: "ready", models: "ready" };

function query(patch: Partial<MarketplaceQueryState> = {}): MarketplaceQueryState {
  return {
    text: "",
    filters: {
      category: "all",
      source: "all",
      license: "all",
      compatibility: "all",
      modality: "all",
      format: "all",
      ...patch.filters,
    },
    sort: "relevance",
    ...patch,
  };
}

describe("Marketplace presentation", () => {
  test("projects model summaries and details field by field without popularity fields", () => {
    const summary = model();
    const projected = projectMarketplaceModel(summary);
    expect(projected).toEqual({
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
      tags: ["assistant", "gguf"],
      iconUrl: "https://huggingface.co/avatars/acme.png",
      previewUrl: null,
      providerUrl: "https://huggingface.co/Acme/alpha",
      recommendedPackage: { format: "GGUF", bytes: 8 * 1024 ** 3, files: ["alpha.gguf"] },
      comfort: {
        level: "comfortable",
        label: "Comfortable here",
        score: 4,
        runtime: "ollama",
        estimatedMemoryBytes: 10 * 1024 ** 3,
        evidence: ["Fits available memory"],
      },
      state: "remote",
      permissions: [],
    });
    expect(JSON.stringify(projected)).not.toMatch(/downloads|likes|rating|trending/i);

    const detail: LocalModelDetail = {
      ...summary,
      readme: "# Alpha\n\nProvider model card",
      previewUrls: ["https://huggingface.co/preview.png"],
      files: [{ name: "alpha.gguf", bytes: 8 * 1024 ** 3, format: "GGUF", recommended: true, warning: null }],
    };
    expect(projectMarketplaceModelDetail(detail)).toEqual({
      ...projected,
      readme: "# Alpha\n\nProvider model card",
      previewUrls: ["https://huggingface.co/preview.png"],
      files: [{ name: "alpha.gguf", bytes: 8 * 1024 ** 3, format: "GGUF", recommended: true, warning: null }],
    });
    expect(JSON.stringify(projectMarketplaceModelDetail(detail))).not.toMatch(/downloads|likes|rating|trending/i);
  });

  test("keeps Model, Template, and prompt-kind Recipe identities distinct with stable source-prefixed keys", () => {
    const recipe = publicItem({
      id: "prompt-recipe",
      category: "recipe",
      name: "Gamma recipe",
      summary: "A reusable prompt artifact",
      referenceUrls: [],
      recipe: { kind: "prompt", body: "Keep it concise", artifact: "prompt text", parameters: null, demo: null },
    });
    const result = presentMarketplaceSources(
      publicSnapshot([publicItem({ name: "Beta template" }), recipe]),
      catalog([model({ name: "Alpha model" })]),
      query(),
      [],
      allReady,
    );
    expect(result.items.map(({ category, key }) => [category, key])).toEqual([
      ["models", "model:huggingface:Acme/alpha"],
      ["templates", "template:clean-cut"],
      ["recipes", "recipe:prompt-recipe"],
    ]);
    expect(result.items[2]).toMatchObject({ category: "recipes", recipe: { recipe: { kind: "prompt" } } });
  });

  test("reports only evidence-backed common fields and exact supported or unavailable category counts", () => {
    const live = presentMarketplaceSources(
      publicSnapshot([publicItem()], "live"),
      catalog([model({ license: null, revision: null, lastModified: null })]),
      query(),
      [],
      allReady,
    );
    const modelItem = live.items.find(({ category }) => category === "models");
    const template = live.items.find(({ category }) => category === "templates");
    expect(modelItem).toMatchObject({
      sourceLabel: "Hugging Face",
      version: { status: "empty" },
      updatedAt: { status: "empty" },
      license: { status: "empty" },
      publisherIdentity: { status: "unavailable" },
      contentAudit: { status: "unavailable" },
      compatibility: { status: "ready", value: "Comfortable here" },
    });
    expect(template).toMatchObject({
      sourceLabel: "Ralphy public library · Live",
      version: { status: "unavailable" },
      updatedAt: { status: "unavailable" },
      license: { status: "unavailable" },
      publisherIdentity: { status: "unavailable" },
      contentAudit: { status: "unavailable" },
      compatibility: { status: "unavailable" },
    });
    expect(live.categories.map(({ category, count, catalog: state }) => [category, count.status, count.status === "ready" ? count.value : null, state])).toEqual([
      ["models", "ready", 1, "ready"],
      ["templates", "ready", 1, "ready"],
      ["recipes", "ready", 0, "ready"],
      ["prompts", "unavailable", null, "unavailable"],
      ["components", "unavailable", null, "unavailable"],
      ["skills", "unavailable", null, "unavailable"],
    ]);

    const cached = presentMarketplaceSources(publicSnapshot([publicItem()], "cache"), catalog([]), query(), [], allReady);
    expect(cached.items[0]?.sourceLabel).toBe("Ralphy public library · Cached");
    const degraded = presentMarketplaceSources(null, null, query(), [], { publicLibrary: "unavailable", models: "unavailable" });
    expect(degraded.categories.find(({ category }) => category === "models")?.count.status).toBe("unavailable");
    expect(degraded.categories.find(({ category }) => category === "templates")?.count.status).toBe("unavailable");
  });

  test("applies every category and source enum without turning unsupported categories into items", () => {
    const source = publicSnapshot([
      publicItem(),
      publicItem({ id: "recipe", category: "recipe", name: "Recipe", recipe: { kind: "ffmpeg", body: null, artifact: null, parameters: null, demo: null } }),
    ]);
    const models = catalog([
      model({ provider: "huggingface", id: "Acme/hf", name: "HF" }),
      model({ provider: "civitai", id: "42", name: "Civitai", providerUrl: "https://civitai.com/models/42" }),
      model({ provider: "modelscope", id: "Acme/ms", name: "ModelScope", providerUrl: "https://modelscope.cn/models/Acme/ms" }),
    ]);
    const itemCategories = (category: MarketplaceQueryState["filters"]["category"]) => presentMarketplaceSources(source, models, query({ filters: { ...query().filters, category } }), [], allReady).items.map(({ category: value }) => value);
    expect(itemCategories("all")).toEqual(["models", "templates", "models", "models", "recipes"]);
    expect(itemCategories("models")).toEqual(["models", "models", "models"]);
    expect(itemCategories("templates")).toEqual(["templates"]);
    expect(itemCategories("recipes")).toEqual(["recipes"]);
    expect(itemCategories("prompts")).toEqual([]);
    expect(itemCategories("components")).toEqual([]);
    expect(itemCategories("skills")).toEqual([]);

    const itemSources = (selected: MarketplaceQueryState["filters"]["source"]) => presentMarketplaceSources(source, models, query({ filters: { ...query().filters, source: selected } }), [], allReady).items.map((item) => item.category === "models" ? item.model.provider : "ralphy");
    expect(itemSources("all")).toEqual(["civitai", "ralphy", "huggingface", "modelscope", "ralphy"]);
    expect(itemSources("ralphy")).toEqual(["ralphy", "ralphy"]);
    expect(itemSources("huggingface")).toEqual(["huggingface"]);
    expect(itemSources("civitai")).toEqual(["civitai"]);
    expect(itemSources("modelscope")).toEqual(["modelscope"]);
  });

  test("filters only on declared license, compatibility, modality, and package format evidence", () => {
    const models = catalog([
      model({ id: "Acme/gguf", name: "GGUF", modality: "text", license: "apache-2.0", comfort: { ...model().comfort, level: "comfortable", score: 4 }, recommendedPackage: { format: "GGUF", bytes: 1, files: ["a.gguf"] } }),
      model({ id: "Acme/safe", name: "Safe", modality: "image", license: null, comfort: { ...model().comfort, level: "unknown", score: 0 }, recommendedPackage: { format: "SafeTensors", bytes: 1, files: ["a.safetensors"] } }),
      model({ id: "Acme/onnx", name: "ONNX", modality: "video", comfort: { ...model().comfort, level: "incompatible", score: 0 }, recommendedPackage: { format: "ONNX", bytes: 1, files: ["a.onnx"] } }),
      model({ id: "Acme/mlx", name: "MLX", modality: "audio", comfort: { ...model().comfort, level: "tight", score: 2 }, recommendedPackage: { format: "MLX", bytes: 1, files: ["a.mlx"] } }),
      model({ id: "Acme/multi", name: "Multi", modality: "multimodal", recommendedPackage: { format: "Bin", bytes: 1, files: ["a.bin"] } }),
    ]);
    const ids = (filters: Partial<MarketplaceQueryState["filters"]>) => presentMarketplaceSources(
      publicSnapshot([publicItem()]),
      models,
      query({ filters: { ...query().filters, ...filters } }),
      [],
      allReady,
    ).items.filter((item) => item.category === "models").map((item) => item.model.id);

    expect(ids({ license: "all" })).toHaveLength(5);
    expect(ids({ license: "declared" })).toEqual(["Acme/gguf", "Acme/mlx", "Acme/multi", "Acme/onnx"]);
    expect(ids({ compatibility: "compatible" })).toEqual(["Acme/gguf", "Acme/mlx", "Acme/multi"]);
    expect(ids({ compatibility: "unknown" })).toEqual(["Acme/safe"]);
    expect(ids({ compatibility: "incompatible" })).toEqual(["Acme/onnx"]);
    expect(ids({ modality: "text" })).toEqual(["Acme/gguf"]);
    expect(ids({ modality: "image" })).toEqual(["Acme/safe"]);
    expect(ids({ modality: "video" })).toEqual(["Acme/onnx"]);
    expect(ids({ modality: "audio" })).toEqual(["Acme/mlx"]);
    expect(ids({ modality: "multimodal" })).toEqual(["Acme/multi"]);
    expect(ids({ format: "gguf" })).toEqual(["Acme/gguf"]);
    expect(ids({ format: "safetensors" })).toEqual(["Acme/safe"]);
    expect(ids({ format: "onnx" })).toEqual(["Acme/onnx"]);
    expect(ids({ format: "mlx" })).toEqual(["Acme/mlx"]);
    expect(presentMarketplaceSources(publicSnapshot([publicItem()]), models, query({ filters: { ...query().filters, license: "declared" } }), [], allReady).items.some(({ category }) => category === "templates")).toBe(false);
  });

  test("uses deterministic current-field keyword, name, and updated sorting without provider popularity", () => {
    const models = catalog([
      model({ id: "Acme/zulu", name: "Zulu", author: "needle author", lastModified: "2026-08-18T00:00:00Z", downloads: 9_999_999 }),
      model({ id: "Acme/alpha", name: "Alpha needle", author: "other", lastModified: "2026-08-20T00:00:00Z", downloads: 1 }),
      model({ id: "Acme/beta", name: "Beta", tags: ["needle"], lastModified: "2026-08-19T00:00:00Z", downloads: 999 }),
    ]);
    const names = (next: MarketplaceQueryState) => presentMarketplaceSources(null, models, next, [], { publicLibrary: "unavailable", models: "ready" }).items.map(({ name }) => name);
    expect(names(query({ text: "needle" }))).toEqual(["Alpha needle", "Zulu", "Beta"]);
    expect(names(query({ sort: "name" }))).toEqual(["Alpha needle", "Beta", "Zulu"]);
    expect(names(query({ sort: "updated" }))).toEqual(["Alpha needle", "Beta", "Zulu"]);
    expect(names(query())).toEqual(["Alpha needle", "Beta", "Zulu"]);
  });

  test("keyword-searches bounded public source, Recipe body, artifact, and kind fields", () => {
    const recipe = publicItem({
      id: "searchable-recipe",
      category: "recipe",
      name: "Neutral recipe",
      summary: "Ordinary transformation",
      recipe: {
        kind: "hyperframes",
        body: "body-only-marker",
        artifact: "artifact-only-marker",
        parameters: null,
        demo: null,
      },
    });
    const source = publicSnapshot([publicItem(), recipe]);
    const keys = (text: string) => presentMarketplaceSources(source, catalog([]), query({ text }), [], allReady).items.map(({ key }) => key);

    expect(keys("ralphy")).toEqual(["template:clean-cut", "recipe:searchable-recipe"]);
    expect(keys("live")).toEqual(["template:clean-cut", "recipe:searchable-recipe"]);
    expect(keys("body-only-marker")).toEqual(["recipe:searchable-recipe"]);
    expect(keys("artifact-only-marker")).toEqual(["recipe:searchable-recipe"]);
    expect(keys("hyperframes")).toEqual(["recipe:searchable-recipe"]);
    const artifactResult = presentMarketplaceSources(source, catalog([]), query({ text: "artifact-only-marker" }), [], allReady).items[0];
    expect(artifactResult?.category === "recipes" ? artifactResult.recipe.recipe?.artifact : null).toBe("artifact-only-marker");
  });

  test("keyword-searches neutral models by their displayed provider source only", () => {
    const models = catalog([
      model({ provider: "huggingface", id: "Acme/one", name: "Neutral one", author: "Acme", tags: [], providerUrl: "https://example.invalid/one" }),
      model({ provider: "civitai", id: "2", name: "Neutral two", author: "Acme", tags: [], providerUrl: "https://example.invalid/two" }),
    ]);
    const keys = (text: string) => presentMarketplaceSources(null, models, query({ text }), [], { publicLibrary: "unavailable", models: "ready" }).items.map(({ key }) => key);

    expect(keys("hugging face")).toEqual(["model:huggingface:Acme/one"]);
    expect(keys("civitai")).toEqual(["model:civitai:2"]);
  });

  test("keeps the combined projected result bound at 512 public items plus 24 models", () => {
    const publicItems = Array.from({ length: 513 }, (_, index) => publicItem({ id: `template-${index}`, name: `Template ${String(index).padStart(3, "0")}` }));
    const models = Array.from({ length: 25 }, (_, index) => model({ id: `Acme/model-${index}`, name: `Model ${String(index).padStart(3, "0")}` }));
    const result = presentMarketplaceSources(publicSnapshot(publicItems), catalog(models), query(), [], allReady);
    expect(result.items).toHaveLength(536);
    expect(result.items.filter(({ category }) => category === "models")).toHaveLength(24);
    expect(result.items.filter(({ category }) => category !== "models")).toHaveLength(512);
  });

  test("maps the exact model-provider health set for each source filter", () => {
    expect(marketplaceModelProviders("all")).toEqual(["huggingface", "civitai"]);
    expect(marketplaceModelProviders("ralphy")).toEqual(["huggingface", "civitai"]);
    expect(marketplaceModelProviders("huggingface")).toEqual(["huggingface"]);
    expect(marketplaceModelProviders("civitai")).toEqual(["civitai"]);
    expect(marketplaceModelProviders("modelscope")).toEqual(["modelscope"]);
  });
});
