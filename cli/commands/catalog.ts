// `ralphy catalog` — the transitions + motion-elements catalog (#563).
//
//   catalog list            query items by kind / mood / energy / tag / sfx tag
//   catalog show <id>       one item: params, usage notes, fragment + preview paths
//   catalog sfx harvest     copy + dedupe + tag + loudnorm project SFX into the shared pack
//   catalog sfx list        query the SFX pack
//   catalog build-previews  assemble + render each item's 9:16 preview mp4 (local, free)
//   catalog page            write the static, filterable catalog page
//   catalog fonts list|pairs|sync|lint|preview
//                           free font library: license manifest, glyph
//                           coverage, font pairs by register (#565)
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
import { buildPreviewHtml, previewTiming, HARNESS_CSS } from "../lib/catalog/harness.js";
import {
  COVERAGE_TAGS,
  fontFacesForHtml,
  fontLintSources,
  fontManifestPath,
  fontsDataDir,
  lintFontManifest,
  loadFontManifest,
  syncFonts,
  type FontManifest,
} from "../lib/catalog/fonts.js";
import { buildFontPairHtml } from "../lib/catalog/font-pairs.js";
import { captionContrast, captionLimitsFromPreset } from "../lib/catalog/captions.js";
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

async function fontManifestOrNull(): Promise<FontManifest | null> {
  try {
    return await loadFontManifest();
  } catch {
    return null;
  }
}

async function fontManifestOrFail(): Promise<FontManifest> {
  try {
    return await loadFontManifest();
  } catch (e) {
    raiseError("E_FILE_MALFORMED", { format: "font manifest", path: fontManifestPath(), detail: String((e as Error)?.message ?? e).slice(0, 400) });
  }
}

