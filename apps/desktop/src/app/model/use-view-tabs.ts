/**
 * Open documents and browser pages belong to a chat. Workspace pages use the ordinary route;
 * the internal home entry returns to that route without closing any task.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import {
  chordTokens,
  effectiveChord,
  readCommandBindings,
  resolveCommand,
  SETTINGS_COMMANDS,
} from "@/pages/settings";
import {
  activeViewTab,
  closeViewTab,
  HOME_TAB_ID,
  isTaskView,
  openViewTab,
  panelWidthFor,
  selectViewTab,
  stepViewTab,
  capChatPanels,
  tabSetFor,
  taskViews,
  type OpenViewRequest,
  type ViewChatPanel,
  type ViewPanelPreferences,
  type ViewTabSet,
  type ViewTab,
} from "@/widgets/view-panel";
import type { AppMode } from "@/shared/model/routes";
import type { ProjectSummary } from "@/shared/api/ipc";
import {
  WORKSPACE_PAGE_LABELS,
  WORKSPACE_PAGES,
  type WorkbenchRoute,
  type WorkspacePage,
} from "@/shared/model/workbench";

export interface ViewTabsInput {
  viewPanel: ViewPanelPreferences;
  setViewPanel: Dispatch<SetStateAction<ViewPanelPreferences>>;
  lens: "desk" | "chat";
  setLens(lens: "desk" | "chat"): void;
  mode: AppMode;
  viewChatId: string | null;
  viewChatReady?: boolean;
  viewScopeKey?: string;
  route: WorkbenchRoute;
  projects: readonly ProjectSummary[];
  workspacePage: WorkspacePage;
  settingsVisible: boolean;
  onOpenWorkspacePage(page: WorkspacePage): void;
  onOpenProject(project: ProjectSummary): void;
}

export function useViewTabs({
  viewPanel,
  setViewPanel,
  lens,
  setLens,
  mode,
  viewChatId: activeChatId,
  viewChatReady = true,
  viewScopeKey = "workspace",
  route,
  projects,
  workspacePage,
  settingsVisible,
  onOpenWorkspacePage,
  onOpenProject,
}: ViewTabsInput) {
  const viewChatId = viewChatReady ? activeChatId : null;
  const pendingViews = useRef<{ scope: string; requests: OpenViewRequest[] } | null>(null);
  const [agentRequest, setAgentRequest] = useState(0);
  const [viewExpanded, setViewExpanded] = useState(false);
  /* One definition of "open or close the panel beside the chat", for the chord and the command
     alike. It is a chat-lens decision: under the desk lens there is no panel to toggle, and a
     preference that flipped invisibly would surprise the operator on their way back. */
  const toggleViewPanel = useCallback(() => {
    setViewPanel((record) => lens === "chat" ? { ...record, open: !record.open } : record);
  }, [lens, setViewPanel]);
  // Content tabs survive opening and closing the agent, including unit and browser views.
  const viewFrameActive = viewChatId !== null;
  const tabSet = tabSetFor(viewPanel, viewChatId);
  const activeTab = activeViewTab(tabSet);
  const tasks = taskViews(tabSet);
  const viewTab: ViewTab = isTaskView(activeTab) ? activeTab : {
    id: HOME_TAB_ID,
    type: route.kind === "project" ? "project" : route.kind === "workspace" ? workspacePage : "home",
    targetId: route.kind === "project" ? route.projectId : null,
    label: route.kind === "project" ? "Project" : WORKSPACE_PAGE_LABELS[workspacePage],
  };
  useEffect(() => {
    setViewExpanded(false);
  }, [viewTab.id, viewTab.type, viewTab.targetId, viewChatId, lens, mode, viewPanel.open]);
  const viewWidth = panelWidthFor(viewPanel, viewChatId);
  const updateChatPanel = (update: (panel: ViewChatPanel) => ViewChatPanel) => setViewPanel((record) => {
    if (!viewChatId) return record;
    const current: ViewChatPanel = { ...tabSetFor(record, viewChatId), width: panelWidthFor(record, viewChatId) };
    const next = update(current);
    return { ...record, byChat: capChatPanels({ ...record.byChat, [viewChatId]: next }) };
  });
  const updateTabs = (update: (set: ViewTabSet) => ViewTabSet) => updateChatPanel((panel) => {
    const next = update(panel);
    return next === panel ? panel : { ...next, width: panel.width };
  });

  useEffect(() => {
    const pending = pendingViews.current;
    if (!pending) return;
    if (pending.scope !== viewScopeKey) { pendingViews.current = null; return; }
    if (!viewChatId) return;
    pendingViews.current = null;
    updateTabs((set) => pending.requests.reduce(openViewTab, set));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply queued clicks to the now-loaded chat
  }, [viewChatId, viewScopeKey]);

  /* Route navigation returns to content without closing documents. A new chat keeps its own
     saved task; catalog refreshes and mode switches must not steal the active document. */
  const routePlace = useRef<{ chatId: string; workspaceId: string | null; key: string } | null>(null);
  useEffect(() => {
    if (mode !== "work" || !viewChatId) return;
    const workspaceId = route.kind === "library" ? null : route.workspaceId;
    const key = route.kind === "project" ? `project:${route.projectId}` : `${route.kind}:${workspacePage}`;
    const previous = routePlace.current;
    routePlace.current = { chatId: viewChatId, workspaceId, key };
    if (!previous || previous.chatId !== viewChatId || previous.workspaceId !== workspaceId || previous.key === key) return;
    updateTabs((set) => selectViewTab(set, HOME_TAB_ID));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateTabs is a render-local closure
  }, [mode, projects, route, viewChatId, workspacePage]);

  const routeToView = (request: OpenViewRequest) => {
    /* The browser is not a route, so opening or raising its tab leaves the work route where it is
       -- the same rule home has, and the reason neither steals your place. */
    if (request.type === "browser" || request.type === "unit") return;
    if (request.type !== "project") { onOpenWorkspacePage(request.type); return; }
    const project = projects.find((candidate) => candidate.projectId === request.targetId && route.kind !== "library" && candidate.workspaceId === route.workspaceId);
    if (project) onOpenProject(project);
  };

  const openView = (request: OpenViewRequest) => {
    setViewExpanded(false);
    setViewPanel((record) => ({ ...record, open: true }));
    if (isTaskView(request) && !viewChatId) {
      const prior = pendingViews.current?.scope === viewScopeKey ? pendingViews.current.requests : [];
      pendingViews.current = { scope: viewScopeKey, requests: [...prior, request] };
    } else {
      pendingViews.current = null;
      updateTabs((set) => isTaskView(request) ? openViewTab(set, request) : selectViewTab(set, HOME_TAB_ID));
    }
    routeToView(request);
  };

  const selectView = (id: string) => {
    const tab = tabSet.tabs.find((candidate) => candidate.id === id);
    if (!tab) return;
    updateTabs((set) => selectViewTab(set, id));
    /* Home is the panel's own page, not a route: selecting it leaves the work route where it is,
       which is what makes it a point of return rather than a seventh place. */
    if (tab.type !== "home") routeToView({ type: tab.type, targetId: tab.targetId, label: tab.label });
  };

  const closeView = (id: string) => {
    if (!tasks.some((tab) => tab.id === id)) return;
    const next = closeViewTab({ ...tabSet, tabs: [tabSet.tabs[0]!, ...tasks] }, id);
    if (next === tabSet) return;
    updateTabs((set) => ({ ...set, tabs: set.tabs.filter((tab) => tab.id !== id), activeTabId: next.activeTabId }));
    if (tabSet.activeTabId !== id) return;
    const landed = next.tabs.find((tab) => tab.id === next.activeTabId)!;
    if (landed.type !== "home") routeToView({ type: landed.type, targetId: landed.targetId, label: landed.label });
  };

  /* A cap this panel prints is a chord the registry resolves, so the caps are read from the
     registry with the user's own rebindings applied rather than typed into the markup. */
  const viewChords = useMemo(() => {
    const bindings = readCommandBindings(localStorage);
    return Object.fromEntries(SETTINGS_COMMANDS.flatMap((command) => {
      const bound = effectiveChord(command, bindings);
      return bound ? [[command.id, chordTokens(bound)]] : [];
    }));
  }, [settingsVisible]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (settingsVisible || mode !== "work") return;
      /* `⌥1..9` is one behaviour over nine keys, so it is not nine registry entries. It is stated
         here, ahead of the registry lookup, and prints no cap anywhere -- nothing claims a chord
         the registry does not own. */
      if (event.altKey && !event.metaKey && !event.ctrlKey && /^[1-9]$/.test(event.key)) {
        const tab = tasks[Number(event.key) - 1];
        if (!tab) return;
        event.preventDefault();
        selectView(tab.id);
        return;
      }
      const command = resolveCommand(event, readCommandBindings(localStorage));
      if (!command?.id.startsWith("view.")) return;
      if (command.id === "view.desk" || command.id === "view.chat") return;
      event.preventDefault();
      if (command.id === "view.panel") { toggleViewPanel(); return; }
      if (command.id === "view.home") { selectView(HOME_TAB_ID); return; }
      if (command.id === "view.close") { closeView(tabSet.activeTabId); return; }
      if (command.id === "view.prev" || command.id === "view.next") {
        if (!tasks.length) return;
        const activeTabId = tasks.some((tab) => tab.id === tabSet.activeTabId) ? tabSet.activeTabId : (command.id === "view.next" ? tasks.at(-1)! : tasks[0]!).id;
        selectView(stepViewTab({ tabs: tasks, activeTabId }, command.id === "view.next" ? 1 : -1).activeTabId);
        return;
      }
      const page = command.id.slice("view.".length) as WorkspacePage;
      if (WORKSPACE_PAGES.includes(page)) openView({ type: page, label: WORKSPACE_PAGE_LABELS[page] });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the handlers are render-local closures
  }, [mode, settingsVisible, tabSet, viewPanel.open, projects, workspacePage]);

  return {
    viewFrameActive,
    tabSet,
    viewTab,
    viewWidth,
    viewExpanded,
    agentRequest,
    toggleViewExpanded: () => setViewExpanded((expanded) => !expanded),
    revealCanvasChat: () => { setAgentRequest((request) => request + 1); setViewExpanded(false); setLens("chat"); setViewPanel((record) => ({ ...record, open: true })); },
    viewChords,
    toggleViewPanel,
    updateChatPanel,
    updateTabs,
    openView,
    selectView,
    closeView,
  };
}
