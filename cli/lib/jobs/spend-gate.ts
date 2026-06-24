// Queue dispatch spend gate (#481).
//
// The worker calls `checkQueuedJobSpend(job)` BEFORE spawning a paid
// `generate.*` job that carries a `project_id`. It resolves the effective
// approval for the job's project (project → run, via the same `checkSpend`
// resolution order), derives a best-effort per-call estimate from the job's
// argv, and returns whether the dispatch is allowed. A blocked job is
// finalized as `blocked` by the worker and never spawned.
//
// PURE-ish + unit-testable WITHOUT the daemon: the worker passes a JobRow,
// tests seed a ledger + gen-log + run manifest and call this directly with a
// fake JobRow. No DB read, no spawn — only the spend layer + the argv parser.

import { checkSpend, estimatedCallCostUsd } from "../spend.js";
import type { JobRow, JobKind } from "./types.js";

/** The estimate kind backing a generate.* JobKind, or null when not a paid gen. */
function genKindOf(kind: JobKind): "image" | "video" | "voiceover" | "music" | "sfx" | null {
  switch (kind) {
    case "generate.image": return "image";
    case "generate.video": return "video";
    case "generate.voiceover": return "voiceover";
    case "generate.music": return "music";
    case "generate.sfx": return "sfx";
    // generate.captions is effectively free (no per-call cost table); render /
    // shell are not paid model calls.
    default: return null;
  }
}

/** Pull a `--flag value` / `--flag=value` value out of argv, or null. */
function flagValue(argv: string[], name: string): string | null {
  const eq = `${name}=`;
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]!;
    if (t.startsWith(eq)) return t.slice(eq.length);
    if (t === name) return argv[i + 1] ?? null;
  }
  return null;
}

/**
 * Derive the per-call cost estimate from a generate.* job's argv: pulls
 * `--model`, `--variants`, `--duration` and the kind from the JobKind. Returns
 * `{ estimatedUsd, mode }`. When a precise estimate can't be derived (no kind),
 * `estimatedUsd` is 0 — the gate then degrades to the coarse "already at/over
 * cap" check (spent ≥ cap still blocks regardless of the estimate).
 */
export function deriveJobEstimate(job: JobRow): { estimatedUsd: number; mode?: string } {
  const kind = genKindOf(job.kind);
  const argv = job.command?.argv ?? [];
  const mode = flagValue(argv, "--mode") ?? undefined;
  if (!kind) return { estimatedUsd: 0, mode };

  const model = flagValue(argv, "--model") ?? undefined;
  const variantsRaw = flagValue(argv, "--variants");
  const durationRaw = flagValue(argv, "--duration");
  const variants = variantsRaw ? Math.max(1, parseInt(variantsRaw, 10) || 1) : 1;
  const durationSec = durationRaw ? Number(durationRaw) || 0 : 0;

  const estimatedUsd = estimatedCallCostUsd({ kind, model, durationSec, variants });
  return { estimatedUsd, mode };
}

/**
 * Pre-dispatch spend gate for a queued job. Resolves the effective approval for
 * the job's project (project → run) and blocks when it's expired, the mode is
 * not allowed, or spent (+estimate) would exceed the cap.
 *
 * Returns `{ allowed: true }` (pass-through) for:
 *   • a job with no project_id (can't resolve a scope — never crash, #481),
 *   • a non-paid kind with no ledger in the chain,
 *   • a project/run that has no ledger (the opt-in floor — un-enrolled work is
 *     unchanged, mirroring the direct `--queue`-less path).
 */
export async function checkQueuedJobSpend(
  job: JobRow,
): Promise<{ allowed: boolean; reason: string | null }> {
  // No project association → nothing to resolve; let it run (a job that wants
  // enforcement must carry project_id, exactly like the direct path).
  if (!job.project_id) return { allowed: true, reason: null };

  const { estimatedUsd, mode } = deriveJobEstimate(job);
  const verdict = await checkSpend(job.project_id, { estimatedUsd, mode });
  return { allowed: verdict.allowed, reason: verdict.reason };
}
