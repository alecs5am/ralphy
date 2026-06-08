// landing/scripts/publish-entity.ts
//
// The entity-publish primitive (issue #056). Pushes ONE content entity — a Unit,
// a standalone Block, or a Blueprint — to the PUBLIC library:
//   • media bytes  → Bunny Storage Zone (served via the ralphy.b-cdn.net pull zone)
//   • the entity   → the committed `lib/library-v2/library.json` (append/replace
//                    by id; idempotent), the single source of truth
//   • library.json → uploaded to Bunny so the CLI (which reads the static
//                    library.json over CDN) sees the change immediately
//
// The Supabase Postgres backend was retired (June 2026): there is NO DB upsert.
// library.json IS the database — committed to the repo, mirrored to Bunny.
//
// Three INDEPENDENT modes (Unit / Block / Blueprint publishes are each first-class):
//
//   --unit <path>        path to a project unit dir: workspace/projects/<id>/units/<slug>/
//                        (has unit.json + the copied media). Validates the unit
//                        shape, uploads media to Bunny at units/<id>/<filename>,
//                        copies media into landing/public/showcase/<id>/ (so the
//                        `/showcase/...` src resolves from the repo), and
//                        appends/replaces the unit in library.json (idempotent by
//                        id; media carries local src + storageUrl). The look /
//                        register is a unit Tag (a unit.json `provenance.style`
//                        slug is folded into the unit's tags).
//
//   --block <json>       inline block spec OR
//   --block-file <path>  a JSON file: { kind, id, name, blurb, sub?, refs?[], ... }.
//                        Uploads any refs example media to Bunny at
//                        blocks/<kind>/<id>/<file>, appends/replaces in library.json.
//
//   --blueprint <dir>    a project unit's blueprint dir (#076):
//                        workspace/projects/<id>/units/<slug>/blueprint/ — has
//                        blueprint.json (#074) + a copied payload. Uploads the
//                        payload to Bunny at blueprints/<unitId>/<relpath> (files
//                        over a 50 MiB cap are LOUD-warned + recorded in
//                        oversizeSkipped[]), then appends/replaces the blueprint in
//                        library.json (idempotent by unitId).
//
// Modes of execution (default = DRY-RUN):
//   (default)  Print exactly what WOULD upload + the library.json edit. Touch
//              NOTHING remote, do NOT edit library.json.
//   --push     Perform the Bunny media upload + the library.json edit + the
//              library.json upload to Bunny. Idempotent + append-only: re-publishing
//              upserts / versions media, never deletes.
//
// Secrets (Bunny Storage credentials) are read from the environment at RUNTIME
// only — never printed, never hardcoded. Run dry-run:
//   cd landing && bun run scripts/publish-entity.ts --unit <dir>

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
  Format,
  RecipeKind,
  Unit,
  UnitMedia,
} from "../lib/library-v2/types";
import { makeUploader, publicUrlFor, putObject } from "./lib/storage";

// ── Paths ────────────────────────────────────────────────────────────────────

const __dirname_ = resolve(fileURLToPath(import.meta.url), "..");
const LANDING_ROOT = resolve(__dirname_, "..");
/** The single source of truth: the committed library document. */
export const LIBRARY_JSON = join(LANDING_ROOT, "lib", "library-v2", "library.json");
const SHOWCASE_ROOT = join(LANDING_ROOT, "public", "showcase");
/** Bunny object key for the library document (CLI fetches it from the CDN). */
const LIBRARY_OBJECT_KEY = "library/library.json";

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

// ── Local-filesystem-path sanitizer (security guard, #056 leak root-cause) ──────
//
// Publishing must NEVER leak an absolute local filesystem path
// (`/Users/...`, `/home/...`, `/var/...`, `/tmp/...`, `/private/...`) or a
// `workspace/projects/` segment into the committed library.json or a Bunny
// Storage object key. Those strings expose the maintainer's machine and never
// resolve for any other user.
//
// `LOCAL_PATH_RE` is the single regex both the per-field sanitizer AND the final
// backstop assertion use, so "what we strip" and "what we refuse" can never drift.

export const LOCAL_PATH_RE = /(\/Users\/|\/home\/|\/var\/|\/tmp\/|\/private\/|workspace\/projects)/;

