// Unit-formation core (#069) — the library half of `ralphy unit`.
//
// Extracted from cli/commands/unit.ts (#511) so the CLI verb and the
// `ralphy-unit` / `ralphy-social-copy` workflow-graph executors call the SAME
// code path: COPY-never-move media selection, append-only versioned unit dirs
// (`units/<slug>` → `units/<slug>.v2` …), unit.json manifests, best-effort
// provenance-graph capture, and the #403 caption write (prior captions
// archived into caption_versions, never dropped).
//
// The command keeps ownership of CLI-side concerns (raiseError codes, the
// --polished scorecard gate, output shaping); this module owns the mechanics.

import fs from "node:fs/promises";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { imageSize } from "image-size";
import { projectDir } from "./paths.js";
import {
  UnitManifestSchema,
  type UnitArticleMeta,
  type UnitManifest,
  type UnitMediaMeta,
  type UnitProvenance,
} from "./schemas/unit.js";
import { buildUnitCaption, type CaptionContext, type CaptionDraftFn } from "./social/caption.js";
import { buildProvenanceGraph } from "./provenance.js";
import { PROVENANCE_GRAPH_FILENAME } from "./schemas/provenance-graph.js";

export const UNITS_DIRNAME = "units";

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
 * unit formation must NEVER crash on undetectable media.
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
export function buildMediaMeta(unitDir: string, basenames: string[]): Record<string, UnitMediaMeta> {
  const meta: Record<string, UnitMediaMeta> = {};
  for (const base of basenames) {
    const ext = path.extname(base).toLowerCase();
    // Only record meta for media we recognize; skip stray non-media filenames.
    if (!IMAGE_EXTS.has(ext) && !VIDEO_EXTS.has(ext)) continue;
    meta[base] = detectMediaMeta(path.join(unitDir, base));
  }
  return meta;
}

/** `<project>/units/` for an already-resolved project dir. */
export function unitsRoot(projectDirAbs: string): string {
  return path.join(projectDirAbs, UNITS_DIRNAME);
}

/**
 * Resolve the append-only directory name for a new unit. If `<slug>/` is free,
 * returns `<slug>`. Otherwise mirrors the asset auto-version rule: scans for
 * existing `<slug>.vN` dirs and returns the next free `<slug>.v<max+1>` so the
 * prior unit survives untouched. Never overwrites.
 */
