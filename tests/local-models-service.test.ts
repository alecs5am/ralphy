import { describe, expect, test, vi } from "vitest";
import type { LocalModelDetail } from "../electron/media/types";
import {
  assessModelComfort,
  loadHuggingFaceDetail,
  normalizeCivitaiModel,
  normalizeHuggingFaceModel,
  safeProviderMediaUrl,
} from "../electron/local-models";

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

  test("loads Hugging Face README as Markdown without interpreting provider HTML", async () => {
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
      return new Response("# Model\n\nSafe **Markdown**.\n\n<script>alert(1)</script>", { status: 200 });
    });

    const detail = await loadHuggingFaceDetail("org/model", machine, fetcher as typeof fetch);

    expect(detail.readme).toContain("# Model");
    expect(detail.readme).toContain("<script>alert(1)</script>");
    expect(detail.previewUrls).toEqual([]);
    expect((detail as LocalModelDetail & { iconUrl: string | null }).iconUrl)
      .toBe("https://cdn-avatars.huggingface.co/org.png");
  });
});
