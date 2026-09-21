import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { MarketplaceBrowse, MarketplaceDiscover, MarketplaceResults, marketplaceItemDomId } from "@/pages/marketplace";
import { MarketplaceHeader, isMarketplaceLocation } from "@/pages/marketplace";
import { MarketplaceScreenView } from "@/pages/marketplace";
import type {
  MarketplaceItemPresentation,
  MarketplaceSnapshot,
} from "@/pages/marketplace";
import type {
  MarketplaceLocation,
  MarketplaceQueryState,
} from "@/pages/marketplace";
import { createReactHost as createBaseReactHost } from "./react-host";

function createReactHost() {
  const host = createBaseReactHost();
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((name, options) => {
    const element = create(name, options);
    if (name === "video" || name === "audio") Object.assign(element, { play: vi.fn(async () => undefined), pause: vi.fn() });
    return element;
  });
  return host;
}

const defaultQuery: MarketplaceQueryState = {
  text: "",
  filters: {
    category: "all",
    source: "all",
    license: "all",
    compatibility: "all",
    modality: "all",
    format: "all",
  },
  sort: "relevance",
};

const modelPresentation: MarketplaceItemPresentation = {
  origin: "models",
  key: "model:huggingface:Acme/alpha",
  category: "models",
  name: "Alpha model",
  summary: "Text generation",
  tags: ["assistant", "gguf"],
  sourceLabel: "Hugging Face",
  version: { status: "ready", value: "abc123" },
  updatedAt: { status: "ready", value: "2026-08-19T10:00:00.000Z" },
  license: { status: "ready", value: "apache-2.0" },
  publisherIdentity: { status: "unavailable", reason: "Publisher verification is unavailable." },
  contentAudit: { status: "unavailable", reason: "Content audit is unavailable." },
  compatibility: { status: "ready", value: "Comfortable here" },
  model: {
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
    previewUrl: "https://huggingface.co/Acme/alpha/resolve/main/preview.png",
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
  },
};

const templatePresentation: MarketplaceItemPresentation = {
  origin: "public",
  key: "template:clean-cut",
  category: "templates",
  name: "Clean cut",
  summary: "A concise product-reveal structure",
  tags: [],
  sourceLabel: "Ralphy public library · Live",
  version: { status: "unavailable", reason: "Version is unavailable." },
  updatedAt: { status: "unavailable", reason: "Update date is unavailable." },
  license: { status: "unavailable", reason: "License is unavailable." },
  publisherIdentity: { status: "unavailable", reason: "Publisher identity is unavailable." },
  contentAudit: { status: "unavailable", reason: "Content audit is unavailable." },
  compatibility: { status: "unavailable", reason: "Compatibility is unavailable." },
  template: {
    id: "clean-cut",
    category: "template",
    name: "Clean cut",
    summary: "A concise product-reveal structure",
    referenceUrls: [
      "https://ralphy.b-cdn.net/blocks/template/reference.html",
      "https://ralphy.b-cdn.net/blocks/template/clean-cut.png",
    ],
    recipe: null,
  },
};

const recipePresentation: MarketplaceItemPresentation = {
  ...templatePresentation,
  key: "recipe:voxel-dither",
  category: "recipes",
  name: "Voxel dither",
  summary: "A reproducible image treatment",
  recipe: {
    id: "voxel-dither",
    category: "recipe",
    name: "Voxel dither",
    summary: "A reproducible image treatment",
    referenceUrls: [],
    recipe: {
      kind: "ffmpeg",
      body: "Apply a bounded dither chain",
      artifact: "ffmpeg -i input.mp4 output.mp4",
      parameters: null,
      demo: {
        kind: "media",
        storageUrl: "https://ralphy.b-cdn.net/units/voxel-dither/demo.mp4",
        beforeUrl: null,
        afterUrl: null,
        posterUrl: "https://ralphy.b-cdn.net/blocks/voxel-poster.png",
      },
    },
  },
};

const categories = [
  ["models", "Models", "Model packages from current providers.", { status: "ready", value: 1 }],
  ["templates", "Templates", "Reusable structures for content formats.", { status: "ready", value: 1 }],
  ["recipes", "Effects", "Reusable production artifacts and transformations.", { status: "ready", value: 1 }],
  ["prompts", "Prompts", "Reusable generation instructions.", { status: "unavailable", reason: "Prompt catalog is unavailable in the current Desktop contract." }],
  ["components", "Visuals", "Reusable visual and audio building blocks.", { status: "unavailable", reason: "Visuals catalog is unavailable in the current Desktop contract." }],
  ["sounds", "Sounds", "Reusable audio from the public library.", { status: "ready", value: 0 }],
  ["skills", "Skills", "Bundled guides for agent workflows.", { status: "unavailable", reason: "Skills catalog is unavailable in the current Desktop contract." }],
] satisfies Array<["models" | "templates" | "recipes" | "prompts" | "components" | "sounds" | "skills", string, string, { status: "ready"; value: number } | { status: "unavailable"; reason: string }]>;

