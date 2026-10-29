// `ralphy catalog` — the transitions + motion-elements catalog (#563).
//
//   catalog list            query items by kind / mood / energy / tag / sfx tag
//   catalog show <id>       one item: params, usage notes, fragment + preview paths
//   catalog sfx harvest     copy + dedupe + tag + loudnorm project SFX into the shared pack
//   catalog sfx list        query the SFX pack
//   catalog build-previews  assemble + render each item's 9:16 preview mp4 (local, free)
//   catalog page            write the static, filterable catalog page
//
// Definitions are repo-tracked (`catalog/manifest.json` + `catalog/items/`);
// binaries live under the gitignored data root (`.ralphy/catalog/`). See
// cli/lib/catalog/paths.ts for why.

import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { out, ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { catalogListRow, filterCatalogItems, fragmentPath, loadCatalogManifest } from "../lib/catalog/manifest.js";
import { CATALOG_ENERGIES, CATALOG_KINDS, CATALOG_MOODS, SFX_TAGS, type CatalogEnergy, type CatalogKind } from "../lib/catalog/schema.js";
import { harvestSfx, loadSfxManifest } from "../lib/catalog/sfx.js";
import { buildPreviewHtml, previewTiming } from "../lib/catalog/harness.js";
import { buildCatalogPage } from "../lib/catalog/page.js";
import {
  catalogBuildDir,
  catalogDataDir,
  catalogManifestPath,
  catalogPagePath,
  catalogPreviewsDir,
  catalogSfxDir,
} from "../lib/catalog/paths.js";
import { runHyperframesRender } from "../lib/render/hyperframes.js";
import { lintHyperframesHtml } from "../lib/render/hyperframes-lint.js";

function checkEnum(flag: string, value: string | undefined, allowed: readonly string[], verb: string): void {
  if (value !== undefined && !allowed.includes(value)) {
    raiseError("E_FLAG_UNKNOWN", { flag, value, allowed: allowed.join(", "), verb });
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function manifestOrFail() {
  try {
    return await loadCatalogManifest();
  } catch (e) {
    raiseError("E_FILE_MALFORMED", { format: "catalog manifest", path: catalogManifestPath(), detail: String((e as Error)?.message ?? e).slice(0, 400) });
  }
}

export function catalogCmd() {
  const cmd = new Command("catalog").description(
    "Transitions + motion-elements catalog: 9:16 HyperFrames fragments with params, SFX and rendered previews (#563)",
  );
  cmd.addHelpText(
    "after",
    `
Examples:
  ralphy catalog list --kind transition --mood energetic
  ralphy catalog list --kind element --energy calm
  ralphy catalog show zoom-punch
  ralphy catalog sfx harvest --dry-run
  ralphy catalog sfx list --tag whoosh
  ralphy catalog build-previews --id zoom-punch whip-pan
  ralphy catalog page
`,
  );

  cmd
    .command("list")
    .description("List catalog items, filtered by facet (AND across flags)")
    .option("--kind <kind>", `Item kind: ${CATALOG_KINDS.join(" | ")}`)
    .option("--mood <mood>", `Mood: ${CATALOG_MOODS.join(" | ")}`)
    .option("--energy <energy>", `Energy: ${CATALOG_ENERGIES.join(" | ")}`)
    .option("--tag <tag>", "Free-form item tag (e.g. reveal, text, data)")
    .option("--sfx <tag>", `Items whose SFX carries this tag: ${SFX_TAGS.join(" | ")}`)
    .action(async (opts: { kind?: string; mood?: string; energy?: string; tag?: string; sfx?: string }) => {
      checkEnum("kind", opts.kind, CATALOG_KINDS, "catalog list");
      checkEnum("mood", opts.mood, CATALOG_MOODS, "catalog list");
      checkEnum("energy", opts.energy, CATALOG_ENERGIES, "catalog list");
      checkEnum("sfx", opts.sfx, SFX_TAGS, "catalog list");
      const manifest = await manifestOrFail();
      const rows = filterCatalogItems(manifest.items, {
        kind: opts.kind as CatalogKind | undefined,
        mood: opts.mood,
        energy: opts.energy as CatalogEnergy | undefined,
        tag: opts.tag,
        sfx: opts.sfx,
      }).map(catalogListRow);
      out(rows);
    });

  cmd
    .command("show")
    .description("Show one catalog item: params, when to use / not use, SFX cue, fragment and preview paths")
    .argument("<id>", "Item id (see `ralphy catalog list`)")
    .action(async (id: string) => {
      const manifest = await manifestOrFail();
      const item = manifest.items.find((i) => i.id === id);
      if (!item) raiseError("E_NOT_FOUND", { kind: "catalog", id });
      const previewAbs = path.join(catalogDataDir(), item.preview);
      out({
        ...item,
        fragment: fragmentPath(item),
        previewPath: previewAbs,
        previewExists: await exists(previewAbs),
        timing: previewTiming(item),
      });
    });

  const sfx = cmd.command("sfx").description("Shared SFX pack harvested from past projects (copies only; sources untouched)");

  sfx
    .command("harvest")
    .description("Copy every project SFX into .ralphy/catalog/sfx/, dedupe (sha256 + envelope fingerprint), tag, loudness-normalize (ffmpeg loudnorm recipe)")
    .option("--dry-run", "Scan, hash, fingerprint and tag only; write nothing", false)
    .option("--concurrency <n>", "Parallel ffmpeg jobs", (v) => parseInt(v, 10), 6)
    .action(async (opts: { dryRun: boolean; concurrency: number }) => {
      const result = await harvestSfx({ dryRun: opts.dryRun, concurrency: opts.concurrency });
      if (!opts.dryRun) ok(`SFX pack: ${result.unique} unique sounds -> ${result.packDir}`);
      out({ ...result, failed: result.failed.slice(0, 20) });
    });

  sfx
    .command("list")
    .description("List the SFX pack (run `ralphy catalog sfx harvest` first)")
    .option("--tag <tag>", `SFX tag: ${SFX_TAGS.join(" | ")}`)
    .option("--max-duration <s>", "Only sounds at most this long (seconds)", (v) => parseFloat(v))
    .action(async (opts: { tag?: string; maxDuration?: number }) => {
      checkEnum("tag", opts.tag, SFX_TAGS, "catalog sfx list");
      const manifest = await loadSfxManifest();
      if (!manifest) raiseError("E_NOT_FOUND", { kind: "catalog sfx", id: path.join(catalogSfxDir(), "manifest.json") });
      const rows = manifest.entries
        .filter((e) => (!opts.tag || e.tag === opts.tag) && (opts.maxDuration === undefined || e.durationSec <= opts.maxDuration))
        .map((e) => ({
          id: e.id,
          tag: e.tag,
          durationSec: e.durationSec,
          file: path.join(catalogSfxDir(), e.file),
          source: `${e.source.workspace}/${e.source.project}/${e.source.file}`,
          duplicates: e.duplicates.length,
        }));
      out(rows);
    });

  cmd
    .command("build-previews")
    .description("Assemble each item into a standalone 1080x1920 HyperFrames composition and render its preview mp4 (local, free)")
    .option("--id <ids...>", "Only these item ids")
    .option("--force", "Re-render previews that already exist (previews are derived build output)", false)
    .option("--quality <q>", "HyperFrames quality: draft | standard | high", "standard")
    .option("--workers <n>", "Capture workers per render (number or auto)", "2")
    .option("--build-only", "Write the compositions; skip rendering", false)
    .action(async (opts: { id?: string[]; force: boolean; quality: string; workers: string; buildOnly: boolean }) => {
      checkEnum("quality", opts.quality, ["draft", "standard", "high"], "catalog build-previews");
      const manifest = await manifestOrFail();
      const sfxManifest = await loadSfxManifest();
      const wanted = opts.id ? new Set(opts.id) : null;
      if (wanted) {
        for (const id of wanted) {
          if (!manifest.items.some((i) => i.id === id)) raiseError("E_NOT_FOUND", { kind: "catalog", id });
        }
      }
      const items = manifest.items.filter((i) => !wanted || wanted.has(i.id));
      const built: string[] = [];
      const skipped: string[] = [];
      const failed: Array<{ id: string; error: string }> = [];
      const warnings: string[] = [];
      await fs.mkdir(catalogPreviewsDir(), { recursive: true });
      for (const item of items) {
        const outPath = path.join(catalogDataDir(), item.preview);
        if (!opts.force && !opts.buildOnly && (await exists(outPath))) {
          skipped.push(item.id);
          continue;
        }
        const dir = path.join(catalogBuildDir(), item.id);
        await fs.mkdir(dir, { recursive: true });
        let sfxFile: string | null = null;
        if (item.sfx) {
          const entry = sfxManifest?.entries.find((e) => e.id === item.sfx!.id);
          if (entry) {
            sfxFile = "sfx.mp3";
            await fs.copyFile(path.join(catalogSfxDir(), entry.file), path.join(dir, sfxFile));
          } else {
            warnings.push(`${item.id}: SFX ${item.sfx.id} not in the pack; preview renders silent (run catalog sfx harvest)`);
          }
        }
        let html: string;
        try {
          html = buildPreviewHtml({ item, fragmentHtml: await fs.readFile(fragmentPath(item), "utf-8"), sfxFile });
        } catch (e) {
          failed.push({ id: item.id, error: String((e as Error)?.message ?? e).slice(0, 300) });
          continue;
        }
        const lint = lintHyperframesHtml(html);
        if (!lint.ok) {
          failed.push({ id: item.id, error: `lint: ${lint.errors.map((f) => f.code).join(", ")}` });
          continue;
        }
        await fs.writeFile(path.join(dir, "index.html"), html);
        if (opts.buildOnly) {
          built.push(item.id);
          continue;
        }
        const r = await runHyperframesRender({
          projectDir: dir,
          outputPath: outPath,
          quality: opts.quality as "draft" | "standard" | "high",
          workers: opts.workers,
          quiet: true,
        });
        if (r.exitCode === 0) built.push(item.id);
        else failed.push({ id: item.id, error: r.stderr.slice(-300) });
      }
      out({ built, skipped, failed, warnings, previewsDir: catalogPreviewsDir(), buildDir: catalogBuildDir() });
    });

  cmd
    .command("page")
    .description("Write the static catalog page (filters by kind / mood / energy, playable local previews)")
    .action(async () => {
      const manifest = await manifestOrFail();
      const result = await buildCatalogPage(manifest, await loadSfxManifest());
      ok(`Catalog page -> ${catalogPagePath()}`);
      out(result);
    });

  return cmd;
}
