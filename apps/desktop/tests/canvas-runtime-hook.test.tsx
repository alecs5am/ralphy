import { act } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { bridge } from "@/shared/api/ipc";
import { useCanvasRuntime } from "../src/features/workflow-canvas/model/use-canvas-runtime";
import type { CanvasModelCatalog, CanvasRun, CanvasRunPage } from "../shared/canvas-runtime";
import type { SavedCanvas } from "../shared/workflow-canvas";
import { createReactHost } from "./react-host";
import { GENERATION_PROVIDERS_CHANGED_EVENT } from "../shared/generation-studio";

const saved = (id = "canvas-a"): SavedCanvas => ({ canvas: { version: 2, id, name: id, nodes: [], edges: [] }, revision: "revision", path: `/canvases/${id}.json` });
const run = (status: CanvasRun["status"] = "running"): CanvasRun => ({ id: "run-one", canvasId: "canvas-a", canvasRevision: "revision", workspaceId: "workspace-a", mode: "preview", status, startedAt: 1, endedAt: null, nodes: [], error: null, snapshot: saved().canvas });
const catalog = (label: string): CanvasModelCatalog => ({ models: [], providers: [], errors: [label] });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

test("provider changes refresh Canvas model availability without reopening the workspace", async () => {
  const models = vi.spyOn(bridge, "loadCanvasModels").mockResolvedValue(catalog("initial"));
  vi.spyOn(bridge, "loadCanvasRuns").mockResolvedValue({ items: [], nextCursor: null });
  const host = await harness();
  try {
    await host.render();
    models.mockResolvedValue(catalog("new credentials"));
    await act(async () => { window.dispatchEvent(new Event(GENERATION_PROVIDERS_CHANGED_EVENT)); });
    expect(models).toHaveBeenCalledTimes(2);
    expect(host.runtime().catalog.errors).toEqual(["new credentials"]);
  } finally { await host.close(); }
});

async function harness() {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let runtime: ReturnType<typeof useCanvasRuntime>;
  function Harness({ workspace, canvas }: { workspace: string; canvas: string }) { runtime = useCanvasRuntime(workspace, canvas); return null; }
  return {
    runtime: () => runtime!,
    render: (workspace = "workspace-a", canvas = "canvas-a") => act(async () => root.render(<Harness workspace={workspace} canvas={canvas} />)),
    close: async () => { await act(async () => root.unmount()); host.restore(); },
  };
}

test("late model/start/cancel responses cannot affect another workspace and starting resets", async () => {
  const oldModels = deferred<CanvasModelCatalog>(), newModels = deferred<CanvasModelCatalog>();
  const start = deferred<CanvasRun>(), cancel = deferred<CanvasRun>();
  vi.spyOn(bridge, "loadCanvasModels").mockImplementation((workspace) => workspace === "workspace-a" ? oldModels.promise : newModels.promise);
  vi.spyOn(bridge, "loadCanvasRuns").mockResolvedValue({ items: [], nextCursor: null });
  vi.spyOn(bridge, "startCanvasRun").mockReturnValue(start.promise);
  vi.spyOn(bridge, "cancelCanvasRun").mockReturnValue(cancel.promise);
  const host = await harness();
  try {
    await host.render();
    let starting!: Promise<void>, cancelling!: Promise<void>;
    await act(async () => { starting = host.runtime().start(saved(), "preview"); cancelling = host.runtime().cancel("run-one"); });
    expect(host.runtime().starting).toBe(true);
    await host.render("workspace-b", "canvas-b");
    expect(host.runtime().starting).toBe(false);
    await act(async () => newModels.resolve(catalog("new workspace")));
    await act(async () => { oldModels.resolve(catalog("old workspace")); start.resolve(run()); cancel.reject(new Error("old cancellation")); await Promise.all([starting, cancelling]); });
    expect(host.runtime().catalog.errors).toEqual(["new workspace"]);
    expect(host.runtime().loadingModels).toBe(false);
    expect(host.runtime().runs).toEqual([]);
    expect(host.runtime().error).toBeNull();
  } finally { await host.close(); }
});

