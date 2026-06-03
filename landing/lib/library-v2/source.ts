// landing/lib/library-v2/source.ts
//
// Library v2 data adapter — the single async API the v2 screens import.
//
// Backend-agnostic: if NEXT_PUBLIC_SUPABASE_URL AND NEXT_PUBLIC_SUPABASE_ANON_KEY are
// set, the functions read from Supabase (via @supabase/supabase-js); otherwise they
// fall back to the committed static catalog (./index.ts). Both paths return the SAME
// shapes, so screens never know which store is live. The static fallback is the
// default — open source, no credentials needed.
//
// These are server-safe data functions (intended for Server Components). They do not
// touch node:fs and never import the seed script.

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
import { PUBLISHED_UNITS } from "./published";

// Feed order = newest-published first. `published.ts` appends on every publish
// (newest last), so a higher index = more recently published. We rank by that
// index and sort published units to the front (newest → oldest); catalog units
// (not in PUBLISHED_UNITS) keep their order after, via stable sort. Using the
// publish index rather than `date` because freshly published units carry a null
// date and would otherwise sink to the bottom.
const PUBLISH_RANK = new Map(PUBLISHED_UNITS.map((u, i) => [u.id, i]));
function newestFirst(units: Unit[]): Unit[] {
  return units
    .slice()
    .sort((a, b) => (PUBLISH_RANK.get(b.id) ?? -1) - (PUBLISH_RANK.get(a.id) ?? -1));
}
import type {
  AssetSub,
  Block,
  BlockKind,
  Blueprint,
  FmtCounts,
  Format,
  FormatId,
  Unit,
  UnitMedia,
} from "./types";

// ── Backend selection ──────────────────────────────────────────────────────

function supabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && url.length > 0 && anonKey && anonKey.length > 0) {
    return { url, anonKey };
  }
  return null;
}

/** True when the Supabase backend should serve reads. */
export function isSupabaseBacked(): boolean {
  return supabaseConfig() !== null;
}

// A minimal Supabase client, created lazily and cached. Import is dynamic so the
// dep is only pulled when creds exist (the open-source default never loads it).
type SupabaseClientLike = {
  from: (table: string) => {
    select: (cols?: string) => Promise<{ data: unknown[] | null; error: unknown }> & {
      eq: (col: string, val: unknown) => Promise<{ data: unknown[] | null; error: unknown }>;
    };
  };
};

let clientPromise: Promise<SupabaseClientLike> | null = null;

async function getClient(): Promise<SupabaseClientLike> {
  const cfg = supabaseConfig();
  if (!cfg) throw new Error("Supabase is not configured");
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }) as unknown as SupabaseClientLike,
    );
  }
  return clientPromise;
}

// ── Row → domain mappers ──────────────────────────────────────────────────────

interface BlockRow {
  id: string;
  kind: BlockKind;
  name: string;
  blurb: string | null;
  sub: AssetSub | null;
  refs: string[] | null;
}

interface UnitRow {
  id: string;
  format: FormatId;
  title: string;
  blurb: string | null;
  date: string | null;
  media: UnitMedia[] | null;
  media_count: number;
  hero: boolean;
}

interface UnitBlockRow {
  unit_id: string;
  block_id: string;
  role: BlockKind;
  position: number;
}

function toBlock(r: BlockRow): Block {
  const b: Block = {
    kind: r.kind,
    id: r.id,
    name: r.name,
    blurb: r.blurb ?? "",
    refs: r.refs ?? [],
  };
  if (r.sub) b.sub = r.sub;
  return b;
}

function toUnit(u: UnitRow, comp: Map<string, UnitBlockRow[]>): Unit {
  const rows = (comp.get(u.id) ?? []).sort((a, b) => a.position - b.position);
  const templateId = rows.find((r) => r.role === "template")?.block_id ?? "";
  const styleId = rows.find((r) => r.role === "style")?.block_id ?? "";
  const recipeIds = rows.filter((r) => r.role === "recipe").map((r) => r.block_id);
  const assetIds = rows.filter((r) => r.role === "asset").map((r) => r.block_id);
  const unit: Unit = {
    id: u.id,
    format: u.format,
    title: u.title,
    blurb: u.blurb ?? "",
    templateId,
    styleId,
    recipeIds,
    assetIds,
    mediaCount: u.media_count,
    media: u.media ?? [],
  };
  if (u.date) unit.date = u.date;
  if (u.hero) unit.hero = u.hero;
  return unit;
}

// ── Supabase graph fetch (cached per request module-eval) ──────────────────────

interface Graph {
  formats: Format[];
  blocksByKind: Record<BlockKind, Block[]>;
  units: Unit[];
}

let graphPromise: Promise<Graph> | null = null;

async function loadGraph(): Promise<Graph> {
  if (graphPromise) return graphPromise;
  graphPromise = (async () => {
    const client = await getClient();
    const [blocksRes, unitsRes, compRes] = await Promise.all([
      client.from("blocks").select("*"),
      client.from("units").select("*"),
      client.from("unit_blocks").select("*"),
    ]);
    if (blocksRes.error) throw blocksRes.error;
    if (unitsRes.error) throw unitsRes.error;
    if (compRes.error) throw compRes.error;

    const blockRows = (blocksRes.data ?? []) as BlockRow[];
    const unitRows = (unitsRes.data ?? []) as UnitRow[];
    const compRows = (compRes.data ?? []) as UnitBlockRow[];

    const comp = new Map<string, UnitBlockRow[]>();
    for (const r of compRows) {
      const list = comp.get(r.unit_id) ?? [];
      list.push(r);
      comp.set(r.unit_id, list);
    }

    const blocksByKind: Record<BlockKind, Block[]> = {
      template: [],
      style: [],
      recipe: [],
      asset: [],
    };
    for (const r of blockRows) blocksByKind[r.kind]?.push(toBlock(r));

    // Formats are fixed taxonomy — they live in the catalog, not the DB.
    return {
      formats: STATIC_FORMATS,
      blocksByKind,
      units: unitRows.map((u) => toUnit(u, comp)),
    };
  })();
  return graphPromise;
}

