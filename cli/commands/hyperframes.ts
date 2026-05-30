// `ralphy hyperframes <verb>` — namespace for HyperFrames inner-loop verbs
// (issue #028). Wraps `bunx hyperframes` (and the in-repo lint from issue
// #047) so every iteration writes a `kind: "hyperframes.<verb>"` row to
// `generations.jsonl` instead of bypassing accounting via raw `bunx`.
//
// Sub-verbs:
//   lint           in-repo lint from cli/lib/render/hyperframes-lint.ts
//   validate       passthrough to `bunx hyperframes validate`
//   snapshot       passthrough to `bunx hyperframes snapshot`, with auto
//                  `--at` selection from STORYBOARD beats / scenario.json
//   render         delegates to `ralphy render` underneath; adds the
//                  `--require-snapshot-review` staleness gate (issue #016)
//   save-version   copies index.html → compositions/v<N>.html (issue #004)
//   extract-frames frame-extract via ffmpeg for QA (defers to ralphy video
//                  when that verb lands per issue #012)
//   watch          passthrough to `bunx hyperframes watch` (live preview)
//
// All verbs log to `generations.jsonl`.

import { Command } from "commander";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { projectsDir } from "../lib/paths.js";
import { logGeneration } from "../lib/gen-log.js";
import { out, ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import {
  lintHyperframesProject,
  formatHyperframesLintReport,
} from "../lib/render/hyperframes-lint.js";
import { saveCompositionVersion } from "../lib/render/save-version.js";
import { resolveSnapshotTimestamps } from "../lib/render/storyboard-beats.js";

// ──────────────────────────────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────────────────────────────

async function projectDirOrThrow(projectId: string): Promise<string> {
  const dir = path.join(projectsDir(), projectId);
  try {
    const st = await fs.stat(dir);
    if (!st.isDirectory()) {
      raiseError("E_NOT_FOUND", { kind: "Project", id: projectId });
    }
  } catch {
    raiseError("E_NOT_FOUND", { kind: "Project", id: projectId });
  }
  return dir;
}

type SpawnResult = { exitCode: number; stdout: string; stderr: string };

async function runBunx(args: readonly string[]): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const proc = spawn("bunx", [...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c) => {
      const s = c.toString();
      stdout += s;
      process.stdout.write(s);
    });
    proc.stderr.on("data", (c) => {
      const s = c.toString();
      stderr += s;
      process.stderr.write(s);
    });
    proc.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
    proc.on("error", (err) => resolve({ exitCode: 127, stdout, stderr: stderr + String(err) }));
  });
}

/** Stream a long-running passthrough (e.g. `hyperframes watch`) to the parent's
 *  stdio. Resolves on close; the caller can decide whether to log a row. */
async function streamBunx(args: readonly string[]): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const proc = spawn("bunx", [...args], { stdio: "inherit" });
    proc.on("close", (code) => resolve({ exitCode: code ?? 1, stdout: "", stderr: "" }));
    proc.on("error", () => resolve({ exitCode: 127, stdout: "", stderr: "" }));
  });
}

async function newestMtime(dir: string): Promise<number | null> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    let max = 0;
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      try {
        if (ent.isDirectory()) {
          const sub = await newestMtime(p);
          if (sub !== null && sub > max) max = sub;
        } else if (ent.isFile()) {
          const st = await fs.stat(p);
          if (st.mtimeMs > max) max = st.mtimeMs;
        }
      } catch {
        /* skip */
      }
    }
    return max === 0 ? null : max;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// command tree
// ──────────────────────────────────────────────────────────────────────────

