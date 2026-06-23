// `ralphy clip <source> --from <ts> --to <ts> [--vertical] [--out <path>]`
//
// The clip-cut primitive behind the `personal-clipper` content mode (#436).
// A thin, deterministic ffmpeg wrapper: cut the [from, to) window out of a
// long-form source, optionally centre-crop to a 9:16 vertical frame, write the
// clip. It is LAZY + HONEST — it does NOT detect "viral moments". Highlight
// selection is the agent's job: read the `ref transcribe` word-level transcript,
// pick the windows, then call `ralphy clip` once per window. Behind a verb so
// AGENTS.md invariant #2 (no ad-hoc ffmpeg) holds.

import { Command } from "commander";
import { existsSync } from "node:fs";
import path from "node:path";
import { clip as clipRecipe, parseTimestampSec } from "../lib/ffmpeg-recipes.js";
import { out, ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { projectDir, artifactKindDir } from "../lib/paths.js";

export function clipCmd(): Command {
  const cmd = new Command("clip")
    .description(
      "Cut a [from, to) window out of a long-form video and (optionally) centre-crop it to 9:16 vertical. " +
        "The clip-cut primitive for the personal-clipper mode. Highlight selection is the agent's job " +
        "(read the `ralphy ref transcribe` transcript, pick the windows); this verb only executes the cut.",
    )
    .argument("<source>", "Source video (absolute path, or relative to cwd)")
    .requiredOption("--from <ts>", "Window start — seconds (`12.5`), MM:SS (`1:30`), or HH:MM:SS (`1:02:03`)")
    .requiredOption("--to <ts>", "Window end — same formats as --from")
    .option("--vertical", "Centre-crop the clip to a 9:16 vertical frame (1080x1920)", false)
    .option(
      "--out <path>",
      "Output path. Optional when --project is set — defaults to <project>/artifacts/videos/<source>-clip-<from>-<to>.mp4.",
    )
    .option("--project <id>", "Project ID — logs the cut to the gen-log and resolves the default --out.")
    .option("--force-overwrite", "Skip the .v2 collision archive", false)
    .option("--note <note>", "Free-form note recorded in the gen-log row")
    .action(
      async (
        source: string,
        opts: {
          from: string;
          to: string;
          vertical?: boolean;
          out?: string;
          project?: string;
          forceOverwrite?: boolean;
          note?: string;
        },
      ) => {
        const src = path.resolve(source);
        if (!existsSync(src)) {
          raiseError("E_FILE_UNREADABLE", { path: src });
          return;
        }

        const startSec = parseTimestampSec(opts.from);
        const endSec = parseTimestampSec(opts.to);
        if (!Number.isFinite(startSec)) {
          raiseError("E_INPUT_INVALID", { field: "--from", detail: `expected seconds / MM:SS / HH:MM:SS, got '${opts.from}'` });
          return;
        }
        if (!Number.isFinite(endSec)) {
          raiseError("E_INPUT_INVALID", { field: "--to", detail: `expected seconds / MM:SS / HH:MM:SS, got '${opts.to}'` });
          return;
        }
        if (!(endSec > startSec)) {
          raiseError("E_INPUT_INVALID", { field: "--to", detail: `--to (${endSec}s) must be greater than --from (${startSec}s)` });
          return;
        }

        // Resolve --out: explicit wins; otherwise the project's artifacts/videos/.
        let dst: string;
        if (opts.out) {
          dst = path.resolve(opts.out);
        } else if (opts.project) {
          if (!existsSync(projectDir(opts.project))) {
            raiseError("E_NOT_FOUND", { kind: "Project", id: opts.project });
            return;
          }
          const base = path.basename(src, path.extname(src));
          const tag = (n: number) => String(n).replace(/\./g, "p");
          dst = path.join(artifactKindDir(opts.project, "videos"), `${base}-clip-${tag(startSec)}-${tag(endSec)}.mp4`);
        } else {
          raiseError("E_INPUT_INVALID", { field: "--out", detail: "either --out <path> or --project <id> is required" });
          return;
        }

        try {
          await clipRecipe({
            src,
            startSec,
            endSec,
            dst,
            vertical: !!opts.vertical,
            forceOverwrite: !!opts.forceOverwrite,
            projectId: opts.project,
            note: opts.note ?? "clip",
          });
          ok(`Clip → ${dst}`);
          out({
            src,
            dst,
            startSec,
            endSec,
            durationSec: Number((endSec - startSec).toFixed(3)),
            vertical: !!opts.vertical,
            project: opts.project ?? null,
          });
        } catch (e: any) {
          raiseError("E_INTERNAL", { detail: `clip: ${e?.message ?? e}` });
        }
      },
    );

  return cmd;
}
