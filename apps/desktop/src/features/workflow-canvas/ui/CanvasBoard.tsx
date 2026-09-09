import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Background, BackgroundVariant, ControlButton, Controls, MiniMap, Position, ReactFlow, ViewportPortal, applyEdgeChanges, applyNodeChanges, useNodesInitialized, useReactFlow, useStore, useViewport, type Connection, type Edge, type ReactFlowInstance, type Viewport } from "@xyflow/react";
import { Minus, Plus, Copy, LayoutGrid, LoaderCircle, LockKeyhole, Scan, SquareDashed, Trash2, Unplug, Upload, Workflow } from "@/shared/ui/icons";
import { canvasNodePorts, connectionProblem } from "../../../../shared/canvas-ports";
import { CANVAS_LIMIT, type CanvasEdge, type CanvasNode, type WorkflowCanvas } from "../../../../shared/workflow-canvas";
import { CanvasNodeCard, type CanvasFlowNode, type CanvasNodeData } from "./CanvasNodeCard";
import { CanvasCreateMenu, type CanvasCreateAt } from "./CanvasCreateMenu";
import { canvasNodeWidth, canvasNodeHeight } from "../model/node-layout";
import { arrangeCanvas, duplicateCanvasNodes } from "../model/canvas-editor";
import { connectCanvas, connectionToNewNode } from "../model/node-creation";
import { CanvasConnectionLine, CanvasWire, canvasWirePath, canvasWireType } from "./CanvasWire";

const nodeTypes = { canvas: CanvasNodeCard };
const edgeTypes = { canvas: CanvasWire };
const edgeId = (edge: CanvasEdge) => JSON.stringify([edge.from, edge.sourcePort, edge.to, edge.targetPort]);
const canvasEdge = (connection: Connection): CanvasEdge => ({ from: connection.source, to: connection.target, sourcePort: connection.sourceHandle ?? undefined, targetPort: connection.targetHandle ?? undefined });

function InitialFit({ enabled }: { enabled: boolean }) {
  const initialized = useNodesInitialized();
  const { fitView } = useReactFlow();
  const fitted = useRef(false);
  useEffect(() => { if (initialized && enabled && !fitted.current) { fitted.current = true; void fitView({ padding: 0.22, maxZoom: 0.85 }); } }, [initialized, enabled, fitView]);
  return null;
}

function BoardControls({ children }: { children?: ReactNode }) {
  const { zoom } = useViewport();
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const minZoom = useStore((state) => state.minZoom);
  const maxZoom = useStore((state) => state.maxZoom);
  return <Controls showZoom={false} showFitView={false} showInteractive={false} position="bottom-left">
    <ControlButton className="react-flow__controls-zoomin" aria-label="Zoom in" title="Zoom in" disabled={zoom >= maxZoom} onClick={() => void zoomIn()}><Plus size={16} /></ControlButton>
    <ControlButton className="react-flow__controls-zoomout" aria-label="Zoom out" title="Zoom out" disabled={zoom <= minZoom} onClick={() => void zoomOut()}><Minus size={16} /></ControlButton>
    <ControlButton className="react-flow__controls-fitview" aria-label="Fit view" title="Fit view" onClick={() => void fitView()}><Scan size={16} /></ControlButton>
    <span className="flex h-8 min-w-12 items-center justify-center bg-card px-2 font-display type-sm tabular-nums text-ink" aria-label="Canvas zoom">{Math.round(zoom * 100)}%</span>{children}
  </Controls>;
}

