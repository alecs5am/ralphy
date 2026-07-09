// `campaign-next` node executor (#528) — the campaign-plan selection source.
//
// Mirrors trendWatchExecutor (cli/lib/workflow/executors/ingestion.ts): where
// trend-watch watches live feeds and emits the delta since the last tick,
// campaign-next drains the next UNPRODUCED plan cell so ticks walk the plan.
// It is STATEFUL per-workspace like trend-watch's cursor — but the cursor here
// IS the plan cell's own `status`: a produced unit STAMPS its cell (status →
// produced, linkedUnitId set), so the next tick naturally skips it. Nothing to
// re-cursor on disk.
//
// It emits the same `source-item[]` port every ingestion node emits, so a
// campaign plan cell flows through the SAME downstream production graph a
// trend item would (the `text` carries the cell brief; provenance names the
// campaign + cell so the produced unit can be stamped back).
//
// params:
//   campaign     (required) — the campaign id to drain.
//   count        (default 1) — how many cells to drain this tick.

import { readCampaign, unproducedCells } from "../../campaign/store.js";
import { writeNodeArtifact } from "./llm.js";
import { NodeExecutionError } from "./types.js";
import type { ExecutorContext, NodeExecutor } from "./types.js";
import type { WorkflowNode } from "../../schemas/workflow.js";
import type { SourceItem } from "../../schemas/source-item.js";
import type { CampaignCell } from "../../schemas/campaign.js";
import { readLatestWeights, readSelectionFlags, buildLookup, sampleWeighted, lengthBand, type Candidate } from "../../selection.js";
import { makePrng } from "../../farm/prng.js";

type CampaignNextParams = {
  campaign?: string;
  count?: number;
};

/** Shape one campaign cell into the normalized source-item[] payload. */
function cellToSourceItem(campaignId: string, cell: CampaignCell, ts: string): SourceItem {
  return {
    // A campaign cell has no external URL — use a stable synthetic ref so the
    // downstream dedup/seen-store keys on the campaign+cell identity.
    url: `campaign://${campaignId}/${cell.id}`,
    title: cell.angle,
    // The production brief the downstream scenario/prompt nodes read.
    text: `${cell.angle}\n\nformat: ${cell.format}\nchannel: ${cell.channel}\nkeyword: ${cell.keyword}\nthesis: ${cell.thesisId}`,
    ts,
    source: {
      backend: "rss", // nearest existing backend enum; provenance is the campaign below
      feed: `campaign:${campaignId}`,
      query: cell.id,
    },
  };
}

export const campaignNextExecutor: NodeExecutor = async (node: WorkflowNode, ctx: ExecutorContext) => {
  const p = node.params as CampaignNextParams;
  if (typeof p.campaign !== "string" || p.campaign.length === 0) {
    throw new NodeExecutionError("params-invalid", `campaign-next node "${node.id}" requires params.campaign`);
  }
  const campaign = readCampaign(ctx.workspaceDir, p.campaign);
  if (!campaign) {
    throw new NodeExecutionError("campaign-not-found", `campaign-next node "${node.id}": campaign "${p.campaign}" not found in workspace`);
  }

  const count = Number.isInteger(p.count) && (p.count as number) > 0 ? (p.count as number) : 1;

  // The ordered candidate pool: unproduced cells by priority DESC, then plan
  // order (cli/lib/campaign/store.ts → unproducedCells).
  const pool = unproducedCells(campaign);

  // ── #532 bias ────────────────────────────────────────────────────────────
  // COLD-START (no measured weights yet) → drain in the deterministic
  // priority/plan-order baseline, byte-for-byte identical to pre-#532. Only
  // once real weights exist do we bias WITHIN each priority band toward proven
  // winners (with sampleWeighted's exploration floor, so nothing is starved).
  // Priority still gates absolutely: a lower-priority band is never drained over
  // a due higher-priority one — the bias only reorders cells that share a band.
  const weights = readLatestWeights(ctx.workspace);
  const picked =
    weights && !weights.coldStart
      ? biasedDrain(pool, count, ctx, weights)
      : pool.slice(0, count);

  const now = (ctx.now ?? (() => new Date()))().toISOString();
  const items = picked.map((cell) => cellToSourceItem(campaign.id, cell, now));

  // Empty drain (plan exhausted) → emit [] and touch NOTHING (mirrors the
  // trend-watch empty-delta contract).
  const artifactPath = items.length > 0 ? await writeNodeArtifact(ctx, `${node.id}.json`, JSON.stringify(items, null, 2)) : undefined;
  return { output: items, artifactPath };
};

