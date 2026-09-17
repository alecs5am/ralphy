import { act, useState, type ReactNode } from "react";
import { webcrypto } from "node:crypto";
import { expect, test, vi } from "vitest";
import { CanvasScreen } from "@/features/workflow-canvas";
import { bridge } from "@/shared/api/ipc";
import type { CanvasViewport, SavedCanvas, WorkflowCanvas } from "../shared/workflow-canvas";
import type { CanvasRun } from "../shared/canvas-runtime";
import { createReactHost } from "./react-host";
import { useCanvasEditor } from "../src/features/workflow-canvas/model/use-canvas-editor";
import type { CanvasNodeData } from "../src/features/workflow-canvas/ui/CanvasNodeCard";
import type { ReactFlowInstance } from "@xyflow/react";
import type { CanvasFlowNode } from "../src/features/workflow-canvas/ui/CanvasNodeCard";

let boardNodes: CanvasNodeData[] = [];
let moveViewport: (viewport: CanvasViewport) => void;
let dropFiles: (files: File[], position: { x: number; y: number }) => Promise<void>;
let flowNodes: CanvasFlowNode[] = [];
const flow = {
  setNodes: vi.fn((update: (nodes: CanvasFlowNode[]) => CanvasFlowNode[]) => { flowNodes = update(flowNodes); }),
  setEdges: vi.fn(), getNodes: () => flowNodes, getNode: (id: string) => flowNodes.find((node) => node.id === id), getViewport: () => ({ x: 0, y: 0, zoom: 1 }), getEdges: () => [], deleteElements: vi.fn(), fitView: vi.fn(),
  screenToFlowPosition: (point: { x: number; y: number }) => point,
};

// ReactFlow geometry is verified in the live UI; this test owns studio actions and persistence.
vi.mock("../src/features/workflow-canvas/ui/CanvasBoard", () => ({
  CanvasBoard: ({ canvas, nodeData, onViewport, onReady, onDropFiles, controls }: { controls?: ReactNode; canvas: WorkflowCanvas; nodeData(node: WorkflowCanvas["nodes"][number]): CanvasNodeData; onViewport(viewport: CanvasViewport): void; onReady(instance: ReactFlowInstance<CanvasFlowNode>): void; onDropFiles: typeof dropFiles }) => {
    boardNodes = canvas.nodes.map(nodeData);
    flowNodes = canvas.nodes.map((node) => ({ id: node.id, position: { x: node.x, y: node.y }, data: nodeData(node), selected: flowNodes.find((item) => item.id === node.id)?.selected ?? false }));
    onReady(flow as unknown as ReactFlowInstance<CanvasFlowNode>);
    moveViewport = onViewport;
    dropFiles = onDropFiles;
    return <section aria-label="Workflow canvas">{controls}{canvas.nodes.map((node) => <article className="canvas-node" key={node.id}>{node.title}</article>)}</section>;
  },
}));

function click(host: HTMLElement, text: string) {
  const target = [...host.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === text || button.textContent?.trim() === text);
  if (!target) throw new Error(`Missing button: ${text}`);
  target.dispatchEvent(new Event("click", { bubbles: true }));
}

