import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvasRuntime, type RuntimeDependencies } from "../electron/canvas/runtime";
import { importCanvasFile, readCanvasRuns, writeCanvasRun, writeCanvasText } from "../electron/canvas/runtime-files";
import { registerGenerationIpc } from "../electron/canvas/generation-ipc";
import * as runtimeFiles from "../electron/canvas/runtime-files";
import { MEDIA_CHANNELS } from "../electron/media/types";
import type { CanvasRun, CanvasRunPage } from "../shared/canvas-runtime";
import type { WorkflowCanvas } from "../shared/workflow-canvas";

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const fullText = `${"x".repeat(25_000)}REQUIRED_TAIL`;
const graph = (): WorkflowCanvas => ({ version: 2, id: "workflow", name: "Text workflow", nodes: [
  { id: "first", kind: "model", title: "First", value: "Write a long draft", x: 0, y: 0, config: { modality: "text", provider: "openrouter", modelId: "test/text" } },
  { id: "second", kind: "model", title: "Second", value: "", x: 300, y: 0, config: { modality: "text", provider: "openrouter", modelId: "test/text" } },
  { id: "out", kind: "output", title: "Output", value: "", x: 600, y: 0 },
], edges: [{ from: "first", to: "second", targetPort: "prompt" }, { from: "second", to: "out" }] });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "canvas-history-text-")); roots.push(root);
  const deps: RuntimeDependencies = { root, workspaceId: "workspace", cli: vi.fn(async () => ({ text: fullText })), request: vi.fn(), mint: async () => ({ url: "ralphy-media://asset/checked" }), assertCurrent() {} };
  return { root, deps, runtime: createCanvasRuntime(deps) };
}
async function finished(runtime: ReturnType<typeof createCanvasRuntime>, canvas = "workflow") {
  for (let i = 0; i < 100; i++) {
    const run = (await runtime.list(canvas)).items[0];
    if (run && ["succeeded", "failed", "cancelled"].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Run did not finish");
}
async function seedHistory(root: string, canvas: string) {
  const snapshot = graph(); snapshot.id = canvas;
  const asset = await writeCanvasText(root, "workspace", fullText);
  const oldest: CanvasRun = { id: "run-1700000000000-old", canvasId: canvas, workspaceId: "workspace", canvasRevision: "revision", mode: "execute", status: "succeeded", startedAt: 1_700_000_000_000, endedAt: 1_700_000_000_001, error: null, snapshot,
    nodes: [{ nodeId: "first", status: "succeeded", startedAt: 1, endedAt: 2, coreRunIds: [], estimatedCostUsd: null, error: null, results: [{ id: "old-result", nodeId: "first", kind: "text", label: "Original draft", text: fullText.slice(0, 20_000), asset }] }],
  };
  await writeCanvasRun(root, oldest);
  for (let i = 1; i <= 103; i++) await writeCanvasRun(root, { ...oldest, id: `run-${1_700_000_000_000 + i}-later`, startedAt: oldest.startedAt + i, mode: i % 3 ? "execute" : "preview", status: i % 2 ? "failed" : "succeeded", nodes: [] });
  return oldest;
}

test("complete generated text reaches the next model while durable previews stay abbreviated", async () => {
  const { deps, runtime } = await setup();
  await runtime.startSnapshot(graph(), { mode: "execute", expectedRevision: "revision" });
  const run = await finished(runtime);
  expect(run.status).toBe("succeeded");
  expect(vi.mocked(deps.cli).mock.calls[1][2]).toBe(fullText);
  expect(run.nodes[0].results[0].text).toHaveLength(20_000);
  expect(await readFile(run.nodes[0].results[0].asset!.path, "utf8")).toBe(fullText);
});

test("a stale running history page cannot rewrite a durably completed run as interrupted", async () => {
  const { root, runtime } = await setup();
  // Polling terminal JSON can finish before its directory sync and active-run cleanup. Seed
  // the completed record so this regression exercises a stale read after execution has ended.
  const complete: CanvasRun = { id: "run-1700000000000-complete", canvasId: "workflow", workspaceId: "workspace", canvasRevision: "revision", mode: "execute", status: "succeeded", startedAt: 1_700_000_000_000, endedAt: 1_700_000_000_001, error: null, snapshot: graph(), nodes: [] };
  await writeCanvasRun(root, complete);
  const write = vi.spyOn(runtimeFiles, "writeCanvasRun");
  vi.spyOn(runtimeFiles, "readCanvasRuns").mockResolvedValueOnce({ items: [{ ...complete, status: "running", endedAt: null }], nextCursor: null });
  expect((await runtime.list("workflow")).items[0].status).toBe("succeeded");
  expect((await readCanvasRuns(root, "workspace", "workflow")).items[0].status).toBe("succeeded");
  expect(write).not.toHaveBeenCalled();
});

test("older pages and saved selections survive restart without regenerating the original text", async () => {
  const { root, deps } = await setup();
  const oldest = await seedHistory(root, "workflow");
  const runtime = createCanvasRuntime(deps);
  const first = await runtime.list("workflow");
  expect(first.items).toHaveLength(100); expect(first.nextCursor).not.toBeNull();
  expect(first.items.some((run) => run.id === oldest.id)).toBe(false);
  const older = await runtime.list("workflow", { before: first.nextCursor });
  expect(older.items).toHaveLength(4); expect(older.nextCursor).toBeNull();
  expect(older.items.at(-1)!.nodes[0].results[0].text).toHaveLength(20_000);
  const selected = await runtime.list("workflow", { resultIds: ["old-result"] });
  expect(selected.items.at(-1)?.id).toBe(oldest.id);
  const next = graph();
  next.nodes.push({ id: "choice", kind: "variation", title: "Saved draft", value: "", x: 200, y: 0, config: { selectedResultId: "old-result" } });
  next.edges = [{ from: "first", to: "choice" }, { from: "choice", to: "second", targetPort: "prompt" }, { from: "second", to: "out" }];
  await runtime.startSnapshot(next, { mode: "execute", expectedRevision: "revision" });
  const reused = await finished(runtime);
  expect(reused.status, reused.error ?? JSON.stringify(reused.nodes)).toBe("succeeded"); expect(reused.nodes.map((node) => node.nodeId)).toEqual(["choice", "second", "out"]);
  expect(deps.cli).toHaveBeenCalledTimes(1); expect(vi.mocked(deps.cli).mock.calls[0][2]).toBe(fullText);
  await rm(oldest.nodes[0].results[0].asset!.path);
  expect((await runtime.list("workflow", { before: first.nextCursor })).items.at(-1)!.nodes[0].results[0].unavailableReason).toMatch(/file is missing.*backup/);
  await expect(runtime.startSnapshot(next, { mode: "execute", expectedRevision: "revision" })).rejects.toThrow(/file is missing or unavailable/);
  next.nodes.at(-1)!.config!.selectedResultId = "genuinely-missing";
  await expect(runtime.startSnapshot(next, { mode: "execute", expectedRevision: "revision" })).rejects.toThrow(/missing from saved history/);
  expect(deps.cli).toHaveBeenCalledTimes(1);
});

test("Create exposes older history through its native bridge and exports the original complete asset", async () => {
  const { root, deps } = await setup();
  const oldest = await seedHistory(root, "generation-studio");
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const destination = join(root, "export.txt");
  registerGenerationIpc({ handle: (channel, fn) => handlers.set(channel, fn), capture: async () => deps, fetcher: fetch, chooseExport: async () => destination });
  const load = handlers.get(MEDIA_CHANNELS.loadGenerationRuns)!;
  const page = await load("workspace") as CanvasRunPage;
  const older = await load("workspace", page.nextCursor) as CanvasRunPage;
  expect(page.items).toHaveLength(100); expect(older.items.at(-1)?.id).toBe(oldest.id);
  expect(await handlers.get(MEDIA_CHANNELS.exportGenerationAsset)!("workspace", older.items.at(-1)!.nodes[0].results[0].asset)).toBe(true);
  expect(await readFile(destination, "utf8")).toBe(fullText);
  expect(deps.cli).not.toHaveBeenCalled();
});

test("imported text and generated text files use their full content; combined oversized instructions fail before submission", async () => {
  const { root, deps, runtime } = await setup();
  const source = join(root, "source.txt"); await writeFile(source, fullText);
  const asset = await importCanvasFile(root, "workspace", source);
  const imported = graph(); imported.nodes[0] = { id: "first", kind: "media", title: "Imported draft", value: "", x: 0, y: 0, config: { asset } };
  await runtime.startSnapshot(imported, { mode: "execute", expectedRevision: "revision" });
  expect((await finished(runtime)).status).toBe("succeeded"); expect(vi.mocked(deps.cli).mock.calls[0][2]).toBe(fullText);
  const generatedFile = graph(); generatedFile.nodes.splice(1, 1); generatedFile.edges = [{ from: "first", to: "out" }];
  generatedFile.nodes[0].config = { modality: "image", provider: "openrouter", modelId: "test/file" };
  deps.cli = vi.fn().mockResolvedValue({ path: source });
  await runtime.startSnapshot(generatedFile, { mode: "execute", expectedRevision: "revision" });
  const fileRun = await finished(runtime); expect(fileRun.status).toBe("succeeded");
  imported.nodes[0].config = { asset: fileRun.nodes[0].results[0].asset };
  deps.cli = vi.fn().mockResolvedValue({ text: "Complete" });
  await runtime.startSnapshot(imported, { mode: "execute", expectedRevision: "revision" });
  expect((await finished(runtime)).status).toBe("succeeded"); expect(vi.mocked(deps.cli).mock.calls[0][2]).toBe(fullText);
  const large = await writeCanvasText(root, "workspace", "x".repeat(60_000));
  imported.nodes[0].config = { asset: large };
  imported.nodes.push({ ...imported.nodes[0], id: "extra" }); imported.edges.push({ from: "extra", to: "second", targetPort: "prompt" });
  deps.cli = vi.fn();
  await runtime.startSnapshot(imported, { mode: "execute", expectedRevision: "revision" });
  const rejected = await finished(runtime);
  expect(rejected.status).toBe("failed"); expect(rejected.error).toMatch(/Combined model instructions exceed 100,000/);
  expect(deps.cli).not.toHaveBeenCalled();
  await expect(readCanvasRuns(root, "workspace", "workflow", "../outside")).rejects.toThrow();
  await expect(runtime.list("workflow", { resultIds: [1 as unknown as string] })).rejects.toThrow(/Invalid saved result/);
});
