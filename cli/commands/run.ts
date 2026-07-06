// `ralphy run` — the workspace-scoped content-farm campaign control plane (#480).
//
// A Run binds ONE campaign across its member projects. It REFERENCES existing
// artifacts (project ids, batch id, paths, Unit ids) — never duplicates them.
// Storage is file-on-disk under the workspace (`runs/<id>/run.json` + an
// append-only `run-events.jsonl`), mirroring how batches live under batchesDir().
// All reads/aggregation are pure — ZERO model calls.

import { Command } from "commander";
import path from "path";
import { existsSync } from "fs";
import {
  layoutMode,
  workspaceDir,
  runDir,
  DEFAULT_WORKSPACE,
} from "../lib/paths.js";
import { slugify } from "../lib/ids.js";
import { getActiveWorkspace } from "../lib/registry.js";
import { out, ok, err } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import {
  createRun,
  loadRun,
  listRuns,
  summarizeRun,
  appendRunEvent,
  addProjectToRun,
} from "../lib/run.js";
import {
  recordRunApproval,
  runBudgetSummary,
  resolveExpiry,
  SPEND_LEDGER_ARTIFACT,
} from "../lib/spend.js";
import { estimateRunQueuedSpendUsd } from "../lib/jobs/queued-spend.js";

/** commander reducer to collect repeatable options into an array. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function requireRalphyLayout(verb: string) {
  if (layoutMode() === "legacy") {
    raiseError("E_LEGACY_LAYOUT", { verb });
  }
}

/** Resolve the target workspace: an explicit --workspace, else the active one. */
async function resolveWorkspace(explicit?: string): Promise<string> {
  if (explicit) {
    if (explicit !== DEFAULT_WORKSPACE && !existsSync(workspaceDir(explicit))) {
      raiseError("E_NOT_FOUND", { kind: "Workspace", id: explicit });
    }
    return explicit;
  }
  return getActiveWorkspace();
}

