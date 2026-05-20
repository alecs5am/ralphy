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
import { raiseError } from "../lib/errors/index.js";
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
  getOrCatalogSync,
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
    raiseError("E_NOT_FOUND", { kind: "Project", id: projectId });
  }
}

/**
 * Attach the shared `--no-ref-consent` flag (04.02.03) to a generate
 * subcommand. The flag is an *explicit user override* of the reference-required
 * gate (AGENTS invariant #3). When passed:
 *   • The CLI does NOT itself refuse; the agent / playbook is the gate.
 *   • The override is recorded to `user-prompts.jsonl` as
 *     `stage: "no-ref-consent"` so future sessions can see that the user
 *     deliberately accepted the quality hit.
 */
/**
 * `--no-ref-consent <reason>` (04.02.03) is the explicit user override of the
 * reference-required gate (AGENTS invariant #3). The CLI itself does NOT
 * refuse — the agent / playbook is the gate. When the user passes the flag we
 * append `stage: "no-ref-consent"` to `user-prompts.jsonl` so subsequent
 * sessions can see that the user deliberately accepted the quality hit.
 *
 * Commander note: `--no-X <val>` parses to `opts.refConsent = <val>` (string)
 * when passed and `opts.refConsent = true` (the default-inverted boolean)
 * when omitted. Read through `readRefConsentReason()` to normalize.
 */
