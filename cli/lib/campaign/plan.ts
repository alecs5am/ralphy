// Campaign planning (#528) — the bounded research + generate-object pass that
// PROPOSES a keyword matrix + planned inventory from a campaign's theses. One
// callLLM() pass; the user APPROVES before anything queues (the CLI verb prints
// the proposal and only writes it on `--commit`). This module is PURE proposal
// generation — it never mutates campaign.json (commitPlan in store.ts does),
// and the LLM call is behind an `llmImpl` seam so tests mock it (no network).
//
// MODEL: anthropic/claude-sonnet-4.6 — the strategic-reasoning tier the
// scenarist / analytics-postmortem passes already use (MODELS.md). Read
// MODELS.md before changing this id; Claude's training is stale.

import { callLLM } from "../providers/llm.js";
import type { CallLLMOptions, CallLLMResult } from "../providers/types.js";
import {
  parseCampaign,
  CampaignCellSchema,
  KeywordMatrixSchema,
  CAMPAIGN_CHANNELS,
  type Campaign,
  type CampaignCell,
  type KeywordMatrix,
} from "../schemas/campaign.js";
import { UNIT_FORMATS } from "../schemas/unit.js";
import { z } from "zod";

/** The strategic-planning model (MODELS.md — same tier as scenarist). */
export const CAMPAIGN_PLAN_MODEL = "anthropic/claude-sonnet-4.6";

export type LLMImpl = (opts: CallLLMOptions) => Promise<CallLLMResult>;

const SYSTEM_PROMPT = [
  "You are a content-strategy planner for a topic campaign.",
  "Given a set of THESES (durable statements a brand wants to occupy) and target",
  "formats + channels, propose a keyword matrix and a planned unit inventory.",
  "",
  "Return STRICT JSON with this shape (no prose, no markdown fences):",
  "{",
  '  "keywords": { "head": string[], "longTail": string[], "questions": string[] },',
  '  "inventory": [',
  "    {",
  '      "id": string (kebab-case, unique),',
  '      "thesisId": string (one of the given thesis ids),',
  `      "format": one of ${UNIT_FORMATS.join(" | ")},`,
  '      "angle": string (the creative hook for this cell),',
  '      "keyword": string (a term from the matrix),',
  `      "channel": one of ${CAMPAIGN_CHANNELS.join(" | ")},`,
  '      "priority": integer (higher drains first)',
  "    }",
  "  ]",
  "}",
  "",
  "RULES:",
  "- head terms are broad/high-volume; longTail are specific phrases; questions",
  "  are natural-language queries (GEO / LLM-answer surface).",
  "- Every inventory cell must reference a real thesisId and a keyword from the matrix.",
  "- Spread cells across the requested formats and channels; set priority so the",
  "  anchor formats (articles / longform video) drain first.",
  "- Do NOT invent coverage numbers or indexing claims — this is a PLAN only.",
].join("\n");

/** The parsed, VALIDATED proposal — matrix + inventory ready for commitPlan. */
export interface CampaignPlanProposal {
  keywords: KeywordMatrix;
  inventory: CampaignCell[];
  /** Cells the LLM proposed that failed validation (dropped, surfaced honestly). */
  dropped: number;
  model: string;
}

/** The zod shape the LLM output is parsed against before it can be committed. */
const ProposalSchema = z.object({
  keywords: KeywordMatrixSchema,
  inventory: z.array(z.unknown()),
});

/**
 * Validate + coerce the LLM's raw JSON into a committable proposal. A cell that
 * references an unknown thesisId, or fails the CampaignCell schema, is DROPPED
 * (counted) rather than poisoning the plan. Cell ids are de-duplicated.
 */
export function parseProposal(rawText: string, campaign: Campaign, model: string): CampaignPlanProposal {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("campaign plan: model did not return valid JSON");
  }
  const shell = ProposalSchema.parse(parsed);
  const thesisIds = new Set(campaign.theses.map((t) => t.id));
  const seen = new Set<string>();
  const inventory: CampaignCell[] = [];
  let dropped = 0;
  for (const raw of shell.inventory) {
    const res = CampaignCellSchema.safeParse({ status: "planned", ...(raw as object) });
    if (!res.success) {
      dropped += 1;
      continue;
    }
    const cell = res.data;
    if (!thesisIds.has(cell.thesisId) || seen.has(cell.id)) {
      dropped += 1;
      continue;
    }
    seen.add(cell.id);
    inventory.push(cell);
  }
  return { keywords: shell.keywords, inventory, dropped, model };
}

/**
 * Run the bounded plan pass. `keywordSeeds` (the optional user-supplied seeds)
 * are folded into the prompt so the model extends rather than ignores them.
 * The LLM is behind `llmImpl` (default: the real callLLM) — tests inject a stub.
 */
export async function proposeCampaignPlan(opts: {
  campaign: Campaign;
  formats?: string[];
  channels?: string[];
  llmImpl?: LLMImpl;
}): Promise<CampaignPlanProposal> {
  const { campaign } = opts;
  if (campaign.theses.length === 0) {
    throw new Error(`campaign "${campaign.id}" has no theses — add theses before planning`);
  }
  const llm = opts.llmImpl ?? callLLM;
  const userPayload = {
    theses: campaign.theses,
    keywordSeeds: campaign.keywords,
    formats: opts.formats ?? [...UNIT_FORMATS],
    channels: opts.channels ?? [...CAMPAIGN_CHANNELS],
  };
  const res = await llm({
    model: CAMPAIGN_PLAN_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(userPayload, null, 2) },
    ],
    jsonMode: true,
    maxTokens: 4000,
    endpoint: "openrouter/campaign-plan",
  });
  return parseProposal(res.text, campaign, CAMPAIGN_PLAN_MODEL);
}

/**
 * Re-parse a committed campaign (used after commitPlan to hand the caller a
 * fresh Campaign — the store already validated, this is a convenience).
 */
export function reparse(campaign: Campaign): Campaign {
  return parseCampaign(campaign);
}
