import { act, useState } from "react";
import { expect, test, vi } from "vitest";
import { AppSidebar } from "@/app/ui/AppSidebar";
import { useViewTabs } from "@/app/model/use-view-tabs";
import type { AgentChatController } from "@/features/agent-chat";
import type { CatalogResult, ProjectSummary, WorkspaceSummary } from "@/shared/api/ipc";
import { bridge } from "@/shared/api/ipc";
import type { AppMode } from "@/shared/model/routes";
import { EMPTY_VIEW_PANEL, type WorkbenchRoute } from "@/shared/model/workbench";
import { createReactHost } from "./react-host";

const workspace: WorkspaceSummary = {
  id: "studio", name: "Launch Studio", description: "Launches", absolutePath: "/tmp/studio",
  projectCount: 2, sharedCount: 0, unitCount: 0, finalCount: 0, recentActivity: "2026-09-01",
};
const project: ProjectSummary = {
  id: "studio/launch", workspaceId: "studio", projectId: "launch", name: "Launch film",
  brief: "A launch", status: "active", phase: "production", finalState: "working", platform: null,
  aspectRatio: null, spendUsd: null, finalCount: 0, sharedCount: 0, unitCount: 0, recentActivity: "2026-09-01",
};
const catalog: CatalogResult = {
  rootPath: "", generation: 1, workspaces: [workspace], mediaItemCount: 0, completedAt: "2026-09-01",
  projects: [project, { ...project, id: "studio/other", projectId: "other", name: "Other project" },
    { ...project, id: "private/launch", workspaceId: "private", name: "Private project" }],
};

