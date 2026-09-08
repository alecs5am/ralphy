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
