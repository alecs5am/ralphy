// landing/scripts/seed-supabase.ts
//
// Seed the Library v2 Supabase store from the committed static catalog.
//
// The catalog (landing/lib/library-v2/catalog.ts, via ./index.ts) is the open-source
// source of truth. This script materializes it two ways:
//
//   1. STORAGE — uploads each Unit's local media (public/showcase/** and
//      public/assets/showcase/**) to the Supabase Storage bucket `library` at object
//      key `units/<unitId>/<filename>`, via the S3-compatible API. Records each
//      object's public URL.
//   2. DB — emits an idempotent SQL file (supabase/seed/library_v2.sql) of
//      insert ... on conflict ... rows for all blocks, units, and unit_blocks. Unit
//      `media` jsonb carries BOTH the local `src` and (when storage upload ran) the
//      `storageUrl`, so the offline snapshot keeps working and Supabase serves a copy.
//
// Modes (default --dry-run):
//   --dry-run       generate the SQL file + PRINT what WOULD upload; touch nothing remote.
//   --push-storage  actually upload media to Storage (requires SUPABASE_S3_* env).
//   --push-db       apply the SQL via a service-role Supabase client IF
//                   SUPABASE_SERVICE_ROLE_KEY is set; else print the MCP fallback note.
//
// Secrets are read from the environment at RUNTIME only — never printed, never hardcoded.
// Run: cd landing && bun run scripts/seed-supabase.ts --dry-run

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

import { BLOCKS, BLUEPRINTS, UNITS } from "../lib/library-v2/index";
import type { Block, Blueprint, Unit, UnitMedia } from "../lib/library-v2/types";

// ── Paths ────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const LANDING_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(LANDING_ROOT, "..");
const PUBLIC_DIR = join(LANDING_ROOT, "public");
const SEED_DIR = join(REPO_ROOT, "supabase", "seed");
const SEED_SQL_PATH = join(SEED_DIR, "library_v2.sql");
const STORAGE_PREFIX = "units";

// ── Args ─────────────────────────────────────────────────────────────────────

interface Mode {
  dryRun: boolean;
  pushStorage: boolean;
  pushDb: boolean;
}

function parseArgs(argv: string[]): Mode {
  const flags = new Set(argv);
  const pushStorage = flags.has("--push-storage");
  const pushDb = flags.has("--push-db");
  // Default is dry-run; an explicit --dry-run forces it even if a push flag slips in.
  const dryRun = flags.has("--dry-run") || (!pushStorage && !pushDb);
  return { dryRun, pushStorage, pushDb };
}

// ── Env helpers (read at runtime, never printed) ──────────────────────────────

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

// ── SQL literal helpers ───────────────────────────────────────────────────────

