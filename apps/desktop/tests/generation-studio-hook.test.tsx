import { act } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { bridge } from "@/shared/api/ipc";
import { useGenerationStudio } from "../src/pages/generation/model/use-generation-studio";
import { chooseGenerationModel, generationProblem } from "../src/pages/generation/lib/generation-presentation";
import { generationSnapshot } from "../electron/canvas/generation-draft";
import type { GenerationCatalog, GenerationDraft, GenerationModel } from "../shared/generation-studio";
import { GENERATION_PROVIDERS_CHANGED_EVENT } from "../shared/generation-studio";
import type { CanvasRun, CanvasRunPage } from "../shared/canvas-runtime";
import { createReactHost } from "./react-host";

const model: GenerationModel = { id: "image-model", name: "Image model", provider: "openrouter", kind: "image", available: true, description: "", previewSupported: true, inputs: [{ id: "refs", label: "Reference images", kind: "image", maxCount: 1 }], fields: [{ id: "aspectRatio", label: "Aspect ratio", type: "choice", options: [{ value: "1:1", label: "Square" }], default: "1:1" }] };
const catalog: GenerationCatalog = { models: [model], providers: [], errors: [] };
const draft: GenerationDraft = { kind: "image", modelId: model.id, provider: model.provider, prompt: "Indigo paper landscape", inputs: [], parameters: { aspectRatio: "1:1" }, variants: 1 };
const run = (status: CanvasRun["status"] = "running"): CanvasRun => ({ id: "run-one", canvasId: "generation-studio", workspaceId: "ws-one", canvasRevision: "revision", mode: "execute", status, startedAt: 1, endedAt: null, nodes: [], error: null, snapshot: generationSnapshot(draft) });
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { resolve, reject, promise }; }
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function harness() {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let studio!: ReturnType<typeof useGenerationStudio>;
  function Harness({ workspaceId }: { workspaceId: string }) { studio = useGenerationStudio(workspaceId); return null; }
  return { studio: () => studio, render: (id = "ws-one") => act(async () => root.render(<Harness key={id} workspaceId={id} />)), close: async () => { await act(async () => root.unmount()); host.restore(); } };
}
function mocks() {
  vi.spyOn(bridge, "loadGenerationCatalog").mockResolvedValue(catalog);
  vi.spyOn(bridge, "loadGenerationDraft").mockResolvedValue(draft);
  vi.spyOn(bridge, "loadGenerationRuns").mockResolvedValue({ items: [], nextCursor: null });
  vi.spyOn(bridge, "saveGenerationDraft").mockResolvedValue();
}

test("model changes remove unsupported parameters and incompatible inputs; required fields gate generation", () => {
  const video: GenerationModel = { ...model, id: "video", kind: "video", inputs: [{ id: "firstFrame", label: "First frame", kind: "image", required: true, maxCount: 1 }], fields: [{ id: "duration", label: "Duration", type: "number", min: 3, max: 10, default: 5 }] };
  const changed = chooseGenerationModel({ ...draft, inputs: [{ role: "refs", asset: { path: "/ref.png", name: "ref", kind: "image" } }] }, video);
  expect(changed.parameters).toEqual({ duration: 5 }); expect(changed.inputs).toEqual([]); expect(changed.prompt).toBe(draft.prompt);
  expect(generationProblem(changed, video)).toBe("Add first frame.");
  expect(generationProblem({ ...changed, inputs: [{ role: "firstFrame", asset: { path: "/ref.png", name: "ref", kind: "image" } }], parameters: { duration: 0 } }, video)).toContain("Check duration");
});

test("edits save immediately, failed saves remain visible, and a late import cannot change another model", async () => {
  mocks(); const save = vi.spyOn(bridge, "saveGenerationDraft").mockRejectedValueOnce(new Error("Disk full")).mockResolvedValue();
  const imported = deferred<{ path: string; name: string; kind: "image" } | null>();
  vi.spyOn(bridge, "importCanvasAsset").mockReturnValue(imported.promise);
  const host = await harness();
  try {
    await host.render();
    await act(async () => host.studio().edit({ ...draft, prompt: "New prompt" }));
    expect(save).toHaveBeenCalledWith("ws-one", expect.objectContaining({ prompt: "New prompt" }));
    expect(host.studio().saveState).toBe("failed"); expect(host.studio().draft.prompt).toBe("New prompt");
    await act(async () => host.studio().retrySave()); expect(host.studio().saveState).toBe("saved");
    let pending!: Promise<string | null>;
    await act(async () => { pending = host.studio().importReference("refs"); });
    await act(async () => host.studio().chooseModel({ ...model, id: "another" }));
    await act(async () => { imported.resolve({ path: "/reference.png", name: "Reference", kind: "image" }); await pending; });
    expect(host.studio().draft.inputs).toEqual([]);
  } finally { await host.close(); }
});

