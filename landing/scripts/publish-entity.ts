// landing/scripts/publish-entity.ts
//
// The entity-publish primitive (issue #056). Pushes ONE content entity — a Unit
// or a standalone Block — to the live Supabase store (DB rows + Storage media)
// AND appends it to the committed open-source snapshot (published.ts), so it
// surfaces on the static site and stays downloadable.
//
// Three INDEPENDENT modes (Unit / Block / Blueprint publishes are each first-class):
//
//   --unit <path>        path to a project unit dir: workspace/projects/<id>/units/<slug>/
//                        (has unit.json + the copied media). Validates against the CLI
//                        unit schema shape, uploads media to Storage at
//                        units/<id>/<filename>, upserts the units row + unit_blocks
//                        provenance rows (template/style/recipe/asset -> role; a
//                        referenced block missing from Supabase is WARN-and-skipped,
//                        never fabricated), then appends/replaces the unit in
//                        published.ts (idempotent by id; media carries local + storageUrl).
//
//   --block <json>       inline block spec OR
//   --block-file <path>  a JSON file: { kind, id, name, blurb, sub?, refs?[] }. Upserts
//                        the blocks row, uploads any refs example media to Storage at
//                        blocks/<kind>/<id>/<file>, appends/replaces in published.ts.
//
//   --blueprint <dir>    a project unit's blueprint dir (#076):
//                        workspace/projects/<id>/units/<slug>/blueprint/ — has
//                        blueprint.json (#074) + a copied payload (index.html,
//                        prompts/**, assets/** hard files). Validates the #074
//                        shape, uploads the payload to Storage at
//                        blueprints/<unitId>/<relpath> (files over a 50 MiB cap are
//                        LOUD-warned + recorded in oversizeSkipped[], never silently
//                        dropped), upserts the 1:1 blueprints row (on conflict
//                        (unit_id)), then appends/replaces PUBLISHED_BLUEPRINTS in
//                        published.ts (idempotent by unitId; each uploaded asset
//                        carries its storageUrl).
//
// Modes of execution (default = DRY-RUN):
//   (default)  Print exactly what WOULD upload + the upsert rows + the published.ts
//              edit. Touch NOTHING remote, do NOT edit published.ts.
//   --push     Perform the Storage upload + DB upsert (via `pg` over SUPABASE_DB_URL)
//              + the published.ts edit. Idempotent + append-only: re-publishing
//              upserts / versions media, never deletes.
//
// Secrets are read from the environment at RUNTIME only — never printed, never
// hardcoded. Run dry-run: cd landing && bun run scripts/publish-entity.ts --unit <dir>

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  Block,
  BlockRecipeDemo,
  Blueprint,
  RecipeKind,
  Unit,
  UnitMedia,
} from "../lib/library-v2/types";
import { env, makeS3Client, publicUrlFor, putObject } from "./lib/supabase";

// ── Paths ────────────────────────────────────────────────────────────────────

const __dirname_ = resolve(fileURLToPath(import.meta.url), "..");
const LANDING_ROOT = resolve(__dirname_, "..");
const PUBLISHED_TS = join(LANDING_ROOT, "lib", "library-v2", "published.ts");
const SHOWCASE_ROOT = join(LANDING_ROOT, "public", "showcase");

// ── Args ─────────────────────────────────────────────────────────────────────

interface Args {
  push: boolean;
  unit?: string;
  block?: string;
  blockFile?: string;
  blueprint?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { push: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--push") out.push = true;
    else if (a === "--dry-run") out.push = false;
    else if (a === "--unit") out.unit = argv[++i];
    else if (a === "--block") out.block = argv[++i];
    else if (a === "--block-file") out.blockFile = argv[++i];
    else if (a === "--blueprint") out.blueprint = argv[++i];
  }
  return out;
}

// ── Storage object keys ────────────────────────────────────────────────────────

function unitObjectKey(unitId: string, src: string): string {
  return `units/${unitId}/${basename(src)}`;
}

function blockObjectKey(kind: string, id: string, file: string): string {
  return `blocks/${kind}/${id}/${basename(file)}`;
}

/** Blueprint payload object key. `relpath` is the file's path RELATIVE to the
 *  blueprint dir (e.g. "index.html", "prompts/char-guide.txt", "assets/x.png"),
 *  preserved verbatim so prompts/ and assets/ subtrees stay distinct in Storage. */
