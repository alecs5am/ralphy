import { act } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { GenerationParameter } from "@/entities/generation"
import { GenerationInputs } from "../src/pages/generation/ui/GenerationInputs";
import { generationCost, generationEstimate } from "../src/pages/generation/lib/generation-presentation";
import { generationSnapshot } from "../electron/canvas/generation-draft";
import type { GenerationDraft, GenerationModel } from "../shared/generation-studio";
import type { CanvasRun } from "../shared/canvas-runtime";
import { createReactHost, type HostNode } from "./react-host";
import * as selectMenu from "../src/shared/ui/SelectMenu";

const draft: GenerationDraft = { kind: "video", modelId: "kling", provider: "fal", prompt: "A quiet terrace", parameters: { duration: "10", aspectRatio: "16:9" }, variants: 2, inputs: [] };
const model: GenerationModel = { id: "kling", provider: "fal", name: "Kling", kind: "video", description: "", available: true, previewSupported: true, fields: [{ id: "duration", label: "Duration (seconds)", type: "choice", options: Array.from({ length: 13 }, (_, index) => ({ value: String(index + 3), label: String(index + 3) })) }], inputs: [{ id: "firstFrame", label: "First frame", kind: "image", maxCount: 1 }, { id: "lastFrame", label: "Last frame", kind: "image", maxCount: 1 }] };
const estimate = (): CanvasRun => ({ id: "estimate", mode: "preview", canvasId: "generation-studio", canvasRevision: "v1", workspaceId: "workspace", status: "succeeded", startedAt: 1, endedAt: 2, error: null, nodes: [{ nodeId: "generation", status: "succeeded", startedAt: 1, endedAt: 2, coreRunIds: [], results: [], error: null, estimatedCostUsd: 7.2 }], snapshot: generationSnapshot(draft) });
afterEach(() => vi.restoreAllMocks());

async function mount(ui: React.ReactNode, host = createReactHost()) {
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  await act(async () => root.render(ui));
  return { ...host, async close() { await act(async () => root.unmount()); host.restore(); } };
}

test("aspect choices stay in one measured row or move into a glyph dropdown", async () => {
  const host = createReactHost();
  const measures: ResizeObserverCallback[] = [];
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { measures.push(callback); }
    observe() {}
    disconnect() {}
  });
  const change = vi.fn();
  const options = ["16:9", "9:16", "1:1"].map((value) => ({ value, label: value }));
  const mounted = await mount(<GenerationParameter field={{ id: "aspectRatio", label: "Aspect ratio", type: "choice", options }} value="16:9" onChange={change} />, host);
  try {
    const group = host.container.querySelector(".generation-choices")!;
    const control = host.container.querySelector(".generation-choice-control")!;
    expect(group.getAttribute("data-collapsed")).toBe("false");
    expect(host.container.querySelector("[role='combobox']")).toBeNull();
    await act(async () => group.querySelectorAll("button")[1]!.dispatchEvent(new Event("click", { bubbles: true })));
    expect(change).toHaveBeenLastCalledWith("9:16");
    control.clientWidth = 200;
    group.scrollWidth = 260;
    await act(async () => measures.forEach((measure) => measure([], {} as ResizeObserver)));
    expect(group.getAttribute("aria-hidden")).toBe("true");
    expect(group.querySelectorAll("button").every((button) => button.tabIndex === -1)).toBe(true);
    const select = host.container.querySelector("[role='combobox']")!;
    expect(select.getAttribute("aria-label")).toBe("Aspect ratio");
    expect(select.textContent).toContain("16:9");
    expect(select.querySelector("rect")).not.toBeNull();
    control.clientWidth = 300;
    await act(async () => measures.forEach((measure) => measure([], {} as ResizeObserver)));
    expect(group.getAttribute("data-collapsed")).toBe("false");
    expect(host.container.querySelector("[role='combobox']")).toBeNull();
  } finally { await mounted.close(); vi.unstubAllGlobals(); }
  const menu = vi.spyOn(selectMenu, "SelectMenu");
  const many = await mount(<GenerationParameter field={{ id: "aspectRatio", label: "Aspect ratio", type: "choice", options: [...options, ...["4:3", "3:4", "21:9", "auto"].map((value) => ({ value, label: value }))] }} value="21:9" onChange={change} />);
  try {
    expect(many.container.querySelector(".generation-choices")).toBeNull();
    expect(many.container.querySelector("[role='combobox']")?.textContent).toContain("21:9");
    const props = menu.mock.calls.at(-1)![0];
    expect(props.contentClassName).toBe("generation-aspect-menu");
    expect(props.options.map((option) => option.value)).toEqual(["auto", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]);
    expect(props.options[0]!.label).toBe("Auto");
  } finally { await many.close(); }
});
async function enter(node: HostNode, value: string) {
  const input = node as unknown as HTMLInputElement;
  Object.assign(input, { attachEvent() {}, detachEvent() {} });
  await act(async () => {
    input.dispatchEvent(new Event("focusin", { bubbles: true })); input.value = value;
    input.dispatchEvent(new Event("keyup", { bubbles: true })); input.dispatchEvent(new Event("focusout", { bubbles: true }));
  });
}

