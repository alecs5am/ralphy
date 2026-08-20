import { useEffect, useRef } from "react";
import { SelectMenu, type SelectMenuOption } from "../components/ui/SelectMenu";
import type { CatalogResult } from "../lib/ipc";
import {
  type MarketplaceCategory,
  type MarketplaceLocation,
  type MarketplaceMemoryPatch,
} from "../state/marketplace-navigation";

export interface MarketplaceScreenProps {
  catalog: CatalogResult | null;
  location: MarketplaceLocation;
  sidebarVisible: boolean;
  onNavigate(location: MarketplaceLocation): void;
  onRememberLocation(patch: MarketplaceMemoryPatch): void;
}

const categoryLabels: Record<MarketplaceCategory, string> = {
  models: "Models",
  templates: "Templates",
  recipes: "Recipes",
  prompts: "Prompts",
  components: "Components & Effects",
  skills: "Skills",
};
const categoryOptions = Object.entries(categoryLabels).map(([value, label]) => ({
  value: value as MarketplaceCategory,
  label,
})) satisfies Array<SelectMenuOption<MarketplaceCategory>>;

function title(location: MarketplaceLocation): string {
  const route = location.route;
  if (route.kind === "discover") return "Discover";
  if (route.kind === "results") return "Search results";
  if (route.kind === "category" || route.kind === "unavailable-detail") return categoryLabels[route.category];
  if (route.kind === "library") return route.section === "attention" ? "Needs attention" : `${route.section[0].toLocaleUpperCase()}${route.section.slice(1)}`;
  if (route.kind === "collection") return "Collection";
  return "Item details";
}

export function MarketplaceScreen({
  catalog,
  location,
  sidebarVisible,
  onNavigate,
  onRememberLocation,
}: MarketplaceScreenProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: location.scrollTop });
  }, [location.route]);

  const openCategory = (category: MarketplaceCategory) => {
    onNavigate({
      ...location,
      route: { kind: "category", category },
      query: { ...location.query, filters: { ...location.query.filters, category } },
      selectedItemId: null,
      scrollTop: 0,
      focusId: null,
    });
  };
  const selectedCategory = location.route.kind === "category"
    ? location.route.category
    : location.query.filters.category === "all" ? "models" : location.query.filters.category;
  const targetMessage = catalog === null
    ? "Workspace targets are unavailable until the home library reconnects."
    : catalog.workspaces.length + catalog.projects.length === 0
      ? "No workspace or project targets are available in the current home library."
      : "Workspace targets are available for supported reviews.";

  return (
    <main className="marketplace-screen main-region" data-sidebar-visible={sidebarVisible ? "true" : "false"}>
      <header className="marketplace-task-one-header">
        <span>Marketplace</span>
        {!sidebarVisible && (
          <div className="marketplace-header-category-menu">
            <span>Marketplace category</span>
            <SelectMenu
              ariaLabel="Marketplace category"
              className="marketplace-category-select"
              value={selectedCategory}
              options={categoryOptions}
              align="end"
              onValueChange={openCategory}
            />
          </div>
        )}
      </header>
      <div
        className="marketplace-task-one-scroll"
        ref={scrollRef}
        onScroll={(event) => onRememberLocation({ scrollTop: event.currentTarget.scrollTop })}
      >
        <div className="marketplace-task-one-intro">
          <p>Discover</p>
          <h1 id="marketplace-heading" tabIndex={-1}>{title(location)}</h1>
          <p>Browse Models, Templates, and Recipes from their current sources.</p>
          <p>{targetMessage}</p>
        </div>
      </div>
    </main>
  );
}