function blueprintObjectKey(unitId: string, relpath: string): string {
  // Normalize any backslashes (Windows) and strip a leading "./".
  const clean = relpath.replace(/\\/g, "/").replace(/^\.\//, "");
  return `blueprints/${unitId}/${clean}`;
}

/** Max single-object size for a blueprint payload upload. The real #073 failure
 *  was 56-80 MB showcase mp4s vs the bucket cap; blueprint payloads are normally
 *  small (prompts / index.html / char-masters / music), so this is a loud guard,
 *  never a silent drop. */
const BLUEPRINT_MAX_BYTES = 50 * 1024 * 1024; // 50 MiB

// ── published.ts read / write (sentinel-bounded, idempotent by id) ─────────────

const UNITS_START = "// ralphy:published-units:start";
const UNITS_END = "// ralphy:published-units:end";
const BLOCKS_START = "// ralphy:published-blocks:start";
const BLOCKS_END = "// ralphy:published-blocks:end";
const BLUEPRINTS_START = "// ralphy:published-blueprints:start";
const BLUEPRINTS_END = "// ralphy:published-blueprints:end";

/** Slice the published.ts source into the head / units-literal / mid1 /
 *  blocks-literal / mid2 / blueprints-literal / tail regions, so we can rewrite
 *  each of the THREE arrays between its sentinels in place. The literal order on
 *  disk is units → blocks → blueprints. */
function readPublishedRegions(): {
  head: string;
  mid1: string;
  mid2: string;
  tail: string;
} {
  const src = readFileSync(PUBLISHED_TS, "utf8");
  const us = src.indexOf(UNITS_START);
  const ue = src.indexOf(UNITS_END);
  const bs = src.indexOf(BLOCKS_START);
  const be = src.indexOf(BLOCKS_END);
  const ps = src.indexOf(BLUEPRINTS_START);
  const pe = src.indexOf(BLUEPRINTS_END);
  if (us < 0 || ue < 0 || bs < 0 || be < 0 || ps < 0 || pe < 0) {
    throw new Error("published.ts is missing one of the sentinel markers");
  }
  return {
    head: src.slice(0, us),
    mid1: src.slice(ue + UNITS_END.length, bs),
    mid2: src.slice(be + BLOCKS_END.length, ps),
    tail: src.slice(pe + BLUEPRINTS_END.length),
  };
}

/** Load the current PUBLISHED_UNITS / PUBLISHED_BLOCKS / PUBLISHED_BLUEPRINTS
 *  arrays at runtime. */
async function loadPublished(): Promise<{
  units: Unit[];
  blocks: Block[];
  blueprints: Blueprint[];
}> {
  const mod = await import(PUBLISHED_TS);
  return {
    units: (mod.PUBLISHED_UNITS as Unit[]) ?? [],
    blocks: (mod.PUBLISHED_BLOCKS as Block[]) ?? [],
    blueprints: (mod.PUBLISHED_BLUEPRINTS as Blueprint[]) ?? [],
  };
}

/** Append-or-replace by id (idempotent re-publish): the new entity supersedes an
 *  existing entry with the same id; all others are preserved. */
function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const next = list.filter((x) => x.id !== item.id);
  next.push(item);
  return next;
}

/** Append-or-replace a Blueprint by its `unitId` (1:1 with the unit). Append-only:
 *  a re-publish replaces that one entry in place; all others are preserved. */
function upsertBlueprint(list: Blueprint[], item: Blueprint): Blueprint[] {
  const next = list.filter((x) => x.unitId !== item.unitId);
  next.push(item);
  return next;
}

/** Re-emit published.ts with the THREE arrays rewritten between their sentinels. */
function renderPublished(
  units: Unit[],
  blocks: Block[],
  blueprints: Blueprint[],
): string {
  const { head, mid1, mid2, tail } = readPublishedRegions();
  const unitsLit = `export const PUBLISHED_UNITS: Unit[] = ${JSON.stringify(units, null, 2)};\n`;
  const blocksLit = `export const PUBLISHED_BLOCKS: Block[] = ${JSON.stringify(blocks, null, 2)};\n`;
  const blueprintsLit = `export const PUBLISHED_BLUEPRINTS: Blueprint[] = ${JSON.stringify(blueprints, null, 2)};\n`;
  return (
    head +
    UNITS_START +
    "\n" +
    unitsLit +
    UNITS_END +
    mid1 +
    BLOCKS_START +
    "\n" +
    blocksLit +
    BLOCKS_END +
    mid2 +
    BLUEPRINTS_START +
    "\n" +
    blueprintsLit +
    BLUEPRINTS_END +
    tail
  );
}

// ── Unit manifest (mirror of cli/lib/schemas/unit.ts shape) ─────────────────────
//
// The script intentionally does NOT cross-import the CLI Zod schema (separate
// package, no build wiring). It validates the structural shape it relies on.

interface UnitMediaMeta {
  aspect?: string;
  kind: "image" | "video";
}

interface UnitManifest {
  slug: string;
  format: string;
  media: string[];
  media_meta?: Record<string, UnitMediaMeta>;
  provenance?: {
    template?: string;
    style?: string;
    recipes?: string[];
    assets?: string[];
  };
  source_assets?: string[];
  created: string;
  title?: string;
  blurb?: string;
  /** Tags (#082): filter-only unit labels carried into the units row + published Unit. */
  tags?: string[];
}

const UNIT_FORMATS = [
  "video",
  "carousel",
  "sticker-pack",
  "podcast-cuts",
  "fb-creative",
  "motion-design",
  "poster",
  "image",
];

