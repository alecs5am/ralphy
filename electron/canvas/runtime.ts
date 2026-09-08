import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import type { CanvasNode, CanvasAsset, WorkflowCanvas } from "../../shared/workflow-canvas";
import { canvasNodePorts } from "../../shared/canvas-ports";
import { canvasReadiness } from "../../shared/canvas-readiness";
import { canvasId, parseCanvas } from "../../shared/workflow-canvas";
import type { CanvasRun, CanvasRunOptions, CanvasRunResult, CanvasNodeRun } from "../../shared/canvas-runtime";
import { loadCanvases } from "./store";
import { generationArguments, modelPrompt, selectedCanvasNodes } from "./runtime-plan";
import { importCanvasFile, readCanvasRuns, validateCanvasAsset, writeCanvasRun, writeCanvasText } from "./runtime-files";
import { hydrateCanvasResult, type CanvasPreview, type CanvasRequest } from "./runtime-results";
import type { CanvasCli } from "./runtime-cli";

export interface RuntimeDependencies {
  root: string;
  workspaceId: string;
  cli: CanvasCli;
  request: CanvasRequest;
  mint: CanvasPreview;
  assertCurrent(): void;
  text(model: string, prompt: string, signal: AbortSignal): Promise<string>;
}
const active = new Map<string, { run: CanvasRun; controller: AbortController; completion: Promise<void> }>();
const runKey = (root: string, workspaceId: string, id: string) => `${root}:${workspaceId}:${id}`;
const failure = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);
const kindFor = (path: string): CanvasAsset["kind"] | null => {
  const extension = extname(path).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(extension) ? "image" : [".mp4", ".mov", ".webm"].includes(extension) ? "video" : [".mp3", ".wav", ".m4a", ".ogg"].includes(extension) ? "audio" : [".txt", ".md", ".json"].includes(extension) ? "text" : null;
};

/** CLI replies differ by generation kind; accept only explicit output fields, then check files. */
function outputPaths(value: unknown, depth = 0): string[] {
  if (depth > 6) return [];
  if (typeof value === "string") return kindFor(value) ? [value] : [];
  if (Array.isArray(value)) return value.slice(0, 400).flatMap((item) => outputPaths(item, depth + 1));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).filter(([key]) => ["path", "output", "outputPath", "output_path", "file_path", "absolutePath", "out", "file", "files", "outputs", "artifacts", "saved", "results", "variants", "image", "video", "audio", "data"].includes(key)).flatMap(([, item]) => outputPaths(item, depth + 1));
}

async function resultFiles(deps: RuntimeDependencies, node: CanvasNode, value: unknown): Promise<CanvasRunResult[]> {
  const results: CanvasRunResult[] = [];
  for (const named of [...new Set(outputPaths(value))]) {
    const path = resolve(deps.root, named), kind = kindFor(path)!;
    const local = relative(deps.root, path);
    if (!local || local.startsWith("..") || local.startsWith("/")) throw new Error("Runtime output is outside its data root");
    const asset = await importCanvasFile(deps.root, deps.workspaceId, path);
    const checked = await validateCanvasAsset(deps.root, asset, deps.workspaceId);
    const text = kind === "text" && checked.bytes <= 100_000 ? (await readFile(checked.path, "utf8")).slice(0, 20_000) : undefined;
    results.push({ id: randomUUID(), nodeId: node.id, kind, label: asset.name, asset, ...(text ? { text } : {}) });
  }
  return results;
}

