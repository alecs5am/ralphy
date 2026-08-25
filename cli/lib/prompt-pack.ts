// The routing pack: the AGENTS.md router and every playbook it names, copied
// out of this CLI's own package and into the user's library.
//
// Why this exists: `skill install` writes a block into the agent's instruction
// file that says "read <repo>/AGENTS.md" and "playbooks live under
// docs/playbooks/". Both are repo-relative, and an agent runs in the user's
// home or their project — not in a ugc-cli checkout. On every machine without
// a checkout the routing pointed nowhere, so the router and 71 playbooks sat in
// the repository as dead weight. Installing them under `.ralphy/prompts/`
// with the repo-relative layout intact makes the pack root the `<repo>` the
// router already assumes, so every link inside it resolves unchanged.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";

import { workspace } from "./paths.js";

export const PACK_VERSION = 1;

/** One file in the pack, as the manifest records it. */
export interface PackFile {
  /** Repo-relative, and therefore also pack-relative. */
  path: string;
  bytes: number;
  sha256: string;
}

export interface PackManifest {
  packVersion: number;
  cliVersion: string;
  installedAt: number;
  /** The checkout or installed package the copy came from. */
  source: string;
  root: string;
  totalBytes: number;
  files: PackFile[];
}

/** This CLI's own package root: `cli/lib/prompt-pack.ts` → `../..`. */
export function packSource(): string {
  return path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..");
}

/** Where the pack lands. The library root, so `--root` and the env override apply. */
export function packRoot(): string {
  return path.join(workspace(), "prompts");
}

/* Three whole trees plus the router come along verbatim: the skills carry the
   HOW for every route, the playbooks carry what spans roles, and the guidelines
   are the prompt library the invariants make mandatory reading. Anything else
   has to be NAMED by one of them to ship, or the pack turns into a copy of the
   repository. */
const ROUTER = "AGENTS.md";
const TREES = [
  path.join(".agents", "skills"),
  path.join("docs", "playbooks"),
  "guidelines",
];

/** A markdown reference worth following: a real repo path, not a placeholder. */
function shippable(token: string): boolean {
  if (!token.endsWith(".md") || token.length > 200) return false;
  if (/[<>*{}]|\.ralphy|:\/\//.test(token)) return false;
  return token === ROUTER || token === "MODELS.md" || token.startsWith("docs/");
}

/* A skill is a directory, not a document: its references/ and scripts/ are part
   of it, and a skill whose script did not travel is a broken skill. So the trees
   ship every file, not only the markdown. */
async function walk(dir: string, root: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const found: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await walk(full, root));
    else found.push(path.relative(root, full));
  }
  return found;
}

/**
 * The pack's file list, relative to `source`: the router, the skill / playbook /
 * guideline trees, and the transitive closure of `docs/**` files those name.
 */
