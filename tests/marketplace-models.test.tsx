import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import type {
  LocalModelDetail,
  LocalModelMachine,
  LocalModelReference,
} from "../electron/media/types";
import { bridge } from "@/shared/api/ipc";
import { MarketplaceScreenView } from "@/pages/marketplace/ui/MarketplaceScreen";
import {
  MarketplaceInstalledModels,
  MarketplaceModelDetail,
} from "@/pages/marketplace/ui/MarketplaceModelViews";
import { marketplaceItemDomId } from "@/pages/marketplace/ui/MarketplaceBrowse";
import type {
  MarketplaceItemPresentation,
  MarketplaceSnapshot,
} from "@/pages/marketplace/lib/presentation";
import type {
  MarketplaceLocation,
  MarketplaceNavigationState,
  MarketplaceQueryState,
} from "@/pages/marketplace/model/navigation";
import { marketplaceReducer } from "@/pages/marketplace/model/navigation";
import { createReactHost, type HostNode } from "./react-host";

const machine: LocalModelMachine = {
  platform: "macOS",
  architecture: "arm64",
  cpu: "Apple M3 Max",
  totalMemoryBytes: 36 * 1024 ** 3,
  freeDiskBytes: 214 * 1024 ** 3,
  runtimes: [
    { id: "ollama", label: "Ollama 0.6.2", available: true, detail: "Detected" },
    { id: "diffusers", label: "Diffusers", available: false, detail: "Not detected" },
  ],
  installed: [{
    id: "qwen2.5-coder:14b",
    name: "Qwen2.5 Coder 14B",
    runtime: "ollama",
    digest: "sha256:9c1f4ab",
    bytes: 10.5 * 1024 ** 3,
    format: "GGUF Q5_K_M",
    updatedAt: "2026-08-16T10:00:00Z",
  }, {
    id: "diffusion-local",
    name: "Diffusion local",
    runtime: "diffusers",
    digest: "sha256:diffusion",
    bytes: 4.1 * 1024 ** 3,
    format: "Safetensors",
    updatedAt: null,
  }],
};

const modelA: LocalModelDetail = {
  provider: "huggingface",
  id: "Qwen/Qwen2.5-Coder-14B-Instruct",
  name: "Qwen2.5 Coder 14B Instruct",
  author: "Qwen",
  task: "text-generation",
  modality: "text",
  modelType: "base",
  baseModel: "Qwen2.5",
  license: "apache-2.0",
  gated: false,
  revision: "9c1f4ab",
  lastModified: "2026-08-16T10:00:00Z",
  downloads: 1_280_000,
  likes: 4_200,
  tags: ["text-generation", "gguf"],
  iconUrl: null,
  previewUrl: "https://huggingface.co/Qwen/Qwen2.5-Coder-14B-Instruct/resolve/main/preview.png",
  providerUrl: "https://huggingface.co/Qwen/Qwen2.5-Coder-14B-Instruct",
  recommendedPackage: { format: "GGUF Q5_K_M", bytes: 10.5 * 1024 ** 3, files: ["q5_k_m.gguf"] },
  comfort: {
    level: "comfortable",
    label: "Comfortable here",
    score: 4,
    runtime: "ollama",
    estimatedMemoryBytes: 12.6 * 1024 ** 3,
    evidence: [
      "Estimated peak memory 12.6 GB of 36 GB",
      "214 GB free · 10.5 GB package",
      "Ollama 0.6.2 detected",
    ],
  },
  state: "remote",
  permissions: [],
  readme: "# Model card\n\nSafe provider text.",
  previewUrls: ["https://huggingface.co/Qwen/Qwen2.5-Coder-14B-Instruct/resolve/main/preview.png"],
  files: [
    { name: "q5_k_m.gguf", bytes: 10.5 * 1024 ** 3, format: "GGUF", recommended: true, warning: null },
    { name: "legacy.bin", bytes: 14 * 1024 ** 3, format: "Pickle", recommended: false, warning: "Executable checkpoint format" },
  ],
};

