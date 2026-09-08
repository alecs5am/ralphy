import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { CanvasLibrary } from "../src/features/workflow-canvas/ui/CanvasLibrary";
import { CanvasCatalog, filterCanvasModels } from "../src/features/workflow-canvas/ui/CanvasCatalog";
import { CanvasRunsPanel } from "../src/features/workflow-canvas/ui/CanvasRunsPanel";
import type { CanvasModelCatalog, CanvasRun } from "../shared/canvas-runtime";
import type { SavedCanvas } from "../shared/workflow-canvas";
import { createReactHost } from "./react-host";

const catalog: CanvasModelCatalog = { models: [
  { id: "studio-image", name: "Studio Image", provider: "provider", modality: "image", description: "Product photography", available: false, parameters: {} },
  { id: "motion", name: "Motion", provider: "provider", modality: "video", description: "Video generation", available: true, parameters: { durations: [5, 10] } },
], providers: [{ id: "provider", label: "Provider", available: false, capabilities: [] }], errors: [] };

test("catalog search combines words and modality without hiding unconnected models", () => {
  expect(filterCanvasModels(catalog.models, " PROVIDER photography ", "all").map((model) => model.id)).toEqual(["studio-image"]);
  expect(filterCanvasModels(catalog.models, "photography", "video")).toEqual([]);
  expect(filterCanvasModels(catalog.models, "", "video").map((model) => model.id)).toEqual(["motion"]);
});

test("an unconnected model stays selectable and communicates its availability", async () => {
  const host = createReactHost();
  const root = createRoot(host.container as unknown as Element);
  const onChoose = vi.fn();
  try {
    await act(async () => root.render(<CanvasCatalog catalog={catalog} loading={false} modality="image" onChoose={onChoose} onClose={() => {}} onRefresh={() => {}} />));
    const button = [...document.body.querySelectorAll("button")].find((item) => item.textContent.includes("Studio Image"))!;
    expect(button.textContent).toContain("Connect to run");
    expect(button.disabled).toBe(false);
    await act(async () => button.dispatchEvent(new Event("click", { bubbles: true })));
    expect(onChoose).toHaveBeenCalledWith(catalog.models[0]);
  } finally {
    await act(async () => root.unmount());
    host.restore();
  }
});

test("canvas library previews represent stored graphs and all five starters", () => {
  const item: SavedCanvas = { revision: "abc", path: "/canvas/a.json", canvas: { version: 2, id: "a", name: "Brand direction", nodes: [{ id: "a", kind: "prompt", title: "Brief", value: "", x: -200, y: 40 }, { id: "b", kind: "output", title: "Result", value: "", x: 700, y: 80 }], edges: [{ from: "a", to: "b" }] } };
  const markup = renderToStaticMarkup(<CanvasLibrary workspaceName="Studio" items={[item]} onCreate={() => {}} onSelect={() => {}} onReload={() => {}} />);
  for (const name of ["Blank canvas", "Idea to image", "Image concept", "Video pipeline", "Compare directions"]) expect(markup).toContain(name);
  expect(markup).toContain("Brand direction: 2 nodes and 1 connection");
  expect(markup).toContain('x="-200"');
  expect(markup).toContain('x="700"');
  expect(markup).not.toContain("NaN");
});

test("a preview with an unpriced LLM does not present media costs as the full workflow estimate", () => {
  const run: CanvasRun = { id: "preview", canvasId: "canvas", canvasRevision: "revision", workspaceId: "workspace", mode: "preview", status: "succeeded", startedAt: 1, endedAt: 2, error: null,
    snapshot: { version: 2, id: "canvas", name: "Idea to image", edges: [], nodes: ["writer", "image"].map((id) => ({ id, kind: "model", title: id, value: "", x: 0, y: 0 })) },
    nodes: ["writer", "image"].map((nodeId) => ({ nodeId, status: "succeeded", startedAt: 1, endedAt: 2, coreRunIds: [], results: [], error: null, estimatedCostUsd: nodeId === "image" ? 0.02 : null })) };
  const noop = () => {};
  const html = renderToStaticMarkup(<CanvasRunsPanel runs={[run]} selectedRun={run} expanded={false} running={false} onSelectRun={noop} onClose={noop} onExpand={noop} onCancel={noop} onUseResult={noop} onRestore={noop} onExecute={noop} />);
  expect(html).toContain("Partial generation estimate");
  expect(html).toContain("1 model step is not included.");
  expect(html).toContain("$0.02");
});