export function hyperframesCmd() {
  const cmd = new Command("hyperframes")
    .alias("hf")
    .description(
      "HyperFrames inner-loop verbs (lint / validate / snapshot / render / save-version / extract-frames / watch). " +
        "Wraps `bunx hyperframes` so iterations log to generations.jsonl. Issue #028.",
    );

  cmd.addHelpText(
    "after",
    `
Examples:
  ralphy hyperframes lint spring-001
  ralphy hyperframes validate spring-001
  ralphy hyperframes snapshot spring-001                # auto --at from STORYBOARD
  ralphy hyperframes snapshot spring-001 --at 0.5 1.8 3.2
  ralphy hyperframes save-version spring-001            # → compositions/v1.html
  ralphy hyperframes render spring-001 --require-snapshot-review
  ralphy hyperframes extract-frames spring-001 --in render/final.mp4 --at 1.0 5.0
  ralphy hyperframes watch spring-001
`,
  );

  // ── lint ───────────────────────────────────────────────────────────────
  cmd
    .command("lint")
    .argument("<project>", "Project ID")
    .option("--composition <path>", "Composition file relative to projectDir (default: index.html)")
    .description(
      "Run the in-repo HyperFrames lint (issue #047). Exit 1 on errors, 0 on warnings only.",
    )
    .action(async (projectId: string, opts: { composition?: string }) => {
      const t0 = Date.now();
      const projectDir = await projectDirOrThrow(projectId);
      let result;
      try {
        result = await lintHyperframesProject(projectDir, opts.composition);
      } catch (err) {
        await logGeneration(projectId, {
          provider: "other",
          model: "hyperframes-lint",
          endpoint: "hyperframes-lint",
          kind: "other",
          input: { project: projectId, composition: opts.composition ?? "index.html" },
          status: "error",
          error: (err as Error).message ?? String(err),
          latency_ms: Date.now() - t0,
          cost_usd: 0,
          note: "hyperframes.lint",
        });
        raiseError("E_FILE_UNREADABLE", {
          path: path.join(projectDir, opts.composition ?? "index.html"),
        });
      }
      const report = formatHyperframesLintReport(result);
      if (report) process.stderr.write(`${report}\n`);
      await logGeneration(projectId, {
        provider: "other",
        model: "hyperframes-lint",
        endpoint: "hyperframes-lint",
        kind: "other",
        input: { project: projectId, composition: opts.composition ?? "index.html" },
        output: { local: path.join(projectDir, opts.composition ?? "index.html") },
        status: result.ok ? "ok" : "error",
        error: result.ok ? undefined : `${result.errors.length} lint error(s)`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        note: `hyperframes.lint errors=${result.errors.length} warnings=${result.warnings.length}`,
      });
      out({
        project: projectId,
        ok: result.ok,
        errors: result.errors.length,
        warnings: result.warnings.length,
        details: { errors: result.errors, warnings: result.warnings },
      });
      if (!result.ok) {
        process.exit(1);
      }
    });

  // ── validate ───────────────────────────────────────────────────────────
  cmd
    .command("validate")
    .argument("<project>", "Project ID")
    .description("Run `bunx hyperframes validate` against the project and log the result.")
    .action(async (projectId: string) => {
      const t0 = Date.now();
      const projectDir = await projectDirOrThrow(projectId);
      const r = await runBunx(["hyperframes", "validate", projectDir]);
      await logGeneration(projectId, {
        provider: "other",
        model: "hyperframes-validate",
        endpoint: "hyperframes-validate",
        kind: "other",
        input: { project: projectId, projectDir },
        status: r.exitCode === 0 ? "ok" : "error",
        error: r.exitCode === 0 ? undefined : r.stderr.slice(-500),
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        note: "hyperframes.validate",
      });
      if (r.exitCode !== 0) {
        raiseError("E_INTERNAL", {
          detail: `hyperframes validate failed (exit ${r.exitCode}); see stderr above`,
        });
      }
      ok(`Validated ${projectId}`);
      out({ project: projectId, exitCode: r.exitCode });
    });

  // ── snapshot ───────────────────────────────────────────────────────────
  cmd
    .command("snapshot")
    .argument("<project>", "Project ID")
    .option(
      "--at <ts...>",
      "Timestamps (seconds) to snapshot. Omit to auto-pick from STORYBOARD.md / scenario.json beat midpoints.",
      (v, prev: number[]) => {
        const n = Number(v);
        if (!Number.isFinite(n)) {
          raiseError("E_INTERNAL", { detail: `--at expects numeric seconds, got '${v}'` });
        }
        return [...prev, n];
      },
      [] as number[],
    )
    .option("--composition <path>", "Composition file relative to projectDir (default: index.html)")
    .option("--out-dir <path>", "Output directory for snapshots (default: <project>/compositions/snapshots/)")
    .description(
      "Capture key-frame PNGs via `bunx hyperframes snapshot`. When --at is omitted, " +
        "auto-picks one timestamp per scene from STORYBOARD.md / scenario.json.",
    )
    .action(
      async (
        projectId: string,
        opts: { at: number[]; composition?: string; outDir?: string },
      ) => {
        const t0 = Date.now();
        const projectDir = await projectDirOrThrow(projectId);

        let timestamps = opts.at;
        let source: "user" | "scenario.json" | "STORYBOARD.md" | "fallback" = "user";
        if (timestamps.length === 0) {
          const resolved = await resolveSnapshotTimestamps(projectDir);
          if (resolved.midpoints.length > 0) {
            timestamps = resolved.midpoints;
            source = resolved.source ?? "fallback";
          } else {
            timestamps = [0];
            source = "fallback";
          }
        }

        const outDir = opts.outDir
          ? path.resolve(opts.outDir)
          : path.join(projectDir, "compositions", "snapshots");
        await fs.mkdir(outDir, { recursive: true });

        const args = ["hyperframes", "snapshot", projectDir, "--out", outDir];
        for (const ts of timestamps) args.push("--at", String(ts));
        if (opts.composition) args.push("--composition", opts.composition);

        const r = await runBunx(args);
        await logGeneration(projectId, {
          provider: "other",
          model: "hyperframes-snapshot",
          endpoint: "hyperframes-snapshot",
          kind: "image",
          input: {
            project: projectId,
            projectDir,
            composition: opts.composition ?? "index.html",
            at: timestamps,
            source,
          },
          output: { local: outDir },
          status: r.exitCode === 0 ? "ok" : "error",
          error: r.exitCode === 0 ? undefined : r.stderr.slice(-500),
          latency_ms: Date.now() - t0,
          cost_usd: 0,
          note: `hyperframes.snapshot count=${timestamps.length} source=${source}`,
        });
        if (r.exitCode !== 0) {
          raiseError("E_INTERNAL", {
            detail: `hyperframes snapshot failed (exit ${r.exitCode}); see stderr above`,
          });
        }
        ok(`Snapshot wrote ${timestamps.length} frame(s) → ${outDir}`);
        out({ project: projectId, outDir, at: timestamps, source });
      },
    );

  // ── render ─────────────────────────────────────────────────────────────
  cmd
    .command("render")
    .argument("<project>", "Project ID")
    .option(
      "--require-snapshot-review",
      "Refuse if compositions/snapshots/ is older than index.html (issue #016).",
    )
    .option("--composition <path>", "Composition file relative to projectDir (default: index.html)")
    .option("--output <path>", "Output mp4 path")
    .option("--loudnorm", "Apply EBU R128 loudnorm (-16 LUFS) post-render")
    .option("--fps <fps>", "Frame rate")
    .option("--quality <q>", "Quality preset (draft|standard|high|web|print|archive)")
    .option("--grade <preset>", "Color-grade preset")
    .option("--format <format>", "Output format (mp4|webm|mov|png-sequence)")
    .option("--resolution <preset>", "Resolution preset")
    .description(
      "Render a project to MP4. Thin namespace wrapper over `ralphy render` that adds " +
        "the --require-snapshot-review staleness gate and a hyperframes.render gen-log row.",
    )
    .action(async (projectId: string, opts: Record<string, unknown>) => {
      const t0 = Date.now();
      const projectDir = await projectDirOrThrow(projectId);

      // Optional staleness gate: refuse if any snapshot is older than index.html.
      if (opts.requireSnapshotReview) {
        const indexHtml = path.join(projectDir, "index.html");
        const snapshotsDir = path.join(projectDir, "compositions", "snapshots");
        const indexMtime = await fs
          .stat(indexHtml)
          .then((s) => s.mtimeMs)
          .catch(() => null);
        const snapshotsMtime = await newestMtime(snapshotsDir);
        const stale =
          indexMtime !== null && (snapshotsMtime === null || snapshotsMtime < indexMtime);
        if (stale) {
          await logGeneration(projectId, {
            provider: "other",
            model: "hyperframes-render",
            endpoint: "hyperframes-render",
            kind: "video",
            input: {
              project: projectId,
              projectDir,
              requireSnapshotReview: true,
              indexMtime,
              snapshotsMtime,
            },
            status: "error",
            error: "snapshots stale relative to index.html",
            latency_ms: Date.now() - t0,
            cost_usd: 0,
            note: "hyperframes.render refused: snapshot review required",
          });
          raiseError("E_INTERNAL", {
            detail:
              `--require-snapshot-review: compositions/snapshots/ is missing or older than index.html. ` +
              `Run \`ralphy hyperframes snapshot ${projectId}\` and review the PNGs before rendering.`,
          });
        }
      }

      // Build argv for `ralphy render` and shell out.
      const cliEntry = path.resolve(import.meta.dir, "..", "index.ts");
      const argv: string[] = ["run", cliEntry, "render", projectId];
      if (typeof opts.composition === "string") argv.push("--composition", opts.composition);
      if (typeof opts.output === "string") argv.push("--output", opts.output);
      if (opts.loudnorm) argv.push("--loudnorm");
      if (typeof opts.fps === "string") argv.push("--fps", opts.fps);
      if (typeof opts.quality === "string") argv.push("--quality", opts.quality);
      if (typeof opts.grade === "string") argv.push("--grade", opts.grade);
      if (typeof opts.format === "string") argv.push("--format", opts.format);
      if (typeof opts.resolution === "string") argv.push("--resolution", opts.resolution);

      const result = await new Promise<{ exitCode: number }>((resolve) => {
        const proc = spawn("bun", argv, { stdio: "inherit" });
        proc.on("close", (code) => resolve({ exitCode: code ?? 1 }));
        proc.on("error", () => resolve({ exitCode: 127 }));
      });

      await logGeneration(projectId, {
        provider: "other",
        model: "hyperframes-render",
        endpoint: "hyperframes-render",
        kind: "video",
        input: {
          project: projectId,
          projectDir,
          composition: opts.composition ?? null,
          requireSnapshotReview: Boolean(opts.requireSnapshotReview),
        },
        status: result.exitCode === 0 ? "ok" : "error",
        error: result.exitCode === 0 ? undefined : `exit ${result.exitCode}`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        note: "hyperframes.render (wrapped ralphy render)",
      });
      if (result.exitCode !== 0) {
        raiseError("E_INTERNAL", {
          detail: `ralphy render failed (exit ${result.exitCode})`,
        });
      }
    });

  // ── save-version ───────────────────────────────────────────────────────
  cmd
    .command("save-version")
    .argument("<project>", "Project ID")
    .description(
      "Copy current index.html → compositions/v<N>.html (numeric increment, never overwrites). " +
        "Closes invariant #14 gap for HTML (issue #004).",
    )
    .action(async (projectId: string) => {
      const t0 = Date.now();
      const projectDir = await projectDirOrThrow(projectId);
      let result;
      try {
        result = await saveCompositionVersion(projectDir);
      } catch (err) {
        const msg = (err as Error).message ?? String(err);
        await logGeneration(projectId, {
          provider: "other",
          model: "hyperframes-save-version",
          endpoint: "hyperframes-save-version",
          kind: "other",
          input: { project: projectId, projectDir },
          status: "error",
          error: msg,
          latency_ms: Date.now() - t0,
          cost_usd: 0,
          note: "hyperframes.save-version",
        });
        raiseError("E_FILE_UNREADABLE", { path: path.join(projectDir, "index.html") });
      }
      await logGeneration(projectId, {
        provider: "other",
        model: "hyperframes-save-version",
        endpoint: "hyperframes-save-version",
        kind: "other",
        input: { project: projectId, projectDir, source: result.source },
        output: { local: result.dest },
        status: "ok",
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        note: `hyperframes.save-version → ${result.slot}`,
      });
      ok(`Saved → ${result.dest}`);
      out({ project: projectId, slot: result.slot, source: result.source, dest: result.dest });
    });

  // ── extract-frames ─────────────────────────────────────────────────────
  cmd
    .command("extract-frames")
    .argument("<project>", "Project ID (frames are written under <project>/compositions/frames/)")
    .requiredOption("--in <path>", "Input video (absolute, or relative to projectDir)")
    .option(
      "--at <ts...>",
      "Timestamps (seconds) to extract. Required — pass one or more.",
      (v, prev: number[]) => {
        const n = Number(v);
        if (!Number.isFinite(n)) {
          raiseError("E_INTERNAL", { detail: `--at expects numeric seconds, got '${v}'` });
        }
        return [...prev, n];
      },
      [] as number[],
    )
    .option("--out-dir <path>", "Output directory (default: <project>/compositions/frames/)")
    .description(
      "Extract still frames from a rendered/source video for QA via ffmpeg. " +
        "Standalone helper — issue #012 may later route through a broader `ralphy video frame` verb.",
    )
    .action(
      async (
        projectId: string,
        opts: { in: string; at: number[]; outDir?: string },
      ) => {
        const t0 = Date.now();
        const projectDir = await projectDirOrThrow(projectId);
        if (opts.at.length === 0) {
          raiseError("E_INTERNAL", {
            detail: "extract-frames: pass at least one --at <seconds> value.",
          });
        }
        const src = path.isAbsolute(opts.in) ? opts.in : path.resolve(projectDir, opts.in);
        try {
          await fs.stat(src);
        } catch {
          raiseError("E_FILE_UNREADABLE", { path: src });
        }
        const outDir = opts.outDir
          ? path.resolve(opts.outDir)
          : path.join(projectDir, "compositions", "frames");
        await fs.mkdir(outDir, { recursive: true });

        const written: string[] = [];
        for (const ts of opts.at) {
          const dst = path.join(outDir, `frame-${formatTs(ts)}.png`);
          const r = await runFfmpegFrame(src, ts, dst);
          if (r.exitCode !== 0) {
            await logGeneration(projectId, {
              provider: "ffmpeg",
              model: "ffmpeg-frame",
              endpoint: "ffmpeg-frame",
              kind: "image",
              input: { project: projectId, src, at: ts },
              status: "error",
              error: r.stderr.slice(-500),
              latency_ms: Date.now() - t0,
              cost_usd: 0,
              note: "hyperframes.extract-frames",
            });
            raiseError("E_INTERNAL", {
              detail: `ffmpeg frame extract @${ts}s failed: ${r.stderr.slice(-200)}`,
            });
          }
          written.push(dst);
        }

        await logGeneration(projectId, {
          provider: "ffmpeg",
          model: "ffmpeg-frame",
          endpoint: "ffmpeg-frame",
          kind: "image",
          input: { project: projectId, src, at: opts.at },
          output: { local: outDir },
          status: "ok",
          latency_ms: Date.now() - t0,
          cost_usd: 0,
          note: `hyperframes.extract-frames count=${written.length}`,
        });
        ok(`Extracted ${written.length} frame(s) → ${outDir}`);
        out({ project: projectId, src, at: opts.at, outDir, written });
      },
    );

  // ── watch ──────────────────────────────────────────────────────────────
  cmd
    .command("watch")
    .argument("<project>", "Project ID")
    .description(
      "Live-preview the composition via `bunx hyperframes watch`. Runs foreground; Ctrl-C to stop.",
    )
    .action(async (projectId: string) => {
      const t0 = Date.now();
      const projectDir = await projectDirOrThrow(projectId);
      await logGeneration(projectId, {
        provider: "other",
        model: "hyperframes-watch",
        endpoint: "hyperframes-watch",
        kind: "other",
        input: { project: projectId, projectDir },
        status: "ok",
        latency_ms: 0,
        cost_usd: 0,
        note: "hyperframes.watch started",
      });
      const r = await streamBunx(["hyperframes", "watch", projectDir]);
      await logGeneration(projectId, {
        provider: "other",
        model: "hyperframes-watch",
        endpoint: "hyperframes-watch",
        kind: "other",
        input: { project: projectId, projectDir },
        status: r.exitCode === 0 ? "ok" : "error",
        error: r.exitCode === 0 ? undefined : `exit ${r.exitCode}`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        note: "hyperframes.watch exited",
      });
    });

  return cmd;
}

function formatTs(ts: number): string {
  // Stable filename slug: 1.5 → "1_50", 12 → "12_00".
  const fixed = ts.toFixed(2).replace(".", "_");
  return fixed;
}

async function runFfmpegFrame(
  src: string,
  ts: number,
  dst: string,
): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolve) => {
    // -ss before -i for fast seek; -frames:v 1 grabs one frame.
    const proc = spawn(
      "ffmpeg",
      ["-y", "-ss", String(ts), "-i", src, "-frames:v", "1", "-q:v", "2", dst],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    proc.stderr.on("data", (c) => (stderr += c.toString()));
    proc.on("close", (code) => resolve({ exitCode: code ?? 1, stderr }));
    proc.on("error", (err) => resolve({ exitCode: 127, stderr: stderr + String(err) }));
  });
}