const modelB: LocalModelDetail = {
  ...modelA,
  provider: "civitai",
  id: "1234",
  name: "Civitai Motion Adapter",
  author: "Motion Lab",
  task: "image-to-video",
  modality: "video",
  modelType: "lora",
  baseModel: "Wan Video 2.2",
  license: null,
  gated: false,
  revision: "version-77",
  downloads: 98_765,
  likes: 432,
  providerUrl: "https://civitai.com/models/1234",
  recommendedPackage: { format: "Safetensors", bytes: 2 * 1024 ** 3, files: ["adapter.safetensors"] },
  comfort: {
    level: "usable",
    label: "Likely compatible",
    score: 3,
    runtime: "diffusers",
    estimatedMemoryBytes: 8 * 1024 ** 3,
    evidence: ["Package and memory estimate fit", "Diffusers detected"],
  },
  permissions: ["Credit required", "Commercial use is image-only"],
  previewUrls: [],
  files: [{ name: "adapter.safetensors", bytes: 2 * 1024 ** 3, format: "Safetensors", recommended: true, warning: null }],
};

const defaultQuery: MarketplaceQueryState = {
  text: "",
  filters: {
    category: "models",
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
  key: `model:${modelA.provider}:${modelA.id}`,
  category: "models",
  name: modelA.name,
  summary: modelA.task,
  sourceLabel: "Hugging Face",
  version: { status: "ready", value: modelA.revision! },
  updatedAt: { status: "ready", value: modelA.lastModified! },
  license: { status: "ready", value: modelA.license! },
  publisherIdentity: { status: "unavailable", reason: "Publisher verification is unavailable." },
  contentAudit: { status: "unavailable", reason: "Content audit is unavailable." },
  compatibility: { status: "ready", value: modelA.comfort.label },
  model: {
    provider: modelA.provider,
    id: modelA.id,
    name: modelA.name,
    author: modelA.author,
    task: modelA.task,
    modality: modelA.modality,
    modelType: modelA.modelType,
    baseModel: modelA.baseModel,
    license: modelA.license,
    gated: modelA.gated,
    revision: modelA.revision,
    lastModified: modelA.lastModified,
    tags: [...modelA.tags],
    iconUrl: modelA.iconUrl,
    previewUrl: modelA.previewUrl,
    providerUrl: modelA.providerUrl,
    recommendedPackage: { ...modelA.recommendedPackage, files: [...modelA.recommendedPackage.files] },
    comfort: { ...modelA.comfort, evidence: [...modelA.comfort.evidence] },
    state: modelA.state,
    permissions: [...modelA.permissions],
  },
};

function snapshot(): Extract<MarketplaceSnapshot, { status: "ready" }> {
  return {
    status: "ready",
    items: [modelPresentation],
    categories: [
      { category: "models", label: "Models", purpose: "Model packages from current providers.", count: { status: "ready", value: 1 }, catalog: "ready" },
      ...(["templates", "recipes", "prompts", "components", "skills"] as const).map((category) => ({
        category,
        label: category,
        purpose: `${category} unavailable`,
        count: { status: "unavailable" as const, reason: `${category} unavailable` },
        catalog: "unavailable" as const,
      })),
    ],
    machine,
    publicSource: null,
    sourceErrors: [],
    sourceHealth: { publicLibrary: "unavailable", models: "ready" },
    refreshing: false,
    query: defaultQuery,
  };
}

function reference(model: LocalModelDetail): LocalModelReference {
  return { provider: model.provider, id: model.id };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((next, fail) => { resolve = next; reject = fail; });
  return { promise, resolve, reject };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function button(container: HostNode, label: string): HostNode {
  const match = container.querySelectorAll("button").find((node) => node.textContent.includes(label));
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

afterEach(() => vi.restoreAllMocks());

describe("Marketplace model routes", () => {
  test("renders a full truthful model detail and delegates only provider and Back actions", async () => {
    vi.spyOn(bridge, "loadLocalModelDetail").mockResolvedValue(modelA);
    const openProvider = vi.spyOn(bridge, "openLocalModelProvider").mockResolvedValue();
    const onBack = vi.fn();
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MarketplaceModelDetail reference={reference(modelA)} onBack={onBack} />); await settle(); });
      const text = host.container.textContent;
      for (const section of [
        "Compatibility", "What it gives you", "Use when", "Do not use when",
        "Versions and files", "License and access", "Local installation",
        "Used by Ralphy", "Works with", "Used by",
      ]) expect(text).toContain(section);
      expect(text).toContain("Comfortable here");
      expect(text).toContain("Ollama 0.6.2 detected");
      expect(text).toContain("Executable checkpoint format");
      expect(text).toContain("Download and installation are unavailable in the current Desktop contract");
      expect(text).not.toMatch(/downloads|likes|trending|1,?280,?000|4,?200/i);

      const preview = host.container.querySelector(".marketplace-model-preview img")!;
      await act(async () => preview.dispatchEvent(new Event("error")));
      expect(host.container.textContent).toContain("Provider preview unavailable");

      await act(async () => { button(host.container, "Open on Hugging Face").dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect(openProvider).toHaveBeenCalledWith(modelA.providerUrl);
      await act(async () => button(host.container, "Back to Models").dispatchEvent(new Event("click", { bubbles: true })));
      expect(onBack).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("keeps gated access, Civitai permissions, missing runtime, and incompatible evidence exact", async () => {
    const unknown = {
      ...modelA,
      id: "Qwen/unknown-runtime",
      name: "Unknown runtime model",
      comfort: { ...modelA.comfort, level: "unknown" as const, label: "Compatibility unknown", score: 0 as const, evidence: ["MLX not detected"] },
    };
    const incompatible = {
      ...modelA,
      id: "Qwen/too-large",
      name: "Too large model",
      comfort: { ...modelA.comfort, level: "incompatible" as const, label: "Incompatible here", score: 0 as const, evidence: ["Package exceeds free disk space"] },
    };
    const gated = { ...modelA, id: "Qwen/gated-model", name: "Gated model", gated: true, state: "gated" as const };
    const details = new Map([modelB, unknown, incompatible, gated].map((item) => [item.id, item]));
    vi.spyOn(bridge, "loadLocalModelDetail").mockImplementation(async ({ id }) => details.get(id)!);
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      for (const [item, expected] of [
        [modelB, ["Likely compatible", "Credit required", "Commercial use is image-only", "License not declared"]],
        [unknown, ["Compatibility unknown", "MLX not detected"]],
        [incompatible, ["Incompatible here", "Package exceeds free disk space"]],
        [gated, ["Gated model", "Provider access is required"]],
      ] as const) {
        await act(async () => { root.render(<MarketplaceModelDetail reference={reference(item)} onBack={() => undefined} />); await settle(); });
        for (const value of expected) expect(host.container.textContent).toContain(value);
        expect(host.container.textContent).not.toMatch(/downloads|likes|trending/i);
      }
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("shows provider failure without inventing detail state", async () => {
    vi.spyOn(bridge, "loadLocalModelDetail").mockRejectedValue(new Error("Hugging Face rate limited the detail request"));
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MarketplaceModelDetail reference={reference(modelA)} onBack={() => undefined} />); await settle(); });
      expect(host.container.querySelector("[role='alert']")?.textContent).toContain("Hugging Face rate limited the detail request");
      expect(host.container.textContent).not.toContain(modelA.name);
      expect(button(host.container, "Back to Models")).not.toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("clears a provider action error when a different model starts loading", async () => {
    vi.spyOn(bridge, "loadLocalModelDetail").mockImplementation(async ({ id }) => id === modelA.id ? modelA : modelB);
    vi.spyOn(bridge, "openLocalModelProvider").mockRejectedValue(new Error("provider unavailable"));
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MarketplaceModelDetail reference={reference(modelA)} onBack={() => undefined} />); await settle(); });
      await act(async () => { button(host.container, "Open on Hugging Face").dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect(host.container.querySelector("[role='alert']")?.textContent).toBe("The provider page could not be opened.");

      await act(async () => { root.render(<MarketplaceModelDetail reference={reference(modelB)} onBack={() => undefined} />); await settle(); });
      expect(host.container.textContent).toContain(modelB.name);
      expect(host.container.querySelector("[role='alert']")).toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("suppresses a late provider action error after the model reference changes", async () => {
    const pendingOpen = deferred<void>();
    vi.spyOn(bridge, "loadLocalModelDetail").mockImplementation(async ({ id }) => id === modelA.id ? modelA : modelB);
    vi.spyOn(bridge, "openLocalModelProvider").mockReturnValue(pendingOpen.promise);
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MarketplaceModelDetail reference={reference(modelA)} onBack={() => undefined} />); await settle(); });
      await act(async () => { button(host.container, "Open on Hugging Face").dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      await act(async () => { root.render(<MarketplaceModelDetail reference={reference(modelB)} onBack={() => undefined} />); await settle(); });
      await act(async () => { pendingOpen.reject(new Error("late provider failure")); await settle(); });
      expect(host.container.textContent).toContain(modelB.name);
      expect(host.container.querySelector("[role='alert']")).toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("suppresses an A result that resolves after the active B result", async () => {
    const a = deferred<LocalModelDetail>();
    const b = deferred<LocalModelDetail>();
    vi.spyOn(bridge, "loadLocalModelDetail").mockImplementation(({ id }) => id === modelA.id ? a.promise : b.promise);
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MarketplaceModelDetail reference={reference(modelA)} onBack={() => undefined} />); await settle(); });
      await act(async () => { root.render(<MarketplaceModelDetail reference={reference(modelB)} onBack={() => undefined} />); await settle(); });
      await act(async () => { b.resolve(modelB); await settle(); });
      await act(async () => { a.resolve(modelA); await settle(); });
      expect(host.container.textContent).toContain(modelB.name);
      expect(host.container.textContent).not.toContain(modelA.name);
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("suppresses late resolve/reject effects after unmount and Back during load", async () => {
    const a = deferred<LocalModelDetail>();
    const b = deferred<LocalModelDetail>();
    vi.spyOn(bridge, "loadLocalModelDetail").mockImplementation(({ id }) => id === modelA.id ? a.promise : b.promise);
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    function Route({ refValue }: { refValue: LocalModelReference }) {
      const [open, setOpen] = useState(true);
      return open
        ? <MarketplaceModelDetail reference={refValue} onBack={() => setOpen(false)} />
        : <button id="model-origin" type="button">Model origin</button>;
    }
    try {
      await act(async () => { root.render(<Route refValue={reference(modelA)} />); await settle(); });
      await act(async () => button(host.container, "Back to Models").dispatchEvent(new Event("click", { bubbles: true })));
      const origin = host.container.querySelector("#model-origin")!;
      origin.focus();
      await act(async () => { a.resolve(modelA); await settle(); });
      expect(document.activeElement).toBe(origin);
      expect(host.container.textContent).not.toContain(modelA.name);

      await act(async () => { root.render(<MarketplaceModelDetail reference={reference(modelB)} onBack={() => undefined} />); await settle(); });
      await act(async () => root.unmount());
      await act(async () => { b.reject(new Error("late provider failure")); await settle(); });
    } finally {
      host.restore();
    }
  });

  test("hands off only real Ollama inventory and refreshes through the existing bridge", async () => {
    const refreshed = {
      ...machine,
      installed: [...machine.installed!, {
        id: "llama3.2:latest", name: "Llama 3.2", runtime: "ollama" as const,
        digest: "sha256:new", bytes: 2 * 1024 ** 3, format: "GGUF", updatedAt: "2026-08-20T10:00:00Z",
      }],
    };
    const refresh = vi.spyOn(bridge, "refreshLocalModelMachine").mockResolvedValue(refreshed);
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => root.render(<MarketplaceInstalledModels machine={machine} />));
      expect(host.container.textContent).toContain("Installed on this Mac");
      expect(host.container.textContent).toContain("Qwen2.5 Coder 14B");
      expect(host.container.textContent).toContain("Registered in Ollama");
      expect(host.container.textContent).not.toContain("Diffusion local");
      expect(host.container.textContent).toContain("Load health is unavailable");
      await act(async () => { button(host.container, "Re-check this Mac").dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect(refresh).toHaveBeenCalledOnce();
      expect(host.container.textContent).toContain("Llama 3.2");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("opens the Task 8 download review while keeping the final action focusable and inert", async () => {
    vi.spyOn(bridge, "loadLocalModelDetail").mockResolvedValue(modelA);
    const openProvider = vi.spyOn(bridge, "openLocalModelProvider").mockResolvedValue();
    const onBack = vi.fn();
    const navigate = vi.fn();
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const detailLocation: MarketplaceLocation = {
      route: { kind: "detail", itemId: modelPresentation.key },
      query: defaultQuery,
      selectedItemId: modelPresentation.key,
      scrollTop: 0,
      focusId: "marketplace-heading",
    };
    try {
      await act(async () => { root.render(<MarketplaceScreenView catalog={null} location={detailLocation} sidebarVisible snapshot={snapshot()} onBack={onBack} onNavigate={navigate} onRememberLocation={() => undefined} onRetry={() => undefined} />); await settle(); });
      const review = button(host.container, "Review download");
      expect(review.disabled).toBe(false);
      expect(review.getAttribute("aria-disabled")).toBeNull();
      review.focus();
      expect(document.activeElement).toBe(review);
      await act(async () => { review.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      const dialog = (document.body as unknown as HostNode).querySelector("[role=dialog]")!;
      expect(dialog.textContent).toContain("Compatibility preflight");
      expect(dialog.textContent).toContain("Computer and runtime targets cannot be enumerated");
      const final = button(dialog, "Download unavailable");
      expect(final.disabled).toBe(false);
      expect(final.getAttribute("aria-disabled")).toBe("true");
      await act(async () => { final.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect(openProvider).not.toHaveBeenCalled();
      expect(onBack).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("uses Marketplace history Back to restore the exact results origin", async () => {
    vi.useFakeTimers();
    vi.spyOn(bridge, "loadLocalModelDetail").mockResolvedValue(modelA);
    const navigate = vi.fn();
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const origin: MarketplaceLocation = {
      route: { kind: "results" },
      query: { ...defaultQuery, text: "qwen", sort: "name" },
      selectedItemId: null,
      scrollTop: 438,
      focusId: marketplaceItemDomId(modelPresentation.key),
    };
    const detailLocation: MarketplaceLocation = {
      route: { kind: "detail", itemId: modelPresentation.key },
      query: origin.query,
      selectedItemId: modelPresentation.key,
      scrollTop: 0,
      focusId: "marketplace-heading",
    };
    let navigation: MarketplaceNavigationState = {
      mode: "marketplace",
      sidebarVisible: true,
      location: detailLocation,
      history: [origin, detailLocation],
      historyIndex: 1,
      workReturnFocusId: "workspace-heading",
    };
    const render = () => root.render(<MarketplaceScreenView
      catalog={null}
      location={navigation.location}
      sidebarVisible
      snapshot={snapshot()}
      onBack={() => {
        navigation = marketplaceReducer(navigation, { type: "back" });
        render();
      }}
      onNavigate={navigate}
      onRememberLocation={() => undefined}
      onRetry={() => undefined}
    />);
    try {
      await act(async () => { render(); await settle(); });
      expect(host.container.textContent).toContain(modelA.name);
      expect(host.container.querySelector(".marketplace-model-detail")).not.toBeNull();
      await act(async () => { button(host.container, "Back to Models").dispatchEvent(new Event("click", { bubbles: true })); await vi.runAllTimersAsync(); });
      expect(navigate).not.toHaveBeenCalled();
      expect(navigation.historyIndex).toBe(0);
      expect(navigation.location).toEqual(origin);
      expect((host.container.querySelector(".marketplace-scroll") as unknown as { scrollTop: number }).scrollTop).toBe(438);
      expect((document.activeElement as unknown as { getAttribute(name: string): string | null }).getAttribute("data-marketplace-item-key")).toBe(modelPresentation.key);
    } finally {
      await act(async () => root.unmount());
      host.restore();
      vi.useRealTimers();
    }
  });
});
