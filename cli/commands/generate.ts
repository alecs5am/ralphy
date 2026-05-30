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
import { out } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { transcribe, type TranscribeBackend } from "../lib/transcribe.js";
import {
  type BrandSpellingDict,
  mergeBrandSpelling,
  applyBrandSpellingToCaptions,
  resolveSafeZone,
  type SafeZone,
  wrapCaptionText,
  captionsToSrt,
  captionsToDrawtextFilter,
} from "../lib/captions/helpers.js";
import { protectExistingAsset } from "../lib/providers/shared.js";
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
import { resolveConnector } from "../lib/providers/registry.js";
import { naturalSizeFor } from "../lib/providers/openrouter.js";
import { TerminalProviderError } from "../lib/providers/shared.js";
import {
  lintMusicPrompt,
  formatMusicPromptLintReport,
  submitMusicWithToSAutoRetry,
} from "../lib/music-prompt-lint.js";
import {
  intakePath,
  readPromptOrFile,
  readRefsOrFile,
} from "../lib/path-resolution.js";

/**
 * Resolve --size / --aspect on the image command. #051: --aspect always wins
 * when passed (it's the friendlier path that knows the model's natural grid);
 * --size is kept as the legacy back-compat path. Returns the WxH string to
 * forward to the connector.
 */
function resolveImageSize(opts: {
  model: string | undefined;
  size?: string;
  aspect?: string;
}): string {
  if (!opts.model) return opts.size ?? "1080x1920";
  const fallback = opts.size ?? "1080x1920";
  if (!opts.aspect) return fallback;
  const natural = naturalSizeFor(opts.model, opts.aspect);
  if (natural) return natural;
  // Aspect was passed but the model isn't in the table — synthesize WxH from
  // the ratio so the downstream sizeToAspectRatio() still maps it correctly.
  const m = opts.aspect.match(/^(\d+)\s*:\s*(\d+)$/);
  if (m) {
    const w = parseInt(m[1]!, 10);
    const h = parseInt(m[2]!, 10);
    if (w > 0 && h > 0) return `${1024 * w / Math.max(w, h) | 0}x${1024 * h / Math.max(w, h) | 0}`;
  }
  return fallback;
}

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
      kind: "image" | "video" | "voiceover" | "music" | "captions" | "sfx";
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
 * Best-effort sanitize an arbitrary string into the canonical kebab-case form.
 * Used for the "did you mean ..." hint surfaced from the hard-reject branch:
 *   1. lowercase
 *   2. unicode → ASCII fold (drops accents)
 *   3. spaces, dots, slashes, underscores → `-`
 *   4. strip anything still outside `[a-z0-9-]`
 *   5. collapse runs of `-`, trim leading/trailing `-`
 *   6. strip a leading run of digits (canonical form must start with [a-z])
 * Returns null if the result would be empty (no useful suggestion possible).
 */
function suggestSlot(slot: string): string | null {
  const ascii = slot
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, ""); // drop combining accents
  const collapsed = ascii
    .replace(/[\s._/\\]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[0-9]+(?:-|$)/, ""); // canonical form must start with [a-z]
  return collapsed.length > 0 ? collapsed : null;
}

/**
 * Validate and normalize a slot id. Strict canonical form is `[a-z0-9-]+` —
 * lowercase kebab-case. Relaxed input accepts `[a-zA-Z0-9_-]+` and auto-normalizes:
 *   uppercase → lowercase, `_` → `-`, then revalidate against canonical.
 * Emits a stderr warning when normalization happened so the caller learns the
 * canonical form for next time.
 *
 * Returns the canonical slug. Throws via `raiseError()` if input contains
 * characters outside the relaxed set (spaces, dots, slashes, unicode, etc.) or
 * starts with a digit — those are structural mistakes that auto-normalize
 * can't safely recover from. The error detail lists the valid character set
 * AND a "did you mean ..." sanitized suggestion when one exists, so the
 * caller can retry without guessing the canonical form.
 */
