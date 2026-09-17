import type { CanvasRun } from "../../shared/canvas-runtime";
import { parseCanvas } from "../../shared/workflow-canvas";
const statuses = ["pending", "running", "succeeded", "failed", "cancelled"];
const string = (value: unknown, max = 100_000) => typeof value === "string" && value.length <= max;
const time = (value: unknown) => value === null || typeof value === "number" && Number.isFinite(value) && value >= 0;
/** Run files are user-editable disk input, not trusted IPC records. */
export function parseCanvasRun(value: unknown, id: string, workspaceId: string, canvasId: string): CanvasRun {
  const run = value as CanvasRun;
  if (!run || run.id !== id || run.workspaceId !== workspaceId || run.canvasId !== canvasId || !string(run.canvasRevision, 64) || !["preview", "execute"].includes(run.mode) || !statuses.includes(run.status) || typeof run.startedAt !== "number" || !time(run.startedAt) || !time(run.endedAt) || !(run.error === null || string(run.error)) || !Array.isArray(run.nodes) || run.nodes.length > 100) throw new Error("Invalid canvas run record");
  run.snapshot = parseCanvas(run.snapshot);
  if (run.snapshot.id !== canvasId) throw new Error("Canvas run snapshot identity does not match");
  for (const node of run.nodes) {
    if (!node || !run.snapshot.nodes.some((item) => item.id === node.nodeId) || !statuses.includes(node.status) || !time(node.startedAt) || !time(node.endedAt) || !(node.error === null || string(node.error)) || !Array.isArray(node.results) || node.results.length > 400 || !(node.estimatedCostUsd === null || typeof node.estimatedCostUsd === "number" && Number.isFinite(node.estimatedCostUsd) && node.estimatedCostUsd >= 0)) throw new Error("Invalid canvas node run record");
    node.coreRunIds = [];
    for (const result of node.results) {
      if (!result || !string(result.id, 256) || result.nodeId !== node.nodeId || !["text", "image", "video", "audio"].includes(result.kind) || !string(result.label, 2000) || !(result.text === undefined || string(result.text)) || result.asset && (!string(result.asset.path, 4096) || !string(result.asset.name, 2000) || result.asset.kind !== result.kind)) throw new Error("Invalid canvas result record");
      delete result.previewUrl;
      delete result.unavailableReason;
      delete result.coreRef;
    }
  }
  return run;
}