async function modelNode(deps: RuntimeDependencies, run: CanvasRun, node: CanvasNode, entry: CanvasNodeRun, inputs: CanvasRunResult[], signal: AbortSignal): Promise<void> {
  const variants = node.config?.variants ?? 1;
  const modality = node.config?.modality;
  if (modality === "text") {
    if (node.config?.provider && node.config.provider !== "openrouter") throw new Error("Text nodes currently use the configured OpenRouter provider");
    if (!node.config?.modelId) throw new Error("Choose a text model");
    if (Object.keys(node.config.parameters ?? {}).length) throw new Error("This text connector does not expose model parameters yet");
    const prompt = modelPrompt(node, inputs);
    if (!prompt.trim() || prompt.length > 100_000) throw new Error("Provide text instructions under 100,000 characters");
    if (run.mode === "preview") { entry.results = [{ id: randomUUID(), nodeId: node.id, kind: "text", label: "Text request preview", text: prompt }]; return; }
    for (let variant = 0; variant < variants; variant++) {
      signal.throwIfAborted();
      const text = await deps.text(node.config.modelId, prompt, signal);
      if (!text.trim()) throw new Error("The text model returned no text");
      const asset = await writeCanvasText(deps.root, run.workspaceId, text);
      entry.results.push({ id: randomUUID(), nodeId: node.id, kind: "text", label: `${node.title} · ${variant + 1}`, text: text.slice(0, 20_000), asset });
      await writeCanvasRun(deps.root, run);
    }
    return;
  }
  let previewCost: number | null = 0;
  for (let variant = 0; variant < variants; variant++) {
    signal.throwIfAborted(); deps.assertCurrent();
    const slot = `canvas-${run.id.slice(-20)}-${node.id.slice(-20)}-${variant + 1}`;
    const roles = new Map(run.snapshot.nodes.filter((item) => item.kind === "media" && item.config?.operation).map((item) => [item.id, item.config!.operation!]));
    const args = generationArguments(node, inputs, slot, roles);
    if (run.mode === "preview" && node.config?.operation === "sfx") throw new Error("Sound effect previews are not supported by the installed runtime");
    const value = await deps.cli([...args, ...(run.mode === "preview" ? ["--dry-run"] : [])], signal);
    if (run.mode === "preview") {
      const summary = value as { dryRun?: boolean; cost_estimate_usd?: unknown; would_call?: unknown };
      if (summary?.dryRun !== true) throw new Error("Runtime did not confirm a dry run");
      previewCost = previewCost !== null && typeof summary.cost_estimate_usd === "number" && Number.isFinite(summary.cost_estimate_usd) && summary.cost_estimate_usd >= 0 ? previewCost + summary.cost_estimate_usd : null;
      entry.estimatedCostUsd = previewCost;
    } else {
      const results = await resultFiles(deps, node, value);
      if (!results.length) throw new Error("Runtime finished without returning a readable output file");
      entry.results.push(...results);
    }
    await writeCanvasRun(deps.root, run);
  }
}

async function localNode(deps: RuntimeDependencies, run: CanvasRun, node: CanvasNode, inputs: CanvasRunResult[]): Promise<CanvasRunResult[]> {
  const result = (text: string): CanvasRunResult => ({ id: randomUUID(), nodeId: node.id, kind: "text", label: node.title, text });
  if (node.kind === "prompt") return [result(node.value)];
  if (node.kind === "media") {
    const asset = node.config?.asset;
    if (!asset) throw new Error("Import a file for this media node");
    const checked = await validateCanvasAsset(deps.root, asset, deps.workspaceId);
    const text = asset.kind === "text" && checked.bytes <= 100_000 ? await readFile(checked.path, "utf8") : undefined;
    return [{ id: randomUUID(), nodeId: node.id, kind: asset.kind, label: asset.name, asset, ...(text ? { text } : {}) }];
  }
  const operation = node.kind === "variation" ? "select-first" : node.kind === "output" ? "save-output" : node.config?.operation ?? (node.kind === "step" ? "collect" : "");
  if (!["join-text", "collect", "select-first", "save-output"].includes(operation)) throw new Error("Choose a supported connector operation");
  if (operation === "join-text") return [result([...inputs.flatMap((item) => item.text ? [item.text] : []), node.value].filter(Boolean).join("\n\n"))];
  if (node.kind === "variation" && node.config?.selectedResultId) {
    const history = await readCanvasRuns(deps.root, run.workspaceId, run.canvasId);
    const candidates = history.filter((item) => item.mode === "execute").flatMap((item) => item.nodes).find((entry) => entry.results.some((item) => item.id === node.config!.selectedResultId))?.results;
    const selected = candidates?.find((item) => item.id === node.config!.selectedResultId);
    if (!selected) throw new Error("The selected result is no longer in this canvas history. Choose another result.");
    if (selected.asset) await validateCanvasAsset(deps.root, selected.asset, deps.workspaceId);
    return candidates!.map((item) => ({ ...item, nodeId: node.id }));
  }
  if (!inputs.length && run.mode === "execute") throw new Error("Connect an upstream result before running this step");
  let selected = node.kind === "variation" ? inputs : operation === "select-first" ? [inputs.find((item) => item.id === node.config?.selectedResultId) ?? inputs[0]].filter((item): item is CanvasRunResult => !!item) : inputs;
  if (operation === "save-output" && run.mode === "execute") selected = await Promise.all(selected.map(async (item) => item.text && !item.asset ? { ...item, asset: await writeCanvasText(deps.root, run.workspaceId, item.text) } : item));
  return selected.map((item) => ({ ...item, nodeId: node.id }));
}