function validateManifest(m: unknown, dir: string): UnitManifest {
  if (!m || typeof m !== "object") {
    throw new Error(`unit.json in ${dir} is not an object`);
  }
  const o = m as Record<string, unknown>;
  if (typeof o.slug !== "string") throw new Error("unit.json: slug must be a string");
  if (typeof o.format !== "string" || !UNIT_FORMATS.includes(o.format)) {
    throw new Error(`unit.json: format must be one of ${UNIT_FORMATS.join(", ")}`);
  }
  if (!Array.isArray(o.media) || o.media.some((x) => typeof x !== "string")) {
    throw new Error("unit.json: media must be an array of filenames");
  }
  if (typeof o.created !== "string") throw new Error("unit.json: created must be a string");
  return o as unknown as UnitManifest;
}

// ── Media-kind + aspect inference ──────────────────────────────────────────────

function mediaKindFor(file: string): "image" | "video" {
  const ext = file.toLowerCase().split(".").pop() ?? "";
  return ext === "mp4" || ext === "webm" || ext === "mov" ? "video" : "image";
}

/** A coarse default aspect by format — the publish step records a placeholder the
 *  maintainer can refine; the catalog uses CSS "W / H" strings. */
function defaultAspectFor(format: string): string {
  switch (format) {
    case "video":
    case "podcast-cuts":
      return "9 / 16";
    case "carousel":
    case "poster":
      return "4 / 5";
    case "sticker-pack":
    case "fb-creative":
    case "image":
      return "1 / 1";
    case "motion-design":
      return "16 / 9";
    default:
      return "1 / 1";
  }
}

// ── Block spec ─────────────────────────────────────────────────────────────────

interface BlockSpec {
  kind: Block["kind"];
  id: string;
  name: string;
  blurb?: string;
  sub?: Block["sub"];
  refs?: string[];
  // Enriched-recipe payload (#082) — present only on kind:"recipe".
  recipeKind?: RecipeKind;
  body?: string;
  artifact?: string;
  params?: Record<string, unknown>;
  demo?: BlockRecipeDemo;
}

const BLOCK_KINDS = ["template", "style", "recipe", "asset"];
const RECIPE_KINDS = ["ffmpeg", "encode", "overlay", "bake", "hyperframes", "prompt"];
const DEMO_KINDS = ["hyperframes", "media"];

function validateBlockSpec(raw: unknown): BlockSpec {
  if (!raw || typeof raw !== "object") throw new Error("block spec is not an object");
  const o = raw as Record<string, unknown>;
  if (typeof o.kind !== "string" || !BLOCK_KINDS.includes(o.kind)) {
    throw new Error(`block.kind must be one of ${BLOCK_KINDS.join(", ")}`);
  }
  if (typeof o.id !== "string" || o.id.length === 0) throw new Error("block.id required");
  if (typeof o.name !== "string" || o.name.length === 0) throw new Error("block.name required");
  const spec: BlockSpec = {
    kind: o.kind as Block["kind"],
    id: o.id,
    name: o.name,
  };
  if (typeof o.blurb === "string") spec.blurb = o.blurb;
  if (typeof o.sub === "string") spec.sub = o.sub as Block["sub"];
  if (Array.isArray(o.refs)) spec.refs = o.refs.filter((r) => typeof r === "string");

  // Enriched-recipe fields (#082). Minimal validation: recipeKind/demo.kind must be
  // a known member; the rest are carried through as-is (body/artifact strings,
  // params object, demo URLs). These belong only on recipe blocks.
  if (typeof o.recipeKind === "string") {
    if (!RECIPE_KINDS.includes(o.recipeKind)) {
      throw new Error(`block.recipeKind must be one of ${RECIPE_KINDS.join(", ")}`);
    }
    spec.recipeKind = o.recipeKind as RecipeKind;
  }
  if (typeof o.body === "string") spec.body = o.body;
  if (typeof o.artifact === "string") spec.artifact = o.artifact;
  if (o.params && typeof o.params === "object" && !Array.isArray(o.params)) {
    spec.params = o.params as Record<string, unknown>;
  }
  if (o.demo && typeof o.demo === "object") {
    const d = o.demo as Record<string, unknown>;
    if (typeof d.kind !== "string" || !DEMO_KINDS.includes(d.kind)) {
      throw new Error(`block.demo.kind must be one of ${DEMO_KINDS.join(", ")}`);
    }
    const demo: BlockRecipeDemo = { kind: d.kind as BlockRecipeDemo["kind"] };
    if (typeof d.html === "string") demo.html = d.html;
    if (typeof d.storageUrl === "string") demo.storageUrl = d.storageUrl;
    if (typeof d.beforeUrl === "string") demo.beforeUrl = d.beforeUrl;
    if (typeof d.afterUrl === "string") demo.afterUrl = d.afterUrl;
    if (typeof d.posterUrl === "string") demo.posterUrl = d.posterUrl;
    spec.demo = demo;
  }
  return spec;
}

// ── pg client (live --push DB upsert over SUPABASE_DB_URL) ──────────────────────

async function withDb<T>(fn: (q: (sql: string, params: unknown[]) => Promise<unknown>) => Promise<T>): Promise<T> {
  const dsn = env("SUPABASE_DB_URL");
  if (!dsn) throw new Error("--push DB upsert requires SUPABASE_DB_URL");
  // Lazy import so dry-run never needs pg present at runtime.
  const { Client } = await import("pg");
  const client = new Client({ connectionString: dsn });
  await client.connect();
  try {
    return await fn((sql, params) => client.query(sql, params));
  } finally {
    await client.end();
  }
}