test("keeps workspace actions, projects and chats available in both lenses and Explore", async () => {
  const host = createReactHost(), { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  const switchMode = vi.fn(), openPage = vi.fn(), openProject = vi.fn(), restoreProject = vi.fn(), openMarketplace = vi.fn(), lensChange = vi.fn(), openSettings = vi.fn(), openWorkspace = vi.fn();
  const agentChat = { activeChat: { id: "chat" }, selectChat: vi.fn(), newChat: vi.fn(), renameChat: vi.fn(), archiveChat: vi.fn() } as unknown as AgentChatController;
  const createProject = vi.spyOn(bridge, "createLibraryProject").mockResolvedValue("new-project");
  const render = async (mode: AppMode, lens: "desk" | "chat") => {
    await act(async () => root.render(<AppSidebar mode={mode} lens={lens}
      route={{ kind: "project", workspaceId: "studio", projectId: "launch" }} page="units"
      marketplaceRoute={{ kind: "category", category: "models" }} catalog={catalog} workspaces={[workspace, { ...workspace, id: "personal", name: "Personal", description: "", projectCount: 0 }]}
      workspaceId="studio" pinnedWorkspaceIds={[]} canGoBack={false} canGoForward={false} agentChat={agentChat}
      chats={[{ id: "chat", title: "Creative discussion", busy: false, updatedAt: 1 },
        { id: "launch-chat", title: "Campaign research", busy: false, updatedAt: 2, project: { workspaceId: "studio", projectId: "launch" }, entries: [{ kind: "user", text: "Audience interviews" }] }]}
      onBack={() => {}} onForward={() => {}} onCollapse={() => {}} onOpenSettings={openSettings}
      onSwitchMode={switchMode} onOpenMarketplaceRoute={openMarketplace} onOpenWorkspace={openWorkspace}
      onOpenPage={openPage} onOpenProject={openProject} onRestoreProject={restoreProject} onLens={lensChange} />));
  };
  const button = (name: string) => host.container.querySelectorAll("button").find((node) => node.textContent === name || node.getAttribute("aria-label") === name)!;
  const click = async (name: string) => { expect(button(name)).toBeTruthy(); await act(async () => button(name).dispatchEvent(new Event("click", { bubbles: true }))); };
  try {
    for (const mode of ["work", "marketplace"] as const) for (const lens of ["desk", "chat"] as const) {
      await render(mode, lens);
      expect(host.container.textContent).toContain("Launch Studio");
      for (const label of ["Create", "Content", "Canvases", "Calendar", "Explore", "Launch film", "Creative discussion"]) expect(host.container.textContent).toContain(label);
      expect(host.container.textContent).not.toContain("Private project");
      expect(host.container.querySelectorAll("nav").find((node) => node.getAttribute("aria-label") === "Application mode")).toBeUndefined();
      expect(host.container.querySelector("details")).toBeNull();
      expect(host.container.querySelectorAll("input").find((node) => node.getAttribute("aria-label") === "Search projects and chats")).toBeUndefined();
      expect(host.container.querySelector(".sidebar-footer")?.textContent).toContain("Launch Studio");
      expect(host.container.querySelector(".instrument-profile-control")).toBeNull();
      expect(button("New chat")).toBeUndefined();
      expect(button("Shared assets")).toBeTruthy();
      for (const name of ["Browser", "Memory", "Context"]) expect(button(name)).toBeUndefined();
      expect(button("Open project Launch film").getAttribute("aria-current")).toBe(mode === "work" ? "page" : null);
    }
    Object.assign(window, { innerWidth: 1280, innerHeight: 720 });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 0; });
    const picker = button("Select workspace");
    vi.spyOn(picker, "getBoundingClientRect").mockReturnValue({ top: 650, bottom: 680, left: 12, right: 220, x: 12, y: 650, width: 208, height: 30, toJSON() {} });
    await click("Select workspace");
    const menu = document.body.querySelector(".workspace-picker-popover") as HTMLElement;
    expect(menu).toBeTruthy();
    expect(menu.textContent).not.toContain("Ralphy production workspace");
    expect(menu.textContent).not.toContain("Launches");
    const selectedWorkspace = Array.from(menu.querySelectorAll("button")).find((node) => node.getAttribute("role") === "option" && node.getAttribute("aria-selected") === "true");
    expect(selectedWorkspace?.getAttribute("title")).toBe("Launches");
    expect(selectedWorkspace?.textContent).toContain("Launch Studio");
    expect(selectedWorkspace?.textContent).toContain("2");
    expect(Number.parseFloat(menu.style.bottom)).toBeGreaterThan(720 - 650);
    expect(Number.parseFloat(menu.style.maxHeight) + Number.parseFloat(menu.style.bottom)).toBeLessThan(720);
    const workspaceSearch = menu.querySelector("input")!;
    Object.assign(workspaceSearch, { attachEvent() {}, detachEvent() {}, selectionStart: 0, selectionEnd: 0 });
    await act(async () => { workspaceSearch.dispatchEvent(new Event("focusin", { bubbles: true })); workspaceSearch.dispatchEvent(Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), { key: "Enter" })); });
    expect(openWorkspace).toHaveBeenCalledWith("studio");
    expect(document.activeElement).toBe(picker);
    await click("Create");
    expect(switchMode).toHaveBeenLastCalledWith("work");
    expect(openPage).toHaveBeenLastCalledWith("generation");
    await click("Open project Launch film");
    expect(openProject).toHaveBeenLastCalledWith(project);
    expect(lensChange).not.toHaveBeenCalled();
    expect(host.container.textContent).not.toContain("Campaign research");
    openProject.mockClear();
    await click("Show chats in Launch film");
    expect(openProject).not.toHaveBeenCalled();
    expect(host.container.textContent).toContain("Campaign research");
    await click("Campaign research");
    expect(agentChat.selectChat).toHaveBeenLastCalledWith("launch-chat");
    expect(restoreProject).toHaveBeenLastCalledWith(project);
    expect(openProject).not.toHaveBeenCalled();
    await click("New chat in Launch film");
    expect(agentChat.newChat).toHaveBeenLastCalledWith({ workspaceId: "studio", projectId: "launch" });
    expect(switchMode).toHaveBeenLastCalledWith("work");
    expect(lensChange).toHaveBeenLastCalledWith("chat");
    await click("Explore");
    expect(switchMode).toHaveBeenLastCalledWith("marketplace");
    expect(openMarketplace).not.toHaveBeenCalled();
    await click("Creative discussion");
    expect(switchMode).toHaveBeenLastCalledWith("work");
    expect(agentChat.selectChat).toHaveBeenLastCalledWith("chat");

    await click("Collapse chats");
    expect(button("Expand chats").getAttribute("aria-expanded")).toBe("false");
    expect(host.container.textContent).not.toContain("Creative discussion");
    expect(host.container.textContent).toContain("Campaign research");
    await click("Expand chats");
    expect(host.container.textContent).toContain("Creative discussion");
    await click("Open settings");
    expect(openSettings).toHaveBeenCalledOnce();
    expect(openSettings.mock.calls[0].length).toBe(0);
    expect(button("Create")).toBeTruthy();
    expect(host.container.querySelector("kbd")).toBeNull();
    await click("Hide chats in Launch film");
    expect(host.container.textContent).not.toContain("Campaign research");
    await click("Show chats in Launch film");
    expect(host.container.textContent).toContain("Campaign research");
    await click("New project");
    const nameInput = host.container.querySelectorAll("input").find((node) => node.getAttribute("aria-label") === "project name")!;
    Object.assign(nameInput, { attachEvent() {}, detachEvent() {}, selectionStart: 0, selectionEnd: 0 });
    await act(async () => { nameInput.dispatchEvent(new Event("focusin", { bubbles: true })); nameInput.value = "A real project"; nameInput.dispatchEvent(new Event("keyup", { bubbles: true })); nameInput.dispatchEvent(new Event("focusout", { bubbles: true })); });
    await act(async () => host.container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(createProject).toHaveBeenCalledWith("studio", "A real project");
  } finally { await act(async () => root.unmount()); host.restore(); vi.restoreAllMocks(); }
});

