import type { MarketplaceItemPresentation } from "./presentation-types";
import { studioCatalog } from "./studio-catalog";

/** Explicit references define a template; tag similarity is only for discovery. */
export function templateModules(item: MarketplaceItemPresentation, items: readonly MarketplaceItemPresentation[] = []) {
  const catalog = new Map([...studioCatalog(), ...items].map((entry) => [entry.key, entry]));
  return (item.studio?.modules ?? []).map((module) => ({ ...module, item: catalog.get(module.key) }));
}
