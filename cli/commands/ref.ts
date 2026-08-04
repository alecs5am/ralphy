import { Command } from "commander";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { addEntity, getEntity, updateEntity, deleteEntity, listEntities } from "../lib/registry.js";
import { slugify, generateId } from "../lib/ids.js";
import { out, ok, err } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { scoreTikTok } from "../lib/score.js";
import { ralphDir, root, projectDir, referencesDir } from "../lib/paths.js";
import {
  pullReference,
  sampleFrames,
  transcribeRef,
  analyzeFrames,
  analyzeVideo,
  audioDescribeRef,
  synthesizeBlueprint,
  slugFromUrl,
  refPaths,
} from "../lib/research.js";
import type { TranscribeBackend, TranscribeLanguage } from "../lib/transcribe.js";
import { callLLM } from "../lib/providers/llm.js";
import { intakePath } from "../lib/path-resolution.js";
import { rasterizeSvg } from "../lib/image/cutout.js";
import { bulkFetch, readUrlList } from "../lib/bulk-fetch.js";
import { logGeneration } from "../lib/gen-log.js";
import { projectRefsDir } from "../lib/paths.js";
import { extractSite } from "../lib/playwright/site-extract.js";
import { addArtifactUsage, resolveLatestArtifactObject } from "../lib/store/artifacts.js";
import {
  completeArtifactRun,
  completeArtifactRunSet,
  finishRun,
  finishRunAttempt,
  projectRunFailure,
  startRun,
  startRunAttempt,
} from "../lib/store/runs.js";
import { generationRunScope } from "../lib/generation-scope.js";
import { produceArtifactRevision } from "../lib/artifact-production.js";

