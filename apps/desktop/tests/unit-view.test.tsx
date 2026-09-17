import { act } from "react";
import { expect, test, vi } from "vitest";
import { bridge } from "@/shared/api/ipc";
import { UnitView } from "@/pages/project";
import { createReactHost } from "./react-host";

test("embedded video editing opens the actual editor and returns without remounting chat", async () => {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  vi.stubGlobal("customElements", { get: () => undefined, define: () => undefined });
  await import("@/features/video-workspace");
  const project = { workspaceId: "ws", projectId: "project" };
  vi.spyOn(bridge, "loadProjectUnit").mockResolvedValue({ ...project, id: "unit", slug: "Film", format: "video", compositionId: null, latestRevisionId: "r1", selectedRevisionId: "r1", createdAt: 1, updatedAt: 1 });
  vi.spyOn(bridge, "loadProjectUnitRevision").mockResolvedValue({ id: "r1", unitId: "unit", revisionNo: 1, parentRevisionId: null, compositionRevisionId: null, iterationId: null, note: null, authoredBySessionId: null, createdAt: 1, sealedAt: 1 });
  vi.spyOn(bridge, "loadProjectUnitPage").mockResolvedValue({ items: [], nextCursor: null });
  const load = vi.spyOn(bridge, "loadVideoWorkspace").mockImplementation(() => new Promise(() => {}));
  const close = vi.fn();
  try {
    await act(async () => root.render(<><section aria-label="Chat"><textarea defaultValue="Keep my draft" /></section><UnitView project={project} unitId="unit" rootEpoch={1} onClose={close} /></>));
    const chat = host.container.querySelector('[aria-label="Chat"]')!;
    chat.scrollTop = 93;
    const edit = host.container.findAll((node) => node.tagName === "BUTTON" && node.textContent === "Edit video")[0];
    expect(edit).toBeDefined();
    await act(async () => { edit.dispatchEvent(new Event("click", { bubbles: true })); });
    await vi.waitFor(async () => { await act(async () => {}); expect(load).toHaveBeenCalledWith({ ...project, unitId: "unit" }); });
    expect(host.container.querySelector(".video-workspace")).not.toBeNull();
    expect(host.container.querySelector('[aria-label="Chat"]')).toBe(chat);
    expect(chat.scrollTop).toBe(93);
    const back = host.container.findAll((node) => node.getAttribute("aria-label") === "Back to Units")[0]!;
    await act(async () => back.dispatchEvent(new Event("click", { bubbles: true })));
    expect(host.container.querySelector(".unit-viewer")).not.toBeNull();
    expect(host.container.querySelector('[aria-label="Chat"]')).toBe(chat);
    expect(close).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});

test("opening a newly saved revision preserves the selected default and the mounted chat", async () => {
  const host = createReactHost(), { createRoot } = await import("react-dom/client"), root = createRoot(host.container as unknown as Element);
  const project = { workspaceId: "ws", projectId: null };
  const unit = { ...project, id: "unit", slug: "Image", format: "image", compositionId: null, latestRevisionId: "r2", selectedRevisionId: "r1", createdAt: 1, updatedAt: 2 };
  vi.spyOn(bridge, "loadProjectUnit").mockResolvedValue(unit);
  const load = vi.spyOn(bridge, "loadProjectUnitRevision").mockImplementation(async (_project, _unit, id) => ({ id, unitId: "unit", revisionNo: id === "r2" ? 2 : 1, parentRevisionId: id === "r2" ? "r1" : null, compositionRevisionId: null, iterationId: null, note: id === "r2" ? "Newly saved image" : "Selected image", authoredBySessionId: null, createdAt: 1, sealedAt: 1 }));
  vi.spyOn(bridge, "loadProjectUnitPage").mockResolvedValue({ items: [], nextCursor: null });
  const select = vi.spyOn(bridge, "selectProjectUnitRevision");
  try {
    await act(async () => root.render(<><section aria-label="Chat"><textarea defaultValue="Keep my draft" /></section><UnitView project={project} unitId="unit" revisionId="r2" rootEpoch={1} onClose={() => {}} /></>));
    const chat = host.container.querySelector('[aria-label="Chat"]');
    expect(load).toHaveBeenLastCalledWith(project, "unit", "r2");
    expect(host.container.textContent).toContain("Newly saved image");
    expect(host.container.querySelector('[aria-label="Chat"]')).toBe(chat);
    expect(select).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks(); }
});
