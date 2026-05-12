import { Command } from "commander";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { addEntity, getEntity, updateEntity, deleteEntity, listEntities } from "../lib/registry.js";
import { slugify, generateId } from "../lib/ids.js";
import { out, ok, err } from "../lib/output.js";
import { scoreTikTok } from "../lib/score.js";
import { root } from "../lib/paths.js";
import {
  pullReference,
  sampleFrames,
  transcribeRef,
  analyzeFrames,
  audioDescribeRef,
  synthesizeBlueprint,
  slugFromUrl,
  refPaths,
} from "../lib/research.js";
import type { TranscribeBackend, TranscribeLanguage } from "../lib/transcribe.js";

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
      if (!ref) err(`Reference not found: ${id}`);
      out(ref);
    });

  cmd
    .command("attach <refId>")
    .description("Attach reference to a project")
    .requiredOption("--to <projectId>", "Target project ID")
    .action(async (refId: string, opts: any) => {
      const ref = await getEntity("refs", refId);
      if (!ref) err(`Reference not found: ${refId}`);
      const project = await getEntity("projects", opts.to);
      if (!project) err(`Project not found: ${opts.to}`);

      const refs = project.refs || [];
      if (!refs.includes(refId)) refs.push(refId);
      await updateEntity("projects", opts.to, { refs });
      ok(`Reference ${refId} attached to project ${opts.to}`);
      out({ refId, projectId: opts.to });
    });

  // ── pull (yt-dlp wrapper) ──────────────────────────────────────────────
  cmd
    .command("pull <url>")
    .description("Pull a video into workspace/references/<slug>/. Default: yt-dlp from URL. With --local: copy from local mp4 path (url arg becomes a label).")
    .option("--slug <name>", "Custom slug (default: derived from URL or filename)")
    .option("--local <path>", "Use a local mp4 file instead of yt-dlp. <url> becomes a label.")
    .option("--audio-only", "Skip the video stream — only fetch mp3 (URL mode only)")
    .option("--meta-only", "Skip download — only write meta.info.json (URL mode only)")
    .option("--no-audio-extract", "Skip auto-extraction of mono 64k mp3 from mp4")
    .option("--register", "Also call `ref add --type social <url>`", false)
    .action(async (url: string, opts: any) => {
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
        err(`pull failed: ${e?.message || e}`);
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
        err(`frames failed: ${e?.message || e}`);
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
        err(`transcribe failed: ${e?.message || e}`);
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
          prompt = await fs.readFile(path.resolve(opts.promptFile), "utf8");
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
        err(`analyze failed: ${e?.message || e}`);
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
          prompt = await fs.readFile(path.resolve(opts.promptFile), "utf8");
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
        err(`audio-describe failed: ${e?.message || e}`);
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
        err(`blueprint failed: ${e?.message || e}`);
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
        ".agents/skills/ralph-researcher/scripts/scrape-tiktok-trends.ts"
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

  cmd
    .command("delete <id>")
    .description("Delete a reference")
    .action(async (id: string) => {
      const ok_ = await deleteEntity("refs", id);
      if (!ok_) err(`Reference not found: ${id}`);
      ok(`Reference deleted: ${id}`);
      out({ deleted: id });
    });

  return cmd;
}