async function executeRun(deps: RuntimeDependencies, run: CanvasRun, controller: AbortController): Promise<void> {
  try {
    run.status = "running";
    await writeCanvasRun(deps.root, run);
    for (const entry of run.nodes) {
      controller.signal.throwIfAborted(); deps.assertCurrent();
      const node = run.snapshot.nodes.find((node) => node.id === entry.nodeId)!;
      const incoming = run.snapshot.edges.filter((edge) => edge.to === node.id);
      const inputs = incoming.flatMap((edge) => {
        const parent = run.snapshot.nodes.find((item) => item.id === edge.from)!;
        let results = run.nodes.find((item) => item.nodeId === edge.from)?.results ?? [];
        if (parent.kind === "variation") results = [results.find((item) => item.id === parent.config?.selectedResultId) ?? results[0]].filter((item): item is CanvasRunResult => !!item);
        const port = edge.targetPort ? canvasNodePorts(node).inputs.find((item) => item.id === edge.targetPort) : null;
        if (port && port.type !== "any" && results.some((item) => item.kind !== port.type)) throw new Error(`Connect ${port.type} media to ${node.title}'s ${port.label} input`);
        return results;
      });
      for (const input of inputs) if (input.asset) await validateCanvasAsset(deps.root, input.asset, deps.workspaceId);
      entry.status = "running"; entry.startedAt = Date.now();
      await writeCanvasRun(deps.root, run);
      try {
        if (run.mode === "preview" && node.kind === "model" && incoming.some((edge) => !(run.nodes.find((item) => item.nodeId === edge.from)?.results.length))) throw new Error("Preview is waiting for an upstream generated result. Run that step or choose an existing result to estimate this model.");
        if (node.kind === "model") await modelNode(deps, run, node, entry, inputs, controller.signal);
        else entry.results = await localNode(deps, run, node, inputs);
        controller.signal.throwIfAborted();
        entry.status = "succeeded";
      } catch (cause) { entry.status = controller.signal.aborted ? "cancelled" : "failed"; entry.error = failure(cause); throw cause; }
      finally { entry.endedAt = Date.now(); }
      await writeCanvasRun(deps.root, run);
    }
    run.status = "succeeded";
  } catch (cause) {
    run.status = controller.signal.aborted ? "cancelled" : "failed";
    run.error = controller.signal.aborted ? "Stopped locally. A provider may still finish a request already submitted." : failure(cause);
    for (const node of run.nodes) if (node.status === "pending") { node.status = "cancelled"; node.error = "An earlier step stopped the workflow."; }
  } finally {
    run.endedAt = Date.now();
    await writeCanvasRun(deps.root, run);
    active.delete(runKey(deps.root, run.workspaceId, run.id));
  }
}