test("switching project and workspace chats preserves each chat's selected document without replacing the work route", async () => {
  const host = createReactHost(), { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  let view!: ReturnType<typeof useViewTabs>;
  let currentRoute!: WorkbenchRoute;
  function Harness() {
    const [activeId, setActiveId] = useState("workspace-chat");
    const [route, setRoute] = useState<WorkbenchRoute>({ kind: "workspace", workspaceId: "studio" });
    const [panel, setPanel] = useState(EMPTY_VIEW_PANEL);
    currentRoute = route;
    const restoreProject = (project: ProjectSummary) => setRoute({ kind: "project", workspaceId: project.workspaceId, projectId: project.projectId });
    view = useViewTabs({ viewPanel: panel, setViewPanel: setPanel, route, workspacePage: "units", projects: catalog.projects, mode: "work", lens: "chat", setLens() {}, viewChatId: activeId, settingsVisible: false, onOpenWorkspacePage() {}, onOpenProject: restoreProject });
    const agentChat = { activeChat: { id: activeId }, selectChat: setActiveId, newChat() {} } as unknown as AgentChatController;
    return <AppSidebar mode="work" lens="chat" route={route} page="units" marketplaceRoute={{ kind: "discover" }} catalog={catalog} workspaces={[workspace]} workspaceId="studio" pinnedWorkspaceIds={[]} canGoBack={false} canGoForward={false} agentChat={agentChat}
      chats={[{ id: "workspace-chat", title: "Workspace discussion", busy: false, updatedAt: 1 }, { id: "project-chat", title: "Project discussion", busy: false, updatedAt: 2, project: { workspaceId: "studio", projectId: "launch" } }]}
      onBack={() => {}} onForward={() => {}} onCollapse={() => {}} onOpenSettings={() => {}} onSwitchMode={() => {}} onOpenMarketplaceRoute={() => {}} onOpenWorkspace={() => {}} onOpenPage={() => {}} onLens={() => {}}
      onOpenProject={(project) => view.openView({ type: "project", targetId: project.projectId, label: project.name })} onRestoreProject={restoreProject} />;
  }
  const click = async (label: string) => {
    const button = host.container.querySelectorAll("button").find((node) => node.textContent === label || node.getAttribute("aria-label") === label)!;
    expect(button).toBeTruthy(); await act(async () => button.dispatchEvent(new Event("click", { bubbles: true })));
  };
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => view.openView({ type: "unit", targetId: "studio/launch/unit/rev-2", label: "Creative" }));
    const document = view.viewTab;
    await click("Show chats in Launch film");
    await click("Project discussion");
    expect(currentRoute).toEqual({ kind: "project", workspaceId: "studio", projectId: "launch" });
    const folder = host.container.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === "Open project Launch film")!.parentElement!;
    expect(folder.getAttribute("class")?.split(" ")).not.toContain("bg-field");
    const activeChat = host.container.querySelectorAll("button").find((node) => node.textContent === "Project discussion")!;
    expect(activeChat.parentElement?.getAttribute("class")?.split(" ")).toContain("bg-field");
    await act(async () => view.openView({ type: "browser", targetId: "https://example.com", label: "Reference" }));
    const browser = view.viewTab;
    await click("Workspace discussion");
    expect(currentRoute).toEqual({ kind: "project", workspaceId: "studio", projectId: "launch" });
    expect(view.viewTab).toEqual(document);
    await click("Project discussion");
    expect(view.viewTab).toEqual(browser);
  } finally { await act(async () => root.unmount()); host.restore(); }
});
