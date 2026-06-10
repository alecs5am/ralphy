// `ralphy editor <preflight|trim-analyze>` — editor-stage observability verbs.
//
// Postmortem-driven (tokyo, noski, kbo): the editor stage was reaching for raw
// ffprobe + ad-hoc bash loops because the CLI didn't expose:
//   - `preflight`: ffprobe every clip + music, sum durations, music-gap, scene
//                  completeness against scenario.json, surface aspect / fps /
//                  codec / audio-track mismatches before render
//   - `trim-analyze`: per-clip gemini-vision dead-time / hot-moment analysis,
//                     run in parallel (#007 gemini-3.1-pro-preview cap = 2-4),
//                     aggregated into artifacts/analysis/summary.json with mtime
//                     idempotency (#034)
//
// These verbs make the agent's editor-stage workflow CLI-native and keep
// AGENTS.md invariant #2 honest (no raw ffmpeg loops outside cli/). Helpers
// live in cli/lib/editor/ so the prompt + shapes + completeness + music-gap
// math are unit-testable without spawning ffprobe / LLMs.

import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { artifactKindDir, resolveArtifactKindDirs, resolveArtifactPath, projectDir } from "../lib/paths.js";
import { out, err, ok, isPretty } from "../lib/output.js";
import { c, icons, section, kv } from "../lib/ui.js";
import { probeFile, ensureFfprobe } from "../lib/ffprobe.js";
import type { ProbeResult } from "../lib/ffprobe.js";
import {
  buildPreflightRow,
  computeMusicGap,
  checkCompleteness,
  type PreflightClipRow,
  type ScenarioLike,
} from "../lib/editor/preflight.js";
import {
  buildTrimAnalysisPrompt,
  loadOrSeedSummary,
  needsAnalysis,
  normalizeTrimAnalysisJson,
  slotFromClipPath,
  upsertRow,
  type TrimAnalysisRow,
} from "../lib/editor/trim.js";

const VIDEO_EXTS = [".mp4", ".mov", ".webm", ".mkv", ".m4v"];
const AUDIO_EXTS = [".mp3", ".wav", ".m4a", ".ogg", ".flac"];

async function listDirByExts(dirs: string | string[], exts: string[]): Promise<string[]> {
  const dirList = Array.isArray(dirs) ? dirs : [dirs];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const dir of dirList) {
    try {
      const items = await fs.readdir(dir);
      for (const f of items) {
        if (!exts.includes(path.extname(f).toLowerCase())) continue;
        // First dir (artifacts/) wins on basename collision mid-migration.
        if (seen.has(f)) continue;
        seen.add(f);
        out.push(path.join(dir, f));
      }
    } catch {
      /* missing dir -> contributes nothing */
    }
  }
  return out.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

async function readScenario(projectDir: string): Promise<ScenarioLike | null> {
  try {
    const raw = await fs.readFile(path.join(projectDir, "scenario.json"), "utf8");
    return JSON.parse(raw) as ScenarioLike;
  } catch {
    return null;
  }
}