test("rulers save provider values instead of slider indexes, and long durations stay editable", async () => {
  const change = vi.fn();
  const host = await mount(<><GenerationParameter field={model.fields[0]!} value="10" onChange={change} /><GenerationParameter field={{ id: "musicDuration", label: "Music duration", type: "number", min: 3, max: 600, step: 1 }} value={30} onChange={change} /><GenerationParameter field={{ id: "promptInfluence", label: "Prompt influence", type: "number", min: 0, max: 1, step: 0.01 }} value={0.4} onChange={change} /></>);
  try {
    const ruler = host.container.querySelector("#generation-duration")!;
    expect((ruler as unknown as HTMLInputElement).value).toBe("7");
    expect(ruler.getAttribute("aria-valuetext")).toBe("10 seconds");
    await enter(ruler, "12"); expect(change).toHaveBeenLastCalledWith("15");
    const long = host.container.querySelectorAll("input").find((node) => node.getAttribute("aria-label") === "Music duration")!;
    expect((long as unknown as HTMLInputElement).type).toBe("number");
    await enter(long, "137"); expect(change).toHaveBeenLastCalledWith(137);
    const influence = host.container.querySelector("#generation-promptInfluence")!;
    expect(influence.getAttribute("aria-valuetext")).toBe("40 percent");
    await enter(influence, "0.63"); expect(change).toHaveBeenLastCalledWith(0.63);
    expect(host.container.textContent).toContain("Loose"); expect(host.container.textContent).toContain("Literal");
  } finally { await host.close(); }
});

test("a cost belongs to the complete draft and newer failed estimates invalidate old prices", () => {
  const run = estimate();
  expect(generationCost(generationEstimate([run], draft, model))).toBe(7.2);
  expect(generationEstimate([run], { ...draft, parameters: { aspectRatio: "16:9", duration: "10" } }, model)).toBe(run);
  for (const changed of [{ ...draft, prompt: "Another idea" }, { ...draft, variants: 3 as const }, { ...draft, provider: "other" }, { ...draft, parameters: { ...draft.parameters, duration: "15" } }, { ...draft, inputs: [{ role: "firstFrame", asset: { path: "/frame.png", name: "Frame", kind: "image" as const } }] }]) expect(generationEstimate([run], changed, model)).toBeUndefined();
  expect(generationCost(generationEstimate([run, { ...run, id: "new", startedAt: 3, status: "failed" }], draft, model))).toBeNull();
  run.nodes[0]!.estimatedCostUsd = null; expect(generationCost(run)).toBeNull();
  run.nodes[0]!.estimatedCostUsd = 0; expect(generationCost(run)).toBe(0);
});

test("motion frames use distinct roles and invalid drops explain the problem without importing", async () => {
  const imported = vi.fn().mockResolvedValue(null);
  const host = await mount(<GenerationInputs workspaceId="workspace" model={model} draft={draft} importing={false} onImport={imported} onChange={vi.fn()} />);
  const button = (label: string) => host.container.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === label)!;
  const drop = (name: string) => {
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { files: [new File(["sample"], name)], types: ["Files"] } });
    return act(async () => button("Add last frame").dispatchEvent(event));
  };
  try {
    await act(async () => button("Add first frame").dispatchEvent(new Event("click", { bubbles: true })));
    expect(imported).toHaveBeenCalledWith("firstFrame", undefined); imported.mockClear();
    await drop("clip.mp4"); expect(imported).not.toHaveBeenCalled(); expect(host.container.querySelector("[role='alert']")?.textContent).toBe("Image files only");
    await drop("frame.png"); expect(imported).toHaveBeenCalledWith("lastFrame", expect.any(File)); expect(host.container.querySelector("[role='alert']")).toBeNull();
  } finally { await host.close(); }
});