export function CanvasBoard({ canvas, nodeData, onEdit, onError, onSelection, onReady, onViewport, onDropFiles, selection, controls, dropDisabled = false, importing = false, inactive = false }: {
  canvas: WorkflowCanvas;
  nodeData(node: CanvasNode): CanvasNodeData;
  onEdit(canvas: WorkflowCanvas): void;
  onError(message: string): void;
  onSelection(ids: string[]): void;
  onReady(instance: ReactFlowInstance<CanvasFlowNode>): void;
  onViewport(viewport: Viewport): void;
  onDropFiles(files: File[], position: { x: number; y: number }): void;
  dropDisabled?: boolean;
  importing?: boolean;
  inactive?: boolean;
  controls?: ReactNode;
  selection?: readonly string[];
}) {
  const surface = useRef<HTMLElement>(null);
  const flow = useRef<ReactFlowInstance<CanvasFlowNode> | null>(null);
  const [createAt, setCreateAt] = useState<CanvasCreateAt | null>(null);
  const [contextIds, setContextIds] = useState<string[] | null>(null);
  const [contextEdge, setContextEdge] = useState<string | null>(null);
  const closeCreate = useCallback(() => { setCreateAt(null); surface.current?.focus({ preventScroll: true }); }, []);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [nodes, setNodes] = useState<CanvasFlowNode[]>(() => canvas.nodes.map((node) => ({ id: node.id, type: "canvas", position: { x: node.x, y: node.y }, dragHandle: ".canvas-node-drag", width: canvasNodeWidth(node), height: canvasNodeHeight(node), draggable: !node.locked && !dropDisabled, selected: selection?.includes(node.id) ?? false, data: nodeData(node) })));
  const initialFit = useRef(!canvas.viewport);
  useEffect(() => {
    setNodes((current) => canvas.nodes.map((node) => ({ id: node.id, type: "canvas", position: { x: node.x, y: node.y }, dragHandle: ".canvas-node-drag", width: canvasNodeWidth(node), height: canvasNodeHeight(node), draggable: !node.locked && !dropDisabled, selected: selection?.includes(node.id) ?? current.find((item) => item.id === node.id)?.selected ?? false, data: nodeData(node) })));
  }, [canvas.nodes, nodeData, dropDisabled, selection]);
  const graphEdges = useMemo<Edge[]>(() => canvas.edges.map((edge) => {
    const source = canvas.nodes.find((node) => node.id === edge.from)!;
    const target = canvas.nodes.find((node) => node.id === edge.to)!;
    const output = canvasNodePorts(source).outputs.find((port) => port.id === edge.sourcePort) ?? canvasNodePorts(source).outputs[0];
    const input = canvasNodePorts(target).inputs.find((port) => port.id === edge.targetPort) ?? canvasNodePorts(target).inputs[0];
    const sourceData = nodeData(source), targetData = nodeData(target);
    const sourceRun = sourceData.run, targetRun = targetData.run;
    const skipped = sourceData.execution && sourceData.execution !== "included" || targetData.execution && targetData.execution !== "included" || target.kind === "variation" && target.config?.selectedResultId;
    const state = skipped ? "outside" : sourceRun?.status === "succeeded" ? targetRun?.status === "running" ? "flowing" : "delivered" : "waiting";
    const portType = canvasWireType(output?.type, input?.type);
    return { id: edgeId(edge), source: edge.from, target: edge.to, sourceHandle: output?.id, targetHandle: input?.id, type: "canvas", data: { portType }, className: `canvas-wire-${state}`, ariaLabel: `${source.title} ${output?.label ?? "output"} → ${target.title} ${input?.label ?? "input"} · ${portType} · ${state}` };
  }), [canvas.nodes, canvas.edges, nodeData]);
  const [edges, setEdges] = useState<Edge[]>(graphEdges);
  useEffect(() => { setEdges((current) => graphEdges.map((edge) => ({ ...edge, selected: current.find((item) => item.id === edge.id)?.selected ?? false }))); }, [graphEdges]);
  const selected = useCallback(({ nodes: selectedNodes }: { nodes: CanvasFlowNode[] }) => onSelection(selectedNodes.map((node) => node.id)), [onSelection]);
  const openCreate = (point: { x: number; y: number }, origin?: CanvasCreateAt["origin"], from?: CanvasCreateAt["from"]) => {
    const rect = surface.current?.getBoundingClientRect();
    if (dropDisabled || !rect || !flow.current) return;
    setContextIds(null);
    setContextEdge(null);
    setCreateAt({ x: Math.max(8, Math.min(point.x - rect.left, rect.width - 288)), y: Math.max(8, Math.min(point.y - rect.top, rect.height - 410)), point: flow.current.screenToFlowPosition(point), origin, from });
  };
  const contextMenu = (event: { preventDefault(): void; clientX: number; clientY: number }, nodeId?: string) => {
    event.preventDefault();
    if (dropDisabled) return;
    const ids = nodeId ? selection?.includes(nodeId) ? [...selection] : [nodeId] : [...selection ?? []];
    openCreate({ x: event.clientX, y: event.clientY }); setContextIds(ids);
    if (nodeId) onSelection(ids);
  };
  const contextActions = contextIds === null ? undefined : [
    ...(contextEdge ? [{ label: "Disconnect connection", icon: <Unplug size={14} />, run: () => onEdit({ ...canvas, edges: canvas.edges.filter((edge) => edgeId(edge) !== contextEdge) }) }] : []),
    { label: "Select all nodes", shortcut: "⌘ A", icon: <SquareDashed size={14} />, run: () => onSelection(canvas.nodes.map((node) => node.id)) },
    { label: "Fit canvas", shortcut: "⇧ F", icon: <Scan size={14} />, run: () => { void flow.current?.fitView({ padding: .22, maxZoom: 1, duration: 250 }); } },
    { label: "Arrange nodes", icon: <LayoutGrid size={14} />, disabled: !canvas.nodes.length, run: () => { onEdit(arrangeCanvas(canvas)); requestAnimationFrame(() => { void flow.current?.fitView({ padding: .22, maxZoom: 1, duration: 250 }); }); } },
    ...(contextIds.length ? [
      { label: "Duplicate selection", shortcut: "⌘ D", icon: <Copy size={14} />, disabled: canvas.nodes.length + contextIds.length > CANVAS_LIMIT, run: () => onEdit(duplicateCanvasNodes(canvas, contextIds)) },
      { label: canvas.nodes.filter((node) => contextIds.includes(node.id)).every((node) => node.locked) ? "Unlock selection" : "Lock selection", icon: <LockKeyhole size={14} />, run: () => { const lock = !canvas.nodes.filter((node) => contextIds.includes(node.id)).every((node) => node.locked); onEdit({ ...canvas, nodes: canvas.nodes.map((node) => contextIds.includes(node.id) ? { ...node, locked: lock } : node) }); } },
      { label: "Delete selection", shortcut: "⌫", icon: <Trash2 size={14} />, run: () => { onEdit({ ...canvas, nodes: canvas.nodes.filter((node) => !contextIds.includes(node.id)), edges: canvas.edges.filter((edge) => !contextIds.includes(edge.from) && !contextIds.includes(edge.to)) }); onSelection([]); } },
    ] : []),
  ];
  const originNode = canvas.nodes.find((node) => node.id === createAt?.origin?.nodeId);
  const originType = originNode && (createAt?.origin?.direction === "input" ? canvasNodePorts(originNode).inputs : canvasNodePorts(originNode).outputs).find((port) => port.id === createAt?.origin?.portId)?.type;
  return <section ref={surface} tabIndex={0} onKeyDown={(event) => {
    if (!(event.key === "F10" && event.shiftKey || event.key === "ContextMenu") || event.target instanceof Element && event.target.closest("input, textarea, [contenteditable]")) return;
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    contextMenu({ preventDefault: () => event.preventDefault(), clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 3 });
  }} onDoubleClick={(event) => { if (event.target instanceof Element && event.target.classList.contains("react-flow__pane")) openCreate({ x: event.clientX, y: event.clientY }); }} onDragEnterCapture={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); dragDepth.current++; setDragging(true); } }} onDragOverCapture={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = dropDisabled ? "none" : "copy"; } }} onDragLeaveCapture={(event) => { if (event.dataTransfer.types.includes("Files")) { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); } }} onDropCapture={(event) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault(); event.stopPropagation(); dragDepth.current = 0; setDragging(false);
    if (!dropDisabled) onDropFiles(Array.from(event.dataTransfer.files), { x: event.clientX, y: event.clientY });
  }} onPointerDownCapture={(event) => { if (!(event.target instanceof Element) || !event.target.closest("input, textarea, button, [role='combobox'], [contenteditable]")) event.currentTarget.focus({ preventScroll: true }); }} className={`canvas-board relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-window outline-none ${inactive ? "invisible" : ""}`} aria-label="Workflow canvas" inert={inactive} aria-hidden={inactive}>
    <ReactFlow<CanvasFlowNode>
      nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} connectionLineComponent={CanvasConnectionLine}
      onPaneContextMenu={contextMenu} onNodeContextMenu={(event, node) => { if (!(event.target instanceof Element) || !event.target.closest("input, textarea, [contenteditable]")) contextMenu(event, node.id); }}
      onEdgeContextMenu={(event, edge) => { contextMenu(event); setContextIds([]); setContextEdge(edge.id); }}
      onNodesChange={(changes) => setNodes((current) => applyNodeChanges(changes, current))}
      onEdgesChange={(changes) => setEdges((current) => applyEdgeChanges(changes, current))}
      onNodeDragStop={(_event, _node, moved) => onEdit({ ...canvas, nodes: canvas.nodes.map((node) => { const match = moved.find((item) => item.id === node.id); return match && !node.locked ? { ...node, x: Math.round(match.position.x), y: Math.round(match.position.y) } : node; }) })}
      onConnectEnd={(event, state) => {
        if (state.isValid || !state.fromNode || !state.fromHandle?.id || state.toNode) return;
        const pointer = "changedTouches" in event ? event.changedTouches[0] : event;
        if (!pointer || !(event.target instanceof Element) || !event.target.closest(".react-flow__pane")) return;
        openCreate({ x: pointer.clientX, y: pointer.clientY }, { nodeId: state.fromNode.id, portId: state.fromHandle.id, direction: state.fromHandle.type === "source" ? "output" : "input" }, state.from ?? undefined);
      }}
      onConnect={(connection) => { const edge = canvasEdge(connection); const problem = connectionProblem(canvas, edge); if (problem) onError(problem); else onEdit(connectCanvas(canvas, edge)); }}
      isValidConnection={(connection) => !connectionProblem(canvas, canvasEdge(connection as Connection))}
      onDelete={({ nodes: removed, edges: removedEdges }) => { const ids = new Set(removed.map((node) => node.id)); const edgeIds = new Set(removedEdges.map((edge) => edge.id)); onEdit({ ...canvas, nodes: canvas.nodes.filter((node) => !ids.has(node.id)), edges: canvas.edges.filter((edge) => !ids.has(edge.from) && !ids.has(edge.to) && !edgeIds.has(edgeId(edge))) }); }}
      onSelectionChange={selected} onInit={(instance) => { flow.current = instance; onReady(instance); }} onMoveEnd={(_event, viewport) => onViewport(viewport)}
      defaultViewport={canvas.viewport} fitView={!canvas.viewport} fitViewOptions={{ padding: 0.22, maxZoom: 0.85 }}
      zoomOnDoubleClick={false} minZoom={0.15} maxZoom={1.5} snapToGrid snapGrid={[16, 16]} panOnScroll selectionOnDrag panOnDrag={[1]} selectionKeyCode="Shift" multiSelectionKeyCode={["Meta", "Control"]}
      deleteKeyCode={null} connectionRadius={28} onlyRenderVisibleElements={false}
      proOptions={{ hideAttribution: true }}
    >
      {createAt?.from && <ViewportPortal><svg className="canvas-creation-wire" data-port-type={originType ?? "any"} aria-hidden="true"><path d={canvasWirePath(createAt.from.x, createAt.from.y, createAt.point.x, createAt.point.y, createAt.origin?.direction === "input" ? Position.Left : Position.Right)} /><circle className="canvas-pending-end" cx={createAt.point.x} cy={createAt.point.y} r={6} /></svg></ViewportPortal>}
      <InitialFit enabled={initialFit.current} />
      <Background variant={BackgroundVariant.Dots} gap={22} size={2.4} />
      <BoardControls>{controls}</BoardControls>
      <MiniMap position="bottom-right" pannable zoomable nodeBorderRadius={8} nodeColor={(node) => node.selected ? "var(--instrument-text-primary)" : "var(--color-canvas-map-node)"} maskColor="var(--color-canvas-map-mask)" />
    </ReactFlow>
    {createAt && surface.current?.parentElement && createPortal(<CanvasCreateMenu key={`${createAt.x}:${createAt.y}`} canvas={canvas} at={createAt} actions={contextActions} onClose={closeCreate} onCreate={(node) => {
      if (dropDisabled || canvas.nodes.length >= CANVAS_LIMIT) return;
      const edge = createAt.origin ? connectionToNewNode(canvas, node, createAt.origin) : null;
      if (createAt.origin && !edge) { onError("This connection is no longer available."); closeCreate(); return; }
      setNodes((current) => [...current.map((item) => ({ ...item, selected: false })), { id: node.id, type: "canvas", position: { x: node.x, y: node.y }, selected: true, width: canvasNodeWidth(node), height: canvasNodeHeight(node), data: nodeData(node) }]);
      const next = { ...canvas, nodes: [...canvas.nodes, node] };
      onEdit(edge ? connectCanvas(next, edge) : next); onSelection([node.id]); closeCreate();
    }} />, surface.current.parentElement)}
    {!canvas.nodes.length && <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center"><div className="flex max-w-xs flex-col items-center gap-4 text-muted"><Workflow size={38} strokeWidth={1} /><h2 className="m-0 type-xl font-medium text-ink">Make room for an idea.</h2><p className="m-0 type-sm leading-relaxed">Drop files here as reusable references, or add a prompt and connect a model.</p><span className="type-xs">Images · video · audio · text</span></div></div>}
    {(dragging || importing) && <div className="pointer-events-none absolute inset-3 z-surface-overlay flex flex-col items-center justify-center gap-3 rounded-window border-2 border-dashed border-brand bg-card/90 p-6 text-center text-ink" role="status" aria-live="polite">{importing ? <LoaderCircle size={32} className="animate-spin motion-reduce:animate-none text-brand" /> : <Upload size={32} strokeWidth={1.5} className="text-brand" />}<strong className="type-lg font-medium">{importing ? "Importing references…" : dropDisabled ? "Finish the current operation first" : "Drop files to add references"}</strong><span className="max-w-xs type-sm leading-relaxed text-muted">{importing ? "Keeping a copy in this workspace" : "Each file becomes a node. Connect its output to any compatible input."}</span><span className="type-xs text-muted">Images · video · audio · TXT, MD, JSON · up to 250 MB each</span></div>}
  </section>;
}