export async function packFiles(source: string): Promise<string[]> {
  const trees = await Promise.all(TREES.map((tree) => walk(path.join(source, tree), source)));
  const queue = [ROUTER, ...trees.flat()];
  const kept = new Set<string>();
  while (queue.length > 0) {
    const rel = queue.shift()!;
    if (kept.has(rel)) continue;
    const text = rel.endsWith(".md")
      ? await fs.readFile(path.join(source, rel), "utf-8").catch(() => null)
      : "";
    if (text === null) continue;
    kept.add(rel);
    for (const raw of text.split(/[\s`'"()[\],;]+/)) {
      const token = raw.replace(/[.,;:]+$/, "");
      /* Links here are file-relative -- the repo's own link lint enforces that
         -- so resolve against the referencing file before deciding. Without
         this the closure silently drops every doc a skill names. */
      const resolved = token.startsWith(".")
        ? path.posix.normalize(path.posix.join(path.posix.dirname(rel), token))
        : token;
      if (shippable(resolved)) queue.push(resolved);
    }
  }
  return [...kept].sort();
}

export async function readManifest(root = packRoot()): Promise<PackManifest | null> {
  const raw = await fs.readFile(path.join(root, "manifest.json"), "utf-8").catch(() => null);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as PackManifest;
  } catch {
    return null;
  }
}

/**
 * Copy the pack into the library. Idempotent: a file whose digest already
 * matches is left alone, so a reinstall is a no-op and the mtime of an
 * untouched playbook does not move.
 */
export async function installPack(input: {
  source?: string;
  root?: string;
  cliVersion: string;
}): Promise<PackManifest & { written: number; removed: number }> {
  const source = input.source ?? packSource();
  const root = input.root ?? packRoot();
  const wanted = await packFiles(source);
  const before = await readManifest(root);

  const files: PackFile[] = [];
  let written = 0;
  for (const rel of wanted) {
    const body = await fs.readFile(path.join(source, rel));
    const sha256 = createHash("sha256").update(body).digest("hex");
    files.push({ path: rel, bytes: body.byteLength, sha256 });
    const target = path.join(root, rel);
    const existing = await fs.readFile(target).catch(() => null);
    if (existing !== null && createHash("sha256").update(existing).digest("hex") === sha256) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    written += 1;
  }

  /* A file the pack dropped between releases has to leave the library too --
     a stale playbook the router no longer names is worse than a missing one,
     because the agent cannot tell it is stale. */
  let removed = 0;
  const keep = new Set(wanted);
  for (const stale of (before?.files ?? []).map((file) => file.path)) {
    if (keep.has(stale)) continue;
    await fs.rm(path.join(root, stale), { force: true });
    removed += 1;
  }

  const manifest: PackManifest = {
    packVersion: PACK_VERSION,
    cliVersion: input.cliVersion,
    installedAt: Date.now(),
    source,
    root,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  };
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  /* Written from `wanted`, not from the source tree: the catalog may only name
     files that actually travelled, or it becomes a list of dead links. */
  const catalog = await buildCatalog(source, wanted, input.cliVersion);
  await fs.writeFile(path.join(root, CATALOG_FILE), `${JSON.stringify(catalog, null, 2)}\n`);
  return { ...manifest, written, removed };
}

/* ── The catalog ───────────────────────────────────────────────────────────
 *
 * The desktop app has no checkout and no library CDN guarantee, so the pack
 * also carries an index of what it holds, by category. Every entry names a
 * file that ships in the same pack -- an entry whose document did not travel
 * would be a marketplace row that opens onto nothing.
 */

export type CatalogCategory = "skill" | "prompt" | "template" | "recipe" | "component";

export interface CatalogEntry {
  /** `<category>:<slug>`, stable across releases. */
  id: string;
  category: CatalogCategory;
  slug: string;
  title: string;
  summary: string;
  /** Pack-relative document that IS this entry, or null when it has no body here. */
  path: string | null;
  tags: string[];
}

export interface PackCatalog {
  catalogVersion: number;
  cliVersion: string;
  entries: CatalogEntry[];
}

export const CATALOG_VERSION = 1;
const CATALOG_FILE = "catalog.json";
const SUMMARY_MAX = 320;

const clip = (value: string) =>
  value.length <= SUMMARY_MAX ? value : `${value.slice(0, SUMMARY_MAX - 1).trimEnd()}…`;

const titleCase = (slug: string) =>
  slug.split("-").map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1)).join(" ");

/** First sentence of a folded frontmatter description, or the whole thing. */
function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return clip(flat.split(/(?<=[.!?])\s+/)[0] ?? flat);
}

/** The `description:` value of a SKILL.md, folded-scalar form included. */
function skillDescription(src: string): string {
  const front = src.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (front === undefined) return "";
  const folded = front.match(/^description:\s*[>|]-?\s*\n([\s\S]*?)(?=\n[A-Za-z_-]+:|$)/m);
  if (folded !== null) return folded[1]!.split("\n").map((line) => line.trim()).join(" ").trim();
  return front.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";
}

async function skillEntries(source: string, files: Set<string>): Promise<CatalogEntry[]> {
  const entries: CatalogEntry[] = [];
  for (const rel of [...files].filter((file) => /^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(file))) {
    const src = await fs.readFile(path.join(source, rel), "utf-8").catch(() => null);
    if (src === null) continue;
    const slug = rel.split("/")[2]!;
    const front = src.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    const namespace = front.match(/^namespace:\s*(\S+)/m)?.[1] ?? "user";
    entries.push({
      id: `skill:${slug}`,
      category: "skill",
      slug,
      title: titleCase(slug),
      summary: firstSentence(skillDescription(src)),
      path: rel,
      tags: [namespace],
    });
  }
  return entries;
}

async function promptEntries(source: string, files: Set<string>): Promise<CatalogEntry[]> {
  const entries: CatalogEntry[] = [];
  for (const rel of [...files].filter((file) => /^guidelines\/[^/]+\/guideline\.json$/.test(file))) {
    const raw = await fs.readFile(path.join(source, rel), "utf-8").catch(() => null);
    if (raw === null) continue;
    let meta: Record<string, unknown>;
    try { meta = JSON.parse(raw) as Record<string, unknown>; } catch { continue; }
    const slug = rel.split("/")[1]!;
    const body = `guidelines/${slug}/guideline.md`;
    const tagline = typeof meta.tagline === "string" ? meta.tagline : "";
    const description = typeof meta.description === "string" ? meta.description : "";
    entries.push({
      id: `prompt:${slug}`,
      category: "prompt",
      slug,
      title: typeof meta.name === "string" ? meta.name : titleCase(slug),
      summary: clip(tagline.length > 0 ? tagline : description),
      path: files.has(body) ? body : null,
      tags: [
        ...(typeof meta.kind === "string" ? [meta.kind] : []),
        ...(Array.isArray(meta.tags) ? meta.tags.filter((tag): tag is string => typeof tag === "string") : []),
      ],
    });
  }
  return entries;
}

const RECIPES = path.posix.join("docs", "ffmpeg-recipes.md");

/** `## Recipe N: \`name\`` plus the first prose line under it. */
async function recipeEntries(source: string, files: Set<string>): Promise<CatalogEntry[]> {
  if (!files.has(RECIPES)) return [];
  const text = await fs.readFile(path.join(source, RECIPES), "utf-8").catch(() => null);
  if (text === null) return [];
  const entries: CatalogEntry[] = [];
  const sections = text.split(/^## Recipe \d+: /m).slice(1);
  for (const section of sections) {
    const [heading, ...rest] = section.split("\n");
    const slug = heading!.match(/`([A-Za-z0-9_-]+)`/)?.[1];
    if (slug === undefined) continue;
    const summary = rest.find((line) => line.trim().length > 0 && !line.startsWith("#") && !line.startsWith("```"));
    entries.push({
      id: `recipe:${slug}`,
      category: "recipe",
      slug,
      title: slug,
      summary: clip((summary ?? "").replace(/[*`]/g, "").trim()),
      path: RECIPES,
      tags: ["ffmpeg"],
    });
  }
  return entries;
}

const TRANSITIONS = ".agents/skills/hyperframes/references/transitions/";

/** HyperFrames transition families -- the reusable visual blocks the pack ships. */
async function componentEntries(source: string, files: Set<string>): Promise<CatalogEntry[]> {
  const entries: CatalogEntry[] = [];
  for (const rel of [...files].filter((file) => file.startsWith(TRANSITIONS) && file.endsWith(".md"))) {
    const slug = path.posix.basename(rel, ".md");
    if (slug === "catalog") continue;
    const text = await fs.readFile(path.join(source, rel), "utf-8").catch(() => null);
    if (text === null) continue;
    const lines = text.split("\n");
    const title = lines.find((line) => line.startsWith("## "))?.slice(3).trim() ?? titleCase(slug);
    const summary = lines.find((line) => line.trim().length > 0 && !line.startsWith("#"));
    entries.push({
      id: `component:${slug}`,
      category: "component",
      slug,
      title,
      summary: clip((summary ?? "").replace(/[*`]/g, "").trim()),
      path: rel,
      tags: ["hyperframes", "transition"],
    });
  }
  return entries;
}

const TEMPLATES_INDEX = path.posix.join("docs", "templates-index.md");
const NOT_A_TEMPLATE = new Set(["kind", "vibe-reference", "vibe-style", "slug"]);

/**
 * The roster tables in `docs/templates-index.md`. That file is a snapshot of the
 * public library, so a row here names a template without carrying it: `path`
 * stays null rather than pointing every row at the same index document, which
 * would open 42 details onto one identical page.
 */
async function templateEntries(source: string, files: Set<string>): Promise<CatalogEntry[]> {
  if (!files.has(TEMPLATES_INDEX)) return [];
  const text = await fs.readFile(path.join(source, TEMPLATES_INDEX), "utf-8").catch(() => null);
  if (text === null) return [];
  const entries: CatalogEntry[] = [];
  const seen = new Set<string>();
  for (const line of text.split("\n")) {
    if (!line.startsWith("| `")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 3) continue;
    const slug = cells[0]!.replace(/`/g, "");
    if (!/^[a-z0-9-]+$/.test(slug) || NOT_A_TEMPLATE.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    entries.push({
      id: `template:${slug}`,
      category: "template",
      slug,
      /* Four columns means the table names the template; three means the slug is the name. */
      title: cells.length >= 4 ? cells[1]! : titleCase(slug),
      summary: clip(cells.at(-1)!.replace(/[*`]/g, "")),
      path: null,
      tags: ["library-index"],
    });
  }
  return entries;
}

/** The pack's own index of what it ships, by category. */
export async function buildCatalog(source: string, files: string[], cliVersion: string): Promise<PackCatalog> {
  const set = new Set(files.map((file) => file.split(path.sep).join("/")));
  const groups = await Promise.all([
    skillEntries(source, set),
    promptEntries(source, set),
    templateEntries(source, set),
    recipeEntries(source, set),
    componentEntries(source, set),
  ]);
  return {
    catalogVersion: CATALOG_VERSION,
    cliVersion,
    entries: groups.flat().sort((left, right) => left.id.localeCompare(right.id, "en")),
  };
}

export async function readCatalog(root = packRoot()): Promise<PackCatalog | null> {
  const raw = await fs.readFile(path.join(root, CATALOG_FILE), "utf-8").catch(() => null);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as PackCatalog;
    return Array.isArray(value.entries) ? value : null;
  } catch {
    return null;
  }
}

export { CATALOG_FILE };