export function refCmd() {
  const cmd = new Command("ref").description("Manage references (websites, social media)");

  // ── add (alias: create) ────────────────────────────────────────────────
  const addAction = async (url: string, opts: any) => {
    let id = opts.name ? slugify(opts.name) : slugify(new URL(url).hostname.replace("www.", ""));
    const existing = await getEntity("refs", id);
    if (existing) id = `${id}-${generateId().slice(-4)}`;

    const data: Record<string, unknown> = {
      url,
      type: opts.type,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    if (opts.brand) data.brand = opts.brand;

    const ref = await addEntity("refs", id, data);
    ok(`Reference added: ${id}`);
    out(ref);
  };

  cmd
    .command("add <url>")
    .description("Add a reference URL to the registry")
    .requiredOption("--type <type>", "Reference type: design | social | media")
    .option("--brand <id>", "Attach to brand")
    .option("--name <name>", "Custom name/ID")
    .action(addAction);

  cmd
    .command("create <url>")
    .description("Alias of `ref add` — preferred form in playbooks")
    .requiredOption("--type <type>", "Reference type: design | social | media")
    .option("--brand <id>", "Attach to brand")
    .option("--name <name>", "Custom name/ID")
    .action(addAction);

  cmd
    .command("list")
    .description("List all references")
    .option("--type <type>", "Filter by type")
    .option("--brand <id>", "Filter by brand")
    .action(async (opts: any) => {
      let refs = await listEntities("refs");
      if (opts.type) refs = refs.filter((r: any) => r.type === opts.type);
      if (opts.brand) refs = refs.filter((r: any) => r.brand === opts.brand);
      out(
        refs.map((r: any) => ({
          id: r.id,
          url: r.url,
          type: r.type,
          status: r.status || "—",
          brand: r.brand || "—",
        }))
      );
    });

  cmd
    .command("show <id>")
    .description("Show reference details")
    .action(async (id: string) => {
      const ref = await getEntity("refs", id);
      if (!ref) raiseError("E_NOT_FOUND", { kind: "Reference", id });
      out(ref);
    });

  cmd
    .command("attach <refId>")
    .description("Attach reference to a project")
    .requiredOption("--to <projectId>", "Target project ID")
    .action(async (refId: string, opts: any) => {
      const ref = await getEntity("refs", refId);
      if (!ref) raiseError("E_NOT_FOUND", { kind: "Reference", id: refId });
      const project = await getEntity("projects", opts.to);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id: opts.to });

      const refs = project.refs || [];
      if (!refs.includes(refId)) refs.push(refId);
      await updateEntity("projects", opts.to, { refs });
      ok(`Reference ${refId} attached to project ${opts.to}`);
      out({ refId, projectId: opts.to });
    });

  // ── pull (yt-dlp wrapper, OR bulk image fetcher when --kind/--from-file is set) ─
  // Single-URL video pull (yt-dlp): `ralphy ref pull <url>`.
  // Bulk image pull (#048):         `ralphy ref pull <url...> --kind reference-image --project <id>`
  //                                 `ralphy ref pull --from-file urls.txt --kind reference-image --project <id>`
  cmd
    .command("pull [urls...]")
    .description(
      "Pull a video via yt-dlp (single URL, default), OR bulk-download images when --kind reference-image / --from-file is set (#048). Bulk mode dedupes by sha256 and writes into <project>/artifacts/refs/.",
    )
    .option("--slug <name>", "Custom slug (default: derived from URL or filename) — video mode only")
    .option("--local <path>", "Use a local mp4 file instead of yt-dlp. <url> becomes a label.")
    .option("--audio-only", "Skip the video stream — only fetch mp3 (URL mode only)")
    .option("--meta-only", "Skip download — only write meta.info.json (URL mode only)")
    .option("--no-audio-extract", "Skip auto-extraction of mono 64k mp3 from mp4")
    .option("--global", "Write to the global .ralphy/references/<slug>/ tree, bypassing the active workspace (#401)", false)
    .option("--register", "Also call `ref add --type social <url>`", false)
    // Bulk-image-pull flags (#048):
    .option("--kind <kind>", "Bulk mode: 'reference-image' triggers bulk-fetch into <project>/artifacts/refs/")
    .option("--project <id>", "Bulk mode: target project id (artifacts/refs/ lives under <project>/ = .ralphy/workspaces/<ws>/projects/<id>/)")
    .option("--workspace <id>", "Bulk mode: target Workspace ID or slug for a shared reference Artifact")
    .option("--from-file <path>", "Bulk mode: read URLs from a file (one per line, # comments OK)")
    .option("--concurrency <n>", "Bulk mode: parallel downloads (default 4)", (v) => parseInt(v, 10), 4)
    .option("--timeout <ms>", "Bulk mode: per-URL timeout in ms (default 30000)", (v) => parseInt(v, 10), 30_000)
    .action(async (urls: string[], opts: any) => {
      // Route: bulk-image mode when --kind reference-image OR --from-file is set.
      const isBulkImage =
        opts.kind === "reference-image" || typeof opts.fromFile === "string";
      if (isBulkImage) {
        await runBulkImagePull(urls, opts);
        return;
      }

      // Single-reference video pull.
      if (urls.length === 0) {
        raiseError("E_INPUT_INVALID", {
          field: "url",
          detail: "expected exactly one URL for video pull, or use --kind reference-image / --from-file for bulk image mode",
          verb: "ref pull",
        });
        return;
      }
      if (urls.length > 1) {
        raiseError("E_INPUT_INVALID", {
          field: "url",
          detail: `single-URL video pull received ${urls.length} URLs. Pass --kind reference-image for bulk mode.`,
          verb: "ref pull",
        });
        return;
      }
      const url = urls[0] as string;
      if (Boolean(opts.project) === Boolean(opts.workspace)) {
        raiseError("E_INPUT_INVALID", {
          field: "destination",
          detail: "video pull requires exactly one of --project <id> or --workspace <id>",
          verb: "ref pull",
        });
        return;
      }
      if (opts.global) {
        raiseError("E_INPUT_INVALID", {
          field: "global",
          detail: "domain-backed video pull does not write the legacy global references tree",
          verb: "ref pull",
        });
        return;
      }
      const destination = opts.project
        ? { kind: "project" as const, id: opts.project as string }
        : { kind: "workspace" as const, id: opts.workspace as string };
      const scope = generationRunScope(destination);
      const workspaceId = "workspaceId" in scope ? scope.workspaceId : undefined;
      const run = startRun({ ...scope, kind: "ref.pull", label: opts.slug ?? slugFromUrl(url) });
      const attempt = startRunAttempt({
        runId: run.id,
        provider: opts.local ? "local" : "yt-dlp",
        model: opts.local ? "local-reference" : "yt-dlp",
        request: { mode: opts.local ? "local" : "remote" },
      });
      try {
        const result = await pullReference({
          url,
          slug: opts.slug,
          localPath: opts.local,
          audioOnly: opts.audioOnly,
          metaOnly: opts.metaOnly,
          noAudioExtract: opts.audioExtract === false,
          outputDir: path.join(ralphDir(), "tmp", run.id, "pull"),
        });
        const summary = referenceSummary(result.meta);
        const outputs = [
          {
            finishedPath: result.metaPath,
            originalName: `${result.slug}-metadata.json`,
            mime: "application/json",
            artifact: { slug: `${result.slug}-metadata`, kind: "data" as const, state: "candidate" as const,
              metadata: summary },
            objectMetadata: { source: "reference", media: "metadata" },
          },
          ...(result.videoPath ? [{
            finishedPath: result.videoPath,
            originalName: `${result.slug}.mp4`,
            mime: "video/mp4",
            artifact: { slug: `${result.slug}-video`, kind: "video" as const, state: "candidate" as const,
              metadata: summary },
            objectMetadata: { source: "reference", media: "video" },
          }] : []),
          ...(result.audioPath ? [{
            finishedPath: result.audioPath,
            originalName: `${result.slug}.mp3`,
            mime: "audio/mpeg",
            artifact: { slug: `${result.slug}-audio`, kind: "audio" as const, state: "candidate" as const,
              metadata: summary },
            objectMetadata: { source: "reference", media: "audio" },
          }] : []),
        ];
        const completed = await completeArtifactRunSet({
          runId: run.id,
          attemptId: attempt.id,
          outputs,
          response: { outputCount: outputs.length },
          costUsd: 0,
        });
        for (const item of completed.outputs) {
          addArtifactUsage({
            artifactRevisionId: item.revision.id,
            ...(opts.project ? { projectId: opts.project as string } : { workspaceId: workspaceId! }),
            role: "reference",
          });
        }
        if (opts.register) {
          await addAction(url, { type: "social", name: result.slug });
        }
        ok(`Pulled ${result.slug} → ${completed.outputs.length} Artifact Revisions`);
        out({
          slug: result.slug,
          runId: completed.run.id,
          artifacts: completed.outputs.map((item) => ({
            kind: item.artifact.kind,
            artifactId: item.artifact.id,
            revisionId: item.revision.id,
          })),
          ...summary,
        });
      } catch (e: any) {
        const projected = projectRunFailure(e, { provider: opts.local ? "local" : "yt-dlp" });
        try {
          finishRunAttempt(attempt.id, { state: "failed", error: projected });
        } catch {
          // Completion may already have terminalized the Attempt.
        }
        try {
          finishRun(run.id, { state: "failed", error: projected });
        } catch {
          // Completion may already have terminalized the Run.
        }
        raiseError("E_PROVIDER_HTTP", { provider: "yt-dlp", status: 0, detail: projected.message });
      }
    });

  // ── bulk-image-pull worker (#048) ──────────────────────────────────────
  async function runBulkImagePull(positional: string[], opts: any): Promise<void> {
    const projectId: string | undefined = opts.project;
    const workspace: string | undefined = opts.workspace;
    if (Boolean(projectId) === Boolean(workspace)) {
      raiseError("E_INPUT_INVALID", {
        field: "destination",
        detail: "bulk image pull requires exactly one of --project <id> or --workspace <id>",
        verb: "ref pull",
      });
      return;
    }
    const scope = generationRunScope(projectId
      ? { kind: "project", id: projectId }
      : { kind: "workspace", id: workspace! });
    const workspaceId = "workspaceId" in scope ? scope.workspaceId : undefined;
    // Collect URLs: positional + --from-file (deduped, order-preserving).
    const fromFile: string[] = opts.fromFile
      ? await readUrlList(projectId
        ? intakePath(opts.fromFile, projectId, "from-file")
        : path.resolve(opts.fromFile))
      : [];
    const urls = dedupeOrdered([...positional, ...fromFile]);
    if (urls.length === 0) {
      raiseError("E_INPUT_INVALID", {
        field: "urls",
        detail: "no URLs supplied (positional or --from-file)",
        verb: "ref pull",
      });
      return;
    }
    const seen = new Set<string>();
    const results = [] as Awaited<ReturnType<typeof bulkFetch>>;
    const domainResults: Array<{ artifactId: string; revisionId: string; runId: string }> = [];
    for (const url of urls) {
      const run = startRun({ ...scope, kind: "ref.pull", label: url });
      const attempt = startRunAttempt({ runId: run.id, provider: "http", model: "http-bulk-fetch", request: { url } });
      let fetched: Awaited<ReturnType<typeof bulkFetch>>[number];
      try {
        fetched = (await bulkFetch({
          urls: [url],
          destDir: path.join(ralphDir(), "tmp", run.id),
          concurrency: 1,
          timeoutMs: opts.timeout ?? 30_000,
        }))[0]!;
      } catch (error) {
        const projected = projectRunFailure(error, { provider: "http" });
        finishRunAttempt(attempt.id, { state: "failed", error: projected });
        finishRun(run.id, { state: "failed", error: projected });
        throw projected;
      }
      if (fetched.status === "error" || !fetched.dest || !fetched.filename || !fetched.sha256) {
        const projected = projectRunFailure(fetched.error, { provider: "http" });
        finishRunAttempt(attempt.id, { state: "failed", error: projected });
        finishRun(run.id, { state: "failed", error: projected });
        results.push({ ...fetched, error: projected.message });
        continue;
      }
      if (seen.has(fetched.sha256)) {
        await fs.rm(fetched.dest, { force: true });
        finishRunAttempt(attempt.id, { state: "succeeded", response: { duplicate: true }, costUsd: 0 });
        finishRun(run.id, { state: "succeeded" });
        results.push({ ...fetched, status: "skipped-duplicate" });
        continue;
      }
      seen.add(fetched.sha256);
      const extension = path.extname(fetched.filename).toLowerCase();
      const slug = path.basename(fetched.filename, extension);
      const completed = await completeArtifactRun({
        runId: run.id,
        attemptId: attempt.id,
        finishedPath: fetched.dest,
        originalName: fetched.filename,
        mime: referenceImageMime(extension),
        artifact: { slug, kind: "image", state: "candidate", metadata: { sourceUrl: url } },
        objectMetadata: { sourceUrl: url },
        response: { bytes: fetched.bytes ?? null, sha256: fetched.sha256 },
        costUsd: 0,
      });
      addArtifactUsage({
        artifactRevisionId: completed.revision.id,
        ...(projectId ? { projectId } : { workspaceId: workspaceId! }),
        role: "reference",
      });
      results.push(fetched);
      domainResults.push({
        artifactId: completed.artifact.id,
        revisionId: completed.revision.id,
        runId: completed.run.id,
      });
      process.stderr.write(`  ↓ ${url} → Artifact Revision ${completed.revision.id}\n`);
    }
    const downloaded = results.filter((r) => r.status === "downloaded").length;
    const skipped = results.filter((r) => r.status.startsWith("skipped")).length;
    const errored = results.filter((r) => r.status === "error").length;
    ok(`Bulk pull: ${downloaded} downloaded · ${skipped} skipped · ${errored} errored`);
    out({
      ...(projectId ? { project: projectId } : { workspace: workspaceId! }),
      artifacts: domainResults,
      total: results.length,
      downloaded,
      skipped,
      errored,
      results: results.map((r) => ({
        url: r.url,
        status: r.status,
        filename: r.filename ?? null,
        bytes: r.bytes ?? null,
        sha256: r.sha256 ?? null,
        ...(r.error ? { error: r.error } : {}),
      })),
    });
  }

  function dedupeOrdered(xs: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const x of xs) {
      if (!seen.has(x)) {
        seen.add(x);
        out.push(x);
      }
    }
    return out;
  }

  // ── pull-site (Playwright brand-DNA fan-out crawl, #014) ───────────────
  // AGENTS.md invariant #15 enforced as a CLI verb. Captures CSS palette,
  // fonts, hero screenshot, and documented API surfaces — the four inputs
  // brand-DNA + code-on-screen creatives need before they can be drafted.
  cmd
    .command("pull-site <url>")
    .description(
      "Fan-out Playwright crawl of a brand site → screenshots + tokens.json + apis.md (AGENTS invariant #15). Run BEFORE drafting brand-DNA or any code-on-screen creative.",
    )
    .option("--project <id>", "Project ID — refs live under <project>/artifacts/refs/")
    .option("--slug <name>", "Custom slug (default: derived from URL host)")
    .option("--depth <n>", "Max additional pages beyond home (default 6)", (v) => parseInt(v, 10), 6)
    .option("--page-timeout <ms>", "Per-page timeout in ms (default 20000)", (v) => parseInt(v, 10), 20_000)
    .action(async (url: string, opts: any) => {
      const t0 = Date.now();
      const projectId: string | undefined = opts.project;
      // Compute outDir: per-project artifacts/refs/ when --project given, else a
      // workspace-level references/<slug>/ scratch dir.
      const outDir = projectId
        ? projectRefsDir(projectId)
        : path.join(referencesDir(), new URL(url).hostname.replace(/^www\./, ""));
      if (projectId) {
        const project = await getEntity("projects", projectId);
        if (!project) {
          raiseError("E_NOT_FOUND", { kind: "Project", id: projectId });
          return;
        }
      }
      try {
        const result = await extractSite({
          url,
          outDir,
          slug: opts.slug,
          depth: opts.depth,
          pageTimeoutMs: opts.pageTimeout,
        });
        // Log one row per crawled page so a postmortem can reconstruct the
        // fan-out, plus a parent row that summarises the run.
        if (projectId) {
          for (const page of result.pages) {
            await logGeneration(projectId, {
              provider: "playwright",
              model: "playwright/site-extract",
              endpoint: "ref-pull-site",
              kind: "other",
              input: {
                project: projectId,
                url: page.url,
                page_slug: page.slug,
                kind_hint: "reference-website",
              },
              output: {
                local: path.relative(projectDir(projectId), page.screenshotPath),
              },
              status: "ok",
              cost_usd: 0,
              latency_ms: Date.now() - t0,
              note: `pull-site: ${page.slug} (${page.apis.length} api surfaces)`,
            });
          }
        }
        ok(`Crawled ${result.pages.length} page${result.pages.length === 1 ? "" : "s"} → ${path.relative(root(), outDir)}`);
        const projRoot = projectId ? projectDir(projectId) : root();
        out({
          url,
          slug: result.slug,
          outDir: path.relative(root(), outDir),
          pages: result.pages.map((p) => ({
            slug: p.slug,
            url: p.url,
            title: p.title,
            screenshot: path.relative(projRoot, p.screenshotPath),
            body: path.relative(projRoot, p.bodyPath),
            apis: p.apis.length,
          })),
          tokens: path.relative(projRoot, result.tokensPath),
          apis: path.relative(projRoot, result.apisPath),
          hero: result.heroPath ? path.relative(projRoot, result.heroPath) : null,
        });
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        if (msg.includes("playwright install") || msg.includes("Chromium binary missing") || msg.includes("playwright module not installed")) {
          raiseError("E_DEP_MISSING", {
            dep: "playwright-chromium",
            detail: `${msg}. After installing, re-run \`ralphy doctor\` to verify.`,
          });
          return;
        }
        raiseError("E_PROVIDER_HTTP", { provider: "playwright", status: 0, detail: msg });
      }
    });

  // ── frames (ffmpeg sampler) ────────────────────────────────────────────
  cmd
    .command("frames <slug>")
    .description("Sample JPEG frame Artifacts from a pulled video reference Artifact")
    .option("--fps <n>", "Frames-per-second (default 1/6 ≈ one every 6s)", (v) => Number(v))
    .option("--max <n>", "Max frames", (v) => parseInt(v, 10), 24)
    .option("--width <px>", "Scale width (default 540)", (v) => parseInt(v, 10), 540)
    .option("--project <id>", "Project containing the pulled reference Artifact")
    .option("--workspace <id>", "Workspace containing a shared pulled reference Artifact")
    .action(async (slug: string, opts: any) => {
      let run: ReturnType<typeof startRun> | undefined;
      let attempt: ReturnType<typeof startRunAttempt> | undefined;
      try {
        const source = resolveReferenceArtifact(slug, "video", opts);
        run = startRun({ ...source.scope, kind: "ref.frames", label: slug });
        attempt = startRunAttempt({ runId: run.id, provider: "ffmpeg", model: "ffmpeg/frames" });
        const r = await sampleFrames({
          slug,
          sourcePath: source.objectPath,
          outputDir: path.join(ralphDir(), "tmp", run.id, "frames"),
          fps: opts.fps,
          max: opts.max,
          width: opts.width,
        });
        const completed = await completeArtifactRunSet({
          runId: run.id,
          attemptId: attempt.id,
          outputs: r.paths.map((framePath, index) => ({
            finishedPath: framePath,
            originalName: `${slug}-frame-${index + 1}.jpg`,
            mime: "image/jpeg",
            artifact: { slug: `${slug}-frame-${index + 1}`, kind: "image", state: "candidate" },
            objectMetadata: { provider: "ffmpeg", model: "ffmpeg/frames" },
          })),
          response: { frameCount: r.count },
          costUsd: 0,
        });
        for (const item of completed.outputs) addReferenceUsage(item.revision.id, opts, source.scope);
        ok(`Sampled ${r.count} frames from Artifact Revision ${source.revision.id}`);
        out({ slug: r.slug, count: r.count, sourceArtifactId: source.artifact.id,
          sourceRevisionId: source.revision.id, runId: completed.run.id,
          artifacts: completed.outputs.map((item) => ({ artifactId: item.artifact.id,
            revisionId: item.revision.id })) });
      } catch (e: any) {
        const projected = projectRunFailure(e);
        if (attempt) {
          try { finishRunAttempt(attempt.id, { state: "failed", error: projected }); } catch { /* already terminal */ }
        }
        if (run) {
          try { finishRun(run.id, { state: "failed", error: projected }); } catch { /* already terminal */ }
        }
        raiseError("E_INTERNAL", { detail: `frames: ${projected.message}` });
      }
    });

  // ── transcribe (research-context, no project ID) ───────────────────────
  cmd
    .command("transcribe <slug>")
    .description("Transcribe a pulled audio reference Artifact into a data Artifact")
    .option("--language <lang>", "ru | en | auto", "ru")
    .option("--backend <backend>", "elevenlabs | openrouter | gemini", "elevenlabs")
    .option("--project <id>", "Project containing the pulled reference Artifact")
    .option("--workspace <id>", "Workspace containing a shared pulled reference Artifact")
    .action(async (slug: string, opts: any) => {
      try {
        const source = resolveReferenceArtifact(slug, "audio", opts);
        let transcript: Awaited<ReturnType<typeof transcribeRef>> | undefined;
        const completed = await produceArtifactRevision({
          scope: source.scope,
          runKind: "ref.transcribe",
          requestedOutput: `${slug}-transcript.json`,
          artifactKind: "data",
          mime: "application/json",
          provider: opts.backend === "elevenlabs" ? "elevenlabs" : "openrouter",
          model: `transcribe/${opts.backend}`,
          produce: async (outputPath) => {
            transcript = await transcribeRef({
              slug,
              sourcePath: source.objectPath,
              outputPath,
              language: opts.language as TranscribeLanguage,
              backend: opts.backend as TranscribeBackend,
            });
            return {
              localPath: outputPath,
              provider: transcript.provider,
              model: transcript.model,
              latencyMs: transcript.latencyMs,
              costUsd: transcript.costUsd,
            };
          },
        });
        addReferenceUsage(completed.revision.id, opts, source.scope);
        const r = transcript!;
        ok(`Transcribed ${r.count} captions from Artifact Revision ${source.revision.id}`);
        out({
          slug: r.slug,
          artifactId: completed.artifact.id,
          revisionId: completed.revision.id,
          runId: completed.run.id,
          sourceArtifactId: source.artifact.id,
          sourceRevisionId: source.revision.id,
          captions: r.count,
          language: r.language,
          backend: r.backend,
          audioDurationSec: r.audioDurationSec,
          costUsd: r.costUsd,
        });
      } catch (e: any) {
        raiseError("E_PROVIDER_HTTP", { provider: "ElevenLabs/OpenRouter", status: 0,
          detail: projectRunFailure(e).message });
      }
    });

  // ── analyze (vision LLM over frames) ───────────────────────────────────
  cmd
    .command("analyze <slug>")
    .description("Run vision LLM over <slug>/frames/* → <slug>/analysis.json. Default prompt = UGC blueprint extractor.")
    .option("--prompt <text>", "Custom prompt (overrides default JSON-blueprint extractor)")
    .option("--prompt-file <path>", "Read custom prompt from a file")
    .option("--model <id>", "Vision model id (default google/gemini-2.5-flash)")
    .option("--global", "Resolve the slug in the global .ralphy/references/ tree only (#401)", false)
    .action(async (slug: string, opts: any) => {
      try {
        let prompt = opts.prompt as string | undefined;
        if (!prompt && opts.promptFile) {
          // #025: NBSP-safe path intake; no project context here (ref is global).
          prompt = await fs.readFile(intakePath(opts.promptFile, undefined, "prompt-file"), "utf8");
        }
        const r = await analyzeFrames({ slug, prompt, model: opts.model, global: opts.global === true });
        ok(`Analyzed → ${r.path}`);
        out({
          slug: r.slug,
          path: r.path,
          model: r.model,
          latencyMs: r.latencyMs,
          parsed: r.json !== undefined,
          preview: r.text.slice(0, 240),
        });
      } catch (e: any) {
        raiseError("E_PROVIDER_HTTP", { provider: "OpenRouter", status: 0, detail: e?.message ?? String(e) });
      }
    });

  // ── analyze-video (full mp4 → Gemini, NOT sampled frames) ──────────────
  cmd
    .command("analyze-video <slug-or-path-or-url>")
    .description(
      "Send the full mp4 to Gemini for precise shot-cut detection (better than `analyze` for fast-cut commercials). Arg can be a ref slug, a local file path, or an http(s) URL.",
    )
    .option("--shots <n>", "Expected exact shot count (e.g. 27). Omit to let the model decide.", (v) => parseInt(v, 10))
    .option("--prompt <text>", "Custom prompt (overrides default shot-cut detector)")
    .option("--prompt-file <path>", "Read custom prompt from a file")
    .option("--model <id>", "Model id (default google/gemini-3.1-pro-preview — natively understands video)")
    .option("--out <path>", "Output path. Defaults to <slug>/video-analysis.json for slug input, stdout for path/URL input.")
    .option("--max-tokens <n>", "Max output tokens (default 16384)", (v) => parseInt(v, 10))
    .option("--global", "Slug mode only: resolve the slug in the global .ralphy/references/ tree only (#401)", false)
    .action(async (arg: string, opts: any) => {
      try {
        let prompt = opts.prompt as string | undefined;
        if (!prompt && opts.promptFile) {
          // #025: NBSP-safe path intake; no project context here (ref is global).
          prompt = await fs.readFile(intakePath(opts.promptFile, undefined, "prompt-file"), "utf8");
        }
        // Detect input mode: slug if no path separator and not a URL and exists as a ref
        const isUrl = /^https?:\/\//i.test(arg);
        const hasSep = arg.includes("/") || arg.includes("\\") || arg.startsWith(".");
        const looksLikeSlug = !isUrl && !hasSep;
        const result = looksLikeSlug
          ? await analyzeVideo({
              slug: arg,
              prompt,
              expectedShots: opts.shots,
              model: opts.model,
              outPath: opts.out,
              maxTokens: opts.maxTokens,
              global: opts.global === true,
            })
          : await analyzeVideo({
              videoPath: arg,
              prompt,
              expectedShots: opts.shots,
              model: opts.model,
              outPath: opts.out,
              maxTokens: opts.maxTokens,
            });
        if (result.path) ok(`Analyzed → ${result.path}`);
        else ok(`Analyzed (no out path; preview below)`);
        const shotsCount = Array.isArray(result.json) ? (result.json as unknown[]).length : null;
        out({
          path: result.path,
          model: result.model,
          latencyMs: result.latencyMs,
          inputBytes: result.inputBytes,
          parsed: result.json !== undefined,
          shotsDetected: shotsCount,
          preview: result.text.slice(0, 320),
        });
      } catch (e: any) {
        raiseError("E_PROVIDER_HTTP", { provider: "OpenRouter (Gemini)", status: 0, detail: e?.message ?? String(e) });
      }
    });

  // ── audio-describe (Gemini-audio LLM) ──────────────────────────────────
  cmd
    .command("audio-describe <slug>")
    .description("Send <slug>/source.mp3 to Gemini-audio → <slug>/audio-analysis.json (tone, music, VO style)")
    .option("--prompt <text>", "Custom prompt (overrides default tonal-analysis prompt)")
    .option("--prompt-file <path>", "Read custom prompt from a file")
    .option("--model <id>", "Model id (default google/gemini-2.5-flash)")
    .option("--global", "Resolve the slug in the global .ralphy/references/ tree only (#401)", false)
    .action(async (slug: string, opts: any) => {
      try {
        let prompt = opts.prompt as string | undefined;
        if (!prompt && opts.promptFile) {
          // #025: NBSP-safe path intake; no project context here (ref is global).
          prompt = await fs.readFile(intakePath(opts.promptFile, undefined, "prompt-file"), "utf8");
        }
        const r = await audioDescribeRef({ slug, prompt, model: opts.model, global: opts.global === true });
        ok(`Audio described → ${r.path}`);
        out({
          slug: r.slug,
          path: r.path,
          model: r.model,
          parsed: r.json !== undefined,
          preview: r.text.slice(0, 240),
        });
      } catch (e: any) {
        raiseError("E_PROVIDER_HTTP", { provider: "OpenRouter", status: 0, detail: e?.message ?? String(e) });
      }
    });

  // ── blueprint (synthesize markdown) ────────────────────────────────────
  cmd
    .command("blueprint <slug>")
    .description("Synthesize <slug>/blueprint.md from {meta + analysis + audio-analysis + transcript}")
    .option("--global", "Resolve the slug in the global .ralphy/references/ tree only (#401)", false)
    .action(async (slug: string, opts: any) => {
      try {
        const r = await synthesizeBlueprint(slug, { global: opts.global === true });
        ok(`Blueprint written → ${r.path} (${r.bytes} bytes)`);
        out({ slug, path: r.path, bytes: r.bytes });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `blueprint: ` });
      }
    });

  // ── rasterize (svg → png) ──────────────────────────────────────────────
  // Vector logos / brand marks → crisp PNG for use as `--ref`. Recipe origin:
  // ralphy-carousel-001 had a 95-line user-land Playwright helper for this.
  // Issue #037.
  cmd
    .command("rasterize <file>")
    .description(
      "Rasterize a vector reference (SVG) to a crisp PNG at the requested long-edge size. Preserves intrinsic aspect ratio. `--bg <hex>` adds a solid background (default: transparent).",
    )
    .requiredOption("--size <n>", "Long-edge size in pixels (default 1024)", (v) => parseInt(v, 10), 1024)
    .option("--out <path>", "Output PNG path (default: alongside the SVG with `.png` extension)")
    .option("--bg <hex>", "Background colour (default: transparent)")
    .option("--project <id>", "Project ID for log line")
    .option("--note <note>", "Free-form note")
    .action(async (file: string, opts: any) => {
      try {
        const src = path.resolve(file);
        if (!src.toLowerCase().endsWith(".svg")) {
          raiseError("E_INPUT_INVALID", {
            field: "file",
            detail: `expected a .svg file, got "${file}"`,
            verb: "ref rasterize",
          });
          return;
        }
        const dst = opts.out
          ? path.resolve(opts.out)
          : src.replace(/\.svg$/i, ".png");
        await rasterizeSvg({
          src,
          dst,
          size: opts.size,
          bg: opts.bg,
          projectId: opts.project,
          note: opts.note,
        });
        ok(`Rasterized → ${dst}`);
        out({ src: file, dst, size: opts.size, bg: opts.bg ?? null });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `ref rasterize: ${e?.message ?? e}` });
      }
    });

  // ── show-paths (debug helper) ──────────────────────────────────────────
  cmd
    .command("paths <slug>")
    .description("Print every research path for <slug> (helpful when scripting follow-ups)")
    .option("--global", "Resolve the slug in the global .ralphy/references/ tree only (#401)", false)
    .action(async (slug: string, opts: any) => {
      out({ slug, derivedFromUrl: slugFromUrl(slug), ...refPaths(slug, { global: opts.global === true }) });
    });

  cmd
    .command("scrape-trends")
    .description("Scrape TikTok hashtag pages via Playwright (Apify-compatible JSON shape) and rank with scoreTikTok()")
    .requiredOption("--hashtags <list>", "Comma-separated hashtags (without #)")
    .option("--limit <n>", "Max videos per hashtag", (v) => parseInt(v, 10), 10)
    .option("--out <path>", "Output JSON path")
    .action(async (opts: any) => {
      const date = new Date().toISOString().slice(0, 10);
      const outPath = path.resolve(
        opts.out ??
          path.join(referencesDir(), `trends-${date}`, "results.json")
      );
      const scriptPath = path.resolve(
        root(),
        ".agents/skills/researcher/scripts/scrape-tiktok-trends.ts"
      );

      // Run the script as a child process so the CLI command stays thin.
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(
          "bunx",
          ["tsx", scriptPath, "--hashtags", opts.hashtags, "--limit", String(opts.limit), "--out", outPath],
          { stdio: "inherit" }
        );
        proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`scraper exit ${code}`))));
      });

      const raw = await fs.readFile(outPath, "utf-8");
      const videos = JSON.parse(raw) as Array<{
        playCount?: number; diggCount?: number; commentCount?: number; shareCount?: number;
        webVideoUrl?: string; text?: string;
      }>;
      const ranked = videos
        .map((v) => ({
          url: v.webVideoUrl,
          text: (v.text || "").slice(0, 80),
          score: scoreTikTok({
            playCount: v.playCount ?? 0,
            diggCount: v.diggCount ?? 0,
            commentCount: v.commentCount ?? 0,
            shareCount: v.shareCount ?? 0,
          }),
        }))
        .sort((a, b) => b.score.score - a.score.score);

      ok(`Scraped ${videos.length} videos → ${outPath}`);
      out({
        out: outPath,
        count: videos.length,
        ranked: ranked.slice(0, 20),
      });
    });

  // ── check (04.02.02 — reference-required gate classifier) ───────────────
  cmd
    .command("check <project-id>")
    .description(
      "Run the reference-required gate classifier on <project-id>'s scenario.json. Reports whether a real-entity name (person / brand-product / IP) was detected and, if so, whether at least one ref is attached. Exit 5 (gate) when the gate fires AND no ref is attached.",
    )
    .option(
      "--text <text>",
      "Bypass scenario.json and classify a raw brief / utterance instead. Useful before a project exists.",
    )
    .action(async (projectId: string, opts: { text?: string }) => {
      const { needsReference, checkReferenceGate } = await import("../lib/eval/refs.js");
      // Branch 1 — raw text mode (no project required).
      if (opts.text) {
        const r = needsReference(opts.text);
        out({
          mode: "text",
          required: r.required,
          ...(r.kind ? { kind: r.kind } : {}),
          ...(r.reason ? { reason: r.reason } : {}),
          ...(r.matches ? { matches: r.matches } : {}),
        });
        // Doc-policy: this verb reports; it does not raise. Agent / playbook
        // decides what to do with the gate result.
        return;
      }
      // Branch 2 — read project scenario.json + attached refs.
      const project = await getEntity("projects", projectId);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id: projectId });
      const projDir = projectDir(projectId);
      let scenario: any = null;
      try {
        const raw = await fs.readFile(path.join(projDir, "scenario.json"), "utf-8");
        scenario = JSON.parse(raw);
      } catch {
        // No scenario yet — fall back to project.brief / name / description.
        scenario = {
          name: project.name,
          description: project.brief || project.description,
        };
      }
      const attachedRefs: Array<{ kind?: string; id?: string }> = Array.isArray(project.refs)
        ? project.refs.map((id: string) => ({ id }))
        : [];
      const r = checkReferenceGate(scenario, attachedRefs);
      out({
        mode: "project",
        project: projectId,
        required: r.required,
        satisfied: r.satisfied,
        ...(r.kind ? { kind: r.kind } : {}),
        ...(r.reason ? { reason: r.reason } : {}),
        ...(r.matches ? { matches: r.matches } : {}),
        attachedRefs: attachedRefs.map((r) => r.id ?? null).filter(Boolean),
      });
    });

  // ── pack (#426 — reference-pack builder) ───────────────────────────────
  // Gather/classify the refs a project will generate against into a typed,
  // lockable ref-pack.json + REF_PACK.md. Append-only: a re-run MERGES entries
  // by path and never deletes a ref or a file on disk.
  cmd
    .command("pack <project-id>")
    .description(
      "Build/update the project's reference pack — gathers + classifies refs from artifacts/refs/ (and workspace shared/refs/ + research-facts hints) into a typed, lockable ref-pack.json + REF_PACK.md. Append-only: a re-run merges by path. `--add` registers a ref manually; `--show` prints without rebuilding; `--mode` reports missing required ref types.",
    )
    .option("--add <path>", "Manually add/update a ref entry at <path> (project-relative)")
    .option("--type <type>", "Ref type for --add: brand | product | model-person | style | benchmark | source-video | music | generated-master | selected-prototype")
    .option("--lock", "Mark the --add'ed ref as locked (reused verbatim downstream)", false)
    .option("--note <text>", "Optional note for the --add'ed ref")
    .option("--show", "Print the existing pack without rebuilding", false)
    .option("--mode <mode>", "Also report missing required ref types for this content mode (#426)")
    .action(async (projectId: string, opts: any) => {
      const {
        buildRefPack,
        mergeRefPack,
        addManualEntry,
        readRefPack,
        renderRefPackMd,
        reportMissingForMode,
        REF_PACK_MD_ARTIFACT,
      } = await import("../lib/ref-pack.js");
      const { REF_PACK_ARTIFACT, lockedRefs } = await import("../lib/schemas/ref-pack.js");

      const project = await getEntity("projects", projectId);
      if (!project) {
        raiseError("E_NOT_FOUND", { kind: "Project", id: projectId });
        return;
      }
      const projDir = projectDir(projectId);
      const packPath = path.join(projDir, REF_PACK_ARTIFACT);
      const mdPath = path.join(projDir, REF_PACK_MD_ARTIFACT);

      let pack = readRefPack(projectId);

      if (opts.show) {
        if (!pack) {
          raiseError("E_NOT_FOUND", { kind: "Reference pack", id: `${projectId}/${REF_PACK_ARTIFACT}` });
          return;
        }
        // fall through to emit (no write)
      } else if (opts.add) {
        if (!opts.type) {
          raiseError("E_INPUT_INVALID", { field: "--type", detail: "--add requires --type <ref-type>", verb: "ref pack" });
          return;
        }
        // Start from existing (or a fresh build) so --add composes with the auto-gathered set.
        const base = pack ?? buildRefPack(projectId);
        try {
          pack = addManualEntry(base, { path: opts.add, type: opts.type, lock: opts.lock === true, note: opts.note });
        } catch (e: any) {
          raiseError("E_INPUT_INVALID", { field: "--type", detail: e?.message ?? String(e), verb: "ref pack" });
          return;
        }
      } else {
        // Default: (re)build from disk and merge with any existing pack (append-only).
        pack = mergeRefPack(pack, buildRefPack(projectId));
      }

      if (!pack) {
        // Defensive — show branch already raised; build branches always set it.
        raiseError("E_INTERNAL", { detail: "ref pack: no pack to emit" });
        return;
      }

      // Persist on any non-show invocation.
      if (!opts.show) {
        await fs.writeFile(packPath, JSON.stringify(pack, null, 2) + "\n");
        await fs.writeFile(mdPath, renderRefPackMd(pack));
        ok(`Reference pack ${opts.add ? "updated" : "built"}: ${pack.entries.length} ref${pack.entries.length === 1 ? "" : "s"} → ${path.relative(root(), packPath)}`);
      }

      const locked = lockedRefs(pack);
      const modeReport = opts.mode ? reportMissingForMode(pack, opts.mode) : null;

      out({
        project: projectId,
        path: path.relative(projDir, packPath),
        md: path.relative(projDir, mdPath),
        total: pack.entries.length,
        byType: pack.entries.reduce((acc: Record<string, number>, e) => {
          acc[e.type] = (acc[e.type] ?? 0) + 1;
          return acc;
        }, {}),
        locked: locked.map((e) => e.path),
        entries: pack.entries.map((e) => ({
          type: e.type,
          path: e.path,
          locked: e.locked,
          source: e.source || null,
          ...(e.note ? { note: e.note } : {}),
        })),
        ...(modeReport
          ? { modeReport: { mode: modeReport.mode, required: modeReport.required, missing: modeReport.missing, satisfied: modeReport.satisfied } }
          : {}),
      });
    });

  // ── lint (#449 — reference-pack lint) ──────────────────────────────────
  // Deterministic structural lint over the project's ref-pack: missing files,
  // unsupported formats, tiny resolutions, duplicate hashes, suspicious temp
  // paths, missing provenance, and (with --mode) missing required ref types.
  // Catches bad refs BEFORE paid generation. NO model calls, NO network.
  cmd
    .command("lint <project-id>")
    .description(
      "Lint the project's reference pack — flags missing files, unsupported formats, tiny resolutions, duplicate hashes, suspicious temp paths, missing provenance, and (with --mode) required ref types absent for the mode. Deterministic, no model calls. `--contact-sheet` also renders the grouped-by-type montage.",
    )
    .option("--mode <mode>", "Also flag required ref types absent for this content mode (#426)")
    .option("--contact-sheet", "Also render the grouped-by-type contact sheet to artifacts/refs/contact-sheet.png", false)
    .option("--force-overwrite", "Overwrite an existing contact sheet instead of auto-versioning", false)
    .action(async (projectId: string, opts: { mode?: string; contactSheet?: boolean; forceOverwrite?: boolean }) => {
      const project = await getEntity("projects", projectId);
      if (!project) {
        raiseError("E_NOT_FOUND", { kind: "Project", id: projectId });
        return;
      }
      const { readRefPack } = await import("../lib/ref-pack.js");
      const { lintRefPack, buildRefPackContactSheet, defaultRefProbe, REF_PACK_CONTACT_SHEET_ARTIFACT } =
        await import("../lib/ref-pack-lint.js");

      const pack = readRefPack(projectId);
      if (!pack) {
        raiseError("E_NOT_FOUND", { kind: "Reference pack", id: `${projectId}/ref-pack.json` });
        return;
      }

      const report = lintRefPack({ pack, mode: opts.mode ?? null, probe: defaultRefProbe(projectId) });

      let contactSheetPath: string | null = null;
      if (opts.contactSheet) {
        const { resolveProjectPath } = await import("../lib/path-resolution.js");
        const dst = path.join(projectDir(projectId), REF_PACK_CONTACT_SHEET_ARTIFACT);
        try {
          const r = await buildRefPackContactSheet({
            pack,
            dst,
            resolve: (e) => resolveProjectPath(e.path, projectId),
            forceOverwrite: opts.forceOverwrite === true,
            projectId,
          });
          contactSheetPath = r.path ? path.relative(projectDir(projectId), r.path) : null;
        } catch (e: any) {
          err(`Contact sheet render failed: ${e?.message ?? String(e)}`);
        }
      }

      if (report.ok) ok(`Reference pack lint: ${report.verdict} — ${report.reason}`);
      else err(`Reference pack lint: ${report.verdict} — ${report.reason}`);

      out({
        project: projectId,
        verdict: report.verdict,
        ok: report.ok,
        total: report.total,
        ...(report.mode ? { mode: report.mode } : {}),
        reason: report.reason,
        findings: report.findings.map((f) => ({
          id: f.id,
          category: f.category,
          severity: f.severity,
          message: f.message,
          fixHint: f.fixHint,
        })),
        ...(opts.contactSheet ? { contactSheet: contactSheetPath } : {}),
      });
    });

  // ── contact-sheet (#449 — grouped-by-type ref montage) ──────────────────
  // Render a compact visual summary of the project's image refs, one row per
  // ref type, via the existing #049 ffmpeg contact-sheet recipe. Append-only
  // (the recipe auto-versions an existing sheet). Video / audio refs are
  // excluded — xstack only stacks stills.
  cmd
    .command("contact-sheet <project-id>")
    .description(
      "Render a grouped-by-type contact sheet of the project's image refs to artifacts/refs/contact-sheet.png (one row per ref type). Uses the existing ffmpeg contact-sheet recipe; append-only (auto-versions an existing sheet). Video/audio refs are excluded.",
    )
    .option("--force-overwrite", "Overwrite an existing contact sheet instead of auto-versioning", false)
    .action(async (projectId: string, opts: { forceOverwrite?: boolean }) => {
      const project = await getEntity("projects", projectId);
      if (!project) {
        raiseError("E_NOT_FOUND", { kind: "Project", id: projectId });
        return;
      }
      const { readRefPack } = await import("../lib/ref-pack.js");
      const { buildRefPackContactSheet, REF_PACK_CONTACT_SHEET_ARTIFACT } = await import("../lib/ref-pack-lint.js");
      const { resolveProjectPath } = await import("../lib/path-resolution.js");

      const pack = readRefPack(projectId);
      if (!pack) {
        raiseError("E_NOT_FOUND", { kind: "Reference pack", id: `${projectId}/ref-pack.json` });
        return;
      }

      const dst = path.join(projectDir(projectId), REF_PACK_CONTACT_SHEET_ARTIFACT);
      let result: { path: string | null; groups: Array<{ type: string; srcs: string[] }>; cols: number };
      try {
        result = await buildRefPackContactSheet({
          pack,
          dst,
          resolve: (e) => resolveProjectPath(e.path, projectId),
          forceOverwrite: opts.forceOverwrite === true,
          projectId,
        });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `contact-sheet render failed: ${e?.message ?? String(e)}` });
        return;
      }

      if (!result.path) {
        ok(`No image refs to render — contact sheet skipped.`);
        out({ project: projectId, contactSheet: null, groups: [], reason: "no image refs in the pack" });
        return;
      }

      ok(`Contact sheet rendered → ${path.relative(root(), result.path)}`);
      out({
        project: projectId,
        contactSheet: path.relative(projectDir(projectId), result.path),
        cols: result.cols,
        groups: result.groups.map((g) => ({ type: g.type, count: g.srcs.length })),
      });
    });

  cmd
    .command("delete <id>")
    .description("Delete a reference")
    .action(async (id: string) => {
      const ok_ = await deleteEntity("refs", id);
      if (!ok_) raiseError("E_NOT_FOUND", { kind: "Reference", id });
      ok(`Reference deleted: ${id}`);
      out({ deleted: id });
    });

  // ── locate (find object bbox in an image via Gemini vision) ──────────────
  cmd
    .command("locate")
    .description("Locate an object in an image — returns pixel bbox(es) via Gemini vision")
    .requiredOption("--image <path>", "Path to source image (jpg/png)")
    .requiredOption("--object <text>", "Plain-text description of the object to find")
    .option("--model <id>", "Vision model id", "google/gemini-2.5-flash")
    .option("--top-k <n>", "Max number of candidate bboxes to return", "5")
    .action(async (opts: { image: string; object: string; model: string; topK: string }) => {
      // #025: NBSP-safe path intake.
      const imgPath = intakePath(opts.image, undefined, "image");
      const buf = await fs.readFile(imgPath).catch(() => {
        raiseError("E_NOT_FOUND", { kind: "Image", id: imgPath });
        return Buffer.alloc(0);
      });

      const probe = spawnSync(
        "ffprobe",
        ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "default=noprint_wrappers=1:nokey=0", imgPath],
        { encoding: "utf-8" }
      );
      const width = Number((probe.stdout.match(/width=(\d+)/) || [])[1]);
      const height = Number((probe.stdout.match(/height=(\d+)/) || [])[1]);
      if (!width || !height) {
        err("Could not read image dimensions; install ffmpeg or check file path.");
        process.exit(1);
      }

      const ext = path.extname(imgPath).slice(1).toLowerCase() || "jpeg";
      const mime = ext === "jpg" ? "jpeg" : ext;
      const b64 = buf.toString("base64");

      const prompt = `Find every visible instance of: "${opts.object}".
Image dimensions: ${width}x${height} pixels.
Return ONLY a JSON array, no prose, no markdown fences. Each element:
  {"label": "<short noun>", "x": <pixels from left>, "y": <pixels from top>, "width": <px>, "height": <px>, "score": <0..1>}
Coordinates MUST be integers in absolute pixel space (not normalized 0..1).
Be precise — return tight bboxes around the object, not the whole region containing it.
If the object is not visible, return [].
Limit output to the top ${opts.topK} candidates by confidence.`;

      let content = "";
      try {
        const result = await callLLM({
          model: opts.model,
          maxTokens: 1024,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: `data:image/${mime};base64,${b64}` } },
              ],
            },
          ],
          endpoint: "ref-locate",
        });
        content = result.text;
      } catch (e: any) {
        err(`Vision call failed: ${e?.message ?? String(e)}`);
        process.exit(1);
      }

      const cleaned = content.replace(/```(?:json)?\s*([\s\S]*?)```/, "$1").trim();
      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        err(`Model did not return valid JSON. Raw output:\n${content}`);
        process.exit(1);
      }
      if (!Array.isArray(parsed)) {
        err(`Expected JSON array, got: ${typeof parsed}`);
        process.exit(1);
      }
      out({ image: imgPath, dimensions: { width, height }, object: opts.object, matches: parsed });
    });

  cmd.addHelpText(
    "after",
    `
Examples:
  ralphy ref pull https://tiktok.com/@x/video/72939...
  ralphy ref pull https://a.com/x.png https://b.com/y.jpg --kind reference-image --project my-proj-001
  ralphy ref pull --from-file urls.txt --kind reference-image --project my-proj-001
  ralphy ref pull-site https://example.com --project my-proj-001
  ralphy ref analyze my-reference-slug
  ralphy ref blueprint my-reference-slug
  ralphy ref check my-project-001                  # gate classifier on scenario.json
  ralphy ref check --text "Old Spice style hero"   # gate classifier on a raw brief
  ralphy ref pack my-project-001                    # build/update the typed reference pack
  ralphy ref pack my-project-001 --show             # print the pack without rebuilding
  ralphy ref pack my-project-001 --add artifacts/refs/hero.png --type product --lock
  ralphy ref pack my-project-001 --mode product-shot  # report missing required ref types
  ralphy ref locate --image shot.jpg --object "label tab on the bottle" --top-k 3
`,
  );

  return cmd;
}