test("same-tick starts submit once and stale polls cannot overwrite start or cancellation", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const staleStartPoll = deferred<CanvasRunPage>(), staleCancelPoll = deferred<CanvasRunPage>();
  const started = deferred<CanvasRun>(), cancelled = deferred<CanvasRun>();
  vi.spyOn(bridge, "loadCanvasModels").mockResolvedValue(catalog("models"));
  vi.spyOn(bridge, "loadCanvasRuns").mockReturnValueOnce(staleStartPoll.promise).mockReturnValueOnce(staleCancelPoll.promise).mockResolvedValue({ items: [run("cancelled")], nextCursor: null });
  const start = vi.spyOn(bridge, "startCanvasRun").mockReturnValue(started.promise);
  vi.spyOn(bridge, "cancelCanvasRun").mockReturnValue(cancelled.promise);
  const host = await harness();
  try {
    await host.render();
    let first!: Promise<void>, second!: Promise<void>;
    await act(async () => { first = host.runtime().start(saved(), "execute"); second = host.runtime().start(saved(), "execute"); });
    expect(start).toHaveBeenCalledTimes(1);
    await act(async () => { started.resolve(run()); await Promise.all([first, second]); });
    await act(async () => staleStartPoll.resolve({ items: [], nextCursor: null }));
    expect(host.runtime().selectedRun?.id).toBe("run-one");
    await act(async () => vi.advanceTimersByTimeAsync(1800));
    let stop!: Promise<void>;
    await act(async () => { stop = host.runtime().cancel("run-one"); });
    await act(async () => { cancelled.resolve(run("cancelled")); await stop; });
    await act(async () => staleCancelPoll.resolve({ items: [run("running")], nextCursor: null }));
    expect(host.runtime().selectedRun?.status).toBe("cancelled");
    expect(host.runtime().running).toBe(false);
  } finally { await host.close(); }
});

test("completed runs stop polling and focus can refresh expired media tokens", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.spyOn(bridge, "loadCanvasModels").mockResolvedValue(catalog("models"));
  const withMedia = (status: CanvasRun["status"], previewUrl: string): CanvasRun => ({ ...run(status), nodes: [{ nodeId: "video", status: "succeeded", startedAt: 1, endedAt: 2, coreRunIds: [], error: null, estimatedCostUsd: null, results: [{ id: "result-one", nodeId: "video", kind: "video", label: "Video", previewUrl }] }] });
  const load = vi.spyOn(bridge, "loadCanvasRuns").mockResolvedValueOnce({ items: [withMedia("running", "ralphy-media://asset/first")], nextCursor: null }).mockResolvedValueOnce({ items: [withMedia("succeeded", "ralphy-media://asset/first")], nextCursor: null }).mockResolvedValue({ items: [withMedia("succeeded", "ralphy-media://asset/refreshed")], nextCursor: null });
  const host = await harness();
  try {
    await host.render();
    await act(async () => vi.advanceTimersByTimeAsync(1800));
    expect(load).toHaveBeenCalledTimes(2);
    expect(host.runtime().selectedRun?.status).toBe("succeeded");
    expect(host.runtime().selectedRun?.nodes[0]?.results[0]?.previewUrl).toBe("ralphy-media://asset/first");
    await act(async () => vi.advanceTimersByTimeAsync(18_000));
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(load).toHaveBeenCalledTimes(3);
    expect(host.runtime().selectedRun?.nodes[0]?.results[0]?.previewUrl).toBe("ralphy-media://asset/refreshed");
    await act(async () => vi.advanceTimersByTimeAsync(18_000));
    expect(load).toHaveBeenCalledTimes(3);
  } finally { await host.close(); }
});

test("opening an older Canvas page retains it across current-history refreshes", async () => {
  vi.spyOn(bridge, "loadCanvasModels").mockResolvedValue(catalog("models"));
  const recent = run("succeeded"), old = { ...run("succeeded"), id: "old-run", startedAt: 0 };
  const load = vi.spyOn(bridge, "loadCanvasRuns").mockResolvedValue({ items: [recent], nextCursor: "older" });
  const host = await harness();
  try {
    await host.render(); expect(host.runtime().hasOlder).toBe(true);
    load.mockResolvedValueOnce({ items: [old], nextCursor: null });
    await act(async () => host.runtime().loadOlder());
    expect(load).toHaveBeenLastCalledWith("workspace-a", "canvas-a", { before: "older" });
    await act(async () => host.runtime().setSelectedRunId(old.id));
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(host.runtime().runs.map((run) => run.id)).toEqual([recent.id, old.id]);
    expect(host.runtime().selectedRun?.id).toBe(old.id); expect(host.runtime().hasOlder).toBe(false);
  } finally { await host.close(); }
});
