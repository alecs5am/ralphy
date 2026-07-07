// Batch fan-out helpers for `ralphy generate image` (#024).
//
// Three new modes share these helpers:
//   1. `--batch <prompts.jsonl>` — one JSON line per slot (`{slot, prompt, refs?, model?}`).
//   2. `--variants N` — single prompt, N variant slots (`<slot>-v1..vN`).
//   3. `generate image-batch --prompts-dir <dir>` — each `*.txt` → one slot.
//
// All three share:
//   - cost preview via `--dry-run` (shape: `{model, count, cost_estimate_usd, eta_seconds, items}`),
//   - per-line stderr progress,
//   - cost rollup on completion,
//   - reliance on the connector's per-endpoint semaphore (#007) for throttling.
//
// Background: before this, agents hand-rolled `bash & wait` chunked loops with
// no cost rollup, no manifest provenance, no idempotent retry (postmortems:
// free-air-vpn-stickerpack #4, sotaocr-fb-001 #2, appstore-takeaminute-001).

import fs from "node:fs/promises";
import path from "node:path";
import { resolveArtifactPath, root } from "./paths.js";

/** One slot in a batch fan-out. */
export type BatchItem = {
  slot: string;
  prompt: string;
  refs?: string[];
  model?: string;
  negative?: string;
};

/** Per-model nominal cost for image batches (kept here so dry-run and live agree). */
const IMAGE_COST_USD: Record<string, number> = {
  "google/gemini-3-pro-image-preview": 0.04,
  "openai/gpt-5.4-image-2": 0.19,
  "google/gemini-3.1-flash-image-preview": 0.04,
  "google/gemini-2.5-flash-image": 0.02,
  "recraft/recraft-v4.1-pro": 0.25,
  "recraft/recraft-v4.1-pro-vector": 0.30,
};
const IMAGE_COST_USD_FALLBACK = 0.04;

/** Per-model nominal latency seconds for image batches (rough — used for ETA only). */
const IMAGE_LATENCY_SEC: Record<string, number> = {
  "google/gemini-3-pro-image-preview": 12,
  "openai/gpt-5.4-image-2": 28,
  "google/gemini-3.1-flash-image-preview": 8,
  "google/gemini-2.5-flash-image": 6,
};
const IMAGE_LATENCY_SEC_FALLBACK = 15;

/** Per-model in-process concurrency hint (mirrors providers/concurrency.ts). */
const IMAGE_CONCURRENCY: Record<string, number> = {
  "openai/gpt-5.4-image-2": 2,
  "google/gemini-3-pro-image-preview": 2,
};
const IMAGE_CONCURRENCY_FALLBACK = 2;

/** Nominal $/image for an OpenRouter image model. */
export function imageCostUsd(model: string): number {
  return IMAGE_COST_USD[model] ?? IMAGE_COST_USD_FALLBACK;
}

/**
 * Known per-image price, or null when the model has no table entry — the
 * #516 simulate distinction between "priced" and "unknown pricing" (the
 * fallback above would silently price an unknown model).
 */
export function knownImageCostUsd(model: string): number | null {
  return IMAGE_COST_USD[model] ?? null;
}

/** Nominal seconds per image (single call, no fan-out math). */
export function imageLatencySec(model: string): number {
  return IMAGE_LATENCY_SEC[model] ?? IMAGE_LATENCY_SEC_FALLBACK;
}

/** Estimated wall-clock ETA for a batch of N images at per-model concurrency. */
export function batchEtaSec(model: string, n: number): number {
  const conc = IMAGE_CONCURRENCY[model] ?? IMAGE_CONCURRENCY_FALLBACK;
  return Math.ceil(n / Math.max(1, conc)) * imageLatencySec(model);
}

/**
 * Parse a `.jsonl` file into a BatchItem[]. Blank lines and `#` comment lines
 * are ignored (the latter mimics the `--ref-file` syntax for consistency). Each
 * line must be a JSON object with at minimum a `slot` and a `prompt`; `refs`,
 * `model`, `negative` are optional.
 *
 * Throws on the first malformed line with a clear `line:N` prefix so the agent
 * can find it without grepping. Exported so unit tests can hit it directly.
 */
