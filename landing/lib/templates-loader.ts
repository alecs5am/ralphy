// landing/lib/templates-loader.ts
//
// Build-time loader for the templates/ directory in the repo root.
// Walks `templates/<category>/<slug>/template.json` and returns a flat list
// of TemplateRow records that the gallery page renders into a grid.
//
// Consumed by landing/lib/library-index.ts (which folds templates, guidelines,
// and showcase clips into the single /library discovery surface) — runs at
// build time on Next.js, so the user gets static HTML.

import fs from "node:fs";
import path from "node:path";

// process.cwd() is the `landing/` dir under both `next build` and `next dev`.
// __dirname is unreliable under turbopack (it bundles server code into
// `.next/...`, so `../..` no longer points at the repo root and every template
// silently disappears in the production build) — resolve relative to cwd, the
// same pattern guidelines-loader.ts / skills-loader.ts use.
const REPO_ROOT = path.resolve(process.cwd(), "..");
const TEMPLATES_DIR = path.join(REPO_ROOT, "templates");

export type TemplateKind = "vibe-style" | "vibe-reference" | "unknown";

export type TemplateFormat =
  | "video"
  | "image"
  | "carousel"
  | "fb-creative"
  | "motion-design"
  | "poster"
  | "sticker-pack";

export interface TemplateRow {
  slug: string;
  category: string;
  name: string;
  kind: TemplateKind;
  /** Primary media-format axis (issue 052). Undefined for legacy templates that ship no template.yaml. */
  format?: TemplateFormat;
  /** Slug of the general template this one specializes (same format). Undefined = general/standalone. */
  styleOf?: string;
  description: string;
  tags: string[];
  platform?: string;
  durationSec?: number;
  estimatedCostUsd?: number;
  thumbnail?: string;       // URL relative to /assets/
  referenceMp4?: string;    // URL relative to /assets/
  sourcePath: string;       // GitHub-relative path to the template dir
}

type RawJson = {
  name?: string;
  slug?: string;
  kind?: string;
  description?: string;
  tags?: string[];
  platform?: string;
  duration?: number;
  duration_sec?: number;
  estimated_cost_usd?: number;
  thumbnail?: string;
  reference?: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  "b2b-saas": "B2B SaaS",
  "dtc-commerce": "DTC commerce",
  "creator-lifestyle": "Creator lifestyle",
  "entertainment-viral": "Entertainment / viral",
  "cinematic-narrative": "Cinematic narrative",
};

export function categoryLabel(slug: string): string {
  return CATEGORY_LABELS[slug] ?? slug;
}

const VALID_FORMATS: ReadonlySet<string> = new Set<TemplateFormat>([
  "video",
  "image",
  "carousel",
  "fb-creative",
  "motion-design",
  "poster",
  "sticker-pack",
]);

// `format` + `style_of` are the primary-axis taxonomy (issue 052) and live in
// the typed `template.yaml`, not in the legacy `template.json` this loader
// reads. The landing build does not depend on a YAML parser, so we extract the
// two top-level scalar fields with a minimal line scan — they are always simple
// scalars in the migrate-generated shape (`format: video`, `style_of: foo`).
function readYamlTaxonomy(dir: string): { format?: TemplateFormat; styleOf?: string } {
  const yamlPath = path.join(dir, "template.yaml");
  if (!fs.existsSync(yamlPath)) return {};
  let text: string;
  try {
    text = fs.readFileSync(yamlPath, "utf8");
  } catch {
    return {};
  }
  const out: { format?: TemplateFormat; styleOf?: string } = {};
  for (const line of text.split(/\r?\n/)) {
    const fmt = /^format:\s*"?([a-z-]+)"?\s*$/.exec(line);
    if (fmt && VALID_FORMATS.has(fmt[1])) out.format = fmt[1] as TemplateFormat;
    const so = /^style_of:\s*"?([a-z0-9-]+)"?\s*$/.exec(line);
    if (so) out.styleOf = so[1];
  }
  return out;
}

export function loadTemplates(): TemplateRow[] {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];
  const rows: TemplateRow[] = [];
  for (const cat of fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true })) {
    if (!cat.isDirectory()) continue;
    if (cat.name.startsWith(".")) continue;
    const catDir = path.join(TEMPLATES_DIR, cat.name);
    for (const tpl of fs.readdirSync(catDir, { withFileTypes: true })) {
      if (!tpl.isDirectory()) continue;
      const jsonPath = path.join(catDir, tpl.name, "template.json");
      if (!fs.existsSync(jsonPath)) continue;
      let parsed: RawJson;
      try {
        parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as RawJson;
      } catch {
        continue;
      }
      const kind = (parsed.kind as TemplateKind) || "unknown";
      const tax = readYamlTaxonomy(path.join(catDir, tpl.name));
      rows.push({
        slug: parsed.slug || tpl.name,
        category: cat.name,
        name: parsed.name || tpl.name,
        kind,
        format: tax.format,
        styleOf: tax.styleOf,
        description: (parsed.description || "").trim(),
        tags: parsed.tags || [],
        platform: parsed.platform,
        durationSec: parsed.duration_sec ?? parsed.duration,
        estimatedCostUsd: parsed.estimated_cost_usd,
        thumbnail: parsed.thumbnail,
        referenceMp4: parsed.reference,
        sourcePath: `templates/${cat.name}/${tpl.name}`,
      });
    }
  }
  rows.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });
  return rows;
}

export function groupByCategory(rows: TemplateRow[]): Array<{ category: string; label: string; rows: TemplateRow[] }> {
  const map = new Map<string, TemplateRow[]>();
  for (const r of rows) {
    if (!map.has(r.category)) map.set(r.category, []);
    map.get(r.category)!.push(r);
  }
  return Array.from(map.entries()).map(([category, rows]) => ({
    category,
    label: categoryLabel(category),
    rows,
  }));
}
