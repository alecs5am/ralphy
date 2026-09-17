import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import { GENERATION_UNIT_CHANNELS, type GenerationUnitDestination, type GenerationUnitSource, type SavedGenerationUnit } from "../../shared/generation-units";
import { generationOutputs } from "../../shared/generation-studio";
import { canvasId, type CanvasAsset, type CanvasNode } from "../../shared/workflow-canvas";
import type { CanvasRun, CanvasRunResult } from "../../shared/canvas-runtime";
import type { JsonValue, Page } from "../ralphy/types";
import { RalphyBridgeError } from "../ralphy/client";
import { canvasAssetMime, readCanvasRun, readCanvasRuns, readCanvasText, validateCanvasAsset } from "./runtime-files";
import { generationArguments, modelPrompt } from "./runtime-plan";
import type { RuntimeDependencies } from "./runtime";

async function all<T>(load: (after?: string) => Promise<Page<T>>): Promise<T[]> {
  const rows: T[] = [], seen = new Set<string>(); let after: string | undefined;
  do {
    const page = await load(after); rows.push(...page.items);
    if (!page.nextCursor) return rows;
    if (seen.has(page.nextCursor)) throw new Error("The Unit list could not be loaded completely. Refresh and try again.");
    seen.add(page.nextCursor); after = page.nextCursor;
  } while (after);
  return rows;
}
const projectContext = (workspaceId: string, projectId: string | null) => ({ workspaceId, ...(projectId ? { projectId } : {}) });

async function sourceModel(runtime: RuntimeDependencies, run: CanvasRun, resultId: string): Promise<{ run: CanvasRun; node: CanvasNode }> {
  const model = (run: CanvasRun) => run.snapshot.nodes.find((node) => node.kind === "model" && run.nodes.some((entry) => entry.nodeId === node.id && entry.results.some((result) => result.id === resultId)));
  const node = model(run); if (node) return { run, node };
  let before: string | null = null;
  do {
    const page = await readCanvasRuns(runtime.root, runtime.workspaceId, run.canvasId, before);
    for (const candidate of page.items) { const node = model(candidate); if (node && candidate.mode === "execute") return { run: candidate, node }; }
    before = page.nextCursor;
  } while (before);
  throw new Error("The original generation record is missing. Restore its workspace backup before saving this result to a Unit.");
}

async function fileFor(runtime: RuntimeDependencies, asset: CanvasAsset) {
  const checked = await validateCanvasAsset(runtime.root, asset, runtime.workspaceId);
  const mime = canvasAssetMime(checked.path) ?? ({ ".txt": "text/plain", ".md": "text/markdown", ".json": "application/json" } as Record<string, string>)[extname(checked.path).toLowerCase()];
  if (!mime) throw new Error("This result file type cannot be saved to a Unit");
  return { path: checked.path, name: basename(asset.name), mime };
}

