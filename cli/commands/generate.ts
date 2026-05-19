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
  generateSfx,
} from "../lib/providers/media.js";
import { transcribe, type TranscribeBackend } from "../lib/transcribe.js";
import { logGeneration } from "../lib/gen-log.js";
import { logUserPrompt } from "../lib/gen-log.js";
import {
  findVideoModel,
  validateVideoParams,
  estimateVideoCostUsd,
} from "../lib/or-catalog.js";
import { enqueueGenerate } from "../lib/jobs/enqueue.js";
import type { JobKind } from "../lib/jobs/types.js";
import { resolveModelAlias } from "../lib/model-aliases.js";

const QUEUE_FLAGS = (cmd: Command): Command =>
  cmd
    .option(
      "--queue",
      "Enqueue this generation as a daemon job and return its job id immediately (does not wait)",
      false,
    )
    .option(
      "--depends-on <ids>",
      "Comma-separated list of job ids this enqueued job waits on (only meaningful with --queue)",
    )
    .option(
      "--queue-tag <tag>",
      "Tag attached to the enqueued job (filterable in `queue list`)",
    )
    .option(
      "--queue-priority <n>",
      "Priority bumped by the daemon when picking among same-state pending jobs",
      (v) => parseInt(v, 10),
    );

function maybeEnqueue(opts: any, kind: JobKind, project: string | undefined): boolean {
  const id = enqueueGenerate(
    {
      queue: opts.queue,
      dependsOn: opts.dependsOn,
      tag: opts.queueTag,
      priority: opts.queuePriority,
      project,
    },
    kind,
  );
  if (id == null) return false;
  out({ queued: true, id, kind, project: project ?? null });
  return true;
}

// Strict canonical form is lowercase-kebab. Relaxed input regex accepts uppercase
// and underscore — these get auto-normalized in normalizeSlot() with a stderr warn
// rather than hard-failing. Six of ten project postmortems flagged the previous
// hard-reject as their highest-frequency CLI friction (5+ retries per session).
const SLOT_REGEX_RELAXED = /^[a-zA-Z0-9_-]+$/;
const SLOT_REGEX_CANONICAL = /^[a-z0-9-]+$/;

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

/**
 * Validate and normalize a slot id. Strict canonical form is `[a-z0-9-]+` —
 * lowercase kebab-case. Relaxed input accepts `[a-zA-Z0-9_-]+` and auto-normalizes:
 *   uppercase → lowercase, `_` → `-`, then revalidate against canonical.
 * Emits a stderr warning when normalization happened so the caller learns the
 * canonical form for next time.
 *
 * Returns the canonical slug. Throws via `err()` if input contains characters
 * outside the relaxed set (spaces, dots, slashes, unicode, etc.) — those are
 * structural mistakes that auto-normalize can't safely recover from.
 */
function normalizeSlot(slot: string): string {
  if (!SLOT_REGEX_RELAXED.test(slot)) {
    err(
      `Invalid slot id "${slot}" — expected kebab-case ([a-zA-Z0-9_-]+). Got characters outside that set (spaces, dots, slashes, unicode).`,
    );
  }
  const canonical = slot.toLowerCase().replace(/_/g, "-");
  if (canonical !== slot) {
    // eslint-disable-next-line no-console
    console.error(
      `ralphy: slot normalized: "${slot}" → "${canonical}" (canonical form is lowercase kebab-case)`,
    );
  }
  if (!SLOT_REGEX_CANONICAL.test(canonical)) {
    err(
      `Invalid slot id "${slot}" — could not normalize to canonical form "${canonical}".`,
    );
  }
  return canonical;
}

