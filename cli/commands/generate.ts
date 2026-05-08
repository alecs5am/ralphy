// `ralphy generate <kind>` — single CLI gate for every model call.
//
// Per AGENTS.md hard rule #2: skill code MUST go through this command, not
// runtime TS scripts under workspace/projects/<id>/scripts/. Each subcommand
// validates inputs, calls cli/lib/providers/media.ts (or transcribe.ts for
// captions), updates asset-manifest.json, returns parse-friendly JSON.

import { Command } from "commander";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { projectsDir } from "../lib/paths.js";
import { out, err } from "../lib/output.js";
import {
  generateImage,
  generateVideo,
  generateVoiceover,
  generateMusic,
} from "../lib/providers/media.js";
import { transcribe, type TranscribeBackend } from "../lib/transcribe.js";
import { logGeneration } from "../lib/gen-log.js";
import { logUserPrompt } from "../lib/gen-log.js";

const SLOT_REGEX = /^[a-z0-9-]+$/;

type Manifest = {
  slots: Record<
    string,
    {
      kind: "image" | "video" | "voiceover" | "music" | "captions";
      path: string;
      model?: string;
      costUsd?: number;
      url?: string;
      generatedAt: string;
    }
  >;
};

async function readManifest(projectId: string): Promise<Manifest> {
  const manifestPath = path.join(projectsDir(), projectId, "asset-manifest.json");
  if (!existsSync(manifestPath)) return { slots: {} };
  const raw = await fs.readFile(manifestPath, "utf8").catch(() => "");
  if (!raw) return { slots: {} };
  try {
    const j = JSON.parse(raw) as Manifest;
    if (!j.slots) j.slots = {};
    return j;
  } catch {
    return { slots: {} };
  }
}

async function writeManifest(projectId: string, m: Manifest): Promise<void> {
  const dir = path.join(projectsDir(), projectId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "asset-manifest.json"),
    JSON.stringify(m, null, 2) + "\n",
    "utf8",
  );
}

async function ensureProject(projectId: string): Promise<void> {
  const dir = path.join(projectsDir(), projectId);
  if (!existsSync(dir)) {
    err(`Project not found: ${projectId} (looked at ${dir})`);
  }
}

function validateSlot(slot: string): void {
  if (!SLOT_REGEX.test(slot)) {
    err(`Invalid slot id "${slot}" — expected lowercase kebab-case (e.g. scene-01-bg-image)`);
  }
}

