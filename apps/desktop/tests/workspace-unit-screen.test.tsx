import { act } from "react";
import { expect, test, vi } from "vitest";
import { bridge } from "@/shared/api/ipc";
import { WorkspaceUnitsScreen } from "@/pages/workspace-units";
import { createReactHost } from "./react-host";

vi.mock("@/shared/ui/SelectMenu", () => ({ SelectMenu: ({ ariaLabel, options, onValueChange }: { ariaLabel: string; options: { value: string; label: string }[]; onValueChange(value: string): void }) => <div aria-label={ariaLabel}>{options.map((option) => <button type="button" key={option.value} onClick={() => onValueChange(option.value)}>{option.label}</button>)}</div> }));

test("Content cards show selected revision covers and keep previews scoped to workspace-owned content", async () => {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  const unit = { id: "launch", slug: "Launch film", workspaceId: "ws", projectId: null, compositionId: null, format: "video", selectedRevisionId: "selected", latestRevisionId: "latest", createdAt: 1, updatedAt: 1 };
  const read = vi.spyOn(bridge, "loadWorkspaceUnitPage").mockResolvedValue({ units: { items: [unit], nextCursor: null }, publications: { items: [], nextCursor: null } });
  const revisions = vi.spyOn(bridge, "loadProjectUnitPage").mockResolvedValue({ items: [{ id: "presentation", platform: "instagram", position: 0, coverArtifactRevisionId: "cover" }] as never, nextCursor: null });
  const resolve = vi.spyOn(bridge, "resolveCompositionOutputPreview").mockResolvedValue({ url: "ralphy-media://asset/cover", mime: "image/png", sizeBytes: 10 });
  const open = vi.fn();
  try {
    await act(async () => root.render(<WorkspaceUnitsScreen workspaceId="ws" workspaceName="Studio" projects={[]} rootEpoch={1} onOpenUnit={open} />));
    expect(host.container.querySelector("img")?.getAttribute("src")).toBe("ralphy-media://asset/cover");
    expect(revisions).toHaveBeenCalledWith({ workspaceId: "ws", projectId: null }, { kind: "presentations", revisionId: "selected" });
    expect(resolve).toHaveBeenCalledWith({ workspaceId: "ws", projectId: null }, "cover");
    expect(host.container.querySelectorAll("input").some((node) => node.getAttribute("aria-label") === "Search content")).toBe(true);
    const card = host.container.querySelector(".workspace-unit-card")!;
    expect(card.getAttribute("class")).toContain("media-caption-surface");
    expect(card.getAttribute("aria-describedby")).toBe("workspace-unit-launch-context");
    expect(card.querySelector(".media-hover-caption")?.getAttribute("class")).toContain("absolute");
    expect(card.querySelector("#workspace-unit-launch-context")?.textContent).toContain("Workspace-owned");
    expect(host.container.querySelector(".workspace-unit-filters")?.textContent).toContain("1 item");
    const primaryFilters = host.container.querySelector(".workspace-unit-primary-filters")!;
    expect(primaryFilters.querySelectorAll("input").some((node) => node.getAttribute("aria-label") === "Search content")).toBe(true);
    expect(primaryFilters.querySelector(".segmented-control")).not.toBeNull();
    expect(host.container.querySelector(".workspace-unit-secondary-filters")?.textContent).toContain("1 item");
    const list = host.container.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === "List view")!;
    await act(async () => list.dispatchEvent(new Event("click", { bubbles: true })));
    expect(host.container.querySelector(".workspace-unit-row")).not.toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => host.container.querySelector(".workspace-unit-row")!.dispatchEvent(new Event("click", { bubbles: true })));
    expect(open).toHaveBeenCalledWith({ workspaceId: "ws", projectId: null }, "launch", "Launch film");
    read.mockResolvedValue({ units: { items: [{ ...unit, selectedRevisionId: null }], nextCursor: null }, publications: { items: [], nextCursor: null } });
    resolve.mockRejectedValue(new Error("Missing cover"));
    revisions.mockResolvedValue({ items: [], nextCursor: null });
    await act(async () => root.render(<WorkspaceUnitsScreen workspaceId="ws" workspaceName="Studio" projects={[]} rootEpoch={1} activitySequence={1} onOpenUnit={open} />));
    const gallery = host.container.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === "Gallery view")!;
    await act(async () => gallery.dispatchEvent(new Event("click", { bubbles: true })));
    expect(revisions).toHaveBeenCalledWith({ workspaceId: "ws", projectId: null }, { kind: "presentations", revisionId: "latest" });
    expect(host.container.querySelector("img")).toBeNull();
    expect(host.container.querySelector(".workspace-unit-card")?.textContent).toContain("No preview");
  } finally { await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks(); }
});

