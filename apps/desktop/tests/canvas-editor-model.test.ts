import { webcrypto } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { parseCanvas, CANVAS_KINDS } from "../shared/workflow-canvas";
import { CANVAS_CREATION_CHOICES, connectionToNewNode, createNodeFromChoice, connectCanvas } from "../src/features/workflow-canvas/model/node-creation";
import { canvasNodeWidth } from "../src/features/workflow-canvas/model/node-layout";
import { connectionProblem } from "../shared/canvas-ports";
import { arrangeCanvas, canvasNodeHeight, copyCanvas, createCanvasHistory, duplicateCanvasNodes, moveCanvasHistory, newCanvas, newCanvasNode, NODE_LABELS, recordCanvasEdit } from "../src/features/workflow-canvas/model/canvas-editor";

afterEach(() => vi.unstubAllGlobals());
function setup() { vi.stubGlobal("crypto", webcrypto); }

test("all templates use compatible typed ports and leave models and results unconfigured", () => {
  setup();
  expect(Object.keys(NODE_LABELS).sort()).toEqual([...CANVAS_KINDS].sort());
  for (const template of ["blank", "image", "video", "comparison"] as const) {
    const canvas = newCanvas(template);
    expect(canvas.version).toBe(2);
    expect(parseCanvas(canvas)).toEqual(canvas);
    for (const edge of canvas.edges) expect(connectionProblem({ ...canvas, edges: canvas.edges.filter((item) => item !== edge) }, edge)).toBeNull();
    for (const node of canvas.nodes) {
      expect(node.config?.modelId).toBeUndefined();
      expect(node.config?.selectedResultId).toBeUndefined();
      expect(node.config?.asset).toBeUndefined();
    }
  }
  expect(newCanvas("comparison").nodes.filter((node) => node.kind === "model")).toHaveLength(2);
  expect(newCanvasNode("model", { x: -80, y: 120 }, "video").config?.modality).toBe("video");
});

test("duplicating nodes remaps only internal connections and clones settings", () => {
  setup();
  const source = newCanvas("image");
  const selected = source.nodes.slice(0, 2);
  selected[1]!.config!.parameters = { seed: 12 };
  const next = duplicateCanvasNodes(source, selected.map((node) => node.id));
  const copies = next.nodes.slice(source.nodes.length);
  expect(copies).toHaveLength(2);
  expect(next.edges.at(-1)).toEqual({ from: copies[0]!.id, to: copies[1]!.id, sourcePort: "text", targetPort: "prompt" });
  expect(next.edges).toHaveLength(source.edges.length + 1);
  expect(copies[1]!.config).toEqual(selected[1]!.config);
  copies[1]!.config!.parameters!.seed = 99;
  expect(selected[1]!.config!.parameters!.seed).toBe(12);
  expect(parseCanvas(next)).toEqual(next);
  const full = copyCanvas(source);
  expect(full.id).not.toBe(source.id);
  expect(full.name).toContain("(copy)");
  expect(full.nodes.some((node) => source.nodes.some((old) => old.id === node.id))).toBe(false);
  expect(parseCanvas(full)).toEqual(full);
});

test("DAG arrangement is deterministic with separated columns and variable-height siblings", () => {
  setup();
  const canvas = newCanvas("comparison");
  const arranged = arrangeCanvas(canvas);
  expect(arrangeCanvas(arranged)).toEqual(arranged);
  for (const edge of arranged.edges) {
    const from = arranged.nodes.find((node) => node.id === edge.from)!;
    const to = arranged.nodes.find((node) => node.id === edge.to)!;
    expect(to.x - from.x).toBeGreaterThanOrEqual(404);
  }
  const models = arranged.nodes.filter((node) => node.kind === "model");
  expect(models[0]!.x).toBe(models[1]!.x);
  expect(models[1]!.y - models[0]!.y).toBeGreaterThan(canvasNodeHeight(models[0]!));
});

