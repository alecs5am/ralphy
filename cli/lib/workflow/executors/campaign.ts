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

  // ── #532 SEAM ──────────────────────────────────────────────────────────────
  // The weight-biased ordering plugs in HERE: #532 will read the workspace's
  // latest selection weights (readLatestWeights) + flags (readSelectionFlags),
  // build a WeightLookup, and REORDER `pool` per pick via sampleWeighted
  // (cli/lib/selection.ts) so proven-winning (format, channel, …) dimensions
  // drain first. Until then the order is the deterministic priority/plan-order
  // baseline `unproducedCells` returns — do NOT wire the bias here (#532 owns it).
  const picked = pool.slice(0, count);

  const now = (ctx.now ?? (() => new Date()))().toISOString();
  const items = picked.map((cell) => cellToSourceItem(campaign.id, cell, now));

  // Empty drain (plan exhausted) → emit [] and touch NOTHING (mirrors the
  // trend-watch empty-delta contract).
  const artifactPath = items.length > 0 ? await writeNodeArtifact(ctx, `${node.id}.json`, JSON.stringify(items, null, 2)) : undefined;
  return { output: items, artifactPath };
};
