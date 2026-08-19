import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import type {
  LocalModelCatalog,
  LocalModelDetail,
  LocalModelMachine,
  LocalModelSummary,
} from "../electron/media/types";
import { bridge } from "../src/lib/ipc";
import { LocalModelsScreen } from "../src/screens/LocalModelsScreen";
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
    id: "mistral:7b",
    name: "Mistral 7B",
    runtime: "ollama",
    digest: "sha256:123",
    bytes: 4.1 * 1024 ** 3,
    format: "GGUF Q4_K_M",
    updatedAt: "2026-08-15T10:00:00Z",
  }],
};

const model: LocalModelSummary = {
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
  previewUrl: null,
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
};

const catalog: LocalModelCatalog = {
  items: [model],
  machine,
  refreshedAt: "2026-08-19T00:00:00Z",
  errors: [],
};

const detail: LocalModelDetail = {
  ...model,
  readme: "# Model card\n\nSafe text\n\n<style>.huge { color: red; }</style><div>Benchmark Results</div><script>alert('no')</script>",
  previewUrls: [],
  files: [
    { name: "q5_k_m.gguf", bytes: 10.5 * 1024 ** 3, format: "GGUF", recommended: true, warning: null },
    { name: "legacy.bin", bytes: 14 * 1024 ** 3, format: "Pickle", recommended: false, warning: "Executable checkpoint format" },
  ],
};

afterEach(() => vi.restoreAllMocks());

function button(container: HostNode, label: string): HostNode {
  const match = container.querySelectorAll("button").find((node) => node.textContent.includes(label));
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

describe("local models screen", () => {
  test("shows live catalogue compatibility, detail markdown, and installed inventory", async () => {
    const search = vi.spyOn(bridge, "searchLocalModels").mockResolvedValue(catalog);
    const loadDetail = vi.spyOn(bridge, "loadLocalModelDetail").mockResolvedValue(detail);
    vi.spyOn(bridge, "refreshLocalModelMachine").mockResolvedValue(machine);
    const host = createReactHost();
    const document = host.container.ownerDocument;
    const root = createRoot(host.container as unknown as Element);

    try {
      await act(async () => {
        root.render(<LocalModelsScreen />);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(search).toHaveBeenCalled();
      expect(document.activeElement).toBe(host.container.querySelector("input"));
      expect(host.container.textContent).toContain("Qwen2.5 Coder 14B Instruct");
      expect(host.container.textContent).toContain("Comfortable here");
      expect(host.container.textContent).toContain("Estimated peak memory 12.6 GB of 36 GB");
      expect(host.container.textContent).toContain("Apple M3 Max");
      expect(host.container.querySelector(".local-model-row .local-model-plate img")?.getAttribute("src"))
        .toContain("qwen-color.svg");
      expect(host.container.querySelector("[aria-label='Provider']")).not.toBeNull();
      expect(host.container.querySelector("[aria-label='Modality']")).not.toBeNull();
      expect(host.container.textContent).toContain("TRENDING");

      await act(async () => {
        button(host.container, "Re-check").dispatchEvent(new Event("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(search).toHaveBeenCalledTimes(2);

      await act(async () => {
        host.container.querySelector(".local-model-row")!.dispatchEvent(new Event("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(loadDetail).toHaveBeenCalledWith({ provider: "huggingface", id: model.id });
      expect(document.body.textContent).toContain("Model card");
      expect(document.body.textContent).toContain("Benchmark Results");
      expect(document.body.textContent).not.toContain(".huge");
      expect(document.body.textContent).not.toContain("alert('no')");
      expect(document.body.textContent).toContain("Executable checkpoint format");
      expect(document.body.querySelector("script")).toBeNull();

      const escape = new Event("keydown") as Event & { key: string };
      escape.key = "Escape";
      await act(async () => document.dispatchEvent(escape));
      expect(document.body.querySelector("[role='dialog']")).toBeNull();

      await act(async () => button(host.container, "Installed").dispatchEvent(new Event("click", { bubbles: true })));
      expect(host.container.textContent).toContain("Qwen2.5 Coder 14B");
      expect(host.container.textContent).toContain("sha256:9c1f4ab");
      expect(host.container.textContent).toContain("Registered in Ollama");

    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("surfaces partial provider failures with a retry instead of an empty-search lie", async () => {
    vi.spyOn(bridge, "searchLocalModels").mockResolvedValue({
      ...catalog,
      items: [],
      errors: [{ provider: "civitai", message: "Civitai returned 503" }],
    });
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => {
        root.render(<LocalModelsScreen />);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(host.container.textContent).toContain("Civitai returned 503");
      expect(button(host.container, "Retry")).not.toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });
});
