// `ralphy unit` — project-local curated deliverables (#069).
//
// A *unit* is a finished deliverable assembled from COPIES of selected
// `artifacts/` files, living at `workspace/projects/<id>/units/<slug>/` with a
// `unit.json` manifest that mirrors the library-v2 Unit entity. This is the
// project-side half of the Unit model (the library half is #063); publish
// (#056) reads `units/*/unit.json` directly.
//
// Hard rules (AGENTS.md invariant #14 — append-only):
//   • COPY, never move. The source `artifacts/` files are left untouched.
//   • `units/` is append-only. A new slug = a new dir. A re-`create` on an
//     existing slug writes `units/<slug>.v2/` (then `.v3`…), never overwrites.
//   • `add` appends to `media`; it never drops or rewrites existing entries.
//   • `delete` is the only destructive verb — allowed because the user invoked
//     it explicitly.

import { Command } from "commander";
import fs from "node:fs/promises";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { imageSize } from "image-size";
import { projectsDir } from "../lib/paths.js";
import { out, ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import {
  UnitManifestSchema,
  UNIT_FORMATS,
  isValidUnitSlug,
  type UnitManifest,
  type UnitMediaMeta,
  type UnitProvenance,
} from "../lib/schemas/unit.js";

const UNITS_DIRNAME = "units";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);
const VIDEO_EXTS = new Set([".mp4", ".mov", ".webm", ".m4v"]);

/**
 * The common aspect ratios we snap a detected w:h to (within a small relative
 * tolerance) so the catalog stores a clean CSS "W / H" string instead of a raw
 * pixel ratio. Order matters only for readability; each is tested independently.
 */
const COMMON_ASPECTS: Array<[number, number]> = [
  [1, 1],
  [4, 5],
  [9, 16],
  [16, 9],
  [3, 2],
  [2, 3],
];

/** Reduce w:h to a clean common "W / H" if it maps to one within ~2%; else raw. */
function aspectString(width: number, height: number): string | undefined {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }
  const ratio = width / height;
  const TOL = 0.02; // 2% relative tolerance
  for (const [w, h] of COMMON_ASPECTS) {
    const target = w / h;
    if (Math.abs(ratio - target) / target <= TOL) return `${w} / ${h}`;
  }
  return `${width} / ${height}`;
}

/** Probe an image header for its dimensions. Returns null on any failure. */
function imageDimensions(absPath: string): { width: number; height: number } | null {
  try {
    const { width, height } = imageSize(readFileSync(absPath));
    if (typeof width === "number" && typeof height === "number") return { width, height };
  } catch {
    /* unreadable / unsupported header */
  }
  return null;
}

/** Probe a video stream for its dimensions via ffprobe. Returns null on failure. */
function videoDimensions(absPath: string): { width: number; height: number } | null {
  try {
    const r = spawnSync(
      "ffprobe",
      [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=p=0",
        absPath,
      ],
      { encoding: "utf8" },
    );
    if (r.status !== 0 || !r.stdout) return null;
    const first = r.stdout.trim().split("\n")[0] ?? "";
    const [w, h] = first.split(",").map((s) => parseInt(s.trim(), 10));
    if (Number.isFinite(w) && Number.isFinite(h) && w! > 0 && h! > 0) {
      return { width: w!, height: h! };
    }
  } catch {
    /* ffprobe missing or errored */
  }
  return null;
}

/**
 * Detect a copied media file's intrinsic aspect + kind. Kind is derived from the
 * extension first (so it is always known); aspect comes from a header read for
 * images and ffprobe for videos. On any detection failure aspect is omitted —
 * the create must NEVER crash on undetectable media.
 */
function detectMediaMeta(absPath: string): UnitMediaMeta {
  const ext = path.extname(absPath).toLowerCase();
  const kind: UnitMediaMeta["kind"] = VIDEO_EXTS.has(ext) ? "video" : "image";
  const dims = kind === "video" ? videoDimensions(absPath) : imageDimensions(absPath);
  const aspect = dims ? aspectString(dims.width, dims.height) : undefined;
  return aspect ? { aspect, kind } : { kind };
}

/**
 * Build the `media_meta` map for an ordered list of unit-relative basenames that
 * live in `unitDir`. Files whose meta could not be detected still get a `kind`
 * entry (extension-derived); aspect is simply absent for those.
 */