test("Content combines real format and publication filters and clears them without reloading", async () => {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  const base = { workspaceId: "ws", projectId: null, compositionId: null, selectedRevisionId: null, latestRevisionId: null, createdAt: 1, updatedAt: 1 };
  const read = vi.spyOn(bridge, "loadWorkspaceUnitPage").mockResolvedValue({ units: { items: [{ ...base, id: "film", slug: "Launch film", format: "video" }, { ...base, id: "post", slug: "Launch announcement", format: "post" }, { ...base, id: "image", slug: "Launch cover", format: "image" }, { ...base, id: "audio", slug: "Launch music", format: "audio" }], nextCursor: null }, publications: { items: [{ id: "publication", unitId: "film", state: "published" }] as never, nextCursor: null } });
  try {
    await act(async () => root.render(<WorkspaceUnitsScreen workspaceId="ws" workspaceName="Studio" projects={[]} rootEpoch={1} onOpenUnit={vi.fn()} />));
    const click = async (text: string) => act(async () => host.container.querySelectorAll("button").find((node) => node.textContent === text)!.dispatchEvent(new Event("click", { bubbles: true })));
    expect(host.container.querySelectorAll(".workspace-unit-card")).toHaveLength(4);
    expect(host.container.textContent).not.toContain("Draft");
    const formatGroup = host.container.querySelector(".segmented-control")!;
    expect(formatGroup.textContent).not.toContain("(");
    expect(formatGroup.querySelectorAll("svg").map((node) => node.getAttribute("data-icon"))).toEqual(["LayoutGrid", "Music2", "Image", "FileText", "Film"]);
    expect(formatGroup.querySelectorAll(".segmented-control-count").map((node) => node.textContent.trim())).toEqual(["4 items", "1 item", "1 item", "1 item", "1 item"]);
    const format = formatGroup.querySelectorAll("input").find((node) => node.getAttribute("aria-label") === "Post")!;
    expect((format as unknown as HTMLInputElement).type).toBe("radio");
    expect(new Set(formatGroup.querySelectorAll("input").map((node) => (node as unknown as HTMLInputElement).name)).size).toBe(1);
    expect(formatGroup.querySelectorAll(".segmented-control-count").find((node) => node.getAttribute("id") === format.getAttribute("aria-describedby"))?.textContent.trim()).toBe("1 item");
    Object.assign(format, { type: "radio", checked: true });
    await act(async () => format.dispatchEvent(new Event("click", { bubbles: true })));
    expect(host.container.querySelectorAll(".workspace-unit-card")).toHaveLength(1);
    expect(host.container.querySelector(".workspace-unit-card")?.textContent).toContain("Launch announcement");
    await click("Published (1)");
    expect(host.container.querySelectorAll(".workspace-unit-card")).toHaveLength(0);
    expect(host.container.textContent).toContain("No content matches these filters");
    await click("Clear filters");
    expect(host.container.querySelectorAll(".workspace-unit-card")).toHaveLength(4);
    expect(read).toHaveBeenCalledTimes(1);
  } finally { await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks(); }
});

test("Content filters by owning project, preserves workspace-owned items, and resets the project on workspace change", async () => {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  const base = { workspaceId: "ws", compositionId: null, selectedRevisionId: null, latestRevisionId: null, createdAt: 1, updatedAt: 1, format: "video" };
  const read = vi.spyOn(bridge, "loadWorkspaceUnitPage").mockResolvedValue({ units: { items: [
    { ...base, id: "launch", slug: "Launch film", projectId: "campaign" },
    { ...base, id: "studio", slug: "Studio film", projectId: null },
  ], nextCursor: null }, publications: { items: [], nextCursor: null } });
  const projects = [{ projectId: "campaign", name: "Spring campaign" }] as never;
  const render = (workspaceId: string, activitySequence = 0) => root.render(<WorkspaceUnitsScreen workspaceId={workspaceId} workspaceName="Studio" projects={projects} rootEpoch={1} activitySequence={activitySequence} onOpenUnit={vi.fn()} />);
  const click = async (text: string) => act(async () => host.container.querySelectorAll("button").find((node) => node.textContent === text)!.dispatchEvent(new Event("click", { bubbles: true })));
  try {
    await act(async () => render("ws"));
    expect(host.container.querySelectorAll(".workspace-unit-card")).toHaveLength(2);
    await click("Spring campaign (1)");
    expect(host.container.querySelectorAll(".workspace-unit-card")).toHaveLength(1);
    expect(host.container.querySelector(".workspace-unit-card")?.textContent).toContain("Launch film");
    expect(host.container.querySelector(".workspace-unit-project")?.getAttribute("class")).toContain("text-ink");
    await click("Workspace-owned (1)");
    expect(host.container.querySelector(".workspace-unit-card")?.textContent).toContain("Studio film");
    expect(host.container.querySelector(".workspace-unit-project")?.getAttribute("class")).toContain("text-muted");
    expect(read).toHaveBeenCalledTimes(1);
    await click("Spring campaign (1)");
    read.mockResolvedValue({ units: { items: [{ ...base, id: "studio", slug: "Studio film", projectId: null }], nextCursor: null }, publications: { items: [], nextCursor: null } });
    await act(async () => render("ws", 1));
    expect(host.container.querySelectorAll(".workspace-unit-card")).toHaveLength(0);
    expect(host.container.textContent).toContain("Spring campaign (0)");
    await act(async () => render("other"));
    expect(host.container.querySelectorAll(".workspace-unit-card")).toHaveLength(1);
  } finally { await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks(); }
});

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
