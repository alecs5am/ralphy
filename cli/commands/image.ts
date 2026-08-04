// `ralphy image <recipe>` — thin CLI over cli/lib/image/cutout.ts.
//
// Sister to `ralphy video <recipe>` and `ralphy audio <recipe>`. Provides
// image-post primitives (chromakey, flood-fill cutout, alpha-trim/fit, SVG
// rasterize) so the agent doesn't paste raw ffmpeg into projects.
//
// Issue #037 — recipes derived from three projects:
//   ralphy-vs-higgsfield-001 (chromakey),
//   ralphy-carousel-001      (svg → png),
//   free-air-vpn-stickerpack (flood-fill cutout + telegram fit).

import { Command } from "commander";
import path from "node:path";
import {
  chromakey,
  floodFillCutout,
  fitImage,
  ps1Crunch,
} from "../lib/image/cutout.js";
import { convertImage, type MaxBox } from "../lib/image/convert.js";
import { ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { ralphDir } from "../lib/paths.js";
import {
  completeArtifactRun,
  finishRun,
  finishRunAttempt,
  projectRunFailure,
  startRun,
  startRunAttempt,
} from "../lib/store/runs.js";
import { artifactOut as out, mimeForOutput, produceArtifactRevision } from "../lib/artifact-production.js";

export function imageCmd() {
  const cmd = new Command("image").description(
    "Image post-processing recipes (cutout, fit, …). Wraps cli/lib/image/cutout.ts.",
  );

  // ── cutout ──────────────────────────────────────────────────────────────
  cmd
    .command("cutout")
    .description(
      "Background removal for stickers / mascots. `--bg chroma` uses ffmpeg `colorkey` (single-color match, fast). `--bg flood` walks the canvas in headless Chromium from the four corners and clears only the connected background — preserves the die-cut outline + interior white islands (per the free-air-vpn-stickerpack lessons; u2net cuts them off).",
    )
    .requiredOption("--in <path>", "Input image (PNG/JPG/WebP)")
    .requiredOption("--out <path>", "Output PNG (alpha)")
    .option("--bg <mode>", "Background mode: flood | chroma (default flood)", "flood")
    .option("--color <hex>", "Background colour for chroma keying (default 0x00b140 for chroma, sampled top-left for flood)")
    .option("--tolerance <n>", "Flood-fill colour-distance tolerance 0..255 (default 24)", (v) => parseInt(v, 10), 24)
    .option("--similarity <n>", "Chroma similarity 0..1 (default 0.3)", (v) => Number(v), 0.3)
    .option("--feather <n>", "Chroma blend feather 0..1 (default 0.1)", (v) => Number(v), 0.1)
    .option("--despill", "Apply colorhold despill pass after chroma key", false)
    .requiredOption("--project <id>", "Project ID")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const mode = String(opts.bg ?? "flood").toLowerCase();
        if (mode !== "chroma" && mode !== "chromakey" && mode !== "flood") {
          raiseError("E_INPUT_INVALID", {
            field: "bg",
            detail: `unknown --bg mode "${opts.bg}" — expected flood | chroma`,
            verb: "image cutout",
          });
          return;
        }
        const completed = await produceArtifactRevision({
          scope: { projectId: opts.project }, runKind: "image.cutout",
          requestedOutput: opts.out, artifactKind: "image", mime: mimeForOutput(opts.out),
          provider: "local", model: `image/cutout-${mode}`,
          produce: async (dst) => {
            if (mode === "chroma" || mode === "chromakey") {
              await chromakey({ src: path.resolve(opts.in), dst, color: opts.color,
                similarity: opts.similarity, feather: opts.feather, despill: Boolean(opts.despill) });
            } else {
              await floodFillCutout({ src: path.resolve(opts.in), dst, color: opts.color, tolerance: opts.tolerance });
            }
          },
        });
        ok(`Cutout → Artifact Revision ${completed.revision.id}`);
        out({ src: opts.in, artifactId: completed.artifact.id, revisionId: completed.revision.id, runId: completed.run.id, mode });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `image cutout: ${e?.message ?? e}` });
      }
    });

  // ── fit ─────────────────────────────────────────────────────────────────
  cmd
    .command("fit")
    .description(
      "Alpha-trim + scale. `--long N` sets the long-edge target preserving aspect; `--trim-alpha` removes transparent margins first (essential for stickers); `--telegram` is shorthand for `--trim-alpha --long 512` (TG sticker spec).",
    )
    .requiredOption("--in <path>", "Input image")
    .requiredOption("--out <path>", "Output image")
    .option("--long <n>", "Long-edge size in pixels", (v) => parseInt(v, 10))
    .option("--trim-alpha", "Trim transparent margins before scaling", false)
    .option("--telegram", "Telegram sticker preset (trim-alpha + 512 long-edge)", false)
    .requiredOption("--project <id>", "Project ID")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const completed = await produceArtifactRevision({
          scope: { projectId: opts.project }, runKind: "image.fit", requestedOutput: opts.out,
          artifactKind: "image", mime: mimeForOutput(opts.out), provider: "local", model: "image/fit",
          produce: (dst) => fitImage({ src: path.resolve(opts.in), dst, long: opts.long,
            trimAlpha: Boolean(opts.trimAlpha), telegram: Boolean(opts.telegram) }),
        });
        ok(`Fit → Artifact Revision ${completed.revision.id}`);
        out({ src: opts.in, artifactId: completed.artifact.id, revisionId: completed.revision.id, runId: completed.run.id,
          long: opts.telegram ? 512 : opts.long, trimAlpha: Boolean(opts.trimAlpha || opts.telegram) });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `image fit: ${e?.message ?? e}` });
      }
    });

  // ── crunch ────────────────────────────────────────────────────────────────
  cmd
    .command("crunch")
    .description(
      "Authentic PS1 / PlayStation-1 crunch: bilinear downscale (kills high-poly/texture detail) → 16-bit rgb565 framebuffer (colour banding) → nearest-neighbour upscale (crunchy aliased pixels). Removes the 'clean / cartoonish' feel of a modern render so a generated still reads as a real PS1 screenshot. `--scale` controls harshness (higher = harsher).",
    )
    .requiredOption("--in <path>", "Input image (PNG/JPG/WebP)")
    .requiredOption("--out <path>", "Output PNG")
    .option("--scale <n>", "Internal-resolution downscale factor (default 4; try 3-6)", (v) => parseInt(v, 10), 4)
    .option("--noise <n>", "Add static film grain 0..100 (default 0 = off)", (v) => parseInt(v, 10), 0)
    .requiredOption("--project <id>", "Project ID")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const completed = await produceArtifactRevision({
          scope: { projectId: opts.project }, runKind: "image.crunch", requestedOutput: opts.out,
          artifactKind: "image", mime: mimeForOutput(opts.out), provider: "local", model: "image/crunch",
          produce: (dst) => ps1Crunch({ src: path.resolve(opts.in), dst, scale: opts.scale, noise: opts.noise }),
        });
        ok(`PS1 crunch → Artifact Revision ${completed.revision.id}`);
        out({ src: opts.in, artifactId: completed.artifact.id, revisionId: completed.revision.id, runId: completed.run.id,
          scale: opts.scale, noise: opts.noise });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `image crunch: ${e?.message ?? e}` });
      }
    });

  // ── convert ──────────────────────────────────────────────────────────────
  cmd
    .command("convert")
    .description(
      "Format + resize + quality on a still (issue #103): PNG → JPG, WebP → PNG, downscale-to-fit (`--max WxH`, never upscales), metadata strip (`--strip` drops EXIF / C2PA / colour profiles — the #021 anchor-prep recipe as a reusable verb). Target format inferred from the --out extension. ImageMagick one-invocation when installed, ffmpeg fallback otherwise.",
    )
    .requiredOption("--in <path>", "Input image (PNG/JPG/WebP)")
    .requiredOption("--out <path>", "Output image (extension picks the target format)")
    .option("--max <WxH>", "Downscale to fit inside WxH preserving aspect; never upscale (e.g. 720x1280)")
    .option("--quality <n>", "JPG/WebP quality 1-100 (default 85)", (v) => parseInt(v, 10), 85)
    .option("--strip", "Drop EXIF / C2PA / colour-profile metadata", false)
    .requiredOption("--project <id>", "Project ID")
    .option("--note <note>", "Free-form note")
    .addHelpText(
      "after",
      `
Examples:
  ralphy image convert --in poster.png --out poster.jpg --max 720x1280
  ralphy image convert --in ref.webp --out ref.png
  ralphy image convert --in anchor.png --out anchor.jpg --max 720x1280 --quality 85 --strip
`,
    )
    .action(async (opts: any) => {
      try {
        let max: MaxBox | undefined;
        if (opts.max !== undefined) {
          const m = String(opts.max).trim().match(/^(\d+)[xX](\d+)$/);
          if (!m || parseInt(m[1], 10) <= 0 || parseInt(m[2], 10) <= 0) {
            raiseError("E_INPUT_INVALID", {
              field: "max",
              detail: `malformed --max "${opts.max}" — expected <W>x<H> with positive integers (e.g. 720x1280)`,
              verb: "image convert",
            });
            return;
          }
          max = { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
        }
        if (!Number.isFinite(opts.quality) || opts.quality < 1 || opts.quality > 100) {
          raiseError("E_INPUT_INVALID", {
            field: "quality",
            detail: `invalid --quality "${opts.quality}" — expected an integer 1-100`,
            verb: "image convert",
          });
          return;
        }
        const requestedOutput = path.resolve(opts.out);
        const extension = path.extname(requestedOutput).toLowerCase();
        const mime = imageMime(extension);
        const slug = path.basename(requestedOutput, extension);
        const run = startRun({ projectId: opts.project, kind: "image.convert", label: slug });
        const attempt = startRunAttempt({
          runId: run.id,
          provider: "local",
          model: "image/convert",
          request: { max: max ? `${max.w}x${max.h}` : null },
        });
        const tempOutput = path.join(ralphDir(), "tmp", run.id, `${slug}${extension}`);
        try {
          await convertImage({
            src: path.resolve(opts.in),
            dst: tempOutput,
            max,
            quality: opts.quality,
            strip: Boolean(opts.strip),
          });
        } catch (error) {
          const projected = projectRunFailure(error, { provider: "local" });
          finishRunAttempt(attempt.id, { state: "failed", error: projected });
          finishRun(run.id, { state: "failed", error: projected });
          throw projected;
        }
        const completed = await completeArtifactRun({
          runId: run.id,
          attemptId: attempt.id,
          finishedPath: tempOutput,
          originalName: `${slug}${extension}`,
          mime,
          artifact: { slug, kind: "image", state: "candidate" },
          objectMetadata: { operation: "convert" },
          response: { operation: "convert" },
          costUsd: 0,
        });
        ok(`Converted → Artifact Revision ${completed.revision.id}`);
        out({
          src: opts.in,
          artifactId: completed.artifact.id,
          revisionId: completed.revision.id,
          objectId: completed.revision.objectId,
          runId: completed.run.id,
          max: max ? `${max.w}x${max.h}` : null,
          quality: opts.quality,
          strip: Boolean(opts.strip),
        });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `image convert: ${e?.message ?? e}` });
      }
    });

  return cmd;
}

function imageMime(extension: string): string {
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  throw new Error(`unsupported image output extension: ${extension || "<none>"}`);
}