function buildMediaMeta(unitDir: string, basenames: string[]): Record<string, UnitMediaMeta> {
  const meta: Record<string, UnitMediaMeta> = {};
  for (const base of basenames) {
    const ext = path.extname(base).toLowerCase();
    // Only record meta for media we recognize; skip stray non-media filenames.
    if (!IMAGE_EXTS.has(ext) && !VIDEO_EXTS.has(ext)) continue;
    meta[base] = detectMediaMeta(path.join(unitDir, base));
  }
  return meta;
}

/** Resolve `<project>` to its on-disk dir, refusing if it does not exist. */
function resolveProjectDir(projectId: string): string {
  const dir = path.join(projectsDir(), projectId);
  if (!existsSync(dir)) {
    raiseError("E_NOT_FOUND", { kind: "Project", id: projectId });
  }
  return dir;
}

function unitsRoot(projectDir: string): string {
  return path.join(projectDir, UNITS_DIRNAME);
}

/**
 * Resolve the append-only directory name for a new unit. If `<slug>/` is free,
 * returns `<slug>`. Otherwise mirrors the asset auto-version rule: scans for
 * existing `<slug>.vN` dirs and returns the next free `<slug>.v<max+1>` so the
 * prior unit survives untouched. Never overwrites.
 */
function resolveNewUnitDirName(unitsDir: string, slug: string): string {
  if (!existsSync(path.join(unitsDir, slug))) return slug;
  let max = 1;
  if (existsSync(unitsDir)) {
    const re = new RegExp(`^${escapeRe(slug)}\\.v(\\d+)$`);
    // Synchronous read is fine here — the units dir is small.
    for (const entry of readdirSync(unitsDir)) {
      const m = re.exec(entry);
      if (m) {
        const n = parseInt(m[1]!, 10);
        if (n > max) max = n;
      }
    }
  }
  return `${slug}.v${max + 1}`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Compile a single path-segment glob (`*`, `?`) into an anchored regex. */
function segRe(seg: string): RegExp {
  const body = seg
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${body}$`);
}

/**
 * Expand a glob RELATIVE to the project dir into a stable-sorted list of
 * project-relative file paths. Self-contained (no `bun`/`fast-glob` dep so the
 * `bunx tsx` smoke path resolves): walks the tree segment-by-segment, where a
 * `**` segment matches zero-or-more directory levels. Returns only files.
 * Refuses (caller's E_VALIDATION_FAILED) on zero matches.
 */
function expandFrom(projectDir: string, glob: string): string[] {
  const segments = glob.split("/").filter((s) => s.length > 0);
  const results: string[] = [];

  function walk(absDir: string, relDir: string, segIdx: number): void {
    if (!existsSync(absDir)) return;
    // Structural type + cast: @types/node version drift changed the
    // `withFileTypes:true` overload's Dirent name-type (string → NonSharedBuffer),
    // so `ReturnType<typeof readdirSync>` no longer matches and `e.name` infers as
    // a buffer. Pin the shape this helper actually uses. See notes/issues/done/085.
    let entries: { name: string; isDirectory(): boolean; isFile(): boolean }[];
    try {
      entries = readdirSync(absDir, {
        withFileTypes: true,
      }) as unknown as typeof entries;
    } catch {
      return;
    }
    const seg = segments[segIdx]!;
    const isLast = segIdx === segments.length - 1;

    if (seg === "**") {
      // `**` matches zero levels (try the rest of the pattern here) …
      walkAt(absDir, relDir, segIdx + 1);
      // … and any number of directory levels deeper.
      for (const e of entries) {
        if (e.isDirectory()) {
          walk(path.join(absDir, e.name), path.posix.join(relDir, e.name), segIdx);
        }
      }
      return;
    }

    const re = segRe(seg);
    for (const e of entries) {
      if (!re.test(e.name)) continue;
      const childAbs = path.join(absDir, e.name);
      const childRel = relDir ? path.posix.join(relDir, e.name) : e.name;
      if (isLast) {
        if (e.isFile()) results.push(childRel);
      } else if (e.isDirectory()) {
        walk(childAbs, childRel, segIdx + 1);
      }
    }
  }

  // Helper so a `**` can re-enter the matcher at the same directory.
  function walkAt(absDir: string, relDir: string, segIdx: number): void {
    if (segIdx >= segments.length) return;
    walk(absDir, relDir, segIdx);
  }

  if (segments.length > 0) walk(projectDir, "", 0);
  // De-dup (a `**` pattern can reach the same file via multiple paths).
  const unique = Array.from(new Set(results));
  unique.sort((a, b) => a.localeCompare(b));
  return unique;
}

function buildProvenance(opts: any): UnitProvenance | undefined {
  const p: UnitProvenance = {};
  if (opts.template) p.template = String(opts.template);
  if (opts.style) p.style = String(opts.style);
  if (Array.isArray(opts.recipe) && opts.recipe.length) p.recipes = opts.recipe.map(String);
  if (Array.isArray(opts.asset) && opts.asset.length) p.assets = opts.asset.map(String);
  return Object.keys(p).length ? p : undefined;
}

async function readUnitManifest(unitDir: string): Promise<UnitManifest | null> {
  const fp = path.join(unitDir, "unit.json");
  if (!existsSync(fp)) return null;
  try {
    const raw = await fs.readFile(fp, "utf8");
    return UnitManifestSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeUnitManifest(unitDir: string, manifest: UnitManifest): Promise<void> {
  await fs.writeFile(
    path.join(unitDir, "unit.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
}

/**
 * Copy each project-relative source into `unitDir`, preserving filenames in the
 * given order. Returns the ordered list of destination basenames written.
 * Refuses to clobber an existing media file in the unit (append-only): if a
 * basename collision occurs, the file is suffixed `-2`, `-3`… before its ext.
 */
async function copyMedia(
  projectDir: string,
  unitDir: string,
  sources: string[],
): Promise<string[]> {
  await fs.mkdir(unitDir, { recursive: true });
  const written: string[] = [];
  for (const rel of sources) {
    const src = path.join(projectDir, rel);
    let base = path.basename(rel);
    let dest = path.join(unitDir, base);
    if (existsSync(dest)) {
      const ext = path.extname(base);
      const stem = path.basename(base, ext);
      let n = 2;
      while (existsSync(path.join(unitDir, `${stem}-${n}${ext}`))) n++;
      base = `${stem}-${n}${ext}`;
      dest = path.join(unitDir, base);
    }
    await fs.copyFile(src, dest);
    written.push(base);
  }
  return written;
}

export function unitCmd() {
  const cmd = new Command("unit").description(
    "Manage project-local curated deliverables (units = copies of selected assets + provenance)",
  );

  // ── create ────────────────────────────────────────────────────────────────
  cmd
    .command("create <project>")
    .description("Form a unit by copying matched assets into units/<slug>/ + writing unit.json")
    .requiredOption("--slug <slug>", "Unit slug (kebab-case)")
    .requiredOption("--format <format>", `Media format. One of: ${UNIT_FORMATS.join(", ")}`)
    .requiredOption("--from <glob>", "Glob, relative to the project dir, of source media to copy (e.g. 'artifacts/images/outline-*.png')")
    .option("--title <text>", "Human-readable unit title")
    .option("--blurb <text>", "Short unit description")
    .option("--template <slug>", "Provenance: the structure template slug")
    .option("--style <slug>", "Provenance: the visual style slug")
    .option("--recipe <slug>", "Provenance: a recipe slug (repeatable)", collect, [])
    .option("--asset <slug>", "Provenance: a reusable asset slug (repeatable)", collect, [])
    .action(async (project: string, opts: any) => {
      const slug = String(opts.slug);
      if (!isValidUnitSlug(slug)) {
        raiseError("E_VALIDATION_FAILED", {
          target: "--slug",
          detail: `'${slug}' is not kebab-case (lowercase letters, digits, hyphens)`,
        });
      }
      const format = String(opts.format);
      if (!(UNIT_FORMATS as readonly string[]).includes(format)) {
        raiseError("E_VALIDATION_FAILED", {
          target: "--format",
          detail: `'${format}' is not a known format. One of: ${UNIT_FORMATS.join(", ")}`,
        });
      }

      const projectDir = resolveProjectDir(project);
      const sources = expandFrom(projectDir, String(opts.from));
      if (sources.length === 0) {
        raiseError("E_VALIDATION_FAILED", {
          target: "--from",
          detail: `no files matched '${opts.from}' relative to ${projectDir}`,
        });
      }

      const unitsDir = unitsRoot(projectDir);
      // Append-only: never overwrite an existing unit slug dir.
      const dirName = resolveNewUnitDirName(unitsDir, slug);
      const unitDir = path.join(unitsDir, dirName);

      const media = await copyMedia(projectDir, unitDir, sources);
      const mediaMeta = buildMediaMeta(unitDir, media);

      const manifest: UnitManifest = {
        slug,
        format: format as UnitManifest["format"],
        media,
        ...(Object.keys(mediaMeta).length && { media_meta: mediaMeta }),
        ...(buildProvenance(opts) && { provenance: buildProvenance(opts) }),
        source_assets: sources,
        created: new Date().toISOString(),
        ...(opts.title && { title: String(opts.title) }),
        ...(opts.blurb && { blurb: String(opts.blurb) }),
      };
      const parsed = UnitManifestSchema.parse(manifest);
      await writeUnitManifest(unitDir, parsed);

      ok(`Unit created: ${dirName} (${media.length} media)`);
      out({
        slug,
        dir: dirName,
        format,
        media_count: media.length,
        path: path.relative(projectDir, unitDir),
        versioned: dirName !== slug,
        manifest: parsed,
      });
    });

  // ── list ────────────────────────────────────────────────────────────────
  cmd
    .command("list <project>")
    .description("List units in a project")
    .action(async (project: string) => {
      const projectDir = resolveProjectDir(project);
      const unitsDir = unitsRoot(projectDir);
      const rows: Array<Record<string, unknown>> = [];
      if (existsSync(unitsDir)) {
        const entries = (await fs.readdir(unitsDir, { withFileTypes: true }))
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort((a, b) => a.localeCompare(b));
        for (const name of entries) {
          const manifest = await readUnitManifest(path.join(unitsDir, name));
          if (!manifest) continue;
          rows.push({
            dir: name,
            slug: manifest.slug,
            format: manifest.format,
            media_count: manifest.media.length,
            created: manifest.created,
          });
        }
      }
      out(rows);
    });

  // ── show ────────────────────────────────────────────────────────────────
  cmd
    .command("show <project> <slug>")
    .description("Show a unit's manifest + resolved media paths")
    .action(async (project: string, slug: string) => {
      const projectDir = resolveProjectDir(project);
      const unitDir = path.join(unitsRoot(projectDir), slug);
      const manifest = await readUnitManifest(unitDir);
      if (!manifest) raiseError("E_NOT_FOUND", { kind: "Unit", id: slug });
      out({
        ...manifest,
        resolved_media: manifest!.media.map((m) =>
          path.join(path.relative(projectDir, unitDir), m),
        ),
      });
    });

  // ── add ────────────────────────────────────────────────────────────────
  cmd
    .command("add <project> <slug>")
    .description("Copy more media into an existing unit (appends to media, never drops existing)")
    .requiredOption("--from <glob>", "Glob, relative to the project dir, of source media to copy")
    .action(async (project: string, slug: string, opts: any) => {
      const projectDir = resolveProjectDir(project);
      const unitDir = path.join(unitsRoot(projectDir), slug);
      const manifest = await readUnitManifest(unitDir);
      if (!manifest) raiseError("E_NOT_FOUND", { kind: "Unit", id: slug });

      const sources = expandFrom(projectDir, String(opts.from));
      if (sources.length === 0) {
        raiseError("E_VALIDATION_FAILED", {
          target: "--from",
          detail: `no files matched '${opts.from}' relative to ${projectDir}`,
        });
      }
      const added = await copyMedia(projectDir, unitDir, sources);
      const addedMeta = buildMediaMeta(unitDir, added);
      const mergedMeta = { ...(manifest!.media_meta ?? {}), ...addedMeta };

      const updated: UnitManifest = {
        ...manifest!,
        media: [...manifest!.media, ...added],
        ...(Object.keys(mergedMeta).length && { media_meta: mergedMeta }),
        source_assets: [...(manifest!.source_assets ?? []), ...sources],
      };
      const parsed = UnitManifestSchema.parse(updated);
      await writeUnitManifest(unitDir, parsed);

      ok(`Added ${added.length} media to unit: ${slug}`);
      out({
        slug,
        added,
        media_count: parsed.media.length,
        manifest: parsed,
      });
    });

  // ── delete (destructive — explicit user intent only) ──────────────────────
  cmd
    .command("delete <project> <slug>")
    .description("Delete a unit directory (destructive — only run on explicit user intent)")
    .action(async (project: string, slug: string) => {
      const projectDir = resolveProjectDir(project);
      const unitDir = path.join(unitsRoot(projectDir), slug);
      if (!existsSync(unitDir)) raiseError("E_NOT_FOUND", { kind: "Unit", id: slug });
      await fs.rm(unitDir, { recursive: true, force: true });
      ok(`Unit deleted: ${slug}`);
      out({ deleted: slug });
    });

  return cmd;
}

/** commander reducer to collect repeatable options into an array. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}
