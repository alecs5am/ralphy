// Template-candidate loader for the production-plan builder (#407).
//
// Builds the same two-tier `Candidate[]` the `ralphy template suggest` verb
// ranks against — the active workspace's templates tier (on-disk, flat) plus
// the public content library (Bunny CDN `library.json`, read via the library
// client). The public tier degrades gracefully: a library error returns [] +
// a warning, and the builder still ranks over the workspace tier alone (or
// freeform when both are empty).
//
// Kept separate from `cli/commands/template.ts` (whose richer walker handles
// the full template-use path) so the plan builder has a narrow, fs-light
// dependency that resolves slug/name/description/tags/format — all the ranker
// needs.

import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { templatesDir } from "../paths.js";
import { getBlocks } from "../library/client.js";
import type { Block } from "../library/types.js";
import type { Candidate } from "../templater/suggest.js";

type RawMeta = {
  name?: unknown;
  description?: unknown;
  tags?: unknown;
  format?: unknown;
  style_of?: unknown;
  kind?: unknown;
};

async function readJsonOrYaml(file: string): Promise<RawMeta | null> {
  try {
    const text = await fs.readFile(file, "utf-8");
    if (file.endsWith(".yaml") || file.endsWith(".yml")) {
      return YAML.parse(text) as RawMeta;
    }
    return JSON.parse(text) as RawMeta;
  } catch {
    return null;
  }
}

/** First existing manifest in a template dir: template.yaml then legacy template.json. */
async function readDirManifest(dir: string): Promise<RawMeta | null> {
  return (
    (await readJsonOrYaml(path.join(dir, "template.yaml"))) ??
    (await readJsonOrYaml(path.join(dir, "template.json")))
  );
}

function metaToCandidate(id: string, meta: RawMeta | null, doc: string): Candidate {
  const tags = Array.isArray(meta?.tags) ? (meta!.tags as unknown[]).map(String) : [];
  const format = typeof meta?.format === "string" ? meta.format : undefined;
  return {
    slug: id,
    name: typeof meta?.name === "string" ? meta.name : id,
    description: typeof meta?.description === "string" ? meta.description : "",
    tags,
    doc,
    meta: { source: "workspace", kind: meta?.kind, ...(format ? { format } : {}) },
  };
}

/** Walk the active workspace's flat templates tier into Candidate[]. */
async function loadWorkspaceCandidates(): Promise<Candidate[]> {
  const base = templatesDir();
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await fs.readdir(base, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Candidate[] = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      const dir = path.join(base, e.name);
      const meta = await readDirManifest(dir);
      if (!meta) continue;
      const doc = await fs.readFile(path.join(dir, "TEMPLATE.md"), "utf-8").catch(() => "");
      out.push(metaToCandidate(e.name, meta, doc));
    } else if (e.name.endsWith(".json")) {
      const id = e.name.replace(/\.json$/, "");
      const meta = await readJsonOrYaml(path.join(base, e.name));
      out.push(metaToCandidate(id, meta, ""));
    }
  }
  return out;
}

function publicBlockToCandidate(block: Block): Candidate {
  const format = typeof block.format === "string" ? block.format : undefined;
  const tags = Array.isArray(block.tags) ? (block.tags as unknown[]).map(String) : [];
  return {
    slug: block.id,
    name: block.name || block.id,
    description: block.blurb || "",
    tags,
    doc: "",
    meta: { source: "public", kind: "template", ...(format ? { format } : {}) },
  };
}

/**
 * Load the merged two-tier template catalog as `Candidate[]`. Workspace
 * templates shadow public on id collision. `onWarn` surfaces a
 * library-unreachable warning without crashing.
 */
export async function loadTemplateCandidates(
  onWarn?: (msg: string) => void,
): Promise<Candidate[]> {
  const workspace = await loadWorkspaceCandidates();
  const seen = new Set(workspace.map((c) => c.slug));

  let publicBlocks: Block[] = [];
  try {
    publicBlocks = await getBlocks("template");
  } catch (e) {
    onWarn?.(
      `public library unreachable (${e instanceof Error ? e.message : String(e)}); ranking workspace templates only`,
    );
  }
  const publicCandidates = publicBlocks
    .filter((b) => !seen.has(b.id))
    .map(publicBlockToCandidate);

  return [...workspace, ...publicCandidates];
}
