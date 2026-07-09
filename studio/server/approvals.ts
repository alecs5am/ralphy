// Approval inbox + respond (#492, the #533 gap) — the parked-approval control
// surface Claude Code and the Studio card render through.
//
// The L0/L1 human gate parks a farm run for approval; #533's `assembleReviewCard`
// (cli/lib/review-card.ts) is the read-model and `applyReviewDecision` the write-
// transitions. This module EXPOSES both over the Studio API WITHOUT importing
// cli/ (the same self-containment rule as control.ts): every read + every
// mutation shells out to the EXISTING `ralphy farm review <run>` verb via runCli.
//
// MEDIA SAFETY (AGENTS.md invariant #14): NO new media path. `farm review`'s
// three actions each map to an EXISTING transition inside applyReviewDecision —
// approve → recordRunApproval (releases the park on the next resume), reject →
// an append-only unit rejection note (media untouched), request-change →
// buildRepairPlan enqueue. Studio adds nothing; it only relays the verb.
//
//   list    → for every parked-approval run (from the farm-state fold),
//             `ralphy farm review <run>` (no action) → its parked cards.
//   respond → `ralphy farm review <run> --<decision> <node> [--reason <text>]`.
//
// Stable ids: an approval item id is `<run>::<node>` — the run id + the parked
// node id, both stable on disk. Studio displays it; Claude Code references it.

import fs from "node:fs";
import path from "node:path";
import { workspaceDir } from "./lib.js";
import { runCli } from "./control.js";

export type ReviewDecision = "approve" | "reject" | "request-change";

/** The stable approval-item id: `<run>::<node>`. */
export function approvalId(run: string, node: string): string {
  return `${run}::${node}`;
}

/** Parse a `<run>::<node>` id back into its parts (null when malformed). */
export function parseApprovalId(id: string): { run: string; node: string } | null {
  const i = id.indexOf("::");
  if (i <= 0 || i >= id.length - 2) return null;
  return { run: id.slice(0, i), node: id.slice(i + 2) };
}

