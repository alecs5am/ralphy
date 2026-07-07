// `ralphy unit` — project-local curated deliverables (#069).
//
// A *unit* is a finished deliverable assembled from COPIES of selected
// `artifacts/` files, living at `<project>/units/<slug>/` with a
// `unit.json` manifest that mirrors the library-v2 Unit entity. This is the
// project-side half of the Unit model (the library half is #063); publish
// (#056) reads `units/*/unit.json` directly.
//
// Hard rules (AGENTS.md invariant #14 — append-only):
//   • COPY, never move. The source `artifacts/` files are left untouched.
//   • `units/` is append-only. A new slug = a new dir. A re-`create` on an
//     existing slug writes `units/<slug>.v2/` (then `.v3`…), never overwrites.
//   • `add` appends to `media`; it never drops or rewrites existing entries.
//   • `delete` is the only destructive verb — allowed because the user invoked
//     it explicitly.

import { Command } from "commander";
import fs from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { projectDir } from "../lib/paths.js";
import { out, ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import {
  UnitManifestSchema,
  UNIT_FORMATS,
  isValidUnitSlug,
  type UnitManifest,
  type UnitProvenance,
} from "../lib/schemas/unit.js";
// Unit-formation core extracted to cli/lib/unit.ts (#511) — the ralphy-unit /
// ralphy-social-copy workflow executors call the SAME code path.
import {
  buildMediaMeta,
  captionUnit,
  copyMedia,
  createUnit,
  expandFrom,
  readUnitManifest,
  unitsRoot,
  writeUnitManifest,
} from "../lib/unit.js";
import { isBankStale, LAST_REVIEWED } from "../lib/social/hashtag-bank.js";
import { buildScorecard } from "../lib/scorecard.js";
import { logUserPrompt } from "../lib/gen-log.js";
import { buildDistributionPack } from "../lib/distribution.js";
import {
  DISTRIBUTION_PACK_FILE,
  DISTRIBUTION_HANDOFF_FILE,
  DISTRIBUTION_COPY_DIR,
  distributionZipName,
  type DistributionPack,
} from "../lib/schemas/distribution-pack.js";
// Reuse the archive dependency already in the tree (`adm-zip`, pulled in via
// `hyperframes`; the only read/write zip lib present) to CREATE the bundle zip
// (#458 #3). No new dependency, no shelling to a system `zip` binary.
import AdmZip from "adm-zip";

/** Resolve `<project>` to its on-disk dir, refusing if it does not exist. */
function resolveProjectDir(projectId: string): string {
  const dir = projectDir(projectId);
  if (!existsSync(dir)) {
    raiseError("E_NOT_FOUND", { kind: "Project", id: projectId });
  }
  return dir;
}

function buildProvenance(opts: any): UnitProvenance | undefined {
  const p: UnitProvenance = {};
  if (opts.template) p.template = String(opts.template);
  if (opts.style) p.style = String(opts.style);
  if (Array.isArray(opts.recipe) && opts.recipe.length) p.recipes = opts.recipe.map(String);
  if (Array.isArray(opts.asset) && opts.asset.length) p.assets = opts.asset.map(String);
  return Object.keys(p).length ? p : undefined;
}

/**
 * Resolve the append-only filename for a pack artifact. If `<base>` is free,
 * returns it; else mirrors the asset auto-version rule — `<stem>.v2<ext>`
 * (then v3…), so the prior pack survives untouched. Never overwrites.
 */
function resolveNewVersionedName(dir: string, base: string): string {
  if (!existsSync(path.join(dir, base))) return base;
  const ext = path.extname(base);
  const stem = path.basename(base, ext);
  let n = 2;
  while (existsSync(path.join(dir, `${stem}.v${n}${ext}`))) n++;
  return `${stem}.v${n}${ext}`;
}

/** Render the human-readable DISTRIBUTION.md handoff from a pack. English-on-disk. */
function renderDistributionHandoff(pack: DistributionPack): string {
  const lines: string[] = [];
  lines.push(`# Distribution pack — ${pack.slug}`);
  lines.push("");
  lines.push(`- Project: ${pack.projectId}`);
  lines.push(`- Format: ${pack.format}`);
  lines.push(`- Generated: ${pack.generatedAt}`);
  lines.push(`- Thumbnail: ${pack.thumbnail ?? "(none — see note)"}`);
  lines.push(`- Shippable: ${pack.shippable ? "yes" : "no"}`);
  if (pack.readiness) {
    lines.push(
      `- Readiness: ${pack.readiness.verdict}${pack.readiness.bypassed ? " (user-bypassed)" : ""} — ${pack.readiness.reason}`,
    );
  }
  if (pack.archive) lines.push(`- Archive: ${pack.archive}`);
  lines.push("");
  lines.push(`> ${pack.publishNote}`);
  lines.push("");
  for (const [platform, section] of Object.entries(pack.platforms)) {
    lines.push(`## ${platform}`);
    if (section.title) lines.push(`**Title:** ${section.title}`);
    if (section.caption) lines.push(`**Caption:** ${section.caption}`);
    if (section.primaryText) lines.push(`**Primary text:** ${section.primaryText}`);
    if (section.ctaVariants?.length) lines.push(`**CTA variants:** ${section.ctaVariants.join(" / ")}`);
    if (section.hashtags?.length) lines.push(`**Hashtags:** ${section.hashtags.join(" ")}`);
    if (section.specStatus) lines.push(`**Spec:** ${section.specStatus}`);
    if (section.exportRequirements?.length) lines.push(`**Export:** ${section.exportRequirements.join(", ")}`);
    if (section.specNotes?.length) {
      for (const n of section.specNotes) lines.push(`- ${n}`);
    }
    lines.push("");
  }
  lines.push("## Selected media");
  for (const m of pack.selectedMedia) lines.push(`- ${DISTRIBUTION_COPY_DIR}/${m}`);
  lines.push("");
  return lines.join("\n");
}

export function unitCmd() {
  const cmd = new Command("unit").description(
    "Manage project-local curated deliverables (units = copies of selected assets + provenance)",
  );

  // ── create ────────────────────────────────────────────────────────────────
  cmd
    .command("create <project>")
    .description("Form a unit by copying matched assets into units/<slug>/ + writing unit.json")
    .requiredOption("--slug <slug>", "Unit slug (kebab-case)")
    .requiredOption("--format <format>", `Media format. One of: ${UNIT_FORMATS.join(", ")}`)
    .requiredOption("--from <glob>", "Glob, relative to the project dir, of source media to copy (e.g. 'artifacts/images/outline-*.png')")
    .option("--title <text>", "Human-readable unit title")
    .option("--blurb <text>", "Short unit description")
    .option("--template <slug>", "Provenance: the structure template slug")
    .option("--style <slug>", "Provenance: the visual style slug")
    .option("--recipe <slug>", "Provenance: a recipe slug (repeatable)", collect, [])
    .option("--asset <slug>", "Provenance: a reusable asset slug (repeatable)", collect, [])
    .option(
      "--polished",
      "Mark this Unit polished — consults the readiness scorecard (#427) and REFUSES when the verdict is `blocked` (a hard gate failed)",
    )
    .option(
      "--force-polished <reason>",
      "Bypass the scorecard gate on --polished with an explicit user reason (logged)",
    )
    .action(async (project: string, opts: any) => {
      const slug = String(opts.slug);
      if (!isValidUnitSlug(slug)) {
        raiseError("E_VALIDATION_FAILED", {
          target: "--slug",
          detail: `'${slug}' is not kebab-case (lowercase letters, digits, hyphens)`,
        });
      }
      const format = String(opts.format);
      if (!(UNIT_FORMATS as readonly string[]).includes(format)) {
        raiseError("E_VALIDATION_FAILED", {
          target: "--format",
          detail: `'${format}' is not a known format. One of: ${UNIT_FORMATS.join(", ")}`,
        });
      }

      const projectDir = resolveProjectDir(project);
      const sources = expandFrom(projectDir, String(opts.from));
      if (sources.length === 0) {
        raiseError("E_VALIDATION_FAILED", {
          target: "--from",
          detail: `no files matched '${opts.from}' relative to ${projectDir}`,
        });
      }

      // ── polished-gate (#427) ────────────────────────────────────────────────
      // Opt-in only: the existing happy path (no --polished) is untouched. When
      // the user asks for polished status, consult the readiness scorecard (which
      // itself reuses the contract's native-video gate) and REFUSE if the verdict
      // is `blocked` — a hard gate failed (fidelity blocksShip / council block /
      // failed eval / a failed required dimension). --force-polished <reason>
      // bypasses with an explicit, logged user reason (AGENTS.md #4 — gates
      // refuse, not warn; the bypass is the user's explicit override).
      if (opts.polished) {
        const card = buildScorecard({ projectId: project });
        if (card.verdict === "blocked") {
          if (opts.forcePolished) {
            await logUserPrompt(project, {
              stage: "force-polished",
              text: `Polished-unit gate bypassed for slug "${slug}" (scorecard blocked): ${String(opts.forcePolished)}`,
            });
          } else {
            raiseError("E_GATE_VIDEO", {
              slot: `unit:${slug}`,
              detail: `readiness scorecard verdict is "blocked" — ${card.reason} Run \`ralphy project scorecard ${project}\`, fix the blocker, or pass --force-polished "<reason>" to override.`,
            });
          }
        }
      }

      // Formation core lives in cli/lib/unit.ts (#511) — the same path the
      // ralphy-unit workflow executor calls. COPY-never-move, append-only dir.
      const created = await createUnit({
        projectId: project,
        slug,
        format: format as UnitManifest["format"],
        sources,
        title: opts.title ? String(opts.title) : undefined,
        blurb: opts.blurb ? String(opts.blurb) : undefined,
        provenance: buildProvenance(opts),
      });

      ok(`Unit created: ${created.dirName} (${created.manifest.media.length} media)`);
      out({
        slug,
        dir: created.dirName,
        format,
        media_count: created.manifest.media.length,
        path: path.relative(projectDir, created.unitDir),
        versioned: created.dirName !== slug,
        provenance_graph: created.provenanceGraphFile,
        manifest: created.manifest,
      });
    });

  // ── list ────────────────────────────────────────────────────────────────
  cmd
    .command("list <project>")
    .description("List units in a project")
    .action(async (project: string) => {
      const projectDir = resolveProjectDir(project);
      const unitsDir = unitsRoot(projectDir);
      const rows: Array<Record<string, unknown>> = [];
      if (existsSync(unitsDir)) {
        const entries = (await fs.readdir(unitsDir, { withFileTypes: true }))
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort((a, b) => a.localeCompare(b));
        for (const name of entries) {
          const manifest = await readUnitManifest(path.join(unitsDir, name));
          if (!manifest) continue;
          rows.push({
            dir: name,
            slug: manifest.slug,
            format: manifest.format,
            media_count: manifest.media.length,
            created: manifest.created,
          });
        }
      }
      out(rows);
    });

  // ── show ────────────────────────────────────────────────────────────────
  cmd
    .command("show <project> <slug>")
    .description("Show a unit's manifest + resolved media paths")
    .action(async (project: string, slug: string) => {
      const projectDir = resolveProjectDir(project);
      const unitDir = path.join(unitsRoot(projectDir), slug);
      const manifest = await readUnitManifest(unitDir);
      if (!manifest) raiseError("E_NOT_FOUND", { kind: "Unit", id: slug });
      out({
        ...manifest,
        resolved_media: manifest!.media.map((m) =>
          path.join(path.relative(projectDir, unitDir), m),
        ),
      });
    });

  // ── add ────────────────────────────────────────────────────────────────
  cmd
    .command("add <project> <slug>")
    .description("Copy more media into an existing unit (appends to media, never drops existing)")
    .requiredOption("--from <glob>", "Glob, relative to the project dir, of source media to copy")
    .action(async (project: string, slug: string, opts: any) => {
      const projectDir = resolveProjectDir(project);
      const unitDir = path.join(unitsRoot(projectDir), slug);
      const manifest = await readUnitManifest(unitDir);
      if (!manifest) raiseError("E_NOT_FOUND", { kind: "Unit", id: slug });

      const sources = expandFrom(projectDir, String(opts.from));
      if (sources.length === 0) {
        raiseError("E_VALIDATION_FAILED", {
          target: "--from",
          detail: `no files matched '${opts.from}' relative to ${projectDir}`,
        });
      }
      const added = await copyMedia(projectDir, unitDir, sources);
      const addedMeta = buildMediaMeta(unitDir, added);
      const mergedMeta = { ...(manifest!.media_meta ?? {}), ...addedMeta };

      const updated: UnitManifest = {
        ...manifest!,
        media: [...manifest!.media, ...added],
        ...(Object.keys(mergedMeta).length && { media_meta: mergedMeta }),
        source_assets: [...(manifest!.source_assets ?? []), ...sources],
      };
      const parsed = UnitManifestSchema.parse(updated);
      await writeUnitManifest(unitDir, parsed);

      ok(`Added ${added.length} media to unit: ${slug}`);
      out({
        slug,
        added,
        media_count: parsed.media.length,
        manifest: parsed,
      });
    });

  // ── caption (draft platform-shaped social copy + hashtags, #403) ──────────
  cmd
    .command("caption <project> [slug]")
    .description(
      "Draft platform-shaped social copy (TikTok/Reels/Shorts) + a trending-hashtag set into unit.json. Append-only: --force to re-draft (prior caption archived). --bulk captions every unit.",
    )
    .option("--language <lang>", "Target-audience language for the copy", "English")
    .option("--niche <hint>", "Niche / register hint (picks the voice + hashtag spine; defaults to the unit's tags/provenance)")
    .option("--brief <text>", "Extra grounding text (on-screen text / source-reel caption / brief)")
    .option("--bulk", "Caption every unit in the project (slug arg ignored)")
    .option("--force", "Re-draft even if a caption exists (archives the prior into caption_versions)")
    .action(async (project: string, slug: string | undefined, opts: any) => {
      const projectDir = resolveProjectDir(project);
      const unitsDir = unitsRoot(projectDir);

      // Resolve the target unit dir names: one (slug) or all (--bulk).
      let targetDirs: string[];
      if (opts.bulk) {
        targetDirs = existsSync(unitsDir)
          ? readdirSync(unitsDir, { withFileTypes: true })
              .filter((e) => e.isDirectory())
              .map((e) => e.name)
              .sort((a, b) => a.localeCompare(b))
          : [];
        if (targetDirs.length === 0) {
          raiseError("E_NOT_FOUND", { kind: "Unit", id: `${project} (no units to caption)` });
        }
      } else {
        if (!slug) {
          raiseError("E_VALIDATION_FAILED", {
            target: "<slug>",
            detail: "a unit slug is required unless --bulk is passed",
          });
        }
        targetDirs = [slug!];
      }

      const results: Array<Record<string, unknown>> = [];
      for (const dirName of targetDirs) {
        // Caption core lives in cli/lib/unit.ts (#511) — the same path the
        // ralphy-social-copy workflow executor calls. Append-only semantics.
        const result = await captionUnit({
          projectId: project,
          dirName,
          language: String(opts.language),
          niche: opts.niche != null ? String(opts.niche) : undefined,
          brief: opts.brief != null ? String(opts.brief) : undefined,
          force: Boolean(opts.force),
        });
        if (!result) {
          // In bulk mode, skip non-unit dirs silently; single-slug → hard error.
          if (opts.bulk) continue;
          raiseError("E_NOT_FOUND", { kind: "Unit", id: dirName });
        }
        if (result!.kind === "skipped") {
          results.push({
            slug: result!.manifest.slug,
            dir: dirName,
            skipped: "caption exists — pass --force to re-draft (the prior caption is archived)",
          });
          continue;
        }
        const caption = result!.manifest.caption!;
        results.push({
          slug: result!.manifest.slug,
          dir: dirName,
          language: caption.language,
          niche: caption.niche,
          hashtags: caption.hashtags,
          caption: caption.platform,
          re_drafted: result!.reDrafted,
        });
      }

      const captioned = results.filter((r) => !("skipped" in r)).length;
      ok(`Captioned ${captioned} unit(s)`);
      out({
        project,
        bulk: Boolean(opts.bulk),
        captioned,
        bank_last_reviewed: LAST_REVIEWED,
        bank_stale: isBankStale(),
        results,
      });
    });

  // ── package (distribution pack — platform-ready handoff, #423 + #458) ──────
  cmd
    .command("package <project> <slug>")
    .description(
      "Package a unit for publication: per-platform captions/titles/hashtags + Meta ad text + thumbnail pick + per-channel spec/safe-area validation (#443) + a copied deliverables bundle ZIPPED for handoff (#458). Gated on the readiness scorecard (#427). Reuses the unit's caption (#403) when present, else drafts one. Append-only: re-package archives the prior (--force).",
    )
    .option("--thumbnail <path>", "Override the thumbnail (unit-relative path)")
    .option("--language <lang>", "Language for the caption draft fallback", "English")
    .option("--brief <text>", "Extra grounding text for the caption draft fallback")
    .option("--force", "Re-package even if a pack exists (auto-versions the prior, never overwrites)")
    .option(
      "--bypass-readiness <reason>",
      "Mark the pack shippable despite a non-`ship` readiness verdict, with an explicit logged user reason (#458 #5)",
    )
    .action(async (project: string, slug: string, opts: any) => {
      const projectDir = resolveProjectDir(project);
      const unitDir = path.join(unitsRoot(projectDir), slug);
      if (!existsSync(path.join(unitDir, "unit.json"))) {
        raiseError("E_NOT_FOUND", { kind: "Unit", id: slug });
      }

      // Append-only: refuse a silent overwrite. Without --force, stop if a pack
      // already exists; with --force the writer auto-versions the prior away.
      const packExists = existsSync(path.join(unitDir, DISTRIBUTION_PACK_FILE));
      if (packExists && !opts.force) {
        ok(`Distribution pack already exists for ${slug} — pass --force to re-package (the prior is archived)`);
        out({
          slug,
          skipped: "distribution pack exists — pass --force to re-package (prior auto-versioned)",
        });
        return;
      }

      const bypassReadiness = opts.bypassReadiness != null ? String(opts.bypassReadiness) : undefined;
      const { pack, manifest, draftedCaption, specReport } = await buildDistributionPack({
        projectId: project,
        slug,
        thumbnail: opts.thumbnail != null ? String(opts.thumbnail) : undefined,
        language: String(opts.language),
        brief: opts.brief != null ? String(opts.brief) : undefined,
        bypassReadiness,
      });

      // COPY (never move) the selected deliverables into units/<slug>/distribution/.
      // copyMedia auto-suffixes on basename collision (append-only) — sources in
      // units/<slug>/ and artifacts/ stay untouched.
      const copyDir = path.join(unitDir, DISTRIBUTION_COPY_DIR);
      const copied = await copyMedia(unitDir, copyDir, manifest.media);

      // #458 #3 — ZIP the copied bundle (+ the pack JSON + handoff inside it) for a
      // single-file handoff, using the existing `adm-zip` dependency (no new dep,
      // no shelling to `zip`). Append-only: auto-version a prior, never overwrite.
      const zipName = resolveNewVersionedName(unitDir, distributionZipName(slug));
      pack.archive = zipName; // unit-relative path of the packaged ZIP.

      // Write the pack JSON + handoff, auto-versioning a prior on --force.
      const packName = resolveNewVersionedName(unitDir, DISTRIBUTION_PACK_FILE);
      const handoffName = resolveNewVersionedName(unitDir, DISTRIBUTION_HANDOFF_FILE);
      const packJson = JSON.stringify(pack, null, 2) + "\n";
      const handoffMd = renderDistributionHandoff(pack);
      await fs.writeFile(path.join(unitDir, packName), packJson, "utf8");
      await fs.writeFile(path.join(unitDir, handoffName), handoffMd, "utf8");

      // Assemble the zip from the just-copied bundle + the metadata files. Add the
      // copied deliverables under distribution/, and the pack JSON + handoff at the
      // root so the archive is self-describing.
      const zip = new AdmZip();
      for (const m of copied) {
        zip.addLocalFile(path.join(copyDir, m), DISTRIBUTION_COPY_DIR);
      }
      zip.addFile(DISTRIBUTION_PACK_FILE, Buffer.from(packJson, "utf8"));
      zip.addFile(DISTRIBUTION_HANDOFF_FILE, Buffer.from(handoffMd, "utf8"));
      await fs.writeFile(path.join(unitDir, zipName), zip.toBuffer());

      // #458 #5 — record an explicit readiness bypass to the append-only prompt log.
      if (pack.readiness?.bypassed && pack.readiness.bypassReason) {
        await logUserPrompt(project, {
          stage: "bypass-readiness",
          text: `Distribution pack for slug "${slug}" marked shippable despite readiness verdict "${pack.readiness.verdict}": ${pack.readiness.bypassReason}`,
        });
      }

      ok(
        `Distribution pack written for ${slug} (${copied.length} media, ${Object.keys(pack.platforms).length} platforms, ${pack.shippable ? "shippable" : `NOT shippable: ${pack.readiness?.verdict ?? "unknown"}`})`,
      );
      out({
        slug,
        format: pack.format,
        pack_file: packName,
        handoff_file: handoffName,
        zip_file: zipName,
        copy_dir: path.relative(projectDir, copyDir),
        copied,
        platforms: Object.keys(pack.platforms),
        thumbnail: pack.thumbnail,
        shippable: pack.shippable,
        readiness_verdict: pack.readiness?.verdict ?? null,
        spec_verdict: specReport.verdict,
        drafted_caption: draftedCaption,
        versioned: packName !== DISTRIBUTION_PACK_FILE,
        pack,
      });
    });

  // ── delete (destructive — explicit user intent only) ──────────────────────
  cmd
    .command("delete <project> <slug>")
    .description("Delete a unit directory (destructive — only run on explicit user intent)")
    .action(async (project: string, slug: string) => {
      const projectDir = resolveProjectDir(project);
      const unitDir = path.join(unitsRoot(projectDir), slug);
      if (!existsSync(unitDir)) raiseError("E_NOT_FOUND", { kind: "Unit", id: slug });
      await fs.rm(unitDir, { recursive: true, force: true });
      ok(`Unit deleted: ${slug}`);
      out({ deleted: slug });
    });

  return cmd;
}

/** commander reducer to collect repeatable options into an array. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}
