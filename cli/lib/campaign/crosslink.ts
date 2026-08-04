// Campaign cross-linking (#528) — the FIRST-CLASS mesh. Each produced unit
// knows its campaign siblings; a publish step injects sibling URLs into its
// description (media) / frontmatter (article) so the video links the article,
// the article embeds the video, shorts point at the longform. That mesh is the
// whole value of "30+30+30 on two theses" vs 90 independent briefs.
//
// This module owns the DATA + the injection TEXT builder; the actual injection
// reuses the publish path's description/frontmatter hook.
//
// HONEST-URL RULE: a sibling URL is resolved ONLY from a real publish-result
// record on the sibling's unit.json (#501 media publish[] / #527 article
// publish[]). A sibling that is planned/produced-but-unpublished has NO URL
// yet — it becomes a PENDING link (applied on the target's NEXT publish, never
// a retroactive edit of a live post). No URL is ever assumed or fabricated.

import { openDomainDb } from "../store/db.js";
import type { Campaign, CampaignCell } from "../schemas/campaign.js";
import type { UnitManifest } from "../schemas/unit.js";

/** A resolved sibling link: the cell + its published URL. */
export interface SiblingLink {
  cellId: string;
  format: string;
  url: string;
}

/**
 * The public URL of a unit, resolved from its publish records. Prefers an
 * article publish `url` (github-pages / devto / hashnode), else the first
 * media publish record's `url`/`postId`. Returns null when nothing published.
 *
 * The media `publish[]` record schema (#501) carries `postId` not a full
 * `url`; when a bare postId is all we have, it is returned as-is (the platform
 * URL is the caller's to shape). Article records carry a real `url`.
 */
export function resolvePublishedUrl(manifest: UnitManifest): string | null {
  const records = manifest.publish ?? [];
  // Prefer a record carrying an explicit url (article rails do), else postId.
  for (const r of records) {
    if (r.status !== "published" && r.status !== "scheduled" && r.status !== "idempotent-skip") continue;
    const url = (r as { url?: string | null }).url;
    if (typeof url === "string" && url.length > 0) return url;
  }
  for (const r of records) {
    if (r.status === "failed") continue;
    if (typeof r.postId === "string" && r.postId.length > 0) return r.postId;
  }
  return null;
}

/** Does a cross-link policy's linkFormats admit `format`? (`*` = any). */
export function policyAdmitsFormat(campaign: Campaign, format: string): boolean {
  const list = campaign.crossLink.linkFormats;
  return list.includes("*") || list.includes(format);
}

/**
 * Resolve the sibling links AVAILABLE to a target cell right now: every OTHER
 * cell in the campaign that (a) is admitted by the cross-link policy, (b) has a
 * produced linked unit, and (c) that unit has a resolvable published URL.
 * Capped at `crossLink.maxLinks`. Reads unit manifests off disk (async).
 */
export async function resolveSiblingLinks(
  campaign: Campaign,
  targetCell: CampaignCell,
): Promise<SiblingLink[]> {
  if (!campaign.crossLink.enabled) return [];
  const links: SiblingLink[] = [];
  for (const sibling of campaign.inventory) {
    if (sibling.id === targetCell.id) continue;
    if (!sibling.linkedUnitId) continue;
    if (!policyAdmitsFormat(campaign, sibling.format)) continue;
    const url = publishedUrlForUnitRevision(sibling.linkedUnitId);
    if (!url) continue;
    links.push({ cellId: sibling.id, format: sibling.format, url });
    if (links.length >= campaign.crossLink.maxLinks) break;
  }
  return links;
}

export function publishedUrlForUnitRevision(revisionId: string): string | null {
  const row = openDomainDb()
    .query<{ url: string | null }, [string]>(
      `SELECT publication.url
       FROM unit_revisions revision
       JOIN unit_presentations presentation ON presentation.unit_revision_id = revision.id
       JOIN publications publication ON publication.presentation_id = presentation.id
       WHERE revision.id = ?
         AND publication.state IN ('scheduled', 'submitted', 'published')
         AND publication.url IS NOT NULL
       ORDER BY CASE publication.state WHEN 'published' THEN 0 ELSE 1 END,
                publication.updated_at DESC, publication.id DESC
       LIMIT 1`,
    )
    .get(revisionId);
  return row?.url ?? null;
}

/** Split a "project/slug" linkedUnitId. */
export function splitUnitId(linkedUnitId: string): [string | null, string | null] {
  const idx = linkedUnitId.indexOf("/");
  if (idx < 0) return [null, null];
  return [linkedUnitId.slice(0, idx), linkedUnitId.slice(idx + 1)];
}

/**
 * Build the cross-link block injected into a MEDIA unit's description: a plain
 * "Related:" list. Empty links → empty string (no dangling header).
 */
export function buildDescriptionLinkBlock(links: SiblingLink[]): string {
  if (links.length === 0) return "";
  const lines = ["Related in this series:", ...links.map((l) => `- ${l.url}`)];
  return lines.join("\n");
}

/**
 * Build the cross-link frontmatter fragment injected into an ARTICLE unit: a
 * `related:` YAML list. Empty links → empty string. Meant to be appended to the
 * frontmatter body (the publish path merges it into renderFrontmatter's block).
 */
export function buildFrontmatterLinkBlock(links: SiblingLink[]): string {
  if (links.length === 0) return "";
  return `related:\n${links.map((l) => `  - ${JSON.stringify(l.url)}`).join("\n")}`;
}

/**
 * Inject the sibling links into an existing description string. Idempotent-ish:
 * appends the block after a blank line. The publish node calls this to enrich
 * the outgoing description; the SOURCE unit media is never rewritten (the block
 * is added to the outbound copy only).
 */
export function injectDescription(description: string, links: SiblingLink[]): string {
  const block = buildDescriptionLinkBlock(links);
  if (!block) return description;
  return description.trim().length > 0 ? `${description.trim()}\n\n${block}` : block;
}
