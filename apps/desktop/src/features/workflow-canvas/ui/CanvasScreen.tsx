import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PageHeaderHost, usePageHeaderHost } from "@/shared/ui/PageHeader";
import { Modal } from "@/shared/ui/Modal";
import { MediaPreview } from "@/shared/ui/MediaPreview";
import { Window } from "@/shared/ui/Window";
import type { ReactFlowInstance } from "@xyflow/react";
import { ArrowLeft, Check, CircleAlert, Copy, GitBranch, History, LayoutGrid, LoaderCircle, MessageSquare, MoreHorizontal, Pencil, Play, Redo2, Save, Scan, Trash2, Undo2, X } from "@/shared/ui/icons";
import { bridge } from "@/shared/api/ipc";
import { SelectMenu } from "@/shared/ui/SelectMenu";
import { InstrumentScreenRoot } from "@/shared/instrument/screen-state-registry";
import { canvasInstrumentStates } from "../model/instrument-states";
import { CANVAS_EXTENT, CANVAS_LIMIT, CANVAS_NODE_WIDTH, selectedCanvasNodes, type CanvasNode, type CanvasNodeKind, type CanvasViewport } from "../../../../shared/workflow-canvas";
import { canvasNodePorts, connectionProblem } from "../../../../shared/canvas-ports";
import { canvasReadiness } from "../../../../shared/canvas-readiness";
import { canvasExecutionPlan } from "../../../../shared/canvas-execution-plan";
import type { CanvasModelDescriptor, CanvasRunResult } from "../../../../shared/canvas-runtime";
import { arrangeCanvas, canvasAgentRequest, canvasNodeHeight, duplicateCanvasNodes, newCanvasNode, NODE_LABELS, type CanvasAgentRequest } from "../model/canvas-editor";
import { useCanvasEditor } from "../model/use-canvas-editor";
import { useCanvasRuntime } from "../model/use-canvas-runtime";
import { CanvasNodeInspector } from "./CanvasNodeInspector";
import { CanvasBoard } from "./CanvasBoard";
import type { CanvasFlowNode, CanvasNodeData } from "./CanvasNodeCard";
import { CanvasLibrary } from "./CanvasLibrary";
import { CanvasCatalog } from "./CanvasCatalog";
import { CanvasRunsPanel } from "./CanvasRunsPanel";
import { CanvasExecutionPlan } from "./CanvasExecutionPlan";
import { CanvasShortcuts } from "./CanvasShortcuts";
import { CANVAS_BUTTON, NODE_ICONS } from "./canvas-chrome";

