// landing/lib/library-v2/index.ts
//
// Library v2 loader — the pure, build-time graph the v2 screens import.
//
// Source of truth: the committed `./library.json` (the single local content
// store, served to the CLI from Bunny CDN). The old Supabase Postgres backend +
// the hand-curated `catalog.ts` / append-only `published.ts` TS mirrors were
// retired in favour of this one JSON file — no DB, no env, no vendor limits. The
// publish path (`scripts/publish-entity.ts`) edits `library.json` in place.
//
// This module builds the lookup maps + relation functions the three surfaces need:
//   /library            — the Units feed (FORMATS, fmtCounts, UNITS).
//   /library/u/[id]      — Unit detail (U_BY, BLOCK_BY, applicable).
//   /library/b/[kind]/[id] — block page (unitsUsing, counts).
//
// Pure (no fs, no side effects) — safe to import from a client island or a
// server component alike. The JSON is a static module, so all the maps are
// computed once at module-eval time.

import libraryData from "./library.json";
import type {
  ApplicableFn,
  Block,
  BlockKind,
  BlocksByKind,
  Blueprint,
  CountsFn,
  FmtCounts,
  Format,
  FormatId,
  Unit,
  UnitsUsingFn,
} from "./types";

export type {
  ApplicableFn,
  AssetSub,
  Block,
  BlockKind,
  BlocksByKind,
  Blueprint,
  CountsFn,
  FmtCounts,
  Format,
  FormatId,
  Unit,
  UnitMedia,
  UnitsUsingFn,
} from "./types";

// ── The committed library.json graph ─────────────────────────────────────────
// One flat store: { schemaVersion, formats, units, blocks (flat, each carries
// `kind`), blueprints }. We narrow the JSON-inferred types back to the canonical
// entity shapes from ./types — the file is generated/edited only via the publish
// path, so the cast is safe and keeps the inferred union types from leaking out.

interface LibraryFile {
  schemaVersion: number;
  formats: Format[];
  units: Unit[];
  blocks: Block[];
  blueprints: Blueprint[];
}

const DATA = libraryData as unknown as LibraryFile;

/** The eight media formats (fixed taxonomy, shipped in library.json). */
export const FORMATS: Format[] = DATA.formats;

/** All Units. */
export const UNITS: Unit[] = DATA.units;

/** All Blueprints (#077), 1:1 with a Unit via `unitId`. */
export const BLUEPRINTS: Blueprint[] = DATA.blueprints;

/** Blueprint lookup by the unit id it reproduces (1:1 with `Unit.id`). */
export const BLUEPRINT_BY: Record<string, Blueprint> = Object.fromEntries(
  BLUEPRINTS.map((bp) => [bp.unitId, bp]),
);

/** All Blocks grouped by kind. (The former `style` kind is gone — the look is
 *  now a unit Tag.) The store holds a single flat Block[]; we partition it here. */
export const BLOCKS: BlocksByKind = {
  template: DATA.blocks.filter((b) => b.kind === "template"),
  recipe: DATA.blocks.filter((b) => b.kind === "recipe"),
  asset: DATA.blocks.filter((b) => b.kind === "asset"),
};

/** Format lookup by id. */
export const F_BY: Record<string, Format> = Object.fromEntries(
  FORMATS.map((f) => [f.id, f]),
);

/** Per-kind block index keyed by block id, for O(1) `BLOCK_BY`. */
const BLOCK_INDEX: Record<BlockKind, Record<string, Block>> = {
  template: Object.fromEntries(BLOCKS.template.map((b) => [b.id, b])),
  recipe: Object.fromEntries(BLOCKS.recipe.map((b) => [b.id, b])),
  asset: Object.fromEntries(BLOCKS.asset.map((b) => [b.id, b])),
};

/** A single block by (kind, id), or undefined when not in the catalog. */
export function BLOCK_BY(kind: BlockKind, id: string): Block | undefined {
  return BLOCK_INDEX[kind]?.[id];
}

/** Unit lookup by id. */
export const U_BY: Record<string, Unit> = Object.fromEntries(
  UNITS.map((u) => [u.id, u]),
);

/** Units whose provenance includes the given block. The synthetic `"format"`
 *  kind matches by Unit.format, used to compute the format-card counts. */
export const unitsUsing: UnitsUsingFn = (kind, id) =>
  UNITS.filter((u) => {
    switch (kind) {
      case "template":
        return u.templateId === id;
      case "recipe":
        return u.recipeIds.includes(id);
      case "asset":
        return u.assetIds.includes(id);
      case "format":
        return u.format === id;
      default:
        return false;
    }
  });

/** Other blocks of the same kind that fit a slot on a unit — the swap menu.
 *  For assets, fit = same `sub` (swap a location for a location). `currentId`,
 *  when given, is excluded. `unit` is accepted for parity with the prototype
 *  signature and for future unit-scoped filtering; the current fit rule is
 *  kind-/sub-only. */
export const applicable: ApplicableFn = (kind, _unit, currentId, sub) => {
  if (kind === "asset") {
    const resolvedSub =
      sub ?? (currentId ? BLOCK_BY("asset", currentId)?.sub : undefined);
    return BLOCKS.asset.filter(
      (a) => (resolvedSub ? a.sub === resolvedSub : true) && a.id !== currentId,
    );
  }
  return BLOCKS[kind].filter((b) => b.id !== currentId);
};

/** Unit-count per block of a kind, keyed by block id — for menu badges. */
export const counts: CountsFn = (kind) => {
  const m: Record<string, number> = {};
  for (const b of BLOCKS[kind]) m[b.id] = unitsUsing(kind, b.id).length;
  return m;
};

/** Unit-count per format, for the format cards. Computed once. */
export const fmtCounts: FmtCounts = Object.fromEntries(
  FORMATS.map((f) => [f.id, unitsUsing("format", f.id).length]),
) as FmtCounts;

// ── Tags facet (#082) ────────────────────────────────────────────────────────
// A Tag is a filter-only unit label (NOT a block, no detail page). The feed
// filtering (#084) needs the distinct tags across all units with their unit
// counts. Pure derivation from `Unit.tags` — no fetch, computed once at
// module-eval, mirroring how block kinds are exposed via `counts`/`BLOCKS`.

/** One tag facet entry: the tag string + how many units carry it. */
export interface TagFacet {
  tag: string;
  count: number;
}

/** Distinct unit tags across all units, with per-tag unit counts, sorted by
 *  count desc then tag asc (stable, deterministic). */
export const TAGS: TagFacet[] = (() => {
  const m = new Map<string, number>();
  for (const u of UNITS) {
    for (const t of u.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
})();

/** Units carrying the given tag — the feed's tag filter. */
export const unitsWithTag = (tag: string): Unit[] =>
  UNITS.filter((u) => (u.tags ?? []).includes(tag));

/** The full v2 graph, mirroring the prototype's `window.RX` surface so a screen
 *  can destructure one import. */
export const RX = {
  FORMATS,
  F_BY,
  BLOCKS,
  BLOCK_BY,
  UNITS,
  U_BY,
  BLUEPRINTS,
  BLUEPRINT_BY,
  unitsUsing,
  applicable,
  counts,
  fmtCounts,
  TAGS,
  unitsWithTag,
} as const;

// Re-export the FormatId-typed format-count helper for callers that want the
// strongly-typed map without the `as const` widening above.
export type { FormatId as _FormatId };
