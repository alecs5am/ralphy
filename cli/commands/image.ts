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
import { out, ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";

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
    .option("--project <id>", "Project ID for log line")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const mode = String(opts.bg ?? "flood").toLowerCase();
        let dst: string;
        if (mode === "chroma" || mode === "chromakey") {
          dst = await chromakey({
            src: path.resolve(opts.in),
            dst: path.resolve(opts.out),
            color: opts.color,
            similarity: opts.similarity,
            feather: opts.feather,
            despill: Boolean(opts.despill),
            projectId: opts.project,
            note: opts.note,
          });
        } else if (mode === "flood") {
          dst = await floodFillCutout({
            src: path.resolve(opts.in),
            dst: path.resolve(opts.out),
            color: opts.color,
            tolerance: opts.tolerance,
            projectId: opts.project,
            note: opts.note,
          });
        } else {
          raiseError("E_INPUT_INVALID", {
            field: "bg",
            detail: `unknown --bg mode "${opts.bg}" — expected flood | chroma`,
            verb: "image cutout",
          });
          return;
        }
        ok(`Cutout → ${dst}`);
        out({ src: opts.in, dst, mode });
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
    .option("--project <id>", "Project ID for log line")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const dst = await fitImage({
          src: path.resolve(opts.in),
          dst: path.resolve(opts.out),
          long: opts.long,
          trimAlpha: Boolean(opts.trimAlpha),
          telegram: Boolean(opts.telegram),
          projectId: opts.project,
          note: opts.note,
        });
        ok(`Fit → ${dst}`);
        out({ src: opts.in, dst, long: opts.telegram ? 512 : opts.long, trimAlpha: Boolean(opts.trimAlpha || opts.telegram) });
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
    .option("--project <id>", "Project ID for log line")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const dst = await ps1Crunch({
          src: path.resolve(opts.in),
          dst: path.resolve(opts.out),
          scale: opts.scale,
          noise: opts.noise,
          projectId: opts.project,
          note: opts.note,
        });
        ok(`PS1 crunch → ${dst}`);
        out({ src: opts.in, dst, scale: opts.scale, noise: opts.noise });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `image crunch: ${e?.message ?? e}` });
      }
    });

  return cmd;
}
