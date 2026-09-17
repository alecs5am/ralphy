import { act } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { GenerationScreen } from "@/pages/generation";
import { bridge } from "@/shared/api/ipc";
import type { GenerationDraft, GenerationModel } from "../shared/generation-studio";
import type { CanvasRun, CanvasRunResult } from "../shared/canvas-runtime";
import { createReactHost, type HostNode } from "./react-host";
import { generationSnapshot } from "../electron/canvas/generation-draft";
import { APP_PREFERENCE_DEFAULTS, settingsStorage, writeAppPreferences } from "@/shared/model/app-preferences";

const imageModel: GenerationModel = {
  id: "test-image", name: "Image engine", provider: "test", kind: "image", description: "Image test model", available: true, previewSupported: true,
  inputs: [{ id: "refs", label: "Reference image", kind: "image", maxCount: 2 }],
  fields: [
    { id: "aspect", label: "Aspect ratio", type: "choice", default: "square", options: [{ value: "square", label: "Square" }, { value: "wide", label: "Wide" }] },
    { id: "steps", label: "Steps", type: "number", min: 1, max: 50, step: 1, default: 12, required: true },
    { id: "negative", label: "Negative prompt", type: "text" },
    { id: "audio", label: "Generate audio", type: "toggle", default: true },
  ],
};
const otherModel: GenerationModel = { ...imageModel, id: "other-image", name: "Other engine", available: false, fields: [{ id: "strength", label: "Strength", type: "number", min: 0, max: 1, default: 0.5 }], inputs: [] };
const voiceModel: GenerationModel = { ...imageModel, id: "voice", name: "Voice engine", kind: "voiceover", fields: [{ id: "voice", label: "Voice ID", type: "text", required: true }], inputs: [], previewSupported: false };
const draft: GenerationDraft = { kind: "image", modelId: imageModel.id, provider: "test", prompt: "Current prompt", parameters: { aspect: "square", steps: 12, audio: true }, inputs: [], variants: 1 };
const output: CanvasRunResult = { id: "frame", nodeId: "model", kind: "image", label: "Generated frame", previewUrl: "ralphy-media://asset/result", asset: { path: "/workspace/output.png", name: "output.png", kind: "image" } };
function run(id: string, mode: "preview" | "execute", prompt: string, results: CanvasRunResult[] = []): CanvasRun {
  return {
    id, mode, canvasId: "generation-studio", canvasRevision: "1", workspaceId: "workspace", status: "succeeded", startedAt: 1, endedAt: 2, error: null,
    nodes: [{ nodeId: "model", status: "succeeded", startedAt: 1, endedAt: 2, coreRunIds: [], results, error: null, estimatedCostUsd: mode === "preview" ? 0.04 : null }],
    snapshot: { version: 2, id: "generation-studio", name: "Create", edges: [], nodes: [{ id: "model", kind: "model", title: imageModel.name, value: prompt, x: 0, y: 0, config: { modelId: imageModel.id, provider: "test", modality: "image", parameters: { steps: 18 }, variants: 1 } }] },
  };
}

afterEach(() => vi.restoreAllMocks());
function button(container: HostNode, label: string): HostNode {
  const result = (container.ownerDocument.body as unknown as HostNode).querySelectorAll("button").find((node) => node.getAttribute("aria-label") === label || node.textContent === label || node.textContent.startsWith(label));
  if (!result) throw new Error(`Missing button: ${label}`);
  return result;
}
const click = async (container: HostNode, label: string) => {
  await act(async () => button(container, label).dispatchEvent(new Event("click", { bubbles: true })));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
};