// ── Planning records (printed verbatim in dry-run) ──────────────────────────────

interface PlannedUpload {
  objectKey: string;
  localPath: string;
  exists: boolean;
}

interface UpsertRow {
  table: string;
  conflict: string;
  values: Record<string, unknown>;
}

function printPlan(
  label: string,
  uploads: PlannedUpload[],
  upserts: UpsertRow[],
  publishedEdit: string,
): void {
  console.log(`\n=== ${label} ===`);
  console.log(`\nStorage objects (${uploads.length}):`);
  for (const u of uploads) {
    console.log(`  ${u.exists ? "" : "[missing local!] "}${u.objectKey}  <-  ${u.localPath}`);
  }
  console.log(`\nDB upserts (${upserts.length}):`);
  for (const r of upserts) {
    console.log(`  ${r.table} (on conflict ${r.conflict}) <- ${JSON.stringify(r.values)}`);
  }
  console.log(`\npublished.ts edit: ${publishedEdit}`);
}

// ── Mode: publish a Unit ────────────────────────────────────────────────────────

async function publishUnit(unitDir: string, push: boolean): Promise<void> {
  const dir = resolve(unitDir);
  const manifestPath = join(dir, "unit.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`no unit.json at ${manifestPath}`);
  }
  const manifest = validateManifest(
    JSON.parse(readFileSync(manifestPath, "utf8")),
    dir,
  );
  // Unit id = the slug (the dir may be a `.vN` append-only variant; the slug is canonical).
  const unitId = manifest.slug;

  // Plan uploads: every media file in the unit dir.
  const uploads: PlannedUpload[] = manifest.media.map((file) => {
    const localPath = join(dir, file);
    return {
      objectKey: unitObjectKey(unitId, file),
      localPath,
      exists: existsSync(localPath),
    };
  });

  // Build the unit media list (local src; storageUrl filled after a real upload).
  // Prefer the per-file `media_meta` (real intrinsic aspect + kind recorded by
  // `ralphy unit create`/`add`); fall back to the coarse format-default aspect +
  // extension-derived kind only when meta is absent (older units).
  const fallbackAspect = defaultAspectFor(manifest.format);
  const metaMap = manifest.media_meta ?? {};
  const buildMedia = (withStorage: boolean): UnitMedia[] =>
    manifest.media.map((file) => {
      const meta = metaMap[basename(file)] ?? metaMap[file];
      const m: UnitMedia & { storageUrl?: string } = {
        src: `/showcase/${unitId}/${basename(file)}`,
        kind: meta?.kind ?? mediaKindFor(file),
        aspect: meta?.aspect ?? fallbackAspect,
      };
      if (withStorage) {
        const url = publicUrlFor(unitObjectKey(unitId, file));
        if (url) m.storageUrl = url;
      }
      return m;
    });

  // Plan the open-source static copies into landing/public/showcase/<id>/<file>
  // (committed so the `/showcase/...` src resolves from the repo, not only via
  // the Supabase storageUrl). Performed on --push only.
  const showcaseCopies = manifest.media.map((file) => ({
    from: join(dir, file),
    to: join(SHOWCASE_ROOT, unitId, basename(file)),
    rel: `public/showcase/${unitId}/${basename(file)}`,
  }));

  const prov = manifest.provenance ?? {};
  const templateId = prov.template ?? "";
  const styleId = prov.style ?? "";
  const recipeIds = prov.recipes ?? [];
  const assetIds = prov.assets ?? [];
  // Tags (#082): filter-only unit labels. Absent in older units -> [].
  const tags = Array.isArray(manifest.tags)
    ? manifest.tags.filter((t) => typeof t === "string")
    : [];

  // unit row + unit_blocks provenance rows.
  const unitUpsert: UpsertRow = {
    table: "units",
    conflict: "(id)",
    values: {
      id: unitId,
      format: manifest.format,
      title: manifest.title ?? manifest.slug,
      blurb: manifest.blurb ?? null,
      date: null,
      media: buildMedia(false),
      media_count: manifest.media.length,
      hero: false,
      tags,
    },
  };

  const links: Array<{ blockId: string; role: Block["kind"]; position: number }> = [];
  if (templateId) links.push({ blockId: templateId, role: "template", position: 0 });
  if (styleId) links.push({ blockId: styleId, role: "style", position: 0 });
  recipeIds.forEach((id, i) => links.push({ blockId: id, role: "recipe", position: i }));
  assetIds.forEach((id, i) => links.push({ blockId: id, role: "asset", position: i }));

  const linkUpserts: UpsertRow[] = links.map((l) => ({
    table: "unit_blocks",
    conflict: "(unit_id, block_id, role)",
    values: {
      unit_id: unitId,
      block_id: l.blockId,
      role: l.role,
      link_kind: "provenance",
      position: l.position,
    },
  }));

  // The published Unit object that lands in published.ts.
  const publishedUnit: Unit = {
    id: unitId,
    format: manifest.format as Unit["format"],
    title: manifest.title ?? manifest.slug,
    blurb: manifest.blurb ?? "",
    templateId,
    styleId,
    recipeIds,
    assetIds,
    mediaCount: manifest.media.length,
    media: buildMedia(false),
    ...(tags.length > 0 ? { tags } : {}),
  };

  if (!push) {
    printPlan(
      `DRY-RUN publish-unit ${unitId}`,
      uploads,
      [unitUpsert, ...linkUpserts],
      `append/replace PUBLISHED_UNITS[id=${unitId}] (idempotent)`,
    );
    const missing = uploads.filter((u) => !u.exists);
    if (missing.length > 0) {
      console.warn(`\n  WARNING: ${missing.length} media file(s) have no local copy.`);
    }
    console.log(
      `\n  NOTE: provenance links reference ${links.length} block(s): ${links
        .map((l) => `${l.role}:${l.blockId}`)
        .join(", ") || "(none)"}. On --push, any block id absent from Supabase is WARN-and-skipped (never fabricated).`,
    );
    console.log(`\n  Unit media (real aspect/kind, source: ${manifest.media_meta ? "media_meta" : "format-default"}):`);
    for (const m of buildMedia(false)) {
      console.log(`    ${m.src}  kind=${m.kind}  aspect="${m.aspect}"`);
    }
    console.log(`\n  Open-source static copies (WOULD copy on --push, ${showcaseCopies.length}):`);
    for (const c of showcaseCopies) {
      console.log(`    ${c.rel}  <-  ${c.from}`);
    }
    return;
  }

  // ── live push ──
  const s3 = makeS3Client();
  const uploadedStorage = new Set<string>();
  for (const u of uploads) {
    if (!u.exists) {
      console.warn(`  SKIP (missing local file): ${u.localPath}`);
      continue;
    }
    await putObject(s3, u.objectKey, readFileSync(u.localPath), u.localPath);
    uploadedStorage.add(u.objectKey);
    console.log(`  UPLOADED ${u.objectKey}`);
  }

  // Copy each media file into the committed open-source static path so the
  // `/showcase/<id>/...` src resolves from the repo (idempotent — overwrite with
  // an identical file is fine). Mirrors the Storage upload; not a replacement.
  for (const c of showcaseCopies) {
    if (!existsSync(c.from)) {
      console.warn(`  SKIP showcase copy (missing local file): ${c.from}`);
      continue;
    }
    mkdirSync(dirname(c.to), { recursive: true });
    copyFileSync(c.from, c.to);
    console.log(`  COPIED ${c.rel}`);
  }

  // media with storageUrl for the rows + the snapshot.
  const mediaWithStorage = buildMedia(true);
  await withDb(async (q) => {
    await q(
      `insert into units (id, format, title, blurb, date, media, media_count, hero, tags)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb)
       on conflict (id) do update set
         format = excluded.format, title = excluded.title, blurb = excluded.blurb,
         date = excluded.date, media = excluded.media,
         media_count = excluded.media_count, hero = excluded.hero,
         tags = excluded.tags`,
      [
        unitId,
        manifest.format,
        manifest.title ?? manifest.slug,
        manifest.blurb ?? null,
        null,
        JSON.stringify(mediaWithStorage),
        manifest.media.length,
        false,
        JSON.stringify(tags),
      ],
    );
    for (const l of links) {
      // Only link to a block that already exists in Supabase; never fabricate.
      const exists = (await q(`select 1 from blocks where id = $1`, [l.blockId])) as {
        rowCount: number;
      };
      if (!exists.rowCount) {
        console.warn(`  WARN: block "${l.blockId}" not in Supabase — skipping ${l.role} link`);
        continue;
      }
      await q(
        `insert into unit_blocks (unit_id, block_id, role, link_kind, position)
         values ($1, $2, $3, 'provenance', $4)
         on conflict (unit_id, block_id, role) do update set
           link_kind = excluded.link_kind, position = excluded.position`,
        [unitId, l.blockId, l.role, l.position],
      );
    }
  });

  // Snapshot edit (media carries storageUrl when a base URL is set).
  const snapshotUnit: Unit = { ...publishedUnit, media: mediaWithStorage };
  const cur = await loadPublished();
  const nextUnits = upsertById(cur.units, snapshotUnit);
  writeFileSync(PUBLISHED_TS, renderPublished(nextUnits, cur.blocks, cur.blueprints), "utf8");
  console.log(`  published.ts: upserted unit ${unitId} (${nextUnits.length} published unit(s))`);
}