export async function saveGenerationToUnit(runtime: RuntimeDependencies, source: GenerationUnitSource, destination: GenerationUnitDestination): Promise<SavedGenerationUnit> {
  if (!source || Object.keys(source).some((key) => !["canvasId", "runId", "resultId"].includes(key)) || typeof source.resultId !== "string" || !source.resultId || source.resultId.length > 256) throw new Error("Choose a saved generated result");
  if (!destination || Object.keys(destination).some((key) => !["projectId", "unitId", "expectedLatestRevisionId", "name"].includes(key)) || destination.projectId === undefined) throw new Error("Choose where to save this Unit");
  const projectId = destination.projectId === null ? null : canvasId(destination.projectId);
  if (destination.unitId !== undefined) canvasId(destination.unitId);
  if (destination.expectedLatestRevisionId != null) canvasId(destination.expectedLatestRevisionId);
  const context = projectContext(runtime.workspaceId, projectId);
  if (projectId) await runtime.request("project.show", { context, projectId });
  const run = await readCanvasRun(runtime.root, runtime.workspaceId, canvasId(source.canvasId), canvasId(source.runId));
  const result = generationOutputs(run).find((result) => result.id === source.resultId);
  if (!result?.asset || !["image", "video", "audio"].includes(result.kind)) throw new Error("Save a generated image, video or audio result. Input references and text previews are not supported.");
  const origin = await sourceModel(runtime, run, result.id);
  const inputs = await Promise.all(origin.run.snapshot.edges.filter((edge) => edge.to === origin.node.id).flatMap((edge) => {
    const parent = origin.run.snapshot.nodes.find((node) => node.id === edge.from);
    const results = origin.run.nodes.find((entry) => entry.nodeId === edge.from)?.results ?? [];
    return parent?.kind === "variation" ? [results.find((result) => result.id === parent.config?.selectedResultId) ?? results[0]].filter((result): result is CanvasRunResult => Boolean(result)) : results;
  }).map(async (input): Promise<CanvasRunResult> => input.asset?.kind === "text" ? { ...input, text: await readCanvasText(runtime.root, runtime.workspaceId, input.asset) } : input));
  const references = [...new Map(inputs.filter((input) => input.asset).map((input) => [input.asset!.path, input])).values()];
  const file = await fileFor(runtime, result.asset);
  const copiedReferences = await Promise.all(references.map((input) => fileFor(runtime, input.asset!)));
  const modality = origin.node.config?.modality ?? result.kind;
  const operation = modality === "audio" ? origin.node.config?.operation ?? "voiceover" : modality;
  const roles = new Map(origin.run.snapshot.nodes.filter((node) => node.kind === "media" && node.config?.operation).map((node) => [node.id, node.config!.operation!]));
  const arguments_ = generationArguments(origin.node, inputs, "saved-result", roles);
  const referenceFlags: Record<string, string> = { "--ref": "refs", "--first-frame": "firstFrame", "--last-frame": "lastFrame", "--ref-video": "refVideos" };
  const referenceBindings = references.flatMap((input, referenceIndex) => input.kind === "text" ? [{ referenceIndex, role: "prompt" }] : []);
  for (let index = 0; index < arguments_.length; index++) {
    const role = referenceFlags[arguments_[index]!]; if (!role) continue;
    for (let next = index + 1; next < arguments_.length && !arguments_[next]!.startsWith("--"); next++) {
      const referenceIndex = references.findIndex((input) => input.asset!.path === arguments_[next]);
      if (referenceIndex >= 0) referenceBindings.push({ referenceIndex, role });
    }
  }
  const provenance: JsonValue = {
    source: run.canvasId === "generation-studio" ? "Create" : "Canvas", canvasId: origin.run.canvasId, runId: origin.run.id, resultId: result.id,
    nodeId: origin.node.id, modelId: origin.node.config?.modelId ?? null, provider: origin.node.config?.provider ?? (modality === "audio" ? "elevenlabs" : "openrouter"),
    modality, operation, variants: origin.node.config?.variants ?? 1, referenceBindings,
    parameters: origin.node.config?.parameters ?? {}, prompt: modelPrompt(origin.node, inputs),
    inputs: references.map((input, index) => ({ referenceIndex: index, resultId: input.id, label: input.label, kind: input.kind })),
  };
  const key = createHash("sha256").update(JSON.stringify([origin.run.canvasId, origin.run.id, result.id])).digest("hex");
  runtime.assertCurrent();
  const saved = await runtime.request("unit.saveMedia", {
    context, key, kind: result.kind as "image" | "video" | "audio", file, references: copiedReferences, provenance,
    ...(destination.unitId ? { unitId: destination.unitId, expectedLatestRevisionId: destination.expectedLatestRevisionId } : { name: destination.name }),
  }).catch((error: unknown) => {
    const reason = error instanceof RalphyBridgeError && error.details && typeof error.details === "object" && "reason" in error.details ? error.details.reason : null;
    if (typeof reason === "string") throw new Error(reason);
    throw error;
  });
  runtime.assertCurrent();
  return saved;
}

export function registerGenerationUnitIpc(deps: { handle(channel: string, handler: (...args: unknown[]) => Promise<unknown>): void; capture(workspaceId: string): Promise<RuntimeDependencies> }) {
  deps.handle(GENERATION_UNIT_CHANNELS.options, async (workspace, project) => {
    const workspaceId = canvasId(workspace), projectId = project === null ? null : canvasId(project);
    const runtime = await deps.capture(workspaceId), context = projectContext(workspaceId, projectId);
    if (projectId) await runtime.request("project.show", { context, projectId });
    const [owner, projects, units] = await Promise.all([
      runtime.request("workspace.show", { context: { workspaceId }, workspaceId }),
      all((after) => runtime.request("project.list", { context: { workspaceId }, workspaceId, after, limit: 100 })),
      all((after) => runtime.request("unit.list", { context, after, limit: 100 })),
    ]);
    runtime.assertCurrent();
    return { workspaceName: owner.name, projects: projects.map((project) => ({ id: project.id, name: project.name })), units: units.filter((unit) => unit.projectId === projectId).map((unit) => ({ id: unit.id, label: unit.slug, format: unit.format, latestRevisionId: unit.latestRevisionId })) };
  });
  deps.handle(GENERATION_UNIT_CHANNELS.save, async (workspace, source, destination) => saveGenerationToUnit(await deps.capture(canvasId(workspace)), source as GenerationUnitSource, destination as GenerationUnitDestination));
}
