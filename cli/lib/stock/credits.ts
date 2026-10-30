// `ralphy stock credits` (#596): the attribution block for every stock item
// pulled into a Project, read from the provenance `stock pull` stored on each
// Artifact revision (the domain store is authoritative; nothing on disk is
// consulted). One credit per candidate id, however often it was pulled.

import { openDomainDb } from "../store/db.js";

export type StockCredit = {
  candidateId: string;
  source: string;
  title: string;
  slot: string;
  revisionId: string;
  path: string | null;
  license: string;
  licenseUrl: string | null;
  author: string | null;
  pageUrl: string;
  attribution: string;
  attributionRequired: boolean;
};

type Row = { revisionId: string; slot: string; metadata: string | null };

/** Stock credits of one Project, in pull order (first pull of each item). */
export function listStockCredits(scope: { workspaceId: string; projectId: string }): StockCredit[] {
  const rows = openDomainDb()
    .query<Row, [string, string]>(
      `SELECT r.id AS revisionId, a.slug AS slot, r.metadata_json AS metadata
       FROM artifact_revisions r JOIN artifacts a ON a.id = r.artifact_id
       WHERE a.workspace_id = ? AND a.project_id = ?
         AND json_extract(r.metadata_json, '$.operation') = 'stock'
       ORDER BY r.created_at ASC, r.id ASC`,
    )
    .all(scope.workspaceId, scope.projectId);
  const credits = new Map<string, StockCredit>();
  for (const row of rows) {
    let meta: Record<string, unknown>;
    try {
      meta = JSON.parse(row.metadata ?? "null") as Record<string, unknown>;
    } catch {
      continue;
    }
    const candidateId = str(meta?.candidateId);
    const attribution = str(meta?.attribution);
    if (!candidateId || !attribution || credits.has(candidateId)) continue;
    credits.set(candidateId, {
      candidateId,
      source: str(meta.source) ?? candidateId.split(":")[0]!,
      title: str(meta.title) ?? candidateId,
      slot: row.slot,
      revisionId: row.revisionId,
      path: str(meta.projectPath),
      license: str(meta.license) ?? "unknown",
      licenseUrl: str(meta.licenseUrl),
      author: str(meta.author),
      pageUrl: str(meta.pageUrl) ?? "",
      attribution,
      attributionRequired: meta.attributionRequired !== false,
    });
  }
  return [...credits.values()];
}

/**
 * The markdown block for the post caption / description: required credits
 * first, then the courtesy credits of items whose license does not ask for one.
 */
export function stockCreditsMarkdown(credits: readonly StockCredit[]): string {
  if (credits.length === 0) return "";
  const required = credits.filter((c) => c.attributionRequired);
  const courtesy = credits.filter((c) => !c.attributionRequired);
  const lines = ["**Credits**", ""];
  for (const c of required) lines.push(`- ${c.attribution}`);
  if (courtesy.length > 0) {
    if (required.length > 0) lines.push("");
    lines.push(required.length > 0 ? "Also used (no attribution required):" : "Used (no attribution required):");
    for (const c of courtesy) lines.push(`- ${c.attribution}`);
  }
  return `${lines.join("\n")}\n`;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
