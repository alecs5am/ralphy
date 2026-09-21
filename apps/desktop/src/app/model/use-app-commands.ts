/**
 * Every app-level chord and the two mouse buttons that mean the same thing.
 *
 * Bindings are read per keystroke rather than captured once, so a rebinding made in Settings is
 * live at once -- there is no registration step to miss. The registry owns which chord a command
 * carries; this hook owns what the command does, and nothing else in the app listens on `window`
 * for a chord the registry knows about.
 */
import { useEffect } from "react";

import { readCommandBindings, resolveCommand } from "@/pages/settings";
import { bridge, type WorkspaceSummary } from "@/shared/api/ipc";
import type { AppMode } from "@/shared/model/routes";
import type { WorkbenchRoute, WorkspacePage } from "@/shared/model/workbench";

export interface AppCommandTargets {
  settingsVisible: boolean;
  setSettingsVisible(visible: boolean): void;
  mode: AppMode;
  route: WorkbenchRoute;
  workspaces: WorkspaceSummary[];
  navigateBack(): void;
  navigateForward(): void;
  openWorkspace(workspaceId: string): void;
  clearOverviewNavigation(): void;
  setWorkspacePage(page: WorkspacePage): void;
  setSidebarSearchRequest(update: (request: number) => number): void;
  setSidebarVisible(update: (visible: boolean) => boolean): void;
  setLens(lens: "desk" | "chat"): void;
  toggleAgent(): void;
  onNewChat(): void;
  switchAppMode(mode: AppMode): void;
}

export function useAppCommands({
  settingsVisible,
  setSettingsVisible,
  mode,
  route,
  workspaces,
  navigateBack,
  navigateForward,
  openWorkspace,
  clearOverviewNavigation,
  setWorkspacePage,
  setSidebarSearchRequest,
  setSidebarVisible,
  setLens,
  toggleAgent,
  onNewChat,
  switchAppMode,
}: AppCommandTargets) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented) return;
      if (settingsVisible && event.key === "Escape") {
        event.preventDefault();
        setSettingsVisible(false);
        return;
      }
      // Bindings are read per keystroke so a rebinding made in Settings is live at once.
      const command = resolveCommand(event, readCommandBindings(localStorage));
      if (!command) return;
      event.preventDefault();
      if (command.id === "nav.back") navigateBack();
      else if (command.id === "nav.forward") navigateForward();
      else if (command.id === "nav.findProjects") {
        switchAppMode("work");
        clearOverviewNavigation();
        setWorkspacePage("projects");
        setSidebarSearchRequest((request) => request + 1);
      } else if (command.id === "app.sidebar") {
        setSidebarVisible((visible) => !visible);
      } else if (command.id === "app.agent") {
        toggleAgent();
      } else if (command.id === "chat.new") { switchAppMode("work"); setLens("chat"); onNewChat(); }
      else if (command.id === "view.desk") setLens("desk");
      else if (command.id === "view.chat") setLens("chat");
      else if (command.id === "app.marketplace") switchAppMode("marketplace");
      else if (command.id === "app.settings") setSettingsVisible(true);
    };
    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 3) navigateBack();
      if (event.button === 4) navigateForward();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mouseup", onMouseUp);
    // Electron reserves Cmd+R to prevent a reload; route it through the same rebindable registry.
    const unsubscribe = bridge.onToggleRightPanel(() => (document.activeElement ?? document).dispatchEvent(new KeyboardEvent("keydown", { key: "r", code: "KeyR", metaKey: true, bubbles: true, cancelable: true })));
    return () => {
      unsubscribe();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [clearOverviewNavigation, mode, navigateBack, navigateForward, onNewChat, openWorkspace, settingsVisible, route, switchAppMode, workspaces, toggleAgent]);
}