async function mount(runs: CanvasRun[] = []) {
  vi.spyOn(bridge, "loadGenerationCatalog").mockResolvedValue({ models: [imageModel, otherModel, voiceModel], providers: [{ id: "test", label: "Test provider", available: true, capabilities: ["image", "voice"] }], errors: [] });
  vi.spyOn(bridge, "loadGenerationDraft").mockResolvedValue(structuredClone(draft));
  const save = vi.spyOn(bridge, "saveGenerationDraft").mockResolvedValue();
  vi.spyOn(bridge, "loadGenerationRuns").mockResolvedValue({ items: runs, nextCursor: null });
  vi.spyOn(bridge, "loadCanvasAssetPreview").mockResolvedValue(null);
  const start = vi.spyOn(bridge, "startGeneration").mockResolvedValue(run("estimated", "preview", draft.prompt));
  const exportAsset = vi.spyOn(bridge, "exportGenerationAsset").mockResolvedValue(true);
  const onOpenProviders = vi.fn();
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  await act(async () => root.render(<GenerationScreen workspaceId="workspace" workspaceName="Test studio" rootEpoch={1} onOpenProviders={onOpenProviders} />));
  return { host, root, save, start, exportAsset, onOpenProviders, async close() { await act(async () => root.unmount()); host.restore(); } };
}

test.each([{ failed: false, video: false }, { failed: false, video: true }, { failed: true, video: false }])("references stay separate from creations and default detail output (%j)", async ({ failed, video }) => {
  const created: CanvasRunResult = video ? { ...output, kind: "video", asset: { path: "/workspace/output.mp4", name: "output.mp4", kind: "video" } } : output;
  const generated = run("referenced", "execute", "Referenced prompt", failed ? [] : [created, { ...created, id: "second", label: "Second variation" }]);
  if (video) generated.snapshot.nodes[0].config!.modality = "video";
  const source = { ...output, id: "reference", nodeId: "input", label: "Source image", previewUrl: "ralphy-media://asset/source" };
  generated.snapshot.nodes.unshift({ id: "input", kind: "media", title: "Reference", value: "", x: 0, y: 0, config: { asset: source.asset } });
  generated.nodes.unshift({ ...generated.nodes[0], nodeId: "input", results: [source] });
  if (failed) { generated.status = "failed"; generated.error = "Request rejected before output"; }
  const mounted = await mount([generated]);
  try {
    if (video) await click(mounted.host.container, "Video");
    expect(mounted.host.container.querySelectorAll(".generation-output-card")).toHaveLength(failed ? 0 : 2);
    await click(mounted.host.container, "History"); await click(mounted.host.container, "Referenced prompt");
    expect(mounted.host.container.querySelectorAll("section").find((node) => node.getAttribute("aria-label") === "Input references")?.textContent).toContain("Source image");
    if (failed) {
      expect(mounted.host.container.textContent).toContain("No output was produced by this run.");
      expect(mounted.host.container.querySelectorAll("[role='group']").find((node) => node.getAttribute("aria-label") === "Output variations")).toBeUndefined();
      expect(mounted.host.container.querySelectorAll("button").some((node) => node.textContent === "Export" || node.textContent.startsWith("Use as"))).toBe(false);
    } else {
      expect(mounted.host.container.querySelector(`.generation-preview ${video ? "video" : "img"}`)?.getAttribute("src")).toBe(created.previewUrl);
      expect(mounted.host.container.querySelectorAll("[role='group']").find((node) => node.getAttribute("aria-label") === "Output variations")?.querySelectorAll("button")).toHaveLength(2);
      await click(mounted.host.container, "Export"); expect(mounted.exportAsset).toHaveBeenCalledWith("workspace", created.asset);
    }
  } finally { await mounted.close(); }
});

test("completed partial output survives a failed run and older-page controls expose retained creations", async () => {
  const partial = { ...run("partial", "execute", "Partial prompt", [output]), status: "failed" as const, error: "Second variant failed" };
  const mounted = await mount([]);
  const load = vi.mocked(bridge.loadGenerationRuns);
  try {
    load.mockResolvedValueOnce({ items: [], nextCursor: "older-page" });
    await act(async () => window.dispatchEvent(new Event("focus")));
    load.mockResolvedValueOnce({ items: [partial], nextCursor: null });
    await click(mounted.host.container, "Load older runs");
    expect(load).toHaveBeenLastCalledWith("workspace", "older-page");
    expect(mounted.host.container.querySelectorAll(".generation-output-card")).toHaveLength(1);
    await click(mounted.host.container, "Open Generated frame");
    expect(mounted.host.container.textContent).toContain("Second variant failed");
    await click(mounted.host.container, "Export"); expect(mounted.exportAsset).toHaveBeenCalledWith("workspace", output.asset);
  } finally { await mounted.close(); }
});

