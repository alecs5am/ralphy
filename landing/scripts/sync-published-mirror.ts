// landing/scripts/sync-published-mirror.ts
//
// Regenerate the committed open-source mirror `lib/library-v2/published.ts` from
// the LIVE Supabase DB (issue #098). A read-only "full dump": it pulls the WHOLE
// library graph (every unit, every block of every kind, every blueprint) and
// rewrites the three sentinel-bounded exported arrays in published.ts in place.
//
// WHY: `source.ts` reads the live DB when the Supabase env is set (prod), and only
// falls back to `published.ts` when it is NOT (an open-source clone with no creds,
// some CI). When this mirror drifts from the live DB, those offline builds show a
// stale, undersized library. This script brings the mirror back in sync.
//
// READ-ONLY: it SELECTs from Supabase and rewrites ONE local file. It never
// upserts a row, never uploads to Storage, never deploys. The inverse direction
// (local -> DB) is `publish-entity.ts --push`; this is DB -> local only.
//
// REUSE, not duplicate: the sentinel splice (`readPublishedRegions` /
// `renderPublished`), the local-path leak guard (`looksLocal` /
// `assertNoLocalPaths`), and the target path (`PUBLISHED_TS`) are all imported
// from publish-entity.ts so "what we write" and "how we refuse a leak" can never
// drift between the two scripts.
//
// LIVE READ PATH: the source.ts adapter activates only when
// NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY are both set, and its
// `toBlock` mapper drops the enriched-recipe `data` jsonb (body/artifact/params/
// demo) while `getBlueprint` is hardcoded to the static catalog. To produce a
// FAITHFUL, COMPLETE mirror we read directly over `SUPABASE_DB_URL` (the same DSN
// publish-entity.ts uses for its upserts) and reconstruct the exact domain shapes
// from lib/library-v2/types.ts. The issue (#098) sanctions the SUPABASE_DB_URL
// read path explicitly.
//
// Run (dry-run, prints counts, writes nothing):
//   cd landing && bun run scripts/sync-published-mirror.ts --dry-run
// Run (rewrite published.ts in place):
//   cd landing && bun run scripts/sync-published-mirror.ts
//
// Env: loads landing/.env.local automatically (so SUPABASE_DB_URL is present),
// the same file the runtime reads. The script FAILS LOUDLY if the live path
// cannot be reached — it never silently dumps the static fallback back into itself.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  AssetSub,
  Block,
  BlockKind,
  BlockRecipeDemo,
  Blueprint,
  RecipeKind,
  Unit,
  UnitMedia,
} from "../lib/library-v2/types";
import {
  assertNoLocalPaths,
  PUBLISHED_TS,
  readPublishedRegions,
  renderPublished,
} from "./publish-entity";

// ── Env loading ────────────────────────────────────────────────────────────────
//
// Neither publish-entity.ts nor seed-supabase.ts loads a dotenv file — they rely
// on the shell exporting the vars. For a maintainer convenience (and so a bare
// `bun run scripts/sync-published-mirror.ts` works), load landing/.env.local here
// without a dependency: a tiny KEY=VALUE parser that never overrides a var the
// shell already set. Only well-formed lines are taken; comments / blanks ignored.

const __dirname_ = resolve(fileURLToPath(import.meta.url), "..");
const LANDING_ROOT = resolve(__dirname_, "..");

function loadDotEnvLocal(): void {
  const envPath = join(LANDING_ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key]) continue; // never override an already-set shell var
    process.env[key] = m[2].replace(/^["']|["']$/g, "");
  }
}

// ── Args ─────────────────────────────────────────────────────────────────────

interface Args {
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { dryRun: false };
  for (const a of argv) {
    if (a === "--dry-run") out.dryRun = true;
  }
  return out;
}

// ── DB read (read-only SELECTs over SUPABASE_DB_URL) ─────────────────────────────

interface UnitRowDb {
  id: string;
  format: Unit["format"];
  title: string;
  blurb: string | null;
  date: string | null;
  media: UnitMedia[] | null;
  media_count: number;
  hero: boolean;
  tags: string[] | null;
}

