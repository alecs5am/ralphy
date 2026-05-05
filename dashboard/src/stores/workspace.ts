import { create } from "zustand";
import {
  addGroupBeside,
  findGroupNode,
  findTab,
  firstGroup,
  getAllGroups,
  nid,
  removeGroup,
  updateGroup,
  type LayoutNode,
  type Side,
} from "./layout";

export type Project = {
  id: string;
  name: string;
  status: string;
  scenario: any;
  manifest: any;
  hasRender: boolean;
  assetFiles: string[];
  assetCount: number;
  [k: string]: any;
};

export type Brand = {
  id: string;
  name: string;
  slug: string;
  url?: string;
  colors?: any;
  tokens?: any;
  screenshots?: string[];
  [k: string]: any;
};

export type Persona = {
  id: string;
  name: string;
  fullName?: string;
  avatar?: string | null;
  voice: any;
  tone: string;
  language: string;
  demographics?: any;
  speakingStyle?: any;
  [k: string]: any;
};

export type Ref = {
  id: string;
  url: string;
  type: "design" | "social" | string;
  brand?: string;
  status: string;
  [k: string]: any;
};

export type Stats = {
  projectCount: number;
  assetCount: number;
  totalSizeMB: number;
} | null;

export type Area = "editor";

export type SectionKey =
  | "projects"
  | "brands"
  | "personas"
  | "refs"
  | "batches"
  | "templates";

export type ViewTabType =
  | "project"
  | "brand"
  | "persona"
  | "ref"
  | "refs"
  | "batch"
  | "template";

export type ViewTab = {
  id: string;
  kind: "view";
  type: ViewTabType;
  label: string;
  entityId: string | null;
};

export type TerminalTab = {
  id: string;
  kind: "terminal";
  label: string;
};

export type Tab = ViewTab | TerminalTab;

export type Group = {
  id: string;
  tabs: Tab[];
  activeTabId: string | null;
};

function makeGroup(tabs: Tab[]): Group {
  return {
    id: nid("grp"),
    tabs,
    activeTabId: tabs[tabs.length - 1]?.id ?? null,
  };
}

type WorkspaceStore = {
  projectRoot: string;
  projects: Project[];
  brands: Brand[];
  personas: Persona[];
  refs: Ref[];
  batches: any[];
  templates: any[];
  stats: Stats;

  activeSection: SectionKey;

  editorLayout: LayoutNode | null;
  activeArea: Area;
  activeGroupId: string | null;

  setProjectRoot: (root: string) => void;
  setProjects: (p: Project[]) => void;
  setBrands: (b: Brand[]) => void;
  setPersonas: (p: Persona[]) => void;
  setRefs: (r: Ref[]) => void;
  setBatches: (b: any[]) => void;
  setTemplates: (t: any[]) => void;
  setStats: (s: Stats) => void;

  setActiveSection: (s: SectionKey) => void;

  openViewTab: (tab: Omit<ViewTab, "kind">) => void;
  openTerminal: () => void;
  openRefsLibrary: () => void;
  closeTab: (groupId: string, tabId: string) => void;
  setActiveTab: (groupId: string, tabId: string) => void;
  setActiveGroup: (groupId: string) => void;

  moveTab: (
    from: { area: Area; groupId: string; tabId: string },
    to: { area: Area; groupId: string; beforeTabId?: string | null }
  ) => void;
  splitWithTab: (
    from: { area: Area; groupId: string; tabId: string },
    to: { area: Area; groupId: string; side: Side }
  ) => void;
};