/** Declare vendored font files for every manifest family the page names and copy them into the build dir. */
async function vendorFonts(html: string, dir: string, fonts: FontManifest | null, warnings: string[], id: string) {
  if (!fonts) return undefined;
  const { faces, copies, missing } = await fontFacesForHtml(html, fonts);
  if (missing.length > 0) warnings.push(`${id}: ${missing.length} font file(s) not synced (${missing.slice(0, 3).join(", ")}); run ralphy catalog fonts sync`);
  if (copies.length > 0) await fs.mkdir(path.join(dir, "fonts"), { recursive: true });
  for (const c of copies) await fs.copyFile(c.from, path.join(dir, c.to));
  return faces;
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
  ralphy catalog list --kind layout
  ralphy catalog fonts list --script cyrillic
  ralphy catalog fonts pairs
  ralphy catalog fonts sync --write
  ralphy catalog fonts lint
  ralphy catalog fonts preview --pair bold-creator
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
        ...(item.caption ? { contrast: captionContrast(item.caption), gateLimits: captionLimitsFromPreset(item.id, item.caption) } : {}),
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
      const fonts = await fontManifestOrNull();
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
          const fragmentHtml = await fs.readFile(fragmentPath(item), "utf-8");
          const fontFaces = await vendorFonts(`${HARNESS_CSS}\n${fragmentHtml}`, dir, fonts, warnings, item.id);
          html = buildPreviewHtml({ item, fragmentHtml, sfxFile, fontFaces });
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


  const fontsCmd = cmd.command("fonts").description("Free font library (#565): license manifest, glyph coverage tags, font pairs by register");

  fontsCmd
    .command("list")
    .description("List the licensed fonts with coverage tags (catalog/fonts.json)")
    .option("--script <tag>", `Only fonts covering: ${COVERAGE_TAGS.join(" | ")}`)
    .action(async (opts: { script?: string }) => {
      checkEnum("script", opts.script, COVERAGE_TAGS, "catalog fonts list");
      const m = await fontManifestOrFail();
      const rows = [];
      for (const f of m.fonts) {
        if (opts.script && !(f.coverage?.tags ?? []).includes(opts.script as (typeof COVERAGE_TAGS)[number])) continue;
        let synced = true;
        for (const file of f.files) if (!(await exists(path.join(fontsDataDir(), f.id, file.local)))) synced = false;
        rows.push({
          id: f.id,
          family: f.family,
          category: f.category,
          license: f.license.id,
          coverage: f.coverage?.tags ?? [],
          weights: f.files.map((x) => x.weight ?? "?"),
          bytes: f.files.reduce((n, x) => n + (x.bytes ?? 0), 0),
          synced,
        });
      }
      out(rows);
    });

  fontsCmd
    .command("pairs")
    .description("List the curated font pairs by register, with the scripts both fonts cover")
    .option("--script <tag>", `Only pairs whose two fonts cover: ${COVERAGE_TAGS.join(" | ")}`)
    .action(async (opts: { script?: string }) => {
      checkEnum("script", opts.script, COVERAGE_TAGS, "catalog fonts pairs");
      const m = await fontManifestOrFail();
      const byId = new Map(m.fonts.map((f) => [f.id, f]));
      const rows = m.pairs
        .map((p) => {
          const d = byId.get(p.display.font)!;
          const b = byId.get(p.body.font)!;
          const scripts = (d.coverage?.tags ?? []).filter((t) => (b.coverage?.tags ?? []).includes(t));
          return {
            id: p.id,
            register: p.register,
            display: `${d.family} ${p.display.weight}${p.display.transform === "uppercase" ? " caps" : ""}`,
            body: `${b.family} ${p.body.weight}`,
            scripts,
            preview: `previews/fonts/${p.id}.mp4`,
            whenToUse: p.whenToUse,
          };
        })
        .filter((r) => !opts.script || r.scripts.includes(opts.script as (typeof COVERAGE_TAGS)[number]));
      out(rows);
    });

  fontsCmd
    .command("sync")
    .description("Download every font from google/fonts at the pinned commit into .ralphy/catalog/fonts/, verify the license text and sha256, measure glyph coverage. --write records hashes, weights and coverage tags in catalog/fonts.json")
    .option("--id <ids...>", "Only these font ids")
    .option("--write", "Write sha256, sizes, weights and coverage back to catalog/fonts.json", false)
    .action(async (opts: { id?: string[]; write: boolean }) => {
      const m = await fontManifestOrFail();
      const { manifest: next, rows } = await syncFonts(m, { ids: opts.id });
      if (opts.write) await fs.writeFile(fontManifestPath(), JSON.stringify(next, null, 2) + "\n");
      const failed = rows.filter((r) => r.error);
      out({ written: opts.write ? fontManifestPath() : null, dataDir: fontsDataDir(), fonts: rows.length, failed: failed.length, rows });
      if (failed.length > 0) process.exitCode = 1;
    });

  fontsCmd
    .command("lint")
    .description("Fail on any font without a recorded, allowed license: every font-family named in catalog fragments must be in catalog/fonts.json with a pinned license and files")
    .action(async () => {
      const m = await fontManifestOrFail();
      const issues = lintFontManifest(m, [{ where: "cli/lib/catalog/harness.ts", text: HARNESS_CSS }, ...(await fontLintSources())]);
      const errors = issues.filter((i) => i.severity === "error").length;
      out({ ok: errors === 0, fonts: m.fonts.length, pairs: m.pairs.length, errors, warnings: issues.length - errors, issues });
      if (errors > 0) process.exitCode = 1;
    });

  fontsCmd
    .command("preview")
    .description("Render a 9:16 specimen mp4 per font pair (English then Russian) into .ralphy/catalog/previews/fonts/ (local, free)")
    .option("--pair <ids...>", "Only these pair ids")
    .option("--force", "Re-render existing previews", false)
    .option("--build-only", "Write the compositions; skip rendering", false)
    .option("--workers <n>", "Capture workers per render (number or auto)", "2")
    .action(async (opts: { pair?: string[]; force: boolean; buildOnly: boolean; workers: string }) => {
      const m = await fontManifestOrFail();
      for (const id of opts.pair ?? []) if (!m.pairs.some((p) => p.id === id)) raiseError("E_NOT_FOUND", { kind: "font pair", id });
      const outDir = path.join(catalogPreviewsDir(), "fonts");
      await fs.mkdir(outDir, { recursive: true });
      const built: string[] = [];
      const skipped: string[] = [];
      const failed: Array<{ id: string; error: string }> = [];
      const warnings: string[] = [];
      for (const pair of m.pairs.filter((p) => !opts.pair || opts.pair.includes(p.id))) {
        const outPath = path.join(outDir, `${pair.id}.mp4`);
        if (!opts.force && !opts.buildOnly && (await exists(outPath))) {
          skipped.push(pair.id);
          continue;
        }
        const dir = path.join(catalogBuildDir(), `font-pair-${pair.id}`);
        await fs.mkdir(dir, { recursive: true });
        const draft = buildFontPairHtml(pair, m, []);
        const faces = await vendorFonts(draft, dir, m, warnings, pair.id);
        const html = buildFontPairHtml(pair, m, faces ?? []);
        await fs.writeFile(path.join(dir, "index.html"), html);
        if (opts.buildOnly) {
          built.push(pair.id);
          continue;
        }
        const r = await runHyperframesRender({ projectDir: dir, outputPath: outPath, quality: "standard", workers: opts.workers, quiet: true });
        if (r.exitCode === 0) built.push(pair.id);
        else failed.push({ id: pair.id, error: r.stderr.slice(-300) });
      }
      out({ built, skipped, failed, warnings, previewsDir: outDir });
    });

  cmd
    .command("page")
    .description("Write the static catalog page (filters by kind / mood / energy, playable local previews)")
    .action(async () => {
      const manifest = await manifestOrFail();
      const result = await buildCatalogPage(manifest, await loadSfxManifest(), await fontManifestOrNull());
      ok(`Catalog page -> ${catalogPagePath()}`);
      out(result);
    });

  return cmd;
}