export function generateCmd() {
  const cmd = new Command("generate").description("Generate a single asset (image / video / voiceover / music / captions). Logs cost + path automatically.");

  // ── image ───────────────────────────────────────────────────────────────
  const imageCmd = cmd
    .command("image")
    .description("Generate one image via OpenRouter (default: openai/gpt-5.4-image-2 — premium typography & label accuracy). Use --model google/gemini-3-pro-image-preview when you need multi-ref character consistency.")
    .requiredOption("--project <id>", "Project ID")
    .requiredOption("--slot <slot>", "Asset slot id (e.g. scene-01-bg-image)")
    .requiredOption("--prompt <prompt>", "Text prompt — see docs/prompts/image/ for mode-specific master templates")
    .option("--model <model>", "OpenRouter model id (default openai/gpt-5.4-image-2; switch to google/gemini-3-pro-image-preview for multi-ref/character consistency)", "openai/gpt-5.4-image-2")
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
    .option("--force-overwrite", "Bypass auto-versioning and overwrite the existing slot file in place. Default: archive existing to <slot>.v{N}.png.")
    .action(async (opts) => {
      await ensureProject(opts.project);
      opts.slot = normalizeSlot(opts.slot);
      if (maybeEnqueue(opts, "generate.image", opts.project)) return;
      const result = await generateImage({
        projectId: opts.project,
        slot: opts.slot,
        prompt: opts.prompt,
        model: resolveModelAlias(opts.model),
        refs: opts.ref,
        size: opts.size,
        negativePrompt: opts.negative,
        note: opts.note,
        overwrite: opts.forceOverwrite,
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

  QUEUE_FLAGS(imageCmd);

  // ── video ───────────────────────────────────────────────────────────────
  const videoCmd = cmd
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
    .option("--audio", "Enable model-native audio. Supported by veo-3.1, kling-v3.0-pro (EN only — accent slip / age drift on RU per noski + venom postmortems), seedance-2.0, and most other modern i2v endpoints. See MODELS.md per-model audio column.", false)
    .option("--poll-interval-ms <ms>", "Polling cadence (default 15000)", parseInt)
    .option("--poll-max-attempts <n>", "Max polls before timeout (default 80 ≈ 20min)", parseInt)
    .option(
      "--dry-run",
      "Validate params + print resolved request + cost estimate; do not submit",
      false
    )
    .option(
      "--no-validate",
      "Skip the per-model `supported_*` validation against OR catalog (force-submit)"
    )
    .option("--note <note>", "Free-form note")
    .option("--force-overwrite", "Bypass auto-versioning and overwrite the existing slot file in place. Default: archive existing to <slot>.v{N}.mp4.")
    .action(async (opts) => {
      await ensureProject(opts.project);
      opts.slot = normalizeSlot(opts.slot);
      if (maybeEnqueue(opts, "generate.video", opts.project)) return;

      const firstFrameRef = opts.firstFrame ?? opts.image;
      const lastFrameRef = opts.lastFrame;

      // Per-model validation against OR catalog (skippable).
      if (opts.validate !== false) {
        const catalogModel = await findVideoModel(opts.model).catch(() => undefined);
        if (catalogModel) {
          const findings = validateVideoParams(catalogModel, {
            duration: opts.duration,
            aspectRatio: opts.aspectRatio,
            resolution: opts.resolution,
            hasFirstFrame: !!firstFrameRef,
            hasLastFrame: !!lastFrameRef,
          });
          const errors = findings.filter((f) => f.level === "error");
          if (errors.length > 0) {
            const lines = errors.map(
              (f) =>
                `  - ${f.field}: ${f.reason}${f.suggestion ? `\n    -> ${f.suggestion}` : ""}`
            );
            err(
              `Per-model validation failed for ${opts.model} (use --no-validate to override):\n${lines.join("\n")}`
            );
          }
        }
      }

      if (opts.dryRun) {
        out({
          dryRun: true,
          model: resolveModelAlias(opts.model),
          slot: opts.slot,
          prompt: opts.prompt,
          durationSec: opts.duration,
          aspectRatio: opts.aspectRatio,
          resolution: opts.resolution,
          firstFrame: firstFrameRef ? "[ref-supplied]" : null,
          lastFrame: lastFrameRef ? "[ref-supplied]" : null,
          generateAudio: opts.audio,
          estimatedCostUsd: estimateVideoCostUsd(opts.model, opts.duration),
        });
        return;
      }

      const result = await generateVideo({
        projectId: opts.project,
        slot: opts.slot,
        prompt: opts.prompt,
        durationSec: opts.duration,
        model: resolveModelAlias(opts.model),
        firstFrame: opts.firstFrame,
        lastFrame: opts.lastFrame,
        image: opts.image,
        aspectRatio: opts.aspectRatio,
        resolution: opts.resolution,
        generateAudio: opts.audio,
        pollIntervalMs: opts.pollIntervalMs,
        pollMaxAttempts: opts.pollMaxAttempts,
        note: opts.note,
        overwrite: opts.forceOverwrite,
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

  QUEUE_FLAGS(videoCmd);

  // ── voiceover ───────────────────────────────────────────────────────────
  const voCmd = cmd
    .command("voiceover")
    .description("Generate voiceover via ElevenLabs (default: eleven_multilingual_v2)")
    .requiredOption("--project <id>", "Project ID")
    .requiredOption("--slot <slot>", "Asset slot id (e.g. scene-01-vo)")
    .requiredOption("--voice <voiceId>", "ElevenLabs voice id (clone or library)")
    .requiredOption("--text <text>", "VO text (RU or EN)")
    .option("--model <model>", "ElevenLabs TTS model id", "eleven_multilingual_v2")
    .option("--note <note>", "Free-form note")
    .option("--force-overwrite", "Bypass auto-versioning and overwrite the existing slot file in place. Default: archive existing to <slot>.v{N}.mp3.")
    .action(async (opts) => {
      await ensureProject(opts.project);
      opts.slot = normalizeSlot(opts.slot);
      if (maybeEnqueue(opts, "generate.voiceover", opts.project)) return;
      const result = await generateVoiceover({
        projectId: opts.project,
        slot: opts.slot,
        voiceId: opts.voice,
        text: opts.text,
        modelId: opts.model,
        note: opts.note,
        overwrite: opts.forceOverwrite,
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

  QUEUE_FLAGS(voCmd);

  // ── music ───────────────────────────────────────────────────────────────
  const musicCmd = cmd
    .command("music")
    .description("Generate music bed via ElevenLabs Music (instrumental by default)")
    .requiredOption("--project <id>", "Project ID")
    .requiredOption("--slot <slot>", "Asset slot id (e.g. bed-01)")
    .requiredOption("--prompt <prompt>", "Music description (genre, tempo, mood)")
    .requiredOption("--duration <seconds>", "Duration in seconds (3-600)", parseFloat)
    .option("--with-vocals", "Allow vocals (default: instrumental only)")
    .option("--note <note>", "Free-form note")
    .option("--force-overwrite", "Bypass auto-versioning and overwrite the existing slot file in place. Default: archive existing to <slot>.v{N}.mp3.")
    .action(async (opts) => {
      await ensureProject(opts.project);
      opts.slot = normalizeSlot(opts.slot);
      if (maybeEnqueue(opts, "generate.music", opts.project)) return;
      const result = await generateMusic({
        projectId: opts.project,
        slot: opts.slot,
        prompt: opts.prompt,
        durationSec: opts.duration,
        forceInstrumental: !opts.withVocals,
        note: opts.note,
        overwrite: opts.forceOverwrite,
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

  QUEUE_FLAGS(musicCmd);

  // ── sfx ─────────────────────────────────────────────────────────────────
  const sfxCmd = cmd
    .command("sfx")
    .description("Generate a sound effect via ElevenLabs Sound Generation (≤22s)")
    .requiredOption("--project <id>", "Project ID")
    .requiredOption("--slot <slot>", "Asset slot id (e.g. static-pop-01)")
    .requiredOption("--prompt <prompt>", "SFX description (e.g. 'short analog TV static pop')")
    .option("--duration <seconds>", "Duration in seconds (0.5-22)", parseFloat, 4)
    .option("--prompt-influence <n>", "Prompt adherence 0-1 (default 0.4 — let model interpret)", parseFloat, 0.4)
    .option("--note <note>", "Free-form note")
    .option("--force-overwrite", "Bypass auto-versioning and overwrite the existing slot file in place. Default: archive existing to <slot>.v{N}.mp3.")
    .action(async (opts) => {
      await ensureProject(opts.project);
      opts.slot = normalizeSlot(opts.slot);
      if (maybeEnqueue(opts, "generate.sfx", opts.project)) return;
      const result = await generateSfx({
        projectId: opts.project,
        slot: opts.slot,
        prompt: opts.prompt,
        durationSec: opts.duration,
        promptInfluence: opts.promptInfluence,
        note: opts.note,
        overwrite: opts.forceOverwrite,
      });
      const manifest = await readManifest(opts.project);
      manifest.slots[opts.slot] = {
        kind: "sfx",
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

  QUEUE_FLAGS(sfxCmd);

  // ── captions ────────────────────────────────────────────────────────────
  cmd
    .command("captions")
    .description("Transcribe audio to Caption[] (≤25MB). Default backend: ElevenLabs Scribe v1 (word-level).")
    .requiredOption("--project <id>", "Project ID")
    .requiredOption("--audio <path>", "Audio file (mp3/m4a/wav, ≤25MB)")
    .option("--slot <slot>", "Slot id (default: derived from audio filename)")
    .option("--language <lang>", "Audio language: ru | en | auto", "ru")
    .option("--backend <backend>", "elevenlabs | openrouter | gemini", "elevenlabs")
    .option("--output <path>", "Custom output path. Default: workspace/projects/<id>/assets/captions/<slot>.json. Legacy default (captions.json at project root) is still written when --legacy-output is passed for back-compat.")
    .option("--legacy-output", "Write to the legacy shared captions.json instead of assets/captions/<slot>.json. Pre-2026-05 behavior; only use for scripts that grep the old path.")
    .option("--note <note>", "Free-form note")
    .action(async (opts) => {
      await ensureProject(opts.project);
      const audioPath = path.resolve(opts.audio);
      const slot = normalizeSlot(opts.slot ?? `captions-${path.basename(audioPath, path.extname(audioPath))}`);
      const backend = opts.backend as TranscribeBackend;
      const t0 = Date.now();
      const result = await transcribe({ audioPath, language: opts.language, backend });
      // Per-slot output (noski + venom postmortems: shared captions.json was
      // clobbered between calls, forcing manual `cp captions.json assets/audio/<slot>.json`).
      // Default → assets/captions/<slot>.json. --output overrides; --legacy-output forces old path.
      const outPath = opts.output
        ? path.resolve(opts.output)
        : opts.legacyOutput
          ? path.join(projectsDir(), opts.project, "captions.json")
          : path.join(projectsDir(), opts.project, "assets", "captions", `${slot}.json`);
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, JSON.stringify(result.captions, null, 2), "utf8");

      await logGeneration(opts.project, {
        provider: result.backend === "elevenlabs" ? "elevenlabs" : "openrouter",
        endpoint: result.model,
        kind: "text",
        slot,
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