// ── Mode: publish a Block ───────────────────────────────────────────────────────

async function publishBlock(args: Args, push: boolean): Promise<void> {
  const rawJson = args.blockFile
    ? readFileSync(resolve(args.blockFile), "utf8")
    : (args.block as string);
  const spec = validateBlockSpec(JSON.parse(rawJson));

  // refs example media: resolve each ref to a local file (relative to CWD or absolute).
  const refUploads: PlannedUpload[] = (spec.refs ?? []).map((ref) => {
    const localPath = resolve(ref);
    return {
      objectKey: blockObjectKey(spec.kind, spec.id, ref),
      localPath,
      exists: existsSync(localPath) && statSync(localPath).isFile(),
    };
  });

  // The enriched-recipe payload (#082) packs into the `data` jsonb column. Only
  // populated for recipe blocks that actually carry any of the fields; otherwise
  // `data` stays null so non-recipe / bare-recipe blocks are unchanged.
  const recipeData: Record<string, unknown> = {};
  if (spec.body !== undefined) recipeData.body = spec.body;
  if (spec.artifact !== undefined) recipeData.artifact = spec.artifact;
  if (spec.params !== undefined) recipeData.params = spec.params;
  if (spec.demo !== undefined) recipeData.demo = spec.demo;
  const hasRecipeData = Object.keys(recipeData).length > 0;

  const blockUpsert: UpsertRow = {
    table: "blocks",
    conflict: "(id)",
    values: {
      id: spec.id,
      kind: spec.kind,
      name: spec.name,
      blurb: spec.blurb ?? null,
      sub: spec.sub ?? null,
      refs: spec.refs ?? [],
      recipe_kind: spec.recipeKind ?? null,
      data: hasRecipeData ? recipeData : null,
    },
  };

  // The published Block object — refs rewritten to their Storage public path when known.
  const publishedRefs = (spec.refs ?? []).map((ref) => {
    const url = publicUrlFor(blockObjectKey(spec.kind, spec.id, ref));
    return url ?? ref;
  });
  const publishedBlock: Block = {
    kind: spec.kind,
    id: spec.id,
    name: spec.name,
    blurb: spec.blurb ?? "",
    refs: publishedRefs,
    ...(spec.sub ? { sub: spec.sub } : {}),
    ...(spec.recipeKind ? { recipeKind: spec.recipeKind } : {}),
    ...(spec.body !== undefined ? { body: spec.body } : {}),
    ...(spec.artifact !== undefined ? { artifact: spec.artifact } : {}),
    ...(spec.params !== undefined ? { params: spec.params } : {}),
    ...(spec.demo !== undefined ? { demo: spec.demo } : {}),
  };

  if (!push) {
    printPlan(
      `DRY-RUN publish-block ${spec.kind}:${spec.id}`,
      refUploads,
      [blockUpsert],
      `append/replace PUBLISHED_BLOCKS[id=${spec.id}] (idempotent)`,
    );
    const missing = refUploads.filter((u) => !u.exists);
    if (missing.length > 0) {
      console.warn(`\n  WARNING: ${missing.length} ref media file(s) have no local copy.`);
    }
    return;
  }

  // ── live push ──
  const s3 = makeS3Client();
  for (const u of refUploads) {
    if (!u.exists) {
      console.warn(`  SKIP (missing ref file): ${u.localPath}`);
      continue;
    }
    await putObject(s3, u.objectKey, readFileSync(u.localPath), u.localPath);
    console.log(`  UPLOADED ${u.objectKey}`);
  }

  await withDb(async (q) => {
    await q(
      `insert into blocks (id, kind, name, blurb, sub, refs, recipe_kind, data)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb)
       on conflict (id) do update set
         kind = excluded.kind, name = excluded.name, blurb = excluded.blurb,
         sub = excluded.sub, refs = excluded.refs,
         recipe_kind = excluded.recipe_kind, data = excluded.data`,
      [
        spec.id,
        spec.kind,
        spec.name,
        spec.blurb ?? null,
        spec.sub ?? null,
        JSON.stringify(spec.refs ?? []),
        spec.recipeKind ?? null,
        hasRecipeData ? JSON.stringify(recipeData) : null,
      ],
    );
  });

  const cur = await loadPublished();
  const nextBlocks = upsertById(cur.blocks, publishedBlock);
  writeFileSync(PUBLISHED_TS, renderPublished(cur.units, nextBlocks, cur.blueprints), "utf8");
  console.log(`  published.ts: upserted block ${spec.id} (${nextBlocks.length} published block(s))`);
}

