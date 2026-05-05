import { Command } from "commander";
import fs from "fs/promises";
import path from "path";
import { projectsDir } from "../lib/paths.js";
import { out, err } from "../lib/output.js";

const MEDIA_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".mov", ".webm", ".mp3", ".wav", ".m4a", ".aiff", ".srt"];

async function listFilesRecursive(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });
    return entries
      .filter((e) => e.isFile() && MEDIA_EXTS.some((ext) => e.name.endsWith(ext)))
      .map((e) => path.join(e.parentPath || (e as any).path, e.name));
  } catch {
    return [];
  }
}

function categorize(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) return "image";
  if ([".mp4", ".mov", ".webm"].includes(ext)) return "video";
  if ([".mp3", ".wav", ".m4a", ".aiff"].includes(ext)) return "audio";
  if (ext === ".srt") return "caption";
  return "other";
}

export function assetCmd() {
  const cmd = new Command("asset").description("Manage and generate assets");

  cmd
    .command("list")
    .description("List assets in a project")
    .requiredOption("--project <id>", "Project ID")
    .option("--type <type>", "Filter: image | video | audio | caption")
    .option("--missing", "Show only missing/pending assets")
    .action(async (opts) => {
      const dir = path.join(projectsDir(), opts.project, "assets");
      const files = await listFilesRecursive(dir);

      let items = files.map((f) => {
        const rel = path.relative(projectsDir(), f);
        const cat = categorize(f);
        return {
          path: `workspace/projects/${rel}`,
          name: path.basename(f),
          type: cat,
        };
      });

      if (opts.type) items = items.filter((i) => i.type === opts.type);

      if (opts.missing) {
        // Check asset manifest for pending items
        try {
          const manifest = JSON.parse(
            await fs.readFile(path.join(projectsDir(), opts.project, "asset-manifest.json"), "utf-8")
          );
          const pending = (manifest.assets || [])
            .filter((a: any) => a.status === "pending" || !a.file)
            .map((a: any) => ({ slot: a.id, type: a.type, status: "missing" }));
          out(pending);
        } catch {
          out([]);
        }
        return;
      }

      out(items);
    });

  cmd
    .command("clean")
    .description("Remove assets from a project")
    .requiredOption("--project <id>", "Project ID")
    .option("--type <type>", "Only remove specific type: images | videos | voiceover | music")
    .action(async (opts) => {
      const base = path.join(projectsDir(), opts.project, "assets");
      if (opts.type) {
        await fs.rm(path.join(base, opts.type), { recursive: true, force: true });
        await fs.mkdir(path.join(base, opts.type), { recursive: true });
        out({ cleaned: opts.type, project: opts.project });
      } else {
        for (const sub of ["images", "videos", "voiceover", "music", "captions"]) {
          await fs.rm(path.join(base, sub), { recursive: true, force: true });
          await fs.mkdir(path.join(base, sub), { recursive: true });
        }
        // Also remove manifest
        await fs.rm(path.join(projectsDir(), opts.project, "asset-manifest.json"), { force: true });
        out({ cleaned: "all", project: opts.project });
      }
    });

  return cmd;
}
