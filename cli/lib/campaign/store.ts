// Campaign state store (#528). The single door onto `campaign.json` used by
// the CLI verbs in cli/commands/campaign.ts. Every function takes the
// ABSOLUTE workspace dir so the module is decoupled from the paths-root
// singleton and trivially testable.
//
// campaign.json is engine STATE: a produced-cell stamp is an UPDATE to this
// file (never a media overwrite), so it does not touch AGENTS.md invariant #14.
// The mutation discipline the schema comment describes lives here:
//   • the matrix + inventory are set ONCE by commitPlan (idempotent-guarded).
//   • a cell is stamped in place (stampCellProduced / markCellPublished).
//   • pendingLinks is append-only.

import path from "node:path";
import {
  parseCampaign,
  type Campaign,
  type CampaignCell,
  type KeywordMatrix,
  type PendingLink,
} from "../schemas/campaign.js";
import { assignVarianceProfile, type VarianceBias } from "../eval/variance-pools.js";
import { getCommandContext } from "../context-state.js";
import { appendActivity } from "../store/activity.js";
import { openDomainDb, withImmediateTransaction } from "../store/db.js";
import { newDomainId } from "../store/ids.js";

/**
 * Stamp a batch-variance profile (#529) onto every cell that lacks one, drawn
 * from its FORMAT's rotation pool. Cells are grouped by format so each format's
 * pool rotation covers its own items (no dimension starved). `salt` (the
 * campaign id) makes two campaigns of the same size stamp distinctly. Pure —
 * returns a new inventory array; never mutates the input cells.
 *
 * #532: when `bias` is supplied (the workspace has measured selection weights),
 * the profile's `hookType` + length band are drawn toward proven winners with
 * the exploration floor. Absent (cold-start) → byte-for-byte the pre-#532
 * uniform rotation, so the coverage guarantee holds until data exists.
 */
export function stampVariance(inventory: CampaignCell[], salt: string, bias?: VarianceBias): CampaignCell[] {
  const indexByFormat = new Map<string, number>();
  const countByFormat = new Map<string, number>();
  for (const c of inventory) countByFormat.set(c.format, (countByFormat.get(c.format) ?? 0) + 1);
  return inventory.map((cell) => {
    if (cell.variance) return cell;
    const i = indexByFormat.get(cell.format) ?? 0;
    indexByFormat.set(cell.format, i + 1);
    const variance = assignVarianceProfile(cell.format, i, countByFormat.get(cell.format) ?? 1, salt, bias);
    return { ...cell, variance };
  });
}

/**
 * Build the #532 variance bias from the workspace dir's on-disk weights, or
 * null at cold-start (no `selection-weights.jsonl`, or its latest snapshot is
 * cold-start). Reads the JSONL files directly from the absolute dir so the
 * store stays decoupled from the paths singleton (its module contract). The
 * prng is seeded from the campaign id + the weights timestamp → deterministic
 * and reproducible across a re-commit against the same weights.
 */
/** `<workspace>/campaigns/<id>/campaign.json` */
export function campaignPath(workspaceDir: string, id: string): string {
  return path.join(workspaceDir, "campaigns", id, "campaign.json");
}

export function campaignExists(workspaceDir: string, id: string): boolean {
  return readCampaign(workspaceDir, id) !== null;
}

/** Read a campaign by id, or null when it does not exist. */
export function readCampaign(workspaceDir: string, id: string): Campaign | null {
  const workspaceId = campaignWorkspaceId(workspaceDir);
  const db = openDomainDb();
  const row = db
    .query<CampaignRow, [string, string, string]>(
      "SELECT * FROM campaigns WHERE workspace_id = ? AND (id = ? OR slug = ?)",
    )
    .get(workspaceId, id, id);
  return row ? campaignFromRow(db, row) : null;
}

/** List campaign ids in a workspace (dir basenames under campaigns/). */
export function listCampaigns(workspaceDir: string): string[] {
  return openDomainDb()
    .query<{ slug: string }, [string]>(
      "SELECT slug FROM campaigns WHERE workspace_id = ? ORDER BY slug",
    )
    .all(campaignWorkspaceId(workspaceDir))
    .map((row) => row.slug);
}

/**
 * Scaffold a campaign from theses (+ optional keyword seeds). Fails if the id
 * already exists — a campaign is created once, then mutated via its verbs.
 */