// ── Mode: publish a Blueprint (#077) ────────────────────────────────────────────
//
// A blueprint dir is `workspace/projects/<id>/units/<slug>/blueprint/` (or a
// `.vN` variant), produced by `ralphy blueprint create` (#076). It holds:
//   blueprint.json      the #074 Blueprint object (the six axes + unitId)
//   index.html          the copied composition skeleton (composition.file)
//   prompts/**          the verbatim prompt files
//   assets/**           the hard-asset files (asset.path is posix-relative)
//
// We upload the payload to Storage under blueprints/<unitId>/..., set each
// uploaded file's public storageUrl back into the blueprint object (so the
// committed mirror resolves remotely), upsert a 1:1 `blueprints` DB row keyed by
// unitId, and append/replace in PUBLISHED_BLUEPRINTS (idempotent by unitId).

/** A minimal structural guard for the #074 Blueprint shape. We do NOT cross-import
 *  the CLI Zod schema (separate package); a field-presence check is enough, and
 *  it fails loudly if `unitId` is missing. */
function validateBlueprint(raw: unknown, file: string): Blueprint {
  if (!raw || typeof raw !== "object") {
    throw new Error(`${file} is not an object`);
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.unitId !== "string" || o.unitId.length === 0) {
    throw new Error(`${file}: unitId is required (a Blueprint is 1:1 with its Unit)`);
  }
  if (typeof o.schemaVersion !== "number") {
    throw new Error(`${file}: schemaVersion (number) is required`);
  }
  // The six axes (#074). scenario + composition are nullable; the four collections
  // must be present (possibly empty arrays).
  if (!("scenario" in o)) throw new Error(`${file}: missing scenario axis`);
  if (!("composition" in o)) throw new Error(`${file}: missing composition axis`);
  if (!Array.isArray(o.prompts)) throw new Error(`${file}: prompts must be an array`);
  if (!Array.isArray(o.assets)) throw new Error(`${file}: assets must be an array`);
  if (!Array.isArray(o.modelStack)) throw new Error(`${file}: modelStack must be an array`);
  if (!Array.isArray(o.recipes)) throw new Error(`${file}: recipes must be an array`);
  return o as unknown as Blueprint;
}

