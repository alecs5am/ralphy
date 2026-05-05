import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { workspace, root } from "../lib/paths.js";
import { out, ok, err } from "../lib/output.js";

// Profile system — share workspace artifacts across users via the repo.
//
// Export: copies workspace/ → profiles/<nickname>/ minus heavy/ephemeral files.
// Import: copies profiles/<nickname>/ → workspace/, additive (skip existing).
//         registry.json is deep-merged so imports don't blow away local entities.
//
// Default exclusions on EXPORT (heavy or ephemeral):
//   - **/render/   **/renders/                  final mp4s
//   - **/assets/video/  **/assets/videos/       generated i2v outputs (10–40 MB each)
//   - **/raw-frames/                            ffmpeg frame extracts
//   - **/batches/                               per-run batch state, regenerable
//   - **/node_modules/  **/.DS_Store
//   - *.mp4  *.mov  *.webm                      catch-all for stray video files
//
// Kept: templates/, references/, projects/{scenario.json, prompts.json, BRIEF.md, TEMPLATE_ORIGIN.md,
//   logs/, scripts/, asset-manifest.json, composition-props.json, assets/{images,music,voiceover,captions,uploaded}}
//
// Override exclusions with --include-renders / --include-videos.

const EXCLUDE_DIRS = new Set(["render", "renders", "raw-frames", "batches", "node_modules"]);
const EXCLUDE_VIDEO_DIRS = new Set(["video", "videos"]);
const EXCLUDE_FILES = new Set([".DS_Store"]);
const EXCLUDE_VIDEO_EXT = new Set([".mp4", ".mov", ".webm"]);

function profilesDir() {
  return path.join(root(), "profiles");
}

type CopyResult = {
  copied: string[];
  skipped: Array<{ src: string; dest: string; reason: string }>;
  merged: string[];
  excluded: string[];
};

type CopyOpts = {
  excludeRenders: boolean;
  excludeVideos: boolean;
  overwrite: boolean;
  mergeRegistry: boolean;
  dryRun: boolean;
  // For relative-path reporting / exclusion matching
  rootSrc: string;
};

function shouldExcludeDir(name: string, parts: string[], opts: CopyOpts): boolean {
  if (EXCLUDE_DIRS.has(name) && (name === "node_modules" || opts.excludeRenders)) return true;
  if (opts.excludeVideos && EXCLUDE_VIDEO_DIRS.has(name) && parts.includes("assets")) return true;
  return false;
}

function shouldExcludeFile(name: string, opts: CopyOpts): boolean {
  if (EXCLUDE_FILES.has(name)) return true;
  if (opts.excludeVideos && EXCLUDE_VIDEO_EXT.has(path.extname(name).toLowerCase())) return true;
  return false;
}

async function deepMergeJson(srcPath: string, destPath: string): Promise<void> {
  const srcRaw = await fs.readFile(srcPath, "utf-8");
  const src = JSON.parse(srcRaw);
  let dest: any = {};
  try {
    dest = JSON.parse(await fs.readFile(destPath, "utf-8"));
  } catch { /* fresh */ }
  const merged = mergeDeep(dest, src);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, JSON.stringify(merged, null, 2) + "\n");
}

function mergeDeep(a: any, b: any): any {
  if (Array.isArray(a) && Array.isArray(b)) {
    // Concat and dedupe by JSON identity for primitive-ish entries
    const seen = new Set<string>();
    const out: any[] = [];
    for (const x of [...a, ...b]) {
      const key = JSON.stringify(x);
      if (!seen.has(key)) { seen.add(key); out.push(x); }
    }
    return out;
  }
  if (a && typeof a === "object" && b && typeof b === "object") {
    const out: any = { ...a };
    for (const k of Object.keys(b)) {
      out[k] = k in a ? mergeDeep(a[k], b[k]) : b[k];
    }
    return out;
  }
  return b !== undefined ? b : a;
}