test("renders model schema fields, switches schemas, and opens unavailable provider settings", async () => {
  const mounted = await mount();
  const { host, save, start, onOpenProviders } = mounted;
  try {
    expect(host.container.querySelector("[data-instrument-route]")?.getAttribute("data-instrument-state")).toBe("editing");
    const steps = host.container.querySelector("#generation-steps")!;
    expect((steps as unknown as HTMLInputElement).type).toBe("range");
    expect(steps.getAttribute("min")).toBe("1");
    expect(steps.getAttribute("max")).toBe("50");
    expect(steps.getAttribute("step")).toBe("1");
    expect(host.container.querySelector("#generation-negative")).not.toBeNull();
    expect(host.container.querySelectorAll("input").some((input) => (input as unknown as HTMLInputElement).type === "checkbox")).toBe(true);
    expect(button(host.container, "Square").getAttribute("aria-pressed")).toBe("true");
    expect(button(host.container, "Decrease variations").disabled).toBe(true);
    expect(button(host.container, "Increase variations").disabled).toBe(false);
    await click(host.container, "Estimate");
    expect(start).toHaveBeenCalledWith("workspace", draft, "preview");
    const prompt = host.container.querySelector("#generation-prompt");
    await click(host.container, "Choose generation model");
    expect(host.container.querySelector("#generation-prompt")).toBe(prompt);
    expect(host.container.querySelector(".generation-footer")).not.toBeNull();
    expect(host.container.ownerDocument.body.querySelector("[data-instrument-overlay='generation-models']")).not.toBeNull();
    expect(host.container.ownerDocument.activeElement?.getAttribute("aria-label")).toBe("Search generation models");
    const search = host.container.ownerDocument.activeElement as unknown as HostNode;
    Object.assign(search, { attachEvent() {}, detachEvent() {}, selectionStart: 0, selectionEnd: 0 });
    await act(async () => search.dispatchEvent(new Event("focusin", { bubbles: true })));
    await act(async () => search.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: "ArrowDown" })));
    expect(host.container.ownerDocument.activeElement?.textContent).toContain("Image engine");
    await act(async () => host.container.ownerDocument.activeElement!.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: "ArrowUp" })));
    expect(host.container.ownerDocument.activeElement === search as unknown as Element).toBe(true);
    await act(async () => {
      search.dispatchEvent(new Event("focusin", { bubbles: true }));
      (search as unknown as HTMLInputElement).value = "Other";
      search.dispatchEvent(new Event("keyup", { bubbles: true }));
    });
    expect(host.container.ownerDocument.body.querySelector(".generation-model-list")?.textContent).not.toContain("Image engine");
    await click(host.container, "Other engine");
    expect(host.container.ownerDocument.activeElement === button(host.container, "Choose generation model") as unknown as Element).toBe(true);
    await click(host.container, "Choose generation model");
    await click(host.container, "Close model picker");
    expect(host.container.ownerDocument.activeElement === button(host.container, "Choose generation model") as unknown as Element).toBe(true);
    await click(host.container, "Choose generation model");
    await act(async () => host.container.ownerDocument.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: "Escape" })));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(host.container.ownerDocument.body.querySelector("[data-instrument-overlay='generation-models']")).toBeNull();
    expect(host.container.ownerDocument.activeElement === button(host.container, "Choose generation model") as unknown as Element).toBe(true);
    expect(host.container.querySelector("#generation-steps")).toBeNull();
    expect(host.container.querySelector("#generation-strength")).not.toBeNull();
    expect(save).toHaveBeenLastCalledWith("workspace", expect.objectContaining({ modelId: "other-image", prompt: draft.prompt, parameters: { strength: 0.5 } }));
    expect(button(host.container, "Generate").disabled).toBe(true);
    await click(host.container, "Connect Test provider");
    expect(onOpenProviders).toHaveBeenCalledOnce();
    await click(host.container, "Audio");
    expect(host.container.querySelector("#generation-voice")).not.toBeNull();
    expect(button(host.container, "Estimate").disabled).toBe(true);
    expect(host.container.querySelectorAll("label").some((label) => label.textContent.startsWith("Script"))).toBe(true);
  } finally { await mounted.close(); }
});

