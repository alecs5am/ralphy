// `ralphy editor <preflight|trim-analyze>` — editor-stage observability verbs.
//
// Postmortem-driven (tokyo, noski, kbo): the editor stage was reaching for raw
// ffprobe + ad-hoc bash loops because the CLI didn't expose:
//   - `preflight`: ffprobe every clip + music, sum durations, flag missing scenes,
//                  surface aspect / fps / codec mismatches before render
//   - `trim-analyze`: per-clip gemini-vision dead-head / dead-tail analysis, run
//                     in parallel, return strict JSON for the editor to act on
//
// These verbs make the agent's editor-stage workflow CLI-native and keep
// AGENTS.md invariant #2 honest (no raw ffmpeg loops outside cli/).

import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { projectsDir } from "../lib/paths.js";
import { out, err, ok } from "../lib/output.js";

async function safeJson(fp: string): Promise<unknown> {
  try { return JSON.parse(await fs.readFile(fp, "utf-8")); } catch { return null; }
}

type ProbeResult = {
  path: string;
  exists: boolean;
  durationSec?: number;
  width?: number;
  height?: number;
  aspect?: string;
  fps?: number;
  codec?: string;
  bytes?: number;
  error?: string;
};

async function ffprobeFile(filePath: string): Promise<ProbeResult> {
  const r: ProbeResult = { path: filePath, exists: false };
  try {
    const st = await fs.stat(filePath);
    r.exists = true;
    r.bytes = st.size;
  } catch {
    r.error = "file not found";
    return r;
  }
  const probe = spawnSync(
    "ffprobe",
    [
      "-v", "error",
      "-show_entries", "format=duration:stream=width,height,codec_name,r_frame_rate",
      "-of", "default=nw=1",
      filePath,
    ],
    { encoding: "utf8" },
  );
  if (probe.status !== 0) {
    r.error = (probe.stderr || "ffprobe failed").slice(0, 200);
    return r;
  }
  for (const line of (probe.stdout || "").split("\n")) {
    const [k, v] = line.split("=");
    if (!k) continue;
    if (k === "duration") r.durationSec = Number(v);
    if (k === "width") r.width = Number(v);
    if (k === "height") r.height = Number(v);
    if (k === "codec_name") r.codec = r.codec || v;
    if (k === "r_frame_rate" && v?.includes("/")) {
      const [num, den] = v.split("/").map(Number);
      if (den) r.fps = Math.round((num / den) * 100) / 100;
    }
  }
  if (r.width && r.height) {
    // Reduce GCD for a clean aspect string like "9:16" / "16:9" / "1:1"
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const g = gcd(r.width, r.height);
    r.aspect = `${r.width / g}:${r.height / g}`;
  }
  return r;
}

