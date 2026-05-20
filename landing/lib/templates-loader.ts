// landing/lib/templates-loader.ts
//
// Build-time loader for the templates/ directory in the repo root.
// Walks `templates/<category>/<slug>/template.json` and returns a flat list
// of TemplateRow records that the gallery page renders into a grid.
//
// Used by landing/app/templates/page.tsx as a Server Component data source —
// runs at build time on Next.js, so the user gets static HTML.

import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const TEMPLATES_DIR = path.join(REPO_ROOT, "templates");

export type TemplateKind = "vibe-style" | "vibe-reference" | "unknown";

export interface TemplateRow {
  slug: string;
  category: string;
  name: string;
  kind: TemplateKind;
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
      rows.push({
        slug: parsed.slug || tpl.name,
        category: cat.name,
        name: parsed.name || tpl.name,
        kind,
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
