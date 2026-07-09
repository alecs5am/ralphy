// Topic-campaign Zod schema (#528). A `campaign.json` is a WORKSPACE-SCOPED
// entity: a keyword/topic cluster mapped to a planned set of units across
// formats + channels, with cross-linking and a coverage ledger. It lives at
// `.ralphy/workspaces/<ws>/campaigns/<id>/campaign.json`.
//
// A campaign is NOT a farm run (#480 binds one run's projects) and NOT a
// variant matrix (#456 varies creative in a batch) — it is the STRATEGIC plan
// above both: "occupy these theses with these keywords across these formats".
//
// campaign.json is engine STATE (like calendar.json / registry.json): a
// produced-cell STAMP is an UPDATE to this file, never a media overwrite, so it
// does not touch AGENTS.md invariant #14. The mutation discipline (a new cell
// is appended; a cell is stamped in place; the theses/matrix are set once by
// `plan --commit`) lives in the command + store, not the schema. English-only.

import { z } from "zod";
import { UNIT_FORMATS } from "./unit.js";

/** Campaign id / cell slug regex — kebab-case (matches the entity convention). */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/u;

/**
 * A thesis: the durable statement the campaign occupies. Each thesis carries a
 * stable id (referenced by cells) so a cell can say which thesis it advances.
 */
export const CampaignThesisSchema = z.object({
  /** Stable kebab-case id, unique within the campaign. */
  id: z.string().regex(SLUG_RE, "thesis id must be kebab-case"),
  /** The statement itself (e.g. "ralphy is a video studio for AI agents"). */
  statement: z.string(),
});
export type CampaignThesis = z.infer<typeof CampaignThesisSchema>;

/**
 * The keyword matrix — the SEO/GEO surface the campaign targets, split by term
 * shape. All three arrays are user-editable; the `plan` pass proposes them from
 * the theses and the user commits (or edits) before anything queues.
 */
export const KeywordMatrixSchema = z
  .object({
    /** Broad head terms (high volume, high competition). */
    head: z.array(z.string()).default([]),
    /** Long-tail phrases (specific, lower competition). */
    longTail: z.array(z.string()).default([]),
    /** Natural-language question queries (GEO / LLM-answer surface). */
    questions: z.array(z.string()).default([]),
  })
  .default({});
export type KeywordMatrix = z.infer<typeof KeywordMatrixSchema>;

/** Where a planned unit is published — a channel is a target surface. */
export const CAMPAIGN_CHANNELS = [
  "youtube",
  "tiktok",
  "instagram",
  "x",
  "github-pages",
  "devto",
  "hashnode",
  "medium",
] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

/**
 * A planned-inventory CELL: one intended unit. The plan is the cartesian
 * intent "for this thesis + keyword, make a <format> aimed at <channel>". A
 * cell moves through the lifecycle planned → produced → published as the farm
 * drains it; a produced unit STAMPS `linkedUnitId` (project/slug) + status.
 */
export const CAMPAIGN_CELL_STATUSES = ["planned", "produced", "published"] as const;
export type CampaignCellStatus = (typeof CAMPAIGN_CELL_STATUSES)[number];

export const CampaignCellSchema = z.object({
  /** Stable kebab-case id, unique within the campaign. */
  id: z.string().regex(SLUG_RE, "cell id must be kebab-case"),
  /** Which thesis this cell advances (a `theses[].id`). */
  thesisId: z.string(),
  /** Media format (the unit taxonomy — video | article | carousel | …). */
  format: z.enum(UNIT_FORMATS),
  /** The angle / hook for this cell (the creative brief seed). */
  angle: z.string(),
  /** Primary keyword this cell targets (from the matrix). */
  keyword: z.string(),
  /** Target publish channel. */
  channel: z.enum(CAMPAIGN_CHANNELS),
  /** Priority — HIGHER drains first (default drain order is priority DESC, plan order). */
  priority: z.number().int().default(0),
  /** Lifecycle status. */
  status: z.enum(CAMPAIGN_CELL_STATUSES).default("planned"),
  /**
   * The unit that satisfied this cell, once produced: "project/slug". Set by
   * the produced-cell stamp (`campaign stamp` / the campaign-next producer).
   */
  linkedUnitId: z.string().optional(),
  /** ISO timestamp the cell was stamped produced. */
  producedAt: z.string().optional(),
});
export type CampaignCell = z.infer<typeof CampaignCellSchema>;

