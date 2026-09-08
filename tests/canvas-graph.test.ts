import { expect, test } from "vitest";
import { parseCanvas, type WorkflowCanvas } from "../shared/workflow-canvas";
import { canvasNodePorts, connectionProblem } from "../shared/canvas-ports";

const graph = (): WorkflowCanvas => ({ version: 2, id: "studio", name: "Cover studio", viewport: { x: -120, y: 40, zoom: 0.8 }, nodes: [
  { id: "brief", kind: "prompt", title: "Creative brief", value: "A calm cover", x: -400, y: 0 },
  { id: "image", kind: "model", title: "Image generation", value: "", x: 0, y: 0, config: { modelId: "image-model", provider: "openrouter", modality: "image", variants: 3, parameters: { aspectRatio: "16:9", seed: 42 } } },
  { id: "out", kind: "output", title: "Result", value: "", x: 400, y: 0 },
], edges: [{ from: "brief", to: "image", sourcePort: "text", targetPort: "prompt" }, { from: "image", to: "out", sourcePort: "result", targetPort: "input" }] });

test("typed canvas documents preserve model settings, negative positions and viewport", () => {
  expect(parseCanvas(graph())).toEqual(graph());
  expect(canvasNodePorts(graph().nodes[1]!).outputs[0]?.type).toBe("image");
  const invalid = { from: "image", to: "image", sourcePort: "result", targetPort: "prompt" };
  expect(connectionProblem(graph(), invalid)).toBeTruthy();
  expect(() => parseCanvas({ ...graph(), edges: [invalid] })).toThrow();
});

test("connections reject wrong media types and unknown handles", () => {
  const canvas = graph();
  canvas.nodes.push({ id: "text-model", kind: "model", title: "Writer", value: "", x: 0, y: 400, config: { modality: "text" } });
  expect(connectionProblem(canvas, { from: "image", to: "text-model", sourcePort: "result", targetPort: "prompt" })).toMatch(/image.*text/i);
  expect(connectionProblem(canvas, { from: "brief", to: "image", sourcePort: "missing", targetPort: "prompt" })).toMatch(/port/i);
});

test("canvas configuration refuses excessive variants, credentials and malformed media", () => {
  for (const config of [{ variants: 99 }, { parameters: { api_key: "secret" } }, { asset: { path: "https://remote/image.png", name: "Image", kind: "image" } }]) {
    const canvas = graph(); canvas.nodes[1]!.config = config as never;
    expect(() => parseCanvas(canvas)).toThrow();
  }
});
