import { expect, test } from "vitest";
import { canvasReadiness } from "../shared/canvas-readiness";
import { selectedCanvasNodes, type WorkflowCanvas } from "../shared/workflow-canvas";
import type { CanvasModelDescriptor, CanvasRun } from "../shared/canvas-runtime";

const models: CanvasModelDescriptor[] = ["text", "video", "audio"].map((modality) => ({ id: modality, name: modality, provider: "test", modality: modality as CanvasModelDescriptor["modality"], available: true, description: "", parameters: {} }));
const graph = (): WorkflowCanvas => ({ version: 2, id: "readiness", name: "Readiness", nodes: [
  { id: "brief", kind: "prompt", title: "Brief", value: "A summer launch", x: 0, y: 0 },
  { id: "llm", kind: "model", title: "Script", value: "", x: 300, y: 0, config: { modelId: "text", provider: "test", modality: "text" } },
  { id: "video", kind: "model", title: "Video", value: "", x: 600, y: 0, config: { modelId: "video", provider: "test", modality: "video" } },
], edges: [{ from: "brief", to: "llm", targetPort: "prompt" }, { from: "llm", to: "video", targetPort: "prompt" }] });

test("current inputs determine readiness through the pipeline, including empty sources and unavailable models", () => {
  const canvas = graph();
  expect(canvasReadiness(canvas, models).get("video")).toMatchObject({ ready: true, prompt: "connected", runsUpstream: true });
  canvas.nodes[0].value = " ";
  expect(canvasReadiness(canvas, models).get("video")).toMatchObject({ ready: false, prompt: "missing" });
  canvas.nodes[1].value = "Manual instructions";
  // An attached empty source must be fixed or disconnected, even with local instructions.
  expect(canvasReadiness(canvas, models).get("video")?.ready).toBe(false);
  expect(canvasReadiness(canvas, models).get("llm")).toMatchObject({ prompt: "missing", issues: expect.arrayContaining(["Prompt required"]) });
  canvas.edges.shift();
  expect(canvasReadiness(canvas, models).get("video")?.ready).toBe(true);
  expect(canvasReadiness(canvas, models.map((model) => ({ ...model, available: model.modality !== "text" }))).get("video")?.ready).toBe(false);
});

test("voice is required for speech, while music needs only its prompt and model", () => {
  const canvas = graph();
  canvas.nodes = [{ ...canvas.nodes[2], id: "audio", value: "A calm introduction", config: { modelId: "audio", provider: "test", modality: "audio", operation: "voiceover" } }];
  canvas.edges = [];
  expect(canvasReadiness(canvas, models).get("audio")?.issues).toEqual(["Voice ID required"]);
  canvas.nodes[0].config!.parameters = { voice: "test-voice" };
  expect(canvasReadiness(canvas, models).get("audio")?.ready).toBe(true);
  canvas.nodes[0].config = { ...canvas.nodes[0].config, operation: "music", parameters: {} };
  expect(canvasReadiness(canvas, models).get("audio")?.ready).toBe(true);
});

test("a selected historical result bypasses unfinished upstream steps but must exist and match the target type", () => {
  const canvas = graph();
  canvas.nodes[0].value = "";
  canvas.nodes.splice(2, 0, { id: "choice", kind: "variation", title: "Choice", value: "", x: 450, y: 0, config: { selectedResultId: "saved-text" } });
  canvas.edges = [{ from: "brief", to: "llm" }, { from: "llm", to: "choice" }, { from: "choice", to: "video", targetPort: "prompt" }];
  const run: CanvasRun = { id: "run", canvasId: canvas.id, canvasRevision: "old", workspaceId: "test", mode: "execute", status: "succeeded", startedAt: 1, endedAt: 2, error: null, snapshot: canvas, nodes: [{ nodeId: "llm", status: "succeeded", startedAt: 1, endedAt: 2, coreRunIds: [], error: null, estimatedCostUsd: null, results: [{ id: "saved-text", nodeId: "llm", kind: "text", label: "Script", text: "A slow pan" }] }] };
  expect(selectedCanvasNodes(canvas, "video").map((node) => node.id)).toEqual(["choice", "video"]);
  expect(canvasReadiness(canvas, models, [run]).get("video")).toMatchObject({ ready: true, runsUpstream: false });
  expect(canvasReadiness(canvas, models, []).get("video")?.ready).toBe(false);
  run.nodes[0].results[0].kind = "image";
  expect(canvasReadiness(canvas, models, [run]).get("video")?.issues.join(" ")).toContain("needs text");
});