/**
 * Cross-link policy — how sibling units reference each other. Cross-linking is
 * first-class: a video's description links its sibling article, the article
 * embeds the video, shorts point at the longform. The URLs are resolved from
 * publish-result records (#501/#527) at publish time; this policy says WHICH
 * siblings to inject and HOW.
 */
export const CrossLinkPolicySchema = z
  .object({
    /** Whether cross-linking is applied at all. */
    enabled: z.boolean().default(true),
    /**
     * Which sibling formats a cell links to. `["*"]` = every sibling in the
     * campaign; else the listed formats only (e.g. an article links back only
     * to its `video` siblings). Default: link to everything.
     */
    linkFormats: z.array(z.string()).default(["*"]),
    /**
     * Max siblings injected into one unit's description/frontmatter (keeps a
     * link block from ballooning on a large campaign).
     */
    maxLinks: z.number().int().positive().default(5),
  })
  .default({});
export type CrossLinkPolicy = z.infer<typeof CrossLinkPolicySchema>;

/**
 * A PENDING cross-link (#528): a sibling published AFTER this unit, so its URL
 * could not be injected when this unit was published. v1 applies pending links
 * on the unit's NEXT publish — NO retroactive edit of a live post. Surfaced in
 * `campaign status` so the mesh gap is visible.
 */
export const PendingLinkSchema = z.object({
  /** The cell whose unit should receive the link on its next publish. */
  targetCellId: z.string(),
  /** The sibling cell that produced the (now-available) URL. */
  sourceCellId: z.string(),
  /** The sibling's resolved public URL. */
  url: z.string(),
  /** ISO timestamp the pending link was recorded. */
  recordedAt: z.string(),
});
export type PendingLink = z.infer<typeof PendingLinkSchema>;

export const CAMPAIGN_VERSION = "1.0";

export const CampaignSchema = z.object({
  /** Schema version — bump when a field becomes required. */
  version: z.string().default(CAMPAIGN_VERSION),
  /** Campaign id (the dir basename under campaigns/). */
  id: z.string().regex(SLUG_RE, "campaign id must be kebab-case"),
  /** Human title. */
  title: z.string().default(""),
  /** The theses the campaign occupies. */
  theses: z.array(CampaignThesisSchema).default([]),
  /** The keyword/topic matrix. */
  keywords: KeywordMatrixSchema,
  /** The planned unit inventory (cells). Append-only; cells are stamped in place. */
  inventory: z.array(CampaignCellSchema).default([]),
  /** Cross-link policy. */
  crossLink: CrossLinkPolicySchema,
  /** Pending cross-links awaiting a next-publish injection. Append-only. */
  pendingLinks: z.array(PendingLinkSchema).default([]),
  /** ISO timestamp the campaign was created. */
  createdAt: z.string().default(() => new Date().toISOString()),
  /** True once `plan --commit` has written the matrix + inventory. */
  planned: z.boolean().default(false),
});
export type Campaign = z.infer<typeof CampaignSchema>;

/** Parse + validate an unknown value into a Campaign (throws ZodError when malformed). */
export function parseCampaign(raw: unknown): Campaign {
  return CampaignSchema.parse(raw);
}

/** True when `id` is a legal kebab-case campaign / cell id. */
export function isValidCampaignId(id: string): boolean {
  return SLUG_RE.test(id);
}
