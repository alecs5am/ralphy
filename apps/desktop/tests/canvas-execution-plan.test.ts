import { expect, test } from "vitest";
import { parseCanvas, selectedCanvasNodes, type WorkflowCanvas } from "../shared/workflow-canvas";
import { canvasExecutionPlan } from "../shared/canvas-execution-plan";

const graph = (): WorkflowCanvas => ({ version: 2, id: "plan", name: "Plan", nodes: [
  { id: "brief", kind: "prompt", title: "Brief", value: "Direction", x: 0, y: 0 },
  { id: "reference", kind: "media", title: "Reference", value: "", x: 0, y: 300 },
  { id: "image", kind: "model", title: "Image", value: "", x: 400, y: 0, config: { modality: "image" } },
  { id: "out", kind: "output", title: "Final image", value: "", x: 800, y: 0 },
  { id: "unused", kind: "model", title: "Unused writer", value: "Draft", x: 400, y: 400, config: { modality: "text" } },
], edges: [{ from: "brief", to: "image", targetPort: "prompt" }, { from: "reference", to: "image", targetPort: "reference" }, { from: "image", to: "out" }, { from: "brief", to: "unused" }] });

test("Run follows Output dependencies, includes independent sources, and excludes dead-end branches", () => {
  expect(selectedCanvasNodes(graph()).map((node) => node.id)).toEqual(["brief", "reference", "image", "out"]);
  expect(selectedCanvasNodes(graph(), "unused").map((node) => node.id)).toEqual(["brief", "unused"]);
  const plan = canvasExecutionPlan(graph());
  expect(plan.sources.map((node) => node.id)).toEqual(["brief", "reference"]);
  expect(plan.outside.map((node) => node.id)).toEqual(["unused"]);
  const canvas = graph();
  canvas.nodes = canvas.nodes.filter((node) => node.id !== "out"); canvas.edges = canvas.edges.filter((edge) => edge.to !== "out");
  expect(selectedCanvasNodes(canvas)).toEqual([]);
});

test("saved variations bypass their sources without labelling them disconnected", () => {
  const canvas = graph();
  canvas.nodes.push({ id: "choice", kind: "variation", title: "Selected image", value: "", x: 600, y: 0, config: { selectedResultId: "saved-image" } });
  canvas.edges = canvas.edges.filter((edge) => edge.to !== "out");
  canvas.edges.push({ from: "image", to: "choice" }, { from: "choice", to: "out" });
  const plan = canvasExecutionPlan(canvas);
  expect(plan.nodes.map((node) => node.id)).toEqual(["choice", "out"]);
  expect(plan.reused.map((node) => node.id)).toEqual(["brief", "reference", "image"]);
  expect(plan.outside.map((node) => node.id)).toEqual(["unused"]);
});

test("a free board runs only the chosen step and its dependencies without marking experiments outside", () => {
  const canvas = { ...graph(), mode: "board" as const };
  expect(selectedCanvasNodes(canvas)).toEqual([]);
  expect(selectedCanvasNodes(canvas, "unused").map((node) => node.id)).toEqual(["brief", "unused"]);
  expect(canvasExecutionPlan(canvas).outside).toEqual([]);
  const persisted = parseCanvas({ ...canvas, edges: [] });
  expect(persisted.mode).toBe("board");
  expect(canvasExecutionPlan({ ...canvas, mode: "workflow" }).outside.map((node) => node.id)).toEqual(["unused"]);
  expect(() => parseCanvas({ ...canvas, mode: "invalid" })).toThrow("Invalid canvas mode");
});