interface BlockRowDb {
  id: string;
  kind: BlockKind;
  name: string;
  blurb: string | null;
  sub: AssetSub | null;
  refs: string[] | null;
  recipe_kind: RecipeKind | null;
  /** Enriched-recipe payload (#082): { body?, artifact?, params?, demo? }. */
  data: {
    body?: string;
    artifact?: string;
    params?: Record<string, unknown>;
    demo?: BlockRecipeDemo;
  } | null;
}

interface UnitBlockRowDb {
  unit_id: string;
  block_id: string;
  role: BlockKind;
  position: number;
}

interface BlueprintRowDb {
  unit_id: string;
  data: Blueprint;
}

interface LiveGraph {
  units: Unit[];
  blocks: Block[];
  blueprints: Blueprint[];
}

/** Run a fn with a connected pg client over SUPABASE_DB_URL, always closing it.
 *  Fails loudly when the DSN is absent — never falls through to a static dump. */
async function withDb<T>(
  fn: (q: <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: R[] }>) => Promise<T>,
): Promise<T> {
  const dsn = process.env.SUPABASE_DB_URL;
  if (!dsn) {
    throw new Error(
      "SUPABASE_DB_URL is not set — the live read path is unavailable. " +
        "Refusing to regenerate the mirror from the static fallback. " +
        "Set SUPABASE_DB_URL (it lives in landing/.env.local) and re-run.",
    );
  }
  const { Client } = await import("pg");
  const client = new Client({ connectionString: dsn });
  await client.connect();
  try {
    return await fn((sql, params) =>
      client.query(sql, params) as unknown as Promise<{ rows: never[] }>,
    );
  } finally {
    await client.end();
  }
}

// ── Row → domain mappers (mirror lib/library-v2/source.ts + the enriched recipe
//    fields its toBlock drops, so the offline mirror is a FAITHFUL copy). ─────────

function toBlock(r: BlockRowDb): Block {
  const b: Block = {
    kind: r.kind,
    id: r.id,
    name: r.name,
    blurb: r.blurb ?? "",
    refs: r.refs ?? [],
  };
  if (r.sub) b.sub = r.sub;
  // Enriched-recipe payload (#082): recipe_kind lives in its own column, the rest
  // in the `data` jsonb. Fold them back so the recipe page renders body / artifact
  // / params / demo offline. Present only on recipe blocks that carry them.
  if (r.recipe_kind) b.recipeKind = r.recipe_kind;
  if (r.data && typeof r.data === "object") {
    if (typeof r.data.body === "string") b.body = r.data.body;
    if (typeof r.data.artifact === "string") b.artifact = r.data.artifact;
    if (r.data.params && typeof r.data.params === "object") b.params = r.data.params;
    if (r.data.demo && typeof r.data.demo === "object") b.demo = r.data.demo;
  }
  return b;
}

function toUnit(u: UnitRowDb, comp: Map<string, UnitBlockRowDb[]>): Unit {
  const rows = (comp.get(u.id) ?? []).slice().sort((a, b) => a.position - b.position);
  const templateId = rows.find((r) => r.role === "template")?.block_id ?? "";
  const recipeIds = rows.filter((r) => r.role === "recipe").map((r) => r.block_id);
  const assetIds = rows.filter((r) => r.role === "asset").map((r) => r.block_id);
  const unit: Unit = {
    id: u.id,
    format: u.format,
    title: u.title,
    blurb: u.blurb ?? "",
    templateId,
    recipeIds,
    assetIds,
    mediaCount: u.media_count,
    media: u.media ?? [],
  };
  if (u.date) unit.date = u.date;
  if (u.hero) unit.hero = u.hero;
  if (Array.isArray(u.tags) && u.tags.length > 0) unit.tags = u.tags;
  return unit;
}

/** Pull the FULL live graph. Deterministic ordering throughout (stable sort by id
 *  / unitId) so a re-run against an unchanged DB produces a zero-diff file. */