async function appendJsonlUnique(srcPath: string, destPath: string): Promise<void> {
  const srcLines = (await fs.readFile(srcPath, "utf-8")).split("\n").filter(Boolean);
  let destLines: string[] = [];
  try {
    destLines = (await fs.readFile(destPath, "utf-8")).split("\n").filter(Boolean);
  } catch { /* fresh */ }
  const have = new Set(destLines);
  const additions = srcLines.filter((l) => !have.has(l));
  if (additions.length === 0) return;
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, [...destLines, ...additions].join("\n") + "\n");
}

async function copyTree(srcRoot: string, destRoot: string, opts: CopyOpts): Promise<CopyResult> {
  const result: CopyResult = { copied: [], skipped: [], merged: [], excluded: [] };

  async function walk(rel: string) {
    const srcAbs = path.join(srcRoot, rel);
    const destAbs = path.join(destRoot, rel);
    const stat = await fs.stat(srcAbs);

    if (stat.isDirectory()) {
      const name = path.basename(srcAbs);
      const parts = rel.split(path.sep).filter(Boolean);
      if (shouldExcludeDir(name, parts, opts)) {
        result.excluded.push(rel + "/");
        return;
      }
      if (!opts.dryRun) await fs.mkdir(destAbs, { recursive: true });
      const entries = await fs.readdir(srcAbs);
      for (const e of entries) await walk(path.join(rel, e));
      return;
    }

    const name = path.basename(srcAbs);
    if (shouldExcludeFile(name, opts)) {
      result.excluded.push(rel);
      return;
    }

    // Special handling: deep-merge .ralph/registry.json on import
    if (opts.mergeRegistry && rel.endsWith(".ralph/registry.json")) {
      if (!opts.dryRun) await deepMergeJson(srcAbs, destAbs);
      result.merged.push(rel);
      return;
    }
    // Special handling: append-unique JSONL logs
    if (opts.mergeRegistry && rel.endsWith(".jsonl")) {
      if (!opts.dryRun) await appendJsonlUnique(srcAbs, destAbs);
      result.merged.push(rel);
      return;
    }

    let exists = false;
    try { await fs.access(destAbs); exists = true; } catch { /* fresh */ }
    if (exists && !opts.overwrite) {
      result.skipped.push({ src: rel, dest: rel, reason: "exists (use --overwrite)" });
      return;
    }
    if (!opts.dryRun) {
      await fs.mkdir(path.dirname(destAbs), { recursive: true });
      await fs.copyFile(srcAbs, destAbs);
    }
    result.copied.push(rel);
  }

  await walk("");
  return result;
}

async function readProfileMeta(nickname: string) {
  const p = path.join(profilesDir(), nickname, "PROFILE.md");
  try { return await fs.readFile(p, "utf-8"); } catch { return null; }
}