test("studio saves, previews without generation, shares saved agent context and restores a local draft", async () => {
  const backup = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => backup.get(key) ?? null, setItem: (key: string, value: string) => backup.set(key, value), removeItem: (key: string) => backup.delete(key) });
  vi.stubGlobal("crypto", webcrypto);
  let saved: SavedCanvas[] = [];
  let runs: CanvasRun[] = [];
  vi.spyOn(bridge, "loadCanvases").mockImplementation(async () => saved);
  vi.spyOn(bridge, "loadCanvasModels").mockResolvedValue({ models: [{ id: "test/image", name: "Image model", provider: "openrouter", modality: "image", available: true, description: "", parameters: {} }], providers: [], errors: [] });
  vi.spyOn(bridge, "loadCanvasRuns").mockImplementation(async () => ({ items: runs, nextCursor: null }));
  const preview = vi.spyOn(bridge, "startCanvasRun").mockImplementation(async (workspaceId, canvasId, options) => {
    const run: CanvasRun = { id: "preview-one", workspaceId, canvasId, canvasRevision: options.expectedRevision, mode: options.mode, status: "succeeded", startedAt: 1, endedAt: 2, nodes: [], error: null, snapshot: saved[0]!.canvas };
    runs = [run]; return run;
  });
  const save = vi.spyOn(bridge, "saveCanvas").mockImplementation(async (_workspace, canvas) => {
    const result = { canvas, revision: "revision-1", path: `/workspace/canvases/${canvas.id}.json` };
    saved = [result]; return result;
  });
  const request = vi.fn();
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let desktop = false;
  function Harness({ desktop }: { desktop: boolean }) {
    const [headerHost, setHeaderHost] = useState<HTMLDivElement | null>(null);
    return <><div ref={setHeaderHost} data-test-shell-header="true" /><CanvasScreen headerHost={desktop ? headerHost : null} workspaceId="ws_test" workspaceName="Test" storageScope="root-one" agentBusy={false} onRequestAgent={request} /></>;
  }
  const render = () => root.render(<Harness desktop={desktop} />);
  try {
    await act(async () => render());
    const template = host.container.querySelector('[data-template="image"]')!;
    await act(async () => template.dispatchEvent(new Event("click", { bubbles: true })));
    expect(host.container.querySelectorAll(".canvas-node")).toHaveLength(4);
    await act(async () => click(host.container, "Save canvas"));
    await act(async () => moveViewport({ x: 120, y: -40, zoom: 0.8 }));
    expect([...backup.keys()].filter((key) => key.startsWith("ralphy.canvas.draft:"))).toHaveLength(0);
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => boardNodes[0]!.onPatch(boardNodes[0]!.node.id, { value: "A refined creative direction" }));
    await act(async () => click(host.container, "Save canvas"));
    expect(saved[0]!.canvas.viewport).toEqual({ x: 120, y: -40, zoom: 0.8 });
    expect(save).toHaveBeenCalledWith("ws_test", expect.objectContaining({ version: 2, name: "Image concept", edges: expect.any(Array) }), null);
    expect(saved[0]!.canvas.edges).toHaveLength(3);
    expect([...backup.keys()].filter((key) => key.startsWith("ralphy.canvas.draft:"))).toHaveLength(0);
    await act(async () => click(host.container, "Ask agent to edit"));
    expect(request.mock.calls[0]![0].prompt).toBe("Help me improve the working canvas “Image concept”.");
    expect(request.mock.calls[0]![0].attachment.ref).toBe(saved[0]!.path);
    expect(request.mock.calls[0]![0].attachment.instructions).toContain("Do not run paid generation");
    expect(request.mock.calls[0]![0].attachment.instructions).toContain("version 2");
    expect([...host.container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Preview")?.disabled).toBe(true);
    expect(preview).not.toHaveBeenCalled();
    await act(async () => {
      const model = boardNodes.find((item) => item.node.kind === "model")!;
      model.onPatch(model.node.id, { config: { ...model.node.config, modelId: "test/image", provider: "openrouter" } });
    });
    await act(async () => click(host.container, "Preview"));
    expect(preview).toHaveBeenCalledWith("ws_test", saved[0]!.canvas.id, { mode: "preview", expectedRevision: "revision-1", nodeId: undefined });
    expect(preview).toHaveBeenCalledTimes(1);
    expect(host.container.textContent).toContain("Preview ready");
    expect(host.container.textContent).toContain("Generation previews do not create media.");
    expect(host.container.textContent).toContain("Unavailable");
    await act(async () => click(host.container, "Close results"));
    await act(async () => click(host.container, "All canvases"));
    await act(async () => click(host.container, "Reload canvases"));
    const item = [...host.container.querySelector('[aria-labelledby="canvas-saved-title"]')!.querySelectorAll("button")].find((button) => button.textContent?.includes("Image concept"))!;
    await act(async () => item.dispatchEvent(new Event("click", { bubbles: true })));
    await act(async () => click(host.container, "Add note"));
    expect(host.container.querySelectorAll(".canvas-node")).toHaveLength(5);
    await act(async () => root.render(null));
    await act(async () => render());
    expect(host.container.querySelectorAll(".canvas-node")).toHaveLength(5);
    expect(host.container.textContent).toContain("Draft backed up on this Mac");
    await act(async () => click(host.container, "All canvases"));
    expect(host.container.querySelector('.canvas-library')).not.toBeNull();
    expect(saved[0]!.canvas.nodes).toHaveLength(5);
    const reopened = [...host.container.querySelector('[aria-labelledby="canvas-saved-title"]')!.querySelectorAll("button")].find((button) => button.textContent?.includes("Image concept"))!;
    await act(async () => reopened.dispatchEvent(new Event("click", { bubbles: true })));
    await act(async () => click(host.container, "Add note"));
    await act(async () => click(host.container, "Discard draft"));
    expect(host.container.querySelectorAll(".canvas-node")).toHaveLength(5);
    expect([...backup.keys()].filter((key) => key.startsWith("ralphy.canvas.draft:"))).toHaveLength(0);
    desktop = true;
    await act(async () => render());
    expect(host.container.querySelector('[data-test-shell-header]')?.querySelector('.canvas-studio-header')).not.toBeNull();
    expect(host.container.querySelector('main')?.querySelector('.canvas-studio-header')).toBeNull();
    expect(host.container.querySelector('main')?.querySelector('footer')).toBeNull();
    expect(host.container.querySelectorAll('.canvas-node')).toHaveLength(5);
    await act(async () => click(host.container, "Add note"));
    await act(async () => click(host.container, "Save canvas"));
    expect(saved[0]!.canvas.nodes).toHaveLength(6);
    desktop = false;
    await act(async () => render());
    expect(host.container.querySelector('main')?.querySelector('.canvas-studio-header')).not.toBeNull();
    expect(host.container.querySelectorAll('.canvas-node')).toHaveLength(6);
  } finally {
    await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
});