test("selects voices in a searchable popup, preserves the form, and applies custom IDs without generating", async () => {
  const voices = vi.spyOn(bridge, "loadGenerationVoices").mockResolvedValue([
    { id: "river", name: "River", description: "Warm narrator", previewUrl: "https://example.com/river.mp3" },
    { id: "jules", name: "Jules", description: "Bright conversational" },
  ]);
  const mounted = await mount();
  const { host, save, start } = mounted;
  const press = async (node: HostNode, key: string) => act(async () => node.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key })));
  const type = async (node: HostNode, value: string) => {
    Object.assign(node, { attachEvent() {}, detachEvent() {}, selectionStart: 0, selectionEnd: 0 });
    await act(async () => { node.dispatchEvent(new Event("focusin", { bubbles: true })); (node as unknown as HTMLInputElement).value = value; node.dispatchEvent(new Event("keyup", { bubbles: true })); });
  };
  try {
    await click(host.container, "Audio");
    const prompt = host.container.querySelector("#generation-prompt");
    await click(host.container, "Choose a voice");
    const popup = host.container.ownerDocument.body.querySelector("[data-instrument-overlay='generation-voices']")!;
    expect(popup).not.toBeNull();
    expect(host.container.querySelector("#generation-prompt")).toBe(prompt);
    expect(host.container.querySelector("#generation-custom-voice")).toBeNull();
    const search = host.container.ownerDocument.activeElement as unknown as HostNode;
    expect(search.getAttribute("aria-label")).toBe("Search voices");
    await type(search, "river warm");
    expect(popup.querySelector(".generation-model-list")?.textContent).not.toContain("Jules");
    await press(search, "ArrowDown");
    expect(host.container.ownerDocument.activeElement?.textContent).toContain("River");
    await click(host.container, "River");
    expect(save).toHaveBeenLastCalledWith("workspace", expect.objectContaining({ parameters: { voice: "river" } }));
    expect(host.container.querySelector("audio")?.getAttribute("src")).toBe("https://example.com/river.mp3");
    expect(host.container.ownerDocument.activeElement === button(host.container, "Choose a voice") as unknown as Element).toBe(true);
    await click(host.container, "Choose a voice");
    const manual = host.container.ownerDocument.body.querySelector("#generation-custom-voice") as unknown as HostNode;
    await type(manual, "  custom_voice  ");
    await press(manual, "Enter");
    expect(save).toHaveBeenLastCalledWith("workspace", expect.objectContaining({ parameters: { voice: "custom_voice" } }));
    expect(start).not.toHaveBeenCalled();
    expect(host.container.ownerDocument.body.querySelector("[data-instrument-overlay='generation-voices']")).toBeNull();
    await click(host.container, "Choose a voice");
    voices.mockRejectedValueOnce(new Error("Voice service unavailable"));
    await click(host.container, "Refresh voices");
    expect(host.container.ownerDocument.body.textContent).toContain("Voice service unavailable");
    await click(host.container, "Close voice picker");
    expect(host.container.ownerDocument.activeElement === button(host.container, "Choose a voice") as unknown as Element).toBe(true);
  } finally { await mounted.close(); }
});

