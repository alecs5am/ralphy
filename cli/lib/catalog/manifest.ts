// Motion catalog manifest loader + query (#563). Pure, no side effects beyond
// reading `catalog/manifest.json`; `ralphy catalog list` is a thin shell over
// `filterCatalogItems`.

import fs from "node:fs/promises";
import path from "node:path";
import { catalogManifestPath, catalogSourceDir } from "./paths.js";
import {
  CatalogManifestSchema,
  type CatalogEnergy,
  type CatalogItem,
  type CatalogKind,
  type CatalogManifest,
} from "./schema.js";

export async function loadCatalogManifest(manifestPath: string = catalogManifestPath()): Promise<CatalogManifest> {
  const raw = await fs.readFile(manifestPath, "utf-8");
  return CatalogManifestSchema.parse(JSON.parse(raw));
}

export type CatalogFilter = {
  kind?: CatalogKind;
  mood?: string;
  energy?: CatalogEnergy;
  tag?: string;
  sfx?: string;
};

/** AND across facets; `mood` / `tag` match when the item lists the value. */
export function filterCatalogItems(items: CatalogItem[], f: CatalogFilter): CatalogItem[] {
  return items.filter((it) => {
    if (f.kind && it.kind !== f.kind) return false;
    if (f.energy && it.energy !== f.energy) return false;
    if (f.mood && !it.moods.includes(f.mood as CatalogItem["moods"][number])) return false;
    if (f.tag && !it.tags.includes(f.tag)) return false;
    if (f.sfx && !(it.sfx && it.sfx.id.startsWith(`sfx-${f.sfx}-`))) return false;
    return true;
  });
}

/** Compact row for `catalog list` (one line per item in pretty mode). */
export function catalogListRow(it: CatalogItem) {
  return {
    id: it.id,
    kind: it.kind,
    name: it.name,
    energy: it.energy,
    moods: it.moods,
    duration: it.duration,
    sfx: it.sfx?.id ?? null,
    preview: it.preview,
  };
}

export function fragmentPath(it: CatalogItem, sourceDir: string = catalogSourceDir()): string {
  return path.join(sourceDir, it.source);
}

/** Default values of every declared param, keyed by param id. */
export function defaultParams(it: CatalogItem): Record<string, string | number | boolean> {
  return Object.fromEntries(it.params.map((p) => [p.id, p.default]));
}
