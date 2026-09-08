import type { Node } from "@xyflow/react";
import type { CanvasNode } from "../../../../shared/workflow-canvas";
import type { CanvasModelDescriptor, CanvasNodeRun, CanvasRunResult } from "../../../../shared/canvas-runtime";
import type { CanvasNodeReadiness } from "../../../../shared/canvas-readiness";

export type CanvasNodeData = {
  node: CanvasNode;
  workspaceId?: string;
  choosingModel?: boolean;
  onPatch(id: string, patch: Partial<CanvasNode>): void;
  onChooseAsset?(id: string): void;
  onChooseModel?(id: string, opener?: HTMLButtonElement): void;
  onEstimate?(id: string): void;
  onRun?(id: string): void;
  onInspect?(id: string): void;
  onPreview?(id: string, result?: CanvasRunResult): void;
  onDuplicate?(id: string): void;
  onDelete?(id: string): void;
  onSelectResult?(id: string, resultId: string): void;
  onStop?(): void;
  onShowLog?(): void;
  inputs?: { port: string; source: string; preview: string; previewUrl?: string; kind?: CanvasRunResult["kind"] }[];
  mediaUrl?: string;
  posterUrl?: string;
  model?: CanvasModelDescriptor;
  readiness?: CanvasNodeReadiness;
  execution?: "included" | "outside" | "reused";
  run?: CanvasNodeRun;
  runMode?: "preview" | "execute";
  results?: CanvasRunResult[];
  disabled?: boolean;
};

export type CanvasFlowNode = Node<CanvasNodeData, "canvas">;
