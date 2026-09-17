import { expect, test, vi } from "vitest";
import { loadCanvasModelCatalog } from "../electron/canvas/runtime-catalog";
import { generationArguments } from "../electron/canvas/runtime-plan";
import type { CanvasNode } from "../shared/workflow-canvas";
import { parseCanvasRun } from "../electron/canvas/runtime-record";
test("catalog discovers text/image/video independently of configured credentials", async () => {
  const cli = vi.fn(async (args: string[]) => args[0] === "provider" ? { providers: [{ id: "openrouter", label: "OpenRouter", available: false, capabilities: ["image", "video", "text"] }] } : { models: [{ id: "video/one", durations: "5,10", aspects: "16:9,9:16", resolutions: "720p", frames: "first_frame" }] });
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "text/one", architecture: { output_modalities: ["text"] } }, { id: "image/one", architecture: { output_modalities: ["image", "text"] } }] }))) as unknown as typeof fetch;
  const catalog = await loadCanvasModelCatalog(cli, fetcher);
  expect(new Set(catalog.models.map((model) => model.modality))).toEqual(new Set(["text", "image", "video"]));
  expect(catalog.models.every((model) => !model.available)).toBe(true);
  expect(catalog.models.find((model) => model.modality === "video")?.parameters.durations).toEqual([5, 10]);
});
test("Canvas includes the installed fal routes independently of OpenRouter discovery and credentials", async () => {
  const cli = async (args: string[]) => args[1] === "matrix" ? { entries: [{ provider: "fal", model: "bytedance/seedance-2.0/reference-to-video", capability: "video", supportedParams: ["refs", "generateAudio"] }] } : args[0] === "provider" ? { providers: [{ id: "fal", label: "fal.ai", available: true, capabilities: ["video"] }, { id: "elevenlabs", label: "ElevenLabs", available: false, capabilities: ["voice"] }] } : { models: [] };
  const catalog = await loadCanvasModelCatalog(cli, (() => Promise.reject(new Error("offline"))) as typeof fetch);
  const model = catalog.models.find((item) => item.provider === "fal")!;
  expect(model.available).toBe(true);
  expect(model.parameters.durations).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  expect(catalog.models.some((item) => item.provider === "elevenlabs")).toBe(false);
  const node: CanvasNode = { id: "fal", kind: "model", title: "Video", value: "Animate the reference", x: 0, y: 0, config: { modality: "video", provider: "fal", modelId: model.id } };
  const args = generationArguments(node, [{ id: "image", nodeId: "image", kind: "image", label: "Image", asset: { path: "/safe/image.png", name: "Image", kind: "image" } }], "slot");
  expect(args).toContain("--ref");
  expect(args).not.toContain("--first-frame");
  expect(() => generationArguments(node, [{ id: "video", nodeId: "video", kind: "video", label: "Video", asset: { path: "/safe/video.mp4", name: "Video", kind: "video" } }], "slot")).toThrow("project workflow");
});
test("Canvas exposes all installed audio operations with their generation controls", async () => {
  const cli = async (args: string[]) => args[1] === "matrix" ? { entries: [
    { provider: "elevenlabs", model: "eleven_multilingual_v2", capability: "voice" },
    { provider: "elevenlabs", model: "elevenlabs-music", capability: "music" },
    { provider: "elevenlabs", model: "elevenlabs-sfx", capability: "sfx" },
  ] } : args[0] === "provider" ? { providers: [{ id: "elevenlabs", available: true }] } : { models: [] };
  const catalog = await loadCanvasModelCatalog(cli, (async () => new Response('{"data":[]}')) as typeof fetch);
  const { canvasModelFields } = await import("../src/features/workflow-canvas/model/model-fields");
  expect(catalog.models.map((model) => model.operation)).toEqual(["voiceover", "music", "sfx"]);
  for (const model of catalog.models.filter((item) => item.operation !== "voiceover")) {
    const node: CanvasNode = { id: "audio", kind: "model", title: model.name, value: "A gentle chime", x: 0, y: 0, config: { provider: model.provider, modelId: model.id, modality: model.modality, operation: model.operation } };
    expect(generationArguments(node, [], "test").slice(0, 2)).toEqual(["generate", model.operation]);
    expect(canvasModelFields(model).find((field) => field.id === "duration")).toBeDefined();
  }
});
test("native argv accepts typed references and rejects arbitrary runtime switches", () => {
  const node: CanvasNode = { id: "video", kind: "model", title: "Video", value: "Move slowly", x: 0, y: 0, config: { modality: "video", modelId: "test/video", parameters: { duration: 5 } } };
  const args = generationArguments(node, [{ id: "asset", nodeId: "media", kind: "image", label: "Frame", asset: { path: "/safe/frame.png", name: "Frame", kind: "image" } }], "slot");
  expect(args).toContain("--first-frame"); expect(args).toContain("/safe/frame.png");
  const wired = generationArguments(node, [{ id: "prompt", nodeId: "brief", kind: "text", label: "Brief", text: "Follow the connected script" }], "slot");
  expect(wired[wired.indexOf("--prompt") + 1]).toBe("Follow the connected script");
  expect(args[args.indexOf("--prompt") + 1]).toBe("Move slowly");
  expect(() => generationArguments(node, [{ id: "prompt", nodeId: "brief", kind: "text", label: "Brief", text: " " }], "slot")).toThrow(/prompt|instructions/);
  node.config!.parameters = { "no-budget": "override" };
  expect(() => generationArguments(node, [], "slot")).toThrow(/Unsupported/);
  expect(() => parseCanvasRun({ id: "bad" }, "bad", "workspace", "canvas")).toThrow(/Invalid/);
});