test("duplicate starts submit once; stale polls cannot overwrite start and stop; completed work stops polling", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }); mocks();
  const oldPoll = deferred<CanvasRunPage>(), started = deferred<CanvasRun>();
  const load = vi.spyOn(bridge, "loadGenerationRuns").mockReturnValueOnce(oldPoll.promise).mockResolvedValue({ items: [run("succeeded")], nextCursor: null });
  const start = vi.spyOn(bridge, "startGeneration").mockReturnValue(started.promise);
  vi.spyOn(bridge, "cancelGenerationRun").mockResolvedValue(run("cancelled"));
  const host = await harness();
  try {
    await host.render(); let first!: Promise<void>;
    await act(async () => { first = host.studio().start("execute"); void host.studio().start("execute"); });
    expect(start).toHaveBeenCalledTimes(1);
    expect(host.studio().launch).toEqual({ draft, mode: "execute" });
    await act(async () => host.studio().edit({ ...draft, prompt: "Next idea" }));
    expect(host.studio().launch?.draft.prompt).toBe(draft.prompt);
    await act(async () => { started.resolve(run()); await first; oldPoll.resolve({ items: [], nextCursor: null }); });
    expect(host.studio().runs[0]?.status).toBe("running");
    expect(host.studio().launch).toBeNull();
    await act(async () => host.studio().cancel("run-one")); expect(host.studio().runs[0]?.status).toBe("cancelled");
    await act(async () => vi.advanceTimersByTimeAsync(1800));
    const count = load.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(18_000)); expect(load).toHaveBeenCalledTimes(count);
  } finally { await host.close(); }
});

test("late saves and starts cannot alter the next workspace", async () => {
  mocks(); const saved = deferred<void>(), started = deferred<CanvasRun>();
  vi.spyOn(bridge, "saveGenerationDraft").mockReturnValue(saved.promise);
  vi.spyOn(bridge, "startGeneration").mockReturnValue(started.promise);
  const host = await harness();
  try {
    await host.render(); let pending!: Promise<void>;
    await act(async () => { host.studio().edit({ ...draft, prompt: "Old workspace" }); pending = host.studio().start("execute"); });
    await host.render("ws-two");
    await act(async () => { saved.reject(new Error("Old save failed")); started.resolve(run()); await pending; });
    expect(host.studio().draft.prompt).toBe(draft.prompt); expect(host.studio().runs).toEqual([]); expect(host.studio().error).toBeNull();
  } finally { await host.close(); }
});

test("saving a provider key refreshes model readiness without changing the draft", async () => {
  mocks();
  const load = vi.spyOn(bridge, "loadGenerationCatalog").mockResolvedValueOnce({ ...catalog, models: [{ ...model, available: false }] }).mockResolvedValue(catalog);
  const host = await harness();
  try {
    await host.render(); expect(host.studio().catalog.models[0]?.available).toBe(false);
    await act(async () => window.dispatchEvent(new Event(GENERATION_PROVIDERS_CHANGED_EVENT)));
    expect(load).toHaveBeenCalledTimes(2); expect(host.studio().catalog.models[0]?.available).toBe(true);
    expect(host.studio().draft).toEqual(draft);
  } finally { await host.close(); }
});

test("Create keeps older loaded results after a current-history refresh", async () => {
  mocks(); const recent = run("succeeded"), old = { ...run("succeeded"), id: "older-run", startedAt: 0 };
  const load = vi.spyOn(bridge, "loadGenerationRuns").mockResolvedValue({ items: [recent], nextCursor: "older" });
  const host = await harness();
  try {
    await host.render(); expect(host.studio().hasOlder).toBe(true);
    load.mockResolvedValueOnce({ items: [old], nextCursor: null });
    await act(async () => host.studio().loadOlder());
    expect(load).toHaveBeenLastCalledWith("ws-one", "older");
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(host.studio().runs.map((run) => run.id)).toEqual([recent.id, old.id]);
    expect(host.studio().hasOlder).toBe(false);
  } finally { await host.close(); }
});
