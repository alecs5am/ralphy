// Lightweight project event logging.
//
// All logs are per-project JSONL under workspace/projects/{id}/logs/:
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
// - Scripts under workspace/projects/{id}/scripts/*.ts import and wrap fal/elevenlabs calls.
// - `ralph project log <id>` reads these files.
// - Dashboard /projects/:id/logs serves them.

import fs from "node:fs/promises";
import path from "node:path";
import { projectsDir } from "./paths.js";

export type Provider =
  | "fal"
  | "elevenlabs"
  | "openai"
  | "openrouter"
  | "vercel"
  | "whisper-cpp"
  | "ffmpeg"
  | "replicate"
  | "other";

export type GenerationEntry = {
  timestamp: string;
  provider: Provider;
  endpoint: string;              // e.g. "fal-ai/kling-video/v3/pro/image-to-video"
  kind: "image" | "video" | "audio" | "music" | "voiceover" | "text" | "embed" | "other";
  input: Record<string, unknown>;
  output?: {
    url?: string;
    local?: string;
    bytes?: number;
  };
  status: "ok" | "error";
  error?: string;
  latency_ms?: number;
  cost_usd?: number;             // best-effort estimate, optional
  request_id?: string;           // fal queue id, elevenlabs id, etc.
  note?: string;                 // free-form human tag, e.g. "clip-03 v2 hand crumples sample"
};

export type UserAssetEntry = {
  timestamp: string;
  kind: "screenshot" | "photo" | "video" | "audio" | "doc" | "ref-url" | "other";
  source: string;                // original path or URL from user
  dest?: string;                 // stored path inside project, if copied in
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
  return path.join(projectsDir(), projectId, "logs");
}

async function appendJsonl(file: string, entry: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, JSON.stringify(entry) + "\n");
}

export async function logGeneration(
  projectId: string,
  entry: Omit<GenerationEntry, "timestamp"> & { timestamp?: string }
): Promise<void> {
  const full: GenerationEntry = {
    timestamp: entry.timestamp ?? new Date().toISOString(),
    ...entry,
  };
  await appendJsonl(path.join(logsDir(projectId), "generations.jsonl"), full);
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
