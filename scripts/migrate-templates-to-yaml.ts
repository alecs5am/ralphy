#!/usr/bin/env tsx
// scripts/migrate-templates-to-yaml.ts (02.05.04)
//
// Walks `templates/<category>/<slug>/template.json` (and any flat
// `templates/<slug>/template.json`) and writes a sibling `template.yaml` that
// carries `version: 1` plus the canonical fields the new loader expects.
//
// Discipline:
//   • Never deletes the original `template.json` — additive only. Both files
//     stay until a follow-up sweep retires JSON support.
//   • Idempotent: re-running over an already-migrated dir is a no-op unless
//     `--force` is passed.
//   • Pure script — exports `migrateTemplate()` + `walkRepoTemplates()` so
//     tests can import without invoking main().

import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import url from "node:url";
import {
  TemplateYamlSchema,
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
  type TemplateKind,
} from "../cli/lib/schemas/template.ts";

const REPO_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");

export type MigrationResult =
  | { status: "wrote"; path: string }
  | { status: "skipped"; path: string; reason: string }
  | { status: "error"; path: string; reason: string };

/**
 * Convert a `template.json` payload into the v1 YAML shape the loader expects.
 * Returns the validated TemplateYaml object — caller serializes it.
 */
export function buildTemplateYaml(
  json: Record<string, unknown>,
  slug: string,
  category: TemplateCategory,
): Record<string, unknown> {
  const kindRaw = (json.kind as string | undefined) ?? "vibe-style";
  const kind: TemplateKind = kindRaw === "vibe-reference" ? "vibe-reference" : "vibe-style";

  const requiresUserReference = Boolean((json as { requiresUserReference?: boolean }).requiresUserReference);
  const requires: Record<string, unknown> = {};
  if (requiresUserReference) requires.refs = 1;

  const tags = Array.isArray((json as { tags?: unknown[] }).tags)
    ? ((json as { tags: unknown[] }).tags.filter((t) => typeof t === "string") as string[])
    : [];

  const out = {
    version: 1,
    id: slug,
    aliases: [] as string[],
    kind,
    category,
    name: typeof json.name === "string" ? json.name : slug,
    description: typeof json.description === "string" ? json.description : "",
    tags,
    requires,
    scenes: [],
    references: [],
  };
  // Round-trip through the Zod schema so we fail loudly if the legacy JSON is
  // somehow shaped wrong for v1.
  return TemplateYamlSchema.parse(out) as unknown as Record<string, unknown>;
}

export async function migrateTemplate(
  templateDir: string,
  slug: string,
  category: TemplateCategory,
  opts: { force?: boolean } = {},
): Promise<MigrationResult> {
  const jsonPath = path.join(templateDir, "template.json");
  const yamlPath = path.join(templateDir, "template.yaml");
  try {
    const json = JSON.parse(await fs.readFile(jsonPath, "utf-8")) as Record<string, unknown>;
    if (!opts.force) {
      try {
        await fs.access(yamlPath);
        return { status: "skipped", path: yamlPath, reason: "template.yaml already exists" };
      } catch { /* ok — fall through */ }
    }
    const yamlValue = buildTemplateYaml(json, slug, category);
    const header =
      "# Auto-generated from template.json by scripts/migrate-templates-to-yaml.ts.\n" +
      "# Re-run `bun run scripts/migrate-templates-to-yaml.ts --force` to refresh.\n";
    await fs.writeFile(yamlPath, header + YAML.stringify(yamlValue) + "\n");
    return { status: "wrote", path: yamlPath };
  } catch (e) {
    return { status: "error", path: jsonPath, reason: (e as Error).message };
  }
}

/**
 * Walk `templates/` and yield every `{ slug, category, dir }` triple where a
 * `template.json` lives. Skips flat templates at the root for now — every
 * shipped template lives under one of the 5 category folders.
 */
export async function* walkRepoTemplates(repoRoot = REPO_ROOT): AsyncGenerator<{
  slug: string;
  category: TemplateCategory;
  dir: string;
}> {
  const root = path.join(repoRoot, "templates");
  let categories: string[] = [];
  try {
    categories = (await fs.readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch { return; }
  for (const category of categories) {
    if (!(TEMPLATE_CATEGORIES as readonly string[]).includes(category)) continue;
    const catDir = path.join(root, category);
    let children: string[] = [];
    try {
      children = (await fs.readdir(catDir, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch { continue; }
    for (const slug of children) {
      const dir = path.join(catDir, slug);
      try {
        await fs.access(path.join(dir, "template.json"));
        yield { slug, category: category as TemplateCategory, dir };
      } catch { /* no manifest */ }
    }
  }
}

export async function runMigration(opts: { force?: boolean } = {}): Promise<MigrationResult[]> {
  const results: MigrationResult[] = [];
  for await (const { slug, category, dir } of walkRepoTemplates()) {
    results.push(await migrateTemplate(dir, slug, category, opts));
  }
  return results;
}

const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(url.fileURLToPath(import.meta.url));

if (isDirect) {
  const force = process.argv.includes("--force");
  const results = await runMigration({ force });
  let wrote = 0, skipped = 0, errors = 0;
  for (const r of results) {
    if (r.status === "wrote") { wrote++; console.log(`  wrote   ${path.relative(REPO_ROOT, r.path)}`); }
    else if (r.status === "skipped") { skipped++; }
    else { errors++; console.error(`  ERROR   ${path.relative(REPO_ROOT, r.path)} — ${r.reason}`); }
  }
  console.log(`\nDone. wrote=${wrote} skipped=${skipped} errors=${errors}`);
  process.exit(errors > 0 ? 1 : 0);
}