export function generateCmd() {
  const cmd = new Command("generate").description("Generate a single asset (image / video / voiceover / music / captions). Logs cost + path automatically.");

  // ── image ───────────────────────────────────────────────────────────────
  cmd
    .command("image")
    .description("Generate one image via OpenRouter (default: gemini-3-pro-image-preview)")
    .requiredOption("--project <id>", "Project ID")
    .requiredOption("--slot <slot>", "Asset slot id (e.g. scene-01-bg-image)")
    .requiredOption("--prompt <prompt>", "Text prompt")
    .option("--model <model>", "OpenRouter model id", "google/gemini-3-pro-image-preview")
    .option(
      "--ref <ref...>",
      "Reference image(s) for multi-ref consistency. URL / local path / data: URI; local paths auto-converted to data: URI"
    )
    .option(
      "--size <size>",
      "Size hint (passed to model as prompt-level guidance; gemini/gpt image models do not accept exact pixel dimensions and will round to their natural sizes)",
      "1080x1920"
    )
    .option("--negative <prompt>", "Negative prompt")
    .option("--note <note>", "Free-form note for generations.jsonl")
    .action(async (opts) => {
      await ensureProject(opts.project);
      validateSlot(opts.slot);
      const result = await generateImage({
        projectId: opts.project,
        slot: opts.slot,
        prompt: opts.prompt,
        model: opts.model,
        refs: opts.ref,
        size: opts.size,
        negativePrompt: opts.negative,
        note: opts.note,
      });
      const manifest = await readManifest(opts.project);
      manifest.slots[opts.slot] = {
        kind: "image",
        path: result.localPath,
        model: result.model,
        costUsd: result.costUsd,
        url: result.url,
        generatedAt: new Date().toISOString(),
      };
      await writeManifest(opts.project, manifest);
      out({
        slot: opts.slot,
        path: result.localPath,
        model: result.model,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
      });
    });

  // ── video ───────────────────────────────────────────────────────────────
  cmd
    .command("video")
    .description("Generate one video via OpenRouter (default: kling-v3.0-pro)")
    .requiredOption("--project <id>", "Project ID")
    .requiredOption("--slot <slot>", "Asset slot id (e.g. scene-01-vid)")
    .requiredOption("--prompt <prompt>", "Motion / camera description")
    .requiredOption("--duration <seconds>", "Duration in seconds. Per-model `supported_durations` may be discrete (e.g. hailuo only 6/10) — see `ralphy models show <id>`", parseFloat)
    .option("--model <model>", "OpenRouter model id", "kwaivgi/kling-v3.0-pro")
    .option(
      "--first-frame <ref>",
      "First-frame anchor for i2v (URL / local path / data: URI). Strongly recommended for portrait orientation when prompt has wide-shot bias"
    )
    .option(
      "--last-frame <ref>",
      "Last-frame anchor (URL / local path / data: URI). Only models with `supported_frame_images: ['first_frame','last_frame']` accept this — see `ralphy models show <id>`"
    )
    .option("--image <ref>", "Alias for --first-frame (back-compat)")
    .option(
      "--aspect-ratio <ratio>",
      "Aspect ratio. Per-model whitelist: kling 9:16/16:9/1:1, veo 9:16/16:9, hailuo 16:9 only, seedance/wan up to 7 ratios. See `ralphy models show <id>`",
      "9:16"
    )
    .option(
      "--resolution <res>",
      "Resolution. Per-model whitelist: kling 720p only, veo up to 4K, seedance 480p/720p/1080p. See `ralphy models show <id>`",
      "720p"
    )
    .option("--audio", "Enable model-native audio (Veo 3 only — see MODELS.md)", false)
    .option("--poll-interval-ms <ms>", "Polling cadence (default 15000)", parseInt)
    .option("--poll-max-attempts <n>", "Max polls before timeout (default 80 ≈ 20min)", parseInt)
    .option("--note <note>", "Free-form note")
    .action(async (opts) => {
      await ensureProject(opts.project);
      validateSlot(opts.slot);
      const result = await generateVideo({
        projectId: opts.project,
        slot: opts.slot,
        prompt: opts.prompt,
        durationSec: opts.duration,
        model: opts.model,
        firstFrame: opts.firstFrame,
        lastFrame: opts.lastFrame,
        image: opts.image,
        aspectRatio: opts.aspectRatio,
        resolution: opts.resolution,
        generateAudio: opts.audio,
        pollIntervalMs: opts.pollIntervalMs,
        pollMaxAttempts: opts.pollMaxAttempts,
        note: opts.note,
      });
      const manifest = await readManifest(opts.project);
      manifest.slots[opts.slot] = {
        kind: "video",
        path: result.localPath,
        model: result.model,
        costUsd: result.costUsd,
        url: result.url,
        generatedAt: new Date().toISOString(),
      };
      await writeManifest(opts.project, manifest);
      out({
        slot: opts.slot,
        path: result.localPath,
        model: result.model,
        durationSec: opts.duration,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
      });
    });

  // ── voiceover ───────────────────────────────────────────────────────────
  cmd
    .command("voiceover")
    .description("Generate voiceover via ElevenLabs (default: eleven_multilingual_v2)")
    .requiredOption("--project <id>", "Project ID")
    .requiredOption("--slot <slot>", "Asset slot id (e.g. scene-01-vo)")
    .requiredOption("--voice <voiceId>", "ElevenLabs voice id (clone or library)")
    .requiredOption("--text <text>", "VO text (RU or EN)")
    .option("--model <model>", "ElevenLabs TTS model id", "eleven_multilingual_v2")
    .option("--note <note>", "Free-form note")
    .action(async (opts) => {
      await ensureProject(opts.project);
      validateSlot(opts.slot);
      const result = await generateVoiceover({
        projectId: opts.project,
        slot: opts.slot,
        voiceId: opts.voice,
        text: opts.text,
        modelId: opts.model,
        note: opts.note,
      });
      const manifest = await readManifest(opts.project);
      manifest.slots[opts.slot] = {
        kind: "voiceover",
        path: result.localPath,
        model: result.model,
        costUsd: result.costUsd,
        generatedAt: new Date().toISOString(),
      };
      await writeManifest(opts.project, manifest);
      out({
        slot: opts.slot,
        path: result.localPath,
        model: result.model,
        latencyMs: result.latencyMs,
      });
    });

  // ── music ───────────────────────────────────────────────────────────────
  cmd
    .command("music")
    .description("Generate music bed via ElevenLabs Music (instrumental by default)")
    .requiredOption("--project <id>", "Project ID")
    .requiredOption("--slot <slot>", "Asset slot id (e.g. bed-01)")
    .requiredOption("--prompt <prompt>", "Music description (genre, tempo, mood)")
    .requiredOption("--duration <seconds>", "Duration in seconds (3-600)", parseFloat)
    .option("--with-vocals", "Allow vocals (default: instrumental only)")
    .option("--note <note>", "Free-form note")
    .action(async (opts) => {
      await ensureProject(opts.project);
      validateSlot(opts.slot);
      const result = await generateMusic({
        projectId: opts.project,
        slot: opts.slot,
        prompt: opts.prompt,
        durationSec: opts.duration,
        forceInstrumental: !opts.withVocals,
        note: opts.note,
      });
      const manifest = await readManifest(opts.project);
      manifest.slots[opts.slot] = {
        kind: "music",
        path: result.localPath,
        model: result.model,
        costUsd: result.costUsd,
        generatedAt: new Date().toISOString(),
      };
      await writeManifest(opts.project, manifest);
      out({
        slot: opts.slot,
        path: result.localPath,
        model: result.model,
        durationSec: opts.duration,
        latencyMs: result.latencyMs,
      });
    });

  // ── captions ────────────────────────────────────────────────────────────
  cmd
    .command("captions")
    .description("Transcribe audio to Caption[] (≤25MB). Default backend: ElevenLabs Scribe v1 (word-level).")
    .requiredOption("--project <id>", "Project ID")
    .requiredOption("--audio <path>", "Audio file (mp3/m4a/wav, ≤25MB)")
    .option("--slot <slot>", "Slot id (default: derived from audio filename)")
    .option("--language <lang>", "Audio language: ru | en | auto", "ru")
    .option("--backend <backend>", "elevenlabs | openrouter | gemini", "elevenlabs")
    .option("--output <path>", "Custom output path (default: workspace/projects/<id>/captions.json)")
    .option("--note <note>", "Free-form note")
    .action(async (opts) => {
      await ensureProject(opts.project);
      const audioPath = path.resolve(opts.audio);
      const slot = opts.slot ?? `captions-${path.basename(audioPath, path.extname(audioPath))}`;
      validateSlot(slot);
      const backend = opts.backend as TranscribeBackend;
      const t0 = Date.now();
      const result = await transcribe({ audioPath, language: opts.language, backend });
      const outPath = opts.output
        ? path.resolve(opts.output)
        : path.join(projectsDir(), opts.project, "captions.json");
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, JSON.stringify(result.captions, null, 2), "utf8");

      await logGeneration(opts.project, {
        provider: result.backend === "elevenlabs" ? "elevenlabs" : "openrouter",
        endpoint: result.model,
        kind: "text",
        input: { audio: audioPath, language: opts.language, backend: result.backend },
        output: { local: outPath, bytes: result.captions.length },
        status: "ok",
        latency_ms: Date.now() - t0,
        cost_usd: result.costUsd,
        note: opts.note ?? slot,
      });

      const manifest = await readManifest(opts.project);
      manifest.slots[slot] = {
        kind: "captions",
        path: outPath,
        model: result.model,
        costUsd: result.costUsd,
        generatedAt: new Date().toISOString(),
      };
      await writeManifest(opts.project, manifest);

      out({
        slot,
        path: outPath,
        captions: result.captions.length,
        durationSec: result.audioDurationSec,
        language: result.language,
        costUsd: result.costUsd,
        latencyMs: Date.now() - t0,
      });
    });

  return cmd;
}

// Suppress unused import warning when consumers don't use this helper.
void logUserPrompt;