// ── Relation helpers shared by both backends ───────────────────────────────────

function unitsUsingIn(units: Unit[], kind: BlockKind | "format", id: string): Unit[] {
  return units.filter((u) => {
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
}

function applicableIn(
  blocksByKind: Record<BlockKind, Block[]>,
  blockBy: (kind: BlockKind, id: string) => Block | undefined,
  kind: BlockKind,
  currentId?: string,
  sub?: AssetSub,
): Block[] {
  if (kind === "asset") {
    const resolvedSub =
      sub ?? (currentId ? blockBy("asset", currentId)?.sub : undefined);
    return blocksByKind.asset.filter(
      (a) => (resolvedSub ? a.sub === resolvedSub : true) && a.id !== currentId,
    );
  }
  return blocksByKind[kind].filter((b) => b.id !== currentId);
}

// ── Public API (identical shapes on both backends) ────────────────────────────

/** All eight media formats. */
export async function getFormats(): Promise<Format[]> {
  if (!isSupabaseBacked()) return STATIC_FORMATS;
  return (await loadGraph()).formats;
}

/** Blocks of one kind, or every block flattened when no kind is given. */
export async function getBlocks(kind?: BlockKind): Promise<Block[]> {
  if (!isSupabaseBacked()) {
    if (kind) return STATIC_BLOCKS[kind];
    return [
      ...STATIC_BLOCKS.template,
      ...STATIC_BLOCKS.style,
      ...STATIC_BLOCKS.recipe,
      ...STATIC_BLOCKS.asset,
    ];
  }
  const g = await loadGraph();
  if (kind) return g.blocksByKind[kind];
  return [
    ...g.blocksByKind.template,
    ...g.blocksByKind.style,
    ...g.blocksByKind.recipe,
    ...g.blocksByKind.asset,
  ];
}

/** Units, optionally filtered by format. */
export async function getUnits(filter?: { format?: FormatId }): Promise<Unit[]> {
  const all = newestFirst(isSupabaseBacked() ? (await loadGraph()).units : STATIC_UNITS);
  if (filter?.format) return all.filter((u) => u.format === filter.format);
  return all;
}

/** A single Unit by id, or undefined. */
export async function getUnit(id: string): Promise<Unit | undefined> {
  if (!isSupabaseBacked()) return STATIC_U_BY[id];
  return (await loadGraph()).units.find((u) => u.id === id);
}

/** The per-unit Blueprint (#074) — the full reproduction recipe for one Unit,
 *  or undefined when the unit has no published Blueprint yet (the default today:
 *  0 published, backfill is #081). The static catalog is the spec-critical path.
 *
 *  Supabase backend: the `blueprints` table is not yet seeded (#081) and a faithful
 *  fetch (one row keyed by `unitId`, JSON-decoded into the six axes) is non-trivial
 *  relative to the zero-row payoff, so we serve the static lookup on both backends
 *  for now and leave the wiring as a follow-up.
 *  // TODO(#078): supabase blueprints fetch when the table is seeded (#081). */
export async function getBlueprint(unitId: string): Promise<Blueprint | undefined> {
  return STATIC_BLUEPRINT_BY[unitId];
}

/** A single Block by (kind, id), or undefined. */
export async function getBlock(
  kind: BlockKind,
  id: string,
): Promise<Block | undefined> {
  if (!isSupabaseBacked()) return staticBlockBy(kind, id);
  const g = await loadGraph();
  return g.blocksByKind[kind].find((b) => b.id === id);
}

/** Units whose provenance includes the given block (or `format` match). */
export async function unitsUsing(
  kind: BlockKind | "format",
  id: string,
): Promise<Unit[]> {
  if (!isSupabaseBacked()) return staticUnitsUsing(kind, id);
  return unitsUsingIn((await loadGraph()).units, kind, id);
}

/** Swap menu — other blocks of the same kind / same asset sub that fit a slot. */
export async function applicable(
  kind: BlockKind,
  unit?: Unit,
  currentId?: string,
  sub?: AssetSub,
): Promise<Block[]> {
  if (!isSupabaseBacked()) return staticApplicable(kind, unit, currentId, sub);
  const g = await loadGraph();
  const blockBy = (k: BlockKind, id: string) =>
    g.blocksByKind[k].find((b) => b.id === id);
  return applicableIn(g.blocksByKind, blockBy, kind, currentId, sub);
}

/** Unit-count per block of a kind, keyed by block id — for menu badges. */
export async function counts(kind: BlockKind): Promise<Record<string, number>> {
  if (!isSupabaseBacked()) return staticCounts(kind);
  const g = await loadGraph();
  const m: Record<string, number> = {};
  for (const b of g.blocksByKind[kind]) {
    m[b.id] = unitsUsingIn(g.units, kind, b.id).length;
  }
  return m;
}

/** Unit-count per format, for the format cards. */
export async function fmtCounts(): Promise<FmtCounts> {
  if (!isSupabaseBacked()) return staticFmtCounts;
  const g = await loadGraph();
  return Object.fromEntries(
    g.formats.map((f) => [f.id, unitsUsingIn(g.units, "format", f.id).length]),
  ) as FmtCounts;
}

/** Format lookup by id (sync; taxonomy is fixed on both backends). */
export function formatById(id: string): Format | undefined {
  return STATIC_F_BY[id];
}
