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
import fs from "node:fs";
import {
  parseCampaign,
  type Campaign,
  type CampaignCell,
  type KeywordMatrix,
  type PendingLink,
} from "../schemas/campaign.js";
import { assignVarianceProfile, type VarianceBias } from "../eval/variance-pools.js";
import {
  buildLookup,
  parseWeightsFile,
  parseSelectionFlagsFile,
  type WeightsSnapshot,
} from "../selection.js";
import { makePrng } from "../prng.js";

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
function varianceBiasFor(workspaceDir: string, salt: string): VarianceBias | undefined {
  const weights: WeightsSnapshot | null = parseWeightsFile(path.join(workspaceDir, "selection-weights.jsonl"));
  if (!weights || weights.coldStart) return undefined;
  const flags = parseSelectionFlagsFile(path.join(workspaceDir, "lifecycle.jsonl"));
  return { lookup: buildLookup(weights, flags), prng: makePrng(`variance:${salt}:${weights.computedAt}`) };
}

/** `<workspace>/campaigns/<id>/campaign.json` */
export function campaignPath(workspaceDir: string, id: string): string {
  return path.join(workspaceDir, "campaigns", id, "campaign.json");
}

export function campaignExists(workspaceDir: string, id: string): boolean {
  return fs.existsSync(campaignPath(workspaceDir, id));
}

/** Read a campaign by id, or null when it does not exist. */
export function readCampaign(workspaceDir: string, id: string): Campaign | null {
  try {
    return parseCampaign(JSON.parse(fs.readFileSync(campaignPath(workspaceDir, id), "utf8")));
  } catch {
    return null;
  }
}

function writeCampaign(workspaceDir: string, campaign: Campaign): void {
  const dir = path.join(workspaceDir, "campaigns", campaign.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "campaign.json"), JSON.stringify(campaign, null, 2) + "\n");
}

/** List campaign ids in a workspace (dir basenames under campaigns/). */
export function listCampaigns(workspaceDir: string): string[] {
  try {
    return fs
      .readdirSync(path.join(workspaceDir, "campaigns"), { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(workspaceDir, "campaigns", e.name, "campaign.json")))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
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
  writeCampaign(workspaceDir, campaign);
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
    inventory: stampVariance(plan.inventory, id, varianceBiasFor(workspaceDir, id)),
    planned: true,
  });
  writeCampaign(workspaceDir, next);
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
  cell.status = "produced";
  cell.linkedUnitId = linkedUnitId;
  cell.producedAt = new Date().toISOString();
  const next = parseCampaign(campaign);
  writeCampaign(workspaceDir, next);
  return next;
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
  cell.status = "published";
  const next = parseCampaign(campaign);
  writeCampaign(workspaceDir, next);
  return next;
}

/** Append a pending cross-link (a sibling published after this unit). */
export function appendPendingLink(workspaceDir: string, id: string, link: Omit<PendingLink, "recordedAt">): Campaign {
  const campaign = readCampaign(workspaceDir, id);
  if (!campaign) throw new Error(`campaign "${id}" not found`);
  campaign.pendingLinks.push({ ...link, recordedAt: new Date().toISOString() });
  const next = parseCampaign(campaign);
  writeCampaign(workspaceDir, next);
  return next;
}

/** Drop pending links for a target cell (applied on its next publish). */
export function clearPendingLinksFor(workspaceDir: string, id: string, targetCellId: string): Campaign {
  const campaign = readCampaign(workspaceDir, id);
  if (!campaign) throw new Error(`campaign "${id}" not found`);
  campaign.pendingLinks = campaign.pendingLinks.filter((l) => l.targetCellId !== targetCellId);
  const next = parseCampaign(campaign);
  writeCampaign(workspaceDir, next);
  return next;
}
