// `analytics-pull` node executor (#507) — the loop-closing E-category node
// (docs/architecture/farm-node-graph.md "E. Publish nodes"): pull per-post
// metrics for the project's published units on the farm's cron ticks.
//
// SCHEDULE SEMANTICS: the runner fires this node whenever its graph ticks
// (typically a `schedule` entry node); the executor itself decides WHAT is
// due. `params.offsets` (default ["+1d", "+7d"]) are windows after each
// publish record's `at`: a record pulls when an offset has elapsed AND no
// snapshot at-or-after that due time exists yet for its (target, postId) —
// so a daily tick yields exactly one +1d and one +7d snapshot per post, not
// a snapshot per tick. Everything not due is a `skipped` row (visible on the
// output port), never an error.
//
// Params: `offsets` (string[] | comma string, default ["+1d","+7d"]),
// `project` (default ctx.projectId), `unit_slug` (default: every unit),
// `target` (restrict to one platform), `days` (Postiz lookback, default 7).
// Zero model calls, zero spend — pure connector reads + append-only
// analytics.jsonl writes (invariant #14 holds: snapshots only ever append).

import { pullProjectAnalytics, DEFAULT_PULL_OFFSETS } from "../../analytics/pull.js";
import type { FetchLike } from "../../providers/youtube-analytics.js";
import { writeNodeArtifact } from "./llm.js";
import { NodeExecutionError } from "./types.js";
import type { NodeExecutor } from "./types.js";

function parseOffsetsParam(raw: unknown): readonly string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length > 0) return list;
  }
  return DEFAULT_PULL_OFFSETS;
}

export const analyticsPullExecutor: NodeExecutor = async (node, ctx) => {
  const projectId = (node.params.project as string | undefined) ?? ctx.projectId;
  if (!projectId) {
    throw new NodeExecutionError(
      "params-invalid",
      `analytics-pull node "${node.id}" needs a project — set params.project or run project-scoped`,
    );
  }
  const offsets = parseOffsetsParam(node.params.offsets);
  const days = Number(node.params.days);

  let result;
  try {
    result = await pullProjectAnalytics({
      projectId,
      slug: node.params.unit_slug as string | undefined,
      target: node.params.target as string | undefined,
      days: Number.isFinite(days) && days > 0 ? days : 7,
      offsets,
      fetchImpl: ctx.fetchImpl as FetchLike | undefined,
    });
  } catch (e) {
    throw new NodeExecutionError("analytics-pull-failed", `analytics-pull node "${node.id}": ${(e as Error).message}`);
  }

  await ctx.log({
    provider: "analytics",
    model: "youtube-analytics|postiz",
    endpoint: "analytics-pull",
    kind: "analytics",
    status: "ok",
    input: { node: node.id, project: projectId, offsets, target: node.params.target ?? null },
    output: { fetched: result.fetched, skipped: result.skipped, units: result.units.length },
  });

  const payload = { ...result, offsets };
  const artifactPath = await writeNodeArtifact(ctx, `${node.id}.json`, JSON.stringify(payload, null, 2));
  return { output: payload, artifactPath };
};