/**
 * Weight-biased drain of `count` cells from `pool` (already priority-DESC, plan
 * order). Priority GATES: cells are grouped into priority bands and drained
 * high→low; the bias only reorders cells that SHARE a band, so a lower-priority
 * cell is never drained over a due higher-priority one (mirrors #529's
 * within-band rule). Within a band, each cell's effective weight is the MEAN of
 * its measured dimension weights (angle / thesis / format / — when the variance
 * profile is stamped — hookType / lengthBand); `sampleWeighted` then picks
 * without replacement, so its exploration floor keeps every cell in reach.
 * Deterministic: the prng is seeded from workspace + campaign so a resume
 * reproduces the same order.
 */
function biasedDrain(
  pool: CampaignCell[],
  count: number,
  ctx: ExecutorContext,
  weights: NonNullable<ReturnType<typeof readLatestWeights>>,
): CampaignCell[] {
  const lookup = buildLookup(weights, readSelectionFlags(ctx.workspace));
  // A per-cell weight = the mean of its MEASURED dimension weights. Unmeasured
  // dimensions are SKIPPED (not folded in at the 0.5 baseline) so a strong
  // signal on one axis is not diluted to neutrality by axes with no data yet; a
  // cell with no measured dimension at all falls back to the shared baseline.
  const cellWeight = (cell: CampaignCell): number => {
    const dims: Candidate[] = [
      { dimension: "angle", value: cell.angle },
      { dimension: "thesis", value: cell.thesisId },
      { dimension: "format", value: cell.format },
    ];
    if (cell.variance) {
      dims.push({ dimension: "hookType", value: cell.variance.hookType });
      dims.push({ dimension: "lengthBand", value: lengthBand(cell.variance.targetLength, cell.variance.targetLengthUnit) });
    }
    const measured = dims.map((d) => lookup.weightOf(d.dimension, d.value)).filter((w): w is number => typeof w === "number");
    if (measured.length === 0) return 0.5;
    return measured.reduce((a, b) => a + b, 0) / measured.length;
  };

  const prng = makePrng(`campaign-next:${ctx.workspace}:${weights.computedAt}`);
  // Group into priority bands (DESC), preserving plan order within each band.
  const bands = new Map<number, CampaignCell[]>();
  for (const cell of pool) {
    const arr = bands.get(cell.priority) ?? [];
    arr.push(cell);
    bands.set(cell.priority, arr);
  }
  const priorities = [...bands.keys()].sort((a, b) => b - a);

  const picked: CampaignCell[] = [];
  for (const prio of priorities) {
    let remaining = [...bands.get(prio)!];
    while (remaining.length > 0 && picked.length < count) {
      // Cell weights map onto a synthetic per-cell lookup so sampleWeighted's
      // proportional + epsilon machinery works over whole cells.
      const wByCell = new Map(remaining.map((c) => [c.id, cellWeight(c)]));
      const cands: Candidate[] = remaining.map((c) => ({ dimension: "angle", value: c.id }));
      const cellLookup = {
        weightOf: (_dim: string, id: string) => wByCell.get(id),
        pinned: new Set<string>(),
        retired: new Set<string>(),
      };
      const chosenId = sampleWeighted(cands, cellLookup, { prng }).value;
      const idx = remaining.findIndex((c) => c.id === chosenId);
      picked.push(remaining[idx]!);
      remaining.splice(idx, 1);
    }
    if (picked.length >= count) break;
  }
  return picked;
}
