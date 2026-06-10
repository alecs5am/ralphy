import { Command } from "commander";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { addEntity, getEntity, updateEntity, deleteEntity, listEntities } from "../lib/registry.js";
import { slugify, generateId } from "../lib/ids.js";
import { out, ok, err } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { scoreTikTok } from "../lib/score.js";
import { root } from "../lib/paths.js";
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
import { projectsDir, projectRefsDir } from "../lib/paths.js";
import { extractSite } from "../lib/playwright/site-extract.js";

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
    .option("--register", "Also call `ref add --type social <url>`", false)
    // Bulk-image-pull flags (#048):
    .option("--kind <kind>", "Bulk mode: 'reference-image' triggers bulk-fetch into <project>/artifacts/refs/")
    .option("--project <id>", "Bulk mode: target project id (artifacts/refs/ lives under workspace/projects/<id>/)")
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

      // Legacy: single-URL yt-dlp video pull.
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
      try {
        const result = await pullReference({
          url,
          slug: opts.slug,
          localPath: opts.local,
          audioOnly: opts.audioOnly,
          metaOnly: opts.metaOnly,
          noAudioExtract: !opts.audioExtract && opts.noAudioExtract === true,
        });
        if (opts.register) {
          await addAction(url, { type: "social", name: result.slug });
        }
        ok(`Pulled ${result.slug} → ${result.dir}`);
        out({
          slug: result.slug,
          dir: result.dir,
          videoPath: result.videoPath ?? null,
          audioPath: result.audioPath ?? null,
          metaPath: result.metaPath,
          title: (result.meta.title as string | undefined) ?? null,
          uploader: (result.meta.uploader as string | undefined) ?? null,
          duration: (result.meta.duration as number | undefined) ?? null,
        });
      } catch (e: any) {
        raiseError("E_PROVIDER_HTTP", { provider: "yt-dlp", status: 0, detail: e?.message ?? String(e) });
      }
    });

  // ── bulk-image-pull worker (#048) ──────────────────────────────────────
  async function runBulkImagePull(positional: string[], opts: any): Promise<void> {
    const projectId: string | undefined = opts.project;
    if (!projectId) {
      raiseError("E_INPUT_INVALID", {
        field: "--project",
        detail: "bulk image pull requires --project <id> (target for artifacts/refs/)",
        verb: "ref pull",
      });
      return;
    }
    const project = await getEntity("projects", projectId);
    if (!project) {
      raiseError("E_NOT_FOUND", { kind: "Project", id: projectId });
      return;
    }
    // Collect URLs: positional + --from-file (deduped, order-preserving).
    const fromFile: string[] = opts.fromFile
      ? await readUrlList(intakePath(opts.fromFile, projectId, "from-file"))
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
    const projDir = path.join(projectsDir(), projectId);
    const refsLocalDir = projectRefsDir(projectId);
    const results = await bulkFetch({
      urls,
      destDir: refsLocalDir,
      concurrency: opts.concurrency ?? 4,
      timeoutMs: opts.timeout ?? 30_000,
      onProgress: (r) => {
        // Stream breadcrumbs on stderr so they don't pollute JSON on stdout.
        if (r.status === "downloaded") process.stderr.write(`  ↓ ${r.url} → ${r.filename}\n`);
        else if (r.status === "skipped-existing") process.stderr.write(`  ◦ ${r.url} → ${r.filename} (existing sha match)\n`);
        else if (r.status === "skipped-duplicate") process.stderr.write(`  ◦ ${r.url} → ${r.filename} (duplicate sha)\n`);
        else if (r.status === "error") process.stderr.write(`  ✗ ${r.url} — ${r.error}\n`);
      },
    });
    // Log each download row (skip pure errors — they have no bytes).
    for (const r of results) {
      if (r.status === "error") {
        await logGeneration(projectId, {
          provider: "http",
          model: "http-bulk-fetch",
          endpoint: "ref-pull-bulk",
          kind: "other",
          input: { project: projectId, url: r.url, kind_hint: "reference-image" },
          status: "error",
          error: r.error,
          cost_usd: 0,
        });
      } else {
        await logGeneration(projectId, {
          provider: "http",
          model: "http-bulk-fetch",
          endpoint: "ref-pull-bulk",
          kind: "other",
          input: { project: projectId, url: r.url, kind_hint: "reference-image" },
          output: {
            local: r.dest ? path.relative(projDir, r.dest) : undefined,
            bytes: r.bytes,
          },
          status: "ok",
          cost_usd: 0,
          note: r.status === "downloaded"
            ? `bulk-fetch: ${r.filename}`
            : `bulk-fetch: ${r.filename} (${r.status})`,
        });
      }
    }
    const downloaded = results.filter((r) => r.status === "downloaded").length;
    const skipped = results.filter((r) => r.status.startsWith("skipped")).length;
    const errored = results.filter((r) => r.status === "error").length;
    ok(`Bulk pull: ${downloaded} downloaded · ${skipped} skipped · ${errored} errored`);
    out({
      project: projectId,
      destDir: path.relative(projDir, refsLocalDir),
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
    .option("--project <id>", "Project ID — refs live under workspace/projects/<id>/artifacts/refs/")
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
        : path.join(root(), "workspace", "references", new URL(url).hostname.replace(/^www\./, ""));
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
                local: path.relative(path.join(projectsDir(), projectId), page.screenshotPath),
              },
              status: "ok",
              cost_usd: 0,
              latency_ms: Date.now() - t0,
              note: `pull-site: ${page.slug} (${page.apis.length} api surfaces)`,
            });
          }
        }
        ok(`Crawled ${result.pages.length} page${result.pages.length === 1 ? "" : "s"} → ${path.relative(root(), outDir)}`);
        const projRoot = projectId ? path.join(projectsDir(), projectId) : root();
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
    .description("Sample JPEG frames from <slug>/source.mp4 → <slug>/frames/")
    .option("--fps <n>", "Frames-per-second (default 1/6 ≈ one every 6s)", (v) => Number(v))
    .option("--max <n>", "Max frames", (v) => parseInt(v, 10), 24)
    .option("--width <px>", "Scale width (default 540)", (v) => parseInt(v, 10), 540)
    .action(async (slug: string, opts: any) => {
      try {
        const r = await sampleFrames({
          slug,
          fps: opts.fps,
          max: opts.max,
          width: opts.width,
        });
        ok(`Sampled ${r.count} frames → ${r.dir}`);
        out({ slug: r.slug, dir: r.dir, count: r.count });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `frames: ` });
      }
    });

  // ── transcribe (research-context, no project ID) ───────────────────────
  cmd
    .command("transcribe <slug>")
    .description("Transcribe <slug>/source.mp3 → <slug>/transcript.json (Caption[]). Default backend: ElevenLabs Scribe v1.")
    .option("--language <lang>", "ru | en | auto", "ru")
    .option("--backend <backend>", "elevenlabs | openrouter | gemini", "elevenlabs")
    .action(async (slug: string, opts: any) => {
      try {
        const r = await transcribeRef({
          slug,
          language: opts.language as TranscribeLanguage,
          backend: opts.backend as TranscribeBackend,
        });
        ok(`Transcribed ${r.count} captions → ${r.path}`);
        out({
          slug: r.slug,
          path: r.path,
          captions: r.count,
          language: r.language,
          backend: r.backend,
          audioDurationSec: r.audioDurationSec,
          costUsd: r.costUsd,
        });
      } catch (e: any) {
        raiseError("E_PROVIDER_HTTP", { provider: "ElevenLabs/OpenRouter", status: 0, detail: e?.message ?? String(e) });
      }
    });

  // ── analyze (vision LLM over frames) ───────────────────────────────────
  cmd
    .command("analyze <slug>")
    .description("Run vision LLM over <slug>/frames/* → <slug>/analysis.json. Default prompt = UGC blueprint extractor.")
    .option("--prompt <text>", "Custom prompt (overrides default JSON-blueprint extractor)")
    .option("--prompt-file <path>", "Read custom prompt from a file")
    .option("--model <id>", "Vision model id (default google/gemini-2.5-flash)")
    .action(async (slug: string, opts: any) => {
      try {
        let prompt = opts.prompt as string | undefined;
        if (!prompt && opts.promptFile) {
          // #025: NBSP-safe path intake; no project context here (ref is global).
          prompt = await fs.readFile(intakePath(opts.promptFile, undefined, "prompt-file"), "utf8");
        }
        const r = await analyzeFrames({ slug, prompt, model: opts.model });
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
    .action(async (slug: string, opts: any) => {
      try {
        let prompt = opts.prompt as string | undefined;
        if (!prompt && opts.promptFile) {
          // #025: NBSP-safe path intake; no project context here (ref is global).
          prompt = await fs.readFile(intakePath(opts.promptFile, undefined, "prompt-file"), "utf8");
        }
        const r = await audioDescribeRef({ slug, prompt, model: opts.model });
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
    .action(async (slug: string) => {
      try {
        const r = await synthesizeBlueprint(slug);
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
    .action(async (slug: string) => {
      out({ slug, derivedFromUrl: slugFromUrl(slug), ...refPaths(slug) });
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
          path.join(root(), "workspace", "references", `trends-${date}`, "results.json")
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
      const projectDir = path.join(root(), "workspace", "projects", projectId);
      let scenario: any = null;
      try {
        const raw = await fs.readFile(path.join(projectDir, "scenario.json"), "utf-8");
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
  ralphy ref locate --image shot.jpg --object "label tab on the bottle" --top-k 3
`,
  );

  return cmd;
}