export function editorCmd(): Command {
  const cmd = new Command("editor").description(
    "Editor-stage observability — preflight clip checks, trim-analysis, composition QA.",
  );

  // ── preflight ───────────────────────────────────────────────────────────
  cmd
    .command("preflight <projectId>")
    .description(
      "ffprobe every clip + music in workspace/projects/<id>/artifacts/, surface durations / fps / codec / audio / aspect, run a music-gap check, and verify every scenario scene has a corresponding clip on disk. Exit 1 on red. Run BEFORE `ralphy render`.",
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
      "Acceptable |delta| (seconds) between total clip duration and longest music track. Default 2.0.",
      (v) => Number(v),
      2.0,
    )
    .action(
      async (
        projectId: string,
        opts: { expectedAspect?: string; expectedFps?: number; musicToleranceSec: number },
      ) => {
        const dir = projectDir(projectId);
        try {
          await fs.access(dir);
        } catch {
          err(`Project not found: ${projectId}`);
        }
        try {
          ensureFfprobe();
        } catch (e) {
          err((e as Error).message);
        }

        // #105 legacy fallback (removed by #106): scan artifacts/ + legacy assets/.
        const videosDirs = resolveArtifactKindDirs(projectId, "videos");
        const musicDirs = resolveArtifactKindDirs(projectId, "music");

        const videoFiles = await listDirByExts(videosDirs, VIDEO_EXTS);
        const musicFiles = await listDirByExts(musicDirs, AUDIO_EXTS);

        const clipProbes: ProbeResult[] = await Promise.all(videoFiles.map(probeFile));
        const musicProbes: ProbeResult[] = await Promise.all(musicFiles.map(probeFile));

        const clipRows: PreflightClipRow[] = clipProbes.map((p) =>
          buildPreflightRow(slotFromClipPath(p.path), p),
        );
        const musicRows: PreflightClipRow[] = musicProbes.map((p) =>
          buildPreflightRow(slotFromClipPath(p.path), p),
        );

        // Aspect inference: mode of clip aspects.
        const aspectCounts: Record<string, number> = {};
        for (const r of clipRows) if (r.aspect) aspectCounts[r.aspect] = (aspectCounts[r.aspect] || 0) + 1;
        const inferredAspect = Object.entries(aspectCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
        const expectedAspect = opts.expectedAspect || inferredAspect;

        const fpsValues = clipRows.map((r) => r.fps).filter((v): v is number => typeof v === "number");
        const has24 = fpsValues.some((f) => Math.abs(f - 24) < 0.5);
        const expectedFps = opts.expectedFps ?? (has24 ? 24 : 30);

        const clipDurations = clipRows.map((r) => r.durationSec ?? 0);
        const musicDurations = musicRows.map((r) => r.durationSec ?? 0);
        const totalClipSec = clipDurations.reduce((s, x) => s + x, 0);
        const totalMusicSec = musicDurations.reduce((s, x) => s + x, 0);
        const musicGap = computeMusicGap(
          clipDurations.filter((d) => d > 0),
          musicDurations.filter((d) => d > 0),
          opts.musicToleranceSec,
        );

        const scenario = await readScenario(dir);
        const completeness = checkCompleteness(scenario, clipRows.map((r) => r.slot));

        const issues: string[] = [];
        let red = 0;
        for (const r of clipRows) {
          if (!r.exists) {
            issues.push(`MISSING: ${r.path}`);
            red += 1;
            continue;
          }
          if (r.error) {
            issues.push(`PROBE-FAIL ${r.path}: ${r.error}`);
            red += 1;
            continue;
          }
          if (expectedAspect && r.aspect && r.aspect !== expectedAspect) {
            issues.push(`ASPECT-DRIFT ${r.path}: expected ${expectedAspect}, got ${r.aspect}`);
            red += 1;
          }
          if (expectedFps && typeof r.fps === "number" && Math.abs(r.fps - expectedFps) > 0.5) {
            issues.push(`FPS-DRIFT ${r.path}: expected ${expectedFps}, got ${r.fps}`);
            red += 1;
          }
          if (r.hasAudio === false) {
            // Silent clip is informational, not a hard fail — kling-mute is a
            // common path. We still surface it.
            issues.push(`NO-AUDIO ${r.path}`);
          }
        }
        if (musicGap?.exceedsTolerance) {
          issues.push(
            `MUSIC-GAP: total clips ${musicGap.totalClipSec}s vs music ${musicGap.musicSec}s (delta ${musicGap.deltaSec}s > tolerance ${musicGap.toleranceSec}s)`,
          );
          red += 1;
        }
        for (const missing of completeness.missingScenes) {
          issues.push(`SCENE-MISSING: scenario scene "${missing}" has no clip in artifacts/videos/`);
          red += 1;
        }

        const payload = {
          project: projectId,
          verdict: red === 0 ? "ok" : "fail",
          expectedAspect,
          expectedFps,
          totals: {
            clips: clipRows.length,
            clipDurationSec: Math.round(totalClipSec * 1000) / 1000,
            musicTracks: musicRows.length,
            musicDurationSec: Math.round(totalMusicSec * 1000) / 1000,
          },
          aspectDistribution: aspectCounts,
          musicGap,
          completeness,
          clips: clipRows,
          music: musicRows,
          issues,
        };

        if (!isPretty()) {
          out(payload);
          if (red > 0) process.exitCode = 1;
          return;
        }

        // Pretty preflight report
        console.log();
        const verdictIcon = red === 0 ? icons.ok : icons.fail;
        const verdictColor = red === 0 ? c.ok : c.err;
        console.log(
          `${verdictIcon} ${c.bold(`editor preflight ${projectId}`)}  ${verdictColor(red === 0 ? "OK" : `FAIL (${red} issue${red === 1 ? "" : "s"})`)}`,
        );
        section("Expectations", [
          `${c.label("Aspect:")} ${c.value(expectedAspect ?? "—")}`,
          `${c.label("FPS:   ")} ${c.value(String(expectedFps))}`,
        ]);
        section("Totals");
        kv(
          {
            Clips: `${payload.totals.clips}  ${c.muted(`(${payload.totals.clipDurationSec}s total)`)}`,
            "Music tracks": `${payload.totals.musicTracks}  ${c.muted(`(${payload.totals.musicDurationSec}s total)`)}`,
            "Scenes (scenario)": `${completeness.totalScenes}  ${c.muted(`(${completeness.missingScenes.length} missing)`)}`,
          },
          { maxKeyWidth: 18 },
        );
        if (musicGap) {
          section("Music gap");
          kv(
            {
              "Clip total": `${musicGap.totalClipSec}s`,
              "Music length": `${musicGap.musicSec}s`,
              Delta: `${musicGap.deltaSec}s  ${c.muted(`(tolerance ${musicGap.toleranceSec}s)`)}`,
            },
            { maxKeyWidth: 14 },
          );
        }
        if (Object.keys(aspectCounts).length > 1) {
          section("Aspect distribution");
          kv(aspectCounts as Record<string, number>, { maxKeyWidth: 8 });
        }
        if (issues.length > 0) {
          section(`Issues  ${c.err(`(${issues.length})`)}`);
          for (const issue of issues) {
            const icon =
              issue.startsWith("MISSING") || issue.startsWith("PROBE-FAIL") || issue.startsWith("SCENE-MISSING")
                ? icons.fail
                : icons.warn;
            const color =
              issue.startsWith("MISSING") || issue.startsWith("PROBE-FAIL") || issue.startsWith("SCENE-MISSING")
                ? c.err
                : c.warn;
            console.log(`  ${icon} ${color(issue)}`);
          }
        }
        console.log();
        if (red > 0) process.exitCode = 1;
      },
    );

  // ── trim-analyze ─────────────────────────────────────────────────────────
  // Wraps the existing per-clip gemini-vision analysis (cli/lib/research.ts:
  // analyzeVideo) for editor-stage use. Aggregates results to
  // `<project>/artifacts/analysis/summary.json`. Idempotent via per-clip mtime:
  // a clip whose mtime is <= the summary row's clipMtimeMs is skipped.
  cmd
    .command("trim-analyze <projectId>")
    .description(
      "Run gemini-3.1-pro-preview vision over every clip in artifacts/videos/, write per-clip JSON to artifacts/analysis/<clip>.json, and aggregate to artifacts/analysis/summary.json. Idempotent: clips with mtime <= prior summary row are skipped. Parallelism is capped (default 3) to respect the gemini-3.1-pro-preview concurrency floor.",
    )
    .option(
      "--model <id>",
      "Vision model id. Default google/gemini-3.1-pro-preview.",
      "google/gemini-3.1-pro-preview",
    )
    .option(
      "--concurrency <n>",
      "Parallel clip analyses. Default 3 (gemini-3.1-pro-preview practical cap is 2-4 — see issue #007).",
      (v) => Number(v),
      3,
    )
    .option("--force", "Re-analyze every clip, ignoring the mtime idempotency cache.")
    .option("--dry-run", "Print the analysis plan (which clips would run, which are cached) without calling the LLM.")
    .action(
      async (
        projectId: string,
        opts: { model: string; concurrency: number; force?: boolean; dryRun?: boolean },
      ) => {
        const dir = projectDir(projectId);
        try {
          await fs.access(dir);
        } catch {
          err(`Project not found: ${projectId}`);
        }
        // Writes go to artifacts/analysis/; the prior summary is read from the
        // legacy assets/analysis/ location when only that exists, so the
        // idempotency cache survives migration.
        const videosDirs = resolveArtifactKindDirs(projectId, "videos"); // #105 legacy fallback (removed by #106)
        const analysisDir = artifactKindDir(projectId, "analysis");
        const summaryPath = path.join(analysisDir, "summary.json");
        const priorSummaryPath = resolveArtifactPath(projectId, "analysis", "summary.json"); // #105 legacy fallback (removed by #106)

        const videoFiles = await listDirByExts(videosDirs, VIDEO_EXTS);
        if (videoFiles.length === 0) {
          ok("No clips to analyze.");
          out({ project: projectId, clipCount: 0, summaryPath, plan: [], results: [] });
          return;
        }

        await fs.mkdir(analysisDir, { recursive: true });

        // mtimes
        const clipMtimes = new Map<string, number>();
        for (const clip of videoFiles) {
          try {
            const st = await fs.stat(clip);
            clipMtimes.set(clip, st.mtimeMs);
          } catch {
            clipMtimes.set(clip, 0);
          }
        }

        // Existing summary (falls back to the legacy assets/analysis/ copy
        // for the idempotency cache; new summary writes go to artifacts/).
        const summary = await loadOrSeedSummary(priorSummaryPath, projectId, opts.model);
        const priorBySlot = new Map<string, TrimAnalysisRow>();
        for (const r of summary.clips) priorBySlot.set(r.slot, r);

        // Build the plan
        const plan = videoFiles.map((clip) => {
          const slot = slotFromClipPath(clip);
          const mtimeMs = clipMtimes.get(clip) ?? 0;
          const prior = priorBySlot.get(slot);
          const stale = opts.force ? true : needsAnalysis(mtimeMs, prior);
          return {
            slot,
            clip,
            clipMtimeMs: mtimeMs,
            cached: !stale,
            priorClipMtimeMs: prior?.clipMtimeMs,
          };
        });

        if (opts.dryRun) {
          const toRun = plan.filter((p) => !p.cached);
          out({
            project: projectId,
            dryRun: true,
            model: opts.model,
            concurrency: Math.max(1, Math.min(opts.concurrency, toRun.length || 1)),
            clipCount: videoFiles.length,
            toRun: toRun.length,
            cached: plan.length - toRun.length,
            summaryPath,
            plan,
          });
          return;
        }

        const promptText = buildTrimAnalysisPrompt();

        // Re-use cli/lib/research.ts analyzeVideo() — it routes through callLLM()
        // so the gen-log captures the spend (#032 wired the canonical schema row).
        const { analyzeVideo } = await import("../lib/research.js");

        // Concurrency-limited batch over only the stale clips.
        const queue = plan.filter((p) => !p.cached);
        const results: Array<{ slot: string; clip: string; ok: boolean; out?: string; error?: string }> = [];
        let workingSummary = summary;
        // The summary row written by analyzeVideo is the raw model JSON; we
        // also normalize into a TrimAnalysisRow for the aggregate summary.json.
        const N = Math.max(1, Math.min(opts.concurrency, queue.length || 1));

        const worker = async () => {
          while (queue.length > 0) {
            const job = queue.shift();
            if (!job) break;
            const base = slotFromClipPath(job.clip);
            const outPath = path.join(analysisDir, `${base}.json`);
            try {
              const analysis = await analyzeVideo({
                videoPath: job.clip,
                prompt: promptText,
                model: opts.model,
                outPath,
              });
              const row = normalizeTrimAnalysisJson(analysis.json, {
                slot: base,
                clipPath: job.clip,
                clipMtimeMs: job.clipMtimeMs,
                analysisPath: outPath,
                model: opts.model,
              });
              workingSummary = upsertRow(workingSummary, row);
              results.push({ slot: base, clip: job.clip, ok: true, out: outPath });
            } catch (e) {
              results.push({ slot: base, clip: job.clip, ok: false, error: (e as Error).message });
            }
          }
        };
        const workers: Promise<void>[] = [];
        for (let i = 0; i < N; i++) workers.push(worker());
        await Promise.all(workers);

        // Persist the aggregated summary.
        await fs.writeFile(summaryPath, JSON.stringify(workingSummary, null, 2) + "\n");

        const okCount = results.filter((r) => r.ok).length;
        out({
          project: projectId,
          clipCount: videoFiles.length,
          toRun: results.length,
          cached: plan.length - results.length,
          succeeded: okCount,
          failed: results.length - okCount,
          summaryPath,
          analysisDir,
          results,
        });
        if (okCount < results.length) process.exitCode = 1;
      },
    );

  return cmd;
}
