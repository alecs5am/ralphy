/**
 * How a row in the Marketplace names the thing it stands for, and what a filter change clears.
 *
 * A reference is what the install call takes: a model by provider and id, a public item by its
 * source and slug, a pack entry by its pack and entry. None of them is a path -- the main process
 * resolves a reference against the catalog it built, the same way the panel did.
 */
import type { MarketplaceCategory, MarketplaceLocation, MarketplaceQueryState } from "../model/navigation";
import type { MarketplaceBrowseRoute } from "../model/navigation";

export function browseRoute(route: MarketplaceLocation["route"]): MarketplaceBrowseRoute | null {
  return route.kind === "detail" || route.kind === "unavailable-detail" ? null : route;
}

export function modelReference(itemId: string) {
  const match = /^model:(huggingface|civitai|modelscope):(.{1,256})$/.exec(itemId);
  if (!match) return null;
  const provider = match[1] as "huggingface" | "civitai" | "modelscope";
  const id = match[2]!;
  const repositoryId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
  if (provider === "civitai" ? !/^\d{1,12}$/.test(id) : !repositoryId.test(id)) return null;
  return { provider, id };
}

export function publicItemReference(itemId: string) {
  const match = /^(template|recipe):([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/.exec(itemId);
  return match ? { category: match[1] as "template" | "recipe", id: match[2]! } : null;
}

/* Item keys are the detail route's id, so a bundled row is addressed by the
   catalog id it already has, behind a `pack:` prefix that cannot collide with a
   model or public-library key. */
export function packItemReference(itemId: string) {
  /* Slugs are whatever the source called the thing -- a skill folder is kebab,
     an ffmpeg recipe is the camelCase function name -- so the guard bounds the
     charset and the length without assuming a casing convention. */
  const match = /^pack:((?:skill|prompt|template|recipe|component):[A-Za-z0-9][A-Za-z0-9._-]{0,127})$/.exec(itemId);
  return match ? { id: match[1]! } : null;
}

/* The sidebar highlights the shelf a detail came from, and the catalog id says
   which shelf that is without waiting for the catalog to load. */
export function packEntryCategory(packId: string | null): MarketplaceCategory | null {
  const prefix = packId?.split(":")[0];
  if (prefix === "skill") return "skills";
  if (prefix === "prompt") return "prompts";
  if (prefix === "template") return "templates";
  if (prefix === "recipe") return "recipes";
  if (prefix === "component") return "components";
  return null;
}

export function clearedFilters(query: MarketplaceQueryState, category: MarketplaceCategory | "all"): MarketplaceQueryState {
  return {
    ...query,
    filters: {
      category,
      source: "all",
      license: "all",
      compatibility: "all",
      modality: "all",
      format: "all",
    },
  };
}
