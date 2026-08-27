/**
 * The view panel's tabs: what is open beside the chat, which one is raised, and the chords that
 * move between them.
 *
 * A tab set belongs to a chat, not to the window: switching chats brings back the places that
 * chat had open, which is why every write goes through `updateChatPanel` rather than at the
 * preference record. Two tabs are not routes -- home is the panel's own page and the browser is a
 * guest -- so raising either leaves the work route where it is. That is the rule the panel exists
 * to keep, and the reason opening a tab and navigating are the same call for everything else.
 */
import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";

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
  openViewTab,
  panelWidthFor,
  selectViewTab,
  stepViewTab,
  capChatPanels,
  tabSetFor,
  type OpenViewRequest,
  type ViewChatPanel,
  type ViewPanelPreferences,
  type ViewTabSet,
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
  viewChatId,
  route,
  projects,
  workspacePage,
  settingsVisible,
  onOpenWorkspacePage,
  onOpenProject,
}: ViewTabsInput) {
  /* One definition of "open or close the panel beside the chat", for the chord and the command
     alike. It is a chat-lens decision: under the desk lens there is no panel to toggle, and a
     preference that flipped invisibly would surprise the operator on their way back. */
  const toggleViewPanel = useCallback(() => {
    setViewPanel((record) => lens === "chat" ? { ...record, open: !record.open } : record);
  }, [lens, setViewPanel]);
  const viewFrameActive = lens === "chat" && mode === "work";
  const tabSet = tabSetFor(viewPanel, viewChatId);
  const viewTab = activeViewTab(tabSet);
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

  /* The tab set follows the route instead of every caller announcing itself: a place you have
     navigated to is a place you have open, whichever control took you there -- the sidebar, an
     overview link, the island, the hub. The ref is what keeps the home tab selectable: without it
     any re-render that re-ran this effect would raise the route's tab and steal home's turn. */
  const routePlace = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== "work" || !viewChatId) return;
    const project = route.kind === "project"
      ? projects.find((candidate) => candidate.projectId === route.projectId) ?? null
      : null;
    const request: OpenViewRequest | null = route.kind === "project"
      ? project && { type: "project", targetId: project.projectId, label: project.name }
      : route.kind === "workspace"
        ? { type: workspacePage, label: WORKSPACE_PAGE_LABELS[workspacePage] }
        : null;
    if (!request) return;
    const key = `${viewChatId}:${request.type}:${request.targetId ?? ""}`;
    if (key === routePlace.current) return;
    routePlace.current = key;
    updateTabs((set) => openViewTab(set, request));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateTabs is a render-local closure
  }, [mode, projects, route, viewChatId, workspacePage]);

  const routeToView = (request: OpenViewRequest) => {
    /* The browser is not a route, so opening or raising its tab leaves the work route where it is
       -- the same rule home has, and the reason neither steals your place. */
    if (request.type === "browser") return;
    if (request.type !== "project") { onOpenWorkspacePage(request.type); return; }
    const project = projects.find((candidate) => candidate.projectId === request.targetId);
    if (project) onOpenProject(project);
  };

  const openView = (request: OpenViewRequest) => {
    setLens("chat");
    updateTabs((set) => openViewTab(set, request));
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
    const next = closeViewTab(tabSet, id);
    if (next === tabSet) return;
    updateTabs(() => next);
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
        const tab = tabSet.tabs[Number(event.key) - 1];
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
      if (command.id === "view.home") { setLens("chat"); selectView(HOME_TAB_ID); return; }
      if (command.id === "view.close") { closeView(tabSet.activeTabId); return; }
      if (command.id === "view.prev" || command.id === "view.next") {
        selectView(stepViewTab(tabSet, command.id === "view.next" ? 1 : -1).activeTabId);
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
    viewChords,
    toggleViewPanel,
    updateChatPanel,
    updateTabs,
    openView,
    selectView,
    closeView,
  };
}
