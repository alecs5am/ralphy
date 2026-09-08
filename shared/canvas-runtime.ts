import type { CanvasAsset, WorkflowCanvas } from "./workflow-canvas";

export type CanvasModality = "text" | "image" | "video" | "audio";
export interface CanvasModelDescriptor {
  id: string;
  name: string;
  provider: string;
  modality: CanvasModality;
  description: string;
  available: boolean;
  inputModalities?: CanvasModality[];
  parameters: { durations?: number[]; resolutions?: string[]; aspects?: string[]; frames?: string[] };
}
export interface CanvasModelCatalog {
  models: CanvasModelDescriptor[];
  providers: { id: string; label: string; available: boolean; capabilities: string[] }[];
  errors: string[];
}
export type CanvasRunStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";
export interface CanvasRunResult {
  id: string;
  nodeId: string;
  kind: CanvasModality;
  label: string;
  text?: string;
  asset?: CanvasAsset;
  previewUrl?: string;
  coreRef?: { type: "object" | "run-object"; id: string };
}
export interface CanvasNodeRun {
  nodeId: string;
  status: CanvasRunStatus;
  startedAt: number | null;
  endedAt: number | null;
  coreRunIds: string[];
  results: CanvasRunResult[];
  error: string | null;
  estimatedCostUsd: number | null;
}
export interface CanvasRun {
  id: string;
  canvasId: string;
  canvasRevision: string;
  workspaceId: string;
  mode: "preview" | "execute";
  status: CanvasRunStatus;
  startedAt: number;
  endedAt: number | null;
  nodes: CanvasNodeRun[];
  error: string | null;
  snapshot: WorkflowCanvas;
}
export interface CanvasRunOptions { mode: "preview" | "execute"; expectedRevision: string; nodeId?: string }
export interface CanvasRuntimeBridge {
  loadCanvasModels(workspaceId: string): Promise<CanvasModelCatalog>;
  importCanvasAsset(workspaceId: string, file?: File): Promise<CanvasAsset | null>;
  loadCanvasAssetPreview(workspaceId: string, asset: CanvasAsset): Promise<string | null>;
  startCanvasRun(workspaceId: string, canvasId: string, options: CanvasRunOptions): Promise<CanvasRun>;
  loadCanvasRuns(workspaceId: string, canvasId: string): Promise<CanvasRun[]>;
  cancelCanvasRun(workspaceId: string, runId: string): Promise<CanvasRun>;
}
