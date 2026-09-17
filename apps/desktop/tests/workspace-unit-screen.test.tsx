import { act } from "react";
import { expect, test, vi } from "vitest";
import { bridge } from "@/shared/api/ipc";
import { WorkspaceUnitsScreen } from "@/pages/workspace-units";
import { createReactHost } from "./react-host";

test("workspace Units refresh on activity, open owned Units, and ignore a replaced workspace response", async () => {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  const row = (id: string) => ({ id, slug: id, workspaceId: "ws", projectId: null, compositionId: null, format: "video", selectedRevisionId: null, latestRevisionId: null, createdAt: 1, updatedAt: 1 });
  const page = (id: string) => ({ units: { items: [row(id)], nextCursor: null }, publications: { items: [], nextCursor: null } });
  const read = vi.spyOn(bridge, "loadWorkspaceUnitPage").mockResolvedValue(page("First"));
  const open = vi.fn();
  const render = (workspaceId: string, sequence: number) => root.render(<WorkspaceUnitsScreen workspaceId={workspaceId} workspaceName="Studio" projects={[]} rootEpoch={1} activitySequence={sequence} onOpenUnit={open} />);
  try {
    await act(async () => render("ws", 0));
    expect(host.container.textContent).toContain("Workspace-owned");
    const card = host.container.querySelector(".workspace-unit-card")!;
    await act(async () => card.dispatchEvent(new Event("click", { bubbles: true })));
    expect(open).toHaveBeenCalledWith({ workspaceId: "ws", projectId: null }, "First", "First");
    read.mockResolvedValue(page("New revision"));
    await act(async () => render("ws", 1));
    expect(host.container.textContent).toContain("New revision");
    let resolve!: (value: ReturnType<typeof page>) => void;
    read.mockImplementationOnce(() => new Promise((yes) => { resolve = yes; }));
    await act(async () => render("ws", 2));
    read.mockResolvedValue({ units: { items: [], nextCursor: null }, publications: { items: [], nextCursor: null } });
    await act(async () => render("other", 0));
    await act(async () => resolve(page("Stale workspace")));
    expect(host.container.textContent).not.toContain("Stale workspace");
    read.mockRejectedValueOnce(new Error("Disconnected"));
    await act(async () => render("other", 1));
    expect(host.container.textContent).toContain("Disconnected");
    read.mockResolvedValue(page("Recovered"));
    const retry = host.container.findAll((node) => node.tagName === "BUTTON" && node.textContent === "Retry")[0];
    await act(async () => retry.dispatchEvent(new Event("click", { bubbles: true })));
    expect(host.container.textContent).toContain("Recovered");
  } finally { await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks(); }
});
