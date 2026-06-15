// Lightweight project event logging.
//
// All logs are per-project JSONL under <project>/logs/:
//   generations.jsonl  — every model call (fal.ai / ElevenLabs / Lyria2 / OpenAI)
//   user-prompts.jsonl — chronological list of user-facing prompts/requests
//   user-assets.jsonl  — user-uploaded references (screenshots, product photos, docs)
//
// Rules:
// - Append-only. Never rewrite.
// - Everything timestamped at write. Pass additional `timestamp` only to backfill.
// - Output URLs preferred over byte blobs. Keep entries small.
// - All three functions are safe to call with non-existent project dirs — they mkdir -p.
//
// Consumers:
// - Scripts under <project>/scripts/*.ts import and wrap fal/elevenlabs calls.
// - `ralph project log <id>` reads these files.
// - Dashboard /projects/:id/logs serves them.

import fs from "node:fs/promises";
import path from "node:path";
import { projectDir } from "./paths.js";

// Open enum: the listed ids are the known/bundled providers (kept for
// autocomplete + grep), but any connector id is accepted now that providers are
// pluggable (notes/ideas/005). `(string & {})` preserves literal hints while
// widening the type to arbitrary strings.
export type Provider =
  | "fal"
  | "elevenlabs"
  | "openai"
  | "openrouter"
  | "vercel"
  | "ffmpeg"
  | "replicate"
  | "other"
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

/**
 * Canonical generation log entry (issue #032).
 *
 * Schema invariants — all writers MUST emit these keys, no aliases:
 * - `provider` (top-level)         — connector id ("openrouter", "elevenlabs", "ffmpeg", …)
 * - `model`    (top-level)         — fully-qualified model id ("google/gemini-3-pro-image-preview").
 *                                     For non-LLM endpoints (ffmpeg, ffprobe), mirror the endpoint slug.
 * - `endpoint` (top-level)         — provider-specific endpoint slug ("tts/eleven_multilingual_v2",
 *                                     "openrouter/chat-completions"). Same as `model` for LLM calls.
 * - `kind`     (top-level)         — coarse classifier ("image", "video", "voiceover", "music",
 *                                     "sfx", "text", "video-analysis", "embed", "other").
 * - `cost_usd` (top-level)         — best-effort USD estimate. NEVER `costUsd`.
 * - `attempt`  (top-level)         — 1-indexed retry attempt counter (default 1).
 * - `input.slot`                   — asset slot this generation targets ("scene-01-bg-image").
 *                                     Persisted INSIDE input so per-slot cost rollups work
 *                                     without inferring from `note` or filenames. (#032)
 * - `input.project`                — project id, mirrored into the row body so cross-project
 *                                     greps don't need to know which file they came from. (#032)
 * - `input.*`                      — call-specific input payload (prompt, refs, durations, …).
 *
 * Back-compat: legacy rows (pre-#032) may carry `slot` at the top level or `costUsd` instead
 * of `cost_usd`. **Readers MUST go through `readGeneration()` or `normalizeGenerationEntry()`**
 * which transparently coerces both shapes to canonical.
 *
 * Append-only on disk (AGENTS invariant #14): writers add NEW canonical rows; existing rows
 * are never rewritten. The read-side normalizer is the migration path.
 */
export type GenerationEntry = {
  timestamp: string;
  provider: Provider;
  model: string;                 // canonical model id; mirrors endpoint for non-LLM calls
  endpoint: string;              // e.g. "fal-ai/kling-video/v3/pro/image-to-video"
  kind: "image" | "video" | "audio" | "music" | "voiceover" | "sfx" | "text" | "video-analysis" | "embed" | "other";
  /**
   * @deprecated Top-level `slot` is preserved for back-compat with legacy rows but new writers
   * MUST set `input.slot` instead. Readers go through `normalizeGenerationEntry()` which mirrors
   * this field into `input.slot` if missing. Will be dropped in a future major.
   */
  slot?: string;
  input: Record<string, unknown> & { slot?: string; project?: string };
  output?: {
    url?: string;
    local?: string;
    bytes?: number;
    job_id?: string;
  };
  status: "ok" | "error";
  error?: string;
  latency_ms?: number;
  cost_usd?: number;             // best-effort estimate, optional
  attempt?: number;              // 1-indexed retry attempt counter (default 1)
  request_id?: string;           // fal queue id, elevenlabs id, etc.
  note?: string;                 // free-form human tag, e.g. "clip-03 v2 hand crumples sample"

  // ── Model-router telemetry (issue #424) — all ADDITIVE + OPTIONAL ──
  // Structured outcome fields the summarizer (`cli/lib/models/telemetry.ts`)
  // aggregates by (model, mode, kind/task). Old rows lack them and still
  // normalize/validate; the per-project content mode + eval verdict are JOINED
  // read-only from production-plan.json / eval.json (NOT written back here).
  mode?: string;                 // content mode (#412), e.g. "ugc-review"
  task?: string;                 // finer task tag, e.g. "scene-anchor", "i2v", "vo"
  promptClass?: string;          // coarse prompt label, e.g. "photoreal", "typography"
  refsCount?: number;            // how many --ref images this call carried
  failureClass?: string;         // "moderation" | "constraint" | "transient" | "provider-semantic"
};

