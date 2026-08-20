export type AppMode = "work" | "marketplace";
export type MarketplaceCategory = "models" | "templates" | "recipes" | "prompts" | "components" | "skills";
export type MarketplaceLibrarySection = "installed" | "saved" | "added" | "downloads" | "updates" | "attention";
export type MarketplaceBrowseRoute =
  | { kind: "discover" }
  | { kind: "results" }
  | { kind: "category"; category: MarketplaceCategory }
  | { kind: "library"; section: MarketplaceLibrarySection }
  | { kind: "collection" };
export type MarketplaceRoute = MarketplaceBrowseRoute
  | { kind: "detail"; itemId: string }
  | { kind: "unavailable-detail"; category: "prompts" | "components" | "skills" };

export interface MarketplaceFilterState {
  category: MarketplaceCategory | "all";
  source: "all" | "ralphy" | "huggingface" | "civitai" | "modelscope";
  license: "all" | "declared";
  compatibility: "all" | "compatible" | "unknown" | "incompatible";
  modality: "all" | "text" | "image" | "video" | "audio" | "multimodal";
  format: "all" | "gguf" | "safetensors" | "onnx" | "mlx";
}

export interface MarketplaceQueryState {
  text: string;
  filters: MarketplaceFilterState;
  sort: "relevance" | "updated" | "name";
}

interface MarketplaceLocationMemory {
  query: MarketplaceQueryState;
  scrollTop: number;
  focusId: string | null;
}

export type MarketplaceLocation = MarketplaceLocationMemory & (
  | { route: MarketplaceBrowseRoute; selectedItemId: string | null }
  | { route: { kind: "detail"; itemId: string }; selectedItemId: string }
  | { route: { kind: "unavailable-detail"; category: "prompts" | "components" | "skills" }; selectedItemId: null }
);

export const MARKETPLACE_SIDEBAR_WIDTH = 248;

export interface MarketplaceNavigationState {
  mode: AppMode;
  sidebarVisible: boolean;
  location: MarketplaceLocation;
  history: MarketplaceLocation[];
  historyIndex: number;
  workReturnFocusId: string | null;
}

export type MarketplaceMemoryPatch = Partial<Pick<MarketplaceLocationMemory, "query" | "scrollTop" | "focusId">>;

export type MarketplaceNavigationAction =
  | { type: "switch-mode"; mode: AppMode; returnFocusId: string | null }
  | { type: "navigate"; location: MarketplaceLocation }
  | { type: "remember"; patch: MarketplaceMemoryPatch }
  | { type: "select"; itemId: string | null }
  | { type: "back" }
  | { type: "forward" }
  | { type: "toggle-sidebar" };

const STORAGE_KEY = ["ralphy", "marketplace", "navigation", "v1"].join("-");
const MAX_TEXT = 256;
const MAX_SCROLL = 10_000_000;
const MAX_HISTORY = 50;

const categories = ["models", "templates", "recipes", "prompts", "components", "skills"] as const;
const librarySections = ["installed", "saved", "added", "downloads", "updates", "attention"] as const;
const sources = ["all", "ralphy", "huggingface", "civitai", "modelscope"] as const;
const licenses = ["all", "declared"] as const;
const compatibilities = ["all", "compatible", "unknown", "incompatible"] as const;
const modalities = ["all", "text", "image", "video", "audio", "multimodal"] as const;
const formats = ["all", "gguf", "safetensors", "onnx", "mlx"] as const;
const sorts = ["relevance", "updated", "name"] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function boundedId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TEXT;
}

function nullableId(value: unknown): value is string | null {
  return value === null || boundedId(value);
}

function isFilters(value: unknown): value is MarketplaceFilterState {
  const candidate = record(value);
  return candidate !== null
    && exactKeys(candidate, ["category", "source", "license", "compatibility", "modality", "format"])
    && (candidate.category === "all" || oneOf(candidate.category, categories))
    && oneOf(candidate.source, sources)
    && oneOf(candidate.license, licenses)
    && oneOf(candidate.compatibility, compatibilities)
    && oneOf(candidate.modality, modalities)
    && oneOf(candidate.format, formats);
}

function isQuery(value: unknown): value is MarketplaceQueryState {
  const candidate = record(value);
  return candidate !== null
    && exactKeys(candidate, ["text", "filters", "sort"])
    && typeof candidate.text === "string"
    && candidate.text.length <= MAX_TEXT
    && isFilters(candidate.filters)
    && oneOf(candidate.sort, sorts);
}

function isRoute(value: unknown): value is MarketplaceRoute {
  const candidate = record(value);
  if (!candidate || typeof candidate.kind !== "string") return false;
  switch (candidate.kind) {
    case "discover":
    case "results":
    case "collection":
      return exactKeys(candidate, ["kind"]);
    case "category":
      return exactKeys(candidate, ["kind", "category"])
        && oneOf(candidate.category, categories);
    case "library":
      return exactKeys(candidate, ["kind", "section"])
        && oneOf(candidate.section, librarySections);
    case "detail":
      return exactKeys(candidate, ["kind", "itemId"])
        && boundedId(candidate.itemId);
    case "unavailable-detail":
      return exactKeys(candidate, ["kind", "category"])
        && oneOf(candidate.category, ["prompts", "components", "skills"] as const);
    default:
      return false;
  }
}