/** The farm runs currently parked for approval (from each run's farm-state.json). */
function parkedRunIds(dataRoot: string, ws: string): string[] {
  const runsDir = path.join(workspaceDir(dataRoot, ws), "runs");
  let ids: string[] = [];
  try {
    ids = fs
      .readdirSync(runsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
  const parked: string[] = [];
  for (const id of ids) {
    try {
      const state = JSON.parse(fs.readFileSync(path.join(runsDir, id, "farm-state.json"), "utf8"));
      if (state && state.status === "parked-approval") parked.push(id);
    } catch {
      /* not a farm run, or torn state — skip */
    }
  }
  return parked;
}

export interface ApprovalItem {
  /** Stable `<run>::<node>` id. */
  id: string;
  run: string;
  node: string;
  project: string | null;
  unit: string | null;
  title: string | null;
  caption: string | null;
  targets: string[];
  scheduleAt: string | null;
  /** The gate verdict + score the card carries (null when unresolved). */
  verdict: string | null;
  score: number | null;
  costUsd: number;
  reason: string | null;
  /** The media-proof kind + paths (read-only from the unit dir). */
  media: { kind: string; paths: string[]; thumbnail?: string } | null;
}

export interface ApprovalListView {
  workspace: string;
  count: number;
  approvals: ApprovalItem[];
}

/** Shape one `farm review` card row into a stable-id approval item. */
function cardToItem(run: string, card: Record<string, unknown>): ApprovalItem {
  const scorecard = (card.scorecard ?? null) as { verdict?: unknown; score?: unknown } | null;
  const media = (card.media ?? null) as { kind?: unknown; paths?: unknown; thumbnail?: unknown } | null;
  const node = String(card.node ?? "");
  return {
    id: approvalId(run, node),
    run,
    node,
    project: (card.project as string | null) ?? null,
    unit: (card.unit as string | null) ?? null,
    title: (card.title as string | null) ?? null,
    caption: (card.caption as string | null) ?? null,
    targets: Array.isArray(card.targets) ? (card.targets as string[]) : [],
    scheduleAt: (card.scheduleAt as string | null) ?? null,
    verdict: scorecard && typeof scorecard.verdict === "string" ? scorecard.verdict : null,
    score: scorecard && typeof scorecard.score === "number" ? scorecard.score : null,
    costUsd: typeof card.costUsd === "number" ? card.costUsd : 0,
    reason: (card.reason as string | null) ?? null,
    media:
      media && typeof media.kind === "string" && Array.isArray(media.paths)
        ? {
            kind: media.kind,
            paths: media.paths as string[],
            thumbnail: typeof media.thumbnail === "string" ? media.thumbnail : undefined,
          }
        : null,
  };
}

/**
 * The parked-approval inbox for a workspace: every parked farm run's review
 * cards, each with a stable `<run>::<node>` id. READ-ONLY — one `ralphy farm
 * review <run>` shell-out per parked run (the verb is a pure read of existing
 * artifacts + the run journal, no media write). Empty when nothing is parked.
 */
export function listApprovals(dataRoot: string, ws: string): ApprovalListView | null {
  if (!fs.existsSync(workspaceDir(dataRoot, ws))) return null;
  const approvals: ApprovalItem[] = [];
  for (const run of parkedRunIds(dataRoot, ws)) {
    const r = runCli(dataRoot, ["farm", "review", run, "--workspace", ws]);
    const cards =
      r.json && typeof r.json === "object" && Array.isArray((r.json as Record<string, unknown>).cards)
        ? ((r.json as Record<string, unknown>).cards as Array<Record<string, unknown>>)
        : [];
    for (const card of cards) approvals.push(cardToItem(run, card));
  }
  return { workspace: ws, count: approvals.length, approvals };
}

export interface RespondInput {
  id: string;
  decision: ReviewDecision;
  /** Required for reject / request-change (the operator's reason). */
  reason?: string;
  /** Who made the call (logged; default: operator). */
  actor?: string;
  /** approve only: the USD cap the released run runs under. */
  capUsd?: number;
}

export interface RespondOutcome {
  status: number;
  body: Record<string, unknown>;
}

const DECISION_FLAG: Record<ReviewDecision, string> = {
  approve: "--approve",
  reject: "--reject",
  "request-change": "--request-change",
};

/**
 * Respond to ONE parked approval — drives `ralphy farm review <run>
 * --<decision> <node> [--reason] [--actor] [--cap]` through runCli. Adds NO new
 * media mutation: the verb's applyReviewDecision maps each action to an existing
 * transition (approve=recordRunApproval, reject=append-only rejection note,
 * request-change=repair-plan enqueue). The CLI owns validation — its refusal
 * (missing reason, unknown run/node) relays verbatim as the error.
 */
export function respondApproval(dataRoot: string, ws: string, input: RespondInput): RespondOutcome {
  if (!(input.decision in DECISION_FLAG)) {
    return { status: 400, body: { error: "decision must be approve, reject, or request-change" } };
  }
  const parts = parseApprovalId(input.id);
  if (!parts) {
    return { status: 400, body: { error: `invalid approval id "${input.id}" — expected "<run>::<node>"` } };
  }
  if (input.decision !== "approve" && !(input.reason && input.reason.trim())) {
    return { status: 400, body: { error: `${input.decision} requires a reason` } };
  }
  const args = ["farm", "review", parts.run, "--workspace", ws, DECISION_FLAG[input.decision], parts.node];
  if (input.reason && input.reason.trim()) args.push("--reason", input.reason);
  if (input.actor) args.push("--actor", input.actor);
  if (typeof input.capUsd === "number") args.push("--cap", String(input.capUsd));
  const r = runCli(dataRoot, args);
  if (r.status === 0 && r.json && typeof r.json === "object") {
    return { status: 200, body: r.json as Record<string, unknown> };
  }
  const detail = r.stderr.trim() || `farm review exited ${r.status}`;
  const unknown = /not found|unknown|E_NOT_FOUND/i.test(detail);
  return { status: unknown ? 404 : 400, body: { error: detail } };
}