/**
 * Raw row shape on disk. Same as {@link GenerationEntry} but with the legacy fields
 * (`costUsd`, top-level `slot`, missing `model`) still permitted. Always run through
 * {@link normalizeGenerationEntry} before consuming.
 */
export type RawGenerationEntry = Partial<GenerationEntry> & {
  timestamp?: string;
  provider?: Provider | string;
  endpoint?: string;
  model?: string;
  kind?: string;
  slot?: string;
  input?: Record<string, unknown>;
  output?: GenerationEntry["output"];
  status?: "ok" | "error";
  error?: string;
  latency_ms?: number;
  // legacy alias seen in some early rows
  // eslint-disable-next-line @typescript-eslint/naming-convention
  costUsd?: number;
  cost_usd?: number;
  attempt?: number;
  request_id?: string;
  note?: string;
  // #424 outcome fields (optional on disk; passed through unchanged).
  mode?: string;
  task?: string;
  promptClass?: string;
  refsCount?: number;
  failureClass?: string;
};

/**
 * Read-side normalizer (issue #032). Accepts both legacy and canonical row shapes,
 * returns canonical. NEVER mutates the input. Safe to call on any object — unknown
 * fields are preserved.
 *
 * Coercions:
 * - `costUsd` → `cost_usd` (if `cost_usd` missing)
 * - top-level `slot` → mirrored into `input.slot` (if `input.slot` missing)
 * - missing `model` → falls back to `endpoint`
 * - missing `kind`  → "other"
 * - missing `attempt` → 1
 * - missing `input` → {}
 */
export function normalizeGenerationEntry(row: RawGenerationEntry): GenerationEntry {
  const inputObj = (row.input ?? {}) as Record<string, unknown> & { slot?: string; project?: string };
  // Mirror top-level slot into input.slot if absent.
  if (row.slot && inputObj.slot == null) {
    inputObj.slot = row.slot;
  }
  const cost = row.cost_usd ?? (row as { costUsd?: number }).costUsd;
  const endpoint = row.endpoint ?? row.model ?? "unknown";
  const model = row.model ?? row.endpoint ?? "unknown";
  return {
    timestamp: row.timestamp ?? new Date(0).toISOString(),
    provider: (row.provider as Provider) ?? "other",
    model,
    endpoint,
    kind: (row.kind as GenerationEntry["kind"]) ?? "other",
    slot: row.slot ?? inputObj.slot,
    input: inputObj,
    output: row.output,
    status: row.status ?? "ok",
    error: row.error,
    latency_ms: row.latency_ms,
    cost_usd: cost,
    attempt: row.attempt ?? 1,
    request_id: row.request_id,
    note: row.note,
    mode: row.mode,
    task: row.task,
    promptClass: row.promptClass,
    refsCount: row.refsCount,
    failureClass: row.failureClass,
  };
}

export type UserAssetEntry = {
  timestamp: string;
  kind: "screenshot" | "photo" | "video" | "audio" | "doc" | "ref-url" | "other";
  source: string;                // original path or URL from user
  dest?: string;                 // stored path inside project, if copied in
  /**
   * Original location on the user's machine (e.g. the macOS NSIRD disposable
   * screenshot path) — preserved alongside `localPath` when `--copy-from`
   * rescued the file into the project. Same shape as `source` for grep-friendliness
   * but kept distinct so downstream readers can tell "where it came from"
   * from "where we stashed it" without parsing `source` heuristically. (#038)
   */
  originalPath?: string;
  /**
   * Project-local copy of the file (under `<project>/artifacts/refs/`), written by
   * `log-asset --copy-from`. Set when the CLI actually copied bytes — distinct
   * from `dest`, which can be a user-supplied "I already put it here" path.
   * Same value as `dest` when both are present; logging both leaves room for
   * the two to diverge later (e.g. promotion). (#038)
   */
  localPath?: string;
  purpose?: string;              // "character-ref" | "product-ref" | "brand-screenshot" | ...
  note?: string;
};

export type UserPromptEntry = {
  timestamp: string;
  text: string;
  stage?: string;                // "brief" | "scenario-feedback" | "regeneration-request" | ...
  note?: string;
};

function logsDir(projectId: string) {
  return path.join(projectDir(projectId), "logs");
}

async function appendJsonl(file: string, entry: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, JSON.stringify(entry) + "\n");
}

