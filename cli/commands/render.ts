// `ralphy render <project>` — direct render pipeline.
//
// Engine: HyperFrames (HTML + GSAP, deterministic Puppeteer + FFmpeg).
// Project shape: workspace/projects/<id>/index.html.
//
// AGENTS.md hard rule #5 — no auto-launched Studio. Iterations happen via
// regenerate-slot + re-render, not Studio scrubbing.

import { Command } from "commander";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { projectsDir } from "../lib/paths.js";
import { logGeneration } from "../lib/gen-log.js";
import { out } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { CommandStream } from "../lib/stream/command.js";
import { runHyperframesRender, looksLikeHyperframesProject } from "../lib/render/hyperframes.js";

async function runLoudnorm(src: string, dst: string): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(
      "ffmpeg",
      [
        "-y",
        "-i",
        src,
        "-af",
        "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        dst,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    proc.stderr.on("data", (c) => (stderr += c.toString()));
    proc.on("close", (code) => resolve({ exitCode: code ?? 1, stderr }));
  });
}

async function fileSize(p: string): Promise<number> {
  try {
    return (await fs.stat(p)).size;
  } catch {
    return 0;
  }
}

export function renderCmd() {
  const cmd = new Command("render")
    .argument("<project>", "Project ID")
    .description(
      "Render a project to MP4. Engine: HyperFrames (HTML + GSAP). " +
        "Writes workspace/projects/<id>/render/final.mp4. Adds EBU R128 loudnorm with --loudnorm.",
    );
  cmd.addHelpText(
    "after",
    `
Examples:
  ralphy render spring-001
  ralphy render proj-001 --loudnorm
  ralphy render proj-001 --output ./out.mp4
  ralphy render proj-001 --fps 60 --quality high
`,
  );
  return cmd
    .option("--composition <id>", "Composition id (default: index.html)")
    .option("--output <path>", "Output mp4 path (default: workspace/projects/<id>/render/final.mp4)")
    .option("--loudnorm", "Apply EBU R128 loudnorm (-16 LUFS) post-render via ffmpeg")
    .option("--fps <fps>", "Frame rate (default 30)")
    .option(
      "--quality <quality>",
      "Quality preset: draft|standard|high (default standard)",
    )
    .option(
      "--format <format>",
      "Output format: mp4|webm|mov|png-sequence (default mp4)",
    )
    .option(
      "--resolution <preset>",
      "Resolution preset: portrait|landscape|square|1080p|4k|...",
    )
    .option("--dry-run", "Print the resolved render plan; no engine run", false)
    .option("--summary", "Collapse the dry-run plan to a per-stage rollup", false)
    .action(async (projectId: string, opts) => {
      const t0 = Date.now();
      const engine = "hyperframes" as const;
      const engineEndpoint = "hyperframes-render";

      if (opts.dryRun) {
        const renderDir = path.join(projectsDir(), projectId, "render");
        const renderFinal = opts.output ? path.resolve(opts.output) : path.join(renderDir, "final.mp4");
        const compositionId = opts.composition ?? "index.html";
        const stages = [
          { stage: engineEndpoint, engine, composition: compositionId, output: renderFinal, est_usd: 0 },
          ...(opts.loudnorm ? [{ stage: "ffmpeg-loudnorm", target: "-16 LUFS", est_usd: 0 }] : []),
        ];
        if (opts.summary) {
          out({
            dryRun: true,
            engine,
            stages: {
              [engineEndpoint]: { count: 1, est_usd: 0 },
              ...(opts.loudnorm ? { "ffmpeg-loudnorm": { count: 1, est_usd: 0 } } : {}),
            },
            cost_estimate_usd: 0,
          });
        } else {
          out({
            dryRun: true,
            engine,
            would_call: stages,
            cost_estimate_usd: 0,
            would_write: [renderFinal],
          });
        }
        return;
      }

      const cs = new CommandStream();
      const renderDir = path.join(projectsDir(), projectId, "render");
      await fs.mkdir(renderDir, { recursive: true });
      const renderRaw = path.join(renderDir, "final.raw.mp4");
      const renderFinal = opts.output
        ? path.resolve(opts.output)
        : path.join(renderDir, "final.mp4");
      const ui = await import("../lib/ui.js");

      const projectDir = path.join(projectsDir(), projectId);
      if (!looksLikeHyperframesProject(projectDir)) {
        raiseError("E_FILE_UNREADABLE", {
          path: path.join(projectDir, "index.html"),
        });
      }
      const compositionLabel = opts.composition ?? "index.html";
      cs.event("render-started", { project: projectId, engine, composition: compositionLabel });
      const renderOut = opts.loudnorm ? renderRaw : renderFinal;
      const rr = await ui.withSpinner(
        `Rendering ${compositionLabel} (hyperframes) → ${path.basename(renderOut)}`,
        () =>
          runHyperframesRender({
            projectDir,
            outputPath: renderOut,
            composition: opts.composition,
            fps: opts.fps !== undefined ? Number(opts.fps) : undefined,
            quality: opts.quality,
            format: opts.format,
            resolution: opts.resolution,
          }),
        {
          successText: () =>
            `Rendered ${ui.c.cmd(compositionLabel)} (hyperframes) → ${ui.c.path(renderOut)}`,
          failText: () => `HyperFrames render of ${ui.c.cmd(compositionLabel)} failed`,
        },
      );
      if (rr.exitCode !== 0) {
        await logGeneration(projectId, {
          provider: "other",
          endpoint: "hyperframes-render",
          kind: "video",
          input: { engine, projectDir, composition: opts.composition },
          status: "error",
          error: rr.stderr.slice(-500),
          latency_ms: Date.now() - t0,
          cost_usd: 0,
          note: "render failed",
        });
        raiseError("E_INTERNAL", {
          detail: `hyperframes render failed (exit ${rr.exitCode}); see stderr above`,
        });
      }

      let outputPath = renderOut;
      if (opts.loudnorm) {
        const lr = await ui.withSpinner(
          `Loudnorm → ${path.basename(renderFinal)}`,
          () => runLoudnorm(renderRaw, renderFinal),
          { successText: () => `Loudnorm applied (-16 LUFS) → ${ui.c.path(renderFinal)}` },
        );
        if (lr.exitCode !== 0) {
          raiseError("E_INTERNAL", { detail: `ffmpeg loudnorm failed: ${lr.stderr.slice(-300)}` });
        }
        await fs.unlink(renderRaw).catch(() => undefined);
        outputPath = renderFinal;
      }

      const size = await fileSize(outputPath);
      cs.event("render-finished", { project: projectId, engine, bytes: size });
      await logGeneration(projectId, {
        provider: "other",
        endpoint: "hyperframes-render",
        kind: "video",
        input: { engine, projectDir, composition: opts.composition, loudnorm: Boolean(opts.loudnorm) },
        output: { local: outputPath, bytes: size },
        status: "ok",
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        note: opts.loudnorm ? "render + loudnorm" : "render",
      });
      cs.summary({
        project: projectId,
        engine,
        composition: compositionLabel,
        path: outputPath,
        bytes: size,
        loudnorm: Boolean(opts.loudnorm),
        latencyMs: Date.now() - t0,
      });
    });
}
