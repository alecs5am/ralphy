// Campaign coverage ledger (#528) — the honest join of PLAN vs reality. The
// `campaign status` verb's data layer.
//
// HONEST-METRICS RULE (the issue's hard clause): coverage claims come from
// publish RESULTS and analytics, never from assumptions about indexing. The
// four tiers are:
//   • planned    — cells in the plan (inventory length).
//   • produced   — cells stamped with a linked unit (status ≥ produced).
//   • published  — cells whose linked unit has a real publish record (#501/#527)
//                  OR whose cell status is `published`.
//   • indexedHint— cells whose linked unit has a MEASURED analytics snapshot
//                  with views > 0 (#507). This is a HINT ("discoverable"), NOT
//                  a claim of search indexing — we never assert indexing.

import { openDomainDb } from "../store/db.js";
import { publishedUrlForUnitRevision } from "./crosslink.js";
import type { Campaign } from "../schemas/campaign.js";

export interface CampaignCoverageRow {
  cellId: string;
  format: string;
  channel: string;
  keyword: string;
  status: string;
  linkedUnitId?: string;
  /** A real published URL resolved from the linked unit's publish records, else null. */
  publishedUrl: string | null;
  /** True when the linked unit has a measured analytics snapshot with views > 0. */
  indexedHint: boolean;
}

export interface CampaignCoverage {
  campaign: string;
  planned: boolean;
  counts: {
    planned: number;
    produced: number;
    published: number;
    /** Number of published cells with an analytics-backed discoverability hint. */
    indexedHint: number;
  };
  /** Keyword-matrix occupancy: how many head/long-tail/question terms have ≥1 cell. */
  keywordOccupancy: { head: number; longTail: number; questions: number };
  pendingLinks: number;
  rows: CampaignCoverageRow[];
}

/**
 * Compute the coverage ledger for a campaign. Reads each produced cell's linked
 * unit off disk to resolve a real published URL + an analytics-backed indexed
 * hint. NEVER fabricates a number — an unpublished cell has publishedUrl null
 * and indexedHint false.
 */
export async function computeCoverage(campaign: Campaign): Promise<CampaignCoverage> {
  const rows: CampaignCoverageRow[] = [];
  let produced = 0;
  let published = 0;
  let indexedHint = 0;

  for (const cell of campaign.inventory) {
    let publishedUrl: string | null = null;
    let hint = false;
    if (cell.status === "produced" || cell.status === "published") produced += 1;

    if (cell.linkedUnitId) {
      publishedUrl = publishedUrlForUnitRevision(cell.linkedUnitId);
      hint = Boolean(openDomainDb()
        .query<{ measured: number }, [string]>(
          `SELECT 1 AS measured
           FROM unit_revisions revision
           JOIN unit_presentations presentation ON presentation.unit_revision_id = revision.id
           JOIN publications publication ON publication.presentation_id = presentation.id
           JOIN metric_snapshots metric ON metric.publication_id = publication.id
           WHERE revision.id = ? AND metric.views > 0
           LIMIT 1`,
        )
        .get(cell.linkedUnitId));
    }

    // Published = the cell is marked published OR a real publish URL exists.
    const isPublished = cell.status === "published" || publishedUrl !== null;
    if (isPublished) published += 1;
    if (isPublished && hint) indexedHint += 1;

    rows.push({
      cellId: cell.id,
      format: cell.format,
      channel: cell.channel,
      keyword: cell.keyword,
      status: cell.status,
      linkedUnitId: cell.linkedUnitId,
      publishedUrl,
      indexedHint: isPublished && hint,
    });
  }

  const occupied = (terms: string[]) =>
    terms.filter((t) => campaign.inventory.some((c) => c.keyword === t)).length;

  return {
    campaign: campaign.id,
    planned: campaign.planned,
    counts: {
      planned: campaign.inventory.length,
      produced,
      published,
      indexedHint,
    },
    keywordOccupancy: {
      head: occupied(campaign.keywords.head),
      longTail: occupied(campaign.keywords.longTail),
      questions: occupied(campaign.keywords.questions),
    },
    pendingLinks: campaign.pendingLinks.length,
    rows,
  };
}