test("keeps estimates out of creations and supports settings, export, and compatible reference actions", async () => {
  const generated = run("generated", "execute", "Saved creative prompt", [output]);
  generated.snapshot.nodes[0]!.config!.parameters = { steps: 18, aspect: "wide", audio: true, guidanceScale: 5 };
  const estimated = run("estimate", "preview", "Estimate prompt");
  const mounted = await mount([estimated, generated]);
  const { host, save, exportAsset } = mounted;
  try {
    expect(host.container.querySelectorAll("img")).toHaveLength(1);
    expect(host.container.textContent).not.toContain("Estimate prompt");
    await click(host.container, "Choose generation model");
    await click(host.container, "Other engine");
    await click(host.container, "Open Generated frame");
    expect(host.container.textContent).toContain("Aspect ratio: wide");
    expect(host.container.textContent).toContain("Generate audio: On");
    expect(host.container.textContent).toContain("Guidance scale: 5");
    await click(host.container, "Use settings");
    expect(save).toHaveBeenLastCalledWith("workspace", expect.objectContaining({ prompt: "Saved creative prompt", parameters: generated.snapshot.nodes[0]!.config!.parameters }));
    await click(host.container, "Export");
    expect(exportAsset).toHaveBeenCalledWith("workspace", output.asset);
    await click(host.container, "Use as reference image");
    expect(save).toHaveBeenLastCalledWith("workspace", expect.objectContaining({ inputs: [{ role: "refs", asset: output.asset }] }));
    await click(host.container, "Back");
    await click(host.container, "History");
    await click(host.container, "Estimate prompt");
    expect(host.container.querySelectorAll("img")).toHaveLength(0);
    expect(host.container.textContent).toContain("$0.04");
    expect(host.container.textContent).toContain("Estimate only. No media generated and no paid request submitted.");
    expect(host.container.querySelectorAll("button").some((node) => node.textContent === "Export")).toBe(false);
  } finally { await mounted.close(); }
});

test("announces native start failures and failed run details as alerts", async () => {
  const failed = { ...run("failed", "execute", "Failed prompt"), status: "failed" as const, error: "Provider rejected the request" };
  const mounted = await mount([failed]);
  try {
    mounted.start.mockRejectedValueOnce(new Error("Native provider is unavailable"));
    await click(mounted.host.container, "Estimate");
    expect(mounted.host.container.querySelector("[role='alert']")?.textContent).toContain("Native provider is unavailable");
    expect(mounted.host.container.querySelector("[data-instrument-state]")?.getAttribute("data-instrument-state")).toBe("error");
    await click(mounted.host.container, "Dismiss generation error");
    expect(mounted.host.container.querySelector("[role='alert']")).toBeNull();
    await click(mounted.host.container, "History");
    await click(mounted.host.container, "Failed prompt");
    expect(mounted.host.container.querySelector("[role='alert']")?.textContent).toContain("Provider rejected the request");
  } finally { await mounted.close(); }
});

test("changing generation type closes a selected result from the previous type", async () => {
  const mounted = await mount([run("generated", "execute", "Saved creative prompt", [output])]);
  try {
    await click(mounted.host.container, "Open Generated frame");
    await click(mounted.host.container, "Audio");
    expect(mounted.host.container.querySelectorAll(".generation-preview")).toHaveLength(0);
    expect(mounted.host.container.querySelectorAll("img")).toHaveLength(0);
    expect(mounted.host.container.textContent).toContain("Make something resonate.");
  } finally { await mounted.close(); }
});

test("the cost warning follows settings and changing variations clears the previous estimate", async () => {
  const estimated = run("estimate", "preview", draft.prompt);
  estimated.snapshot = generationSnapshot(draft);
  estimated.nodes[0]!.estimatedCostUsd = 7.2;
  const mounted = await mount([estimated]);
  try {
    expect(button(mounted.host.container, "Generate anyway").textContent).toContain("$7.20");
    await act(async () => writeAppPreferences(settingsStorage, { ...APP_PREFERENCE_DEFAULTS, "generation.costWarningUsd": 10 }));
    expect(button(mounted.host.container, "Generate").textContent).not.toContain("anyway");
    await click(mounted.host.container, "Increase variations");
    expect(mounted.host.container.querySelector(".generation-estimate")?.textContent).not.toContain("7.20");
    expect(mounted.save).toHaveBeenLastCalledWith("workspace", expect.objectContaining({ variants: 2 }));
  } finally {
    await act(async () => writeAppPreferences(settingsStorage, { ...APP_PREFERENCE_DEFAULTS }));
    await mounted.close();
  }
});
