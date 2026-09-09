import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { CanvasNodeInspector } from "../src/features/workflow-canvas/ui/CanvasNodeInspector";
import { CanvasNodeBody } from "../src/features/workflow-canvas/ui/CanvasNodeBody";
import { CanvasNodeResults } from "../src/features/workflow-canvas/ui/CanvasNodeMedia";
import { CanvasNodeCard } from "../src/features/workflow-canvas/ui/CanvasNodeCard";
import { CanvasModelNode } from "../src/features/workflow-canvas/ui/CanvasModelNode";
import { ReactFlowProvider, Position } from "@xyflow/react";
import { CanvasWire, canvasWirePath, canvasWireType } from "../src/features/workflow-canvas/ui/CanvasWire";
import type { CanvasNodeData } from "../src/features/workflow-canvas/ui/canvas-node-types";
import { createReactHost } from "./react-host";
import { canvasModelFields } from "../src/features/workflow-canvas/model/model-fields";
import { generationArguments } from "../electron/canvas/runtime-plan";

test("rich model nodes expose only catalog-supported controls and truthful output states", () => {
  const data: CanvasNodeData = { node: { id: "model", kind: "model", title: "Animate", value: "Slow dolly", x: 0, y: 0, config: { modelId: "video-model", provider: "openrouter", modality: "video" } }, onPatch: vi.fn(), model: { id: "video-model", name: "Video Model", provider: "openrouter", modality: "video", description: "", available: true, parameters: { aspects: ["16:9", "9:16"], durations: [5, 10] } } };
  const markup = renderToStaticMarkup(<CanvasNodeBody data={data} />);
  expect(markup).toContain("Aspect ratio");
  expect(markup).toContain("Duration");
  expect(markup).not.toContain("Resolution");
  expect(markup).toContain("Slow dolly");
  expect(markup).toContain("Connected");
  expect(markup).not.toContain("Completed");
  expect(markup).toContain('role="combobox"');
  expect(markup).not.toContain("<details");
  expect(markup).toContain('aria-label="Animate variations"');
  const empty = renderToStaticMarkup(<CanvasNodeResults data={{ ...data, node: { ...data.node, kind: "output" } }} />);
  expect(empty).toContain("Real outputs appear here after a run.");
  expect(empty).not.toContain("<img");
});

test("inspector resolution controls use the runtime parameter for each media format", () => {
  for (const modality of ["image", "video"] as const) {
    const fields = canvasModelFields({ id: "test/model", name: "Model", provider: "openrouter", modality, description: "", available: true, parameters: { resolutions: ["720p"], aspects: ["auto", "16:9"] } });
    const resolution = fields.find((field) => field.label === "Resolution")!;
    const args = generationArguments({ id: "model", kind: "model", title: "Model", value: "A quiet forest", x: 0, y: 0, config: { modelId: "test/model", provider: "openrouter", modality, parameters: { [resolution.id]: "720p" } } }, [], "test");
    expect(args).toContain(modality === "image" ? "--size" : "--resolution");
    expect(fields.find((field) => field.id === "aspectRatio")!.options?.filter((option) => option.value === "auto")).toHaveLength(1);
  }
});


test("connector choices describe what passes downstream", () => {
  const data: CanvasNodeData = { node: { id: "merge", kind: "connector", title: "Merge", value: "", x: 0, y: 0, config: { operation: "select-first" } }, inputs: [{ port: "input", source: "Keyframe", preview: "Image" }, { port: "input", source: "Alternate", preview: "Image" }], onPatch: vi.fn() };
  const markup = renderToStaticMarkup(<CanvasNodeBody data={data} />);
  expect(markup).toContain("Pass to the next step");
  expect(markup).toContain("First only");
  expect(markup).toContain("Pass only the first incoming result onward.");
  expect(markup).toContain('role="combobox"');
  expect(markup).toContain("2 sources");
  expect(markup).toContain("Keyframe");
  expect(markup).toContain("Alternate");
  expect(markup).toContain("First result");
  expect(markup).not.toContain("Last run");
});