export function runCmd() {
  const cmd = new Command("run").description(
    "Manage content-farm campaign runs — a workspace-scoped object that binds one brief across its member projects (#480)",
  );

  // ── create ───────────────────────────────────────────────────────────────
  cmd
    .command("create")
    .description("Create a campaign run that binds member projects under one brief")
    .requiredOption("--title <t>", "Campaign title")
    .option("--id <id>", "Run id (default: slugified title + short suffix)")
    .option("--brief <b>", "The one strategic brief that drives the campaign")
    .option("--workflow <name>", "The workspace workflow this run executes, by name")
    .option("--project <id>", "Member project id (repeatable)", collect, [])
    .option("--batch <id>", "A bound batch id")
    .option("--workspace <slug>", "Target workspace (default: the active one)")
    .action(async (opts) => {
      requireRalphyLayout("run create");
      const ws = await resolveWorkspace(opts.workspace as string | undefined);
      const id =
        (opts.id as string | undefined) ||
        `${slugify(opts.title)}-${Math.random().toString(36).slice(2, 6)}`;
      if (existsSync(runDir(ws, id))) {
        raiseError("E_ALREADY_EXISTS", { kind: "Run", id });
      }
      try {
        const manifest = await createRun({
          id,
          workspace: ws,
          title: opts.title,
          brief: opts.brief as string | undefined,
          workflow: opts.workflow as string | undefined,
          projectIds: opts.project as string[],
          batchId: opts.batch as string | undefined,
        });
        await appendRunEvent(id, {
          kind: "created",
          message: `Run "${manifest.title}" created in workspace "${ws}" with ${manifest.projectIds.length} member project(s).`,
        });
        ok(`Run created: ${id}`);
        out({ ...manifest, path: runDir(ws, id) });
      } catch (e) {
        if ((e as { code?: string }).code === "E_ALREADY_EXISTS") {
          raiseError("E_ALREADY_EXISTS", { kind: "Run", id });
        }
        err(`run create failed: ${(e as Error).message}`);
      }
    })
    .addHelpText(
      "after",
      `
Examples:
  $ ralphy run create --title "Spring drop farm" --project spring-001 --project spring-002
  $ ralphy run create --title "Q3 ads" --brief "30 cold-traffic creatives" --workflow episode
`,
    );

  // ── list ───────────────────────────────────────────────────────────────────
  cmd
    .command("list")
    .description("List runs in the active (or --workspace) workspace")
    .option("--workspace <slug>", "Target workspace (default: the active one)")
    .action(async (opts) => {
      requireRalphyLayout("run list");
      const ws = await resolveWorkspace(opts.workspace as string | undefined);
      out(await listRuns(ws));
    })
    .addHelpText(
      "after",
      `
Examples:
  $ ralphy run list
  $ ralphy run list --workspace silent-hill
`,
    );

  // ── show ─────────────────────────────────────────────────────────────────
  cmd
    .command("show <id>")
    .description("Show a run's manifest + member project list")
    .action(async (id: string) => {
      requireRalphyLayout("run show");
      const run = await loadRun(id);
      if (!run) {
        raiseError("E_NOT_FOUND", { kind: "Run", id });
      }
      out(run);
    })
    .addHelpText(
      "after",
      `
Examples:
  $ ralphy run show spring-drop-farm-a1b2
`,
    );

  // ── status ─────────────────────────────────────────────────────────────────
  cmd
    .command("status <id>")
    .description(
      "Roll up the run's operator view: current phase, blockers, awaiting approvals, cost, quality, winners, failures, next action. Pure aggregation over member projects — ZERO model calls. Missing member projects degrade into missingProjects, never an error.",
    )
    .action(async (id: string) => {
      requireRalphyLayout("run status");
      const status = await summarizeRun(id);
      if (!status) {
        raiseError("E_NOT_FOUND", { kind: "Run", id });
      }
      out(status);
    })
    .addHelpText(
      "after",
      `
Examples:
  $ ralphy run status spring-drop-farm-a1b2
`,
    );

  // ── add-project ──────────────────────────────────────────────────────────
  cmd
    .command("add-project <id> <project>")
    .description("Add a member project to the run (run.json metadata update; member artifacts untouched)")
    .action(async (id: string, project: string) => {
      requireRalphyLayout("run add-project");
      const updated = await addProjectToRun(id, project);
      if (!updated) {
        raiseError("E_NOT_FOUND", { kind: "Run", id });
      }
      await appendRunEvent(id, {
        kind: "project-added",
        message: `Member project "${project}" added to run "${id}".`,
      });
      ok(`Added ${project} to run ${id}`);
      out({ run: id, workspace: updated!.workspace, projectIds: updated!.projectIds });
    })
    .addHelpText(
      "after",
      `
Examples:
  $ ralphy run add-project spring-drop-farm-a1b2 spring-003
`,
    );

  // ── approve (#481) ─────────────────────────────────────────────────────────
  // Record a RUN-WIDE spend approval into the run ledger (runs/<id>/spend-ledger.json).
  // A run cap is a ceiling on TOTAL spend across ALL member projects, enforced
  // at BOTH the per-call layer (`ralphy generate`) and the queue dispatch layer
  // (the daemon worker) for any member project with no project-local approval.
  // Append-only — a new approval appends, never overwrites (AGENTS.md #14).
  cmd
    .command("approve <id>")
    .description(
      "Record a RUN-WIDE spend approval into the run ledger (#481). Sets a hard USD cap on TOTAL spend across ALL member projects, optionally the allowed content modes, an expiry, and a user-facing reason. Enforced at BOTH the per-call layer (`ralphy generate`) and the queue dispatch layer (the daemon blocks a paid generate.* job before spawning) for any member project with no project-local approval. Append-only — a new approval appends, never overwrites (runs/<id>/spend-ledger.json). JSON output. Example: ralphy run approve spring-drop-farm-a1b2 --cap 50 --modes ugc-review,unboxing-ugc --expiry 24h --reason \"approved farm run\"",
    )
    .requiredOption("--cap <usd>", "Hard USD cap on cumulative actual spend across all member projects", parseFloat)
    .requiredOption("--reason <text>", "User-facing reason the budget was approved (auditable)")
    .option("--modes <list>", "Comma-separated content modes this approval permits (default: any mode)")
    .option("--expiry <iso|duration>", "Expiry as an ISO timestamp or a duration (e.g. 24h, 7d, 30m, 2w). Default: never expires")
    .action(async (id: string, opts: any) => {
      requireRalphyLayout("run approve");
      const run = await loadRun(id);
      if (!run) raiseError("E_NOT_FOUND", { kind: "Run", id });

      const cap = Number(opts.cap);
      if (!Number.isFinite(cap) || cap < 0) {
        raiseError("E_INPUT_INVALID", { field: "cap", detail: "must be a non-negative number", verb: "run approve" });
      }
      const allowedModes = opts.modes
        ? String(opts.modes).split(",").map((m: string) => m.trim()).filter(Boolean)
        : undefined;
      let expiry: string | undefined;
      if (opts.expiry) {
        const resolved = resolveExpiry(String(opts.expiry));
        if (!resolved) {
          raiseError("E_INPUT_INVALID", { field: "expiry", detail: `cannot parse "${opts.expiry}" as an ISO timestamp or a duration (e.g. 24h, 7d)`, verb: "run approve" });
        }
        expiry = resolved!;
      }

      const ledger = await recordRunApproval(id, {
        budgetCapUsd: cap,
        allowedModes,
        expiry,
        reason: String(opts.reason),
      });
      const approval = ledger.approvals[ledger.approvals.length - 1]!;
      await appendRunEvent(id, {
        kind: "spend-approved",
        message: `Run-wide spend approval recorded — cap $${cap.toFixed(2)}${expiry ? ` (expires ${expiry})` : ""}.`,
      });

      // #505 agreement tracking: a manual approval of member projects that
      // already carry a workspace-eval verdict is a labeled (verdict, human
      // decision) sample for the trust ladder. Best-effort — never fails the
      // approve. Appends to <workspace>/trust-agreement.jsonl (append-only).
      let agreementSamples = 0;
      try {
        const { recordTrustDecision, readProjectEval } = await import("../lib/trust.js");
        for (const pid of run!.projectIds) {
          const ev = readProjectEval(pid);
          if (!ev.found || !ev.verdict) continue;
          recordTrustDecision(run!.workspace, {
            decision: "approve",
            verdict: ev.verdict,
            score: ev.score,
            project: pid,
            run: id,
            source: "run-approve",
          });
          agreementSamples++;
        }
      } catch {
        /* trust store unavailable — the approval itself already landed */
      }

      ok(`Run-wide spend approval recorded for ${id} — cap $${cap.toFixed(2)}${expiry ? ` (expires ${expiry})` : ""}`);
      out({
        run: id,
        scope: approval.scope,
        capUsd: approval.budgetCapUsd,
        allowedModes: approval.allowedModes ?? null,
        expiry: approval.expiry ?? null,
        reason: approval.reason,
        approvedAt: approval.approvedAt,
        approvals: ledger.approvals.length,
        agreementSamples,
        artifact: path.join(runDir(run!.workspace, id), SPEND_LEDGER_ARTIFACT),
      });
    })
    .addHelpText(
      "after",
      `
Examples:
  $ ralphy run approve spring-drop-farm-a1b2 --cap 50 --reason "approved farm run"
  $ ralphy run approve q3-ads-c3d4 --cap 100 --modes ugc-review,unboxing-ugc --expiry 7d --reason "Q3 cold-traffic batch"
`,
    );

  // ── budget (#481) ──────────────────────────────────────────────────────────
  // Show the run-wide spend ledger state: the active run cap, run-wide actual
  // spend (summed across all member projects), remaining budget, an over-budget
  // flag, the estimated remaining QUEUED spend (pending generate.* jobs whose
  // project_id is a run member), the per-project breakdown, expiry status, and
  // the full append-only approval history. ZERO model calls.
  cmd
    .command("budget <id>")
    .description(
      "Show the run's spend ledger state (#481): the run-wide budget cap, run-wide actual spend (summed across all member projects), remaining budget, an over-budget flag, the estimated remaining QUEUED spend (sum of estimated cost over pending generate.* jobs whose project_id is a run member), the per-project spend breakdown, expiry status, and the full append-only approval history. Makes ZERO model calls. JSON output. Example: ralphy run budget spring-drop-farm-a1b2",
    )
    .action(async (id: string) => {
      requireRalphyLayout("run budget");
      const run = await loadRun(id);
      if (!run) raiseError("E_NOT_FOUND", { kind: "Run", id });

      const s = await runBudgetSummary(id);
      const queuedEstimateUsd = estimateRunQueuedSpendUsd(run!.projectIds);
      ok(
        s.hasLedger
          ? `Run budget for ${id} — spent $${s.spentUsd.toFixed(2)} / cap $${(s.capUsd ?? 0).toFixed(2)}${s.overBudget ? " (OVER BUDGET)" : ""}${s.expired ? " (expired)" : ""} | queued est $${queuedEstimateUsd.toFixed(2)}`
          : `No run-wide spend ledger for ${id} — member projects fall back to project-local approvals; run-wide spent $${s.spentUsd.toFixed(2)} so far`,
      );
      out({
        run: id,
        hasLedger: s.hasLedger,
        capUsd: s.capUsd,
        spentUsd: s.spentUsd,
        remainingUsd: s.remainingUsd,
        overBudget: s.overBudget,
        queuedEstimateUsd,
        expired: s.expired,
        activeApproval: s.activeApproval,
        byProject: s.byProject,
        approvals: s.approvals,
      });
    })
    .addHelpText(
      "after",
      `
Examples:
  $ ralphy run budget spring-drop-farm-a1b2
`,
    );

  return cmd;
}
