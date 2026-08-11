import type { ProjectMediaFilter, ProjectMediaQuery, ProjectReference, ProjectTab } from "../../electron/media/types";

type ProjectRef = ProjectReference;

export type LoadStatus = "idle" | "loading" | "ready" | "error";
export type DomainRow = { id?: string; ref?: { type: string; id: string }; sequence?: number };
export type DomainPage = {
  status: LoadStatus;
  items: DomainRow[];
  nextCursor: string | number | null;
  error: string | null;
  requestId: string | null;
  mediaFilter: ProjectMediaFilter | null;
};

export type ProjectDomainState = {
  project: ProjectRef;
  generation: number;
  overview: { status: LoadStatus; value: unknown | null; error: string | null };
  pages: Record<ProjectTab, DomainPage>;
  media: ProjectMediaQuery;
  preview: { status: LoadStatus; value: { url: string; sizeBytes: number } | null; error: string | null; requestId: string | null };
};

const tabs: ProjectTab[] = ["documents", "media", "compositions", "units", "activity"];

function emptyPage(): DomainPage {
  return {
    status: "idle",
    items: [],
    nextCursor: null,
    error: null,
    requestId: null,
    mediaFilter: null,
  };
}

function identity(row: DomainRow): string | null {
  if (typeof row.id === "string") return row.id;
  if (row.ref && typeof row.ref.type === "string" && typeof row.ref.id === "string") {
    return `${row.ref.type}:${row.ref.id}`;
  }
  if (typeof row.sequence === "number" && Number.isSafeInteger(row.sequence)) {
    return `activity:${row.sequence}`;
  }
  return null;
}

function pages(): Record<ProjectTab, DomainPage> {
  return Object.fromEntries(tabs.map((tab) => [tab, emptyPage()])) as Record<ProjectTab, DomainPage>;
}

export function createProjectDomainState(project: ProjectRef, generation = 1): ProjectDomainState {
  return {
    project,
    generation,
    overview: { status: "idle", value: null, error: null },
    pages: pages(),
    media: { filter: "all" },
    preview: { status: "idle", value: null, error: null, requestId: null },
  };
}

export type ProjectDomainAction =
  | { type: "project-changed"; project: ProjectRef }
  | { type: "overview-loading"; generation: number }
  | { type: "overview-ready"; generation: number; value: unknown }
  | { type: "overview-failed"; generation: number; error: string }
  | { type: "page-loading"; tab: ProjectTab; generation: number; requestId: string; mediaFilter?: ProjectMediaFilter }
  | { type: "page-ready"; tab: ProjectTab; generation: number; requestId: string; mediaFilter?: ProjectMediaFilter; append?: boolean; page: { items: DomainRow[]; nextCursor: string | number | null } }
  | { type: "page-failed"; tab: ProjectTab; generation: number; requestId: string; mediaFilter?: ProjectMediaFilter; error: string }
  | { type: "activity-merge"; generation: number; items: DomainRow[] }
  | { type: "media-query"; query: ProjectMediaQuery }
  | { type: "preview-loading"; generation: number; requestId: string }
  | { type: "preview-ready"; generation: number; requestId: string; value: { url: string; sizeBytes: number } | null }
  | { type: "preview-failed"; generation: number; requestId: string; error: string };

export function projectDomainReducer(state: ProjectDomainState, action: ProjectDomainAction): ProjectDomainState {
  if (action.type === "project-changed") return createProjectDomainState(action.project, state.generation + 1);
  if ("generation" in action && action.generation !== state.generation) return state;
  if (action.type === "overview-loading") return { ...state, overview: { status: "loading", value: null, error: null } };
  if (action.type === "overview-ready") return { ...state, overview: { status: "ready", value: action.value, error: null } };
  if (action.type === "overview-failed") return { ...state, overview: { status: "error", value: null, error: action.error } };
  if (action.type === "activity-merge") {
    const page = state.pages.activity;
    const rows = [...page.items, ...action.items];
    const seen = new Set<number>();
    const items = rows.filter((row) => typeof row.sequence === "number" && !seen.has(row.sequence) && !!seen.add(row.sequence))
      .sort((left, right) => left.sequence! - right.sequence!);
    return { ...state, pages: { ...state.pages, activity: { ...page, items } } };
  }
  if (action.type === "page-loading") {
    return {
      ...state,
      pages: {
        ...state.pages,
        [action.tab]: {
          ...state.pages[action.tab],
          status: "loading",
          error: null,
          requestId: action.requestId,
          mediaFilter: action.mediaFilter ?? null,
        },
      },
    };
  }
  if (action.type === "page-failed") {
    const page = state.pages[action.tab];
    if (action.requestId !== page.requestId || (action.mediaFilter ?? null) !== page.mediaFilter) return state;
    return { ...state, pages: { ...state.pages, [action.tab]: { ...state.pages[action.tab], status: "error", error: action.error } } };
  }
  if (action.type === "page-ready") {
    const previous = state.pages[action.tab];
    if (action.requestId !== previous.requestId || (action.mediaFilter ?? null) !== previous.mediaFilter) return state;
    const combined = action.append ? [...previous.items, ...action.page.items] : action.page.items;
    const seen = new Set<string>();
    const unique = combined.filter((row) => {
      const key = identity(row);
      if (key === null || seen.has(key)) return key === null;
      seen.add(key);
      return true;
    });
    const items = action.tab === "activity"
      ? unique.sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0))
      : unique;
    return {
      ...state,
      pages: {
        ...state.pages,
        [action.tab]: {
          status: "ready",
          items,
          nextCursor: action.page.nextCursor,
          error: null,
          requestId: action.requestId,
          mediaFilter: action.mediaFilter ?? null,
        },
      },
    };
  }
  if (action.type === "media-query") {
    return {
      ...state,
      pages: { ...state.pages, media: emptyPage() },
      media: action.query,
      preview: { status: "idle", value: null, error: null, requestId: null },
    };
  }
  if (action.type === "preview-loading") return { ...state, preview: { status: "loading", value: null, error: null, requestId: action.requestId } };
  if ((action.type === "preview-ready" || action.type === "preview-failed") && action.requestId !== state.preview.requestId) return state;
  if (action.type === "preview-ready") return { ...state, preview: { status: "ready", value: action.value, error: null, requestId: action.requestId } };
  if (action.type === "preview-failed") return { ...state, preview: { status: "error", value: null, error: action.error, requestId: action.requestId } };
  return state;
}