export function resolveNewUnitDirName(unitsDir: string, slug: string): string {
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
 * Zero matches → empty array (the caller decides how to refuse).
 */
export function expandFrom(projectDirAbs: string, glob: string): string[] {
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

  if (segments.length > 0) walk(projectDirAbs, "", 0);
  // De-dup (a `**` pattern can reach the same file via multiple paths).
  const unique = Array.from(new Set(results));
  unique.sort((a, b) => a.localeCompare(b));
  return unique;
}

export async function readUnitManifest(unitDir: string): Promise<UnitManifest | null> {
  const fp = path.join(unitDir, "unit.json");
  if (!existsSync(fp)) return null;
  try {
    const raw = await fs.readFile(fp, "utf8");
    return UnitManifestSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writeUnitManifest(unitDir: string, manifest: UnitManifest): Promise<void> {
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
export async function copyMedia(
  projectDirAbs: string,
  unitDir: string,
  sources: string[],
): Promise<string[]> {
  await fs.mkdir(unitDir, { recursive: true });
  const written: string[] = [];
  for (const rel of sources) {
    const src = path.join(projectDirAbs, rel);
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

// ─── createUnit ──────────────────────────────────────────────────────────────

export interface CreateUnitArgs {
  projectId: string;
  /** Kebab-case unit slug (validated by the caller via isValidUnitSlug). */
  slug: string;
  /** One of UNIT_FORMATS (validated by the caller). */
  format: UnitManifest["format"];
  /** Ordered PROJECT-RELATIVE source files to COPY (already expanded, non-empty). */
  sources: string[];
  title?: string;
  blurb?: string;
  provenance?: UnitProvenance;
  /**
   * Article frontmatter (#526) — present only when `format === "article"`. The
   * `body` field is OPTIONAL here: when omitted, `createUnit` derives it from
   * the first copied `.md` in `media`. `title` falls back to `args.title`.
   */
  article?: Omit<UnitArticleMeta, "body"> & { body?: string };
}

export interface CreateUnitResult {
  /** The actual dir name written (`<slug>` or the append-only `<slug>.vN`). */
  dirName: string;
  /** Absolute unit dir. */
  unitDir: string;
  manifest: UnitManifest;
  /** `provenance.json` basename when the graph capture succeeded. */
  provenanceGraphFile: string | null;
}

/**
 * Form a unit (#069): COPY the sources into an append-only `units/<slug>[.vN]/`
 * dir, detect media meta, capture the provenance graph best-effort, and write
 * a schema-valid unit.json. Never moves or mutates the source `artifacts/`.
 */
export async function createUnit(args: CreateUnitArgs): Promise<CreateUnitResult> {
  const projDir = projectDir(args.projectId);
  const unitsDir = unitsRoot(projDir);
  // Append-only: never overwrite an existing unit slug dir.
  const dirName = resolveNewUnitDirName(unitsDir, args.slug);
  const unitDir = path.join(unitsDir, dirName);

  const media = await copyMedia(projDir, unitDir, args.sources);
  const mediaMeta = buildMediaMeta(unitDir, media);

  // Provenance graph (#420) — best-effort capture of the reproduction chain
  // from the project's logs/manifests. Built read-only, written as a sibling
  // `provenance.json` (append-only: this is a fresh dir, never an overwrite).
  // A capture failure must never block unit formation — fall back to no graph.
  let provenanceGraphFile: string | null = null;
  try {
    const graph = await buildProvenanceGraph(args.projectId, args.slug);
    if (graph.nodes.length > 0) {
      await fs.writeFile(
        path.join(unitDir, PROVENANCE_GRAPH_FILENAME),
        JSON.stringify(graph, null, 2) + "\n",
        "utf8",
      );
      provenanceGraphFile = PROVENANCE_GRAPH_FILENAME;
    }
  } catch {
    /* best-effort — a graph capture failure never blocks the deliverable */
  }

  // Article frontmatter (#526): every `article` unit carries it, so the graph
  // route (ralphy-unit node, no article flags) still produces a self-contained
  // article. The `body` resolves to a copied media entry (explicit → first
  // copied .md); the rest falls back to sensible defaults (title → args.title →
  // slug, slug → the unit slug, empty description / canonical / tags).
  let article: UnitArticleMeta | undefined;
  if (args.format === "article") {
    const a = args.article;
    const body =
      a?.body && media.includes(a.body) ? a.body : media.find((m) => m.toLowerCase().endsWith(".md"));
    if (!body) {
      throw new Error(
        "article unit needs a markdown body: pass an article.body that is one of the copied media, or include a .md file in --from",
      );
    }
    article = {
      title: a?.title ?? args.title ?? args.slug,
      description: a?.description ?? "",
      slug: a?.slug ?? args.slug,
      tags: a?.tags ?? [],
      canonicalUrl: a?.canonicalUrl ?? "",
      ...(a?.hero && media.includes(a.hero) && { hero: a.hero }),
      body,
    };
  }

  const hasProvenance = args.provenance && Object.keys(args.provenance).length > 0;
  const manifest: UnitManifest = {
    slug: args.slug,
    format: args.format,
    media,
    ...(Object.keys(mediaMeta).length && { media_meta: mediaMeta }),
    ...(hasProvenance && { provenance: args.provenance }),
    ...(provenanceGraphFile && { provenance_graph: provenanceGraphFile }),
    source_assets: args.sources,
    created: new Date().toISOString(),
    ...(args.title && { title: args.title }),
    ...(args.blurb && { blurb: args.blurb }),
    ...(article && { article }),
  };
  const parsed = UnitManifestSchema.parse(manifest);
  await writeUnitManifest(unitDir, parsed);

  return { dirName, unitDir, manifest: parsed, provenanceGraphFile };
}

// ─── captionUnit (#403) ──────────────────────────────────────────────────────

export interface CaptionUnitArgs {
  projectId: string;
  /** The unit DIRECTORY name under `units/` (usually the slug). */
  dirName: string;
  /** Target-audience language for the copy. */
  language: string;
  /** Niche / register hint; defaults to the unit's provenance + tags. */
  niche?: string;
  /** Extra grounding text; defaults to the unit's blurb. */
  brief?: string;
  /** Re-draft even when a caption exists (prior archived into caption_versions). */
  force?: boolean;
  /** Injectable draft fn (tests) — defaults to the LLM / env-hook path. */
  draft?: CaptionDraftFn;
}

export type CaptionUnitResult =
  | { kind: "captioned"; manifest: UnitManifest; reDrafted: boolean }
  | { kind: "skipped"; manifest: UnitManifest; reason: string };

/**
 * Draft + persist platform-shaped social copy for ONE unit (#403). Append-only:
 * without `force` an existing caption short-circuits with `kind: "skipped"`;
 * with `force` the prior caption is archived into `caption_versions` (never
 * dropped). Returns null when the unit dir has no readable unit.json.
 */
export async function captionUnit(args: CaptionUnitArgs): Promise<CaptionUnitResult | null> {
  const projDir = projectDir(args.projectId);
  const unitDir = path.join(unitsRoot(projDir), args.dirName);
  const manifest = await readUnitManifest(unitDir);
  if (!manifest) return null;

  // Append-only: refuse to clobber an existing caption without force.
  if (manifest.caption && !args.force) {
    return {
      kind: "skipped",
      manifest,
      reason: "caption exists — pass force to re-draft (the prior caption is archived)",
    };
  }

  const nicheHint =
    args.niche != null
      ? args.niche
      : [manifest.provenance?.style, manifest.provenance?.template, ...(manifest.tags ?? [])]
          .filter(Boolean)
          .join(" ");

  const ctx: CaptionContext = {
    projectId: args.projectId,
    slug: manifest.slug,
    format: manifest.format,
    language: args.language,
    niche: nicheHint || undefined,
    title: manifest.title,
    blurb: manifest.blurb,
    tags: manifest.tags,
    brief: args.brief ?? manifest.blurb,
  };

  const caption = await buildUnitCaption({ ctx, draft: args.draft });

  // Archive the prior caption (append-only) when re-drafting with force.
  const priorVersions = manifest.caption_versions ?? [];
  const caption_versions = manifest.caption
    ? [...priorVersions, manifest.caption]
    : priorVersions.length
      ? priorVersions
      : undefined;

  const updated: UnitManifest = {
    ...manifest,
    caption,
    ...(caption_versions && { caption_versions }),
  };
  const parsed = UnitManifestSchema.parse(updated);
  await writeUnitManifest(unitDir, parsed);

  return { kind: "captioned", manifest: parsed, reDrafted: Boolean(manifest.caption) };
}