/** True when `value` carries an absolute local FS path or a workspace/projects segment. */
export function looksLocal(value: string): boolean {
  return LOCAL_PATH_RE.test(value);
}

/**
 * Reduce ONE path-like field to a publish-safe value.
 *
 *   • If the field is not a local path -> return it unchanged.
 *   • If a `storageUrl` (or any safe replacement) is available -> use that.
 *   • Otherwise strip to the basename and LOUD-warn (the page degrades to a
 *     by-ref asset, but we NEVER emit the maintainer's absolute path).
 */
function sanitizeForPublish(value: string, opts: { safe?: string; field: string }): string {
  if (typeof value !== "string" || value.length === 0) return value;
  if (!looksLocal(value)) return value;
  const { safe, field } = opts;
  if (safe && !looksLocal(safe)) return safe;
  const safeName = basename(value);
  console.warn(
    `  WARN: sanitized local path out of ${field}: "${value}" -> "${safeName}" (by-ref; the page degrades — upload the asset to Storage to resolve it).`,
  );
  return safeName;
}

/**
 * The final backstop. Serialize the EXACT object that is about to be written to
 * library.json, and refuse loudly if any local path survived the per-field
 * sanitizer. Fail-closed: never publish a leak.
 */
export function assertNoLocalPaths(payload: unknown, field: string): void {
  const serialized = JSON.stringify(payload);
  if (LOCAL_PATH_RE.test(serialized)) {
    const m = LOCAL_PATH_RE.exec(serialized);
    throw new Error(
      `refuse to publish a local filesystem path: ${field} (matched "${m?.[0]}"). The sanitizer missed a field — fix it before publishing.`,
    );
  }
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

// ── library.json read / write (append/replace by id, idempotent) ───────────────

/** The committed library document shape (mirrors lib/library-v2/index.ts). */
interface LibraryDoc {
  schemaVersion: number;
  formats: Format[];
  /** Stored newest-first (the feed order). */
  units: Unit[];
  /** Flat block list; each block carries its `kind`. */
  blocks: Block[];
  blueprints: Blueprint[];
}

/** Load the committed library.json. Fails loudly if absent / malformed — never
 *  silently invents an empty store (that would drop the whole library on write). */
export function loadLibrary(): LibraryDoc {
  if (!existsSync(LIBRARY_JSON)) {
    throw new Error(`library.json not found at ${LIBRARY_JSON}`);
  }
  const doc = JSON.parse(readFileSync(LIBRARY_JSON, "utf8")) as LibraryDoc;
  if (!doc || !Array.isArray(doc.units) || !Array.isArray(doc.blocks)) {
    throw new Error("library.json is malformed (expected { formats, units, blocks, blueprints })");
  }
  doc.blueprints = doc.blueprints ?? [];
  return doc;
}

/** Write the library document back with stable 2-space indent + trailing newline. */
export function writeLibrary(doc: LibraryDoc): void {
  writeFileSync(LIBRARY_JSON, JSON.stringify(doc, null, 2) + "\n", "utf8");
}

/** Replace an existing entry by id in place; a NEW unit is prepended (the store
 *  is newest-first, so a fresh publish leads the feed). */
function upsertUnit(list: Unit[], item: Unit): Unit[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx >= 0) {
    const next = list.slice();
    next[idx] = item;
    return next;
  }
  return [item, ...list];
}

/** Append-or-replace a Block by id (idempotent re-publish). */
function upsertBlock(list: Block[], item: Block): Block[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx >= 0) {
    const next = list.slice();
    next[idx] = item;
    return next;
  }
  return [...list, item];
}

/** Append-or-replace a Blueprint by its `unitId` (1:1 with the unit). */
function upsertBlueprint(list: Blueprint[], item: Blueprint): Blueprint[] {
  const idx = list.findIndex((x) => x.unitId === item.unitId);
  if (idx >= 0) {
    const next = list.slice();
    next[idx] = item;
    return next;
  }
  return [...list, item];
}

/** Upload the freshly-edited library.json to Bunny so the CDN-served copy the CLI
 *  reads reflects the publish. Runs on --push only. */
