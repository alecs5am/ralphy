// `ralphy meme` — search / pull green-screen meme overlays and meme sound
// effects from the greenscreenmemes.com + memesoundeffects.com sister sites.
//
// Discovery is live against their open WordPress REST APIs; media downloads
// on demand into .ralphy/cache/memes/ (nothing is rehosted — see the header
// of cli/lib/meme-sites.ts for the ToS rationale). `--install <project>`
// copies into artifacts/videos/ (greenscreen) or artifacts/sfx/ (sounds);
// `--keyed` additionally chroma-keys a green-screen clip to a VP9 alpha
// .webm ready for a HyperFrames <video> overlay.

import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import {
  MEME_SITES,
  searchMemes,
  trendingMemes,
  resolveMemeBySlug,
  downloadMemeMedia,
  parseMemeRef,
  type MemeSource,
  type MemeHit,
} from "../lib/meme-sites.js";
import { chromaKeyVideo } from "../lib/ffmpeg-recipes.js";
import { artifactKindDir, projectDir } from "../lib/paths.js";
import { protectExistingAsset } from "../lib/providers/shared.js";
import { logGeneration } from "../lib/gen-log.js";
import { out, ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";

function parseSources(v: string | undefined): MemeSource[] {
  if (!v || v === "both") return ["greenscreen", "sounds"];
  if (v in MEME_SITES) return [v as MemeSource];
  raiseError("E_INPUT_INVALID", {
    field: "source",
    detail: `expected greenscreen | sounds | both, got '${v}'`,
    verb: "meme",
  });
  return []; // unreachable — raiseError throws
}

function hitRow(h: MemeHit) {
  return {
    ref: `${h.source}/${h.slug}`,
    title: h.title,
    mediaUrl: h.mediaUrl,
    durationSec: h.durationSec ?? null,
    pageUrl: h.pageUrl,
  };
}

export function memeCmd() {
  const cmd = new Command("meme").description(
    "Green-screen meme overlays + meme sound effects (greenscreenmemes.com / memesoundeffects.com). Live search, on-demand pull, fair-use-meme-reference licensing — rights clearance is on the user.",
  );

  cmd
    .command("search <query>")
    .description("Live search both sites' catalogs (~6.5k green-screen clips, ~12k sounds)")
    .option("--source <s>", "greenscreen | sounds | both (default both)", "both")
    .option("--limit <n>", "Max hits per source", (v) => parseInt(v, 10), 8)
    .action(async (query: string, opts) => {
      try {
        const sources = parseSources(opts.source);
        const hits = (await Promise.all(sources.map((s) => searchMemes(s, query, opts.limit)))).flat();
        out({ query, hits: hits.map(hitRow) });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `meme search: ${e?.message || e}` });
      }
    });

  cmd
    .command("trending")
    .description("Hand-curated trending lists (/trending-sounds/ and /top-100/)")
    .option("--source <s>", "greenscreen | sounds | both (default sounds)", "sounds")
    .option("--limit <n>", "Max items per source", (v) => parseInt(v, 10), 20)
    .action(async (opts) => {
      try {
        const sources = parseSources(opts.source);
        const hits = (await Promise.all(sources.map((s) => trendingMemes(s, opts.limit)))).flat();
        out({ hits: hits.map(hitRow) });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `meme trending: ${e?.message || e}` });
      }
    });

  cmd
    .command("pull <ref>")
    .description(
      "Download one meme into the cache. <ref> is '<source>/<slug>' (from search), a page URL, or a direct media URL (from trending).",
    )
    .option("--install <project-id>", "Also copy into <project>/artifacts/videos|sfx/ as meme-<slug>.<ext>")
    .option("--keyed", "Greenscreen only: also chroma-key to a VP9 alpha .webm next to the install/cache copy", false)
    .option("--force-overwrite", "Skip the .v2 collision archive on install", false)
    .action(async (ref: string, opts) => {
      try {
        const parsed = parseMemeRef(ref);
        if (!parsed) {
          raiseError("E_INPUT_INVALID", {
            field: "ref",
            detail: `expected '<source>/<slug>', a page URL, or a media URL from ${Object.values(MEME_SITES).map((s) => s.mediaHost).join(" / ")}; got '${ref}'`,
            verb: "meme pull",
          });
          return;
        }

        let mediaUrl = parsed.mediaUrl ?? null;
        let slug = parsed.slug;
        let hit: MemeHit | null = null;
        if (!mediaUrl) {
          hit = await resolveMemeBySlug(parsed.source, parsed.slug!);
          mediaUrl = hit.mediaUrl;
          slug = hit.slug;
        }
        if (!mediaUrl) {
          raiseError("E_NOT_FOUND", { kind: "MemeMedia", id: `${parsed.source}/${slug}` });
          return;
        }
        if (!slug) slug = path.basename(new URL(mediaUrl).pathname).replace(/\.[a-z0-9]+$/i, "");

        const cachedPath = await downloadMemeMedia(parsed.source, mediaUrl, slug);
        ok(`Pulled ${parsed.source}/${slug} → ${cachedPath}`);

        let installedDest: string | undefined;
        let keyedDest: string | undefined;
        const kind = MEME_SITES[parsed.source].mediaKind;

        if (opts.install) {
          const projDir = projectDir(opts.install);
          try { await fs.access(projDir); } catch { raiseError("E_NOT_FOUND", { kind: "Project", id: opts.install }); }
          const destDir = artifactKindDir(opts.install, kind);
          await fs.mkdir(destDir, { recursive: true });
          const dest = path.join(destDir, `meme-${slug}${path.extname(cachedPath)}`);
          await protectExistingAsset(dest, opts.forceOverwrite);
          await fs.copyFile(cachedPath, dest);
          installedDest = path.relative(projDir, dest);
          ok(`Installed → ${installedDest}`);
          await logGeneration(opts.install, {
            provider: "other",
            model: MEME_SITES[parsed.source].base.replace("https://", ""),
            endpoint: "meme-pull",
            kind: kind === "sfx" ? "sfx" : "video",
            input: { project: opts.install, ref: `${parsed.source}/${slug}`, mediaUrl },
            output: { local: installedDest },
            status: "ok",
            cost_usd: 0,
            note: "fair-use-meme-reference — rights clearance is on the user",
          });
        }

        if (opts.keyed) {
          if (parsed.source !== "greenscreen") {
            raiseError("E_INPUT_INVALID", { field: "keyed", detail: "--keyed only applies to greenscreen video", verb: "meme pull" });
          }
          const srcForKey = opts.install
            ? path.join(projectDir(opts.install), installedDest!)
            : cachedPath;
          const webm = srcForKey.replace(/\.[a-z0-9]+$/i, ".webm");
          await chromaKeyVideo({
            src: srcForKey,
            dst: webm,
            forceOverwrite: opts.forceOverwrite,
            projectId: opts.install,
            note: `chroma-keyed meme overlay ${parsed.source}/${slug}`,
          });
          keyedDest = opts.install ? path.relative(projectDir(opts.install), webm) : webm;
          ok(`Keyed → ${keyedDest}`);
        }

        out({
          ref: `${parsed.source}/${slug}`,
          mediaUrl,
          cachedPath,
          ...(hit?.durationSec ? { durationSec: hit.durationSec } : {}),
          ...(installedDest ? { project: opts.install, dest: installedDest } : {}),
          ...(keyedDest ? { keyed: keyedDest } : {}),
        });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `meme pull: ${e?.message || e}` });
      }
    });

  cmd.addHelpText(
    "after",
    `
Examples:
  ralphy meme search "vine boom" --source sounds
  ralphy meme search "haaland" --source greenscreen
  ralphy meme trending --source sounds --limit 10
  ralphy meme pull greenscreen/haaland-brazilian-dance-green-screen --install my-proj-001 --keyed
  ralphy meme pull sounds/nope-meme --install my-proj-001
`,
  );

  return cmd;
}
