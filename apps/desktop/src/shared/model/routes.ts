import type { ProjectTab } from "../api/ipc";

/**
 * The route vocabulary layers above `shared` all have to agree on.
 *
 * `ProjectView` was written out twice -- once in the project page's controller and once in the
 * header widget that switches it -- with the same definition and no way for either to know the
 * other had drifted. Neither may import the other: they are the same rank in the layer order.
 * A name two layers share is shared.
 *
 * The project route has no `compositions` tab: compositions are read inside a Unit, so the tab
 * exists in the Core DTO but never as a place the app navigates to.
 */
export type ProjectView = Exclude<ProjectTab, "compositions">;

/**
 * Where the app can be, in the mode that is not the workbench.
 *
 * These were declared inside the Marketplace page, and then read by the sidebar, the island's
 * feed and the instrument route registry -- three places under and beside that page, none of
 * which may import it. A route is not the page's private business: it is the address other
 * layers use to send someone there. The workbench's own routes live beside the store that
 * owns them, in `workbench.ts`.
 */
export type AppMode = "work" | "marketplace";
export const MARKETPLACE_CATEGORIES = ["models", "templates", "recipes", "prompts", "components", "skills"] as const;
export const MARKETPLACE_LIBRARY_SECTIONS = ["installed", "saved", "added", "downloads", "updates", "attention"] as const;
export const MARKETPLACE_UNAVAILABLE_DETAIL_CATEGORIES = ["prompts", "components", "skills"] as const;
export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];
export type MarketplaceLibrarySection = (typeof MARKETPLACE_LIBRARY_SECTIONS)[number];
export type MarketplaceBrowseRoute =
  | { kind: "discover" }
  | { kind: "results" }
  | { kind: "category"; category: MarketplaceCategory }
  | { kind: "library"; section: MarketplaceLibrarySection }
  | { kind: "collection" };
export type MarketplaceRoute = MarketplaceBrowseRoute
  | { kind: "detail"; itemId: string }
  | { kind: "unavailable-detail"; category: (typeof MARKETPLACE_UNAVAILABLE_DETAIL_CATEGORIES)[number] };

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
  | { route: { kind: "unavailable-detail"; category: (typeof MARKETPLACE_UNAVAILABLE_DETAIL_CATEGORIES)[number] }; selectedItemId: null }
);