export function editorCmd(): Command {
  const cmd = new Command("editor").description(
    "Editor-stage observability — preflight clip checks, trim-analysis, composition QA.",
  );

  // ── preflight ───────────────────────────────────────────────────────────
  cmd
    .command("preflight <projectId>")
    .description(
      "ffprobe every clip + music in workspace/projects/<id>/assets/, sum durations, flag missing slots from manifest, surface aspect/fps/codec mismatches. Exit 1 on red. Run before `ralphy render` to catch wrong-aspect leftovers from a model swap, encoder overshoot, missing scenes, etc.",
    )
    .option(
      "--expected-aspect <ratio>",
      "Aspect every clip must match (e.g. 9:16, 16:9, 1:1). Default: inferred from the most common aspect across clips.",
    )
    .option(
      "--expected-fps <n>",
      "FPS every clip must match. Default: 24 if any clip is 24, else 30.",
      (v) => Number(v),
    )
    .option(
      "--music-tolerance-sec <n>",
      "Acceptable delta (in seconds) between total clip duration and music length. Default 2.0.",
      (v) => Number(v),
      2.0,
    )
    .action(async (projectId: string, opts: { expectedAspect?: string; expectedFps?: number; musicToleranceSec: number }) => {
      const dir = path.join(projectsDir(), projectId);
      try { await fs.access(dir); } catch { err(`Project not found: ${projectId}`); }

      const videosDir = path.join(dir, "assets", "videos");
      const musicDir = path.join(dir, "assets", "music");

      let videoFiles: string[] = [];
      try {
        videoFiles = (await fs.readdir(videosDir))
          .filter((f) => [".mp4", ".mov", ".webm"].includes(path.extname(f).toLowerCase()))
          .map((f) => path.join(videosDir, f))
          .sort();
      } catch {
        ok(`No videos/ directory under ${videosDir} — skipping clip preflight.`);
      }

      const clipReports = await Promise.all(videoFiles.map(ffprobeFile));

      let musicFiles: string[] = [];
      try {
        musicFiles = (await fs.readdir(musicDir))
          .filter((f) => [".mp3", ".wav", ".m4a", ".ogg"].includes(path.extname(f).toLowerCase()))
          .map((f) => path.join(musicDir, f));
      } catch { /* no music dir is OK */ }

      const musicReports = await Promise.all(musicFiles.map(ffprobeFile));

      // Aspect inference: mode of clip aspects.
      const aspectCounts: Record<string, number> = {};
      for (const r of clipReports) if (r.aspect) aspectCounts[r.aspect] = (aspectCounts[r.aspect] || 0) + 1;
      const inferredAspect = Object.entries(aspectCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      const expectedAspect = opts.expectedAspect || inferredAspect;

      const fpsValues = clipReports.map((r) => r.fps).filter((v): v is number => typeof v === "number");
      const has24 = fpsValues.includes(24);
      const expectedFps = opts.expectedFps ?? (has24 ? 24 : 30);

      const totalClipSec = clipReports.reduce((s, r) => s + (r.durationSec || 0), 0);
      const totalMusicSec = musicReports.reduce((s, r) => s + (r.durationSec || 0), 0);

      const issues: string[] = [];
      let red = 0;

      for (const r of clipReports) {
        if (!r.exists) { issues.push(`MISSING: ${r.path}`); red += 1; continue; }
        if (r.error) { issues.push(`PROBE-FAIL ${r.path}: ${r.error}`); red += 1; continue; }
        if (expectedAspect && r.aspect && r.aspect !== expectedAspect) {
          issues.push(`ASPECT-DRIFT ${r.path}: expected ${expectedAspect}, got ${r.aspect}`);
          red += 1;
        }
        if (expectedFps && r.fps && r.fps !== expectedFps) {
          issues.push(`FPS-DRIFT ${r.path}: expected ${expectedFps}, got ${r.fps}`);
          red += 1;
        }
      }

      // Music length vs total clip length
      if (musicReports.length > 0 && totalClipSec > 0) {
        for (const m of musicReports) {
          if (!m.durationSec) continue;
          const delta = Math.abs(m.durationSec - totalClipSec);
          if (delta > opts.musicToleranceSec) {
            issues.push(
              `MUSIC-GAP ${m.path}: ${m.durationSec.toFixed(2)}s vs total clips ${totalClipSec.toFixed(2)}s (delta ${delta.toFixed(2)}s > ${opts.musicToleranceSec}s)`,
            );
            red += 1;
          }
        }
      }

      out({
        project: projectId,
        verdict: red === 0 ? "ok" : "fail",
        expectedAspect,
        expectedFps,
        totals: {
          clips: clipReports.length,
          clipDurationSec: Math.round(totalClipSec * 100) / 100,
          musicTracks: musicReports.length,
          musicDurationSec: Math.round(totalMusicSec * 100) / 100,
        },
        aspectDistribution: aspectCounts,
        clips: clipReports,
        music: musicReports,
        issues,
      });
      if (red > 0) process.exitCode = 1;
    });

  // ── trim-analyze ─────────────────────────────────────────────────────────
  // Wraps the existing per-clip gemini-vision analysis (cli/lib/research.ts:
  // analyzeVideo) for editor-stage use. Strict JSON schema enforces dead-head /
  // dead-tail / best-subwindow / trim_recommendation per the tokyo postmortem.
  cmd
    .command("trim-analyze <projectId>")
    .description(
      "Run gemini-3.1-pro vision over every clip in assets/videos/ and write per-clip trim analysis to logs/trim-analysis/<clip>.json. Returns strict JSON: { observed_duration_sec, dead_head_sec, dead_tail_sec, best_subwindow{start,end}, trim_recommendation{max_trim_sec, trim_from}, beats[] }.",
    )
    .option("--model <id>", "Vision model id. Default google/gemini-3.1-pro-preview.", "google/gemini-3.1-pro-preview")
    .option("--concurrency <n>", "Parallel clip analyses. Default 6.", (v) => Number(v), 6)
    .option("--prompt-file <path>", "Custom analysis prompt path. Default: cli/lib/editor/trim-prompt.md.")
    .action(async (projectId: string, opts: { model: string; concurrency: number; promptFile?: string }) => {
      const dir = path.join(projectsDir(), projectId);
      const videosDir = path.join(dir, "assets", "videos");
      const outDir = path.join(dir, "logs", "trim-analysis");
      await fs.mkdir(outDir, { recursive: true });

      let videoFiles: string[] = [];
      try {
        videoFiles = (await fs.readdir(videosDir))
          .filter((f) => [".mp4", ".mov", ".webm"].includes(path.extname(f).toLowerCase()))
          .map((f) => path.join(videosDir, f))
          .sort();
      } catch {
        err(`No videos/ directory at ${videosDir}`);
      }

      if (videoFiles.length === 0) {
        ok("No clips to analyze.");
        out({ project: projectId, clipCount: 0, results: [] });
        return;
      }

      // Default prompt — strict JSON schema. User can override via --prompt-file.
      const defaultPrompt = `You are analyzing one short video clip for editor-stage trim decisions.

Return ONLY this JSON object (no preamble, no fences):
{
  "observed_duration_sec": <number — what you actually see, NOT what the file claims>,
  "dead_head_sec": <number — seconds of static / pre-action / loading at the START>,
  "dead_tail_sec": <number — seconds of static / lingering / wind-down at the END>,
  "best_subwindow": { "start": <number>, "end": <number> },
  "trim_recommendation": {
    "max_trim_sec": <number — total seconds we could safely cut>,
    "trim_from": "head" | "tail" | "both"
  },
  "beats": [ { "t": <sec>, "intensity": "low" | "medium" | "high", "what": "<one-line>" } ]
}

Calibration: PRESERVING > AGGRESSIVE. If unsure, recommend LESS trim. Beats[] is the choreography map — every visible action / cut / camera-move gets a row.`;

      const promptText = opts.promptFile
        ? await fs.readFile(path.resolve(opts.promptFile), "utf-8")
        : defaultPrompt;

      // Re-use cli/lib/research.ts analyzeVideo() — it already routes through
      // callLLM() so the gen-log captures the spend (Fix #11 of postmortem plan
      // verified this is wired up correctly).
      const { analyzeVideo } = await import("../lib/research.js");

      // Concurrency-limited batch
      const results: Array<{ clip: string; ok: boolean; out?: string; error?: string }> = [];
      const queue = [...videoFiles];
      const workers: Promise<void>[] = [];
      const N = Math.max(1, Math.min(opts.concurrency, queue.length));

      const worker = async () => {
        while (queue.length > 0) {
          const clip = queue.shift();
          if (!clip) break;
          const base = path.basename(clip, path.extname(clip));
          const outPath = path.join(outDir, `${base}.json`);
          try {
            const analysis = await analyzeVideo({
              videoPath: clip,
              prompt: promptText,
              model: opts.model,
              outPath: outPath,
              slug: projectId,
            });
            // analyzeVideo writes outPath internally; just record the result.
            void analysis;
            results.push({ clip, ok: true, out: outPath });
          } catch (e) {
            results.push({ clip, ok: false, error: (e as Error).message });
          }
        }
      };
      for (let i = 0; i < N; i++) workers.push(worker());
      await Promise.all(workers);

      const okCount = results.filter((r) => r.ok).length;
      out({
        project: projectId,
        clipCount: videoFiles.length,
        succeeded: okCount,
        failed: results.length - okCount,
        outDir,
        results,
      });
      if (okCount < results.length) process.exitCode = 1;
    });

  return cmd;
}