async function uploadLibrary(uploader: ReturnType<typeof makeUploader>): Promise<void> {
  const body = readFileSync(LIBRARY_JSON);
  await putObject(uploader, LIBRARY_OBJECT_KEY, body, LIBRARY_JSON);
  console.log(`  UPLOADED ${LIBRARY_OBJECT_KEY} (${body.byteLength} bytes)`);
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
  /** Tags (#082): filter-only unit labels carried into the published Unit. */
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

const BLOCK_KINDS = ["template", "recipe", "asset"];
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

// ── Planning records (printed verbatim in dry-run) ──────────────────────────────

interface PlannedUpload {
  objectKey: string;
  localPath: string;
  exists: boolean;
}

function printPlan(
  label: string,
  uploads: PlannedUpload[],
  libraryEdit: string,
  preview?: unknown,
): void {
  console.log(`\n=== ${label} ===`);
  console.log(`\nStorage objects (${uploads.length}):`);
  for (const u of uploads) {
    console.log(`  ${u.exists ? "" : "[missing local!] "}${u.objectKey}  <-  ${u.localPath}`);
  }
  console.log(`\nlibrary.json edit: ${libraryEdit}`);
  // The EXACT object that would be written (compact, one line) — so the dry-run
  // shows the sanitized published value, never just the operation name.
  if (preview !== undefined) {
    console.log(`\nlibrary.json value: ${JSON.stringify(preview)}`);
  }
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
  // the Bunny storageUrl). Performed on --push only.
  const showcaseCopies = manifest.media.map((file) => ({
    from: join(dir, file),
    to: join(SHOWCASE_ROOT, unitId, basename(file)),
    rel: `public/showcase/${unitId}/${basename(file)}`,
  }));

  const prov = manifest.provenance ?? {};
  const templateId = prov.template ?? "";
  const recipeIds = prov.recipes ?? [];
  const assetIds = prov.assets ?? [];
  // Tags (#082): filter-only unit labels. Absent in older units -> [].
  // The look / register is a TAG now (the `style` block kind was removed). If a
  // unit.json still carries a `provenance.style` slug, fold it into the tags
  // (deduped, lead position) instead of writing a style block-role.
  const baseTags = Array.isArray(manifest.tags)
    ? manifest.tags.filter((t) => typeof t === "string")
    : [];
  const lookTag = typeof prov.style === "string" ? prov.style : "";
  const tags =
    lookTag && !baseTags.includes(lookTag) ? [lookTag, ...baseTags] : baseTags;

  // The published Unit object that lands in library.json.
  const publishedUnit: Unit = {
    id: unitId,
    format: manifest.format as Unit["format"],
    title: manifest.title ?? manifest.slug,
    blurb: manifest.blurb ?? "",
    templateId,
    recipeIds,
    assetIds,
    mediaCount: manifest.media.length,
    media: buildMedia(false),
    ...(tags.length > 0 ? { tags } : {}),
  };

  // Backstop: the published Unit must carry no local path. The media src is
  // `/showcase/<id>/<basename>` and storageUrl is a public URL (both safe by
  // construction); this assertion locks that against regressions.
  assertNoLocalPaths({ ...publishedUnit, media: buildMedia(true) }, `unit:${unitId} library.json`);

  if (!push) {
    printPlan(
      `DRY-RUN publish-unit ${unitId}`,
      uploads,
      `append/replace units[id=${unitId}] (idempotent)`,
      publishedUnit,
    );
    const missing = uploads.filter((u) => !u.exists);
    if (missing.length > 0) {
      console.warn(`\n  WARNING: ${missing.length} media file(s) have no local copy.`);
    }
    console.log(
      `\n  NOTE: provenance references template:${templateId || "(none)"}, recipes:[${recipeIds.join(", ")}], assets:[${assetIds.join(", ")}]. These are recorded on the unit verbatim; a referenced block missing from library.json simply has no detail page yet.`,
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
  const uploader = makeUploader();
  for (const u of uploads) {
    if (!u.exists) {
      console.warn(`  SKIP (missing local file): ${u.localPath}`);
      continue;
    }
    await putObject(uploader, u.objectKey, readFileSync(u.localPath), u.localPath);
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

  // Edit library.json (media carries storageUrl when a base URL is set).
  const snapshotUnit: Unit = { ...publishedUnit, media: buildMedia(true) };
  const doc = loadLibrary();
  doc.units = upsertUnit(doc.units, snapshotUnit);
  writeLibrary(doc);
  console.log(`  library.json: upserted unit ${unitId} (${doc.units.length} unit(s))`);
  await uploadLibrary(uploader);
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

  // Refs that go into library.json. Any non-remote ref is a local file destined
  // for Storage, so its PUBLISHED form is the Bunny public URL. When no Storage
  // URL is resolvable (dry-run with no env), strip to the basename — never the raw
  // local path. Already-remote (http/https) refs pass through unchanged.
  const publishedRefs = (spec.refs ?? []).map((ref) => {
    if (/^https?:\/\//i.test(ref)) return ref;
    const url = publicUrlFor(blockObjectKey(spec.kind, spec.id, ref));
    if (url) return url;
    return sanitizeForPublish(ref, { field: `block:${spec.id} refs[]` });
  });

  // The published Block object — refs are the sanitized list above.
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

  // Backstop: the published mirror block may carry no local path. Runs in dry-run
  // too so a leak is caught BEFORE anyone passes --push.
  assertNoLocalPaths(publishedBlock, `block:${spec.id} library.json`);

  if (!push) {
    printPlan(
      `DRY-RUN publish-block ${spec.kind}:${spec.id}`,
      refUploads,
      `append/replace blocks[id=${spec.id}] (idempotent)`,
      publishedBlock,
    );
    const missing = refUploads.filter((u) => !u.exists);
    if (missing.length > 0) {
      console.warn(`\n  WARNING: ${missing.length} ref media file(s) have no local copy.`);
    }
    return;
  }

  // ── live push ──
  const uploader = makeUploader();
  for (const u of refUploads) {
    if (!u.exists) {
      console.warn(`  SKIP (missing ref file): ${u.localPath}`);
      continue;
    }
    await putObject(uploader, u.objectKey, readFileSync(u.localPath), u.localPath);
    console.log(`  UPLOADED ${u.objectKey}`);
  }

  const doc = loadLibrary();
  doc.blocks = upsertBlock(doc.blocks, publishedBlock);
  writeLibrary(doc);
  console.log(`  library.json: upserted block ${spec.id} (${doc.blocks.length} block(s))`);
  await uploadLibrary(uploader);
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
// We upload the payload to Bunny under blueprints/<unitId>/..., set each uploaded
// file's public storageUrl back into the blueprint object (so the committed
// mirror resolves remotely), and append/replace it in library.json (idempotent by
// unitId).

/** A minimal structural guard for the #074 Blueprint shape. */
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

/** A planned blueprint payload upload, carrying the file size + an oversize flag. */
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

  // Enumerate the payload files RELATIVE to the blueprint dir.
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
  // is uploadable; record oversize files in `oversizeSkipped` (kept on disk).
  const buildPublished = (withStorage: boolean): Blueprint => {
    const bp: Blueprint = {
      ...blueprint,
      assets: blueprint.assets.map((a) => {
        const rel = a.path?.replace(/\\/g, "/").replace(/^\.\//, "");
        const plan = rel ? uploads.find((u) => u.rel === rel) : undefined;
        const next: typeof a = { ...a };
        let storageUrl: string | undefined;
        if (withStorage && plan && plan.exists && !plan.oversize) {
          const url = publicUrlFor(plan.objectKey);
          if (url) {
            next.storageUrl = url;
            storageUrl = url;
          }
        }
        // SECURITY: never let an absolute local path survive into `path`. With a
        // storageUrl, drop to the curated `assets/<basename>` form; without one,
        // strip to `<basename>` (by-ref) and LOUD-warn. Never the absolute path.
        if (typeof next.path === "string" && looksLocal(next.path)) {
          const safe = storageUrl ? `assets/${basename(next.path)}` : undefined;
          next.path = sanitizeForPublish(next.path, {
            safe,
            field: `blueprint:${unitId} assets[slot=${a.slot ?? "?"}].path`,
          });
        }
        return next;
      }),
    };
    if (bp.composition && compPlan && compPlan.exists && !compPlan.oversize) {
      const composition = { ...bp.composition };
      let compStorageUrl: string | undefined;
      if (withStorage) {
        const url = publicUrlFor(compPlan.objectKey);
        if (url) {
          composition.storageUrl = url;
          compStorageUrl = url;
        }
      }
      if (typeof composition.file === "string" && looksLocal(composition.file)) {
        composition.file = sanitizeForPublish(composition.file, {
          safe: compStorageUrl ? basename(composition.file) : undefined,
          field: `blueprint:${unitId} composition.file`,
        });
      }
      // Inline the composition HTML into the committed mirror when small.
      if (compPlan.bytes <= COMPOSITION_INLINE_MAX_BYTES) {
        composition.html = readFileSync(compPlan.localPath, "utf8");
      }
      bp.composition = composition;
    } else if (bp.composition && typeof bp.composition.file === "string" && looksLocal(bp.composition.file)) {
      bp.composition = {
        ...bp.composition,
        file: sanitizeForPublish(bp.composition.file, {
          field: `blueprint:${unitId} composition.file`,
        }),
      };
    }
    if (oversizeRels.length > 0) bp.oversizeSkipped = oversizeRels;
    return bp;
  };

  // Backstop: build the object that WOULD be written and refuse loudly if any
  // local path survived the per-field sanitizer. Runs in dry-run too.
  assertNoLocalPaths(buildPublished(false), `blueprint:${unitId} library.json`);
  assertNoLocalPaths(buildPublished(true), `blueprint:${unitId} library.json (storage)`);

  if (!push) {
    const planned: PlannedUpload[] = uploadable.map((u) => ({
      objectKey: u.objectKey,
      localPath: u.localPath,
      exists: u.exists,
    }));
    printPlan(
      `DRY-RUN publish-blueprint ${unitId}`,
      planned,
      `append/replace blueprints[unitId=${unitId}] (idempotent)`,
    );
    const missing = uploads.filter((u) => !u.exists);
    if (missing.length > 0) {
      console.warn(`\n  WARNING: ${missing.length} payload file(s) referenced by the blueprint have no local copy:`);
      for (const m of missing) console.warn(`    ${m.rel}`);
    }
    if (oversize.length > 0) {
      console.warn(`\n  OVERSIZE (> ${(BLUEPRINT_MAX_BYTES / 1024 / 1024).toFixed(0)} MiB cap) — NOT uploaded, kept on disk:`);
      for (const o of oversize) {
        console.warn(`    ${o.rel}  (${(o.bytes / 1024 / 1024).toFixed(1)} MiB)`);
      }
      console.warn(`  These ${oversize.length} file(s) WOULD be recorded in the blueprint's oversizeSkipped[] (storageUrl absent, local path kept).`);
    }
    console.log(`\n  Blueprint payload: ${uploadable.length} file(s) WOULD upload under blueprints/${unitId}/`);
    return;
  }

  // ── live push ──
  const uploader = makeUploader();
  for (const u of uploads) {
    if (!u.exists) {
      console.warn(`  SKIP (missing payload file): ${u.localPath}`);
      continue;
    }
    if (u.oversize) {
      console.warn(`  OVERSIZE SKIP: ${u.rel} (${u.bytes} bytes) exceeds the ${(BLUEPRINT_MAX_BYTES / 1024 / 1024).toFixed(0)} MiB cap — kept on disk, recorded in oversizeSkipped[]`);
      continue;
    }
    await putObject(uploader, u.objectKey, readFileSync(u.localPath), u.localPath);
    console.log(`  UPLOADED ${u.objectKey}`);
  }

  const publishedBlueprint = buildPublished(true);
  const doc = loadLibrary();
  doc.blueprints = upsertBlueprint(doc.blueprints, publishedBlueprint);
  writeLibrary(doc);
  console.log(`  library.json: upserted blueprint ${unitId} (${doc.blueprints.length} blueprint(s))`);
  await uploadLibrary(uploader);
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
      "\ndry-run: nothing uploaded, library.json untouched. Re-run with --push to apply.",
    );
  }
}

// Only run the CLI when invoked directly (not when imported for its exported helpers).
if (import.meta.main) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
