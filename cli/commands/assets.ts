import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import {
  loadManifest,
  ensureRequired,
  ensurePool,
  requiredForTemplate,
  poolKinds,
  poolItems,
  wipeCache,
  type Manifest,
} from "../lib/assets-repo.js";
import { assetCacheDir, projectsDir, root } from "../lib/paths.js";
import { out, ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { unpackBrandZip } from "../lib/unpack-zip.js";
import { intakePath } from "../lib/path-resolution.js";
import { logGeneration } from "../lib/gen-log.js";
import { getEntity } from "../lib/registry.js";

export function assetsCmd() {
  const cmd = new Command("assets").description("Pull / list / clean assets from the ralphy-assets companion repo");

  cmd
    .command("list")
    .description("List required + pool + example assets from the companion repo")
    .option("--template <slug>", "Filter pool/required/examples to a specific template")
    .option("--kind <kind>", "Show only pool items of this kind (e.g. gameplay-loops, italian-brainrot-characters)")
    .option("--refresh", "Force refresh the manifest cache")
    .action(async (opts) => {
      const manifest = await loadManifest({ force: !!opts.refresh });

      // required (template-bound)
      const required = (opts.kind ? [] : Object.entries(manifest.required))
        .filter(([, e]) => !opts.template || e.template === opts.template)
        .map(([key, e]) => ({
          key,
          template: e.template,
          sizeMB: Number((e.sizeBytes / 1024 / 1024).toFixed(2)),
          via: e.via,
          description: e.description ?? "",
        }));

      // pool (generic by kind)
      const pool: Array<{ kind: string; slug: string; sizeMB: number; license?: string; worksWith?: string[]; description?: string }> = [];
      const kinds = opts.kind ? [opts.kind] : poolKinds(manifest);
      for (const kind of kinds) {
        for (const [slug, item] of poolItems(manifest, kind)) {
          if (opts.template && item.worksWith && !item.worksWith.includes(opts.template)) continue;
          pool.push({
            kind,
            slug,
            sizeMB: Number((item.sizeBytes / 1024 / 1024).toFixed(2)),
            license: item.license ?? manifest.pool[kind]?.license,
            worksWith: item.worksWith,
            description: item.description,
          });
        }
      }

      // examples (template-bound rendered mp4s)
      const examples = (opts.kind ? [] : Object.entries(manifest.examples))
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
        manifestVersion: manifest.version,
        required,
        pool,
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
      const { CommandStream } = await import("../lib/stream/command.js");
      const cs = new CommandStream();
      const manifest = await loadManifest({ force: !!opts.refresh });
      const entries = requiredForTemplate(manifest, templateSlug);
      if (entries.length === 0) {
        ok(`No required assets registered for template '${templateSlug}'`);
        cs.summary({ project: projectId, template: templateSlug, installed: [] });
        return;
      }
      const projDir = path.join(projectsDir(), projectId);
      try { await fs.access(projDir); } catch { raiseError("E_NOT_FOUND", { kind: "Project", id: projectId }); }

      cs.event("assets-install-started", {
        project: projectId,
        template: templateSlug,
        total: entries.length,
      });
      const installed: Array<{ key: string; dest: string }> = [];
      for (const [key, entry] of entries) {
        cs.event("asset-pull", { key });
        const { cachedPath } = await ensureRequired(manifest, key);
        const destDir = path.join(projDir, entry.destSubdir);
        await fs.mkdir(destDir, { recursive: true });
        const dest = path.join(destDir, path.basename(entry.path));
        await fs.copyFile(cachedPath, dest);
        installed.push({ key, dest: path.relative(projDir, dest) });
        cs.event("asset-installed", { key, dest: path.relative(projDir, dest) });
        ok(`Installed ${key} → ${path.relative(projDir, dest)}`);
      }
      cs.summary({ project: projectId, template: templateSlug, installed });
    });

  cmd
    .command("pull-pool <ref>")
    .description("Download a single pool item by '<kind>/<slug>' (e.g. italian-brainrot-characters/tung-tung-tung-sahur)")
    .option("--refresh", "Force refresh the manifest cache")
    .option("--install <project-id>", "After pulling, also copy into a project's asset tree (uses item.destSubdir or category.defaultDestSubdir)")
    .action(async (ref: string, opts) => {
      const [kind, slug] = ref.split("/", 2);
      if (!kind || !slug) raiseError("E_INPUT_INVALID", { field: "ref", detail: `expected '<kind>/<slug>', got '${ref}'`, verb: "assets pull-pool" });
      const manifest = await loadManifest({ force: !!opts.refresh });
      const { cachedPath, item, category } = await ensurePool(manifest, kind, slug);
      ok(`Pulled ${kind}/${slug} → ${cachedPath}`);

      let installedDest: string | undefined;
      if (opts.install) {
        const projDir = path.join(projectsDir(), opts.install);
        try { await fs.access(projDir); } catch { raiseError("E_NOT_FOUND", { kind: "Project", id: opts.install }); }
        const sub = item.destSubdir || category.defaultDestSubdir || "assets";
        const destDir = path.join(projDir, sub);
        await fs.mkdir(destDir, { recursive: true });
        const dest = path.join(destDir, item.destFilename || path.basename(item.path));
        await fs.copyFile(cachedPath, dest);
        installedDest = path.relative(projDir, dest);
        ok(`Installed → ${installedDest}`);
      }

      out({
        kind,
        slug,
        cachedPath,
        sizeBytes: item.sizeBytes,
        license: item.license ?? category.license,
        attribution: item.attribution,
        ...(installedDest ? { project: opts.install, dest: installedDest } : {}),
      });
    });

  cmd
    .command("catalog")
    .description("Print or regenerate docs/assets-catalog.md from the live manifest (single source of truth)")
    .option("--write", "Write to docs/assets-catalog.md instead of stdout")
    .option("--refresh", "Force refresh the manifest cache before generating")
    .action(async (opts) => {
      const manifest = await loadManifest({ force: !!opts.refresh });
      const md = renderCatalog(manifest);
      if (opts.write) {
        const dest = path.join(root(), "docs", "assets-catalog.md");
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, md);
        ok(`Wrote ${dest} (${md.length} bytes)`);
        out({ wrote: dest, bytes: md.length, version: manifest.version, updated: manifest.updated });
      } else {
        process.stdout.write(md);
      }
    });

  // ── unpack (#048: brand-zip flattener) ───────────────────────────────
  cmd
    .command("unpack <zip>")
    .description(
      "Unpack a brand zip into <project>/brand/, flatten nested dirs into kebab-case filenames, drop __MACOSX/ and .DS_Store, suffix collisions with -N. Idempotent on re-run.",
    )
    .requiredOption("--project <id>", "Target project id (zip is flattened into workspace/projects/<id>/brand/)")
    .option("--dest <subdir>", "Subdir under <project>/ for output (default: 'brand')", "brand")
    .action(async (zipArg: string, opts: { project: string; dest: string }) => {
      const project = await getEntity("projects", opts.project);
      if (!project) {
        raiseError("E_NOT_FOUND", { kind: "Project", id: opts.project });
        return;
      }
      const zipPath = intakePath(zipArg, opts.project, "zip");
      let stat;
      try {
        stat = await fs.stat(zipPath);
      } catch {
        raiseError("E_NOT_FOUND", { kind: "File", id: zipPath });
        return;
      }
      if (!stat.isFile()) {
        raiseError("E_INPUT_INVALID", {
          field: "zip",
          detail: `not a file: ${zipPath}`,
          verb: "assets unpack",
        });
        return;
      }
      const projDir = path.join(projectsDir(), opts.project);
      const destDir = path.join(projDir, opts.dest);
      let result;
      try {
        result = await unpackBrandZip(zipPath, destDir);
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `assets unpack: ${e?.message ?? e}` });
        return;
      }

      // Summary table on stderr (out() writes JSON to stdout).
      if (result.entries.length > 0) {
        const widthOrig = Math.min(
          48,
          Math.max(8, ...result.entries.map((e) => e.originalPath.length)),
        );
        const widthFlat = Math.min(
          40,
          Math.max(8, ...result.entries.map((e) => e.flatName.length)),
        );
        process.stderr.write(
          `\n${"original".padEnd(widthOrig)}  ${"→ flat".padEnd(widthFlat)}  ${"size".padStart(10)}  sha256\n`,
        );
        process.stderr.write(
          `${"-".repeat(widthOrig)}  ${"-".repeat(widthFlat)}  ${"-".repeat(10)}  ${"-".repeat(12)}\n`,
        );
        for (const e of result.entries) {
          const orig =
            e.originalPath.length > widthOrig
              ? "…" + e.originalPath.slice(-(widthOrig - 1))
              : e.originalPath.padEnd(widthOrig);
          const flat =
            e.flatName.length > widthFlat
              ? "…" + e.flatName.slice(-(widthFlat - 1))
              : e.flatName.padEnd(widthFlat);
          const sz = formatBytes(e.bytes).padStart(10);
          process.stderr.write(`${orig}  ${flat}  ${sz}  ${e.sha256.slice(0, 12)}\n`);
        }
        process.stderr.write("\n");
      }

      // gen-log row for the unpack op (one row per zip, not per entry — keeps
      // the log readable; per-entry details land in the summary JSON).
      await logGeneration(opts.project, {
        provider: "ffmpeg", // local op; reuse the 'ffmpeg' bucket the way other recipes do
        model: "unzip",
        endpoint: "assets-unpack",
        kind: "other",
        input: {
          project: opts.project,
          zip: path.basename(zipPath),
          destDir: path.relative(projDir, destDir),
        },
        output: {
          local: path.relative(projDir, destDir),
          bytes: result.entries.reduce((a, e) => a + e.bytes, 0),
        },
        status: result.errors.length === 0 ? "ok" : "error",
        error: result.errors.length === 0 ? undefined : `${result.errors.length} entries failed`,
        cost_usd: 0,
        note: `${result.entries.length} files unpacked, ${result.skipped.length} skipped`,
      });

      ok(
        `Unpacked ${result.entries.length} files → ${path.relative(projDir, destDir)} (${result.skipped.length} skipped, ${result.errors.length} errored)`,
      );
      out({
        project: opts.project,
        zip: path.basename(zipPath),
        destDir: path.relative(projDir, destDir),
        unpacked: result.entries.length,
        skipped: result.skipped.length,
        errored: result.errors.length,
        entries: result.entries.map((e) => ({
          original: e.originalPath,
          flat: e.flatName,
          dest: path.relative(projDir, e.dest),
          bytes: e.bytes,
          sha256: e.sha256,
        })),
        ...(result.skipped.length > 0 ? { skippedEntries: result.skipped } : {}),
        ...(result.errors.length > 0 ? { errors: result.errors } : {}),
      });
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

  cmd.addHelpText(
    "after",
    `
Examples:
  ralphy assets list
  ralphy assets list --kind <kind>
  ralphy assets pull <template-slug>
  ralphy assets install <project-id> <template-slug>
  ralphy assets unpack ./brand.zip --project my-proj-001
`,
  );

  return cmd;
}