export function profileCmd() {
  const cmd = new Command("profile").description("Share workspace artifacts across users via committed profiles/");

  cmd
    .command("export <nickname>")
    .description("Copy local workspace/ → profiles/<nickname>/ for committing to the repo")
    .option("--include-renders", "Include final renders and intermediate video clips (heavy)")
    .option("--include-videos", "Include all .mp4/.mov files (heavy)")
    .option("--dry-run", "Show what would be copied without writing")
    .action(async (nickname: string, opts) => {
      const src = workspace();
      const dest = path.join(profilesDir(), nickname);
      try { await fs.access(src); } catch { err(`No workspace/ at ${src} — nothing to export`); }

      const copyOpts: CopyOpts = {
        excludeRenders: !opts.includeRenders,
        excludeVideos: !opts.includeVideos,
        overwrite: true,
        mergeRegistry: false,
        dryRun: !!opts.dryRun,
        rootSrc: src,
      };

      // Wipe existing profile dir to make export deterministic (we copy, then write fresh PROFILE.md)
      if (!opts.dryRun) {
        try { await fs.rm(dest, { recursive: true, force: true }); } catch { /* fresh */ }
        await fs.mkdir(dest, { recursive: true });
      }

      const result = await copyTree(src, dest, copyOpts);

      // Summarize what's in the profile (counts per top-level dir)
      const summary: Record<string, number> = {};
      for (const f of result.copied) {
        const top = f.split(path.sep)[0] ?? "(root)";
        summary[top] = (summary[top] ?? 0) + 1;
      }

      if (!opts.dryRun) {
        const meta = [
          `# Profile: ${nickname}`,
          ``,
          `**Exported:** ${new Date().toISOString()}`,
          `**Source:** \`workspace/\` on this machine`,
          `**Files:** ${result.copied.length} copied, ${result.excluded.length} excluded`,
          ``,
          `## Contents`,
          ``,
          ...Object.entries(summary).sort().map(([k, v]) => `- \`${k}/\` — ${v} files`),
          ``,
          `## How to import`,
          ``,
          `\`\`\`bash`,
          `npm run ralph -- profile import ${nickname}`,
          `\`\`\``,
          ``,
          `Imports are additive — existing files in your local \`workspace/\` are kept (use \`--overwrite\` to replace). Registry and JSONL logs are merged.`,
          ``,
          `## Excluded by default`,
          ``,
          `Heavy or regenerable files: \`render/\`, \`renders/\`, \`raw-frames/\`, \`batches/\`, all \`.mp4\`/\`.mov\`/\`.webm\`, \`node_modules/\`. Re-run export with \`--include-renders\` or \`--include-videos\` to keep them.`,
          ``,
        ].join("\n");
        await fs.writeFile(path.join(dest, "PROFILE.md"), meta);
      }

      ok(`Exported profile '${nickname}' (${result.copied.length} files, ${result.excluded.length} excluded)`);
      out({
        nickname,
        dest: path.relative(root(), dest),
        copied: result.copied.length,
        excluded: result.excluded.length,
        summary,
        dry_run: !!opts.dryRun,
      });
    });

  cmd
    .command("import <nickname>")
    .description("Copy profiles/<nickname>/ → local workspace/ (additive by default, merges registry + logs)")
    .option("--overwrite", "Replace existing files instead of skipping them")
    .option("--dry-run", "Show what would be copied without writing")
    .action(async (nickname: string, opts) => {
      const src = path.join(profilesDir(), nickname);
      const dest = workspace();
      try { await fs.access(src); } catch { err(`Profile not found: profiles/${nickname}/`); }

      const copyOpts: CopyOpts = {
        excludeRenders: false, // already excluded at export time
        excludeVideos: false,
        overwrite: !!opts.overwrite,
        mergeRegistry: true,
        dryRun: !!opts.dryRun,
        rootSrc: src,
      };

      // Don't copy PROFILE.md into workspace/
      const result = await copyTree(src, dest, copyOpts);
      const filtered = {
        ...result,
        copied: result.copied.filter((f) => f !== "PROFILE.md"),
        merged: result.merged.filter((f) => f !== "PROFILE.md"),
      };

      ok(
        `Imported profile '${nickname}': ${filtered.copied.length} copied, ${filtered.merged.length} merged, ${filtered.skipped.length} skipped`,
      );
      out({
        nickname,
        copied: filtered.copied.length,
        merged: filtered.merged.length,
        skipped: filtered.skipped.length,
        skipped_files: filtered.skipped.slice(0, 20),
        dry_run: !!opts.dryRun,
      });
    });

  cmd
    .command("list")
    .description("List all available profiles in profiles/")
    .action(async () => {
      const dir = profilesDir();
      let entries: string[] = [];
      try {
        entries = (await fs.readdir(dir, { withFileTypes: true }))
          .filter((e) => e.isDirectory())
          .map((e) => e.name);
      } catch { /* no profiles yet */ }

      const profiles = await Promise.all(
        entries.map(async (name) => {
          const meta = await readProfileMeta(name);
          const exportedMatch = meta?.match(/\*\*Exported:\*\* (.+)/);
          const filesMatch = meta?.match(/\*\*Files:\*\* (\d+)/);
          return {
            nickname: name,
            exported: exportedMatch?.[1]?.trim() ?? "?",
            files: filesMatch ? Number(filesMatch[1]) : null,
          };
        }),
      );

      out(profiles);
    });

  cmd
    .command("show <nickname>")
    .description("Print PROFILE.md for a given profile")
    .action(async (nickname: string) => {
      const meta = await readProfileMeta(nickname);
      if (!meta) err(`No PROFILE.md for: ${nickname}`);
      process.stdout.write(meta);
    });

  return cmd;
}
