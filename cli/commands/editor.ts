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
//   - `lint-safe-zones`: probe the composition in headless Chromium and flag
//                     text, captions, CTAs, faces and products that sit under
//                     TikTok / Reels / Shorts UI (#564)
//   - `poster`:       assemble a poster-collage explainer into index.html from
//                     a scenes file with the embedded engine (cli/lib/poster/,
//                     #598): validate assets, inline Lottie, copy the licensed
//                     fonts, snapshot the previous index.html, lint
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
import { raiseError } from "../lib/errors/index.js";
import { checkSafeZones, PLATFORM_SAFE_ZONES, SAFE_ZONE_PLATFORMS, type SafeZonePlatform } from "../lib/editor/safe-zones.js";
import { probeFile, ensureFfprobe } from "../lib/ffprobe.js";
import type { ProbeResult } from "../lib/ffprobe.js";
import { getCommandContext } from "../lib/context-state.js";
import { findCompatibilityProject } from "../lib/project-lookup.js";
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

// ── poster (#598) ───────────────────────────────────────────────────────────

const POSTER_VERB = "editor poster";

type PosterOpts = {
  scenes: string;
  audio: string;
  duration?: string;
  lang: string;
  title?: string;
  lint: boolean;
  dryRun?: boolean;
};

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * `ralphy editor poster` (#598). Validates the scenes file, the assets it uses
 * and the audio first; then (unless --dry-run) snapshots the previous
 * index.html, copies missing fonts, writes the new index.html and lints it.
 * The library half lives in cli/lib/poster/.
 */
async function editorPoster(project: string, opts: PosterOpts): Promise<void> {
  const { planPoster, applyPosterPlan, fileSnapshot, assetLocation, PosterAssetError, PosterScenesError } = await import("../lib/poster/project.js");
  const { formatSeconds } = await import("../lib/poster/assemble.js");
  const { planFileSnapshot } = await import("../lib/catalog/use.js");
  const { fontsDataDir } = await import("../lib/catalog/fonts.js");

  // ── the project ──────────────────────────────────────────────────────────
  const commandContext = getCommandContext();
  const found = await findCompatibilityProject(project);
  let dir = found?.dir ?? null;
  if (dir === null && commandContext === null) {
    const guess = projectDir(project);
    if (await pathExists(guess)) dir = guess;
  }
  if (dir === null) raiseError("E_NOT_FOUND", { kind: "Project", id: project });
  // A store Project without a tree yet: the scenes and assets live in the tree.
  if (!(await pathExists(dir))) raiseError("E_FILE_UNREADABLE", { path: dir });
  const slug = found?.slug ?? path.basename(dir);
  const compositionId = slug.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "main";

  // ── flags ────────────────────────────────────────────────────────────────
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(opts.lang)) {
    raiseError("E_INPUT_INVALID", { field: "lang", detail: `expected a BCP 47 language tag such as en or pt-BR, got '${opts.lang}'`, verb: POSTER_VERB });
  }
  const audioSrc = opts.audio.replace(/\\/g, "/");
  const audioAt = assetLocation(dir, audioSrc);
  if (audioAt.kind !== "local" || /["<>]/.test(audioSrc)) {
    raiseError("E_INPUT_INVALID", { field: "audio", detail: `expected a path inside the project (e.g. artifacts/voiceover/vo.mp3), got '${opts.audio}'`, verb: POSTER_VERB });
  }
  if (!(await pathExists(audioAt.abs))) raiseError("E_FILE_UNREADABLE", { path: audioAt.abs });
  let duration: number;
  let durationSource: "flag" | "audio";
  let audioDuration: number | null = null;
  if (opts.duration !== undefined) {
    const n = opts.duration.trim() === "" ? Number.NaN : Number(opts.duration);
    if (!Number.isFinite(n) || n <= 0) raiseError("E_INPUT_INVALID", { field: "duration", detail: `expected a positive number of seconds, got '${opts.duration}'`, verb: POSTER_VERB });
    duration = n;
    durationSource = "flag";
  } else {
    try {
      ensureFfprobe();
    } catch {
      raiseError("E_DEP_MISSING", { dep: "ffprobe (FFmpeg); or pass --duration <sec>" });
    }
    const probe = await probeFile(audioAt.abs);
    if (probe.duration_s === undefined || !(probe.duration_s > 0)) {
      raiseError("E_FILE_MALFORMED", { format: "audio", path: audioAt.abs, detail: probe.error ?? "ffprobe reported no duration; pass --duration <sec>" });
    }
    duration = probe.duration_s;
    audioDuration = probe.duration_s;
    durationSource = "audio";
  }

  // ── the scenes file ──────────────────────────────────────────────────────
  const candidates = path.isAbsolute(opts.scenes) ? [opts.scenes] : [path.resolve(process.cwd(), opts.scenes), path.join(dir, opts.scenes)];
  let scenesPath: string | null = null;
  for (const c of candidates) if (scenesPath === null && (await pathExists(c))) scenesPath = c;
  if (scenesPath === null) raiseError("E_FILE_UNREADABLE", { path: candidates[candidates.length - 1]! });
  let scenesSource: string;
  try {
    scenesSource = await fs.readFile(scenesPath, "utf-8");
  } catch {
    raiseError("E_FILE_UNREADABLE", { path: scenesPath });
  }

  // ── plan ─────────────────────────────────────────────────────────────────
  let plan: Awaited<ReturnType<typeof planPoster>>;
  try {
    plan = await planPoster({
      projectDir: dir,
      scenesFile: scenesPath,
      scenesSource,
      compositionId,
      duration,
      lang: opts.lang,
      title: opts.title ?? slug,
      audioSrc,
      fontsDataDir: fontsDataDir(),
    });
  } catch (e) {
    if (e instanceof PosterScenesError) raiseError("E_FILE_MALFORMED", { format: "poster scenes file", path: scenesPath, detail: e.detail });
    if (e instanceof PosterAssetError) raiseError("E_FILE_MALFORMED", { format: e.format, path: e.file, detail: e.detail });
    throw e;
  }
  const missing = plan.assets.missing;
  if (!opts.dryRun && missing.length > 0) {
    const unknown = missing.filter((m) => m.reason === "not in ASSETS");
    if (unknown.length > 0) {
      raiseError("E_FILE_MALFORMED", {
        format: "poster scenes file",
        path: scenesPath,
        detail: unknown.map((m) => `'${m.key}' (${m.uses[0]}) is not in ASSETS`).join("; "),
      });
    }
    const outside = missing.filter((m) => m.reason === "outside the project");
    if (outside.length > 0) {
      raiseError("E_INPUT_INVALID", {
        field: `ASSETS.${outside[0]!.key}`,
        detail: `${outside.map((m) => m.path).join(", ")} must be a path inside the project (pull or copy the file into artifacts/)`,
        verb: POSTER_VERB,
      });
    }
    raiseError("E_FILE_UNREADABLE", { path: missing.map((m) => path.join(dir, m.path!)).join(", ") });
  }

  // ── snapshot of the previous index.html ──────────────────────────────────
  // Store root: the #591 project-tree Composition records the tree as a
  // sealed, append-only revision (what `render` builds), exactly as
  // `catalog use` does (#594). Tree-only root: append-only compositions/v<N>.html.
  const storeSnapshot = async (dryRun: boolean): Promise<Record<string, unknown>> => {
    const { renderCompositionForProject } = await import("../lib/project-tree-composition.js");
    const context = commandContext!;
    const query = context.kind === "session"
      ? { sessionId: context.sessionId }
      : { workspaceId: context.workspaceId, ...(context.projectId ? { projectId: context.projectId } : {}) };
    const resolved = await renderCompositionForProject({
      context: query,
      workspaceId: context.workspaceId,
      projectId: context.projectId ?? found!.id,
      treeDir: dir,
      reference: project,
      verb: POSTER_VERB,
      dryRun,
      ...(context.kind === "session" ? { authoredBySessionId: context.sessionId } : {}),
    });
    if (resolved.projectTree === null) {
      raiseError("E_INPUT_INVALID", {
        field: "project",
        detail: `the video Composition of ${project} (revision ${resolved.revisionId}) was authored outside its Project tree, so render does not read ${path.join(dir, "index.html")}; edit that Composition instead`,
        verb: POSTER_VERB,
      });
    }
    return { kind: "composition-revision", compositionId: resolved.compositionId, revisionId: resolved.revisionId, revision: resolved.projectTree.revision };
  };

  let snapshot: Record<string, unknown> | null = null;
  let files: Array<{ path: string; action: string }>;
  let lint: Record<string, unknown> | null = null;
  const warnings = [...plan.warnings];
  if (opts.dryRun) {
    if (plan.previousIndex !== null) {
      snapshot = commandContext !== null
        ? await storeSnapshot(true)
        : { kind: "file", ...(await planFileSnapshot(dir, plan.previousIndex)) };
    }
    files = [
      ...(snapshot && typeof snapshot.path === "string" ? [{ path: snapshot.path, action: String(snapshot.action) }] : []),
      ...plan.fonts.filter((f) => f.action === "copy").map((f) => ({ path: f.file, action: "copy" })),
      { path: "index.html", action: plan.index.action },
    ];
  } else {
    const applied = await applyPosterPlan(dir, plan, commandContext !== null ? () => storeSnapshot(false) : fileSnapshot(dir));
    snapshot = applied.snapshot;
    files = applied.files;
    const { lintHyperframesHtml, runUpstreamHyperframesLint } = await import("../lib/render/hyperframes-lint.js");
    const inRepo = lintHyperframesHtml(plan.html);
    const upstream = opts.lint ? runUpstreamHyperframesLint(dir) : null;
    if (upstream && !upstream.ran) warnings.push(`upstream hyperframes lint did not run: ${upstream.error}`);
    const lintOk = inRepo.ok && (upstream === null || !upstream.ran || upstream.ok);
    lint = {
      ok: lintOk,
      inRepo: { ok: inRepo.ok, errors: inRepo.errors.map((e) => `${e.code}: ${e.message}`), warnings: inRepo.warnings.map((w) => `${w.code}: ${w.message}`) },
      upstream: upstream === null ? null : upstream.ran
        ? { ran: true, ok: upstream.ok, errorCount: upstream.errorCount, warningCount: upstream.warningCount, findings: upstream.findings }
        : { ran: false, error: upstream.error },
    };
    if (!lintOk) process.exitCode = 1;
    ok(`poster -> ${project} index.html: ${plan.scenes.count} scenes, ${plan.scenes.items} items, ${formatSeconds(duration)}s (${plan.lottie.inlined.length} Lottie inlined)`);
  }
  if (opts.dryRun && missing.length > 0) process.exitCode = 1;

  out({
    dryRun: Boolean(opts.dryRun),
    project,
    projectDir: dir,
    compositionId,
    title: opts.title ?? slug,
    lang: opts.lang,
    duration: Number(formatSeconds(duration)),
    durationSource,
    audio: { src: audioSrc, durationSec: audioDuration },
    scenes: plan.scenes,
    assets: plan.assets,
    lottie: plan.lottie,
    fonts: plan.fonts,
    index: plan.index,
    snapshot,
    files,
    lint,
    warnings,
  });
}

export function editorCmd(): Command {
  const cmd = new Command("editor").description(
    "Editor-stage observability — preflight clip checks, trim-analysis, composition QA — and the poster-collage builder.",
  );

  // ── preflight ───────────────────────────────────────────────────────────
  cmd
    .command("preflight <projectId>")
    .description(
      "ffprobe every clip + music in <project>/artifacts/, surface durations / fps / codec / audio / aspect, run a music-gap check, and verify every scenario scene has a corresponding clip on disk. Exit 1 on red. Run BEFORE `ralphy render`.",
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
        const videosDirs = resolveArtifactKindDirs(projectId, "videos");
        const analysisDir = artifactKindDir(projectId, "analysis");
        const summaryPath = path.join(analysisDir, "summary.json");
        const priorSummaryPath = resolveArtifactPath(projectId, "analysis", "summary.json");

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

        // Existing summary at artifacts/analysis/ (the idempotency cache).
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

  // ── lint-safe-zones (#564) ────────────────────────────────────────────────
  cmd
    .command("lint-safe-zones <project>")
    .description(
      "Flag text, captions, CTAs, faces and products inside TikTok / Reels / Shorts UI zones. Loads <project>/index.html in headless Chromium, seeks the timeline to sample times, and checks every visible text element plus anything tagged data-safe-zone. Exit 1 on errors. Local, zero provider calls.",
    )
    .option("--platform <platforms...>", `Platforms to check: ${SAFE_ZONE_PLATFORMS.join(" | ")} (default: all)`)
    .option("--composition <file>", "Composition file inside the project", "index.html")
    .option("--samples <n>", "Midpoint samples across the duration", (v) => parseInt(v, 10), 9)
    .option("--at <times>", "Comma-separated sample times in seconds (overrides --samples)")
    .option("--tolerance <px>", "Px an element may cross into a zone before it counts", (v) => Number(v), 4)
    .option("--strict", "Exit 1 on warnings too (edge margins, faces partly under the rail)")
    .addHelpText(
      "after",
      `
Examples:
  ralphy editor lint-safe-zones my-project
  ralphy editor lint-safe-zones my-project --platform tiktok reels --at 0.5,2,4.25
  ralphy editor lint-safe-zones .ralphy/catalog/build/layout-pip     # any directory with an index.html

Tag elements the probe cannot infer: data-safe-zone="face|product|cta|caption|text";
data-safe-zone="ignore" skips decorative or intentionally off-frame elements.`,
    )
    .action(
      async (
        project: string,
        opts: { platform?: string[]; composition: string; samples: number; at?: string; tolerance: number; strict?: boolean },
      ) => {
        for (const p of opts.platform ?? []) {
          if (!(SAFE_ZONE_PLATFORMS as readonly string[]).includes(p)) {
            raiseError("E_FLAG_UNKNOWN", { flag: "platform", value: p, allowed: SAFE_ZONE_PLATFORMS.join(", "), verb: "editor lint-safe-zones" });
          }
        }
        let dir: string | null = null;
        try {
          const st = await fs.stat(project);
          if (st.isDirectory()) dir = path.resolve(project);
        } catch {
          /* not a path: resolve as a project id */
        }
        if (!dir) dir = projectDir(project);
        const htmlPath = path.join(dir, opts.composition);
        try {
          await fs.access(htmlPath);
        } catch {
          raiseError("E_FILE_UNREADABLE", { path: htmlPath });
        }
        const times = opts.at
          ? opts.at
              .split(",")
              .map((v) => Number(v.trim()))
              .filter((v) => Number.isFinite(v) && v >= 0)
          : undefined;
        const platforms = (opts.platform ?? [...SAFE_ZONE_PLATFORMS]) as SafeZonePlatform[];
        const { probeComposition } = await import("../lib/editor/safe-zones-probe.js");
        const probe = await probeComposition(htmlPath, { times, samples: opts.samples });
        const findings = checkSafeZones(probe.samples, { platforms, tolerance: opts.tolerance });
        const errorCount = findings.filter((f) => f.severity === "error").length;
        const warningCount = findings.length - errorCount;
        const ok = errorCount === 0 && (!opts.strict || warningCount === 0);
        out({
          project,
          composition: htmlPath,
          ok,
          duration: probe.duration,
          samples: probe.samples.map((s) => s.t),
          platforms: platforms.map((p) => ({ platform: p, safe: PLATFORM_SAFE_ZONES[p].safe })),
          elementsChecked: probe.samples.reduce((n, s) => n + s.elements.length, 0),
          errorCount,
          warningCount,
          findings,
          warnings: probe.warnings,
        });
        if (!ok) process.exitCode = 1;
      },
    );

  // ── poster (#598) ─────────────────────────────────────────────────────────
  cmd
    .command("poster <project>")
    .description(
      "Assemble a poster-collage explainer (faceless 9:16 montage: condensed titles with letter reveals, kicker labels, handwritten notes, cut-outs, stickers, Lottie, micro-effects) into <project>/index.html from a scenes file, with the embedded engine. Validates every asset the scenes use, inlines the referenced Lottie JSON, copies the licensed Oswald / Caveat / Inter fonts when missing, snapshots the previous index.html first, then lints. Local, zero provider calls.",
    )
    .requiredOption("--scenes <file>", "Scenes file: JavaScript defining `const ASSETS` and `const SCENES` (absolute, or relative to the cwd or the project)")
    .requiredOption("--audio <src>", "Audio track, project-relative (e.g. artifacts/voiceover/vo.mp3); its length is the default duration")
    .option("--duration <sec>", "Composition length in seconds (default: the audio duration, via ffprobe)")
    .option("--lang <code>", "Page language (html lang attribute)", "en")
    .option("--title <text>", "Page title (default: the project slug)")
    .option("--no-lint", "Skip the upstream `hyperframes lint` (the in-repo lint still runs)")
    .option("--dry-run", "Print the plan (scenes, referenced and missing assets, inlined Lottie bytes, fonts, snapshot) and write nothing")
    .addHelpText(
      "after",
      `
Examples:
  ralphy editor poster my-explainer --scenes poster-scenes.js --audio artifacts/voiceover/vo.mp3 --dry-run
  ralphy editor poster my-explainer --scenes poster-scenes.js --audio artifacts/voiceover/vo.mp3 --title "Dogs vs cats"
  ralphy editor poster my-explainer --scenes poster-scenes.js --audio artifacts/refs/source.mp4 --duration 84.6 --lang pt-BR

Scene schema, item types, effect recipes and the QA loop:
  .agents/skills/editor/references/poster-collage.md`,
    )
    .action((project: string, opts: PosterOpts) => editorPoster(project, opts));

  return cmd;
}