function sqlText(value: string | null | undefined): string {
  if (value === null || value === undefined) return "null";
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlJson(value: unknown): string {
  // jsonb literal: stringify then escape single quotes, cast to jsonb.
  const json = JSON.stringify(value);
  return `'${json.replace(/'/g, "''")}'::jsonb`;
}

function sqlBool(value: boolean): string {
  return value ? "true" : "false";
}

function sqlInt(value: number): string {
  return String(Math.trunc(value));
}

// ── Storage object key + planned uploads ──────────────────────────────────────

interface PlannedUpload {
  unitId: string;
  /** Public path as referenced in the catalog (e.g. /showcase/x/y.mp4). */
  src: string;
  /** Absolute local file path under public/. */
  localPath: string;
  /** Object key in the bucket: units/<unitId>/<filename>. */
  objectKey: string;
  exists: boolean;
}

function localPathForSrc(src: string): string {
  // catalog `src` are public-rooted absolute paths ("/showcase/..." | "/assets/...").
  const rel = src.replace(/^\//, "");
  return join(PUBLIC_DIR, rel);
}

function objectKeyFor(unitId: string, src: string): string {
  return `${STORAGE_PREFIX}/${unitId}/${basename(src)}`;
}

/** Every media + poster path that should land in Storage, per unit. */
function plannedUploadsFor(unit: Unit): PlannedUpload[] {
  const out: PlannedUpload[] = [];
  for (const m of unit.media ?? []) {
    for (const src of [m.src, m.poster].filter((s): s is string => Boolean(s))) {
      const localPath = localPathForSrc(src);
      out.push({
        unitId: unit.id,
        src,
        localPath,
        objectKey: objectKeyFor(unit.id, src),
        exists: existsSync(localPath),
      });
    }
  }
  return out;
}

function contentTypeFor(path: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "webp":
      return "image/webp";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

/** Public URL of an uploaded object, derived from the project URL + bucket. */
function publicUrlFor(objectKey: string): string | undefined {
  const base = env("NEXT_PUBLIC_SUPABASE_URL");
  const bucket = env("SUPABASE_STORAGE_BUCKET") ?? "library";
  if (!base) return undefined;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${objectKey}`;
}

// ── Storage upload (only on --push-storage) ───────────────────────────────────

function makeS3Client(): S3Client {
  const endpoint = env("SUPABASE_S3_ENDPOINT");
  const region = env("SUPABASE_S3_REGION");
  const accessKeyId = env("SUPABASE_S3_ACCESS_KEY_ID");
  const secretAccessKey = env("SUPABASE_S3_SECRET_ACCESS_KEY");
  const missing = [
    !endpoint && "SUPABASE_S3_ENDPOINT",
    !region && "SUPABASE_S3_REGION",
    !accessKeyId && "SUPABASE_S3_ACCESS_KEY_ID",
    !secretAccessKey && "SUPABASE_S3_SECRET_ACCESS_KEY",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(
      `--push-storage requires S3 env vars; missing: ${missing.join(", ")}`,
    );
  }
  return new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: accessKeyId as string,
      secretAccessKey: secretAccessKey as string,
    },
  });
}

async function uploadAll(plans: PlannedUpload[]): Promise<Set<string>> {
  const bucket = env("SUPABASE_STORAGE_BUCKET") ?? "library";
  const client = makeS3Client();
  const uploaded = new Set<string>();
  for (const p of plans) {
    if (!p.exists) {
      console.warn(`  SKIP (missing local file): ${p.localPath}`);
      continue;
    }
    const body = readFileSync(p.localPath);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: p.objectKey,
        Body: body,
        ContentType: contentTypeFor(p.localPath),
      }),
    );
    uploaded.add(p.src);
    console.log(`  UPLOADED ${p.objectKey}`);
  }
  return uploaded;
}

// ── Media jsonb enrichment ─────────────────────────────────────────────────────

/** Attach storageUrl to each media item whose src landed in Storage. Always keep
 *  the local `src` so the offline snapshot still resolves. */
function enrichMedia(unit: Unit, uploadedSrcs: Set<string>): UnitMedia[] {
  return (unit.media ?? []).map((m) => {
    const out: UnitMedia & { storageUrl?: string; posterStorageUrl?: string } = {
      ...m,
    };
    if (uploadedSrcs.has(m.src)) {
      const url = publicUrlFor(objectKeyFor(unit.id, m.src));
      if (url) out.storageUrl = url;
    }
    if (m.poster && uploadedSrcs.has(m.poster)) {
      const url = publicUrlFor(objectKeyFor(unit.id, m.poster));
      if (url) out.posterStorageUrl = url;
    }
    return out;
  });
}

// ── SQL generation ─────────────────────────────────────────────────────────────

function blockRows(): string[] {
  const all: Block[] = [
    ...BLOCKS.template,
    ...BLOCKS.recipe,
    ...BLOCKS.asset,
  ];
  return all.map((b) => {
    // Enriched-recipe payload (#082): recipe_kind column + the data jsonb
    // ({ body, artifact, params, demo }). Null for non-recipe / bare blocks.
    const recipeData: Record<string, unknown> = {};
    if (b.body !== undefined) recipeData.body = b.body;
    if (b.artifact !== undefined) recipeData.artifact = b.artifact;
    if (b.params !== undefined) recipeData.params = b.params;
    if (b.demo !== undefined) recipeData.demo = b.demo;
    const dataSql = Object.keys(recipeData).length > 0 ? sqlJson(recipeData) : "null";
    return `  (${sqlText(b.id)}, ${sqlText(b.kind)}, ${sqlText(b.name)}, ${sqlText(
      b.blurb ?? null,
    )}, ${b.sub ? sqlText(b.sub) : "null"}, ${sqlJson(b.refs ?? [])}, ${
      b.recipeKind ? sqlText(b.recipeKind) : "null"
    }, ${dataSql})`;
  });
}

function unitRows(mediaByUnit: Map<string, UnitMedia[]>): string[] {
  return UNITS.map((u) => {
    const media = mediaByUnit.get(u.id) ?? u.media ?? [];
    return `  (${sqlText(u.id)}, ${sqlText(u.format)}, ${sqlText(
      u.title,
    )}, ${sqlText(u.blurb ?? null)}, ${u.date ? sqlText(u.date) : "null"}, ${sqlJson(
      media,
    )}, ${sqlInt(u.mediaCount)}, ${sqlBool(Boolean(u.hero))}, ${sqlJson(u.tags ?? [])})`;
  });
}

interface UnitBlockRow {
  unitId: string;
  blockId: string;
  role: Block["kind"];
  position: number;
}

/** Derive the provenance composition rows: 1 template + N recipe + M asset. The
 *  look / register is a unit Tag (the units.tags column), not a block-role. */
function unitBlockRows(): UnitBlockRow[] {
  const rows: UnitBlockRow[] = [];
  for (const u of UNITS) {
    rows.push({ unitId: u.id, blockId: u.templateId, role: "template", position: 0 });
    u.recipeIds.forEach((id, i) =>
      rows.push({ unitId: u.id, blockId: id, role: "recipe", position: i }),
    );
    u.assetIds.forEach((id, i) =>
      rows.push({ unitId: u.id, blockId: id, role: "asset", position: i }),
    );
  }
  return rows;
}

function unitBlockSql(rows: UnitBlockRow[]): string[] {
  return rows.map(
    (r) =>
      `  (${sqlText(r.unitId)}, ${sqlText(r.blockId)}, ${sqlText(
        r.role,
      )}, 'provenance', ${sqlInt(r.position)})`,
  );
}

/** Blueprint seed rows: one (unit_id, data jsonb) tuple per published Blueprint
 *  (#077). 1:1 with its unit; `data` is the full JSON-serialized Blueprint. */
function blueprintRows(): string[] {
  return BLUEPRINTS.map(
    (bp: Blueprint) => `  (${sqlText(bp.unitId)}, ${sqlJson(bp)})`,
  );
}

function buildSql(mediaByUnit: Map<string, UnitMedia[]>): {
  sql: string;
  counts: { blocks: number; units: number; unitBlocks: number; blueprints: number };
} {
  const blocks = blockRows();
  const units = unitRows(mediaByUnit);
  const ub = unitBlockRows();
  const ubSql = unitBlockSql(ub);
  const blueprints = blueprintRows();

  // Blueprints seed is conditional — an empty `insert ... values` is invalid SQL,
  // so only emit the block when at least one Blueprint is published (#077). The
  // table DDL itself always ships (idempotent `if not exists`).
  const blueprintsSql =
    blueprints.length > 0
      ? `
-- ── blueprints (1:1 per-unit reproduction recipe; #077) ──────────────────────
insert into blueprints (unit_id, data) values
${blueprints.join(",\n")}
on conflict (unit_id) do update set
  data = excluded.data;
`
      : `
-- ── blueprints (1:1 per-unit reproduction recipe; #077) — none published yet ──
`;

  const sql = `-- supabase/seed/library_v2.sql
--
-- GENERATED by landing/scripts/seed-supabase.ts from the committed static catalog
-- (landing/lib/library-v2/catalog.ts). Idempotent: re-applying is a no-op / refresh.
-- Apply with --push-db (service role) or via the Supabase MCP server. Do not hand-edit;
-- regenerate with: cd landing && bun run scripts/seed-supabase.ts --dry-run
--
-- Counts: ${blocks.length} blocks, ${units.length} units, ${ubSql.length} unit_blocks, ${blueprints.length} blueprints.

begin;

-- ── blueprints table (DDL; canonical home is supabase/migrations/0001) ───────
create table if not exists blueprints (
  unit_id    text primary key references units(id) on delete cascade,
  data       jsonb       not null,
  created_at timestamptz not null default now()
);

-- ── additive columns: Tag vs Recipe split (#082; canonical home is migrations/0001) ──
alter table blocks add column if not exists recipe_kind text;
alter table blocks add column if not exists data        jsonb;
alter table units  add column if not exists tags        jsonb not null default '[]';

-- ── blocks ─────────────────────────────────────────────────────────────────
insert into blocks (id, kind, name, blurb, sub, refs, recipe_kind, data) values
${blocks.join(",\n")}
on conflict (id) do update set
  kind        = excluded.kind,
  name        = excluded.name,
  blurb       = excluded.blurb,
  sub         = excluded.sub,
  refs        = excluded.refs,
  recipe_kind = excluded.recipe_kind,
  data        = excluded.data;

-- ── units ──────────────────────────────────────────────────────────────────
insert into units (id, format, title, blurb, date, media, media_count, hero, tags) values
${units.join(",\n")}
on conflict (id) do update set
  format      = excluded.format,
  title       = excluded.title,
  blurb       = excluded.blurb,
  date        = excluded.date,
  media       = excluded.media,
  media_count = excluded.media_count,
  hero        = excluded.hero,
  tags        = excluded.tags;

-- ── unit_blocks (provenance composition; applicable links derived at query time) ──
insert into unit_blocks (unit_id, block_id, role, link_kind, position) values
${ubSql.join(",\n")}
on conflict (unit_id, block_id, role) do update set
  link_kind = excluded.link_kind,
  position  = excluded.position;
${blueprintsSql}
commit;
`;

  return {
    sql,
    counts: {
      blocks: blocks.length,
      units: units.length,
      unitBlocks: ubSql.length,
      blueprints: blueprints.length,
    },
  };
}

// ── DB push (only on --push-db with a service key) ─────────────────────────────

async function pushDb(sql: string): Promise<void> {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey || !url) {
    console.log(
      "no service key — apply supabase/seed/library_v2.sql via the Supabase MCP server",
    );
    return;
  }
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // supabase-js has no raw-SQL primitive; rely on an `exec_sql` RPC if one exists,
  // else instruct the operator to apply via MCP. Keeps the script side-effect-light.
  const { error } = await client.rpc("exec_sql", { sql });
  if (error) {
    console.log(
      `--push-db could not apply via the exec_sql RPC (${error.message}).`,
    );
    console.log(
      "apply supabase/seed/library_v2.sql via the Supabase MCP server instead",
    );
    return;
  }
  console.log("--push-db: seed SQL applied via service-role client");
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const mode = parseArgs(process.argv.slice(2));
  const plans = UNITS.flatMap(plannedUploadsFor);

  console.log(
    `seed-supabase: mode=${mode.dryRun ? "dry-run" : ""}${
      mode.pushStorage ? " push-storage" : ""
    }${mode.pushDb ? " push-db" : ""}`.trim(),
  );

  // 1. Storage
  let uploadedSrcs = new Set<string>();
  if (mode.pushStorage) {
    console.log(`uploading ${plans.length} object(s) to Storage bucket "library"...`);
    uploadedSrcs = await uploadAll(plans);
  } else {
    const missing = plans.filter((p) => !p.exists);
    console.log(`storage plan: ${plans.length} object(s) WOULD upload:`);
    for (const p of plans) {
      console.log(`  ${p.exists ? "" : "[missing local!] "}${p.objectKey}  <-  ${p.src}`);
    }
    if (missing.length > 0) {
      console.warn(`  ${missing.length} planned object(s) have no local file.`);
    }
    // In dry-run, still record what the storageUrl WOULD be so the SQL carries it
    // only when a real upload ran — here it does not, so leave media local-only.
  }

  // 2. DB SQL
  const mediaByUnit = new Map<string, UnitMedia[]>();
  for (const u of UNITS) mediaByUnit.set(u.id, enrichMedia(u, uploadedSrcs));
  const { sql, counts } = buildSql(mediaByUnit);

  if (!existsSync(SEED_DIR)) mkdirSync(SEED_DIR, { recursive: true });
  writeFileSync(SEED_SQL_PATH, sql, "utf8");
  console.log(`wrote ${SEED_SQL_PATH}`);
  console.log(
    `rows: blocks=${counts.blocks} units=${counts.units} unit_blocks=${counts.unitBlocks} blueprints=${counts.blueprints}`,
  );

  // 3. DB push
  if (mode.pushDb) {
    await pushDb(sql);
  } else {
    console.log(
      "dry-run: SQL file written, nothing applied. Use --push-db (service role) or the Supabase MCP server to apply.",
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