test("dropped files become persistent references in one undo step and preserve edits made during import", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  vi.stubGlobal("crypto", webcrypto);
  vi.spyOn(bridge, "loadCanvases").mockResolvedValue([]);
  vi.spyOn(bridge, "loadCanvasModels").mockResolvedValue({ models: [], providers: [], errors: [] });
  vi.spyOn(bridge, "loadCanvasRuns").mockResolvedValue({ items: [], nextCursor: null });
  vi.spyOn(bridge, "loadCanvasAssetPreview").mockResolvedValue("ralphy-media://imported");
  let complete!: (asset: { path: string; name: string; kind: "image" }) => void;
  const importFile = vi.spyOn(bridge, "importCanvasAsset").mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }))
    .mockRejectedValueOnce(new Error("Unsupported file"))
    .mockResolvedValueOnce({ path: "/workspace/assets/music.wav", name: "music.wav", kind: "audio" });
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  try {
    await act(async () => root.render(<CanvasScreen workspaceId="files" workspaceName="Test" storageScope="files" agentBusy={false} onRequestAgent={vi.fn()} />));
    await act(async () => host.container.querySelector('[data-template="image"]')!.dispatchEvent(new Event("click", { bubbles: true })));
    const files = [{ name: "character.png", size: 128 }, { name: "broken.png", size: 128 }, { name: "music.wav", size: 256 }] as File[];
    let pending!: Promise<void>;
    await act(async () => { pending = dropFiles(files, { x: 320, y: 160 }); });
    await act(async () => boardNodes[0].onPatch(boardNodes[0].node.id, { value: "Newer prompt survives" }));
    await act(async () => { complete({ path: "/workspace/assets/character.png", name: "character.png", kind: "image" }); await pending; });
    const imported = boardNodes.filter((item) => item.node.kind === "media");
    expect(imported.map((item) => item.node.title)).toEqual(["character.png", "music.wav"]);
    expect(imported[0].node).toMatchObject({ x: 320, y: 160, config: { modality: "image", asset: { path: "/workspace/assets/character.png" } } });
    expect(imported[1].node.x).toBeGreaterThan(imported[0].node.x);
    expect(imported[1].readiness?.ready).toBe(true);
    expect(importFile).toHaveBeenNthCalledWith(1, "files", files[0]);
    expect(host.container.textContent).toContain("broken.png: Unsupported file");
    expect(boardNodes[0].node.value).toBe("Newer prompt survives");
    await act(async () => click(host.container, "Undo canvas change"));
    expect(boardNodes).toHaveLength(4);
    expect(boardNodes[0].node.value).toBe("Newer prompt survives");
  } finally {
    await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
});

