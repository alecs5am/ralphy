/**
 * The Marketplace's route vocabulary, and the instrument states that follow from it.
 *
 * Every route the section can be at is enumerated here rather than derived at render time, because
 * the screenshot harness renders each one in each of its states -- a route that exists but is not
 * listed is a route nobody looks at again.
 */
import { defineInstrumentScreenStates } from "@/shared/instrument/screen-state-registry";

import { marketplaceDetailInstrumentStates, marketplaceInstalledInstrumentStates } from "./MarketplaceModelViews";
import {
  MARKETPLACE_LIBRARY_SECTIONS,
  MARKETPLACE_UNAVAILABLE_DETAIL_CATEGORIES,
  type MarketplaceCategory,
} from "../model/navigation";

import { categoryLabels } from "./browse-discover";


const marketplaceBaseInstrumentStates = [
  ["discover", "Marketplace", ["loading", "error", "partial", "ready"]],
  ["results", "Search results", ["loading", "error", "partial", "empty", "ready"]],
  ["collection", "Collection", ["loading", "error", "unavailable"]],
] as const;
export const MARKETPLACE_BASE_ROUTE_KINDS = [...marketplaceBaseInstrumentStates.map(([route]) => route), "detail"] as const;
export const MARKETPLACE_CATEGORY_ROUTE_VALUES = Object.keys(categoryLabels) as MarketplaceCategory[];
export const MARKETPLACE_LIBRARY_ROUTE_VALUES = MARKETPLACE_LIBRARY_SECTIONS;
export const MARKETPLACE_UNAVAILABLE_DETAIL_ROUTE_VALUES = MARKETPLACE_UNAVAILABLE_DETAIL_CATEGORIES;

export const marketplaceInstrumentStates = [
  ...marketplaceBaseInstrumentStates.map(([route, title, states]) => defineInstrumentScreenStates({
    routeKey: `marketplace.${route}`,
    states,
    rootMarker: `marketplace-${route}`,
    landmarks: [title, "Marketplace"],
  } as const)),
  marketplaceDetailInstrumentStates,
  ...MARKETPLACE_CATEGORY_ROUTE_VALUES.map((category) => defineInstrumentScreenStates({
    routeKey: `marketplace.category.${category}`,
    /* These three are stocked by the bundled catalog, so they reach "ready" like
       any other shelf -- and keep "unavailable" for a build that ships no pack. */
    states: category === "prompts" || category === "components" || category === "skills"
      ? ["loading", "error", "partial", "empty", "unavailable", "ready"]
      : ["loading", "error", "partial", "empty", "ready"],
    rootMarker: `marketplace-category-${category}`,
    landmarks: [categoryLabels[category], "Marketplace"],
  } as const)),
  marketplaceInstalledInstrumentStates,
  ...MARKETPLACE_LIBRARY_ROUTE_VALUES.filter((section) => section !== "installed").map((section) => defineInstrumentScreenStates({
    routeKey: `marketplace.library.${section}`,
    states: ["unavailable"],
    rootMarker: `marketplace-library-${section}`,
    landmarks: [section === "attention" ? "Needs attention" : `${section[0].toLocaleUpperCase()}${section.slice(1)}`, "My Library"],
  } as const)),
  ...MARKETPLACE_UNAVAILABLE_DETAIL_ROUTE_VALUES.map((category) => defineInstrumentScreenStates({
    routeKey: `marketplace.unavailable-detail.${category}`,
    states: ["unavailable"],
    rootMarker: `marketplace-unavailable-detail-${category}`,
    landmarks: [categoryLabels[category], "Marketplace"],
  } as const)),
];

/* A bundled row reviews through the workflow its category already had -- the
   shelf changed where the item comes from, not what installing one would mean. */