export function createCanvasRuntime(deps: RuntimeDependencies) {
  const hydrate = async (run: CanvasRun): Promise<CanvasRun> => ({ ...structuredClone(run), nodes: await Promise.all(run.nodes.map(async (node) => ({ ...node, results: await Promise.all(node.results.map((result) => hydrateCanvasResult(deps.root, deps.workspaceId, result, deps.request, deps.mint))) }))) });
  const startSnapshot = async (snapshot: WorkflowCanvas, options: CanvasRunOptions): Promise<CanvasRun> => {
      const checked = parseCanvas(snapshot), canvas = checked.id;
      deps.assertCurrent();
      if (!options || !["preview", "execute"].includes(options.mode) || typeof options.expectedRevision !== "string" || (options.nodeId !== undefined && typeof options.nodeId !== "string")) throw new Error("Invalid canvas run request");
      const history = checked.nodes.some((node) => node.kind === "variation" && node.config?.selectedResultId) ? await readCanvasRuns(deps.root, deps.workspaceId, canvas) : [];
      deps.assertCurrent();
      const readiness = canvasReadiness(checked, undefined, history);
      const nodes = selectedCanvasNodes(checked, options.nodeId);
      const blocked = nodes.find((node) => !readiness.get(node.id)?.ready);
      if (blocked) throw new Error(`${blocked.title}: ${readiness.get(blocked.id)!.issues.join(" · ")}`);
      if ([...active.entries()].some(([key, { run }]) => key === runKey(deps.root, deps.workspaceId, run.id) && run.canvasId === canvas && ["pending", "running"].includes(run.status))) throw new Error("This canvas already has a running workflow");
      if (!nodes.length) throw new Error(options.nodeId ? "Choose a runnable node" : "Connect an Output to define this run, or run an individual node");
      const run: CanvasRun = { id: `run-${Date.now()}-${randomUUID()}`, canvasId: canvas, canvasRevision: options.expectedRevision, workspaceId: deps.workspaceId, mode: options.mode, status: "pending", startedAt: Date.now(), endedAt: null, error: null, snapshot: checked, nodes: nodes.map((node) => ({ nodeId: node.id, status: "pending", startedAt: null, endedAt: null, coreRunIds: [], results: [], error: null, estimatedCostUsd: null })) };
      const controller = new AbortController();
      const entry = { run, controller, completion: Promise.resolve() };
      active.set(runKey(deps.root, deps.workspaceId, run.id), entry);
      const persisted = writeCanvasRun(deps.root, run);
      entry.completion = persisted.then(() => executeRun(deps, run, controller)).catch((cause) => { run.status = "failed"; run.error = failure(cause); active.delete(runKey(deps.root, deps.workspaceId, run.id)); });
      await persisted;
      return structuredClone(run);
  };
  return {
    startSnapshot,
    async start(canvas: string, options: CanvasRunOptions): Promise<CanvasRun> {
      canvasId(canvas);
      const saved = (await loadCanvases(deps.root, deps.workspaceId, deps.assertCurrent)).find((item) => item.canvas.id === canvas);
      if (!saved || saved.revision !== options?.expectedRevision) throw new Error("This canvas changed. Save or reload it before running.");
      return startSnapshot(saved.canvas, options);
    },
    async list(canvas: string): Promise<CanvasRun[]> {
      const runs = await readCanvasRuns(deps.root, deps.workspaceId, canvasId(canvas));
      for (const run of runs) if ((run.status === "pending" || run.status === "running") && !active.has(runKey(deps.root, deps.workspaceId, run.id))) {
        run.status = "failed"; run.error = "Desktop restarted before this workflow finished. Review any provider outputs before running again."; run.endedAt = Date.now();
        await writeCanvasRun(deps.root, run);
      }
      return Promise.all(runs.map(hydrate));
    },
    async cancel(id: string): Promise<CanvasRun> {
      canvasId(id);
      const entry = active.get(runKey(deps.root, deps.workspaceId, id));
      if (!entry) throw new Error("This workflow is no longer running. Refresh its history.");
      entry.controller.abort(new Error("Workflow cancelled"));
      await entry.completion;
      return hydrate(entry.run);
    },
  };
}