test("history coalesces text, undoes gestures separately, clears redo and caps snapshots", () => {
  setup();
  const canvas = newCanvas("blank");
  const history = createCanvasHistory();
  recordCanvasEdit(history, canvas, { coalesceKey: "name" }, 1000);
  recordCanvasEdit(history, { ...canvas, name: "A" }, { coalesceKey: "name" }, 1200);
  expect(history.past).toHaveLength(1);
  const renamed = { ...canvas, name: "AB" };
  recordCanvasEdit(history, renamed, {}, 1300);
  const moved = { ...renamed, viewport: { x: 20, y: 0, zoom: 1 } };
  expect(moveCanvasHistory(history, moved, "undo")).toEqual(renamed);
  expect(moveCanvasHistory(history, renamed, "undo")).toEqual(canvas);
  expect(moveCanvasHistory(history, canvas, "redo")).toEqual(renamed);
  recordCanvasEdit(history, renamed, { coalesceKey: "name" }, 2000);
  expect(history.future).toEqual([]);
  for (let i = 0; i < 50; i++) recordCanvasEdit(history, { ...canvas, name: String(i) });
  expect(history.past).toHaveLength(40);
  expect(history.past[0]!.name).toBe("10");
});


test("resized and locked frames persist, validate bounds and arrange around variable widths", () => {
  setup();
  const canvas = newCanvas("image");
  canvas.nodes[0] = { ...canvas.nodes[0]!, width: 760, locked: true };
  expect(parseCanvas(canvas)).toEqual(canvas);
  const arranged = arrangeCanvas(canvas);
  expect(arranged.nodes[0]).toEqual(canvas.nodes[0]);
  expect(arranged.nodes[1]!.x).toBeGreaterThanOrEqual(canvas.nodes[0]!.x + canvasNodeWidth(canvas.nodes[0]!) + 100);
  expect(canvasNodeHeight({ ...canvas.nodes[1]!, width: 640, config: { modality: "video", parameters: { aspectRatio: "16:9" } } })).toBe(360);
  for (const width of [239, 961, Infinity, NaN, "304"]) expect(() => parseCanvas({ ...canvas, nodes: [{ ...canvas.nodes[0], width }] })).toThrow("Invalid node width");
  expect(() => parseCanvas({ ...canvas, nodes: [{ ...canvas.nodes[0], locked: "yes" }] })).toThrow("Invalid node lock");
});

test("wire creation matches actual compatible ports in both directions", () => {
  setup();
  const image = newCanvasNode("model", undefined, "image");
  const canvas = { ...newCanvas("blank"), nodes: [image] };
  const choice = (id: string) => createNodeFromChoice(CANVAS_CREATION_CHOICES.find((item) => item.id === id)!, { x: 640, y: 120 });
  const origin = { nodeId: image.id, portId: "result", direction: "output" as const };
  const video = choice("video");
  const edge = connectionToNewNode(canvas, video, origin)!;
  expect(edge).toEqual({ from: image.id, sourcePort: "result", to: video.id, targetPort: "reference" });
  expect(connectionToNewNode(canvas, choice("llm"), origin)).toBeNull();
  const prompt = createNodeFromChoice(CANVAS_CREATION_CHOICES[0], { x: image.x - 100, y: image.y }, "input");
  expect(prompt.x + canvasNodeWidth(prompt)).toBeLessThan(image.x - 100);
  expect(connectionToNewNode(canvas, prompt, { nodeId: image.id, portId: "prompt", direction: "input" })).toEqual({ from: prompt.id, sourcePort: "text", to: image.id, targetPort: "prompt" });
  const connected = connectCanvas({ ...canvas, nodes: [image, video] }, edge);
  expect(parseCanvas(connected)).toEqual(connected);
  expect(connectionToNewNode(canvas, video, { ...origin, nodeId: "missing" })).toBeNull();
});

test("connecting replaces an ordinary input atomically and preserves collection fan-in", () => {
  setup();
  const canvas = newCanvas("image");
  const alternative = newCanvasNode("prompt");
  const model = canvas.nodes.find((node) => node.kind === "model")!;
  const graph = { ...canvas, nodes: [...canvas.nodes, alternative] };
  const edge = { from: alternative.id, to: model.id, sourcePort: "text", targetPort: "prompt" };
  const next = connectCanvas(graph, edge);
  expect(next.edges.filter((item) => item.to === model.id)).toEqual([edge]);
  expect(graph.edges).toEqual(canvas.edges);
  const collection = newCanvasNode("connector");
  const first = connectCanvas({ ...next, nodes: [...next.nodes, collection] }, { from: alternative.id, to: collection.id, sourcePort: "text", targetPort: "input" });
  const second = connectCanvas(first, { from: model.id, to: collection.id, sourcePort: "result", targetPort: "input" });
  expect(second.edges.filter((item) => item.to === collection.id)).toHaveLength(2);
  expect(() => connectCanvas(next, { ...edge, sourcePort: "missing" })).toThrow();
});