test("canvas shortcuts select nodes, preserve text editing and stay inside the canvas", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
  vi.stubGlobal("crypto", webcrypto);
  vi.spyOn(bridge, "loadCanvases").mockResolvedValue([]);
  vi.spyOn(bridge, "loadCanvasModels").mockResolvedValue({ models: [], providers: [], errors: [] });
  vi.spyOn(bridge, "loadCanvasRuns").mockResolvedValue({ items: [], nextCursor: null });
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  const key = async (target: Element, value: string, modifiers = {}) => {
    const event = Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: value, ...modifiers });
    await act(async () => target.dispatchEvent(event)); return event;
  };
  try {
    await act(async () => root.render(<CanvasScreen workspaceId="keys" workspaceName="Test" storageScope="keys" agentBusy={false} onRequestAgent={vi.fn()} />));
    await act(async () => host.container.querySelector('[data-template="image"]')!.dispatchEvent(new Event("click", { bubbles: true })));
    const main = host.container.querySelector("main")!;
    const bounds = host.container.getBoundingClientRect();
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function () {
      return { ...bounds, left: this.getAttribute("class")?.includes("canvas-node-inspector") ? 320 : 0 };
    });
    flow.fitView.mockClear();
    const inspectedId = boardNodes[0].node.id;
    await act(async () => boardNodes[0].onInspect(inspectedId));
    expect(host.container.querySelector(".canvas-node-inspector")).not.toBeNull();
    expect(flow.fitView).not.toHaveBeenCalled();
    await key(main, "f");
    expect(flow.fitView).toHaveBeenCalledWith(expect.objectContaining({ nodes: [{ id: inspectedId }] }));
    await key(main, "Escape");
    expect((await key(main, "a", { metaKey: true })).defaultPrevented).toBe(true);
    expect(flowNodes.every((node) => node.selected)).toBe(true);
    expect(host.container.textContent).toContain("4 selected");
    await key(main, "Escape");
    expect(flowNodes.some((node) => node.selected)).toBe(false);
    await act(async () => click(host.container, "Rename canvas"));
    const input = host.container.querySelector("input")!;
    expect((await key(input, "a", { metaKey: true })).defaultPrevented).toBe(false);
    expect((await key(input, "Backspace")).defaultPrevented).toBe(false);
    expect(flowNodes.some((node) => node.selected)).toBe(false);
    expect((await key(host.container, "a", { ctrlKey: true })).defaultPrevented).toBe(false);
    await key(main, "a", { ctrlKey: true });
    expect(flowNodes.every((node) => node.selected)).toBe(true);
    await key(main, "Delete");
    expect(flow.deleteElements).toHaveBeenCalledWith({ nodes: expect.arrayContaining(flowNodes), edges: [] });
    await act(async () => click(host.container, "Execution plan"));
    expect(host.container.querySelector("aside")?.getAttribute("aria-label")).toBe("Execution plan");
    await key(main, "Escape");
    expect(host.container.querySelector("aside")).toBeNull();
  } finally {
    await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
});

test("a delayed asset picker preserves newer node edits and ignores a removed node", async () => {
  const backup = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => backup.get(key) ?? null, setItem: (key: string, value: string) => backup.set(key, value), removeItem: (key: string) => backup.delete(key) });
  vi.stubGlobal("crypto", webcrypto);
  vi.spyOn(bridge, "loadCanvases").mockResolvedValue([]);
  vi.spyOn(bridge, "loadCanvasModels").mockResolvedValue({ models: [], providers: [], errors: [] });
  vi.spyOn(bridge, "loadCanvasRuns").mockResolvedValue({ items: [], nextCursor: null });
  vi.spyOn(bridge, "loadCanvasAssetPreview").mockResolvedValue(null);
  let complete!: (asset: Awaited<ReturnType<typeof bridge.importCanvasAsset>>) => void;
  vi.spyOn(bridge, "importCanvasAsset").mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  try {
    await act(async () => root.render(<CanvasScreen workspaceId="ws_test" workspaceName="Test" storageScope="picker" agentBusy={false} onRequestAgent={vi.fn()} />));
    await act(async () => host.container.querySelector('[data-template="blank"]')!.dispatchEvent(new Event("click", { bubbles: true })));
    await act(async () => click(host.container, "Add media"));
    const initial = boardNodes[0]!;
    await act(async () => initial.onChooseAsset(initial.node.id));
    await act(async () => boardNodes[0]!.onPatch(initial.node.id, { title: "My reference", config: { modality: "image", selectedResultId: "keep-selection" } }));
    const asset = { path: "/workspace/reference.png", name: "reference.png", kind: "image" as const };
    await act(async () => complete(asset));
    expect(boardNodes[0]!.node).toMatchObject({ title: "My reference", config: { asset, selectedResultId: "keep-selection" } });
    await act(async () => boardNodes[0]!.onChooseAsset(initial.node.id));
    await act(async () => click(host.container, "Undo canvas change"));
    await act(async () => click(host.container, "Undo canvas change"));
    await act(async () => click(host.container, "Undo canvas change"));
    expect(boardNodes).toHaveLength(0);
    await act(async () => complete(asset));
    expect(boardNodes).toHaveLength(0);
  } finally {
    await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
});