function isBrowseRoute(route: MarketplaceRoute): route is MarketplaceBrowseRoute {
  return route.kind !== "detail" && route.kind !== "unavailable-detail";
}

export function isMarketplaceLocation(value: unknown): value is MarketplaceLocation {
  const candidate = record(value);
  if (!candidate || !exactKeys(candidate, ["route", "query", "selectedItemId", "scrollTop", "focusId"])) return false;
  if (!isRoute(candidate.route) || !isQuery(candidate.query)) return false;
  if (!Number.isInteger(candidate.scrollTop) || (candidate.scrollTop as number) < 0 || (candidate.scrollTop as number) > MAX_SCROLL) return false;
  if (!nullableId(candidate.focusId)) return false;
  const route = candidate.route;
  if (route.kind === "detail") return candidate.selectedItemId === route.itemId;
  if (route.kind === "unavailable-detail") return candidate.selectedItemId === null;
  return nullableId(candidate.selectedItemId);
}

function initialLocation(): MarketplaceLocation {
  return {
    route: { kind: "discover" },
    query: {
      text: "",
      filters: {
        category: "all",
        source: "all",
        license: "all",
        compatibility: "all",
        modality: "all",
        format: "all",
      },
      sort: "relevance",
    },
    selectedItemId: null,
    scrollTop: 0,
    focusId: null,
  };
}

function initialState(): MarketplaceNavigationState {
  const location = initialLocation();
  return {
    mode: "work",
    sidebarVisible: true,
    location,
    history: [location],
    historyIndex: 0,
    workReturnFocusId: null,
  };
}

function isNavigationState(value: unknown): value is MarketplaceNavigationState {
  const candidate = record(value);
  if (!candidate || !exactKeys(candidate, ["mode", "sidebarVisible", "location", "history", "historyIndex", "workReturnFocusId"])) return false;
  if ((candidate.mode !== "work" && candidate.mode !== "marketplace") || typeof candidate.sidebarVisible !== "boolean") return false;
  if (!isMarketplaceLocation(candidate.location) || !nullableId(candidate.workReturnFocusId)) return false;
  if (!Array.isArray(candidate.history) || candidate.history.length < 1 || candidate.history.length > MAX_HISTORY || !candidate.history.every(isMarketplaceLocation)) return false;
  if (!Number.isInteger(candidate.historyIndex) || (candidate.historyIndex as number) < 0 || (candidate.historyIndex as number) >= candidate.history.length) return false;
  return JSON.stringify(candidate.location) === JSON.stringify(candidate.history[candidate.historyIndex as number]);
}

export function readMarketplaceNavigation(storage: Storage): MarketplaceNavigationState {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null") as unknown;
    return isNavigationState(value) ? value : initialState();
  } catch {
    return initialState();
  }
}

export function writeMarketplaceNavigation(storage: Storage, state: MarketplaceNavigationState): void {
  if (isNavigationState(state)) storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function replaceCurrent(
  state: MarketplaceNavigationState,
  location: MarketplaceLocation,
): MarketplaceNavigationState {
  const history = [...state.history];
  history[state.historyIndex] = location;
  return { ...state, location, history };
}

export function marketplaceReducer(
  state: MarketplaceNavigationState,
  action: MarketplaceNavigationAction,
): MarketplaceNavigationState {
  switch (action.type) {
    case "switch-mode": {
      if (state.mode === action.mode) return state;
      return {
        ...state,
        mode: action.mode,
        workReturnFocusId: action.mode === "marketplace" && nullableId(action.returnFocusId)
          ? action.returnFocusId
          : state.workReturnFocusId,
      };
    }
    case "navigate": {
      if (!isMarketplaceLocation(action.location) || JSON.stringify(action.location) === JSON.stringify(state.location)) return state;
      const history = [...state.history.slice(0, state.historyIndex + 1), action.location].slice(-MAX_HISTORY);
      return { ...state, location: action.location, history, historyIndex: history.length - 1 };
    }
    case "remember": {
      if (Object.keys(action.patch).some((key) => !["query", "scrollTop", "focusId"].includes(key))) return state;
      const location = { ...state.location, ...action.patch } as MarketplaceLocation;
      if (!isMarketplaceLocation(location) || JSON.stringify(location) === JSON.stringify(state.location)) return state;
      return replaceCurrent(state, location);
    }
    case "select": {
      if (!isBrowseRoute(state.location.route) || !nullableId(action.itemId)) return state;
      if (state.location.selectedItemId === action.itemId) return state;
      return replaceCurrent(state, { ...state.location, selectedItemId: action.itemId } as MarketplaceLocation);
    }
    case "back": {
      if (state.historyIndex === 0) return state;
      const historyIndex = state.historyIndex - 1;
      return { ...state, historyIndex, location: state.history[historyIndex] };
    }
    case "forward": {
      if (state.historyIndex >= state.history.length - 1) return state;
      const historyIndex = state.historyIndex + 1;
      return { ...state, historyIndex, location: state.history[historyIndex] };
    }
    case "toggle-sidebar":
      return { ...state, sidebarVisible: !state.sidebarVisible };
  }
}
