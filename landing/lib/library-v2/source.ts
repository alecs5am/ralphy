// landing/lib/library-v2/source.ts
//
// Library v2 data adapter — the single async API the v2 screens import.
//
// Static-only: every getter resolves from the committed `./library.json` graph
// (via ./index.ts). The Supabase Postgres backend was retired (June 2026) — the
// whole library now lives in one local JSON file, served to the CLI from Bunny
// CDN. There is no env switch and no network read; these functions stay `async`
// only to preserve the call sites (the screens `await` them) and to leave room
// for a future remote source without touching every page.
//
// Server-safe data functions (intended for Server Components). They do not touch
// node:fs.

import {
  applicable as staticApplicable,
  BLOCK_BY as staticBlockBy,
  BLOCKS as STATIC_BLOCKS,
  BLUEPRINT_BY as STATIC_BLUEPRINT_BY,
  counts as staticCounts,
  F_BY as STATIC_F_BY,
  fmtCounts as staticFmtCounts,
  FORMATS as STATIC_FORMATS,
  U_BY as STATIC_U_BY,
  UNITS as STATIC_UNITS,
  unitsUsing as staticUnitsUsing,
} from "./index";
import type {
  AssetSub,
  Block,
  BlockKind,
  Blueprint,
  FmtCounts,
  Format,
  FormatId,
  Unit,
} from "./types";

// ── Public API (resolves from the committed library.json graph) ───────────────

/** All eight media formats. */
export async function getFormats(): Promise<Format[]> {
  return STATIC_FORMATS;
}

/** Blocks of one kind, or every block flattened when no kind is given. */
export async function getBlocks(kind?: BlockKind): Promise<Block[]> {
  if (kind) return STATIC_BLOCKS[kind];
  return [...STATIC_BLOCKS.template, ...STATIC_BLOCKS.recipe, ...STATIC_BLOCKS.asset];
}

/** Units, optionally filtered by format. library.json is stored newest-first, so
 *  the feed order is preserved without a re-sort. */
export async function getUnits(filter?: { format?: FormatId }): Promise<Unit[]> {
  if (filter?.format) return STATIC_UNITS.filter((u) => u.format === filter.format);
  return STATIC_UNITS;
}

/** A single Unit by id, or undefined. */
export async function getUnit(id: string): Promise<Unit | undefined> {
  return STATIC_U_BY[id];
}

/** The per-unit Blueprint (#074) — the full reproduction recipe for one Unit,
 *  or undefined when the unit has no published Blueprint. */
export async function getBlueprint(unitId: string): Promise<Blueprint | undefined> {
  return STATIC_BLUEPRINT_BY[unitId];
}

/** A single Block by (kind, id), or undefined. */
export async function getBlock(
  kind: BlockKind,
  id: string,
): Promise<Block | undefined> {
  return staticBlockBy(kind, id);
}

/** Units whose provenance includes the given block (or `format` match). */
export async function unitsUsing(
  kind: BlockKind | "format",
  id: string,
): Promise<Unit[]> {
  return staticUnitsUsing(kind, id);
}

/** Swap menu — other blocks of the same kind / same asset sub that fit a slot. */
export async function applicable(
  kind: BlockKind,
  unit?: Unit,
  currentId?: string,
  sub?: AssetSub,
): Promise<Block[]> {
  return staticApplicable(kind, unit, currentId, sub);
}

/** Unit-count per block of a kind, keyed by block id — for menu badges. */
export async function counts(kind: BlockKind): Promise<Record<string, number>> {
  return staticCounts(kind);
}

/** Unit-count per format, for the format cards. */
export async function fmtCounts(): Promise<FmtCounts> {
  return staticFmtCounts;
}

/** Format lookup by id (sync; taxonomy is fixed). */
export function formatById(id: string): Format | undefined {
  return STATIC_F_BY[id];
}