export function createCampaign(
  workspaceDir: string,
  init: {
    id: string;
    title?: string;
    theses: Array<{ id: string; statement: string }>;
    keywords?: Partial<KeywordMatrix>;
  },
): Campaign {
  if (campaignExists(workspaceDir, init.id)) {
    throw new Error(`campaign "${init.id}" already exists — pick a distinct id`);
  }
  const campaign = parseCampaign({
    id: init.id,
    title: init.title ?? init.id,
    theses: init.theses,
    keywords: init.keywords ?? {},
    createdAt: new Date().toISOString(),
  });
  const workspaceId = campaignWorkspaceId(workspaceDir);
  const now = Date.parse(campaign.createdAt);
  withImmediateTransaction((db) => {
    const domainId = newDomainId("campaign");
    db.prepare(
      `INSERT INTO campaigns
       (id, workspace_id, slug, title, state, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`,
    ).run(
      domainId,
      workspaceId,
      campaign.id,
      campaign.title,
      campaignMetadataJson(campaign),
      now,
      now,
    );
    appendActivity(db, {
      workspaceId,
      entityType: "campaign",
      entityId: domainId,
      action: "campaign.created",
      payload: { slug: campaign.id, state: "draft" },
      createdAt: now,
    });
  });
  return campaign;
}

/**
 * Commit a proposed plan (matrix + inventory) — the user-approved write. Sets
 * `planned: true`. Idempotency guard: refuses to overwrite an already-committed
 * plan unless `force` (a re-plan is a deliberate act, not an accident).
 */
export function commitPlan(
  workspaceDir: string,
  id: string,
  plan: { keywords: KeywordMatrix; inventory: CampaignCell[] },
  opts: { force?: boolean } = {},
): Campaign {
  const campaign = readCampaign(workspaceDir, id);
  if (!campaign) throw new Error(`campaign "${id}" not found`);
  if (campaign.planned && !opts.force) {
    throw new Error(`campaign "${id}" is already planned — pass --force to replace the matrix + inventory`);
  }
  const next = parseCampaign({
    ...campaign,
    keywords: plan.keywords,
    // #529: stamp a per-format variance profile onto every cell at commit time.
    // #532: bias the hook/length picks toward measured winners when the
    // workspace has selection weights; undefined at cold-start (uniform).
    inventory: stampVariance(plan.inventory, id),
    planned: true,
  });
  const workspaceId = campaignWorkspaceId(workspaceDir);
  withImmediateTransaction((db) => {
    const row = requireCampaignRow(db, workspaceId, id);
    db.prepare("DELETE FROM campaign_cells WHERE campaign_id = ?").run(row.id);
    const now = Date.now();
    next.inventory.forEach((cell, position) => {
      db.prepare(
        `INSERT INTO campaign_cells
         (id, workspace_id, campaign_id, thesis_id, format, angle, keyword,
          channel, priority, state, metadata_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        newDomainId("cell"),
        workspaceId,
        row.id,
        cell.thesisId,
        cell.format,
        cell.angle,
        cell.keyword,
        cell.channel,
        cell.priority,
        cell.status,
        JSON.stringify({ legacyId: cell.id, position, ...(cell.variance ? { variance: cell.variance } : {}) }),
        now + position,
        now,
      );
    });
    db.prepare(
      `UPDATE campaigns
       SET state = 'planned', metadata_json = ?, row_version = row_version + 1, updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
    ).run(campaignMetadataJson(next), now, row.id, workspaceId);
    appendActivity(db, {
      workspaceId,
      entityType: "campaign",
      entityId: row.id,
      action: "campaign.planned",
      payload: { cells: next.inventory.length },
      createdAt: now,
    });
  });
  return next;
}

// ─── Cell selection + lifecycle ───────────────────────────────────────────────

/**
 * The next UNPRODUCED cell to drain, by the DEFAULT order: priority DESC, then
 * plan order (inventory index). This is the deterministic baseline the
 * campaign-next node uses; the #532 weight-bias plugs in at the executor's
 * seam, NOT here (this stays a pure, testable ordering).
 */
export function nextUnproducedCell(campaign: Campaign): CampaignCell | null {
  const open = campaign.inventory
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => cell.status === "planned");
  if (open.length === 0) return null;
  open.sort((a, b) => b.cell.priority - a.cell.priority || a.index - b.index);
  return open[0]!.cell;
}

/**
 * The unproduced cells in drain order (priority DESC, plan order). Exposed so
 * the campaign-next executor can offer the ordered candidate list to the #532
 * bias sampler without re-deriving the order.
 */
export function unproducedCells(campaign: Campaign): CampaignCell[] {
  return campaign.inventory
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => cell.status === "planned")
    .sort((a, b) => b.cell.priority - a.cell.priority || a.index - b.index)
    .map(({ cell }) => cell);
}

