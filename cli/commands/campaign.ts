// `ralphy campaign` (#528) — the WORKSPACE-SCOPED topic campaign: a
// keyword/topic cluster mapped to a planned set of units across formats +
// channels, with cross-linking + a coverage ledger.
//
//   • create <ws> <id>  — scaffold from theses (+ optional keyword seeds).
//   • show <id>         — the full campaign.json.
//   • plan <id>         — a BOUNDED research + generate-object pass PROPOSING
//                         the matrix + inventory. Prints the proposal; only
//                         `--commit` writes it (NEVER auto-queues paid work).
//                         `--schedule` proposes calendar slot assignments.
//   • status <id>       — the coverage ledger (planned / produced / published /
//                         indexed-hint from analytics #507, honest).
//   • stamp <id> <cell> — mark a cell produced (link a unit); lifecycle glue.
//
// The plan pass is the ONLY paid-gated verb (one callLLM() pass). Approval is
// enforced by the print-then-commit split: `plan` prints and stops unless
// `--commit`, so no matrix/inventory ever lands (and no downstream tick can
// drain it) without explicit user intent.

import { Command } from "commander";
import { existsSync } from "fs";
import { workspaceDir, campaignWorkspace, layoutMode, DEFAULT_WORKSPACE } from "../lib/paths.js";
import { out, ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { fillCalendar, nextFreeSlot } from "../lib/calendar/store.js";
import {
  createCampaign,
  readCampaign,
  commitPlan,
  stampCellProduced,
  listCampaigns,
} from "../lib/campaign/store.js";
import { proposeCampaignPlan } from "../lib/campaign/plan.js";
import { computeCoverage } from "../lib/campaign/report.js";
import { isValidCampaignId } from "../lib/schemas/campaign.js";

function requireWorkspace(verb: string, slug: string): string {
  if (layoutMode() === "legacy") raiseError("E_LEGACY_LAYOUT", { verb });
  const dir = workspaceDir(slug);
  if (slug !== DEFAULT_WORKSPACE && !existsSync(dir)) {
    raiseError("E_NOT_FOUND", { kind: "Workspace", id: slug });
  }
  return dir;
}

/** Resolve the workspace dir a campaign lives in (registry-free, dir-discovered). */
function resolveCampaignDir(verb: string, id: string): string {
  if (layoutMode() === "legacy") raiseError("E_LEGACY_LAYOUT", { verb });
  return workspaceDir(campaignWorkspace(id));
}

/**
 * Parse `--thesis "<id>=<statement>"` (repeatable) into thesis objects. Also
 * accepts a bare statement (auto-slugged id). At least one is required.
 */
function parseTheses(raw: string[] | undefined): Array<{ id: string; statement: string }> {
  const list = raw ?? [];
  return list.map((entry, i) => {
    const eq = entry.indexOf("=");
    if (eq > 0) {
      return { id: entry.slice(0, eq).trim(), statement: entry.slice(eq + 1).trim() };
    }
    return { id: `thesis-${i + 1}`, statement: entry.trim() };
  });
}

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function campaignCmd() {
  const cmd = new Command("campaign").description(
    "Workspace-scoped topic campaign (#528): theses + a keyword/topic matrix mapped to a planned unit inventory across formats + channels, with cross-linking + a coverage ledger. Stored at <workspace>/campaigns/<id>/campaign.json.",
  );

  // ── create ─────────────────────────────────────────────────────────────────
  cmd
    .command("create <ws> <id>")
    .description(
      'Scaffold a campaign from theses (+ optional keyword seeds). Example: ralphy campaign create my-studio agent-video --thesis "studio=ralphy is a video studio for AI agents" --thesis "earns=agent-made video earns money and views" --head "ai video,agent content"',
    )
    .option("--title <title>", "Human title")
    .option("--thesis <t...>", 'A thesis ("<id>=<statement>" or a bare statement)')
    .option("--head <list>", "Comma-separated head-term keyword seeds")
    .option("--long-tail <list>", "Comma-separated long-tail keyword seeds")
    .option("--questions <list>", "Comma-separated question-query seeds")
    .action(async (ws: string, id: string, opts) => {
      const dir = requireWorkspace("campaign create", ws);
      if (!isValidCampaignId(id)) {
        raiseError("E_VALIDATION_FAILED", { target: "id", detail: `'${id}' is not a kebab-case campaign id` });
      }
      const theses = parseTheses(opts.thesis);
      if (theses.length === 0) {
        raiseError("E_VALIDATION_FAILED", { target: "thesis", detail: "at least one --thesis is required" });
      }
      try {
        const campaign = createCampaign(dir, {
          id,
          title: opts.title,
          theses,
          keywords: {
            head: parseList(opts.head),
            longTail: parseList(opts.longTail),
            questions: parseList(opts.questions),
          },
        });
        ok(`Campaign created: ${id}`);
        out({ workspace: ws, ...campaign });
      } catch (e) {
        raiseError("E_VALIDATION_FAILED", { target: "campaign", detail: (e as Error).message });
      }
    });

  // ── list ─────────────────────────────────────────────────────────────────
  cmd
    .command("list <ws>")
    .description("List a workspace's campaigns. Example: ralphy campaign list my-studio")
    .action(async (ws: string) => {
      const dir = requireWorkspace("campaign list", ws);
      const ids = listCampaigns(dir);
      out(
        ids.map((id) => {
          const c = readCampaign(dir, id);
          return {
            id,
            title: c?.title || "—",
            theses: c?.theses.length ?? 0,
            planned: c?.planned ?? false,
            cells: c?.inventory.length ?? 0,
          };
        }),
      );
    });

  // ── show ─────────────────────────────────────────────────────────────────
  cmd
    .command("show <id>")
    .description("Show a campaign's full manifest. Example: ralphy campaign show agent-video")
    .action(async (id: string) => {
      const dir = resolveCampaignDir("campaign show", id);
      const campaign = readCampaign(dir, id);
      if (!campaign) raiseError("E_NOT_FOUND", { kind: "Campaign", id });
      out({ workspace: campaignWorkspace(id), ...campaign });
    });

  // ── plan ─────────────────────────────────────────────────────────────────
  cmd
    .command("plan <id>")
    .description(
      "Run a bounded research + generate-object pass proposing the keyword matrix + planned inventory from the theses. PRINTS the proposal and STOPS — pass --commit to write it (never auto-queues paid work). --schedule proposes calendar slot assignments across the items. Example: ralphy campaign plan agent-video --commit --schedule --weeks 8",
    )
    .option("--commit", "Write the proposed matrix + inventory to campaign.json (user approval)")
    .option("--force", "Replace an already-committed plan")
    .option("--formats <list>", "Comma-separated formats to plan across (default: all unit formats)")
    .option("--channels <list>", "Comma-separated channels to plan across (default: all campaign channels)")
    .option("--schedule", "Also propose calendar slot assignments for the inventory")
    .option("--weeks <n>", "Calendar fill horizon in weeks (with --schedule)", (v) => parseInt(v, 10), 8)
    .action(async (id: string, opts) => {
      const dir = resolveCampaignDir("campaign plan", id);
      const campaign = readCampaign(dir, id);
      if (!campaign) raiseError("E_NOT_FOUND", { kind: "Campaign", id });

      let proposal;
      try {
        proposal = await proposeCampaignPlan({
          campaign: campaign!,
          formats: opts.formats ? parseList(opts.formats) : undefined,
          channels: opts.channels ? parseList(opts.channels) : undefined,
        });
      } catch (e) {
        raiseError("E_VALIDATION_FAILED", { target: "plan", detail: (e as Error).message });
        return;
      }

      let schedule: unknown = undefined;
      if (opts.schedule) schedule = proposeSchedule(dir, proposal!.inventory);

      if (!opts.commit) {
        // Approval gate: print the proposal, write NOTHING.
        out({
          workspace: campaignWorkspace(id),
          campaign: id,
          committed: false,
          model: proposal!.model,
          proposal: { keywords: proposal!.keywords, inventory: proposal!.inventory, dropped: proposal!.dropped },
          ...(schedule ? { schedule } : {}),
          note: "PROPOSAL only — re-run with --commit to write the matrix + inventory to campaign.json",
        });
        return;
      }

      try {
        const committed = commitPlan(
          dir,
          id,
          { keywords: proposal!.keywords, inventory: proposal!.inventory },
          { force: opts.force === true },
        );
        ok(`Campaign planned: ${id} (${committed.inventory.length} cells, ${proposal!.dropped} dropped)`);
        out({
          workspace: campaignWorkspace(id),
          campaign: id,
          committed: true,
          model: proposal!.model,
          cells: committed.inventory.length,
          dropped: proposal!.dropped,
          ...(schedule ? { schedule } : {}),
        });
      } catch (e) {
        raiseError("E_VALIDATION_FAILED", { target: "plan", detail: (e as Error).message });
      }
    });

  // ── status ─────────────────────────────────────────────────────────────────
  cmd
    .command("status <id>")
    .description(
      "The coverage ledger: planned / produced / published / indexed-hint (analytics-backed, honest — never assumes indexing). Example: ralphy campaign status agent-video",
    )
    .action(async (id: string) => {
      const dir = resolveCampaignDir("campaign status", id);
      const campaign = readCampaign(dir, id);
      if (!campaign) raiseError("E_NOT_FOUND", { kind: "Campaign", id });
      const coverage = await computeCoverage(campaign!);
      out({ workspace: campaignWorkspace(id), ...coverage });
    });

  // ── stamp ─────────────────────────────────────────────────────────────────
  cmd
    .command("stamp <id> <cell> <unit>")
    .description(
      'Stamp a plan cell PRODUCED: link the unit that satisfied it ("project/slug"), status → produced. The campaign-next drain skips produced cells. Example: ralphy campaign stamp agent-video cell-01 agent-video-001/hero-cut',
    )
    .action(async (id: string, cell: string, unit: string) => {
      const dir = resolveCampaignDir("campaign stamp", id);
      if (!readCampaign(dir, id)) raiseError("E_NOT_FOUND", { kind: "Campaign", id });
      try {
        const campaign = stampCellProduced(dir, id, cell, unit);
        const stamped = campaign.inventory.find((c) => c.id === cell)!;
        ok(`Cell stamped produced: ${cell} → ${unit}`);
        out({ workspace: campaignWorkspace(id), campaign: id, cell: stamped });
      } catch (e) {
        raiseError("E_VALIDATION_FAILED", { target: "cell", detail: (e as Error).message });
      }
    });

  return cmd;
}

/**
 * Propose calendar slot assignments across the planned inventory, honoring the
 * workspace's recurring slots + per-format mix via fillCalendar (#504/#525).
 * PROPOSAL only — this seeds queued entries via fillCalendar (idempotent) and
 * reports which cells map to the next free slot for their format; it never
 * publishes. When the workspace has no matching slot for a cell's format, the
 * cell is reported unscheduled (queued in-plan, nothing dropped).
 */
function proposeSchedule(
  workspaceDir: string,
  inventory: Array<{ id: string; format: string; channel: string }>,
): { filled: number; skipped: number; assignments: Array<{ cellId: string; format: string; at: string | null; reason?: string }> } {
  const fill = fillCalendar(workspaceDir, { weeks: 8 });
  const assignments = inventory.map((cell) => {
    const res = nextFreeSlot(workspaceDir, { unitType: cell.format });
    return res.free
      ? { cellId: cell.id, format: cell.format, at: res.at }
      : { cellId: cell.id, format: cell.format, at: null, reason: res.reason };
  });
  return { filled: fill.created.length, skipped: fill.skipped, assignments };
}