async function loadLiveGraph(): Promise<LiveGraph> {
  return withDb(async (q) => {
    // Serial, not Promise.all: a single pg Client cannot run concurrent queries.
    const unitsRes = await q<UnitRowDb>(
      "select id, format, title, blurb, date, media, media_count, hero, tags from units",
    );
    const blocksRes = await q<BlockRowDb>(
      "select id, kind, name, blurb, sub, refs, recipe_kind, data from blocks",
    );
    const compRes = await q<UnitBlockRowDb>(
      "select unit_id, block_id, role, position from unit_blocks",
    );
    const bpRes = await q<BlueprintRowDb>("select unit_id, data from blueprints");

    const comp = new Map<string, UnitBlockRowDb[]>();
    for (const r of compRes.rows) {
      const list = comp.get(r.unit_id) ?? [];
      list.push(r);
      comp.set(r.unit_id, list);
    }

    const units = unitsRes.rows
      .map((u) => toUnit(u, comp))
      .sort((a, b) => a.id.localeCompare(b.id));

    // Blocks: deterministic by (kind, id) — keeps template/recipe/asset clustered
    // and stable within a kind. The mirror array is a single flat Block[] (all
    // kinds), exactly as published.ts has always held it.
    const kindRank: Record<BlockKind, number> = { template: 0, recipe: 1, asset: 2 };
    const blocks = blocksRes.rows
      .map((r) => toBlock(r))
      .sort((a, b) => kindRank[a.kind] - kindRank[b.kind] || a.id.localeCompare(b.id));

    const blueprints = bpRes.rows
      .map((r) => r.data)
      .sort((a, b) => a.unitId.localeCompare(b.unitId));

    return { units, blocks, blueprints };
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadDotEnvLocal();
  const { dryRun } = parseArgs(process.argv.slice(2));

  // Confirm the live read path is reachable BEFORE touching the file. withDb
  // throws loudly if SUPABASE_DB_URL is unset; the SELECTs throw if it is wrong.
  console.log("sync-published-mirror: pulling the full live graph over SUPABASE_DB_URL ...");
  const live = await loadLiveGraph();

  // BEFORE counts — read the current mirror via a regex-free import of the
  // exported arrays (no need to parse the literal by hand).
  const mod = await import(PUBLISHED_TS);
  const beforeUnits = (mod.PUBLISHED_UNITS as Unit[]) ?? [];
  const beforeBlocks = (mod.PUBLISHED_BLOCKS as Block[]) ?? [];
  const beforeBlueprints = (mod.PUBLISHED_BLUEPRINTS as Blueprint[]) ?? [];

  const byKind = (list: Block[]) => ({
    template: list.filter((b) => b.kind === "template").length,
    recipe: list.filter((b) => b.kind === "recipe").length,
    asset: list.filter((b) => b.kind === "asset").length,
  });
  const beforeBk = byKind(beforeBlocks);
  const liveBk = byKind(live.blocks);

  console.log("\n  BEFORE -> AFTER");
  console.log(`  units:      ${beforeUnits.length} -> ${live.units.length}`);
  console.log(
    `  blocks:     ${beforeBlocks.length} -> ${live.blocks.length}` +
      `  (template ${beforeBk.template}->${liveBk.template}, ` +
      `recipe ${beforeBk.recipe}->${liveBk.recipe}, asset ${beforeBk.asset}->${liveBk.asset})`,
  );
  console.log(`  blueprints: ${beforeBlueprints.length} -> ${live.blueprints.length}`);

  // Leak guard: refuse loudly if any live row carried a local FS path into the
  // shapes about to be committed. The DB is sanitized on the publish path, so this
  // is a backstop that fails closed (never write a leak into the OSS mirror).
  assertNoLocalPaths(live.units, "sync units -> published.ts");
  assertNoLocalPaths(live.blocks, "sync blocks -> published.ts");
  assertNoLocalPaths(live.blueprints, "sync blueprints -> published.ts");

  if (dryRun) {
    console.log("\ndry-run: live graph read OK, leak guard passed, published.ts NOT written.");
    return;
  }

  // Splice the three arrays in place using the SAME writer publish-entity.ts uses
  // (so style + sentinels stay identical). Everything outside the sentinels (the
  // header, the type import, the mergeById consumer) is preserved untouched —
  // readPublishedRegions returns the head/mid/tail verbatim.
  void readPublishedRegions(); // validates the sentinels exist before writing
  const next = renderPublished(live.units, live.blocks, live.blueprints);
  writeFileSync(PUBLISHED_TS, next, "utf8");
  console.log(
    `\nwrote ${PUBLISHED_TS}: ${live.units.length} units, ${live.blocks.length} blocks, ${live.blueprints.length} blueprints.`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