test("a restored canvas keeps its unfinished name and a late reload cannot replace a newer save", async () => {
  const original: SavedCanvas = { canvas: { version: 1, id: "test-canvas", name: "Original", nodes: [], edges: [] }, revision: "old", path: "/canvas/test-canvas.json" };
  const key = "ralphy.canvas.draft:scope:workspace";
  const backup = new Map([[key, JSON.stringify({ canvas: { ...original.canvas, name: "" }, saved: original })]]);
  vi.stubGlobal("localStorage", { getItem: (name: string) => backup.get(name) ?? null, setItem: (name: string, value: string) => backup.set(name, value), removeItem: (name: string) => backup.delete(name) });
  const load = vi.spyOn(bridge, "loadCanvases").mockResolvedValue([original]);
  vi.spyOn(bridge, "saveCanvas").mockImplementation(async (_workspace, canvas) => ({ ...original, canvas, revision: "new" }));
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let editor: ReturnType<typeof useCanvasEditor>;
  function Harness() { editor = useCanvasEditor("workspace", "scope", false); return null; }
  try {
    await act(async () => root.render(<Harness />));
    expect(editor!.draft?.name).toBe("");
    expect(editor!.dirty).toBe(true);
    await act(async () => editor!.edit({ ...original.canvas, name: "Renamed" }));
    let resolveLoad!: (items: SavedCanvas[]) => void;
    load.mockImplementationOnce(() => new Promise((resolve) => { resolveLoad = resolve; }));
    let pending!: Promise<void>;
    await act(async () => { pending = editor!.reload(); });
    await act(async () => { await editor!.save(); });
    await act(async () => { resolveLoad([original]); await pending; });
    expect(editor!.draft?.name).toBe("Renamed");
    expect(editor!.saved?.revision).toBe("new");
    expect([...backup.keys()].filter((key) => key.startsWith("ralphy.canvas.draft:"))).toHaveLength(0);
  } finally {
    await act(async () => root.unmount());
    host.restore();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

test.each([false, true])("a save finishing after unmount clears only its own backup (newer draft: %s)", async (newer) => {
  const key = "ralphy.canvas.draft:scope:workspace";
  const backup = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (name: string) => backup.get(name) ?? null, setItem: (name: string, value: string) => backup.set(name, value), removeItem: (name: string) => backup.delete(name) });
  vi.stubGlobal("crypto", webcrypto);
  vi.spyOn(bridge, "loadCanvases").mockResolvedValue([]);
  let complete!: (saved: SavedCanvas) => void;
  vi.spyOn(bridge, "saveCanvas").mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let editor: ReturnType<typeof useCanvasEditor>;
  function Harness() { editor = useCanvasEditor("workspace", "scope", false); return null; }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => editor!.create("blank"));
    const canvas = editor!.draft!;
    let pending!: Promise<SavedCanvas | null>;
    await act(async () => { pending = editor!.save(); });
    await act(async () => root.render(null));
    if (newer) backup.set(key, "newer draft backup");
    await act(async () => { complete({ canvas, path: "/canvas.json", revision: "saved" }); await pending; });
    expect(backup.get(key)).toBe(newer ? "newer draft backup" : undefined);
  } finally {
    await act(async () => root.unmount());
    host.restore();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
