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

async function readCompositionProps(
  projectId: string,
  fallbackCompositionId?: string,
): Promise<{
  path: string;
  data: CompositionProps;
  /** True if we materialized a transient resolved props file to inject captions/etc. */
  isTransient: boolean;
  /** True if we had to auto-stub the file because it didn't exist. */
  autoStubbed: boolean;
}> {
  const propsPath = path.join(projectsDir(), projectId, "composition-props.json");
  let autoStubbed = false;
  if (!existsSync(propsPath)) {
    // Three postmortems (tokyo, glitter-cream, analog-horror) flagged this as a
    // hard-required-but-undocumented file that every new editor session burned
    // one render attempt on. If the caller passed --composition <id> we have
    // enough to author a minimal stub here and proceed; the user can edit it
    // later to add per-composition inputProps.
    if (fallbackCompositionId) {
      await fs.mkdir(path.dirname(propsPath), { recursive: true });
      await fs.writeFile(
        propsPath,
        JSON.stringify({ compositionId: fallbackCompositionId }, null, 2) + "\n",
      );
      autoStubbed = true;
      // eslint-disable-next-line no-console
      console.error(
        `ralphy: composition-props.json auto-stubbed → ${propsPath} (compositionId="${fallbackCompositionId}"). Edit to add inputProps if needed.`,
      );
    } else {
      err(
        `composition-props.json not found at ${propsPath} — pass --composition <id> to auto-stub, ` +
          `or author the composition first (handoff to editor playbook or run "ralph project show ${projectId}").`,
      );
    }
  }
  const raw = await fs.readFile(propsPath, "utf8");
  let data: CompositionProps;
  try {
    data = JSON.parse(raw) as CompositionProps;
  } catch (e) {
    err(`composition-props.json is not valid JSON: ${(e as Error).message}`);
    throw new Error("unreachable");
  }

  // Generic-template compositions take `captions: Caption[]` inline. Avoid making
  // every project hand-paste the captions JSON: if data.captions is empty/missing
  // AND there's a captions.json next to composition-props, inline it.
  let isTransient = false;
  if (!Array.isArray((data as any).captions) || (data as any).captions.length === 0) {
    const captionsJson = path.join(projectsDir(), projectId, "captions.json");
    if (existsSync(captionsJson)) {
      try {
        const captions = JSON.parse(await fs.readFile(captionsJson, "utf8"));
        if (Array.isArray(captions) && captions.length > 0) {
          (data as any).captions = captions;
          isTransient = true;
        }
      } catch { /* leave captions empty if the json is malformed */ }
    }
  }

  // Write to a transient file so Remotion's --props reads the resolved data
  // without us mutating the user's source file on disk.
  if (isTransient) {
    const resolvedPath = path.join(projectsDir(), projectId, ".composition-props.resolved.json");
    await fs.writeFile(resolvedPath, JSON.stringify(data) + "\n");
    return { path: resolvedPath, data, isTransient: true, autoStubbed };
  }
  return { path: propsPath, data, isTransient: false, autoStubbed };
}

async function ensureSymlink(projectId: string): Promise<{ link: string; created: boolean }> {
  const projectAssets = path.join(projectsDir(), projectId, "assets");
  const link = path.join(root(), "public", `project-${projectId}`);
  await fs.mkdir(path.dirname(link), { recursive: true });
  if (existsSync(link)) {
    return { link, created: false };
  }
  if (!existsSync(projectAssets)) {
    err(`No assets dir at ${projectAssets} — generate assets first via art-director playbook.`);
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
      const { path: propsPath, data: props, isTransient } = await readCompositionProps(
        projectId,
        opts.composition,
      );
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
        if (isTransient) {
          await fs.unlink(propsPath).catch(() => undefined);
        }
      }
    });
}
