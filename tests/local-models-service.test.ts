import { describe, expect, test, vi } from "vitest";
import type { LocalModelDetail } from "../electron/media/types";
import {
  assessModelComfort,
  loadLocalModelDetail,
  normalizeCivitaiModel,
  normalizeHuggingFaceModel,
  safeProviderMediaUrl,
  searchLocalModels,
} from "../electron/local-models";
import { projectMarketplaceModelDetail } from "../src/screens/marketplace/presentation";

const GB = 1024 ** 3;
const machine = {
  platform: "macOS 15.4",
  architecture: "arm64",
  cpu: "Apple M3 Max",
  totalMemoryBytes: 36 * GB,
  freeDiskBytes: 214 * GB,
  runtimes: [
    { id: "ollama", label: "Ollama 0.6.2", available: true, detail: "Detected" },
    { id: "diffusers", label: "Diffusers", available: true, detail: "Detected" },
    { id: "transformers", label: "Transformers", available: true, detail: "Detected" },
    { id: "mlx", label: "MLX", available: false, detail: "Not detected" },
  ],
} as const;

function responseAt(url: string, body: BodyInit | null, init: ResponseInit = {}): Response {
  const response = new Response(body, init);
  Object.defineProperty(response, "url", { value: url });
  return response;
}

const huggingFaceRaw = (id = "org/model") => ({
  id,
  author: id.split("/")[0],
  sha: "abc1234",
  pipeline_tag: "text-generation",
  tags: ["gguf"],
  siblings: [{ rfilename: "model-q4_k_m.gguf", size: 2 * GB }],
});