export function normalizeSlot(slot: string): string {
  const validChars = "[a-z0-9-], canonical form is lowercase kebab-case (e.g. 'scene-01-bg-image')";
  if (!SLOT_REGEX_RELAXED.test(slot)) {
    const suggestion = suggestSlot(slot);
    raiseError("E_INPUT_INVALID", {
      field: "slot",
      detail: `'${slot}' contains characters outside ${validChars}${suggestion ? ` — did you mean '${suggestion}'?` : ""}`,
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
    const suggestion = suggestSlot(slot);
    raiseError("E_INPUT_INVALID", {
      field: "slot",
      detail: `'${slot}' could not normalize to canonical kebab-case (valid chars: ${validChars})${suggestion && suggestion !== canonical ? ` — did you mean '${suggestion}'?` : ""}`,
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
    .description("Generate one image via OpenRouter (default: google/gemini-3-pro-image-preview — nano-banana-pro, multi-ref consistency, ≥4 concurrent). Pass --model openai/gpt-5.4-image-2 when label typography matters more than ref consistency.")
    .requiredOption("--project <id>", "Project ID")
    .requiredOption("--slot <slot>", "Asset slot id (e.g. scene-01-bg-image)")
    .option("--prompt <prompt>", "Text prompt — see docs/prompts/image/ for mode-specific master templates")
    .option("--prompt-file <path>", "Read the prompt from a file (#025). Symmetric with --prompt; inline wins when both are passed. Path resolves project-relative when --project is set.")
    .option("--model <model>", "OpenRouter model id (default google/gemini-3-pro-image-preview, the nano-banana-pro lineage; switch to openai/gpt-5.4-image-2 for premium typography on labels)", "google/gemini-3-pro-image-preview")
    .option("--provider <id>", "Provider connector to use (e.g. openrouter). Default: first available provider that supports image. See `ralphy provider list`.")
    .option(
      "--ref <ref...>",
      "Reference image(s) for multi-ref consistency. URL / local path / data: URI; local paths auto-converted to data: URI. Path-only refs resolve cwd-first, then `workspace/projects/<id>/` and `workspace/projects/<id>/refs/` (#025). NBSP / zero-width whitespace in macOS screenshot paths is auto-normalized with a stderr warning.",
    )
    .option(
      "--ref-file <path>",
      "Read newline-separated ref paths from a file. Concatenated with inline --ref entries. Blank lines + `#` comments ignored. Symmetric with --ref (#025).",
    )
    .option(
      "--size <size>",
      "Size hint (passed to model as prompt-level guidance; gemini/gpt image models do not accept exact pixel dimensions and will round to their natural sizes). When --size doesn't match the model's natural grid, a warning is emitted to stderr at submit time (#051).",
      "1080x1920",
    )
    .option(
      "--aspect <aspect>",
      "Aspect-ratio alias (9:16 | 16:9 | 1:1 | 3:4 | 4:3 | 2:3 | 3:2). Resolves to the chosen model's natural pixel grid (e.g. 9:16 on gpt-5.4-image-2 → 1024x1536, on gemini-3-pro-image-preview → 768x1376). Wins over --size when both are passed. #051",
    )
    .option("--negative <prompt>", "Negative prompt")
    .option("--note <note>", "Free-form note for generations.jsonl")
    .option("--variants <n>", "Generate N parallel variants (writes <slot>-v1.png .. <slot>-vN.png). Useful for A/B exploration without re-typing the prompt. appstore postmortem ate ~20 min hand-suffixing this.", (v) => Math.max(1, Math.min(8, parseInt(v, 10) || 1)))
    .option("--force-overwrite", "Bypass auto-versioning and overwrite the existing slot file in place. Default: archive existing to <slot>.v{N}.png.")
    .option("--no-ref-consent <reason>", "Explicit user override of the reference-required gate (AGENTS invariant #3). Logs `stage: \"no-ref-consent\"` with the reason to user-prompts.jsonl.")
    .option("--no-retry", "Bypass the transient-error retry loop (#005). Default: 2 retries with 1s/4s/16s exponential backoff on TLS / ECONNRESET / 5xx / skeleton-null payloads. Use for tests / debugging where you want the first response no matter what.")
    .option("--dry-run", "Print resolved request + cost estimate; do not submit (01.02.05)", false)
    .option("--summary", "Per-stage rollup for dry-run (no-op for single-step verbs)", false)
    .action(async (opts) => {
      await ensureProject(opts.project);
      opts.slot = normalizeSlot(opts.slot);
      await maybeLogNoRefConsent(opts);
      if (maybeEnqueue(opts, "generate.image", opts.project)) return;

      // #025: project-relative + NBSP-safe path intake. Mutate opts so the
      // dry-run branch + the live branch both see the resolved values.
      const promptResolved = await readPromptOrFile({
        prompt: opts.prompt,
        promptFile: opts.promptFile,
        projectId: opts.project,
      });
      if (!promptResolved) {
        raiseError("E_INPUT_INVALID", {
          field: "prompt",
          detail: "either --prompt <text> or --prompt-file <path> is required",
          verb: "generate image",
        });
      }
      opts.prompt = promptResolved!;
      opts.ref = await readRefsOrFile({
        refs: opts.ref,
        refFile: opts.refFile,
        projectId: opts.project,
      });

      const variants = opts.variants ?? 1;

      if (opts.dryRun) {
        // Single-step verb — `--summary` is a no-op accepted for shell-script
        // consistency (per 01-D-06).
        const resolvedModel = resolveModelAlias(opts.model);
        const estPerCall = 0.04;  // gemini-3-pro-image-preview nominal; precise estimate post-launch (01.11.x).
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
      const conn = resolveConnector("image", opts.provider);
      if (variants > 1) {
        // Parallel fire — N independent gens, each into its own slot. Honors the
        // OR per-key concurrent cap (gpt-5.4-image-2 = 1) by serializing if the
        // model is known-capped; gemini-3-pro-image-preview tolerates ≥4 parallel.
        const resolvedModel = resolveModelAlias(opts.model);
        const resolvedSize = resolveImageSize({ model: resolvedModel, size: opts.size, aspect: opts.aspect });
        const isCapped = resolvedModel === "openai/gpt-5.4-image-2";
        const runOne = async (i: number) => {
          const variantSlot = `${opts.slot}-v${i + 1}`;
          const r = await conn.generateImage!({
            projectId: opts.project,
            slot: variantSlot,
            prompt: opts.prompt,
            model: resolvedModel,
            refs: opts.ref,
            size: resolvedSize,
            negativePrompt: opts.negative,
            note: `${opts.note ?? ""} (variant ${i + 1}/${variants})`.trim(),
            overwrite: opts.forceOverwrite,
            noRetry: opts.retry === false,
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
      const resolvedSize = resolveImageSize({ model: resolvedModel, size: opts.size, aspect: opts.aspect });
      const result = await ui.withSpinner(
        `image (${resolvedModel}) → ${opts.slot}`,
        () =>
          conn.generateImage!({
            projectId: opts.project,
            slot: opts.slot,
            prompt: opts.prompt,
            model: resolvedModel,
            refs: opts.ref,
            size: resolvedSize,
            negativePrompt: opts.negative,
            note: opts.note,
            overwrite: opts.forceOverwrite,
            noRetry: opts.retry === false,
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
    .option("--prompt <prompt>", "Motion / camera description")
    .option("--prompt-file <path>", "Read the prompt from a file (#025). Symmetric with --prompt; inline wins when both are passed.")
    .requiredOption("--duration <seconds>", "Duration in seconds. Per-model `supported_durations` may be discrete (e.g. hailuo only 6/10) — see `ralphy models show <id>`", parseFloat)
    .option("--model <model>", "OpenRouter model id", "kwaivgi/kling-v3.0-pro")
    .option("--provider <id>", "Provider connector to use (e.g. openrouter). Default: first available provider that supports video. See `ralphy provider list`.")
    .option(
      "--first-frame <ref>",
      "First-frame anchor for i2v (URL / local path / data: URI). Path-only refs resolve cwd-first, then workspace/projects/<id>/ + refs/ (#025).",
    )
    .option(
      "--last-frame <ref>",
      "Last-frame anchor (URL / local path / data: URI). Only models with `supported_frame_images: ['first_frame','last_frame']` accept this — see `ralphy models show <id>`. Same path resolution as --first-frame (#025).",
    )
    .option("--image <ref>", "Alias for --first-frame (back-compat). Same path resolution (#025).")
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
    .option("--audio", "Enable model-native audio. veo-3.1 default; kling-v3.0-pro + seedance-2.0 also support it (SPEECH: kling EN only, seedance unvalidated; AMBIENT/SFX: any). See MODELS.md `--audio` policy section.", false)
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
    .option("--no-retry", "Bypass the transient-error retry loop (#005). Default: 2 retries with 1s/4s/16s exponential backoff on TLS / ECONNRESET / 5xx / skeleton-null payloads. Wraps the initial videos-submit POST; the poll loop has its own budget.")
    .action(async (opts) => {
      await ensureProject(opts.project);
      opts.slot = normalizeSlot(opts.slot);
      await maybeLogNoRefConsent(opts);
      if (maybeEnqueue(opts, "generate.video", opts.project)) return;

      // #025: --prompt / --prompt-file symmetry + path intake for the
      // three i2v anchors. Mutate opts so dry-run + live both see resolved.
      const videoPrompt = await readPromptOrFile({
        prompt: opts.prompt,
        promptFile: opts.promptFile,
        projectId: opts.project,
      });
      if (!videoPrompt) {
        raiseError("E_INPUT_INVALID", {
          field: "prompt",
          detail: "either --prompt <text> or --prompt-file <path> is required",
          verb: "generate video",
        });
      }
      opts.prompt = videoPrompt!;
      if (opts.firstFrame) opts.firstFrame = intakePath(opts.firstFrame, opts.project, "first-frame");
      if (opts.lastFrame) opts.lastFrame = intakePath(opts.lastFrame, opts.project, "last-frame");
      if (opts.image) opts.image = intakePath(opts.image, opts.project, "image");

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

      const connV = resolveConnector("video", opts.provider);
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
          connV.generateVideo!({
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
            noRetry: opts.retry === false,
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
    .option("--text <text>", "VO text (RU or EN)")
    .option("--text-file <path>", "Read VO text from a file (#025). Symmetric with --text; inline wins when both are passed.")
    .option("--model <model>", "ElevenLabs TTS model id", "eleven_multilingual_v2")
    .option("--provider <id>", "Provider connector to use (e.g. elevenlabs). Default: first available provider that supports voice. See `ralphy provider list`.")
    .option("--stability <n>", "Voice stability 0-1 (lower = more variation, useful for emotional / cinematic deliveries; higher = monotone, useful for analog-horror PSA / robo-narrator). Default 0.55.", (v) => parseFloat(v))
    .option("--similarity-boost <n>", "Similarity-to-source 0-1 (higher = closer to the cloned voice; lower = more interpretation). Default 0.8.", (v) => parseFloat(v))
    .option("--style <n>", "Style amplification 0-1 (0 = monotone broadcast register, 1 = full dramatic). Default 0.25. Analog-horror postmortem: style 0 with stability ~0.5 produced the cold-robo-female PSA register.", (v) => parseFloat(v))
    .option("--speed <n>", "Playback speed 0-2 (1.0 = natural, <0.7 sludgy, >1.3 chipmunky). Default 1.0. Forwarded to voice_settings.speed (#030).", (v) => parseFloat(v))
    .option("--no-speaker-boost", "Disable use_speaker_boost (default on; turn off for monotone broadcast / robo registers)")
    .option("--note <note>", "Free-form note")
    .option("--force-overwrite", "Bypass auto-versioning and overwrite the existing slot file in place. Default: archive existing to <slot>.v{N}.mp3.")
    .option("--no-ref-consent <reason>", "Explicit user override of the reference-required gate (AGENTS invariant #3). Logs `stage: \"no-ref-consent\"` with the reason to user-prompts.jsonl.")
    .option("--no-retry", "Bypass the transient-error retry loop (#005). Default: 2 retries with 1s/4s/16s exponential backoff on TLS / ECONNRESET / 5xx.")
    .option("--dry-run", "Print resolved request + cost estimate; do not submit", false)
    .option("--summary", "Per-stage rollup for dry-run (no-op for single-step verbs)", false)
    .action(async (opts) => {
      await ensureProject(opts.project);
      opts.slot = normalizeSlot(opts.slot);
      await maybeLogNoRefConsent(opts);
      if (maybeEnqueue(opts, "generate.voiceover", opts.project)) return;

      // #025: --text / --text-file symmetry. readPromptOrFile maps "prompt" →
      // text since the helper is shape-agnostic; we just rename at the call.
      const voText = await readPromptOrFile({
        prompt: opts.text,
        promptFile: opts.textFile,
        projectId: opts.project,
      });
      if (!voText) {
        raiseError("E_INPUT_INVALID", {
          field: "text",
          detail: "either --text <text> or --text-file <path> is required",
          verb: "generate voiceover",
        });
      }
      opts.text = voText!;

      if (opts.dryRun) {
        const chars = (opts.text || "").length;
        // #030: route the dry-run estimate through the same pricing module
        // the live call uses, so dry-run and post-call cost match.
        const { voiceoverCostUsd } = await import("../lib/providers/voice-pricing.js");
        const estUsd = voiceoverCostUsd(chars, opts.model);
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

      // #030: range-validate the voice_settings sliders. ElevenLabs accepts
      // 0..1 for stability / similarity_boost / style and 0..2 for speed. We
      // fail-fast here rather than letting the API return a cryptic 422 mid-
      // batch — the CLI is the right place to catch a typo'd --style 1.5.
      const rangeCheck = (name: string, val: unknown, lo: number, hi: number) => {
        if (val === undefined) return;
        if (typeof val !== "number" || Number.isNaN(val) || val < lo || val > hi) {
          throw new Error(`--${name} must be a number in [${lo}, ${hi}], got: ${val}`);
        }
      };
      rangeCheck("stability", opts.stability, 0, 1);
      rangeCheck("similarity-boost", opts.similarityBoost, 0, 1);
      rangeCheck("style", opts.style, 0, 1);
      rangeCheck("speed", opts.speed, 0, 2);
      const voiceSettings: Record<string, unknown> = {};
      if (opts.stability !== undefined) voiceSettings.stability = opts.stability;
      if (opts.similarityBoost !== undefined) voiceSettings.similarity_boost = opts.similarityBoost;
      if (opts.style !== undefined) voiceSettings.style = opts.style;
      if (opts.speed !== undefined) voiceSettings.speed = opts.speed;
      if (opts.speakerBoost === false) voiceSettings.use_speaker_boost = false;
      const connVo = resolveConnector("voice", opts.provider);
      const uivo = await import("../lib/ui.js");
      const result = await uivo.withSpinner(
        `voiceover (${opts.model}, voice ${opts.voice}) → ${opts.slot}`,
        () =>
          connVo.generateVoiceover!({
            projectId: opts.project,
            slot: opts.slot,
            voiceId: opts.voice,
            text: opts.text,
            modelId: opts.model,
            voiceSettings: Object.keys(voiceSettings).length > 0 ? (voiceSettings as any) : undefined,
            note: opts.note,
            overwrite: opts.forceOverwrite,
            noRetry: opts.retry === false,
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
    .option("--prompt <prompt>", "Music description (genre, tempo, mood)")
    .option("--prompt-file <path>", "Read prompt from a file (#025). Symmetric with --prompt; inline wins when both are passed.")
    .requiredOption("--duration <seconds>", "Duration in seconds (3-600)", parseFloat)
    .option("--provider <id>", "Provider connector to use (e.g. elevenlabs). Default: first available provider that supports music. See `ralphy provider list`.")
    .option("--with-vocals", "Allow vocals (default: instrumental only)")
    .option("--note <note>", "Free-form note")
    .option("--force-overwrite", "Bypass auto-versioning and overwrite the existing slot file in place. Default: archive existing to <slot>.v{N}.mp3.")
    .option("--no-ref-consent <reason>", "Explicit user override of the reference-required gate (AGENTS invariant #3). Logs `stage: \"no-ref-consent\"` with the reason to user-prompts.jsonl.")
    .option("--no-retry", "Bypass the transient-error retry loop (#005). Default: 2 retries with 1s/4s/16s exponential backoff. 400 `bad_prompt` ToS rejections are terminal (not retried) — pass --auto-retry-on-tos-rejection for a one-shot resubmit using the provider's sanitized rewrite.")
    .option("--auto-retry-on-tos-rejection", "On a 400 `bad_prompt` ToS rejection that carries a `prompt_suggestion`, log the original failure and auto-resubmit ONCE using the provider's sanitized rewrite. Opt-in — the default still surfaces the rejection to the caller. #006", false)
    .option("--dry-run", "Print resolved request + cost estimate; do not submit", false)
    .option("--summary", "Per-stage rollup for dry-run (no-op for single-step verbs)", false)
    .action(async (opts) => {
      await ensureProject(opts.project);
      opts.slot = normalizeSlot(opts.slot);
      await maybeLogNoRefConsent(opts);
      if (maybeEnqueue(opts, "generate.music", opts.project)) return;

      // #025: --prompt / --prompt-file symmetry.
      const musicPrompt = await readPromptOrFile({
        prompt: opts.prompt,
        promptFile: opts.promptFile,
        projectId: opts.project,
      });
      if (!musicPrompt) {
        raiseError("E_INPUT_INVALID", {
          field: "prompt",
          detail: "either --prompt <text> or --prompt-file <path> is required",
          verb: "generate music",
        });
      }
      opts.prompt = musicPrompt!;

      // #006: soft pre-submit lint. Known artist / producer / track names
      // surface a warning + a generic alternative; we never block — the user
      // may have a clean phrasing the linter doesn't yet know about.
      const lintReport = formatMusicPromptLintReport(lintMusicPrompt(opts.prompt));
      if (lintReport) {
        // eslint-disable-next-line no-console
        console.error(lintReport);
      }

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

      const connM = resolveConnector("music", opts.provider);
      const uim = await import("../lib/ui.js");
      const { CommandStream } = await import("../lib/stream/command.js");
      const cs = new CommandStream();
      cs.event("generate-music-started", { slot: opts.slot, durationSec: opts.duration });

      // #006: when --auto-retry-on-tos-rejection is set, catch a 400 `bad_prompt`
      // ToS rejection that carries a `prompt_suggestion`, log the original
      // failure with `status: "error"` + `error: "tos_rejected: ..."`, then
      // resubmit ONCE using the provider's sanitized rewrite. The decision is
      // factored out into `submitMusicWithToSAutoRetry` (see
      // `cli/lib/music-prompt-lint.ts`) so unit tests can exercise it without
      // commander.
      const submit = async (prompt: string) =>
        connM.generateMusic!({
          projectId: opts.project,
          slot: opts.slot,
          prompt,
          durationSec: opts.duration,
          forceInstrumental: !opts.withVocals,
          note: opts.note,
          overwrite: opts.forceOverwrite,
          noRetry: opts.retry === false,
        });

      let result;
      const runSpinner = (prompt: string, label: string) =>
        uim.withSpinner(
          `music (${label}${opts.duration}s${opts.withVocals ? "" : ", instrumental"}) → ${opts.slot}`,
          () => submit(prompt),
          {
            successText: (r) => `music ${uim.c.cmd(opts.slot)} → ${uim.c.path(r.localPath)} ${uim.c.muted(`(${(r.latencyMs / 1000).toFixed(1)}s)`)}`,
            failText: (e) => `music ${uim.c.cmd(opts.slot)} failed: ${(e as Error).message?.slice(0, 200)}`,
          },
        );

      if (opts.autoRetryOnTosRejection) {
        const retried = await submitMusicWithToSAutoRetry({
          projectId: opts.project,
          slot: opts.slot,
          prompt: opts.prompt,
          durationSec: opts.duration,
          forceInstrumental: !opts.withVocals,
          submit: (p) => runSpinner(p, p === opts.prompt ? "" : "resubmit "),
        });
        result = retried.result;
        if (retried.resubmitted) {
          // eslint-disable-next-line no-console
          console.error(
            `ralphy: ToS rejection on music prompt — auto-resubmitted with provider rewrite:\n  ${retried.promptSuggestion}`,
          );
        }
      } else {
        try {
          result = await runSpinner(opts.prompt, "");
        } catch (err) {
          if (err instanceof TerminalProviderError && err.promptSuggestion) {
            // eslint-disable-next-line no-console
            console.error(
              `ralphy: ToS rejection. Provider sanitized rewrite available — re-run with --auto-retry-on-tos-rejection, or paste:\n  ${err.promptSuggestion}`,
            );
          }
          throw err;
        }
      }
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
    .option("--prompt <prompt>", "SFX description (e.g. 'short analog TV static pop')")
    .option("--prompt-file <path>", "Read prompt from a file (#025). Symmetric with --prompt; inline wins when both are passed.")
    .option("--duration <seconds>", "Duration in seconds (0.5-22)", parseFloat, 4)
    .option("--provider <id>", "Provider connector to use (e.g. elevenlabs). Default: first available provider that supports sfx. See `ralphy provider list`.")
    .option("--prompt-influence <n>", "Prompt adherence 0-1 (default 0.4 — let model interpret)", parseFloat, 0.4)
    .option("--note <note>", "Free-form note")
    .option("--force-overwrite", "Bypass auto-versioning and overwrite the existing slot file in place. Default: archive existing to <slot>.v{N}.mp3.")
    .option("--no-ref-consent <reason>", "Explicit user override of the reference-required gate (AGENTS invariant #3). Logs `stage: \"no-ref-consent\"` with the reason to user-prompts.jsonl.")
    .option("--no-retry", "Bypass the transient-error retry loop (#005). Default: 2 retries with 1s/4s/16s exponential backoff on TLS / ECONNRESET / 5xx.")
    .action(async (opts) => {
      await ensureProject(opts.project);
      opts.slot = normalizeSlot(opts.slot);
      await maybeLogNoRefConsent(opts);
      if (maybeEnqueue(opts, "generate.sfx", opts.project)) return;

      // #025: --prompt / --prompt-file symmetry.
      const sfxPrompt = await readPromptOrFile({
        prompt: opts.prompt,
        promptFile: opts.promptFile,
        projectId: opts.project,
      });
      if (!sfxPrompt) {
        raiseError("E_INPUT_INVALID", {
          field: "prompt",
          detail: "either --prompt <text> or --prompt-file <path> is required",
          verb: "generate sfx",
        });
      }
      opts.prompt = sfxPrompt!;

      const connSfx = resolveConnector("sfx", opts.provider);
      const uisfx = await import("../lib/ui.js");
      const result = await uisfx.withSpinner(
        `sfx (${opts.duration}s) → ${opts.slot}`,
        () =>
          connSfx.generateSfx!({
            projectId: opts.project,
            slot: opts.slot,
            prompt: opts.prompt,
            durationSec: opts.duration,
            promptInfluence: opts.promptInfluence,
            note: opts.note,
            overwrite: opts.forceOverwrite,
            noRetry: opts.retry === false,
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
    .option(
      "--language <lang>",
      "Audio language hint forwarded to ElevenLabs Scribe — ru | en | auto (default auto: Scribe auto-detects). #051: passing a wrong hint forces Scribe to lock onto that language; ralphy-vs-higgsfield-001 hit a misdetection by leaving the legacy 'ru' default in place on an EN clip.",
      "auto",
    )
    .option(
      "--low-confidence-threshold <n>",
      "Per-word confidence threshold under which a word is surfaced in `low_confidence_words` in the output JSON. Default 0.6. #051",
      (v) => Math.max(0, Math.min(1, parseFloat(v))),
      0.6,
    )
    .option("--backend <backend>", "elevenlabs | openrouter | gemini", "elevenlabs")
    .option("--output <path>", "Custom output path. Default: workspace/projects/<id>/assets/captions/<slot>.json. Legacy default (captions.json at project root) is still written when --legacy-output is passed for back-compat.")
    .option("--out <path>", "Alias for --output (kept because the 'Did you mean ...' hint used to advertise this spelling). #010")
    .option("--legacy-output", "Write to the legacy shared captions.json instead of assets/captions/<slot>.json. Pre-2026-05 behavior; only use for scripts that grep the old path. Emits a deprecation warning. #010")
    .option(
      "--max-width-pct <n>",
      "Caption wrap: max width of the text box as a percentage of frame width (0..100). Default: safe-zone preset or 90. #010",
      (v) => Math.max(10, Math.min(100, parseFloat(v))),
    )
    .option(
      "--font-file <path>",
      "Path to a .ttf/.otf font file. Forwarded to the drawtext filter sidecar; omitted falls back to ffmpeg default. #010",
    )
    .option(
      "--font-size <px>",
      "Caption font size in pixels (drives wrap + drawtext sidecar). Default: 64.",
      (v) => Math.max(8, parseInt(v, 10)),
      64,
    )
    .option(
      "--safe-zone <preset>",
      "Safe-zone preset for the drawtext sidecar: tiktok | reels | shorts | none. Default: none. #010",
      "none",
    )
    .option(
      "--brand-spelling <path>",
      "Path to a brand-spelling JSON dict (lowercase key → replacement). Default: <project>/brand-spelling.json if it exists, falls back to the built-in dict. #010",
    )
    .option(
      "--frame-width <px>",
      "Source frame width for wrap calculation. Default: 1080 (9:16 portrait).",
      (v) => Math.max(64, parseInt(v, 10)),
      1080,
    )
    .option("--force-overwrite", "Bypass auto-versioning and overwrite the existing slot file in place. Default: archive existing to <slot>.v{N}.json (+ .srt, .drawtext.filter).")
    .option("--note <note>", "Free-form note")
    .action(async (opts) => {
      await ensureProject(opts.project);
      // #025: NBSP-normalize + project-relative fallback for the --audio path.
      const audioPath = intakePath(opts.audio, opts.project, "audio");
      const slot = normalizeSlot(opts.slot ?? `captions-${path.basename(audioPath, path.extname(audioPath))}`);
      const backend = opts.backend as TranscribeBackend;
      const t0 = Date.now();
      const result = await transcribe({ audioPath, language: opts.language, backend });

      // ── output path resolution ──────────────────────────────────────────
      // #010: shared captions.json clobber → per-slot output as default.
      // --output / --out: explicit override (--out is the alias the "Did you
      //   mean ..." error used to advertise).
      // --legacy-output: opt-in to the pre-2026-05 shared-file path; emits
      //   a deprecation warning so the user knows it's a legacy escape hatch.
      // Default: workspace/projects/<id>/assets/captions/<slot>.json
      const explicitOut = opts.output ?? opts.out;
      if (opts.legacyOutput) {
        // eslint-disable-next-line no-console
        console.error(
          "ralphy: --legacy-output is deprecated. Shared captions.json clobbers on concurrent / batch calls; use the per-slot default (assets/captions/<slot>.json) or --output. #010",
        );
      }
      const outPath = explicitOut
        ? path.resolve(explicitOut)
        : opts.legacyOutput
          ? path.join(projectsDir(), opts.project, "captions.json")
          : path.join(projectsDir(), opts.project, "assets", "captions", `${slot}.json`);
      await fs.mkdir(path.dirname(outPath), { recursive: true });

      // AGENTS invariant #14: never overwrite an existing per-slot caption
      // file. Archive to <slot>.v{N}.json (mirrors what image/video/voiceover
      // already do via protectExistingAsset). --force-overwrite skips this.
      await protectExistingAsset(outPath, opts.forceOverwrite);

      // ── brand-spelling substitution ─────────────────────────────────────
      // #010: caption-wrap / safe-zone / brand-spelling all lived in user-
      // land Python before this. Pull the project's dict (if any) and merge
      // on top of the built-in floor.
      const brandSpellingPath =
        (opts.brandSpelling as string | undefined) ??
        path.join(projectsDir(), opts.project, "brand-spelling.json");
      let projectDict: BrandSpellingDict | null = null;
      try {
        const raw = await fs.readFile(brandSpellingPath, "utf8");
        projectDict = JSON.parse(raw) as BrandSpellingDict;
      } catch {
        // Missing / unparseable → fall back to built-in only. Not an error.
      }
      const dict = mergeBrandSpelling(projectDict);
      const captions = applyBrandSpellingToCaptions(result.captions, dict);

      // ── wrap captions to the safe zone ──────────────────────────────────
      const safeZone = (opts.safeZone as SafeZone) ?? "none";
      const spec = resolveSafeZone(safeZone, opts.maxWidthPct as number | undefined);
      const fontSizePx = (opts.fontSize as number | undefined) ?? 64;
      const frameWidth = (opts.frameWidth as number | undefined) ?? 1080;
      const wrapped = captions.map((c) => ({
        ...c,
        text: wrapCaptionText(c.text, {
          frameWidth,
          maxWidthPct: spec.maxWidthPct,
          fontSizePx,
        }),
      }));

      // ── low-confidence words (#051) ─────────────────────────────────────
      // Output JSON shape carries `captions`, `low_confidence_words`, and
      // metadata. #010 adds `low_confidence_words: []` even on empty
      // transcripts for shape consistency, so consumers don't need to
      // null-check.
      const threshold = (opts.lowConfidenceThreshold as number | undefined) ?? 0.6;
      const lowConfidenceWords = (result.lowConfidenceWords ?? []).filter(
        (w) => w.confidence < threshold,
      );

      // ── persist sidecar files ───────────────────────────────────────────
      const jsonPayload = {
        captions: wrapped,
        // Keep these top-level so downstream `cli/lib/components/captions/*`
        // consumers (which type against the bare Caption[] shape) can still
        // do `JSON.parse(raw).captions` or just `raw` when stored as array.
        low_confidence_words: lowConfidenceWords,
        language: result.language,
        languageProbability: result.languageProbability,
        durationSec: result.audioDurationSec,
        slot,
        safeZone,
        maxWidthPct: spec.maxWidthPct,
        fontSizePx,
        frameWidth,
        model: result.model,
        backend: result.backend,
      };
      await fs.writeFile(outPath, JSON.stringify(jsonPayload, null, 2), "utf8");

      // SRT + drawtext-per-line filter snippet next to the JSON (#010: editors
      // can grab the ffmpeg filter directly instead of hand-rolling one).
      const srtPath = outPath.replace(/\.json$/, ".srt");
      const drawtextPath = outPath.replace(/\.json$/, ".drawtext.filter");
      await fs.writeFile(srtPath, captionsToSrt(wrapped), "utf8");
      await fs.writeFile(
        drawtextPath,
        captionsToDrawtextFilter(wrapped, {
          fontFile: opts.fontFile as string | undefined,
          fontSizePx,
          fontColor: "white",
          boxColor: "black@0.5",
          yCenter: spec.yCenter,
        }),
        "utf8",
      );

      await logGeneration(opts.project, {
        provider: result.backend === "elevenlabs" ? "elevenlabs" : "openrouter",
        model: result.model,
        endpoint: result.model,
        kind: "text",
        slot,
        input: {
          slot,
          project: opts.project,
          audio: audioPath,
          language: opts.language,
          backend: result.backend,
          safeZone,
          maxWidthPct: spec.maxWidthPct,
          fontSizePx,
          frameWidth,
        },
        output: {
          local: outPath,
          bytes: wrapped.length,
        },
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

      const languageWarning =
        result.languageProbability !== null && result.languageProbability < 0.85
          ? `Low language-detection confidence (${result.languageProbability.toFixed(2)}). Pass --language <code> to lock the language.`
          : undefined;

      out({
        slot,
        path: outPath,
        srtPath,
        drawtextPath,
        captions: wrapped.length,
        durationSec: result.audioDurationSec,
        language: result.language,
        languageProbability: result.languageProbability,
        languageWarning,
        lowConfidenceWords,
        lowConfidenceThreshold: threshold,
        safeZone,
        maxWidthPct: spec.maxWidthPct,
        fontSizePx,
        frameWidth,
        costUsd: result.costUsd,
        latencyMs: Date.now() - t0,
      });
    });

  return cmd;
}

// Suppress unused import warning when consumers don't use this helper.
void logUserPrompt;