function referenceSummary(meta: Record<string, unknown>): {
  title: string | null;
  uploader: string | null;
  duration: number | null;
} {
  return {
    title: typeof meta.title === "string" ? meta.title : null,
    uploader: typeof meta.uploader === "string" ? meta.uploader : null,
    duration: typeof meta.duration === "number" && Number.isFinite(meta.duration) ? meta.duration : null,
  };
}

function resolveReferenceArtifact(slug: string, kind: "video" | "audio", opts: any) {
  if (Boolean(opts.project) === Boolean(opts.workspace)) {
    raiseError("E_INPUT_INVALID", {
      field: "destination",
      detail: `ref ${kind === "video" ? "frames" : "transcribe"} requires exactly one of --project <id> or --workspace <id>`,
      verb: kind === "video" ? "ref frames" : "ref transcribe",
    });
  }
  const context = generationRunScope(opts.project
    ? { kind: "project", id: opts.project }
    : { kind: "workspace", id: opts.workspace });
  return { ...resolveLatestArtifactObject({ context, slug: `${slug}-${kind}`, kind }), scope: context };
}

function addReferenceUsage(
  revisionId: string,
  opts: any,
  scope: { projectId: string } | { workspaceId: string },
): void {
  addArtifactUsage({
    artifactRevisionId: revisionId,
    ...(opts.project ? { projectId: opts.project as string } : { workspaceId: (scope as { workspaceId: string }).workspaceId }),
    role: "reference",
  });
}

function referenceImageMime(extension: string): string {
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  throw new Error(`unsupported reference image extension: ${extension || "<none>"}`);
}