test("selecting a real variation preserves its node settings", async () => {
  const onPatch = vi.fn();
  const data: CanvasNodeData = { node: { id: "variations", kind: "variation", title: "Directions", value: "", x: 0, y: 0, config: { variants: 3, provider: "openrouter" } }, onPatch, results: [{ id: "result-1", nodeId: "model", kind: "text", label: "First direction", text: "Warm editorial light" }] };
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  try {
    await act(async () => root.render(<CanvasNodeResults data={data} />));
    await act(async () => host.container.querySelector("button")!.dispatchEvent(new Event("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith("variations", { config: { variants: 3, provider: "openrouter", selectedResultId: "result-1" } });
  } finally {
    await act(async () => root.unmount());
    host.restore();
  }
});

test("instrument nodes expose wired input provenance and bound the variation stepper", async () => {
  const onPatch = vi.fn();
  const data: CanvasNodeData = { node: { id: "image", kind: "model", title: "Keyframe", value: "Hard noon light", x: 0, y: 0, config: { modelId: "image-model", modality: "image", variants: 4 } }, inputs: [{ port: "prompt", source: "Creative brief", preview: "Terracotta still life" }], onPatch };
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  try {
    await act(async () => root.render(<CanvasNodeBody data={data} />));
    expect(host.container.textContent).toContain("Creative brief");
    expect(renderToStaticMarkup(<CanvasNodeBody data={data} />)).toContain("Terracotta still life");
    expect(host.container.textContent).toContain("Using connected text. Disconnect to restore your manual prompt");
    expect(host.container.querySelector("textarea")?.disabled).toBe(true);
    data.inputs = [];
    await act(async () => root.render(<CanvasNodeBody data={data} />));
    expect(host.container.querySelector("textarea")?.disabled).toBe(false);
    expect((host.container.querySelector("textarea") as unknown as HTMLTextAreaElement).value).toBe("Hard noon light");
    const button = (label: string) => [...host.container.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === label)!;
    expect(button("Increase keyframe variations").getAttribute("disabled")).not.toBeNull();
    await act(async () => button("Decrease keyframe variations").dispatchEvent(new Event("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith("image", { config: { modelId: "image-model", modality: "image", variants: 3 } });
  } finally { await act(async () => root.unmount()); host.restore(); }
});

test("node activity uses actual run status and estimates without invented percentages", () => {
  const data: CanvasNodeData = { node: { id: "image", kind: "model", title: "Keyframe", value: "Terracotta", x: 0, y: 0, config: { modelId: "image-model", modality: "image" } }, onPatch: vi.fn(), onRun: vi.fn(), onStop: vi.fn(), run: { nodeId: "image", status: "running", startedAt: 1, endedAt: null, coreRunIds: [], results: [], error: null, estimatedCostUsd: .04 } };
  const render = () => renderToStaticMarkup(<ReactFlowProvider><CanvasNodeCard id="image" data={data} type="canvas" selected={true} dragging={false} isConnectable={true} draggable={true} selectable={true} deletable={true} zIndex={0} positionAbsoluteX={0} positionAbsoluteY={0} /></ReactFlowProvider>);
  const running = render();
  expect(running).toContain('data-state="running"');
  expect(running).toContain('data-selected="true"');
  expect(running).toContain("Stop run");
  expect(running).toContain("$0.0400 estimated · this step");
  expect(running).not.toMatch(/\d+%|animate-spin/);
  data.run = { ...data.run!, status: "failed", error: "Provider rate limit" };
  const failed = render();
  expect(failed).toContain("Provider rate limit");
  expect(failed).toContain("Retry");
  expect(failed).toContain("Terracotta");
  expect(failed).not.toContain("Stop run");
});

test("canvas wires keep their ports horizontal at short, long and reversed distances", () => {
  expect(canvasWirePath(0, 10, 20, 30)).toBe("M 0,10 C 46,10 -26,30 20,30");
  expect(canvasWirePath(0, 10, 200, 30)).toBe("M 0,10 C 90,10 110,30 200,30");
  expect(canvasWirePath(200, 30, 0, 10, Position.Left, Position.Right)).toBe("M 200,30 C 110,30 90,10 0,10");
});

test("wires preserve their data type, including universal endpoints and selected wires", () => {
  for (const type of ["text", "image", "video", "audio"] as const) {
    expect(canvasWireType(type, "any")).toBe(type);
    expect(canvasWireType("any", type)).toBe(type);
    const markup = renderToStaticMarkup(<svg><CanvasWire id="wire" source="from" target="to" sourceX={0} sourceY={0} targetX={200} targetY={0} sourcePosition={Position.Right} targetPosition={Position.Left} selected data={{ portType: canvasWireType(type, "any") }} /></svg>);
    expect(markup).toContain(`data-port-type="${type}"`);
    expect(markup).toContain("canvas-wire-selected");
  }
  expect(canvasWireType("any", "any")).toBe("any");
  expect(canvasWireType()).toBe("any");
});

test("video nodes require a manual or connected text prompt before running", async () => {
  const data: CanvasNodeData = { node: { id: "video", kind: "model", title: "Hero clip", value: "", x: 0, y: 0, config: { modelId: "video-model", provider: "openrouter", modality: "video" } }, model: { id: "video-model", name: "Video", provider: "openrouter", modality: "video", available: true, description: "", parameters: {} }, onPatch: vi.fn(), onRun: vi.fn(), inputs: [{ port: "reference", source: "Keyframe", preview: "A product photo" }] };
  const host = createReactHost(); const root = createRoot(host.container as unknown as Element);
  const render = () => act(async () => root.render(<CanvasModelNode data={data} />));
  const run = () => [...host.container.querySelectorAll("button")].find((button) => button.textContent?.startsWith("Generate"))!;
  const prompt = () => [...host.container.querySelectorAll("textarea")].find((field) => field.getAttribute("aria-label") === "Hero clip prompt");
  try {
    await render();
    expect(run().disabled).toBe(true);
    expect(prompt()?.getAttribute("aria-required")).toBe("true");
    expect(host.container.textContent).toContain("Prompt required");
    data.node = { ...data.node, value: "Slow orbit around the product" };
    await render(); expect(run().disabled).toBe(false);
    data.node = { ...data.node, value: "" };
    data.inputs = [{ port: "prompt", source: "Script", preview: "Slow orbit" }];
    await render(); expect(run().disabled).toBe(false);
    expect(prompt()?.getAttribute("aria-required")).toBe("false");
    data.inputs = [];
    data.results = [{ id: "clip", nodeId: "video", kind: "video", label: "Previous clip" }];
    await render();
    expect(prompt()?.closest("details")).toBeNull();
    const rerun = run();
    expect(rerun.disabled).toBe(true);
  } finally { await act(async () => root.unmount()); host.restore(); }
});

test("node titles are drag surfaces until the rename action is chosen", async () => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 0; });
  const data: CanvasNodeData = { node: { id: "brief", kind: "prompt", title: "Creative brief", value: "A quiet forest", x: 0, y: 0 }, onPatch: vi.fn() };
  const host = createReactHost(); const root = createRoot(host.container as unknown as Element);
  try {
    await act(async () => root.render(<ReactFlowProvider><CanvasNodeCard id="brief" data={data} type="canvas" selected={true} dragging={false} isConnectable={true} draggable={true} selectable={true} deletable={true} zIndex={0} positionAbsoluteX={0} positionAbsoluteY={0} /></ReactFlowProvider>));
    const header = host.container.querySelector("header")!;
    expect(header.querySelector("input")).toBeNull();
    await act(async () => header.dispatchEvent(new Event("click", { bubbles: true })));
    expect(header.querySelector("input")).toBeNull();
    const rename = [...header.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === "Rename Creative brief")!;
    await act(async () => rename.dispatchEvent(new Event("click", { bubbles: true })));
    expect(header.querySelector("input")).not.toBeNull();
    await act(async () => header.querySelector("input")!.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: "Escape" })));
    expect(header.querySelector("input")).toBeNull();
    expect(data.onPatch).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.restore(); vi.unstubAllGlobals(); }
});


test("inspector does not claim a model output exists just because its prompt is filled", () => {
  const data: CanvasNodeData = { node: { id: "image", kind: "model", title: "Keyframe", value: "A quiet forest", x: 0, y: 0, config: { modality: "image" } }, onPatch: vi.fn() };
  const markup = renderToStaticMarkup(<CanvasNodeInspector data={data} onClose={() => {}} onDisconnect={() => {}} />);
  expect(markup).toContain("Available after this step runs");
  expect(markup).toContain("Manual prompt");
});
