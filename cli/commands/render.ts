// `ralphy render <project>` — direct render pipeline.
//
// Replaces the "open Studio + click play" loop with a single CLI call. Reads
// scenario.json + composition-props.json, ensures the public/ symlink is in
// place, calls `bunx remotion render`, optionally post-processes with EBU R128
// loudnorm, then logs the event to generations.jsonl.
//
// AGENTS.md hard rule #5 — no auto-launched Studio. Iterations happen via
// regenerate-slot + re-render, not Studio scrubbing.

import { Command } from "commander";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { projectsDir, root } from "../lib/paths.js";
import { logGeneration } from "../lib/gen-log.js";
import { out, err, ok } from "../lib/output.js";

type CompositionProps = {
  compositionId?: string;
  [k: string]: unknown;
};

async function readCompositionProps(projectId: string): Promise<{
  path: string;
  data: CompositionProps;
}> {
  const propsPath = path.join(projectsDir(), projectId, "composition-props.json");
  if (!existsSync(propsPath)) {
    err(
      `composition-props.json not found at ${propsPath} — author the composition first ` +
        `(handoff to /ralph-editor or run "ralph project show ${projectId}").`,
    );
  }
  const raw = await fs.readFile(propsPath, "utf8");
  let data: CompositionProps;
  try {
    data = JSON.parse(raw) as CompositionProps;
  } catch (e) {
    err(`composition-props.json is not valid JSON: ${(e as Error).message}`);
    throw new Error("unreachable");
  }
  return { path: propsPath, data };
}

async function ensureSymlink(projectId: string): Promise<{ link: string; created: boolean }> {
  const projectAssets = path.join(projectsDir(), projectId, "assets");
  const link = path.join(root(), "public", `project-${projectId}`);
  await fs.mkdir(path.dirname(link), { recursive: true });
  if (existsSync(link)) {
    return { link, created: false };
  }
  if (!existsSync(projectAssets)) {
    err(`No assets dir at ${projectAssets} — generate assets first via /ralph-art-director.`);
  }
  await fs.symlink(projectAssets, link, "dir");
  return { link, created: true };
}

async function runRemotionRender(args: {
  compositionId: string;
  propsPath: string;
  outputPath: string;
  cwd: string;
}): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(
      "bunx",
      [
        "remotion",
        "render",
        args.compositionId,
        "--props",
        args.propsPath,
        "--output",
        args.outputPath,
      ],
      { cwd: args.cwd, stdio: ["ignore", "inherit", "pipe"] },
    );
    let stderr = "";
    proc.stderr.on("data", (c) => {
      const chunk = c.toString();
      stderr += chunk;
      process.stderr.write(chunk);
    });
    proc.on("close", (code) => resolve({ exitCode: code ?? 1, stderr }));
  });
}

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
  return new Command("render")
    .argument("<project>", "Project ID")
    .description(
      "Render a project to MP4. Reads composition-props.json + manifest, runs `bunx remotion render`, " +
        "writes workspace/projects/<id>/render/final.mp4. Adds EBU R128 loudnorm with --loudnorm.",
    )
    .option("--composition <id>", "Composition id (default: from props or 'UGCVideo')")
    .option("--output <path>", "Output mp4 path (default: workspace/projects/<id>/render/final.mp4)")
    .option("--loudnorm", "Apply EBU R128 loudnorm (-16 LUFS) post-render via ffmpeg")
    .option("--keep-symlink", "Don't remove the public/project-<id> symlink after render")
    .action(async (projectId: string, opts) => {
      const t0 = Date.now();
      const { path: propsPath, data: props } = await readCompositionProps(projectId);
      const compositionId = opts.composition ?? props.compositionId ?? "UGCVideo";
      const renderDir = path.join(projectsDir(), projectId, "render");
      await fs.mkdir(renderDir, { recursive: true });
      const renderRaw = path.join(renderDir, "final.raw.mp4");
      const renderFinal = opts.output
        ? path.resolve(opts.output)
        : path.join(renderDir, "final.mp4");

      const { link, created } = await ensureSymlink(projectId);

      try {
        ok(`Rendering ${compositionId} → ${renderFinal}`);
        const renderOut = opts.loudnorm ? renderRaw : renderFinal;
        const rr = await runRemotionRender({
          compositionId,
          propsPath,
          outputPath: renderOut,
          cwd: root(),
        });
        if (rr.exitCode !== 0) {
          await logGeneration(projectId, {
            provider: "other",
            endpoint: "remotion-render",
            kind: "video",
            input: { compositionId, propsPath },
            status: "error",
            error: rr.stderr.slice(-500),
            latency_ms: Date.now() - t0,
            cost_usd: 0,
            note: "render failed",
          });
          err(`remotion render failed (exit ${rr.exitCode}); see stderr above.`);
        }

        let outputPath = renderOut;
        if (opts.loudnorm) {
          ok(`Loudnorm → ${renderFinal}`);
          const lr = await runLoudnorm(renderRaw, renderFinal);
          if (lr.exitCode !== 0) {
            err(`ffmpeg loudnorm failed: ${lr.stderr.slice(-300)}`);
          }
          await fs.unlink(renderRaw).catch(() => undefined);
          outputPath = renderFinal;
        }

        const size = await fileSize(outputPath);
        await logGeneration(projectId, {
          provider: "other",
          endpoint: "remotion-render",
          kind: "video",
          input: { compositionId, propsPath, loudnorm: Boolean(opts.loudnorm) },
          output: { local: outputPath, bytes: size },
          status: "ok",
          latency_ms: Date.now() - t0,
          cost_usd: 0,
          note: opts.loudnorm ? "render + loudnorm" : "render",
        });

        out({
          project: projectId,
          composition: compositionId,
          path: outputPath,
          bytes: size,
          loudnorm: Boolean(opts.loudnorm),
          latencyMs: Date.now() - t0,
        });
      } finally {
        if (created && !opts.keepSymlink) {
          await fs.unlink(link).catch(() => undefined);
        }
      }
    });
}
