import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  loadManifest,
  resolveDownloadUrl,
  downloadVerified,
  type ExampleEntry,
} from "../lib/assets-repo.js";
import { assetCacheDir, projectsDir } from "../lib/paths.js";
import { addEntity } from "../lib/registry.js";
import { out, ok, err } from "../lib/output.js";

// ralphy-assets/examples/<id>/ holds complete reference projects (full asset
// trees, render outputs, generation logs). They're tarballed and either
// committed to the assets repo (small) or attached to a GitHub Release
// (large). `ralphy example pull <id> --as <new-id>` extracts one into the
// current workspace as a regular project.

export function exampleCmd() {
  const cmd = new Command("example").description("Pull / list complete reference projects from the companion repo");

  cmd
    .command("list")
    .description("List available example projects")
    .option("--template <slug>", "Filter to examples for a specific template")
    .option("--refresh", "Force refresh the manifest cache")
    .action(async (opts) => {
      const manifest = await loadManifest({ force: !!opts.refresh });
      const examples = Object.entries(manifest.examples)
        .filter(([, e]) => !opts.template || e.template === opts.template)
        .map(([id, e]) => ({
          id,
          template: e.template,
          sizeMB: Number((e.sizeBytes / 1024 / 1024).toFixed(2)),
          via: e.via,
          description: e.description ?? "",
        }));
      out({ manifestUpdated: manifest.updated, examples });
    });

  cmd
    .command("pull <example-id>")
    .description("Download an example project tarball and extract it into workspace/projects/<as>")
    .requiredOption("--as <project-id>", "Local project ID to extract into")
    .option("--refresh", "Force refresh the manifest cache")
    .action(async (exampleId: string, opts) => {
      const manifest = await loadManifest({ force: !!opts.refresh });
      const entry = manifest.examples[exampleId];
      if (!entry) err(`Example not in manifest: ${exampleId}`);

      const localId = opts.as;
      const projDir = path.join(projectsDir(), localId);
      try {
        await fs.access(projDir);
        err(`Project already exists: ${localId} (pick a different --as)`);
      } catch { /* good, fresh */ }

      const tarballRel = entry.tarball ?? `examples/${exampleId}.tar.gz`;
      const url = resolveDownloadUrl(manifest, entry, tarballRel);

      const cachedTar = path.join(assetCacheDir(), "examples", path.basename(tarballRel));
      let needsDownload = true;
      try {
        await fs.access(cachedTar);
        needsDownload = false; // skip verify here — extraction will fail loudly if corrupt
      } catch { /* download */ }

      if (needsDownload) {
        ok(`Downloading ${url} (~${(entry.sizeBytes / 1024 / 1024).toFixed(1)} MB)…`);
        await downloadVerified(url, cachedTar, entry.sha256);
      }

      await fs.mkdir(projDir, { recursive: true });
      await runTar(cachedTar, projDir);

      const meta = await readExampleMeta(projDir);
      await addEntity("projects", localId, {
        name: meta?.name || localId,
        platform: meta?.platform || "tiktok",
        aspectRatio: meta?.aspectRatio || "9:16",
        status: "from-example",
        createdAt: new Date().toISOString(),
        from_example: exampleId,
      });

      ok(`Extracted ${exampleId} → workspace/projects/${localId}/`);
      out({ exampleId, localId, projDir, source: url });
    });

  return cmd;
}

async function runTar(tarball: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-xzf", tarball, "-C", destDir, "--strip-components=1"], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar exited with code ${code}`));
    });
  });
}

async function readExampleMeta(projDir: string): Promise<Record<string, any> | null> {
  for (const candidate of ["scenario.json", "asset-manifest.json"]) {
    try {
      const txt = await fs.readFile(path.join(projDir, candidate), "utf-8");
      return JSON.parse(txt);
    } catch { /* try next */ }
  }
  return null;
}