export function CanvasScreen({ workspaceId, workspaceName, storageScope, agentBusy, onRequestAgent, onOpenProviders, headerHost: explicitHeaderHost, windowAction }: {
  workspaceId: string; workspaceName: string; storageScope: string; agentBusy: boolean;
  onRequestAgent(request: CanvasAgentRequest): void; onOpenProviders?(): void;
  headerHost?: HTMLElement | null; windowAction?: ReactNode;
}) {
  const pageHeaderHost = usePageHeaderHost();
  const headerHost = explicitHeaderHost === undefined ? pageHeaderHost : explicitHeaderHost;
  const editor = useCanvasEditor(workspaceId, storageScope, agentBusy);
  const draft = editor.draft;
  const isBoard = draft?.mode === "board";
  const runtime = useCanvasRuntime(workspaceId, draft?.id);
  const readiness = useMemo(() => draft ? canvasReadiness(draft, runtime.catalog.models, runtime.runs) : new Map(), [draft, runtime.catalog.models, runtime.runs]);
  const plan = useMemo(() => draft ? canvasExecutionPlan(draft) : null, [draft]);
  const runnableNodes = plan?.nodes ?? [];
  const blockedNodes = runnableNodes.filter((node) => !readiness.get(node.id)?.ready);
  const board = useRef<ReactFlowInstance<CanvasFlowNode> | null>(null);
  const viewport = useRef<{ canvasId: string; value: CanvasViewport } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLElement>(null);
  const latest = useRef({ workspaceId, storageScope, canvasId: draft?.id });
  latest.current = { workspaceId, storageScope, canvasId: draft?.id };
  const importingFiles = useRef(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<{ nodeId: string; result?: CanvasRunResult } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [catalogNode, setCatalogNode] = useState<string | null>(null);
  const modelOpener = useRef<HTMLButtonElement | null>(null);
  const [showRuns, setShowRuns] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [resultsExpanded, setResultsExpanded] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const assetKey = JSON.stringify(draft?.nodes.flatMap((node) => node.config?.asset ? [node.config.asset] : []) ?? []);
  useEffect(() => {
    let current = true;
    const assets = draft?.nodes.flatMap((node) => node.config?.asset ? [node.config.asset] : []) ?? [];
    void Promise.all(assets.map(async (asset) => [asset.path, await bridge.loadCanvasAssetPreview(workspaceId, asset)] as const)).then((entries) => {
      if (current) setMediaUrls(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => !!entry[1])));
    }).catch((cause) => { if (current) editor.setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { current = false; };
  }, [assetKey, workspaceId]);
  useEffect(() => { setSelectedIds([]); setPreview(null); setCatalogNode(null); setShowRuns(false); setShowPlan(false); setResultsExpanded(false); setRenaming(false); if (draft) screen.current?.focus({ preventScroll: true }); }, [draft?.id]);

  const patchNode = (id: string, patch: Partial<CanvasNode> | ((node: CanvasNode) => Partial<CanvasNode>)) => {
    let removed = false;
    editor.edit((current) => {
      if (current.id !== draft?.id || !current.nodes.some((node) => node.id === id)) return current;
      const next = { ...current, nodes: current.nodes.map((node) => node.id === id ? { ...node, ...(typeof patch === "function" ? patch(node) : patch) } : node) };
      const edges = next.edges.filter((edge) => !connectionProblem({ ...next, edges: [] }, edge));
      removed = edges.length !== next.edges.length;
      return { ...next, edges };
    }, typeof patch === "function" ? undefined : { coalesceKey: `node:${id}:${Object.keys(patch).join()}` });
    if (removed) editor.setError("Incompatible connections were removed after changing the node. Undo restores the previous setup.");
  };
  const center = () => {
    const rect = stage.current?.getBoundingClientRect();
    return rect && board.current ? board.current.screenToFlowPosition({ x: rect.left + rect.width * 0.45, y: rect.top + rect.height * 0.35 }) : { x: 80, y: 80 };
  };
  const addNode = (kind: CanvasNodeKind, model?: CanvasModelDescriptor) => {
    if (!draft || draft.nodes.length >= CANVAS_LIMIT) return;
    const node = newCanvasNode(kind, center(), model?.modality);
    if (model) { node.title = model.name; node.config = { ...node.config, modelId: model.id, provider: model.provider }; }
    editor.edit({ ...draft, nodes: [...draft.nodes, node] }); setSelectedIds([node.id]);
    if (kind === "model" && !model) { setShowPlan(false); setShowRuns(false); }
  };
  const chooseAsset = async (id: string) => {
    try { const asset = await bridge.importCanvasAsset(workspaceId); if (asset) patchNode(id, (node) => ({ title: node.title === "Media" ? asset.name : node.title, config: { ...node.config, asset, modality: asset.kind } })); }
    catch (cause) { editor.setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const dropFiles = async (files: File[], point: { x: number; y: number }) => {
    if (!draft || !files.length || busy || importingFiles.current || !board.current) return;
    const scope = latest.current;
    const current = () => !!screen.current && latest.current.workspaceId === scope.workspaceId && latest.current.storageScope === scope.storageScope && latest.current.canvasId === scope.canvasId;
    if (files.length > CANVAS_LIMIT - draft.nodes.length) { editor.setError(`A canvas supports up to ${CANVAS_LIMIT} nodes. Choose fewer files.`); return; }
    const origin = board.current.screenToFlowPosition(point);
    const nodes: CanvasNode[] = [], errors: string[] = [];
    importingFiles.current = true; setImporting(true); editor.setError(null);
    try {
      for (const file of files) {
        if (!current()) return;
        try {
          if (file.size > 250 * 1024 * 1024) throw new Error("Choose a file under 250 MB");
          const asset = await bridge.importCanvasAsset(workspaceId, file);
          if (!asset) continue;
          const node = newCanvasNode("media", origin, asset.kind);
          const index = nodes.length;
          node.x = Math.min(CANVAS_EXTENT, node.x + index % 3 * (CANVAS_NODE_WIDTH + 40));
          node.y = Math.min(CANVAS_EXTENT, node.y + Math.floor(index / 3) * (canvasNodeHeight(node) + 40));
          nodes.push({ ...node, title: asset.name.slice(0, 160), config: { ...node.config, asset } });
        } catch (cause) { errors.push(`${file.name}: ${cause instanceof Error ? cause.message : String(cause)}`); }
      }
      if (!current()) return;
      if (nodes.length) editor.edit((canvas) => {
        if (canvas.nodes.length + nodes.length > CANVAS_LIMIT) { errors.push(`A canvas supports up to ${CANVAS_LIMIT} nodes. Remove some nodes and drop the files again.`); return canvas; }
        return { ...canvas, nodes: [...canvas.nodes, ...nodes] };
      });
      if (errors.length) editor.setError(errors.join(" · "));
    } finally { importingFiles.current = false; if (screen.current) setImporting(false); }
  };
  const start = async (mode: "preview" | "execute", nodeId?: string) => {
    if (!draft) return;
    const nodes = selectedCanvasNodes(draft, nodeId);
    if (!nodes.length) { setShowPlan(true); setShowRuns(false); setCatalogNode(null); return; }
    const blocked = nodes.find((node) => !readiness.get(node.id)?.ready);
    if (blocked) { editor.setError(`${blocked.title}: ${readiness.get(blocked.id)!.issues.join(" · ")}`); return; }
    const saved = editor.dirty ? await save() : editor.saved;
    if (!saved) return;
    setShowRuns(true); setCatalogNode(null); setShowPlan(false); await runtime.start(saved, mode, nodeId);
  };
  const askAgent = async () => { const saved = editor.dirty ? await save() : editor.saved; if (saved) onRequestAgent(canvasAgentRequest(saved, "edit")); };
  const duplicateNodes = (ids: string[] = selectedIds) => { if (draft) { try { editor.edit(duplicateCanvasNodes(draft, ids)); } catch (cause) { editor.setError(cause instanceof Error ? cause.message : String(cause)); } } };
  const removeNodes = (selected: string[] = selectedIds) => { if (draft) { const ids = new Set(selected); editor.edit({ ...draft, nodes: draft.nodes.filter((node) => !ids.has(node.id)), edges: draft.edges.filter((edge) => !ids.has(edge.from) && !ids.has(edge.to)) }); setSelectedIds([]); } };
  const useResult = (result: CanvasRunResult) => {
    if (!draft || draft.nodes.length >= CANVAS_LIMIT) return;
    const node = newCanvasNode(result.asset ? "media" : "prompt", center(), result.kind);
    node.title = result.label;
    if (result.asset) node.config = { ...node.config, asset: result.asset }; else node.value = result.text ?? "";
    editor.edit({ ...draft, nodes: [...draft.nodes, node] }); setResultsExpanded(false);
  };
  const selectNodes = (ids: string[]) => {
    const selected = new Set(ids);
    board.current?.setNodes((nodes) => nodes.map((node) => ({ ...node, selected: selected.has(node.id) })));
    board.current?.setEdges((edges) => edges.map((edge) => ({ ...edge, selected: false })));
    setSelectedIds(ids);
  };
  const focusPadding = () => {
    const panel = stage.current?.querySelector<HTMLElement>(".canvas-node-inspector");
    if (!panel || !stage.current) return 0.22;
    const rect = stage.current.getBoundingClientRect();
    return { left: "80px", right: `${rect.right - panel.getBoundingClientRect().left + 24}px`, top: "100px", bottom: "140px" } as const;
  };
  const focusNode = (id: string) => { selectNodes([id]); void board.current?.fitView({ nodes: [{ id }], padding: focusPadding(), duration: 350, maxZoom: 1 }); };
  const keyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (!draft || event.defaultPrevented || event.altKey || !(event.target instanceof Element) || !event.currentTarget.contains(event.target)) return;
    const key = event.key.toLowerCase(), command = event.metaKey || event.ctrlKey;
    if (command && key === "s") { event.preventDefault(); if (!editor.saving) void save(); return; }
    if (event.target.closest("input, textarea, [contenteditable], [role='combobox'], [role='slider']")) return;
    if (key === "escape") {
      event.preventDefault();
      const help = screen.current?.querySelector<HTMLDetailsElement>("details[open]");
      if (help) help.open = false;
      else if (catalogNode || showRuns || showPlan) { setCatalogNode(null); setShowRuns(false); setShowPlan(false); }
      else selectNodes([]);
      screen.current?.focus({ preventScroll: true }); return;
    }
    if (showRuns && resultsExpanded) return;
    if (command && key === "a") { event.preventDefault(); selectNodes(draft.nodes.map((node) => node.id)); }
    if (command && key === "z") { event.preventDefault(); if (!busy) event.shiftKey ? editor.redo() : editor.undo(); }
    if (command && key === "d") { event.preventDefault(); if (!busy) duplicateNodes(); }
    if (!command && (key === "delete" || key === "backspace")) {
      event.preventDefault();
      if (!busy && board.current) void board.current.deleteElements({ nodes: board.current.getNodes().filter((node) => node.selected), edges: board.current.getEdges().filter((edge) => edge.selected) });
    }
    if (!command && key === "f") { event.preventDefault(); void board.current?.fitView({ nodes: !event.shiftKey && selectedIds.length ? selectedIds.map((id) => ({ id })) : undefined, padding: !event.shiftKey && selectedIds.length === 1 ? focusPadding() : 0.22, duration: 350, maxZoom: 1 }); }
  };
  const nodeData = useCallback((node: CanvasNode): CanvasNodeData => {
    const run = runtime.selectedRun?.nodes.find((item) => item.nodeId === node.id);
    const inputs = (draft?.edges ?? []).filter((edge) => edge.to === node.id).flatMap((edge) => {
      const source = draft?.nodes.find((item) => item.id === edge.from);
      if (!source) return [];
      const results = runtime.selectedRun?.nodes.find((item) => item.nodeId === source.id)?.results;
      const result = results?.find((item) => item.id === source.config?.selectedResultId) ?? results?.[0];
      return [{ port: edge.targetPort ?? canvasNodePorts(node).inputs[0]?.id ?? "input", source: source.title, kind: result?.kind ?? source.config?.asset?.kind, previewUrl: result?.previewUrl ?? (source.config?.asset ? mediaUrls[source.config.asset.path] : undefined), preview: source.kind === "prompt" ? source.value : source.kind === "media" ? source.config?.asset?.name ?? "" : result?.text ?? result?.label ?? "" }];
    });
    const execution = node.kind === "note" || isBoard ? undefined : plan?.included.has(node.id) || runtime.running && run ? "included" : plan?.reused.some((item) => item.id === node.id) ? "reused" : "outside";
    return { node, workspaceId, choosingModel: catalogNode === node.id, onEstimate: (id) => { void start("preview", id); }, inputs, execution, onInspect: (id) => { selectNodes([id]); setCatalogNode(null); setShowRuns(false); setShowPlan(false); }, onPreview: (nodeId, result) => setPreview({ nodeId, result }), onDuplicate: (id) => duplicateNodes([id]), onDelete: (id) => removeNodes([id]), readiness: readiness.get(node.id), onPatch: patchNode, onChooseAsset: (id) => { void chooseAsset(id); }, onChooseModel: (id, opener) => { modelOpener.current = opener ?? null; selectNodes([id]); setCatalogNode(id); setShowRuns(false); setShowPlan(false); }, onRun: (id) => { void start("execute", id); }, onStop: runtime.running && runtime.selectedRun ? () => { void runtime.cancel(runtime.selectedRun!.id); } : undefined, onShowLog: () => { setShowRuns(true); setCatalogNode(null); setShowPlan(false); }, onSelectResult: (id, resultId) => { if (node.kind === "variation") patchNode(id, { config: { ...node.config, selectedResultId: resultId } }); else { const result = run?.results.find((item) => item.id === resultId); if (result) useResult(result); } }, mediaUrl: node.config?.asset ? mediaUrls[node.config.asset.path] : undefined, model: runtime.catalog.models.find((model) => model.id === node.config?.modelId && model.provider === node.config?.provider && model.modality === node.config?.modality), run, runMode: runtime.selectedRun?.mode, results: run?.results, disabled: runtime.running || runtime.starting }
  }, [draft, mediaUrls, readiness, plan, runtime.selectedRun, runtime.catalog, runtime.running, runtime.starting, catalogNode]);
  const error = editor.error ?? runtime.error;
  const busy = editor.saving || runtime.starting || runtime.running || importing;
  function save() {
    const view = viewport.current;
    if (view && view.canvasId === draft?.id) editor.edit((current) => current.id === view.canvasId ? { ...current, viewport: view.value } : current);
    return editor.save();
  }
  const inspectedNode = selectedIds.length === 1 ? draft?.nodes.find((node) => node.id === selectedIds[0]) : undefined;
  const inspectorOpen = !!inspectedNode && !showRuns && !showPlan;
  const runTarget = isBoard ? inspectedNode?.id : undefined;
  const canRun = isBoard ? !!inspectedNode && inspectedNode.kind !== "note" && !!readiness.get(inspectedNode.id)?.ready : !!runnableNodes.length && !blockedNodes.length;
  const previewNode = draft?.nodes.find((node) => node.id === preview?.nodeId);
  const header = draft ? <div className="canvas-studio-header flex h-8 min-w-0 flex-1 items-center gap-1" role="toolbar" aria-label="Canvas controls" onKeyDown={keyboard}>
        <button className={CANVAS_BUTTON} type="button" aria-label="All canvases" title="All canvases" disabled={busy} onClick={() => { void editor.select(null); }}><ArrowLeft size={14} /></button>
        {renaming ? <input autoFocus className="min-w-0 flex-1 border-0 bg-field px-2 py-2 type-sm font-medium text-ink outline-none focus-visible:underline" aria-label="Canvas name" value={draft.name} maxLength={160} onBlur={() => setRenaming(false)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} onChange={(event) => editor.edit({ ...draft, name: event.target.value }, { coalesceKey: "name" })} /> : <SelectMenu overlayOwner="canvas.switcher" ariaLabel="Switch canvas" value={draft.id} options={[...editor.items.filter((item) => item.canvas.id !== draft.id).map((item) => ({ value: item.canvas.id, label: item.canvas.name })), { value: draft.id, label: draft.name || "Untitled canvas" }]} className="canvas-switcher h-8 min-w-0 flex-1 rounded-control bg-field px-2 type-sm text-ink" tone="caller" onValueChange={(id) => { if (!busy) { const item = editor.items.find((item) => item.canvas.id === id); if (item) void editor.select(item); } }} />}
        <button className={CANVAS_BUTTON} type="button" disabled={!editor.dirty || editor.saving || !draft.name.trim()} onClick={() => { void save(); }} aria-label={editor.dirty ? "Save canvas" : "Canvas saved"}>{editor.saving ? <LoaderCircle size={12} className="animate-spin" /> : editor.dirty ? <Save size={12} /> : <Check size={12} />}<span className="canvas-save-label">{editor.saving ? "Saving" : editor.dirty ? "Save" : "Saved"}</span></button>
        <div className="canvas-mode-switch" role="group" aria-label="Canvas mode">{(["board", "workflow"] as const).map((mode) => <button key={mode} type="button" aria-pressed={(draft.mode ?? "workflow") === mode} disabled={busy} title={mode === "board" ? "Free board · run individual steps with their inputs" : "Workflow · run all branches leading to Output"} onClick={() => { editor.edit({ ...draft, mode }); setShowPlan(false); }}>{mode === "board" ? "Board" : "Workflow"}</button>)}</div>
        <button className={`${CANVAS_BUTTON} canvas-node-primary`} type="button" disabled={busy || !canRun} title={isBoard ? "Run the selected step and its connected inputs" : "Run the workflow to its Outputs"} onClick={() => { void start("execute", runTarget); }}>{runtime.starting || runtime.running ? <LoaderCircle size={13} className="animate-spin motion-reduce:animate-none" /> : <Play size={13} />}{isBoard ? "Run step" : "Run"}</button>
  </div> : null;
  const screenState = error ? "error" : editor.loading ? "loading" : draft ? showRuns ? "history" : "editing" : editor.items.length ? "ready" : "empty";
  return <InstrumentScreenRoot descriptor={canvasInstrumentStates} state={screenState}><main ref={screen} tabIndex={-1} onKeyDown={keyboard} className="canvas-screen @container/canvas relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden text-ink outline-none" aria-label="Working canvases">
    {headerHost && header && createPortal(header, headerHost)}
    {error && <div className="canvas-message absolute left-4 right-4 top-16 z-surface-overlay rounded-window flex shrink-0 items-start gap-2 border-b border-divider bg-panel px-4 py-3 type-xs" role="alert"><span className="min-w-0 flex-1 leading-relaxed">{error}</span><button className={CANVAS_BUTTON} type="button" aria-label="Dismiss canvas message" onClick={() => { editor.setError(null); runtime.setError(null); }}><X size={12} /></button></div>}
    {!draft ? <PageHeaderHost.Provider value={headerHost ?? null}><CanvasLibrary workspaceName={workspaceName} items={editor.items} loading={editor.loading} onCreate={editor.create} onSelect={editor.select} onReload={() => { void editor.reload(); }} /></PageHeaderHost.Provider> : <>
      {!headerHost && <div className="shrink-0 bg-panel p-2">{header}</div>}
      <div className="canvas-stage relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-window" ref={stage}>
        <CanvasBoard key={draft.id} canvas={draft} selection={selectedIds} nodeData={nodeData} onEdit={editor.edit} onError={editor.setError} onSelection={setSelectedIds} onReady={(instance) => { board.current = instance; }} onViewport={(value) => { viewport.current = { canvasId: draft.id, value }; }} controls={<><button className={`${CANVAS_BUTTON} h-7 px-2`} type="button" aria-label="Undo canvas change" disabled={!editor.canUndo || busy} onClick={editor.undo}><Undo2 size={13} /></button><button className={`${CANVAS_BUTTON} h-7 px-2`} type="button" aria-label="Redo canvas change" disabled={!editor.canRedo || busy} onClick={editor.redo}><Redo2 size={13} /></button><CanvasShortcuts /></>} onDropFiles={dropFiles} dropDisabled={busy} importing={importing} inactive={showRuns && resultsExpanded} />

        <Window className="canvas-actions absolute right-4 top-4 z-surface-overlay" inert={showRuns && resultsExpanded} aria-hidden={showRuns && resultsExpanded}>
          <div className="flex items-center gap-1 rounded-frame bg-card p-1" role="toolbar" aria-label="Canvas tools">
        <button className={CANVAS_BUTTON} type="button" aria-label="Execution plan" title="Execution plan" aria-pressed={showPlan} onClick={() => { setShowPlan((value) => !value); setCatalogNode(null); setShowRuns(false); }}><GitBranch size={14} /><span>{isBoard ? "Board guide" : !plan?.outputs.length ? "Add Output" : `${runnableNodes.length} steps`}</span></button>
        {!isBoard && !!blockedNodes.length && <button className={`${CANVAS_BUTTON} type-xs text-muted`} type="button" title={`${blockedNodes[0].title}: ${readiness.get(blockedNodes[0].id)!.issues.join(" · ")}`} aria-label={`${blockedNodes.length} steps need input`} onClick={() => focusNode(blockedNodes[0].id)}><CircleAlert size={14} /><span>{blockedNodes.length}</span></button>}
        <button className={CANVAS_BUTTON} type="button" aria-label="Run history" title="Run history" aria-pressed={showRuns} onClick={() => { setShowRuns((value) => !value); setCatalogNode(null); setShowPlan(false); }}><History size={14} /></button>
        <button className={CANVAS_BUTTON} type="button" aria-label="Ask agent to edit" title="Work on this canvas with your agent" disabled={agentBusy || busy} onClick={() => { void askAgent(); }}><MessageSquare size={14} /></button>
        <button className={CANVAS_BUTTON} type="button" disabled={busy || !canRun} aria-label="Preview" title="Preview inputs and estimated cost" onClick={() => { void start("preview", runTarget); }}><Scan size={14} /><span className="sr-only">Preview</span></button>
            <details className="canvas-more relative" onBlur={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) event.currentTarget.open = false; }}><summary className={`${CANVAS_BUTTON} cursor-pointer list-none`} aria-label="More canvas actions" title="More canvas actions"><MoreHorizontal size={16} /></summary><Window className="canvas-more-menu absolute right-0 top-full mt-2 w-64"><div className="flex flex-col gap-2 rounded-frame bg-card p-3"><span className="font-code type-mono-xs text-muted">{draft.nodes.length} nodes · {draft.edges.length} connections</span><div className="flex items-center gap-2"><button className={CANVAS_BUTTON} type="button" aria-label="Rename canvas" title="Rename canvas" disabled={busy} onClick={(event) => { const menu = event.currentTarget.closest("details"); if (menu) menu.open = false; setRenaming(true); }}><Pencil size={12} /><span>Rename canvas</span></button><span className="flex-1" />{windowAction}</div>{editor.dirty ? <><span className="type-xs text-muted">Draft backed up on this Mac</span><button className={`${CANVAS_BUTTON} h-7`} type="button" disabled={busy} onClick={editor.discard}>Discard draft</button></> : <button className={`${CANVAS_BUTTON} h-7`} type="button" disabled={busy} onClick={editor.duplicate}><Copy size={12} />Duplicate canvas</button>}</div></Window></details>
          </div>
        </Window>
        <div className="canvas-toolbox absolute left-4 z-surface-overlay flex flex-col gap-1 rounded-full bg-card p-1.5" role="toolbar" aria-label="Add canvas nodes" inert={showRuns && resultsExpanded} aria-hidden={showRuns && resultsExpanded}>{(["prompt", "media", "model", "connector", "variation", "output", "note"] as const).map((kind) => { const Icon = NODE_ICONS[kind]; return <button key={kind} className={`${CANVAS_BUTTON} size-9 bg-transparent p-0`} type="button" aria-label={`Add ${NODE_LABELS[kind].toLowerCase()}`} title={`${NODE_LABELS[kind]} · add node`} disabled={draft.nodes.length >= CANVAS_LIMIT || busy} onClick={() => addNode(kind)}><Icon size={17} strokeWidth={1.6} /></button>; })}<span className="mx-2 my-1 border-t border-divider" /><button className={`${CANVAS_BUTTON} size-9 bg-transparent p-0`} type="button" aria-label="Arrange canvas" title="Arrange nodes" disabled={!draft.nodes.length || busy} onClick={() => { editor.edit(arrangeCanvas(draft, new Map(board.current?.getNodes().flatMap((node) => node.measured?.height ? [[node.id, node.measured.height] as const] : []) ?? []))); requestAnimationFrame(() => { void board.current?.fitView({ padding: 0.22, duration: 350, maxZoom: 0.9 }); }); }}><LayoutGrid size={16} /></button></div>
        {selectedIds.length > 1 && <div inert={showRuns && resultsExpanded} aria-hidden={showRuns && resultsExpanded} className="canvas-selection-bar absolute left-1/2 z-surface-overlay flex -translate-x-1/2 items-center gap-2 rounded-full p-1.5"><span className="pl-2 font-code type-mono-xs uppercase"><b className="font-display type-sm">{selectedIds.length}</b> selected</span><button className={CANVAS_BUTTON} type="button" aria-label="Focus selected nodes" onClick={() => { void board.current?.fitView({ nodes: selectedIds.map((id) => ({ id })), padding: 0.3, maxZoom: 1, duration: 300 }); }}><Scan size={13} /></button><button className={CANVAS_BUTTON} type="button" aria-label="Duplicate selected nodes" disabled={busy} onClick={() => duplicateNodes()}><Copy size={13} /></button><button className={CANVAS_BUTTON} type="button" aria-label="Delete selected nodes" disabled={busy} onClick={() => removeNodes()}><Trash2 size={13} /></button></div>}
        {inspectedNode && inspectorOpen && <CanvasNodeInspector data={nodeData(inspectedNode)} onClose={() => selectNodes([])} onDisconnect={(port) => editor.edit({ ...draft, edges: draft.edges.filter((edge) => edge.to !== inspectedNode.id || (edge.targetPort ?? canvasNodePorts(inspectedNode).inputs[0]?.id) !== port) })} />}
        {catalogNode && <CanvasCatalog key={catalogNode} selected={runtime.catalog.models.find((model) => model.id === inspectedNode?.config?.modelId && model.provider === inspectedNode?.config?.provider && model.modality === inspectedNode?.config?.modality)} opener={modelOpener.current} catalog={runtime.catalog} loading={runtime.loadingModels} modality={draft.nodes.find((node) => node.id === catalogNode)?.config?.modality} onChoose={(model) => { const node = draft.nodes.find((item) => item.id === catalogNode); if (node) patchNode(node.id, { title: model.name, config: { modality: model.modality, modelId: model.id, provider: model.provider, variants: node.config?.variants ?? 1 } }); setCatalogNode(null); }} onClose={() => setCatalogNode(null)} onRefresh={() => { void runtime.refreshModels(); }} onOpenProviders={onOpenProviders} />}
        {showRuns && <CanvasRunsPanel runs={runtime.runs} selectedRun={runtime.selectedRun} expanded={resultsExpanded} running={busy} onSelectRun={runtime.setSelectedRunId} onClose={() => setShowRuns(false)} onExpand={() => setResultsExpanded((value) => !value)} onCancel={(id) => { void runtime.cancel(id); }} onUseResult={useResult} onRestore={(run) => { editor.edit({ ...run.snapshot, id: draft.id, name: draft.name }); setResultsExpanded(false); }} onExecute={() => { void start("execute"); }} />}
        {showPlan && plan && <CanvasExecutionPlan plan={plan} readiness={readiness} onFocus={focusNode} onClose={() => setShowPlan(false)} onInput={(id, value) => patchNode(id, { value })} onAsset={(id) => { void chooseAsset(id); }} disabled={busy} onAddOutput={() => { if (!busy) addNode("output"); }} />}
      </div>
    </>}
    {preview && previewNode && <Modal id="canvas-node-preview" open onOpenChange={(open) => { if (!open) setPreview(null); }} title={previewNode.title} description="Canvas media preview" descriptionClassName="sr-only" closeLabel="Close node preview" size="w-5xl h-fit" bodyClassName="canvas-expanded-preview bg-media-frame"><MediaPreview url={preview.result?.previewUrl ?? (previewNode.config?.asset ? mediaUrls[previewNode.config.asset.path] : undefined)} kind={preview.result?.kind ?? previewNode.config?.asset?.kind ?? "text"} label={preview.result?.label ?? previewNode.title} text={preview.result?.text ?? previewNode.value} /></Modal>}
  </main></InstrumentScreenRoot>;
}