function readySnapshot(patch: Partial<Extract<MarketplaceSnapshot, { status: "ready" }>> = {}): Extract<MarketplaceSnapshot, { status: "ready" }> {
  return {
    status: "ready",
    items: [modelPresentation, templatePresentation, recipePresentation],
    packSource: null,
    categories: categories.map(([category, label, purpose, count]) => ({ category, label, purpose, count, catalog: count.status === "ready" ? "ready" : "unavailable" })),
    machine: {
      platform: "macOS",
      architecture: "arm64",
      cpu: "Apple M3 Max",
      totalMemoryBytes: 36 * 1024 ** 3,
      freeDiskBytes: 200 * 1024 ** 3,
      runtimes: [{ id: "ollama", label: "Ollama", available: true, detail: "Detected" }],
      installed: [
        { id: "llama3.2:latest", name: "Llama 3.2", runtime: "ollama", digest: "sha256:abc", bytes: 2 * 1024 ** 3, format: "GGUF", updatedAt: "2026-08-18T09:00:00.000Z" },
        { id: "diffusion-local", name: "Diffusion local", runtime: "diffusers", digest: "sha256:def", bytes: 4 * 1024 ** 3, format: "safetensors", updatedAt: null },
      ],
    },
    publicSource: {
      schemaVersion: 1,
      source: "live",
      refreshedAt: "2026-08-20T10:00:00.000Z",
      sourceUpdatedAt: null,
      warning: null,
      items: [],
    },
    sourceErrors: [],
    sourceHealth: { publicLibrary: "ready", models: "ready" },
    refreshing: false,
    query: defaultQuery,
    ...patch,
  };
}

const resultsLocation: MarketplaceLocation = {
  route: { kind: "results" },
  query: defaultQuery,
  selectedItemId: null,
  scrollTop: 438,
  focusId: null,
};