/** Stamp a cell produced: status → produced, linkedUnitId set, producedAt now. */
export function stampCellProduced(
  workspaceDir: string,
  id: string,
  cellId: string,
  linkedUnitId: string,
): Campaign {
  const campaign = readCampaign(workspaceDir, id);
  if (!campaign) throw new Error(`campaign "${id}" not found`);
  const cell = campaign.inventory.find((c) => c.id === cellId);
  if (!cell) throw new Error(`campaign "${id}" has no cell "${cellId}"`);
  const workspaceId = campaignWorkspaceId(workspaceDir);
  withImmediateTransaction((db) => {
    assertUnitRevisionWorkspace(db, linkedUnitId, workspaceId);
    const row = requireCampaignRow(db, workspaceId, id);
    const cellRow = requireCampaignCellRow(db, row.id, cellId);
    const now = Date.now();
    db.prepare(
      `UPDATE campaign_cells
       SET state = 'produced', unit_revision_id = ?, produced_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(linkedUnitId, now, now, cellRow.id);
    appendActivity(db, {
      workspaceId,
      entityType: "campaign_cell",
      entityId: cellRow.id,
      action: "campaign_cell.produced",
      payload: { campaignId: row.id },
      createdAt: now,
    });
  });
  return readCampaign(workspaceDir, id)!;
}

/** Mark a produced cell published (the coverage ledger's published tier). */
export function markCellPublished(workspaceDir: string, id: string, cellId: string): Campaign {
  const campaign = readCampaign(workspaceDir, id);
  if (!campaign) throw new Error(`campaign "${id}" not found`);
  const cell = campaign.inventory.find((c) => c.id === cellId);
  if (!cell) throw new Error(`campaign "${id}" has no cell "${cellId}"`);
  if (cell.status === "planned") {
    throw new Error(`cell "${cellId}" is still planned — stamp it produced before publishing`);
  }
  const workspaceId = campaignWorkspaceId(workspaceDir);
  withImmediateTransaction((db) => {
    const row = requireCampaignRow(db, workspaceId, id);
    const cellRow = requireCampaignCellRow(db, row.id, cellId);
    const now = Date.now();
    db.prepare("UPDATE campaign_cells SET state = 'published', updated_at = ? WHERE id = ?")
      .run(now, cellRow.id);
    appendActivity(db, {
      workspaceId,
      entityType: "campaign_cell",
      entityId: cellRow.id,
      action: "campaign_cell.published",
      payload: { campaignId: row.id },
      createdAt: now,
    });
  });
  return readCampaign(workspaceDir, id)!;
}

/** Append a pending cross-link (a sibling published after this unit). */
export function appendPendingLink(workspaceDir: string, id: string, link: Omit<PendingLink, "recordedAt">): Campaign {
  const campaign = readCampaign(workspaceDir, id);
  if (!campaign) throw new Error(`campaign "${id}" not found`);
  campaign.pendingLinks.push({ ...link, recordedAt: new Date().toISOString() });
  updateCampaignMetadata(workspaceDir, campaign, "campaign.pending_link.appended");
  return readCampaign(workspaceDir, id)!;
}

/** Drop pending links for a target cell (applied on its next publish). */
export function clearPendingLinksFor(workspaceDir: string, id: string, targetCellId: string): Campaign {
  const campaign = readCampaign(workspaceDir, id);
  if (!campaign) throw new Error(`campaign "${id}" not found`);
  campaign.pendingLinks = campaign.pendingLinks.filter((l) => l.targetCellId !== targetCellId);
  updateCampaignMetadata(workspaceDir, campaign, "campaign.pending_links.cleared");
  return readCampaign(workspaceDir, id)!;
}

type CampaignRow = {
  id: string;
  workspace_id: string;
  slug: string;
  title: string;
  state: string;
  metadata_json: string | null;
  row_version: number;
  created_at: number;
  updated_at: number;
};

type CampaignCellRow = {
  id: string;
  thesis_id: string;
  format: CampaignCell["format"];
  angle: string;
  keyword: string;
  channel: CampaignCell["channel"];
  priority: number;
  state: CampaignCell["status"];
  unit_revision_id: string | null;
  produced_at: number | null;
  metadata_json: string | null;
};

type CampaignMetadata = Pick<Campaign, "theses" | "keywords" | "crossLink" | "pendingLinks">;

function campaignWorkspaceId(_workspaceDir: string): string {
  const workspaceId = getCommandContext()?.workspaceId;
  if (!workspaceId) throw new Error("Campaign operations require an explicit Workspace scope");
  return workspaceId;
}

function campaignMetadataJson(campaign: Campaign): string {
  return JSON.stringify({
    theses: campaign.theses,
    keywords: campaign.keywords,
    crossLink: campaign.crossLink,
    pendingLinks: campaign.pendingLinks,
  } satisfies CampaignMetadata);
}

function campaignFromRow(db: import("bun:sqlite").Database, row: CampaignRow): Campaign {
  const metadata = JSON.parse(row.metadata_json ?? "{}") as CampaignMetadata;
  const inventory = db
    .query<CampaignCellRow, [string]>(
      `SELECT id, thesis_id, format, angle, keyword, channel, priority, state,
              unit_revision_id, produced_at, metadata_json
       FROM campaign_cells WHERE campaign_id = ? ORDER BY created_at, id`,
    )
    .all(row.id)
    .map((cell) => {
      const extra = JSON.parse(cell.metadata_json ?? "{}") as {
        legacyId?: string;
        variance?: CampaignCell["variance"];
      };
      return {
        id: extra.legacyId ?? cell.id,
        thesisId: cell.thesis_id,
        format: cell.format,
        angle: cell.angle,
        keyword: cell.keyword,
        channel: cell.channel,
        priority: cell.priority,
        status: cell.state,
        ...(extra.variance ? { variance: extra.variance } : {}),
        ...(cell.unit_revision_id ? { linkedUnitId: cell.unit_revision_id } : {}),
        ...(cell.produced_at ? { producedAt: new Date(cell.produced_at).toISOString() } : {}),
      } satisfies CampaignCell;
    });
  return parseCampaign({
    version: "1.0",
    id: row.slug,
    title: row.title,
    theses: metadata.theses ?? [],
    keywords: metadata.keywords ?? {},
    inventory,
    crossLink: metadata.crossLink ?? {},
    pendingLinks: metadata.pendingLinks ?? [],
    createdAt: new Date(row.created_at).toISOString(),
    planned: row.state !== "draft",
  });
}

function requireCampaignRow(
  db: import("bun:sqlite").Database,
  workspaceId: string,
  idOrSlug: string,
): CampaignRow {
  const row = db.query<CampaignRow, [string, string, string]>(
    "SELECT * FROM campaigns WHERE workspace_id = ? AND (id = ? OR slug = ?)",
  ).get(workspaceId, idOrSlug, idOrSlug);
  if (!row) throw new Error(`campaign "${idOrSlug}" not found`);
  return row;
}

function requireCampaignCellRow(
  db: import("bun:sqlite").Database,
  campaignId: string,
  cellId: string,
): { id: string } {
  const rows = db.query<{ id: string; metadataJson: string | null }, [string]>(
    "SELECT id, metadata_json AS metadataJson FROM campaign_cells WHERE campaign_id = ?",
  ).all(campaignId);
  const row = rows.find((candidate) => {
    const metadata = JSON.parse(candidate.metadataJson ?? "{}") as { legacyId?: string };
    return candidate.id === cellId || metadata.legacyId === cellId;
  });
  if (!row) throw new Error(`campaign has no cell "${cellId}"`);
  return row;
}

function assertUnitRevisionWorkspace(
  db: import("bun:sqlite").Database,
  revisionId: string,
  workspaceId: string,
): void {
  const row = db.query<{ workspaceId: string }, [string]>(
    `SELECT unit.workspace_id AS workspaceId
     FROM unit_revisions revision JOIN units unit ON unit.id = revision.unit_id
     WHERE revision.id = ?`,
  ).get(revisionId);
  if (!row || row.workspaceId !== workspaceId) {
    throw new Error("Unit Revision is outside the Campaign Workspace");
  }
}

function updateCampaignMetadata(
  workspaceDir: string,
  campaign: Campaign,
  action: string,
): void {
  const workspaceId = campaignWorkspaceId(workspaceDir);
  withImmediateTransaction((db) => {
    const row = requireCampaignRow(db, workspaceId, campaign.id);
    const now = Date.now();
    db.prepare(
      "UPDATE campaigns SET metadata_json = ?, row_version = row_version + 1, updated_at = ? WHERE id = ?",
    ).run(campaignMetadataJson(campaign), now, row.id);
    appendActivity(db, {
      workspaceId,
      entityType: "campaign",
      entityId: row.id,
      action,
      payload: {},
      createdAt: now,
    });
  });
}
