import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvasRuntime, type RuntimeDependencies } from "../electron/canvas/runtime";
import { importCanvasFile, readCanvasRuns, validateCanvasAsset, writeCanvasRun } from "../electron/canvas/runtime-files";
import { saveCanvas } from "../electron/canvas/store";
import type { WorkflowCanvas } from "../shared/workflow-canvas";
import { registerCanvasRuntimeIpc } from "../electron/canvas/runtime-ipc";
import { MEDIA_CHANNELS } from "../electron/media/types";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const graph = (): WorkflowCanvas => ({ version: 2, id: "workflow", name: "Test", nodes: [
  { id: "brief", kind: "prompt", title: "Brief", value: "A quiet forest", x: 0, y: 0 },
  { id: "image", kind: "model", title: "Image", value: "", x: 300, y: 0, config: { modality: "image", provider: "openrouter", modelId: "google/test", variants: 2 } },
  { id: "out", kind: "output", title: "Output", value: "", x: 600, y: 0 },
], edges: [{ from: "brief", to: "image" }, { from: "image", to: "out" }] });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "canvas-runtime-")); roots.push(root);
  const saved = await saveCanvas(root, "workspace", graph(), null);
  const deps: RuntimeDependencies = { root, workspaceId: "workspace", cli: vi.fn(), request: vi.fn(), mint: async () => ({ url: "ralphy-media://asset/guarded" }), assertCurrent() {} };
  const runtime = createCanvasRuntime(deps);
  const finished = async () => { for (let i = 0; i < 100; i++) { const { items: runs } = await runtime.list("workflow"); if (runs[0] && ["succeeded", "failed", "cancelled"].includes(runs[0].status)) return runs[0]; await new Promise((resolve) => setTimeout(resolve, 10)); } throw new Error("Run did not finish"); };
  return { root, saved, deps, runtime, finished };
}
test("preview uses real dry-run flags and persists cost without invented generated assets", async () => {
  const { deps, runtime, saved, finished } = await setup();
  deps.cli = vi.fn(async () => ({ dryRun: true, cost_estimate_usd: 0.04 }));
  await runtime.start("workflow", { mode: "preview", expectedRevision: saved.revision });
  const run = await finished();
  expect(run.status).toBe("succeeded"); expect(run.mode).toBe("preview");
  expect(run.nodes[1].estimatedCostUsd).toBe(0.08); expect(run.nodes[1].results).toEqual([]);
  expect(deps.cli).toHaveBeenCalledTimes(2);
  for (const [args] of vi.mocked(deps.cli).mock.calls) { expect(args).toContain("--dry-run"); expect(args).toContain("A quiet forest"); }
});
test("native execution saves real outputs, rehydrates guarded previews, and preserves the canvas", async () => {
  const { root, deps, runtime, saved, finished } = await setup();
  const path = join(root, "result.png"); await writeFile(path, "fixture image bytes");
  deps.cli = vi.fn(async () => ({ path }));
  await runtime.start("workflow", { mode: "execute", expectedRevision: saved.revision });
  const run = await finished();
  expect(run.status).toBe("succeeded"); expect(run.nodes[1].results).toHaveLength(2);
  for (const [args] of vi.mocked(deps.cli).mock.calls) expect(args).toContain("--no-retry");
  expect(run.nodes[2].results[0].previewUrl).toBe("ralphy-media://asset/guarded");
  const durable = await readCanvasRuns(root, "workspace", "workflow");
  expect(durable.items[0].nodes[2].results[0].previewUrl).toBeUndefined();
  expect(JSON.parse(await readFile(saved.path, "utf8"))).toEqual(graph());
});
test("generation receipts resolve the scoped immutable object without a legacy file path", async () => {
  const { root, deps, runtime, saved, finished } = await setup();
  const path = join(root, "sound.mp3"); await writeFile(path, "ID3generated sound");
  const next = graph(); next.nodes[1].config = { modality: "audio", provider: "elevenlabs", operation: "sfx", modelId: "elevenlabs-sfx", variants: 1 };
  const updated = await saveCanvas(root, "workspace", next, saved.revision);
  deps.cli = vi.fn(async () => ({ artifactId: "art-sound", revisionId: "arev-sound", runId: "run-core-sound" }));
  deps.request = vi.fn(async (method) => method === "media.revision.show" ? { id: "arev-sound", objectId: "obj-sound" } : { absolutePath: path, mime: "audio/mpeg", bytes: 18 }) as RuntimeDependencies["request"];
  await runtime.start("workflow", { mode: "execute", expectedRevision: updated.revision });
  const run = await finished();
  expect(run.status).toBe("succeeded");
  expect(run.nodes[1].results[0]).toMatchObject({ kind: "audio", previewUrl: "ralphy-media://asset/guarded" });
  expect(await readFile(run.nodes[1].results[0].asset!.path, "utf8")).toBe("ID3generated sound");
  expect(deps.request).toHaveBeenCalledWith("media.revision.show", { context: { workspaceId: "workspace" }, revisionId: "arev-sound" });
  expect(deps.request).toHaveBeenCalledWith("locator.resolve", { context: { workspaceId: "workspace" }, target: { type: "object", id: "obj-sound" }, purpose: "preview" });
});
test("SFX preview validates the graph with unknown cost and never submits a paid request", async () => {
  const { deps, runtime, saved, root, finished } = await setup();
  const next = graph(); next.nodes[1].config = { modality: "audio", provider: "elevenlabs", operation: "sfx", modelId: "elevenlabs-sfx" };
  const updated = await saveCanvas(root, "workspace", next, saved.revision);
  await runtime.start("workflow", { mode: "preview", expectedRevision: updated.revision });
  const run = await finished();
  expect(run.status).toBe("succeeded");
  expect(run.nodes[1].estimatedCostUsd).toBeNull();
  expect(deps.cli).not.toHaveBeenCalled();
});
test("text generation uses the workspace CLI route and stdin, then persists its output", async () => {
  const { root, deps, runtime, saved, finished } = await setup();
  const next = graph(); next.nodes[1].config = { modality: "text", provider: "openrouter", modelId: "test/text" };
  const updated = await saveCanvas(root, "workspace", next, saved.revision);
  deps.cli = vi.fn(async () => ({ text: "Generated script", runId: "run-text" }));
  await runtime.start("workflow", { mode: "execute", expectedRevision: updated.revision });
  const run = await finished();
  expect(run.status).toBe("succeeded");
  expect(deps.cli).toHaveBeenCalledWith(["generate", "text", "--model", "test/text", "--provider", "openrouter", "--stdin", "--no-retry"], expect.any(AbortSignal), "A quiet forest");
  expect(run.nodes[1].results[0].text).toBe("Generated script");
  expect(await readFile(run.nodes[1].results[0].asset!.path, "utf8")).toBe("Generated script");
});
test("restart recovery closes each interrupted node and preserves completed variants without replaying", async () => {
  const { root, deps, runtime, saved, finished } = await setup();
  const path = join(root, "partial.png"); await writeFile(path, "first variant");
  deps.cli = vi.fn().mockResolvedValueOnce({ path }).mockRejectedValueOnce(new Error("Provider response lost"));
  await runtime.start("workflow", { mode: "execute", expectedRevision: saved.revision });
  const failed = await finished();
  expect(failed.status).toBe("failed"); expect(failed.nodes[1].results).toHaveLength(1);
  expect(failed.error).toContain("No automatic resubmission was made");
  expect(deps.cli).toHaveBeenCalledTimes(2);
  failed.status = "running"; failed.endedAt = null;
  failed.nodes[1].status = "running"; failed.nodes[1].endedAt = null;
  failed.nodes[2].status = "pending"; failed.nodes[2].endedAt = null;
  await writeCanvasRun(root, failed);
  const recovered = (await runtime.list("workflow")).items[0];
  expect(recovered.status).toBe("failed");
  expect(recovered.nodes.map((node) => node.status)).toEqual(["succeeded", "failed", "cancelled"]);
  expect(recovered.nodes[1].results).toHaveLength(1);
  expect(recovered.nodes[1].error).toContain("outcome may be unknown");
  expect((await readCanvasRuns(root, "workspace", "workflow")).items[0].nodes.map((node) => node.status)).toEqual(["succeeded", "failed", "cancelled"]);
  expect(deps.cli).toHaveBeenCalledTimes(2);
});
test("concurrent starts reserve the canvas once, stale runs reject, and cancellation is terminal", async () => {
  const { deps, runtime, saved, finished } = await setup();
  deps.cli = vi.fn((_args, signal) => new Promise((_resolve, reject) => { if (signal?.aborted) reject(signal.reason); else signal?.addEventListener("abort", () => reject(signal.reason), { once: true }); }));
  await expect(runtime.start("workflow", { mode: "execute", expectedRevision: "stale" })).rejects.toThrow(/changed/);
  const starts = await Promise.allSettled([runtime.start("workflow", { mode: "execute", expectedRevision: saved.revision }), runtime.start("workflow", { mode: "execute", expectedRevision: saved.revision })]);
  expect(starts.filter((item) => item.status === "fulfilled")).toHaveLength(1);
  const started = starts.find((item) => item.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof runtime.start>>>;
  expect((await runtime.cancel(started.value.id)).status).toBe("cancelled");
  expect((await finished()).nodes.every((node) => node.status !== "running" && node.status !== "pending")).toBe(true);
});
test("import copies user media and refuses symlink sources", async () => {
  const { root } = await setup();
  const source = join(root, "original.txt"); await writeFile(source, "Saved reference");
  const asset = await importCanvasFile(root, "workspace", source);
  expect(asset.path).not.toBe(source); expect(await readFile(asset.path, "utf8")).toBe("Saved reference");
  const link = join(root, "shortcut.txt"); await symlink(source, link);
  await expect(importCanvasFile(root, "workspace", link)).rejects.toThrow();
});

test("one imported character reference feeds multiple models after the original file is removed", async () => {
  const { root, deps, runtime, saved, finished } = await setup();
  const source = join(root, "character.png"); await writeFile(source, "character reference");
  const asset = await importCanvasFile(root, "workspace", source);
  await rm(source);
  const next = graph();
  next.nodes.push({ id: "reference", kind: "media", title: "Character", value: "", x: 0, y: 400, config: { asset, modality: "image" } }, { ...next.nodes[1], id: "alternate", title: "Alternate", y: 400 });
  next.edges.push({ from: "reference", sourcePort: "media", to: "image", targetPort: "reference" }, { from: "reference", sourcePort: "media", to: "alternate", targetPort: "reference" }, { from: "brief", to: "alternate", targetPort: "prompt" }, { from: "alternate", to: "out" });
  const updated = await saveCanvas(root, "workspace", next, saved.revision);
  deps.cli = vi.fn(async () => ({ dryRun: true, cost_estimate_usd: 0.01 }));
  await runtime.start("workflow", { mode: "preview", expectedRevision: updated.revision });
  const run = await finished();
  expect(run.status).toBe("succeeded");
  expect(run.nodes.filter((node) => node.nodeId === "reference")).toHaveLength(1);
  expect(deps.cli).toHaveBeenCalledTimes(4);
  for (const [args] of vi.mocked(deps.cli).mock.calls) expect(args.slice(args.indexOf("--ref"), args.indexOf("--ref") + 2)).toEqual(["--ref", asset.path]);
});

test("historical variant selection reuses the exact result without rerunning paid upstream nodes", async () => {
  const { root, deps, runtime, saved, finished } = await setup();
  const path = join(root, "variant.png"); await writeFile(path, "image");
  deps.cli = vi.fn(async () => ({ path }));
  await runtime.start("workflow", { mode: "execute", expectedRevision: saved.revision });
  const previous = await finished();
  const selected = previous.nodes[1].results[1];
  const next = graph();
  next.nodes.push({ id: "choice", kind: "variation", title: "Choice", value: "", x: 450, y: 0, config: { selectedResultId: selected.id } });
  next.edges = [{ from: "brief", to: "image" }, { from: "image", to: "choice" }, { from: "choice", to: "out" }];
  const updated = await saveCanvas(root, "workspace", next, saved.revision);
  await runtime.start("workflow", { mode: "execute", expectedRevision: updated.revision });
  const reused = await finished();
  expect(reused.status).toBe("succeeded"); expect(reused.nodes.map((node) => node.nodeId)).toEqual(["choice", "out"]);
  expect(reused.nodes[1].results[0].id).toBe(selected.id); expect(deps.cli).toHaveBeenCalledTimes(2);
  await expect(validateCanvasAsset(root, { path: saved.path, name: "private.json", kind: "text" }, "workspace")).rejects.toThrow(/Import/);
  await expect(validateCanvasAsset(root, selected.asset!, "another-workspace")).rejects.toThrow(/Import/);
});
test("preview stops a dependent model until its generated reference exists", async () => {
  const { root, deps, runtime, saved, finished } = await setup();
  const next = graph();
  next.nodes.push({ id: "video", kind: "model", title: "Video", value: "Slow camera movement", x: 500, y: 0, config: { modality: "video", provider: "openrouter", modelId: "test/video" } });
  next.edges = [{ from: "brief", to: "image" }, { from: "image", to: "video", targetPort: "reference" }, { from: "video", to: "out" }];
  const updated = await saveCanvas(root, "workspace", next, saved.revision);
  deps.cli = vi.fn(async () => ({ dryRun: true, cost_estimate_usd: 0.04 }));
  await runtime.start("workflow", { mode: "preview", expectedRevision: updated.revision });
  const run = await finished();
  expect(run.status).toBe("failed"); expect(run.nodes.find((node) => node.nodeId === "video")?.error).toMatch(/waiting for an upstream/);
  expect(deps.cli).toHaveBeenCalledTimes(2);
});

test("an estimate with a missing variation price never presents a partial total", async () => {
  const { deps, runtime, saved, finished } = await setup();
  deps.cli = vi.fn().mockResolvedValueOnce({ dryRun: true, cost_estimate_usd: 0.04 }).mockResolvedValueOnce({ dryRun: true });
  await runtime.start("workflow", { mode: "preview", expectedRevision: saved.revision });
  const run = await finished();
  expect(run.status).toBe("succeeded");
  expect(run.nodes[1].estimatedCostUsd).toBeNull();
});

test("missing downstream prompts are rejected before any upstream generation starts", async () => {
  const { root, deps, runtime, saved } = await setup();
  const next = graph();
  next.nodes.push({ id: "video", kind: "model", title: "Hero video", value: "", x: 500, y: 0, config: { modality: "video", provider: "openrouter", modelId: "test/video" } });
  next.edges = [{ from: "brief", to: "image" }, { from: "image", to: "video", targetPort: "reference" }, { from: "video", to: "out" }];
  const updated = await saveCanvas(root, "workspace", next, saved.revision);
  await expect(runtime.start("workflow", { mode: "execute", expectedRevision: updated.revision })).rejects.toThrow(/Hero video.*Prompt required/);
  expect(deps.cli).not.toHaveBeenCalled();
});

test("unused paid branches stay outside the run and do not block its outputs", async () => {
  const { root, deps, runtime, saved, finished } = await setup();
  const next = graph();
  next.nodes.push({ id: "unused", kind: "model", title: "Unfinished branch", value: "", x: 400, y: 400 });
  const updated = await saveCanvas(root, "workspace", next, saved.revision);
  deps.cli = vi.fn(async () => ({ dryRun: true, cost_estimate_usd: 0.01 }));
  await runtime.start("workflow", { mode: "preview", expectedRevision: updated.revision });
  const run = await finished();
  expect(run.status).toBe("succeeded");
  expect(run.nodes.map((node) => node.nodeId)).toEqual(["brief", "image", "out"]);
  expect(deps.cli).toHaveBeenCalledTimes(2);
});

test("board execution requires an explicit step and never runs unrelated unfinished experiments", async () => {
  const { root, deps, runtime, saved, finished } = await setup();
  const next = { ...graph(), mode: "board" as const };
  next.nodes.push({ id: "unused", kind: "model", title: "Experiment", value: "", x: 400, y: 400 });
  const updated = await saveCanvas(root, "workspace", next, saved.revision);
  await expect(runtime.start("workflow", { mode: "execute", expectedRevision: updated.revision })).rejects.toThrow(/individual node/);
  expect(deps.cli).not.toHaveBeenCalled();
  deps.cli = vi.fn(async () => ({ dryRun: true, cost_estimate_usd: 0.01 }));
  await runtime.start("workflow", { mode: "preview", nodeId: "image", expectedRevision: updated.revision });
  const run = await finished();
  expect(run.status).toBe("succeeded");
  expect(run.snapshot.mode).toBe("board");
  expect(run.nodes.map((node) => node.nodeId)).toEqual(["brief", "image"]);
});

test("text models use the connected prompt instead of the saved manual draft", async () => {
  const { root, runtime, saved, finished } = await setup();
  const next = graph();
  next.nodes[1] = { ...next.nodes[1], value: "Manual draft must not be sent", config: { modality: "text", provider: "openrouter", modelId: "test/text" } };
  const updated = await saveCanvas(root, "workspace", next, saved.revision);
  await runtime.start("workflow", { mode: "preview", expectedRevision: updated.revision });
  const run = await finished();
  expect(run.status).toBe("succeeded");
  expect(run.nodes[1].results[0].text).toBe("A quiet forest");
});

test("dropped media uses the guarded import path and rejects malformed paths before opening a file", async () => {
  const { root, deps } = await setup();
  const source = join(root, "dropped.png"); await writeFile(source, "test image");
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  const chooseFile = vi.fn(async () => source);
  registerCanvasRuntimeIpc({ handle: (channel, handler) => handlers.set(channel, handler), capture: async () => deps, chooseFile, fetcher: fetch, chooseExport: async () => null });
  const imported = handlers.get(MEDIA_CHANNELS.importCanvasAsset)!;
  const asset = await imported("workspace", source) as { path: string; name: string; kind: "image" };
  expect(chooseFile).not.toHaveBeenCalled();
  expect((await validateCanvasAsset(root, asset, "workspace")).bytes).toBe(10);
  await expect(imported("workspace", "../dropped.png")).rejects.toThrow("Invalid dropped file");
  await expect(imported("workspace", { path: source })).rejects.toThrow("Invalid dropped file");
  const link = join(root, "alias.png"); await symlink(source, link);
  await expect(imported("workspace", link)).rejects.toThrow();
});
