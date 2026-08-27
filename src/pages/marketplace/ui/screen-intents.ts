/**
 * Every way to leave where you are in the Marketplace.
 *
 * All six do the same three things -- state the new route, drop the selection, and land focus on
 * the heading -- and two of them first remember the control being left from, so Back returns to
 * the row rather than to the top of a grid. Stating that once is what keeps a seventh destination
 * from forgetting the origin.
 */
import { marketplaceItemDomId } from "./MarketplaceBrowse";
import { marketplaceUnavailableDetailOriginId } from "./MarketplaceUnavailableViews";
import type {
  MarketplaceCategory,
  MarketplaceLocation,
  MarketplaceMemoryPatch,
} from "../model/navigation";

export function marketplaceIntents(
  location: MarketplaceLocation,
  onNavigate: (location: MarketplaceLocation) => void,
  onRememberLocation: (patch: MarketplaceMemoryPatch) => void,
) {
    const openCategory = (category: MarketplaceCategory) => {
      const filters = {
        ...location.query.filters,
        category,
        ...(category === "models" ? {} : { modality: "all" as const, format: "all" as const }),
      };
      onNavigate({
        ...location,
        route: { kind: "category", category },
        query: { ...location.query, filters },
        selectedItemId: null,
        scrollTop: 0,
        focusId: "marketplace-heading",
      });
    };
    const openResults = () => {
      onNavigate({
        ...location,
        route: { kind: "results" },
        selectedItemId: null,
        scrollTop: 0,
        focusId: "marketplace-heading",
      });
    };
    const openUnavailableDetail = (category: "prompts" | "components" | "skills") => {
      onRememberLocation({ focusId: marketplaceUnavailableDetailOriginId(category) });
      onNavigate({
        ...location,
        route: { kind: "unavailable-detail", category },
        selectedItemId: null,
        scrollTop: 0,
        focusId: "marketplace-heading",
      });
    };
    const openCollection = () => {
      onNavigate({ ...location, route: { kind: "collection" }, selectedItemId: null, scrollTop: 0, focusId: "marketplace-heading" });
    };
    const openLibrary = (section: "installed" | "saved" | "added" | "downloads" | "updates" | "attention") => {
      onNavigate({ ...location, route: { kind: "library", section }, selectedItemId: null, scrollTop: 0, focusId: "marketplace-heading" });
    };
    const openItem = (itemId: string) => {
      onRememberLocation({ focusId: marketplaceItemDomId(itemId) });
      onNavigate({
        ...location,
        route: { kind: "detail", itemId },
        selectedItemId: itemId,
        scrollTop: 0,
        focusId: "marketplace-heading",
      });
    };
  return { openCategory, openResults, openUnavailableDetail, openCollection, openLibrary, openItem };
}
