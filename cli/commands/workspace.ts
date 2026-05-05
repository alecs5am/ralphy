import { Command } from "commander";
import fs from "fs/promises";
import path from "path";
import { workspace, projectsDir, batchesDir, referencesDir } from "../lib/paths.js";
import { out, ok } from "../lib/output.js";

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        try {
          const stat = await fs.stat(path.join(entry.parentPath || (entry as any).path, entry.name));
          total += stat.size;
        } catch {}
      }
    }
  } catch {}
  return total;
}

async function countDirs(dir: string): Promise<number> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).length;
  } catch {
    return 0;
  }
}

export function workspaceCmd() {
  const cmd = new Command("workspace").description("Manage workspace");

  cmd
    .command("stats")
    .description("Show workspace statistics")
    .action(async () => {
      const projectCount = await countDirs(projectsDir());
      const batchCount = await countDirs(batchesDir());
      const refCount = await countDirs(referencesDir());
      const totalBytes = await dirSize(workspace());
      const mb = Math.round((totalBytes / 1024 / 1024) * 100) / 100;

      out({
        projects: projectCount,
        batches: batchCount,
        references: refCount,
        totalSizeMB: mb,
        path: workspace(),
      });
    });

  cmd
    .command("clean")
    .description("Clean workspace contents")
    .option("--renders", "Only remove rendered videos")
    .option("--assets", "Only remove generated assets")
    .option("--all", "Remove everything in workspace (keeps .ralph config)")
    .action(async (opts) => {
      if (opts.renders) {
        const projects = await fs.readdir(projectsDir()).catch(() => [] as string[]);
        for (const p of projects) {
          await fs.rm(path.join(projectsDir(), p, "render"), { recursive: true, force: true });
          await fs.mkdir(path.join(projectsDir(), p, "render"), { recursive: true });
        }
        ok("Renders cleaned");
        out({ cleaned: "renders" });
      } else if (opts.assets) {
        const projects = await fs.readdir(projectsDir()).catch(() => [] as string[]);
        for (const p of projects) {
          await fs.rm(path.join(projectsDir(), p, "assets"), { recursive: true, force: true });
          await fs.mkdir(path.join(projectsDir(), p, "assets"), { recursive: true });
        }
        ok("Assets cleaned");
        out({ cleaned: "assets" });
      } else if (opts.all) {
        // Keep .ralph but remove projects, batches, references, templates
        for (const sub of ["projects", "batches", "references", "templates"]) {
          await fs.rm(path.join(workspace(), sub), { recursive: true, force: true });
          await fs.mkdir(path.join(workspace(), sub), { recursive: true });
        }
        ok("Workspace cleaned (config preserved)");
        out({ cleaned: "all" });
      } else {
        out({ error: "Specify --renders, --assets, or --all" });
      }
    });

  return cmd;
}