function readRefConsentReason(opts: { refConsent?: unknown }): string | null {
  const v = opts.refConsent;
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

async function maybeLogNoRefConsent(opts: { project?: string; refConsent?: unknown; slot?: string }): Promise<void> {
  const reason = readRefConsentReason(opts);
  if (!reason) return;
  if (!opts.project) return;
  await logUserPrompt(opts.project, {
    stage: "no-ref-consent",
    text: reason,
    note: opts.slot ? `slot=${opts.slot}` : undefined,
  });
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
    raiseError("E_INPUT_INVALID", {
      field: "slot",
      detail: `'${slot}' contains characters outside [a-zA-Z0-9_-]`,
      verb: "generate",
    });
  }
  const canonical = slot.toLowerCase().replace(/_/g, "-");
  if (canonical !== slot) {
    // eslint-disable-next-line no-console
    console.error(
      `ralphy: slot normalized: "${slot}" → "${canonical}" (canonical form is lowercase kebab-case)`,
    );
  }
  if (!SLOT_REGEX_CANONICAL.test(canonical)) {
    raiseError("E_INPUT_INVALID", {
      field: "slot",
      detail: `'${slot}' could not normalize to canonical kebab-case`,
      verb: "generate",
    });
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
    .option("--variants <n>", "Generate N parallel variants (writes <slot>-v1.png .. <slot>-vN.png). Useful for A/B exploration without re-typing the prompt. appstore postmortem ate ~20 min hand-suffixing this.", (v) => Math.max(1, Math.min(8, parseInt(v, 10) || 1)))
    .option("--force-overwrite", "Bypass auto-versioning and overwrite the existing slot file in place. Default: archive existing to <slot>.v{N}.png.")
    .option("--no-ref-consent <reason>", "Explicit user override of the reference-required gate (AGENTS invariant #3). Logs `stage: \"no-ref-consent\"` with the reason to user-prompts.jsonl.")
    .option("--dry-run", "Print resolved request + cost estimate; do not submit (01.02.05)", false)
    .option("--summary", "Per-stage rollup for dry-run (no-op for single-step verbs)", false)
    .action(async (opts) => {
      await ensureProject(opts.project);
      opts.slot = normalizeSlot(opts.slot);
      await maybeLogNoRefConsent(opts);
      if (maybeEnqueue(opts, "generate.image", opts.project)) return;

      const variants = opts.variants ?? 1;

      if (opts.dryRun) {
        // Single-step verb — `--summary` is a no-op accepted for shell-script
        // consistency (per 01-D-06).
        const resolvedModel = resolveModelAlias(opts.model);
        const estPerCall = 0.04;  // gpt-5.4-image-2 nominal; precise estimate post-launch (01.11.x).
        out({
          dryRun: true,
          would_call: [
            {
              stage: "image",
              model_id: resolvedModel,
              slot: opts.slot,
              variants,
              est_usd: estPerCall * variants,
            },
          ],
          cost_estimate_usd: estPerCall * variants,
          would_write: [
            variants > 1
              ? `workspace/projects/${opts.project}/assets/${opts.slot}-v{1..${variants}}.png`
              : `workspace/projects/${opts.project}/assets/${opts.slot}.png`,
          ],
        });
        return;
      }
      if (variants > 1) {
        // Parallel fire — N independent gens, each into its own slot. Honors the
        // OR per-key concurrent cap (gpt-5.4-image-2 = 1) by serializing if the
        // model is known-capped; gemini-3-pro-image-preview tolerates ≥4 parallel.
        const resolvedModel = resolveModelAlias(opts.model);
        const isCapped = resolvedModel === "openai/gpt-5.4-image-2";
        const runOne = async (i: number) => {
          const variantSlot = `${opts.slot}-v${i + 1}`;
          const r = await generateImage({
            projectId: opts.project,
            slot: variantSlot,
            prompt: opts.prompt,
            model: resolvedModel,
            refs: opts.ref,
            size: opts.size,
            negativePrompt: opts.negative,
            note: `${opts.note ?? ""} (variant ${i + 1}/${variants})`.trim(),
            overwrite: opts.forceOverwrite,
          });
          return { slot: variantSlot, ...r };
        };
        const results: Array<{ slot: string; localPath: string; model: string; costUsd: number; latencyMs: number; url?: string }> = [];
        if (isCapped) {
          // Serialize to respect the cap-of-1.
          for (let i = 0; i < variants; i++) results.push(await runOne(i));
        } else {
          const fired = await Promise.all(Array.from({ length: variants }, (_, i) => runOne(i)));
          results.push(...fired);
        }
        const manifest = await readManifest(opts.project);
        for (const r of results) {
          manifest.slots[r.slot] = {
            kind: "image",
            path: r.localPath,
            model: r.model,
            costUsd: r.costUsd,
            url: r.url,
            generatedAt: new Date().toISOString(),
          };
        }
        await writeManifest(opts.project, manifest);
        out({ variants: results.length, totalCostUsd: results.reduce((s, r) => s + r.costUsd, 0), slots: results.map((r) => ({ slot: r.slot, path: r.localPath, model: r.model, costUsd: r.costUsd })) });
        return;
      }

      const ui = await import("../lib/ui.js");
      const resolvedModel = resolveModelAlias(opts.model);
      const result = await ui.withSpinner(
        `image (${resolvedModel}) → ${opts.slot}`,
        () =>
          generateImage({
            projectId: opts.project,
            slot: opts.slot,
            prompt: opts.prompt,
            model: resolvedModel,
            refs: opts.ref,
            size: opts.size,
            negativePrompt: opts.negative,
            note: opts.note,
            overwrite: opts.forceOverwrite,
          }),
        {
          successText: (r) => `image ${ui.c.cmd(opts.slot)} → ${ui.c.path(r.localPath)} ${ui.c.muted(`($${r.costUsd.toFixed(3)}, ${(r.latencyMs / 1000).toFixed(1)}s)`)}`,
          failText: (e) => `image ${ui.c.cmd(opts.slot)} failed: ${(e as Error).message?.slice(0, 200)}`,
        },
      );
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
    .option("--summary", "Per-stage rollup for dry-run (no-op for single-step verbs)", false)
    .option(
      "--no-validate",
      "Skip the per-model `supported_*` validation against OR catalog (force-submit)"
    )
    .option("--note <note>", "Free-form note")
    .option("--force-overwrite", "Bypass auto-versioning and overwrite the existing slot file in place. Default: archive existing to <slot>.v{N}.mp4.")
    .option("--no-ref-consent <reason>", "Explicit user override of the reference-required gate (AGENTS invariant #3). Logs `stage: \"no-ref-consent\"` with the reason to user-prompts.jsonl.")
    .action(async (opts) => {
      await ensureProject(opts.project);
      opts.slot = normalizeSlot(opts.slot);
      await maybeLogNoRefConsent(opts);
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
            raiseError("E_VALIDATION_FAILED", {
              target: opts.model,
              detail: lines.join(" | ") + " (use --no-validate to override)",
            });
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

      const uiv = await import("../lib/ui.js");
      const { CommandStream } = await import("../lib/stream/command.js");
      const cs = new CommandStream();
      const resolvedVideoModel = resolveModelAlias(opts.model);
      cs.event("generate-video-started", {
        slot: opts.slot,
        model: resolvedVideoModel,
        durationSec: opts.duration,
        aspectRatio: opts.aspectRatio,
      });
      const result = await uiv.withSpinner(
        `video (${resolvedVideoModel}, ${opts.duration}s, ${opts.aspectRatio || "9:16"}) → ${opts.slot}`,
        () =>
          generateVideo({
            projectId: opts.project,
            slot: opts.slot,
            prompt: opts.prompt,
            durationSec: opts.duration,
            model: resolvedVideoModel,
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
          }),
        {
          successText: (r) => `video ${uiv.c.cmd(opts.slot)} → ${uiv.c.path(r.localPath)} ${uiv.c.muted(`($${r.costUsd.toFixed(2)}, ${(r.latencyMs / 1000).toFixed(0)}s)`)}`,
          failText: (e) => `video ${uiv.c.cmd(opts.slot)} failed: ${(e as Error).message?.slice(0, 200)}`,
        },
      );
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
      cs.event("generate-video-finished", {
        slot: opts.slot,
        path: result.localPath,
        costUsd: result.costUsd,
      });
      cs.summary({
        slot: opts.slot,
        path: result.localPath,
        model: result.model,
        durationSec: opts.duration,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
      });
    });

  QUEUE_FLAGS(videoCmd);

  // Per-model whitelist appended to `--help` output (01.03.03). Reads the
  // cached OR catalog synchronously. `--model <id>` narrows to a single row.
  videoCmd.addHelpText("after", () => {
    const cat = getOrCatalogSync();
    if (!cat || cat.videoModels.length === 0) {
      return "\nPer-model whitelist: (run `ralphy models list` once to populate the cache)\n";
    }
    // Extract --model filter from argv since help-text callbacks don't see opts.
    let filter: string | null = null;
    const argv = process.argv;
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === "--model" && argv[i + 1]) {
        filter = argv[i + 1]!;
        break;
      }
    }
    const rows = filter
      ? cat.videoModels.filter((m) => m.id === filter)
      : cat.videoModels;
    if (rows.length === 0) {
      return `\nPer-model whitelist: no models match --model ${filter}\n`;
    }
    const lines: string[] = ["", "Per-model whitelist (from cached OpenRouter catalog):"];
    for (const m of rows) {
      lines.push(`  ${m.id}`);
      if (m.supported_durations?.length) lines.push(`    durations:      ${m.supported_durations.join(", ")}s`);
      if (m.supported_resolutions?.length) lines.push(`    resolutions:    ${m.supported_resolutions.join(", ")}`);
      if (m.supported_aspect_ratios?.length) lines.push(`    aspect_ratios:  ${m.supported_aspect_ratios.join(", ")}`);
      if (m.supported_frame_images?.length) lines.push(`    frame_images:   ${m.supported_frame_images.join(", ")}`);
    }
    lines.push("");
    return lines.join("\n");
  });

  // ── voiceover ───────────────────────────────────────────────────────────
  const voCmd = cmd
    .command("voiceover")
    .description("Generate voiceover via ElevenLabs (default: eleven_multilingual_v2)")
    .requiredOption("--project <id>", "Project ID")
    .requiredOption("--slot <slot>", "Asset slot id (e.g. scene-01-vo)")
    .requiredOption("--voice <voiceId>", "ElevenLabs voice id (clone or library)")
    .requiredOption("--text <text>", "VO text (RU or EN)")
    .option("--model <model>", "ElevenLabs TTS model id", "eleven_multilingual_v2")
    .option("--stability <n>", "Voice stability 0-1 (lower = more variation, useful for emotional / cinematic deliveries; higher = monotone, useful for analog-horror PSA / robo-narrator). Default 0.55.", (v) => parseFloat(v))
    .option("--similarity-boost <n>", "Similarity-to-source 0-1 (higher = closer to the cloned voice; lower = more interpretation). Default 0.8.", (v) => parseFloat(v))
    .option("--style <n>", "Style amplification 0-1 (0 = monotone broadcast register, 1 = full dramatic). Default 0.25. Analog-horror postmortem: style 0 with stability ~0.5 produced the cold-robo-female PSA register.", (v) => parseFloat(v))
    .option("--no-speaker-boost", "Disable use_speaker_boost (default on; turn off for monotone broadcast / robo registers)")
    .option("--note <note>", "Free-form note")
    .option("--force-overwrite", "Bypass auto-versioning and overwrite the existing slot file in place. Default: archive existing to <slot>.v{N}.mp3.")
    .option("--no-ref-consent <reason>", "Explicit user override of the reference-required gate (AGENTS invariant #3). Logs `stage: \"no-ref-consent\"` with the reason to user-prompts.jsonl.")
    .option("--dry-run", "Print resolved request + cost estimate; do not submit", false)
    .option("--summary", "Per-stage rollup for dry-run (no-op for single-step verbs)", false)
    .action(async (opts) => {
      await ensureProject(opts.project);
      opts.slot = normalizeSlot(opts.slot);
      await maybeLogNoRefConsent(opts);
      if (maybeEnqueue(opts, "generate.voiceover", opts.project)) return;

      if (opts.dryRun) {
        const chars = (opts.text || "").length;
        // ElevenLabs multilingual_v2 charges per-character; nominal $0.30/1k chars.
        const estUsd = (chars / 1000) * 0.3;
        out({
          dryRun: true,
          would_call: [
            { stage: "voiceover", model_id: opts.model, slot: opts.slot, voice: opts.voice, characters: chars, est_usd: estUsd },
          ],
          cost_estimate_usd: estUsd,
          would_write: [`workspace/projects/${opts.project}/assets/${opts.slot}.mp3`],
        });
        return;
      }

      const voiceSettings: Record<string, unknown> = {};
      if (opts.stability !== undefined) voiceSettings.stability = opts.stability;
      if (opts.similarityBoost !== undefined) voiceSettings.similarity_boost = opts.similarityBoost;
      if (opts.style !== undefined) voiceSettings.style = opts.style;
      if (opts.speakerBoost === false) voiceSettings.use_speaker_boost = false;
      const uivo = await import("../lib/ui.js");
      const result = await uivo.withSpinner(
        `voiceover (${opts.model}, voice ${opts.voice}) → ${opts.slot}`,
        () =>
          generateVoiceover({
            projectId: opts.project,
            slot: opts.slot,
            voiceId: opts.voice,
            text: opts.text,
            modelId: opts.model,
            voiceSettings: Object.keys(voiceSettings).length > 0 ? (voiceSettings as any) : undefined,
            note: opts.note,
            overwrite: opts.forceOverwrite,
          }),
        {
          successText: (r) => `voiceover ${uivo.c.cmd(opts.slot)} → ${uivo.c.path(r.localPath)} ${uivo.c.muted(`(${(r.latencyMs / 1000).toFixed(1)}s)`)}`,
          failText: (e) => `voiceover ${uivo.c.cmd(opts.slot)} failed: ${(e as Error).message?.slice(0, 200)}`,
        },
      );
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
    .option("--no-ref-consent <reason>", "Explicit user override of the reference-required gate (AGENTS invariant #3). Logs `stage: \"no-ref-consent\"` with the reason to user-prompts.jsonl.")
    .option("--dry-run", "Print resolved request + cost estimate; do not submit", false)
    .option("--summary", "Per-stage rollup for dry-run (no-op for single-step verbs)", false)
    .action(async (opts) => {
      await ensureProject(opts.project);
      opts.slot = normalizeSlot(opts.slot);
      await maybeLogNoRefConsent(opts);
      if (maybeEnqueue(opts, "generate.music", opts.project)) return;

      if (opts.dryRun) {
        // ElevenLabs Music charges per second of generated audio; nominal $0.005/s.
        const estUsd = (opts.duration || 0) * 0.005;
        out({
          dryRun: true,
          would_call: [
            { stage: "music", slot: opts.slot, durationSec: opts.duration, instrumental: !opts.withVocals, est_usd: estUsd },
          ],
          cost_estimate_usd: estUsd,
          would_write: [`workspace/projects/${opts.project}/assets/${opts.slot}.mp3`],
        });
        return;
      }

      const uim = await import("../lib/ui.js");
      const { CommandStream } = await import("../lib/stream/command.js");
      const cs = new CommandStream();
      cs.event("generate-music-started", { slot: opts.slot, durationSec: opts.duration });
      const result = await uim.withSpinner(
        `music (${opts.duration}s${opts.withVocals ? "" : ", instrumental"}) → ${opts.slot}`,
        () =>
          generateMusic({
            projectId: opts.project,
            slot: opts.slot,
            prompt: opts.prompt,
            durationSec: opts.duration,
            forceInstrumental: !opts.withVocals,
            note: opts.note,
            overwrite: opts.forceOverwrite,
          }),
        {
          successText: (r) => `music ${uim.c.cmd(opts.slot)} → ${uim.c.path(r.localPath)} ${uim.c.muted(`(${(r.latencyMs / 1000).toFixed(1)}s)`)}`,
          failText: (e) => `music ${uim.c.cmd(opts.slot)} failed: ${(e as Error).message?.slice(0, 200)}`,
        },
      );
      const manifest = await readManifest(opts.project);
      manifest.slots[opts.slot] = {
        kind: "music",
        path: result.localPath,
        model: result.model,
        costUsd: result.costUsd,
        generatedAt: new Date().toISOString(),
      };
      await writeManifest(opts.project, manifest);
      cs.event("generate-music-finished", { slot: opts.slot, path: result.localPath });
      cs.summary({
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
    .option("--no-ref-consent <reason>", "Explicit user override of the reference-required gate (AGENTS invariant #3). Logs `stage: \"no-ref-consent\"` with the reason to user-prompts.jsonl.")
    .action(async (opts) => {
      await ensureProject(opts.project);
      opts.slot = normalizeSlot(opts.slot);
      await maybeLogNoRefConsent(opts);
      if (maybeEnqueue(opts, "generate.sfx", opts.project)) return;
      const uisfx = await import("../lib/ui.js");
      const result = await uisfx.withSpinner(
        `sfx (${opts.duration}s) → ${opts.slot}`,
        () =>
          generateSfx({
            projectId: opts.project,
            slot: opts.slot,
            prompt: opts.prompt,
            durationSec: opts.duration,
            promptInfluence: opts.promptInfluence,
            note: opts.note,
            overwrite: opts.forceOverwrite,
          }),
        {
          successText: (r) => `sfx ${uisfx.c.cmd(opts.slot)} → ${uisfx.c.path(r.localPath)} ${uisfx.c.muted(`(${(r.latencyMs / 1000).toFixed(1)}s)`)}`,
          failText: (e) => `sfx ${uisfx.c.cmd(opts.slot)} failed: ${(e as Error).message?.slice(0, 200)}`,
        },
      );
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