// Render a markdown catalog from the live manifest. Manifest is the single
// source of truth; this is a derived, agent-friendly view that lives in the
// main repo so it's always in context (without needing a network call).
function renderCatalog(manifest: Manifest): string {
  const lines: string[] = [];
  lines.push("# Assets catalog");
  lines.push("");
  lines.push("> Auto-generated from the `ralphy-assets` companion-repo manifest. **Manifest is the source of truth — regenerate this file with `ralphy assets catalog --write` after any manifest change.**");
  lines.push("");
  lines.push(`Manifest version: \`${manifest.version}\` · Updated: \`${manifest.updated}\``);
  lines.push("");
  lines.push("## How the layers fit together");
  lines.push("");
  lines.push("- **`required`** — template-bound mandatory assets. Auto-pulled when you run `ralphy template use <slug>`. Listed here for transparency; you rarely pull these directly.");
  lines.push("- **`pool`** — generic, reusable assets grouped by **kind** (open-ended: gameplay-loops, italian-brainrot-characters, trend-music, stock-broll, and future additions). Pull individual items on demand with `ralphy assets pull-pool <kind>/<slug>`. The agent should consult this catalog before generating prompts that reference real-world IP / characters / footage.");
  lines.push("- **`examples`** — ready-made example mp4 outputs per template, for visual reference / regression baselines.");
  lines.push("");
  lines.push("CLI cheatsheet:");
  lines.push("```");
  lines.push("ralphy assets list                                    # everything");
  lines.push("ralphy assets list --kind italian-brainrot-characters # one pool kind");
  lines.push("ralphy assets list --template italian-brainrot        # required + matching pool items");
  lines.push("ralphy assets pull-pool <kind>/<slug>                 # download one pool item");
  lines.push("ralphy assets pull-pool <kind>/<slug> --install <pid> # download + copy into a project");
  lines.push("ralphy assets pull <template-slug>                    # all required for a template");
  lines.push("```");
  lines.push("");

  // required
  lines.push("## Required (per-template, auto-pulled)");
  lines.push("");
  const required = Object.entries(manifest.required);
  if (required.length === 0) {
    lines.push("_None registered._");
  } else {
    lines.push("| Template | Key | Size | Description |");
    lines.push("|---|---|---|---|");
    for (const [key, e] of required.sort((a, b) => a[1].template.localeCompare(b[1].template))) {
      const sizeMB = (e.sizeBytes / 1024 / 1024).toFixed(2);
      lines.push(`| \`${e.template}\` | \`${key}\` | ${sizeMB} MB | ${(e.description ?? "").replace(/\|/g, "\\|")} |`);
    }
  }
  lines.push("");

  // pool — one section per kind
  lines.push("## Pool (generic, by kind)");
  lines.push("");
  const kinds = Object.keys(manifest.pool ?? {}).sort();
  if (kinds.length === 0) {
    lines.push("_No pool kinds registered yet._");
    lines.push("");
  }
  for (const kind of kinds) {
    const cat = manifest.pool[kind];
    const items = Object.entries(cat.items ?? {});
    lines.push(`### \`${kind}\` (${items.length})`);
    lines.push("");
    lines.push(cat.description || "_no description_");
    if (cat.license) lines.push(`\n**License (category default):** \`${cat.license}\`${cat.attributionRequired ? " · attribution required" : ""}`);
    lines.push("");
    if (items.length === 0) {
      lines.push("_empty_");
      lines.push("");
      continue;
    }
    lines.push("| Slug | Size | Works with | License | Description |");
    lines.push("|---|---|---|---|---|");
    for (const [slug, item] of items.sort((a, b) => a[0].localeCompare(b[0]))) {
      const sizeKB = (item.sizeBytes / 1024).toFixed(1);
      const sizeStr = item.sizeBytes >= 1024 * 1024 ? `${(item.sizeBytes / 1024 / 1024).toFixed(2)} MB` : `${sizeKB} KB`;
      const works = item.worksWith?.length ? item.worksWith.map((t) => `\`${t}\``).join(", ") : "_any_";
      const lic = item.license ?? cat.license ?? "—";
      const desc = (item.description ?? "").replace(/\|/g, "\\|");
      lines.push(`| \`${slug}\` | ${sizeStr} | ${works} | ${lic} | ${desc} |`);
    }
    lines.push("");
  }

  // examples
  lines.push("## Examples (rendered mp4s per template)");
  lines.push("");
  const examples = Object.entries(manifest.examples);
  if (examples.length === 0) {
    lines.push("_None registered._");
  } else {
    lines.push("| Template | Id | Size | Description |");
    lines.push("|---|---|---|---|");
    for (const [id, e] of examples.sort((a, b) => a[1].template.localeCompare(b[1].template))) {
      const sizeMB = (e.sizeBytes / 1024 / 1024).toFixed(2);
      lines.push(`| \`${e.template}\` | \`${id}\` | ${sizeMB} MB | ${(e.description ?? "").replace(/\|/g, "\\|")} |`);
    }
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("_Regenerate with `ralphy assets catalog --write`._");
  return lines.join("\n") + "\n";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
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
