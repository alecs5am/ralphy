import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import {
  loadManifest,
  ensureRequired,
  requiredForTemplate,
  wipeCache,
  type Manifest,
} from "../lib/assets-repo.js";
import { assetCacheDir, projectsDir } from "../lib/paths.js";
import { out, ok, err } from "../lib/output.js";

export function assetsCmd() {
  const cmd = new Command("assets").description("Pull / list / clean assets from the ralphy-assets companion repo");

  cmd
    .command("list")
    .description("List required assets and examples available in the companion repo")
    .option("--template <slug>", "Filter to a specific template")
    .option("--refresh", "Force refresh the manifest cache")
    .action(async (opts) => {
      const manifest = await loadManifest({ force: !!opts.refresh });
      const required = Object.entries(manifest.required)
        .filter(([, e]) => !opts.template || e.template === opts.template)
        .map(([key, e]) => ({
          key,
          template: e.template,
          sizeMB: Number((e.sizeBytes / 1024 / 1024).toFixed(2)),
          via: e.via,
          description: e.description ?? "",
        }));
      const examples = Object.entries(manifest.examples)
        .filter(([, e]) => !opts.template || e.template === opts.template)
        .map(([id, e]) => ({
          id,
          template: e.template,
          sizeMB: Number((e.sizeBytes / 1024 / 1024).toFixed(2)),
          via: e.via,
          description: e.description ?? "",
        }));
      out({
        manifestUpdated: manifest.updated,
        required,
        examples,
      });
    });

  cmd
    .command("pull <template-slug>")
    .description("Download all required assets for a template into the local cache")
    .option("--refresh", "Force refresh the manifest cache")
    .action(async (templateSlug: string, opts) => {
      const manifest = await loadManifest({ force: !!opts.refresh });
      const entries = requiredForTemplate(manifest, templateSlug);
      if (entries.length === 0) {
        ok(`No required assets registered for template '${templateSlug}'`);
        out({ template: templateSlug, pulled: [] });
        return;
      }
      const pulled: Array<{ key: string; cachedPath: string; sizeBytes: number }> = [];
      for (const [key, entry] of entries) {
        const { cachedPath } = await ensureRequired(manifest, key);
        pulled.push({ key, cachedPath, sizeBytes: entry.sizeBytes });
        ok(`Pulled ${key} → ${cachedPath}`);
      }
      out({ template: templateSlug, pulled });
    });

  cmd
    .command("pull-key <manifest-key>")
    .description("Download a single required asset by its manifest key")
    .option("--refresh", "Force refresh the manifest cache")
    .action(async (key: string, opts) => {
      const manifest = await loadManifest({ force: !!opts.refresh });
      const { cachedPath, entry } = await ensureRequired(manifest, key);
      ok(`Pulled ${key} → ${cachedPath}`);
      out({ key, cachedPath, sizeBytes: entry.sizeBytes });
    });

  cmd
    .command("install <project-id> <template-slug>")
    .description("Pull required assets for a template and copy them into a project's asset tree")
    .option("--refresh", "Force refresh the manifest cache")
    .action(async (projectId: string, templateSlug: string, opts) => {
      const manifest = await loadManifest({ force: !!opts.refresh });
      const entries = requiredForTemplate(manifest, templateSlug);
      if (entries.length === 0) {
        ok(`No required assets registered for template '${templateSlug}'`);
        out({ project: projectId, template: templateSlug, installed: [] });
        return;
      }
      const projDir = path.join(projectsDir(), projectId);
      try { await fs.access(projDir); } catch { err(`Project not found: ${projectId}`); }

      const installed: Array<{ key: string; dest: string }> = [];
      for (const [key, entry] of entries) {
        const { cachedPath } = await ensureRequired(manifest, key);
        const destDir = path.join(projDir, entry.destSubdir);
        await fs.mkdir(destDir, { recursive: true });
        const dest = path.join(destDir, path.basename(entry.path));
        await fs.copyFile(cachedPath, dest);
        installed.push({ key, dest: path.relative(projDir, dest) });
        ok(`Installed ${key} → ${path.relative(projDir, dest)}`);
      }
      out({ project: projectId, template: templateSlug, installed });
    });

  cmd
    .command("clean")
    .description("Wipe the local asset cache (workspace/.ralph/asset-cache)")
    .action(async () => {
      const result = await wipeCache();
      ok(`Cache cleared: ${result.removed}`);
      out(result);
    });

  cmd
    .command("cache-info")
    .description("Show the asset cache location and what's currently in it")
    .action(async () => {
      const dir = assetCacheDir();
      let entries: string[] = [];
      try {
        entries = await collectFiles(dir);
      } catch { /* empty */ }
      out({
        cacheDir: dir,
        files: entries.map((rel) => ({ relative: rel })),
        fileCount: entries.length,
      });
    });

  return cmd;
}

async function collectFiles(root: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  const cur = path.join(root, rel);
  let entries;
  try {
    entries = await fs.readdir(cur, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const childRel = rel ? path.join(rel, e.name) : e.name;
    if (e.isDirectory()) out.push(...await collectFiles(root, childRel));
    else out.push(childRel);
  }
  return out;
}
