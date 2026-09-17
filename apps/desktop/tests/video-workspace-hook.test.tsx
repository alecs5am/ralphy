import { act } from "react";
import { expect, test, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { bridge } from "@/shared/api/ipc";
import { useVideoWorkspace } from "../src/features/video-workspace/model/useVideoWorkspace";
import { blankVideoComposition, type VideoWorkspaceLoad } from "../shared/video-workspace";
import { createReactHost } from "./react-host";

test("saved source includes stable agent IDs and unsaved edits recover after leaving the editor", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  vi.stubGlobal("crypto", webcrypto);
  let saved: VideoWorkspaceLoad = { revision: "initial", draftPath: "/library/unit/draft.json", draft: { schemaVersion: 1, html: blankVideoComposition(), fps: 30, updatedAt: 1, compositionId: null, compositionRevisionId: null, checkoutPath: null, sourceKind: "empty", assets: [] }, versions: [], render: null };
  vi.spyOn(bridge, "loadVideoWorkspace").mockImplementation(async () => structuredClone(saved));
  const save = vi.spyOn(bridge, "saveVideoWorkspace").mockImplementation(async (_ref, html, fps, expected) => {
    expect(expected).toBe(saved.revision);
    saved = { ...saved, revision: `${saved.revision}-next`, draft: { ...saved.draft, html, fps } }; return structuredClone(saved);
  });
  const host = createReactHost(), { createRoot } = await import("react-dom/client");
  let root = createRoot(host.container as unknown as Element), editor!: ReturnType<typeof useVideoWorkspace>;
  function Harness() { editor = useVideoWorkspace({ workspaceId: "ws", projectId: "project", unitId: "unit" }); return null; }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => { await editor.save(); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(saved.draft.html).toContain("data-hf-id");
    await act(async () => { editor.setFps(60); });
    expect(editor.fps).toBe(60);
    await act(async () => { editor.undo(); });
    expect(editor.fps).toBe(30);
    await act(async () => { editor.redo(); });
    expect(editor.fps).toBe(60);
    await act(async () => { await editor.restore({ id: "older", savedAt: 1, html: blankVideoComposition(), fps: 24 }); });
    expect(editor.fps).toBe(24);
    await act(async () => { editor.insert(null, 0); });
    await act(async () => { editor.edit({ type: "setText", target: editor.selection[0], value: "Recovered title" }); });
    expect([...storage.values()].join()).toContain("Recovered title");
    await act(async () => root.unmount());
    root = createRoot(host.container as unknown as Element);
    await act(async () => root.render(<Harness />));
    expect(editor.elements.some((item) => item.text === "Recovered title")).toBe(true);
    expect(editor.dirty).toBe(true);
    expect(editor.fps).toBe(24);
    await act(async () => { await editor.save(); });
    expect(saved.draft.html).toContain("Recovered title");
    expect(saved.draft.fps).toBe(24);
    expect(storage.size).toBe(0);
  } finally { await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); }
});

test("an unavailable original clip still opens the saved timeline for source replacement", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} });
  vi.stubGlobal("crypto", webcrypto);
  vi.spyOn(bridge, "loadVideoWorkspace").mockResolvedValue({ revision: "saved", draft: { schemaVersion: 1, html: blankVideoComposition({ src: "missing.mp4", kind: "video" }), fps: 30, updatedAt: 1, compositionId: null, compositionRevisionId: null, checkoutPath: null, sourceKind: "file", assets: [] }, versions: [], render: null });
  const host = createReactHost(), { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let editor!: ReturnType<typeof useVideoWorkspace>;
  function Harness() { editor = useVideoWorkspace({ workspaceId: "ws", projectId: "project", unitId: "unit" }); return null; }
  try {
    await act(async () => root.render(<Harness />));
    expect(editor.comp).not.toBeNull();
    expect(editor.missingMedia).toHaveLength(1);
    expect(editor.error).toContain("Replace its source");
    expect(editor.html).toContain("missing.mp4");
  } finally { await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});

test("render errors retry rendering and clear after success while save failures remain separate", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} });
  vi.stubGlobal("crypto", webcrypto);
  let saved: VideoWorkspaceLoad = { revision: "saved", draft: { schemaVersion: 1, html: blankVideoComposition(), fps: 30, updatedAt: 1, compositionId: "composition", compositionRevisionId: "revision", checkoutPath: "/library/source", sourceKind: "composition", assets: [] }, versions: [], render: null };
  vi.spyOn(bridge, "loadVideoWorkspace").mockImplementation(async () => structuredClone(saved));
  const save = vi.spyOn(bridge, "saveVideoWorkspace").mockImplementation(async (_ref, html, fps) => {
    saved = { ...saved, revision: "next", draft: { ...saved.draft, html, fps } }; return structuredClone(saved);
  });
  const render = vi.spyOn(bridge, "renderVideoWorkspace")
    .mockRejectedValueOnce(new Error("Install the missing rendering tools."))
    .mockResolvedValue({ compositionRevisionId: "revision", buildId: "build", state: "succeeded", artifactRevisionId: "artifact", sourceRevision: "source", createdAt: 2 });
  const host = createReactHost(), { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let editor!: ReturnType<typeof useVideoWorkspace>;
  function Harness() { editor = useVideoWorkspace({ workspaceId: "ws", projectId: "project", unitId: "unit" }); return null; }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => { await editor.render(); });
    expect(editor.error).toContain("missing rendering tools");
    expect(editor.renderError).toBe(true);
    await act(async () => { await editor.render(); });
    expect(render).toHaveBeenCalledTimes(2);
    expect(editor.error).toBeNull();
    await act(async () => { editor.insert(null, 0); });
    save.mockRejectedValueOnce(new Error("Save unavailable"));
    await act(async () => { await editor.render(); });
    expect(editor.error).toBe("Save unavailable");
    expect(editor.renderError).toBe(false);
    expect(render).toHaveBeenCalledTimes(2);
  } finally { await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});