describe("Marketplace browse surfaces", () => {
  test("renders source-backed creative previews without category cards or unsupported merchandising", () => {
    const markup = renderToStaticMarkup(<MarketplaceDiscover snapshot={readySnapshot()} onOpenCategory={() => undefined} onOpenLibrary={() => undefined} onOpenItem={() => undefined} />);

    expect(markup).toContain('aria-label="Creative resources"');
    expect(markup.match(/data-marketplace-item-key=/g)).toHaveLength(1);
    expect(markup).not.toContain("marketplace-category-card");
    expect(markup).not.toContain("Installed models");
    expect(markup).not.toContain("Llama 3.2");
    expect(markup).not.toContain("Diffusion local");
    expect(markup).not.toContain("Recently updated");
    expect(markup).not.toContain("Alpha model");
    expect(markup).toContain("Clean cut");
    expect(markup).not.toContain("Voxel dither");
    expect(markup).not.toMatch(/rating|trending|recommended for you|downloads|likes/i);
    expect(markup).not.toContain("Useful for your current work");
    expect(markup).not.toContain("Community contributions");
    expect(markup).not.toContain("Not available yet");
  });

  test("opens source-backed creative gallery cards", async () => {
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const open = vi.fn();
    try {
      await act(async () => root.render(<MarketplaceDiscover snapshot={readySnapshot()} onOpenCategory={vi.fn()} onOpenLibrary={vi.fn()} onOpenItem={open} />));
      const resource = host.container.querySelector(".marketplace-creative-card")!;
      expect(resource.querySelector("img")?.getAttribute("src")).toBe(templatePresentation.template.referenceUrls[1]);
      await act(async () => resource.dispatchEvent(new Event("click", { bubbles: true })));
      expect(open).toHaveBeenCalledWith(templatePresentation.key);
      expect(host.container.querySelectorAll(".marketplace-creative-card")).toHaveLength(1);
      expect(host.container.querySelector(".marketplace-effect-title")).toBeNull();
    } finally { await act(async () => root.unmount()); host.restore(); }
  });

  test("renders one honest mixed ranking with typed previews and one detail action", () => {
    const markup = renderToStaticMarkup(<MarketplaceResults items={[modelPresentation, templatePresentation, recipePresentation]} query={defaultQuery} onOpenItem={() => undefined} />);

    expect(markup).toContain('aria-label="Creative resources"');
    expect(markup).toContain("Models");
    expect(markup).toContain("Templates");
    expect(markup).toContain("Effects");
    expect(markup).toContain("https://huggingface.co/Acme/alpha/resolve/main/preview.png");
    expect(markup).toContain("https://ralphy.b-cdn.net/blocks/template/clean-cut.png");
    expect(markup).toContain('src="https://ralphy.b-cdn.net/units/voxel-dither/demo.mp4"');
    expect(markup).toContain('preload="metadata"');
    expect(markup).toContain('loop=""');
    expect(markup).toContain('muted=""');
    expect(markup).not.toContain("autoplay");
    expect(markup.match(/data-marketplace-item-key=/g)).toHaveLength(3);
    expect(markup).not.toMatch(/98,?765|432|downloads|likes|rating|trending/i);
  });

  test("hides missing previews and reveals the archived origin when returning from details", async () => {
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const open = vi.fn();
    const archived = { ...templatePresentation, key: "template:missing", name: "Awaiting preview", template: { ...templatePresentation.template, referenceUrls: [], recipe: null } };
    try {
      await act(async () => root.render(<MarketplaceResults items={[archived, templatePresentation]} query={defaultQuery} onOpenItem={open} />));
      expect(host.container.textContent).toContain("1 archived");
      expect(host.container.textContent).not.toContain(archived.name);
      await act(async () => root.render(<MarketplaceResults items={[archived, templatePresentation]} query={defaultQuery} originKey={archived.key} onOpenItem={open} />));
      const row = host.container.querySelector(".marketplace-archived-list button")!;
      expect(row.textContent).toContain(archived.name);
      await act(async () => row.dispatchEvent(new Event("click", { bubbles: true })));
      expect(open).toHaveBeenCalledWith(archived.key);
    } finally { await act(async () => root.unmount()); host.restore(); }
  });

  test("keeps provider sentinels and full revision hashes out of model browse copy", () => {
    const revision = "abcdef1234567890abcdef1234567890abcdef1234";
    const item: MarketplaceItemPresentation = { ...modelPresentation, version: { status: "ready", value: revision }, model: { ...modelPresentation.model, task: "unknown", modality: "unknown", modelType: "unknown", revision } };
    const markup = renderToStaticMarkup(<MarketplaceResults items={[item]} query={defaultQuery} onOpenItem={() => undefined} />);
    expect(markup).toContain("abcdef1");
    expect(markup).not.toContain(revision);
    expect(markup.replace(/<[^>]*>/g, " ")).not.toMatch(/\bunknown\b/i);
    expect(markup).toContain("Review package and runtime requirements");
    expect(markup).toContain("Comfortable here");
    expect(item.model.revision).toBe(revision);
  });

  test("archives failed previews for review and restores resources when their URL changes", async () => {
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => root.render(<MarketplaceResults items={[templatePresentation, recipePresentation]} query={defaultQuery} onOpenItem={() => undefined} />));
      const templateImage = host.container.querySelector("img")!;
      const recipeVideo = host.container.querySelector("video");
      expect(recipeVideo).not.toBeNull();
      if (!recipeVideo) return;
      await act(async () => {
        templateImage.dispatchEvent(new Event("error"));
        recipeVideo.dispatchEvent(new Event("error"));
      });
      expect(host.container.querySelectorAll(".marketplace-creative-card")).toHaveLength(0);
      expect(host.container.querySelectorAll(".marketplace-effect-title")).toHaveLength(0);
      expect(host.container.textContent).toContain("2 archived");
      const archiveToggle = host.container.querySelector("input")!;
      Object.assign(archiveToggle, { type: "checkbox", checked: true });
      await act(async () => archiveToggle.dispatchEvent(new Event("click", { bubbles: true })));
      expect(host.container.textContent.match(/Preview unavailable/g)).toHaveLength(2);
      expect(host.container.textContent).toContain(templatePresentation.name);
      expect(host.container.textContent).toContain(recipePresentation.name);

      const replacement = {
        ...recipePresentation,
        recipe: {
          ...recipePresentation.recipe,
          recipe: {
            ...recipePresentation.recipe.recipe!,
            demo: { ...recipePresentation.recipe.recipe!.demo!, storageUrl: "https://ralphy.b-cdn.net/units/voxel-dither/replacement.png" },
          },
        },
      };
      await act(async () => root.render(<MarketplaceResults items={[replacement]} query={defaultQuery} onOpenItem={() => undefined} />));
      expect(host.container.querySelector("img")?.getAttribute("src")).toBe("https://ralphy.b-cdn.net/units/voxel-dither/replacement.png");
      expect(host.container.textContent).not.toContain("Preview unavailable");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("keeps healthy results during partial failure and exposes retry", () => {
    const snapshot = readySnapshot({
      sourceErrors: [{ source: "civitai", scope: "model-provider", message: "rate limited" }],
      sourceHealth: { publicLibrary: "ready", models: "partial" },
    });
    const markup = renderToStaticMarkup(<MarketplaceBrowse route={{ kind: "results" }} snapshot={snapshot} onOpenItem={() => undefined} onOpenCategory={() => undefined} onOpenLibrary={() => undefined} onRetry={() => undefined} onClearQuery={() => undefined} onClearFilters={() => undefined} />);

    expect(markup).toContain("Civitai is unavailable");
    expect(markup).toContain("rate limited");
    expect(markup).toContain("Some sources are unavailable");
    expect(markup).not.toContain('open=""');
    expect(markup).toContain("Retry sources");
    expect(markup).toContain("Alpha model");
  });

  test("renders a source-backed unavailable category instead of a generic empty result", () => {
    const snapshot = readySnapshot({
      items: [],
      query: { ...defaultQuery, filters: { ...defaultQuery.filters, category: "prompts" } },
    });
    const markup = renderToStaticMarkup(<MarketplaceBrowse route={{ kind: "category", category: "prompts" }} snapshot={snapshot} onOpenItem={() => undefined} onOpenCategory={() => undefined} onOpenLibrary={() => undefined} onRetry={() => undefined} onClearQuery={() => undefined} onClearFilters={() => undefined} />);

    expect(markup).toContain("Prompts catalog unavailable");
    expect(markup).toContain("Prompt catalog is unavailable in the current Desktop contract.");
    expect(markup).not.toContain("No results");
  });

  test("renders loading, retained refresh, cached, no-results, first-use, and total failure states", () => {
    const loading = renderToStaticMarkup(<MarketplaceBrowse route={{ kind: "discover" }} snapshot={{ status: "loading", query: defaultQuery }} onOpenItem={() => undefined} onOpenCategory={() => undefined} onOpenLibrary={() => undefined} onRetry={() => undefined} onClearQuery={() => undefined} onClearFilters={() => undefined} />);
    expect(loading).toContain("Loading creative library");
    expect(loading).toContain("aria-busy=\"true\"");

    const refreshing = renderToStaticMarkup(<MarketplaceBrowse route={{ kind: "results" }} snapshot={readySnapshot({ refreshing: true })} onOpenItem={() => undefined} onOpenCategory={() => undefined} onOpenLibrary={() => undefined} onRetry={() => undefined} onClearQuery={() => undefined} onClearFilters={() => undefined} />);
    expect(refreshing).toContain("Refreshing catalog");
    expect(refreshing).toContain("Alpha model");

    const cached = renderToStaticMarkup(<MarketplaceBrowse route={{ kind: "discover" }} snapshot={readySnapshot({ publicSource: { ...readySnapshot().publicSource!, source: "cache", warning: "Network unavailable" } })} onOpenItem={() => undefined} onOpenCategory={() => undefined} onOpenLibrary={() => undefined} onRetry={() => undefined} onClearQuery={() => undefined} onClearFilters={() => undefined} />);
    expect(cached).toContain("Offline · cached catalog");
    expect(cached).toContain("Network unavailable");
    expect(cached).toContain("Last refreshed");

    const filteredQuery = { ...defaultQuery, text: "missing", filters: { ...defaultQuery.filters, source: "ralphy" as const } };
    const noResults = renderToStaticMarkup(<MarketplaceBrowse route={{ kind: "results" }} snapshot={readySnapshot({ items: [], query: filteredQuery })} onOpenItem={() => undefined} onOpenCategory={() => undefined} onOpenLibrary={() => undefined} onRetry={() => undefined} onClearQuery={() => undefined} onClearFilters={() => undefined} />);
    expect(noResults).toContain("No results");
    expect(noResults).toContain("Clear filters");
    expect(noResults).toContain("Clear query");

    const firstUse = renderToStaticMarkup(<MarketplaceBrowse route={{ kind: "discover" }} snapshot={readySnapshot({ items: [], machine: { ...readySnapshot().machine!, installed: [] }, categories: readySnapshot().categories.map((category) => category.count.status === "ready" ? { ...category, count: { status: "ready", value: 0 } } : category) })} onOpenItem={() => undefined} onOpenCategory={() => undefined} onOpenLibrary={() => undefined} onRetry={() => undefined} onClearQuery={() => undefined} onClearFilters={() => undefined} />);
    expect(firstUse).toContain("No templates match this view");
    expect(firstUse).not.toContain("Continue where you left off");

    const failure = renderToStaticMarkup(<MarketplaceBrowse route={{ kind: "results" }} snapshot={{ status: "error", error: "Creative library sources are unavailable", sourceErrors: [{ source: "ralphy-public", scope: "public-library", message: "offline" }, { source: "models", scope: "model-catalog", message: "offline" }], sourceHealth: { publicLibrary: "unavailable", models: "unavailable" }, query: defaultQuery }} onOpenItem={() => undefined} onOpenCategory={() => undefined} onOpenLibrary={() => undefined} onRetry={() => undefined} onClearQuery={() => undefined} onClearFilters={() => undefined} />);
    expect(failure).toContain("Creative library sources are unavailable");
    expect(failure).toContain("Last known source metadata is unavailable");
    expect(failure).toContain("Retry sources");
    expect(failure).not.toContain("Results from healthy sources are still shown");
  });

  test("opens result buttons on Enter and Space without relying on a pointer", async () => {
    const onOpenItem = vi.fn();
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => root.render(<MarketplaceResults items={[modelPresentation]} query={defaultQuery} onOpenItem={onOpenItem} />));
      const button = host.container.querySelector(`[data-marketplace-item-key="${modelPresentation.key}"]`)!;
      for (const key of ["Enter", " "]) {
        const event = new Event("keydown", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "key", { value: key });
        await act(async () => button.dispatchEvent(event));
      }
      expect(onOpenItem.mock.calls).toEqual([[modelPresentation.key], [modelPresentation.key]]);
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("keeps simple DOM order through 100 items and virtualizes only larger result sets", () => {
    const items = Array.from({ length: 101 }, (_, index) => ({ ...modelPresentation, key: `model:huggingface:Acme/model-${index}`, name: `Model ${index}` }));
    const hundred = renderToStaticMarkup(<MarketplaceResults items={items.slice(0, 100)} query={defaultQuery} onOpenItem={() => undefined} />);
    const larger = renderToStaticMarkup(<MarketplaceResults items={items} query={defaultQuery} onOpenItem={() => undefined} />);

    expect(hundred.match(/data-marketplace-item-key=/g)).toHaveLength(100);
    expect(larger.match(/data-marketplace-item-key=/g)!.length).toBeGreaterThan(0);
    expect(larger.match(/data-marketplace-item-key=/g)!.length).toBeLessThan(100);
  });

  test("uses stable distinct DOM IDs for keys that share the same readable form", () => {
    const dotted = marketplaceItemDomId("recipe:a.b");
    const dashed = marketplaceItemDomId("recipe:a-b");
    expect(dotted).not.toBe(dashed);
    expect(dotted).toBe(marketplaceItemDomId("recipe:a.b"));
    expect(dotted.length).toBeLessThanOrEqual(256);
    expect(dashed.length).toBeLessThanOrEqual(256);
  });

  test("switches failed remote previews to a typed fallback and resets for a new URL", async () => {
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => root.render(<MarketplaceResults items={[modelPresentation]} query={defaultQuery} onOpenItem={() => undefined} />));
      const image = host.container.querySelector("img")!;
      await act(async () => image.dispatchEvent(new Event("error")));
      expect(host.container.textContent).toContain("GGUF");
      expect(host.container.querySelector("img")).toBeNull();

      const next = { ...modelPresentation, key: "model:huggingface:Acme/beta", model: { ...modelPresentation.model, id: "Acme/beta", previewUrl: "https://huggingface.co/Acme/beta/resolve/main/preview.png" } } as MarketplaceItemPresentation;
      await act(async () => root.render(<MarketplaceResults items={[next]} query={defaultQuery} onOpenItem={() => undefined} />));
      expect(host.container.querySelector("img")?.getAttribute("src")).toBe("https://huggingface.co/Acme/beta/resolve/main/preview.png");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("provides roving keyboard navigation across a virtualized result set", async () => {
    vi.useFakeTimers();
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const items = Array.from({ length: 140 }, (_, index) => ({ ...modelPresentation, key: `model:huggingface:Acme/key-${index}`, name: `Keyboard model ${index}` }));
    try {
      await act(async () => root.render(<div className="marketplace-scroll"><MarketplaceResults items={items} query={defaultQuery} onOpenItem={() => undefined} /></div>));
      const scroll = host.container.querySelector(".marketplace-scroll")!;
      scroll.scrollHeight = items.length * 112;
      const first = host.container.querySelector(`[data-marketplace-item-key="${items[0]!.key}"]`)!;
      expect(host.container.querySelectorAll(".marketplace-result").filter((item) => item.tabIndex === 0)).toHaveLength(1);
      first.focus();
      const end = new Event("keydown", { bubbles: true, cancelable: true });
      Object.defineProperty(end, "key", { value: "End" });
      await act(async () => { first.dispatchEvent(end); await vi.runAllTimersAsync(); });
      expect((document.activeElement as unknown as { getAttribute(name: string): string | null }).getAttribute("data-marketplace-item-key")).toBe(items[139]!.key);
      const focused = document.activeElement as unknown as { dispatchEvent(event: Event): boolean };
      const home = new Event("keydown", { bubbles: true, cancelable: true });
      Object.defineProperty(home, "key", { value: "Home" });
      await act(async () => { focused.dispatchEvent(home); await vi.runAllTimersAsync(); });
      expect((document.activeElement as unknown as { getAttribute(name: string): string | null }).getAttribute("data-marketplace-item-key")).toBe(items[0]!.key);
      const visibleItem = host.container.querySelector(".marketplace-results-list li")!;
      expect(visibleItem.getAttribute("aria-setsize")).toBe("140");
      expect(visibleItem.getAttribute("aria-posinset")).not.toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.restore();
      vi.useRealTimers();
    }
  });

  test("provides a tab stop when entering a virtualized list after a mid-list scroll", async () => {
    vi.useFakeTimers();
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const items = Array.from({ length: 140 }, (_, index) => ({ ...modelPresentation, key: `model:huggingface:Acme/entry-${index}`, name: `Entry model ${index}` }));
    try {
      await act(async () => root.render(<div className="marketplace-scroll"><button id="before-results" type="button">Before results</button><MarketplaceResults items={items} query={defaultQuery} onOpenItem={() => undefined} /></div>));
      const scroll = host.container.querySelector(".marketplace-scroll")!;
      scroll.scrollHeight = items.length * 112;
      await act(async () => { scroll.scrollTo({ top: 70 * 112 }); await vi.runAllTimersAsync(); });

      const firstRendered = host.container.querySelector(".marketplace-result")!;
      const adoptedKey = firstRendered.getAttribute("data-marketplace-item-key")!;
      expect(adoptedKey).not.toBe(items[0]!.key);
      expect(firstRendered.tabIndex).toBe(0);
      const before = host.container.querySelector("#before-results")!;
      before.focus();
      const tab = new Event("keydown", { bubbles: true, cancelable: true });
      Object.defineProperty(tab, "key", { value: "Tab" });
      await act(async () => before.dispatchEvent(tab));
      expect(document.activeElement).toBe(firstRendered);

      await act(async () => firstRendered.dispatchEvent(new Event("focusin", { bubbles: true })));
      await act(async () => { scroll.scrollTo({ top: 69 * 112 }); await vi.runAllTimersAsync(); });
      const adopted = host.container.querySelector(`[data-marketplace-item-key="${adoptedKey}"]`)!;
      expect(host.container.querySelector(".marketplace-result")!.getAttribute("data-marketplace-item-key")).not.toBe(adoptedKey);
      expect(adopted.tabIndex).toBe(0);
    } finally {
      await act(async () => root.unmount());
      host.restore();
      vi.useRealTimers();
    }
  });
});

describe("Marketplace header and navigation composition", () => {
  test("keeps category navigation and More aligned with detail route identity", async () => {
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const routes = [
      [{ kind: "detail", itemId: modelPresentation.key }, "Models"],
      [{ kind: "detail", itemId: templatePresentation.key }, "Templates"],
      [{ kind: "detail", itemId: recipePresentation.key }, "Effects"],
      [{ kind: "unavailable-detail", category: "prompts" }, "Prompts"],
      [{ kind: "unavailable-detail", category: "components" }, "Visuals"],
      [{ kind: "unavailable-detail", category: "skills" }, "Skills"],
      [{ kind: "collection" }, "More"],
    ] satisfies Array<[MarketplaceLocation["route"], string]>;
    try {
      for (const [route, label] of routes) {
        const location: MarketplaceLocation = {
          ...resultsLocation,
          route,
          query: route.kind === "collection"
            ? { ...resultsLocation.query, filters: { ...resultsLocation.query.filters, category: "models" } }
            : resultsLocation.query,
          selectedItemId: route.kind === "detail" ? route.itemId : null,
        };
        await act(async () => root.render(<MarketplaceScreenView catalog={null} location={location} sidebarVisible={false} snapshot={readySnapshot()} onBack={() => undefined} onNavigate={() => undefined} onRememberLocation={() => undefined} onRetry={() => undefined} />));
        const moreCategory = label === "Models" || label === "Skills";
        expect(host.container.querySelector(".marketplace-category-select .select-menu-value")?.textContent).toBe(moreCategory ? label : "More");
        const currentCategory = host.container.querySelectorAll("button").find((button) => button.getAttribute("aria-current") === "page");
        expect(currentCategory?.getAttribute("aria-label") ?? null).toBe(moreCategory || label === "More" ? null : label);
      }
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("returns from detail by clicking the current category or Templates", async () => {
    const navigate = vi.fn();
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const location: MarketplaceLocation = { ...resultsLocation, route: { kind: "detail", itemId: recipePresentation.key }, selectedItemId: recipePresentation.key, query: defaultQuery };
    try {
      await act(async () => root.render(<MarketplaceScreenView catalog={null} location={location} sidebarVisible snapshot={readySnapshot()} onBack={vi.fn()} onNavigate={navigate} onRememberLocation={vi.fn()} onRetry={vi.fn()} />));
      const effects = host.container.querySelectorAll("button").find((button) => button.getAttribute("aria-current") === "page")!;
      expect(effects.getAttribute("aria-label")).toBe("Effects");
      await act(async () => effects.dispatchEvent(new Event("click", { bubbles: true })));
      expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining({ route: { kind: "category", category: "recipes" }, selectedItemId: null }));
      const templates = host.container.querySelectorAll("button").find((button) => button.getAttribute("aria-label") === "Templates")!;
      await act(async () => templates.dispatchEvent(new Event("click", { bubbles: true })));
      expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining({ route: { kind: "category", category: "templates" }, selectedItemId: null }));
    } finally { await act(async () => root.unmount()); host.restore(); }
  });

  test("keeps one category selector and active chips while advanced filters start collapsed", () => {
    const query = {
      ...defaultQuery,
      text: "alpha",
      filters: { ...defaultQuery.filters, source: "huggingface" as const, license: "declared" as const },
      sort: "name" as const,
    };
    const markup = renderToStaticMarkup(<MarketplaceHeader title="Search results" query={query} selectedCategory={null} sidebarVisible={true} refreshing={false} workspaces={[{ id: "ws_a", name: "UX Testing Lab" }]} selectedWorkspaceId="ws_a" onSelectWorkspace={() => undefined} onQueryChange={() => undefined} onSearch={() => undefined} onOpenCategory={() => undefined} />);

    expect(markup).toContain("Search creative library");
    expect(markup.match(/aria-label="Library category"/g)).toHaveLength(1);
    expect(markup.match(/aria-label="More library categories"/g)).toHaveLength(1);
    expect([...markup.matchAll(/<button type="button" aria-label="([^"]+)" title=/g)].map((match) => match[1])).toEqual(["Templates", "Visuals", "Effects", "Sounds", "Prompts"]);
    expect(markup).not.toContain('aria-label="All"');
    expect(markup).not.toContain('role="radiogroup"');
    expect(markup).not.toContain('aria-label="Category"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('hidden=""');
    expect(markup).toContain("Filters (2)");
    expect(markup).toContain("Source");
    expect(markup).toContain("License");
    expect(markup).toContain("Compatibility");
    expect(markup).toContain("Name");
    expect(markup).toContain("Hugging Face");
    expect(markup).toContain("License declared");
  });

  test("exposes model-only modality and package format filters on the Models category", () => {
    const query = { ...defaultQuery, filters: { ...defaultQuery.filters, category: "models" as const } };
    const markup = renderToStaticMarkup(<MarketplaceHeader title="Models" query={query} selectedCategory="models" sidebarVisible={true} refreshing={false} workspaces={[{ id: "ws_a", name: "UX Testing Lab" }]} selectedWorkspaceId="ws_a" onSelectWorkspace={() => undefined} onQueryChange={() => undefined} onSearch={() => undefined} onOpenCategory={() => undefined} />);

    expect(markup).toContain("Modality");
    expect(markup).toContain("Format");
    expect(markup).toContain("All modalities");
    expect(markup).toContain("All formats");
    const templates = renderToStaticMarkup(<MarketplaceHeader title="Templates" query={{ ...defaultQuery, filters: { ...defaultQuery.filters, category: "templates" } }} selectedCategory="templates" sidebarVisible={false} refreshing={false} workspaces={[]} selectedWorkspaceId={null} onSelectWorkspace={vi.fn()} onQueryChange={vi.fn()} onSearch={vi.fn()} onOpenCategory={vi.fn()} />);
    expect(templates).not.toMatch(/aria-label="(?:License|Compatibility|Modality|Format|Source)"/);
  });

  test("clears an exact tag without leaving an invalid persisted filter", async () => {
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const change = vi.fn();
    const query = { ...defaultQuery, filters: { ...defaultQuery.filters, tag: "ffmpeg" } };
    try {
      await act(async () => root.render(<MarketplaceHeader title="Search results" query={query} selectedCategory="all" sidebarVisible refreshing={false} workspaces={[]} selectedWorkspaceId={null} onSelectWorkspace={vi.fn()} onQueryChange={change} onSearch={vi.fn()} onOpenCategory={vi.fn()} />));
      const clear = host.container.querySelectorAll("button").find((button) => button.getAttribute("aria-label") === "Remove filter: #ffmpeg")!;
      await act(async () => clear.dispatchEvent(new Event("click", { bubbles: true })));
      const cleared = change.mock.calls[0]![0] as MarketplaceQueryState;
      expect(cleared).toEqual(defaultQuery);
      expect(Object.hasOwn(cleared.filters, "tag")).toBe(false);
      expect(isMarketplaceLocation({ ...resultsLocation, query: cleared })).toBe(true);
    } finally { await act(async () => root.unmount()); host.restore(); }
  });

  test("records the result origin before navigating to a full detail route", async () => {
    const remember = vi.fn();
    const navigate = vi.fn();
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => root.render(<MarketplaceScreenView catalog={null} location={resultsLocation} sidebarVisible={true} snapshot={readySnapshot()} onBack={() => undefined} onNavigate={navigate} onRememberLocation={remember} onRetry={() => undefined} />));
      const button = host.container.querySelector(`[data-marketplace-item-key="${modelPresentation.key}"]`)!;
      await act(async () => button.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      expect(remember).toHaveBeenCalledWith({ focusId: marketplaceItemDomId(modelPresentation.key) });
      expect(navigate).toHaveBeenCalledWith({
        ...resultsLocation,
        route: { kind: "detail", itemId: modelPresentation.key },
        selectedItemId: modelPresentation.key,
        scrollTop: 0,
        focusId: "marketplace-heading",
      });
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("clears model-only facets when opening a non-model category", async () => {
    const navigate = vi.fn();
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const location: MarketplaceLocation = {
      ...resultsLocation,
      route: { kind: "discover" },
      query: { ...defaultQuery, sort: "updated", filters: { ...defaultQuery.filters, source: "huggingface", license: "declared", compatibility: "compatible", modality: "text", format: "gguf" } },
    };
    try {
      await act(async () => root.render(<MarketplaceScreenView catalog={null} location={location} sidebarVisible={true} snapshot={readySnapshot()} onBack={() => undefined} onNavigate={navigate} onRememberLocation={() => undefined} onRetry={() => undefined} />));
      const templates = host.container.querySelectorAll("button").find((button) => button.getAttribute("aria-label") === "Templates")!;
      await act(async () => templates.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })));
      expect(navigate).toHaveBeenCalledWith({
        ...location,
        route: { kind: "category", category: "templates" },
        query: { ...defaultQuery, filters: { ...defaultQuery.filters, category: "templates" } },
        selectedItemId: null,
        scrollTop: 0,
        focusId: "marketplace-heading",
      });
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("restores focus to the creative resource when returning to Discover", async () => {
    vi.useFakeTimers();
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const focusId = marketplaceItemDomId(templatePresentation.key);
    try {
      await act(async () => root.render(<MarketplaceScreenView catalog={null} location={{ ...resultsLocation, route: { kind: "discover" }, focusId }} sidebarVisible={false} snapshot={readySnapshot()} onBack={vi.fn()} onNavigate={vi.fn()} onRememberLocation={vi.fn()} onRetry={vi.fn()} onInstallAction={vi.fn()} />));
      await act(async () => { await vi.runAllTimersAsync(); });
      expect(document.activeElement?.getAttribute("id")).toBe(focusId);
    } finally { await act(async () => root.unmount()); host.restore(); vi.useRealTimers(); }
  });

  test("keeps the real Ollama inventory accessible on the installed My Library route", async () => {
    const navigate = vi.fn();
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const modelsLocation: MarketplaceLocation = { ...resultsLocation, route: { kind: "category", category: "models" }, query: { ...defaultQuery, filters: { ...defaultQuery.filters, category: "models" } } };
    try {
      await act(async () => root.render(<MarketplaceScreenView catalog={null} location={modelsLocation} sidebarVisible={true} snapshot={readySnapshot()} onBack={vi.fn()} onNavigate={navigate} onRememberLocation={vi.fn()} onRetry={vi.fn()} />));
      const installed = host.container.querySelectorAll("button").find((button) => button.textContent === "Installed models")!;
      expect(installed).not.toBeUndefined();
      await act(async () => installed.dispatchEvent(new Event("click", { bubbles: true })));
      const location = navigate.mock.calls[0]![0] as MarketplaceLocation;
      expect(location.route).toEqual({ kind: "library", section: "installed" });
      await act(async () => root.render(<MarketplaceScreenView catalog={null} location={location} sidebarVisible={true} snapshot={readySnapshot()} onBack={() => undefined} onNavigate={navigate} onRememberLocation={() => undefined} onRetry={() => undefined} />));
      expect(host.container.textContent).toContain("Installed on this Mac");
      expect(host.container.textContent).toContain("Llama 3.2");
      expect(host.container.textContent).toContain("Registered in Ollama");
      expect(host.container.textContent).not.toContain("Diffusion local");
      expect(navigate).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("restores an offscreen virtual result after returning from detail", async () => {
    vi.useFakeTimers();
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const items = Array.from({ length: 140 }, (_, index) => ({ ...modelPresentation, key: `model:huggingface:Acme/restore-${index}`, name: `Restore model ${index}` }));
    const target = items[120]!;
    const detail: MarketplaceLocation = { ...resultsLocation, route: { kind: "detail", itemId: target.key }, selectedItemId: target.key, scrollTop: 0, focusId: "marketplace-heading" };
    const returned: MarketplaceLocation = { ...resultsLocation, scrollTop: 120 * 112, focusId: marketplaceItemDomId(target.key) };
    try {
      await act(async () => root.render(<MarketplaceScreenView catalog={null} location={detail} sidebarVisible={true} snapshot={readySnapshot({ items })} onBack={() => undefined} onNavigate={() => undefined} onRememberLocation={() => undefined} onRetry={() => undefined} />));
      await act(async () => root.render(<MarketplaceScreenView catalog={null} location={returned} sidebarVisible={true} snapshot={readySnapshot({ items })} onBack={() => undefined} onNavigate={() => undefined} onRememberLocation={() => undefined} onRetry={() => undefined} />));
      await act(async () => vi.runAllTimersAsync());
      expect((document.activeElement as unknown as { getAttribute(name: string): string | null }).getAttribute("data-marketplace-item-key")).toBe(target.key);
      expect((host.container.querySelector(".marketplace-scroll") as unknown as { scrollTop: number }).scrollTop).toBe(returned.scrollTop);
    } finally {
      await act(async () => root.unmount());
      host.restore();
      vi.useRealTimers();
    }
  });

  test("restores the exact colliding-readable-key result rather than its sibling", async () => {
    vi.useFakeTimers();
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const dotted = { ...recipePresentation, key: "recipe:a.b", name: "Dotted recipe" };
    const dashed = { ...recipePresentation, key: "recipe:a-b", name: "Dashed recipe" };
    const location: MarketplaceLocation = { ...resultsLocation, focusId: marketplaceItemDomId(dotted.key) };
    try {
      await act(async () => root.render(<MarketplaceScreenView catalog={null} location={location} sidebarVisible={true} snapshot={readySnapshot({ items: [dashed, dotted] })} onBack={() => undefined} onNavigate={() => undefined} onRememberLocation={() => undefined} onRetry={() => undefined} />));
      await act(async () => vi.runAllTimersAsync());
      expect((document.activeElement as unknown as { getAttribute(name: string): string | null }).getAttribute("data-marketplace-item-key")).toBe(dotted.key);
    } finally {
      await act(async () => root.unmount());
      host.restore();
      vi.useRealTimers();
    }
  });

  test("restores an item origin when a loading snapshot becomes ready", async () => {
    vi.useFakeTimers();
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const location: MarketplaceLocation = { ...resultsLocation, scrollTop: 0, focusId: marketplaceItemDomId(modelPresentation.key) };
    try {
      await act(async () => root.render(<MarketplaceScreenView catalog={null} location={location} sidebarVisible={true} snapshot={{ status: "loading", query: defaultQuery }} onBack={() => undefined} onNavigate={() => undefined} onRememberLocation={() => undefined} onRetry={() => undefined} />));
      await act(async () => vi.runAllTimersAsync());
      expect(document.activeElement).not.toBe(host.container.querySelector("#marketplace-heading"));

      await act(async () => root.render(<MarketplaceScreenView catalog={null} location={location} sidebarVisible={true} snapshot={readySnapshot()} onBack={() => undefined} onNavigate={() => undefined} onRememberLocation={() => undefined} onRetry={() => undefined} />));
      await act(async () => vi.runAllTimersAsync());
      expect((document.activeElement as unknown as { getAttribute(name: string): string | null }).getAttribute("data-marketplace-item-key")).toBe(modelPresentation.key);
    } finally {
      await act(async () => root.unmount());
      host.restore();
      vi.useRealTimers();
    }
  });

  test("restores a moved virtual origin when loading becomes ready at a stale saved scroll", async () => {
    vi.useFakeTimers();
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const target = { ...modelPresentation, key: "model:huggingface:Acme/moved-origin", name: "Moved origin" };
    const items = Array.from({ length: 140 }, (_, index) => index === 120
      ? target
      : { ...modelPresentation, key: `model:huggingface:Acme/moved-${index}`, name: `Moved model ${index}` });
    const location: MarketplaceLocation = { ...resultsLocation, scrollTop: 0, focusId: marketplaceItemDomId(target.key) };
    try {
      await act(async () => root.render(<MarketplaceScreenView catalog={null} location={location} sidebarVisible={true} snapshot={{ status: "loading", query: defaultQuery }} onBack={() => undefined} onNavigate={() => undefined} onRememberLocation={() => undefined} onRetry={() => undefined} />));
      const scroll = host.container.querySelector(".marketplace-scroll")!;
      scroll.scrollHeight = items.length * 112;
      await act(async () => vi.advanceTimersByTimeAsync(20));

      await act(async () => root.render(<MarketplaceScreenView catalog={null} location={location} sidebarVisible={true} snapshot={readySnapshot({ items })} onBack={() => undefined} onNavigate={() => undefined} onRememberLocation={() => undefined} onRetry={() => undefined} />));
      await act(async () => vi.advanceTimersByTimeAsync(500));
      expect((document.activeElement as unknown as { getAttribute(name: string): string | null } | null)?.getAttribute("data-marketplace-item-key")).toBe(target.key);
      expect(scroll.scrollTop).toBeGreaterThan(0);
    } finally {
      await act(async () => root.unmount());
      host.restore();
      vi.useRealTimers();
    }
  });

  test("falls back to the Marketplace heading when a ready result set no longer contains the origin", async () => {
    vi.useFakeTimers();
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const location: MarketplaceLocation = { ...resultsLocation, scrollTop: 0, focusId: marketplaceItemDomId("model:huggingface:Acme/removed") };
    try {
      await act(async () => root.render(<MarketplaceScreenView catalog={null} location={location} sidebarVisible={true} snapshot={readySnapshot({ items: [modelPresentation] })} onBack={() => undefined} onNavigate={() => undefined} onRememberLocation={() => undefined} onRetry={() => undefined} />));
      await act(async () => vi.runAllTimersAsync());
      expect(document.activeElement).toBe(host.container.querySelector("#marketplace-heading"));
    } finally {
      await act(async () => root.unmount());
      host.restore();
      vi.useRealTimers();
    }
  });

  test("does not steal focus when a restored origin disappears after the user moves on", async () => {
    vi.useFakeTimers();
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const location: MarketplaceLocation = { ...resultsLocation, scrollTop: 0, focusId: marketplaceItemDomId(modelPresentation.key) };
    try {
      await act(async () => root.render(<MarketplaceScreenView catalog={null} location={location} sidebarVisible={true} snapshot={readySnapshot()} onBack={() => undefined} onNavigate={() => undefined} onRememberLocation={() => undefined} onRetry={() => undefined} />));
      await act(async () => vi.runAllTimersAsync());
      const search = host.container.querySelector("input")!;
      search.focus();

      await act(async () => root.render(<MarketplaceScreenView catalog={null} location={location} sidebarVisible={true} snapshot={readySnapshot({ items: [templatePresentation] })} onBack={() => undefined} onNavigate={() => undefined} onRememberLocation={() => undefined} onRetry={() => undefined} />));
      await act(async () => vi.runAllTimersAsync());
      expect(document.activeElement).toBe(search);
    } finally {
      await act(async () => root.unmount());
      host.restore();
      vi.useRealTimers();
    }
  });
});