export function parseBatchJsonl(raw: string): BatchItem[] {
  const out: BatchItem[] = [];
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line || line.startsWith("#")) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch (err) {
      throw new Error(`batch jsonl: line ${i + 1}: not valid JSON (${(err as Error).message})`);
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      throw new Error(`batch jsonl: line ${i + 1}: expected an object`);
    }
    const o = obj as Record<string, unknown>;
    const slot = o.slot;
    const prompt = o.prompt;
    if (typeof slot !== "string" || slot.length === 0) {
      throw new Error(`batch jsonl: line ${i + 1}: missing or empty 'slot'`);
    }
    if (typeof prompt !== "string" || prompt.length === 0) {
      throw new Error(`batch jsonl: line ${i + 1}: missing or empty 'prompt'`);
    }
    const refs = o.refs;
    if (refs !== undefined && !Array.isArray(refs)) {
      throw new Error(`batch jsonl: line ${i + 1}: 'refs' must be an array of strings`);
    }
    const item: BatchItem = { slot, prompt };
    if (Array.isArray(refs)) item.refs = refs.map(String);
    if (typeof o.model === "string") item.model = o.model;
    if (typeof o.negative === "string") item.negative = o.negative;
    out.push(item);
  }
  return out;
}

/** Read + parse a batch jsonl file. Thin wrapper for the command site. */
export async function readBatchJsonl(file: string): Promise<BatchItem[]> {
  const raw = await fs.readFile(file, "utf-8");
  return parseBatchJsonl(raw);
}

/**
 * Walk a directory and turn each `*.txt` file into a BatchItem whose slot is
 * the file stem (e.g. `scene-01.txt` → slot `scene-01`, prompt = file contents
 * trimmed). Stable alphabetical order so reruns are deterministic.
 */
export async function readPromptsDir(dir: string): Promise<BatchItem[]> {
  const entries = await fs.readdir(dir);
  const txts = entries.filter((e) => e.toLowerCase().endsWith(".txt")).sort();
  const out: BatchItem[] = [];
  for (const name of txts) {
    const slot = path.basename(name, path.extname(name));
    const raw = await fs.readFile(path.join(dir, name), "utf-8");
    const prompt = raw.trim();
    if (!prompt) continue; // skip empty files silently — agent may use them as placeholders
    out.push({ slot, prompt });
  }
  return out;
}

/**
 * Build the variant BatchItem[] for `--variants N`. Auto-suffix `<slot>-v1..vN`
 * mirrors the legacy behavior in commands/generate.ts (kept stable so existing
 * scripts continue to work).
 */
export function buildVariantItems(args: {
  baseSlot: string;
  prompt: string;
  variants: number;
  refs?: string[];
  model?: string;
  negative?: string;
}): BatchItem[] {
  const out: BatchItem[] = [];
  for (let i = 1; i <= args.variants; i++) {
    const item: BatchItem = {
      slot: `${args.baseSlot}-v${i}`,
      prompt: args.prompt,
    };
    if (args.refs) item.refs = args.refs;
    if (args.model) item.model = args.model;
    if (args.negative) item.negative = args.negative;
    out.push(item);
  }
  return out;
}

/**
 * Build the dry-run payload shape shared by all three modes. Caller injects
 * the resolved default model so dry-run JSON shows the real model id. The
 * `count` field is N, `cost_estimate_usd` is sum-of-items, `eta_seconds` is
 * wall-clock at per-model concurrency.
 */
export function buildBatchDryRun(args: {
  defaultModel: string;
  items: BatchItem[];
  projectId: string;
  ext?: string; // "png" by default
}): {
  dryRun: true;
  mode: "batch";
  model: string;
  count: number;
  cost_estimate_usd: number;
  eta_seconds: number;
  items: Array<{ slot: string; model: string; est_usd: number; would_write: string }>;
} {
  const ext = args.ext ?? "png";
  const items = args.items.map((it) => {
    const m = it.model ?? args.defaultModel;
    return {
      slot: it.slot,
      model: m,
      est_usd: imageCostUsd(m),
      would_write: path.relative(root(), resolveArtifactPath(args.projectId, "images", `${it.slot}.${ext}`)),
    };
  });
  const cost = items.reduce((s, it) => s + it.est_usd, 0);
  // Group by model for ETA: the per-model semaphore caps in-flight separately.
  const byModel = new Map<string, number>();
  for (const it of items) byModel.set(it.model, (byModel.get(it.model) ?? 0) + 1);
  let eta = 0;
  for (const [m, n] of byModel) {
    // When mixed-model, we approximate by max-per-model (they run in parallel).
    eta = Math.max(eta, batchEtaSec(m, n));
  }
  return {
    dryRun: true,
    mode: "batch",
    model: args.defaultModel,
    count: items.length,
    cost_estimate_usd: Number(cost.toFixed(4)),
    eta_seconds: eta,
    items,
  };
}
