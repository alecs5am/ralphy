// landing/lib/library-v2/index.ts
//
// Library v2 loader — the pure, build-time graph the v2 screens import.
//
// It takes the migrated catalog (./catalog.ts: FORMATS, BLOCKS, UNITS) and
// builds the lookup maps + relation functions the three surfaces need:
//   /library            — the Units feed (FORMATS, fmtCounts, UNITS).
//   /library/u/[id]      — Unit detail (U_BY, BLOCK_BY, applicable).
//   /library/b/[kind]/[id] — block page (unitsUsing, counts).
//
// Pure (no fs, no side effects) — safe to import from a client island or a
// server component alike. The catalog is a static module, so all the maps are
// computed once at module-eval time.

import {
  BLOCKS as BASE_BLOCKS,
  FORMATS,
  UNITS as BASE_UNITS,
} from "./catalog";
import { PUBLISHED_BLOCKS, PUBLISHED_BLUEPRINTS, PUBLISHED_UNITS } from "./published";
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
export { FORMATS } from "./catalog";

// ── Merge: base catalog + published entities ─────────────────────────────────
// The committed catalog (catalog.ts) is the hand-curated migration output; the
// publish script (issue #056) appends to published.ts instead of editing the
// catalog. The loader concatenates both and dedupes by id, with the PUBLISHED
// entry winning on an id clash (a re-publish supersedes a stale catalog entry).
// Everything downstream (the lookup maps below, source.ts's static fallback, and
// the feed) reads the merged result, so published entities surface automatically.

/** Concat two arrays, dedupe by `id`, last-writer-wins. `overrides` win on clash. */
function mergeById<T extends { id: string }>(base: T[], overrides: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of base) byId.set(item.id, item);
  for (const item of overrides) byId.set(item.id, item); // published wins
  return Array.from(byId.values());
}

/** All Units: base catalog merged with published units (published wins by id). */
export const UNITS: Unit[] = mergeById(BASE_UNITS, PUBLISHED_UNITS);

/** Published per-unit Blueprints (#077), deduped by `unitId` (published wins on a
 *  clash). The base catalog ships none today, so this is just the published set;
 *  the dedupe keeps a re-publish idempotent (latest entry replaces the prior one).
 *  Keyed on `unitId` (1:1 with `Unit.id`), not the `id` field `mergeById` expects. */
function mergeByUnitId(...lists: Blueprint[][]): Blueprint[] {
  const byUnit = new Map<string, Blueprint>();
  for (const list of lists) for (const bp of list) byUnit.set(bp.unitId, bp);
  return Array.from(byUnit.values());
}

export const BLUEPRINTS: Blueprint[] = mergeByUnitId(PUBLISHED_BLUEPRINTS);

/** Blueprint lookup by the unit id it reproduces (1:1 with `Unit.id`). */
export const BLUEPRINT_BY: Record<string, Blueprint> = Object.fromEntries(
  BLUEPRINTS.map((bp) => [bp.unitId, bp]),
);

/** All Blocks by kind: base catalog merged with published blocks of each kind. */
export const BLOCKS: BlocksByKind = {
  template: mergeById(
    BASE_BLOCKS.template,
    PUBLISHED_BLOCKS.filter((b) => b.kind === "template"),
  ),
  style: mergeById(
    BASE_BLOCKS.style,
    PUBLISHED_BLOCKS.filter((b) => b.kind === "style"),
  ),
  recipe: mergeById(
    BASE_BLOCKS.recipe,
    PUBLISHED_BLOCKS.filter((b) => b.kind === "recipe"),
  ),
  asset: mergeById(
    BASE_BLOCKS.asset,
    PUBLISHED_BLOCKS.filter((b) => b.kind === "asset"),
  ),
};

/** Format lookup by id. */
export const F_BY: Record<string, Format> = Object.fromEntries(
  FORMATS.map((f) => [f.id, f]),
);

/** Per-kind block index keyed by block id, for O(1) `BLOCK_BY`. */
const BLOCK_INDEX: Record<BlockKind, Record<string, Block>> = {
  template: Object.fromEntries(BLOCKS.template.map((b) => [b.id, b])),
  style: Object.fromEntries(BLOCKS.style.map((b) => [b.id, b])),
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
      case "style":
        return u.styleId === id;
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
} as const;

// Re-export the FormatId-typed format-count helper for callers that want the
// strongly-typed map without the `as const` widening above.
export type { FormatId as _FormatId };