describe("Local Models provider normalization", () => {
  test("turns Hugging Face file metadata into a comfortable evidence-based package", () => {
    const model = normalizeHuggingFaceModel({
      id: "Qwen/Qwen2.5-Coder-14B-Instruct-GGUF",
      author: "Qwen",
      sha: "d0a692ef765eefbf2fabb130b3cb2e8917e3d225",
      pipeline_tag: "text-generation",
      tags: ["gguf", "license:apache-2.0"],
      downloads: 83_624,
      likes: 188,
      gated: false,
      siblings: [
        { rfilename: "qwen2.5-coder-14b-instruct-q5_k_m.gguf", size: 10.5 * GB },
        { rfilename: "qwen2.5-coder-14b-instruct-q4_k_m.gguf", size: 8.99 * GB },
      ],
      cardData: { license: "apache-2.0", base_model: "Qwen/Qwen2.5-Coder-14B-Instruct" },
      lastModified: "2026-07-30T00:00:00.000Z",
    }, machine);

    expect(model.recommendedPackage).toMatchObject({ format: "GGUF Q5_K_M", bytes: 10.5 * GB });
    expect(model.comfort).toMatchObject({ level: "comfortable", label: "Comfortable here", runtime: "ollama" });
    expect(model.comfort.evidence).toEqual(expect.arrayContaining([
      "Estimated peak memory 12.6 GB of 36 GB",
      "214 GB free · 10.5 GB package",
      "Ollama 0.6.2 detected",
    ]));
  });

  test("chooses either a GGUF monolith or its complete split set, never both", () => {
    const model = normalizeHuggingFaceModel({
      id: "Qwen/Qwen2.5-Coder-14B-Instruct-GGUF",
      pipeline_tag: "text-generation",
      tags: ["gguf"],
      siblings: [
        { rfilename: "model-q5_k_m-00001-of-00002.gguf", size: 8 * GB },
        { rfilename: "model-q5_k_m-00002-of-00002.gguf", size: 2.51 * GB },
        { rfilename: "model-q5_k_m.gguf", size: 10.5 * GB },
      ],
    }, machine);

    expect(model.recommendedPackage).toMatchObject({ bytes: 10.5 * GB, files: ["model-q5_k_m.gguf"] });
  });

  test("chooses a standalone Safetensors checkpoint instead of summing alternate layouts", () => {
    const model = normalizeHuggingFaceModel({
      id: "stabilityai/visual-model",
      pipeline_tag: "text-to-image",
      tags: ["diffusers", "safetensors"],
      siblings: [
        { rfilename: "visual_model.safetensors", size: 5.11 * GB },
        { rfilename: "ae.safetensors", size: 335 * 1024 ** 2 },
        { rfilename: "transformer/diffusion_pytorch_model-00001-of-00002.safetensors", size: 8 * GB },
        { rfilename: "transformer/diffusion_pytorch_model-00002-of-00002.safetensors", size: 2 * GB },
        { rfilename: "text_encoder/model.safetensors", size: 4 * GB },
        { rfilename: "vae/diffusion_pytorch_model.safetensors", size: 500 * 1024 ** 2 },
      ],
    }, machine);

    expect(model.recommendedPackage).toMatchObject({ bytes: 5.11 * GB, files: ["visual_model.safetensors"] });
  });

  test("treats image-text generation as a Transformers multimodal model", () => {
    const model = normalizeHuggingFaceModel({
      id: "Qwen/vision-language-model",
      pipeline_tag: "image-to-text",
      tags: ["transformers", "safetensors"],
      siblings: [{ rfilename: "model.safetensors", size: 8 * GB }],
    }, machine);

    expect(model).toMatchObject({ modality: "multimodal", comfort: { runtime: "transformers" } });
  });

  test("marks a package larger than memory and free disk as incompatible", () => {
    const comfort = assessModelComfort({
      task: "text-generation",
      format: "GGUF Q4_K_M",
      bytes: 42.5 * GB,
      runtime: "ollama",
    }, { ...machine, freeDiskBytes: 21.8 * GB });

    expect(comfort).toMatchObject({ level: "incompatible", label: "Will not fit comfortably" });
    expect(comfort.evidence.join(" ")).toContain("42.5 GB package");
    expect(comfort.evidence.join(" ")).toContain("21.8 GB free");
  });

  test("uses unknown instead of inventing a score when package bytes are missing", () => {
    expect(assessModelComfort({
      task: "text-to-speech",
      format: "MLX",
      bytes: null,
      runtime: "mlx",
    }, machine)).toMatchObject({ level: "unknown", label: "Not enough data" });
  });

  test("requires runtime setup instead of presenting a missing runtime as comfortable", () => {
    expect(assessModelComfort({
      task: "text-to-image",
      format: "Safetensors",
      bytes: 2 * GB,
      runtime: "diffusers",
    }, { ...machine, runtimes: machine.runtimes.map((runtime) => runtime.id === "diffusers" ? { ...runtime, available: false } : runtime) }))
      .toMatchObject({ level: "unknown", label: "Runtime setup required", score: 0, estimatedMemoryBytes: 3.8 * GB });
  });

  test("normalizes Civitai preview media and permissions", () => {
    const model = normalizeCivitaiModel({
      id: 123,
      name: "Detail Tweaker XL",
      type: "LORA",
      nsfw: false,
      creator: { username: "Creator" },
      tags: ["detail", "style"],
      stats: { downloadCount: 25_000, thumbsUpCount: 640 },
      allowCommercialUse: ["Image"],
      allowDerivatives: true,
      allowNoCredit: false,
      allowDifferentLicense: false,
      modelVersions: [{
        id: 456,
        name: "v1.2",
        baseModel: "SDXL 1.0",
        files: [{ name: "detail.safetensors", sizeKB: 219_136, metadata: { format: "SafeTensor" } }],
        images: [{ url: "https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/example.jpeg", nsfwLevel: 1 }],
      }],
      updatedAt: "2026-07-21T00:00:00.000Z",
    }, machine);

    expect(model).toMatchObject({ provider: "civitai", author: "Creator", previewUrl: expect.stringContaining("image.civitai.com") });
    expect(model.permissions).toEqual([
      "Commercial use allowed: Image",
      "Derivatives permitted",
      "Creator credit required",
      "Alternate license restricted",
    ]);
  });

  test("infers Civitai video modality from the base model instead of its entity type", () => {
    const model = normalizeCivitaiModel({
      id: 2371603,
      name: "Camera motion adapter",
      type: "LORA",
      modelVersions: [{ baseModel: "Wan Video 2.2 I2V-A14B", files: [{ name: "adapter.safetensors", sizeKB: 1024 }] }],
    }, machine);

    expect(model).toMatchObject({ task: "text-to-video", modality: "video", comfort: { runtime: "diffusers" } });
  });

  test("drops preview URLs outside the provider allowlist", () => {
    expect(safeProviderMediaUrl("https://evil.example/tracker.png")).toBeNull();
    expect(safeProviderMediaUrl("https://huggingface.co/org/model/resolve/main/preview.png"))
      .toBe("https://huggingface.co/org/model/resolve/main/preview.png");
    expect(safeProviderMediaUrl("https://cdn-avatars.huggingface.co/avatar.png"))
      .toBe("https://cdn-avatars.huggingface.co/avatar.png");
    expect(safeProviderMediaUrl("https://image-b2.civitai.com/model.png"))
      .toBe("https://image-b2.civitai.com/model.png");
  });

  test("strips provider HTML before model detail crosses IPC while preserving Markdown text", async () => {
    const fetcher = vi.fn(async (url: string | URL) => {
      const value = String(url);
      if (value.includes("/api/models/")) return new Response(JSON.stringify({
        id: "org/model",
        author: "org",
        sha: "abc1234",
        pipeline_tag: "text-to-image",
        tags: ["diffusers", "safetensors", "license:apache-2.0"],
        gated: false,
        siblings: [{ rfilename: "model.safetensors", size: 5 * GB }],
        cardData: { license: "apache-2.0", thumbnail: "https://evil.example/track.png" },
      }), { status: 200 });
      if (value.includes("/api/organizations/org/overview")) return new Response(JSON.stringify({
        avatarUrl: "https://cdn-avatars.huggingface.co/org.png",
      }), { status: 200 });
      return new Response([
        "# Model",
        "",
        "Safe **Markdown** and `const answer = 42`.",
        "",
        "<div>Visible provider text</div>",
        "<script>alert(1)</script>",
        "<img src=x onerror=alert(2)>",
        "<textarea><img src=x onerror=alert(3)></textarea>",
        "<title><svg onload=alert(4)></title>",
        "<xmp><script>alert(5)</script></xmp>",
      ].join("\n"), { status: 200 });
    });

    const detail = await loadLocalModelDetail({ provider: "huggingface", id: "org/model" }, machine, fetcher as typeof fetch);

    expect(detail.readme).toContain("# Model");
    expect(detail.readme).toContain("Safe **Markdown** and `const answer = 42`.");
    expect(detail.readme).toContain("Visible provider text");
    expect(detail.readme).not.toMatch(/<[^>]*>|alert\(|onerror|svg onload/i);
    expect(JSON.stringify(projectMarketplaceModelDetail(detail))).not.toMatch(/<[^>]*>|alert\(|onerror|svg onload/i);
    expect(detail.previewUrls).toEqual([]);
    expect((detail as LocalModelDetail & { iconUrl: string | null }).iconUrl)
      .toBe("https://cdn-avatars.huggingface.co/org.png");
  });

  test("follows only bounded same-host HTTPS redirects with manual credential-free fetches", async () => {
    const fetcher = vi.fn(async (input: string | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("?blobs=true")) {
        return responseAt(url, null, { status: 302, headers: { location: "/api/models/org/model?blobs=redirected" } });
      }
      if (url.endsWith("?blobs=redirected")) return responseAt(url, JSON.stringify(huggingFaceRaw()));
      return responseAt(url, "", { status: 404 });
    });

    const detail = await loadLocalModelDetail({ provider: "huggingface", id: "org/model" }, machine, fetcher);

    expect(detail.id).toBe("org/model");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual", credentials: "omit" });
    expect(fetcher.mock.calls[1]?.[0]).toBe("https://huggingface.co/api/models/org/model?blobs=redirected");
  });

  test.each([
    "http://127.0.0.1:11434/api/tags",
    "https://10.0.0.8/private",
    "https://localhost/private?token=secret",
    "https://civitai.com/api/v1/models/123",
    "https://user:password@huggingface.co/api/models/org/model",
    "https://huggingface.co:8443/api/models/org/model",
  ])("rejects a hostile provider redirect without disclosing its target: %s", async (location) => {
    const requested: string[] = [];
    const fetcher = vi.fn(async (input: string | Request) => {
      const url = String(input);
      requested.push(url);
      return responseAt(url, null, { status: 302, headers: { location } });
    });

    const error = await loadLocalModelDetail({ provider: "huggingface", id: "org/model" }, machine, fetcher)
      .then(() => null, (cause: unknown) => cause as Error);

    expect(error?.message).toBe("Provider request failed");
    expect(error?.message).not.toMatch(/localhost|127\.0\.0\.1|civitai|password|8443|secret/i);
    expect(requested).toHaveLength(1);
  });

  test("rejects redirect loops and excessive redirect hops", async () => {
    const loopFetcher = vi.fn(async (input: string | Request) => {
      const url = String(input);
      return responseAt(url, null, { status: 302, headers: { location: url } });
    });
    await expect(loadLocalModelDetail({ provider: "huggingface", id: "org/model" }, machine, loopFetcher))
      .rejects.toThrow("Provider request failed");
    expect(loopFetcher).toHaveBeenCalledTimes(1);

    let hop = 0;
    const hopFetcher = vi.fn(async (input: string | Request) => {
      const url = String(input);
      hop += 1;
      return responseAt(url, null, { status: 302, headers: { location: `/api/models/org/model?hop=${hop}` } });
    });
    await expect(loadLocalModelDetail({ provider: "huggingface", id: "org/model" }, machine, hopFetcher))
      .rejects.toThrow("Provider request failed");
    expect(hopFetcher.mock.calls.length).toBeLessThanOrEqual(4);
  });

  test("rejects a hostile final response URL", async () => {
    const fetcher = vi.fn(async () => responseAt("https://localhost/private", JSON.stringify(huggingFaceRaw())));
    await expect(loadLocalModelDetail({ provider: "huggingface", id: "org/model" }, machine, fetcher))
      .rejects.toThrow("Provider request failed");
  });

  test("slices oversized search records before a bounded 24-item detail fan-out", async () => {
    const values = Array.from({ length: 30 }, (_, index) => huggingFaceRaw(`org/model-${index}`));
    const detailRequests: string[] = [];
    const fetcher = vi.fn(async (input: string | Request) => {
      const url = String(input);
      if (url.includes("/api/models?")) return responseAt(url, JSON.stringify(values));
      if (url.includes("/api/models/org/model-")) {
        detailRequests.push(url);
        const id = url.match(/\/api\/models\/([^?]+)/)?.[1] ?? "org/model";
        return responseAt(url, JSON.stringify(huggingFaceRaw(id)));
      }
      return responseAt(url, "", { status: 404 });
    });

    const catalog = await searchLocalModels({ provider: "huggingface", limit: 24 }, machine, fetcher);

    expect(catalog.items).toHaveLength(24);
    expect(detailRequests).toHaveLength(24);
  });

  test("bounds DTO tags, files, nested arrays, and strings before projection", () => {
    const model = normalizeHuggingFaceModel({
      ...huggingFaceRaw(),
      author: "a".repeat(10_000),
      tags: Array.from({ length: 10_000 }, (_, index) => `${index}-${"t".repeat(1_000)}`),
      siblings: Array.from({ length: 1_000 }, (_, index) => ({ rfilename: `${index}-${"f".repeat(1_000)}.gguf`, size: 1 })),
    }, machine);
    const projected = projectMarketplaceModelDetail({ ...model, readme: "bounded", previewUrls: [], files: [] });

    expect(model.tags.length).toBeLessThanOrEqual(64);
    expect(Math.max(...model.tags.map((tag) => tag.length))).toBeLessThanOrEqual(256);
    expect(model.author.length).toBeLessThanOrEqual(256);
    expect(model.recommendedPackage.files.length).toBeLessThanOrEqual(64);
    expect(Math.max(...model.recommendedPackage.files.map((file) => file.length))).toBeLessThanOrEqual(1_024);
    expect(projected.tags).toEqual(model.tags);
  });

  test("rejects oversized content-length and excessive streamed chunks before JSON parsing", async () => {
    const oversizedLength = vi.fn(async (input: string | Request) => {
      const url = String(input);
      return responseAt(url, "[]", { headers: { "content-length": String(2 * 1_024 * 1_024 + 1) } });
    });
    const lengthCatalog = await searchLocalModels({ provider: "huggingface" }, machine, oversizedLength);
    expect(lengthCatalog.errors).toEqual([{ provider: "huggingface", message: "Hugging Face request failed" }]);

    const oversizedBody = vi.fn(async (input: string | Request) => {
      const url = String(input);
      const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(2 * 1_024 * 1_024 + 1)); controller.close(); } });
      return responseAt(url, stream);
    });
    const bodyCatalog = await searchLocalModels({ provider: "huggingface" }, machine, oversizedBody);
    expect(bodyCatalog.errors).toEqual([{ provider: "huggingface", message: "Hugging Face request failed" }]);

    const chunks = Array.from({ length: 4_097 }, () => new Uint8Array([0x20]));
    chunks.push(new TextEncoder().encode("[]"));
    const chunked = vi.fn(async (input: string | Request) => {
      const url = String(input);
      const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(chunks.shift()!); if (!chunks.length) controller.close(); } });
      return responseAt(url, stream);
    });
    const chunkCatalog = await searchLocalModels({ provider: "huggingface" }, machine, chunked);
    expect(chunkCatalog.errors).toEqual([{ provider: "huggingface", message: "Hugging Face request failed" }]);
  });

  test("rejects an oversized README content-length before reading provider text", async () => {
    const fetcher = vi.fn(async (input: string | Request) => {
      const url = String(input);
      if (url.includes("/api/models/")) return responseAt(url, JSON.stringify(huggingFaceRaw()));
      if (url.includes("/raw/")) return responseAt(url, "# small body", { headers: { "content-length": String(256 * 1_024 + 1) } });
      return responseAt(url, "", { status: 404 });
    });

    await expect(loadLocalModelDetail({ provider: "huggingface", id: "org/model" }, machine, fetcher))
      .rejects.toThrow("Hugging Face request failed");
  });

  test("bounds avatar JSON before parsing optional detail metadata", async () => {
    const oversizedAvatar = `${" ".repeat(2 * 1_024 * 1_024)}{"avatarUrl":"https://cdn-avatars.huggingface.co/leak.png"}`;
    const fetcher = vi.fn(async (input: string | Request) => {
      const url = String(input);
      if (url.includes("/api/models/")) return responseAt(url, JSON.stringify(huggingFaceRaw()));
      if (url.includes("/api/organizations/") || url.includes("/api/users/")) return responseAt(url, oversizedAvatar);
      return responseAt(url, "", { status: 404 });
    });

    const detail = await loadLocalModelDetail({ provider: "huggingface", id: "org/model" }, machine, fetcher);

    expect(detail.iconUrl).toBeNull();
  });

  test("sanitizes provider stream failures without URL or path details", async () => {
    const fetcher = vi.fn(async (input: string | Request) => {
      const url = String(input);
      if (url.includes("/api/models/")) return responseAt(url, JSON.stringify(huggingFaceRaw()));
      if (url.includes("/raw/")) {
        return responseAt(url, new ReadableStream({ start(controller) { controller.error(new Error("https://huggingface.co/private?token=secret /Users/demo/key")); } }));
      }
      return responseAt(url, "", { status: 404 });
    });

    const error = await loadLocalModelDetail({ provider: "huggingface", id: "org/model" }, machine, fetcher)
      .then(() => null, (cause: unknown) => cause as Error);

    expect(error?.message).toBe("Hugging Face request failed");
    expect(error?.message).not.toMatch(/huggingface\.co|token|Users|key|secret/i);
  });

  test("caps detail files and recommended file names before IPC", async () => {
    const raw = {
      ...huggingFaceRaw(),
      siblings: Array.from({ length: 1_000 }, (_, index) => ({ rfilename: `model-${index}.safetensors`, size: 1 })),
    };
    const fetcher = vi.fn(async (input: string | Request) => {
      const url = String(input);
      if (url.includes("/api/models/")) return responseAt(url, JSON.stringify(raw));
      return responseAt(url, "", { status: 404 });
    });

    const detail = await loadLocalModelDetail({ provider: "huggingface", id: "org/model" }, machine, fetcher);

    expect(detail.files).toHaveLength(256);
    expect(detail.recommendedPackage.files.length).toBeLessThanOrEqual(64);
  });

  test("accepts only real RFC3339 timestamps and preserves timezone meaning", () => {
    expect(normalizeHuggingFaceModel({ ...huggingFaceRaw(), lastModified: "2026-08-20T12:30:45+03:00" }, machine).lastModified)
      .toBe("2026-08-20T09:30:45.000Z");
    for (const value of ["2026-02-30T12:00:00Z", "08/20/2026 12:00", "2026-08-20T12:00:00", "not-a-date"]) {
      expect(normalizeHuggingFaceModel({ ...huggingFaceRaw(), lastModified: value }, machine).lastModified).toBeNull();
      expect(normalizeCivitaiModel({ id: 1, updatedAt: value, modelVersions: [] }, machine).lastModified).toBeNull();
    }
  });
});
