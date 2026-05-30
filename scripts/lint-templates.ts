#!/usr/bin/env tsx
// scripts/lint-templates.ts (02.06.02)
//
// Walks every `templates/<category>/<slug>/` and asserts:
//   • Slug passes the archetypal-slug rule from `validateSlug()` (no banned
//     creator/brand tokens, kebab-case).
//   • `template.yaml` is present and parses through the v1 loader.
//
// Mirrors the structure of scripts/lint-skills.ts — exports the linter as a
// function so unit tests can import it, with a `--check` / `--fix` style main()
// guarded by `isDirect`.

import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";
import {
  validateSlug,
  TEMPLATE_CATEGORIES,
  TEMPLATE_FORMATS,
  type TemplateCategory,
  type TemplateYaml,
} from "../cli/lib/schemas/template.ts";
import { loadTemplateManifest } from "../cli/lib/templater/loader.ts";

const REPO_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");

export type LintIssue = {
  kind: "slug" | "manifest" | "format" | "style_of";
  slug: string;
  category: string;
  detail: string;
};

export async function* walkTemplates(repoRoot = REPO_ROOT): AsyncGenerator<{
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
      yield { slug, category: category as TemplateCategory, dir: path.join(catDir, slug) };
    }
  }
}

export async function lintTemplates(repoRoot = REPO_ROOT): Promise<LintIssue[]> {
  const issues: LintIssue[] = [];
  // First pass: validate each manifest + record format-by-slug so the second
  // pass can verify `style_of` parents exist and share the child's format.
  const loadedBySlug = new Map<string, TemplateYaml>();

  for await (const { slug, category, dir } of walkTemplates(repoRoot)) {
    // Slug rule
    const v = validateSlug(slug);
    if (!v.ok) {
      issues.push({ kind: "slug", slug, category, detail: v.reason });
    }
    // Manifest rule — must have a v1 yaml that parses. The Zod schema already
    // requires `format` to be a member of TEMPLATE_FORMATS, so a missing /
    // invalid format surfaces here as a manifest parse failure. We re-check
    // explicitly below to emit a clearer `format` issue.
    try {
      const loaded = await loadTemplateManifest(dir, slug);
      if (!loaded) {
        issues.push({ kind: "manifest", slug, category, detail: "no template.yaml found" });
        continue;
      }
      loadedBySlug.set(slug, loaded);
      if (!(TEMPLATE_FORMATS as readonly string[]).includes(loaded.format)) {
        issues.push({
          kind: "format",
          slug,
          category,
          detail: `format \`${loaded.format}\` is not one of ${TEMPLATE_FORMATS.join("|")}`,
        });
      }
    } catch (e) {
      issues.push({ kind: "manifest", slug, category, detail: (e as Error).message });
    }
  }

  // Second pass: referential integrity for the general → style relationship.
  for (const [slug, loaded] of loadedBySlug) {
    if (!loaded.style_of) continue;
    const parent = loadedBySlug.get(loaded.style_of);
    if (!parent) {
      issues.push({
        kind: "style_of",
        slug,
        category: loaded.category,
        detail: `style_of \`${loaded.style_of}\` does not resolve to any template`,
      });
      continue;
    }
    if (parent.format !== loaded.format) {
      issues.push({
        kind: "style_of",
        slug,
        category: loaded.category,
        detail: `style_of parent \`${loaded.style_of}\` has format \`${parent.format}\` but this template is \`${loaded.format}\` (must match)`,
      });
    }
  }

  return issues;
}

const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(url.fileURLToPath(import.meta.url));

if (isDirect) {
  const issues = await lintTemplates();
  if (issues.length === 0) {
    console.log("lint:templates → ok (0 issues)");
    process.exit(0);
  }
  console.error(`lint:templates → ${issues.length} issue(s):`);
  for (const i of issues) {
    console.error(`  [${i.kind}] ${i.category}/${i.slug} — ${i.detail}`);
  }
  process.exit(1);
}
