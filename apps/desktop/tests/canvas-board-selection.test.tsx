import { act } from "react";
import { expect, test, vi } from "vitest";
import type { NodeChange } from "@xyflow/react";
import { CanvasBoard } from "../src/features/workflow-canvas/ui/CanvasBoard";
import type { CanvasFlowNode, CanvasNodeData } from "../src/features/workflow-canvas/ui/CanvasNodeCard";
import type { WorkflowCanvas } from "../shared/workflow-canvas";
import { createReactHost } from "./react-host";

let flow: { nodes: CanvasFlowNode[]; onNodesChange(changes: NodeChange<CanvasFlowNode>[]): void };
vi.mock("@xyflow/react", async () => ({
  ...await vi.importActual<object>("@xyflow/react"),
  ReactFlow: (props: typeof flow) => { flow = props; return null; },
}));

test("runtime refresh preserves a click before the controlled selection catches up", async () => {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  const canvas: WorkflowCanvas = { version: 2, id: "selection", name: "Selection", mode: "board", nodes: [{ id: "sound", kind: "model", title: "Sound", value: "Bell", x: 0, y: 0 }], edges: [] };
  const empty: string[] = [];
  const render = (selection: string[]) => root.render(<CanvasBoard canvas={canvas} selection={selection} nodeData={(node) => ({ node } as CanvasNodeData)} onEdit={() => {}} onError={() => {}} onSelection={() => {}} onReady={() => {}} onViewport={() => {}} onDropFiles={() => {}} />);
  try {
    await act(async () => render(empty));
    await act(async () => flow.onNodesChange([{ id: "sound", type: "select", selected: true }]));
    await act(async () => render(empty));
    expect(flow.nodes[0].selected).toBe(true);
    await act(async () => render(["sound"]));
    expect(flow.nodes[0].selected).toBe(true);
    await act(async () => render([]));
    expect(flow.nodes[0].selected).toBe(false);
  } finally { await act(async () => root.unmount()); host.restore(); }
});