/** Recursively enumerate files under `dir`, returning paths RELATIVE to `dir`
 *  (posix-joined). Returns [] when the dir is absent. */
function walkRel(root: string, sub = ""): string[] {
  const abs = sub ? join(root, sub) : root;
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = sub ? `${sub}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walkRel(root, rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

/** A planned blueprint payload upload, carrying the file size + an oversize flag
 *  so the dry-run can list it and the live push can loud-warn-and-skip it. */
interface PlannedBlueprintUpload {
  objectKey: string;
  localPath: string;
  /** Path relative to the blueprint dir (the key the blueprint object indexes by). */
  rel: string;
  exists: boolean;
  bytes: number;
  oversize: boolean;
}

async function publishBlueprint(blueprintDir: string, push: boolean): Promise<void> {
  const dir = resolve(blueprintDir);
  const manifestPath = join(dir, "blueprint.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`no blueprint.json at ${manifestPath}`);
  }
  const blueprint = validateBlueprint(
    JSON.parse(readFileSync(manifestPath, "utf8")),
    manifestPath,
  );
  const unitId = blueprint.unitId;

  // Enumerate the payload files RELATIVE to the blueprint dir:
  //   - the composition file (index.html, from composition.file)
  //   - every file under prompts/**
  //   - every hard-asset file referenced by assets[].path (posix-relative)
  const payloadRels = new Set<string>();
  const compFile = blueprint.composition?.file;
  if (compFile) payloadRels.add(compFile.replace(/\\/g, "/").replace(/^\.\//, ""));
  for (const rel of walkRel(join(dir, "prompts"))) payloadRels.add(`prompts/${rel}`);
  for (const a of blueprint.assets) {
    if (typeof a.path === "string" && a.path.length > 0) {
      payloadRels.add(a.path.replace(/\\/g, "/").replace(/^\.\//, ""));
    }
  }

  // Plan each upload: stat for size, flag oversize (never silently dropped).
  const uploads: PlannedBlueprintUpload[] = Array.from(payloadRels)
    .sort()
    .map((rel) => {
      const localPath = join(dir, rel);
      const exists = existsSync(localPath) && statSync(localPath).isFile();
      const bytes = exists ? statSync(localPath).size : 0;
      return {
        objectKey: blueprintObjectKey(unitId, rel),
        localPath,
        rel,
        exists,
        bytes,
        oversize: exists && bytes > BLUEPRINT_MAX_BYTES,
      };
    });

  const oversize = uploads.filter((u) => u.oversize);
  const uploadable = uploads.filter((u) => u.exists && !u.oversize);
  const oversizeRels = oversize.map((u) => u.rel);

  // The committable-inline cap for the composition's index.html: small enough to
  // live in the committed mirror so `blueprint use` (#079) can write a real
  // index.html with zero network. Larger compositions resolve via storageUrl.
  const COMPOSITION_INLINE_MAX_BYTES = 256 * 1024; // 256 KiB
  const compRel = compFile
    ? compFile.replace(/\\/g, "/").replace(/^\.\//, "")
    : undefined;
  const compPlan = compRel ? uploads.find((u) => u.rel === compRel) : undefined;

  // Build the published Blueprint object. Set storageUrl on each asset whose file
  // is uploadable; record oversize files in `oversizeSkipped` (kept on disk, the
  // local `path` preserved so they can still be fetched from the repo / project).
  // Also feed the composition reproduction path #079 consumes: set
  // composition.storageUrl to the uploaded index.html, and inline composition.html
  // when the file is small enough to commit (so the offline mirror reproduces a
  // real composition without a network fetch).
  const buildPublished = (withStorage: boolean): Blueprint => {
    const bp: Blueprint = {
      ...blueprint,
      assets: blueprint.assets.map((a) => {
        const rel = a.path?.replace(/\\/g, "/").replace(/^\.\//, "");
        const plan = rel ? uploads.find((u) => u.rel === rel) : undefined;
        const next: typeof a = { ...a };
        if (withStorage && plan && plan.exists && !plan.oversize) {
          const url = publicUrlFor(plan.objectKey);
          if (url) next.storageUrl = url;
        }
        return next;
      }),
    };
    if (bp.composition && compPlan && compPlan.exists && !compPlan.oversize) {
      const composition = { ...bp.composition };
      if (withStorage) {
        const url = publicUrlFor(compPlan.objectKey);
        if (url) composition.storageUrl = url;
      }
      // Inline the composition HTML into the committed mirror when small. This
      // path runs in dry-run too (it reads a local file, touches nothing remote)
      // so the offline reproduce works even when nothing was pushed.
      if (compPlan.bytes <= COMPOSITION_INLINE_MAX_BYTES) {
        composition.html = readFileSync(compPlan.localPath, "utf8");
      }
      bp.composition = composition;
    }
    if (oversizeRels.length > 0) bp.oversizeSkipped = oversizeRels;
    return bp;
  };

  const blueprintUpsert: UpsertRow = {
    table: "blueprints",
    conflict: "(unit_id)",
    values: {
      unit_id: unitId,
      data: "<blueprint jsonb>",
    },
  };

  if (!push) {
    // Dry-run: print exactly what WOULD upload + the DB upsert + the published.ts
    // edit, touching NOTHING. Mirrors publishUnit / publishBlock.
    const planned: PlannedUpload[] = uploadable.map((u) => ({
      objectKey: u.objectKey,
      localPath: u.localPath,
      exists: u.exists,
    }));
    printPlan(
      `DRY-RUN publish-blueprint ${unitId}`,
      planned,
      [blueprintUpsert],
      `append/replace PUBLISHED_BLUEPRINTS[unitId=${unitId}] (idempotent)`,
    );
    const missing = uploads.filter((u) => !u.exists);
    if (missing.length > 0) {
      console.warn(`\n  WARNING: ${missing.length} payload file(s) referenced by the blueprint have no local copy:`);
      for (const m of missing) console.warn(`    ${m.rel}`);
    }
    if (oversize.length > 0) {
      console.warn(`\n  OVERSIZE (> ${BLUEPRINT_MAX_BYTES} bytes / ${(BLUEPRINT_MAX_BYTES / 1024 / 1024).toFixed(0)} MiB cap) — NOT uploaded, kept on disk:`);
      for (const o of oversize) {
        console.warn(`    ${o.rel}  (${o.bytes} bytes / ${(o.bytes / 1024 / 1024).toFixed(1)} MiB) exceeds the ${(BLUEPRINT_MAX_BYTES / 1024 / 1024).toFixed(0)} MiB cap`);
      }
      console.warn(`  These ${oversize.length} file(s) WOULD be recorded in the blueprint's oversizeSkipped[] (storageUrl absent, local path kept).`);
    }
    console.log(`\n  Blueprint payload: ${uploadable.length} file(s) WOULD upload under blueprints/${unitId}/`);
    console.log(`  DB: blueprints row (unit_id=${unitId}) WOULD upsert on conflict (unit_id), data = full blueprint jsonb.`);
    return;
  }

  // ── live push ──
  const s3 = makeS3Client();
  for (const u of uploads) {
    if (!u.exists) {
      console.warn(`  SKIP (missing payload file): ${u.localPath}`);
      continue;
    }
    if (u.oversize) {
      console.warn(`  OVERSIZE SKIP: ${u.rel} (${u.bytes} bytes) exceeds the ${(BLUEPRINT_MAX_BYTES / 1024 / 1024).toFixed(0)} MiB cap — kept on disk, recorded in oversizeSkipped[]`);
      continue;
    }
    await putObject(s3, u.objectKey, readFileSync(u.localPath), u.localPath);
    console.log(`  UPLOADED ${u.objectKey}`);
  }

  const publishedBlueprint = buildPublished(true);

  await withDb(async (q) => {
    await q(
      `insert into blueprints (unit_id, data)
       values ($1, $2::jsonb)
       on conflict (unit_id) do update set
         data = excluded.data`,
      [unitId, JSON.stringify(publishedBlueprint)],
    );
  });

  const cur = await loadPublished();
  const nextBlueprints = upsertBlueprint(cur.blueprints, publishedBlueprint);
  writeFileSync(PUBLISHED_TS, renderPublished(cur.units, cur.blocks, nextBlueprints), "utf8");
  console.log(`  published.ts: upserted blueprint ${unitId} (${nextBlueprints.length} published blueprint(s))`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.push ? "push" : "dry-run";
  console.log(`publish-entity: mode=${mode}`);

  const hasUnit = Boolean(args.unit);
  const hasBlock = Boolean(args.block || args.blockFile);
  const hasBlueprint = Boolean(args.blueprint);
  const modeCount = [hasUnit, hasBlock, hasBlueprint].filter(Boolean).length;
  if (modeCount !== 1) {
    throw new Error(
      "exactly one mode required: --unit <dir> OR (--block <json> | --block-file <path>) OR --blueprint <dir>",
    );
  }

  if (hasUnit) await publishUnit(args.unit as string, args.push);
  else if (hasBlueprint) await publishBlueprint(args.blueprint as string, args.push);
  else await publishBlock(args, args.push);

  if (!args.push) {
    console.log(
      "\ndry-run: nothing uploaded, no DB writes, published.ts untouched. Re-run with --push to apply.",
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