export async function logGeneration(
  projectId: string,
  entry: Omit<GenerationEntry, "timestamp" | "model" | "input"> & {
    timestamp?: string;
    model?: string;
    input: Record<string, unknown> & { slot?: string; project?: string };
  },
): Promise<void> {
  // Canonical schema enforcement (issue #032):
  //  - `model` is required; fall back to `endpoint` when callers haven't been migrated yet.
  //  - `input.slot` mirrors top-level `slot` (top-level kept for legacy reader back-compat).
  //  - `input.project` mirrors the projectId arg so cross-project greps don't need the file path.
  //  - `attempt` defaults to 1.
  const model = entry.model ?? entry.endpoint ?? "unknown";
  const input: Record<string, unknown> & { slot?: string; project?: string } = { ...entry.input };
  if (entry.slot && input.slot == null) input.slot = entry.slot;
  if (input.project == null) input.project = projectId;
  const full: GenerationEntry = {
    timestamp: entry.timestamp ?? new Date().toISOString(),
    provider: entry.provider,
    model,
    endpoint: entry.endpoint,
    kind: entry.kind,
    slot: entry.slot,
    input,
    output: entry.output,
    status: entry.status,
    error: entry.error,
    latency_ms: entry.latency_ms,
    cost_usd: entry.cost_usd,
    attempt: entry.attempt ?? 1,
    request_id: entry.request_id,
    note: entry.note,
    mode: entry.mode,
    task: entry.task,
    promptClass: entry.promptClass,
    refsCount: entry.refsCount,
    failureClass: entry.failureClass,
  };
  await appendJsonl(path.join(logsDir(projectId), "generations.jsonl"), full);
}

/**
 * Read `generations.jsonl` and return canonical rows (issue #032). Equivalent to
 * `readLog<GenerationEntry>(id, "generations")` followed by `normalizeGenerationEntry`
 * on every row. Postmortems and rollup queries should ALWAYS go through this — never
 * directly through `readLog` for the generations log — so legacy + canonical rows are
 * indistinguishable downstream.
 */
export async function readGenerations(projectId: string): Promise<GenerationEntry[]> {
  const rows = await readLog<RawGenerationEntry>(projectId, "generations");
  return rows.map(normalizeGenerationEntry);
}

export async function logUserAsset(
  projectId: string,
  entry: Omit<UserAssetEntry, "timestamp"> & { timestamp?: string }
): Promise<void> {
  const full: UserAssetEntry = {
    timestamp: entry.timestamp ?? new Date().toISOString(),
    ...entry,
  };
  await appendJsonl(path.join(logsDir(projectId), "user-assets.jsonl"), full);
}

export async function logUserPrompt(
  projectId: string,
  entry: Omit<UserPromptEntry, "timestamp"> & { timestamp?: string }
): Promise<void> {
  const full: UserPromptEntry = {
    timestamp: entry.timestamp ?? new Date().toISOString(),
    ...entry,
  };
  await appendJsonl(path.join(logsDir(projectId), "user-prompts.jsonl"), full);
}

export async function readLog<T = unknown>(
  projectId: string,
  name: "generations" | "user-prompts" | "user-assets"
): Promise<T[]> {
  const file = path.join(logsDir(projectId), `${name}.jsonl`);
  try {
    const text = await fs.readFile(file, "utf-8");
    return text.split("\n").filter(Boolean).map((l) => JSON.parse(l) as T);
  } catch {
    return [];
  }
}

// Convenience wrapper around fetch that times and auto-logs any fal.ai / ElevenLabs call.
// Pass projectId to attach; omit to skip logging (returns raw Response).
//
// Usage:
//   const resp = await loggedFetch({
//     projectId: "solutions-metal-001",
//     provider: "fal",
//     endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
//     kind: "video",
//     input: body,
//     note: "clip-03 v2",
//   }, url, { method, headers, body: JSON.stringify(body) });
export async function loggedFetch(
  meta: {
    projectId?: string;
    provider: Provider;
    endpoint: string;
    kind: GenerationEntry["kind"];
    input: Record<string, unknown>;
    note?: string;
  },
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const t0 = Date.now();
  try {
    const res = await fetch(input, init);
    const latency = Date.now() - t0;
    if (meta.projectId) {
      const clone = res.clone();
      let request_id: string | undefined;
      let outputUrl: string | undefined;
      try {
        if ((clone.headers.get("content-type") || "").includes("application/json")) {
          const j = (await clone.json()) as any;
          request_id = j?.request_id;
          outputUrl = j?.images?.[0]?.url ?? j?.video?.url ?? j?.audio?.url;
        }
      } catch { /* non-json bodies are fine */ }
      await logGeneration(meta.projectId, {
        provider: meta.provider,
        model: meta.endpoint,
        endpoint: meta.endpoint,
        kind: meta.kind,
        input: meta.input,
        output: outputUrl ? { url: outputUrl } : undefined,
        status: res.ok ? "ok" : "error",
        error: res.ok ? undefined : `HTTP ${res.status}`,
        latency_ms: latency,
        request_id,
        note: meta.note,
      });
    }
    return res;
  } catch (e: any) {
    if (meta.projectId) {
      await logGeneration(meta.projectId, {
        provider: meta.provider,
        model: meta.endpoint,
        endpoint: meta.endpoint,
        kind: meta.kind,
        input: meta.input,
        status: "error",
        error: e?.message || String(e),
        latency_ms: Date.now() - t0,
        note: meta.note,
      });
    }
    throw e;
  }
}