export const useWorkspace = create<WorkspaceStore>((set, get) => ({
  projectRoot: "",
  projects: [],
  brands: [],
  personas: [],
  refs: [],
  batches: [],
  templates: [],
  stats: null,

  activeSection: "projects",
  editorLayout: null,
  activeArea: "editor",
  activeGroupId: null,

  setProjectRoot: (root) => set({ projectRoot: root }),
  setProjects: (projects) => set({ projects }),
  setBrands: (brands) => set({ brands }),
  setPersonas: (personas) => set({ personas }),
  setRefs: (refs) => set({ refs }),
  setBatches: (batches) => set({ batches }),
  setTemplates: (templates) => set({ templates }),
  setStats: (stats) => set({ stats }),

  setActiveSection: (s) => set({ activeSection: s }),

  openViewTab: (tabInput) => {
    const tab: ViewTab = { ...tabInput, kind: "view" };
    const state = get();

    const existing = findTab(state.editorLayout, tab.id);
    if (existing) {
      set({
        editorLayout: updateGroup(state.editorLayout, existing.groupId, (g) => ({
          ...g,
          activeTabId: tab.id,
        })),
        activeGroupId: existing.groupId,
      });
      return;
    }

    if (!state.editorLayout) {
      const g = makeGroup([tab]);
      set({
        editorLayout: { id: "n-" + g.id, kind: "group", group: g },
        activeGroupId: g.id,
      });
      return;
    }

    const targetId = state.activeGroupId || firstGroup(state.editorLayout)?.id;
    if (!targetId) return;
    set({
      editorLayout: updateGroup(state.editorLayout, targetId, (g) => ({
        ...g,
        tabs: [...g.tabs, tab],
        activeTabId: tab.id,
      })),
      activeGroupId: targetId,
    });
  },

  openTerminal: () => {
    const state = get();
    const tab: TerminalTab = { id: nid("term"), kind: "terminal", label: "terminal" };

    if (!state.editorLayout) {
      const g = makeGroup([tab]);
      set({
        editorLayout: { id: "n-" + g.id, kind: "group", group: g },
        activeGroupId: g.id,
      });
      return;
    }

    const targetId = state.activeGroupId || firstGroup(state.editorLayout)?.id;
    if (!targetId) return;
    set({
      editorLayout: updateGroup(state.editorLayout, targetId, (g) => ({
        ...g,
        tabs: [...g.tabs, tab],
        activeTabId: tab.id,
      })),
      activeGroupId: targetId,
    });
  },

  openRefsLibrary: () => {
    get().openViewTab({
      id: "refs:library",
      type: "refs",
      label: "references",
      entityId: null,
    });
  },

  closeTab: (groupId, tabId) => {
    const state = get();
    const root = state.editorLayout;
    if (!root) return;

    let updated: LayoutNode | null = updateGroup(root, groupId, (g) => {
      const tabs = g.tabs.filter((t) => t.id !== tabId);
      const activeTabId =
        g.activeTabId === tabId ? tabs[tabs.length - 1]?.id ?? null : g.activeTabId;
      return { ...g, tabs, activeTabId };
    });
    const found = findGroupNode(updated, groupId);
    if (found && found.node.group.tabs.length === 0) {
      updated = removeGroup(updated, groupId);
    }

    const nextActiveGroup =
      state.activeGroupId === groupId &&
      (!found || found.node.group.tabs.length === 0)
        ? firstGroup(updated)?.id ?? null
        : state.activeGroupId;

    set({ editorLayout: updated, activeGroupId: nextActiveGroup });
  },

  setActiveTab: (groupId, tabId) => {
    const state = get();
    set({
      editorLayout: updateGroup(state.editorLayout, groupId, (g) => ({
        ...g,
        activeTabId: tabId,
      })),
      activeGroupId: groupId,
    });
  },

  setActiveGroup: (groupId) => set({ activeGroupId: groupId }),

  moveTab: (from, to) => {
    const state = get();
    const root = state.editorLayout;
    const src = findTab(root, from.tabId);
    if (!src) return;
    const { tab } = src;

    if (from.groupId === to.groupId) {
      const reorderedRoot = updateGroup(root, from.groupId, (g) => {
        const rest = g.tabs.filter((t) => t.id !== tab.id);
        let tabs: Tab[];
        if (to.beforeTabId) {
          const idx = rest.findIndex((t) => t.id === to.beforeTabId);
          tabs =
            idx >= 0 ? [...rest.slice(0, idx), tab, ...rest.slice(idx)] : [...rest, tab];
        } else {
          tabs = [...rest, tab];
        }
        return { ...g, tabs, activeTabId: tab.id };
      });
      set({ editorLayout: reorderedRoot });
      return;
    }

    let newRoot: LayoutNode | null = updateGroup(root, from.groupId, (g) => {
      const tabs = g.tabs.filter((t) => t.id !== tab.id);
      const activeTabId =
        g.activeTabId === tab.id ? tabs[tabs.length - 1]?.id ?? null : g.activeTabId;
      return { ...g, tabs, activeTabId };
    });
    const srcFound = findGroupNode(newRoot, from.groupId);
    if (srcFound && srcFound.node.group.tabs.length === 0) {
      newRoot = removeGroup(newRoot, from.groupId);
    }

    const insertIntoGroup = (g: Group): Group => {
      if (g.tabs.find((t) => t.id === tab.id)) return { ...g, activeTabId: tab.id };
      const tabs = [...g.tabs];
      if (to.beforeTabId) {
        const idx = tabs.findIndex((t) => t.id === to.beforeTabId);
        if (idx >= 0) tabs.splice(idx, 0, tab);
        else tabs.push(tab);
      } else {
        tabs.push(tab);
      }
      return { ...g, tabs, activeTabId: tab.id };
    };

    const finalRoot = updateGroup(newRoot, to.groupId, insertIntoGroup);
    set({ editorLayout: finalRoot, activeGroupId: to.groupId });
  },

  splitWithTab: (from, to) => {
    const state = get();
    const root = state.editorLayout;
    const src = findTab(root, from.tabId);
    if (!src) return;
    const { tab } = src;

    const srcFound = findGroupNode(root, from.groupId);
    if (
      from.groupId === to.groupId &&
      srcFound?.node.group.tabs.length === 1
    ) {
      return;
    }

    let newRoot: LayoutNode | null = updateGroup(root, from.groupId, (g) => {
      const tabs = g.tabs.filter((t) => t.id !== tab.id);
      const activeTabId =
        g.activeTabId === tab.id ? tabs[tabs.length - 1]?.id ?? null : g.activeTabId;
      return { ...g, tabs, activeTabId };
    });
    const srcAfter = findGroupNode(newRoot, from.groupId);
    if (srcAfter && srcAfter.node.group.tabs.length === 0) {
      newRoot = removeGroup(newRoot, from.groupId);
    }

    const newGroup = makeGroup([tab]);
    const finalRoot = addGroupBeside(newRoot, to.groupId, to.side, newGroup);
    set({ editorLayout: finalRoot, activeGroupId: newGroup.id });
  },
}));

// Convenience getters used by some helpers
export function _allGroups(state: WorkspaceStore) {
  return getAllGroups(state.editorLayout);
}
