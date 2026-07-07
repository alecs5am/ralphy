// `ralphy farm` (#503) — the farm scheduler / headless graph runner.
//
// `farm start` is a FOREGROUND long-lived process launched by explicit user
// intent (AGENTS.md invariant #5's ban is on agent-auto-launched processes) —
// the user backgrounds it themselves or docker runs it (#506). One farm
// process per workspace, guarded by `.ralphy/farm/<ws>.pid`; `farm stop`
// SIGTERMs it; `farm status` rolls up the workspace's farm runs.

import { Command } from "commander";
import { existsSync } from "fs";
import { workspaceDir, layoutMode, currentWorkspace, runWorkspace, DEFAULT_WORKSPACE } from "../lib/paths.js";
import { out, ok, isPretty } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import {
  farmLoop,
  farmStatus,
  farmStatusAll,
  farmEnabledWorkspaces,
  farmPidPath,
  readFarmPid,
  isFarmAlive,
  writeFarmPid,
  clearFarmPid,
  readFarmState,
  loadGraphWorkflows,
  retryNode,
  fireTick,
} from "../lib/farm/runner.js";
import type { WorkflowGraph } from "../lib/schemas/workflow.js";
import { buildFarmReport } from "../lib/farm/rollup.js";
import { listDeadLetters, deadLetterPath } from "../lib/farm/dead-letter.js";
import { ensureTriggerToken, webhookTokensPath } from "../lib/farm/webhook.js";
import { readFileSync } from "fs";

/** The graph workflow carrying webhook-trigger node <triggerId>, or raise. */
function requireWebhookWorkflow(ws: string, triggerId: string): { name: string; graph: WorkflowGraph } {
  const wf = loadGraphWorkflows(ws).find((g) =>
    g.graph.nodes.some((n) => n.type === "webhook-trigger" && n.id === triggerId),
  );
  if (!wf) raiseError("E_NOT_FOUND", { kind: "Webhook trigger", id: `${ws}/${triggerId}` });
  return wf!;
}

/**
 * Pidfile slug for the multi-workspace daemon (#522). A real workspace slug is
 * lowercase kebab-case, so this bracketed name can never collide with one.
 */
const MULTI_DAEMON_SLUG = "__all__";

function requireWorkspace(verb: string, slug: string): void {
  if (layoutMode() === "legacy") raiseError("E_LEGACY_LAYOUT", { verb });
  if (slug !== DEFAULT_WORKSPACE && !existsSync(workspaceDir(slug))) {
    raiseError("E_NOT_FOUND", { kind: "Workspace", id: slug });
  }
}

export function farmCmd() {
  const cmd = new Command("farm").description(
    "Farm scheduler + headless graph runner (#503): fires cron ticks from the workspace's node-graph workflows (schedule nodes), executes each tick as a #480 Run with an append-only journal, parks durably on approval nodes, halts on budget-guard breaches, and resumes incomplete runs after a restart.",
  );

  // ── start ──────────────────────────────────────────────────────────────────
  cmd
    .command("start")
    .description(
      "Start the farm scheduler (FOREGROUND — background it yourself or docker run it). With NO --workspace it runs EVERY farm-enabled workspace in ONE daemon (#522: round-robin tick queues, per-workspace budget/trust/dedup/cache isolation + crash-loop backoff); a workspace opts in via workspace.json `farm.enabled: true` or by having ≥1 schedule-triggered graph workflow (opt out with `farm.enabled: false`). With --workspace it drives that one workspace (backward compatible). Reads schedule nodes (params.cron: standard 5-field cron), sleeps until the next fire across all workspaces, executes each tick as one Run, resumes incomplete/parked runs on boot and every scan. Refuses when a live farm process already holds the pidfile. Example: ralphy farm start --once --tick-now",
    )
    .option("--workspace <ws>", "Drive a SINGLE workspace (default: every farm-enabled workspace)")
    .option("--once", "Exit after the first tick completes (test/CI mode)")
    .option("--tick-now", "Fire every scheduled graph immediately once at startup (debug)")
    .option(
      "--no-cache",
      "Force execution on every node, ignoring the #513 content-hash cache (paid nodes re-bill even on identical inputs)",
    )
    .action(async (opts) => {
      // Single-workspace mode keeps the per-workspace pidfile; multi-workspace
      // mode uses the shared daemon pidfile slug so one daemon owns the host.
      const single: string | undefined = opts.workspace;
      const pidSlug = single ?? MULTI_DAEMON_SLUG;
      if (single) requireWorkspace("farm start", single);
      else if (layoutMode() === "legacy") raiseError("E_LEGACY_LAYOUT", { verb: "farm start" });

      const existing = readFarmPid(pidSlug);
      if (isFarmAlive(existing)) {
        raiseError("E_VALIDATION_FAILED", {
          target: "farm",
          detail: single
            ? `a farm process for workspace "${single}" is already running (pid ${existing}, ${farmPidPath(single)}) — stop it first with \`ralphy farm stop --workspace ${single}\``
            : `a farm daemon is already running (pid ${existing}, ${farmPidPath(pidSlug)}) — stop it first with \`ralphy farm stop\``,
        });
      }
      clearFarmPid(pidSlug); // stale pidfile from a dead process
      writeFarmPid(pidSlug, process.pid);
      let stopping = false;
      const stop = () => {
        stopping = true;
      };
      process.on("SIGTERM", stop);
      process.on("SIGINT", stop);
      const enabled = single ? [single] : farmEnabledWorkspaces();
      ok(
        single
          ? `Farm started for workspace "${single}" (pid ${process.pid}) — Ctrl-C / ralphy farm stop to end`
          : `Farm daemon started (pid ${process.pid}) — ${enabled.length} farm-enabled workspace(s): ${enabled.join(", ") || "(none yet)"} — Ctrl-C / ralphy farm stop to end`,
      );
      try {
        await farmLoop(
          { workspace: single, once: !!opts.once, tickNow: !!opts.tickNow, noCache: opts.cache === false },
          {
            shouldStop: () => stopping,
            onEvent: (idOrWs, kind, message) => {
              if (isPretty()) console.log(`[${idOrWs}] ${kind}: ${message}`);
            },
          },
        );
      } finally {
        clearFarmPid(pidSlug);
      }
      out(
        single
          ? { workspace: single, stopped: stopping, status: farmStatus(single).counts }
          : { workspaces: enabled, stopped: stopping, status: farmStatusAll(enabled) },
      );
    });

  // ── status ─────────────────────────────────────────────────────────────────
  cmd
    .command("status")
    .description(
      "Farm status. With NO --workspace it groups every farm-enabled workspace (#522) plus a process-wide per-provider concurrency snapshot (in-flight / queued / cumulative queue-wait). With --workspace it reports one workspace: whether a farm process is live (pidfile), run counts by state (running / parked-approval / halted-budget / halted-failure / complete), per-run node progress + realized spend, and #513 content-hash cache hits + cost saved. Example: ralphy farm status --workspace my-studio",
    )
    .option("--workspace <ws>", "Report a SINGLE workspace (default: every farm-enabled workspace, grouped)")
    .action(async (opts) => {
      if (opts.workspace) {
        requireWorkspace("farm status", opts.workspace);
        out(farmStatus(opts.workspace));
        return;
      }
      if (layoutMode() === "legacy") raiseError("E_LEGACY_LAYOUT", { verb: "farm status" });
      out(farmStatusAll());
    });

  // ── report (#518 metrics rollup) ─────────────────────────────────────────────
  cmd
    .command("report <ws>")
    .description(
      "Per-workspace operational metrics DERIVED from the run journals on demand (#518, no metrics DB): ticks, units produced/gated/published, realized spend with spend-per-unit and spend-per-tick, node failure/reroute/quarantine/cache rates, median node duration, and median approval latency. Degrades gracefully on partial journals (torn lines skipped; a missing workflow leaves node types unclassified and flags `partial`). Example: ralphy farm report my-studio --since 2026-07-01",
    )
    .option("--since <date>", "Only fold journal events at/after this ISO date (e.g. 2026-07-01)")
    .action(async (ws: string, opts) => {
      requireWorkspace("farm report", ws);
      out(buildFarmReport(ws, { since: opts.since }));
    });

  // ── failures ───────────────────────────────────────────────────────────────
  cmd
    .command("failures")
    .description(
      "List the workspace's dead-letter quarantine (#519): nodes that exhausted their retry envelope, or failed a permanent-class error (safety-* / copyright / tos-content) on the first attempt. Each entry carries the #450 error class, attempts, cost spent, an inputs hash, a truncated provider payload, and a next-action hint. Default: unresolved only. Re-execute one with `ralphy farm retry <run> <node>`. Example: ralphy farm failures --workspace my-studio --run farm-news-20260706-090000",
    )
    .option("--workspace <ws>", "Workspace slug (default: the active workspace)")
    .option("--run <id>", "Only quarantine entries from this run")
    .option("--all", "Include entries already resolved by a successful retry")
    .action(async (opts) => {
      const ws: string = opts.workspace ?? currentWorkspace();
      requireWorkspace("farm failures", ws);
      const failures = listDeadLetters(ws, { run: opts.run, includeResolved: !!opts.all });
      out({
        workspace: ws,
        store: deadLetterPath(ws),
        total: failures.length,
        unresolved: failures.filter((f) => !f.resolved).length,
        failures,
      });
    });

  // ── retry ──────────────────────────────────────────────────────────────────
  cmd
    .command("retry <run> <node>")
    .description(
      "Re-execute ONE failed/quarantined node and its downstream dependents against the journaled inputs (#519): appends node-invalidated journal events for the target + its transitive consumers, then re-enters the resume machinery — upstream completed nodes are never re-executed. Respects the run spend ledger (per-node pre-flight cap check) and the #513 content-hash cache; marks the node's quarantine entries resolved when it completes. Example: ralphy farm retry farm-news-20260706-090000 gen-image",
    )
    .option(
      "--no-cache",
      "Force execution, ignoring the #513 content-hash cache (identical inputs re-bill)",
    )
    .action(async (run: string, nodeId: string, opts) => {
      const ws = runWorkspace(run);
      requireWorkspace("farm retry", ws);
      const state = readFarmState(ws, run);
      if (!state) raiseError("E_NOT_FOUND", { kind: "Farm run", id: run });
      const wf = loadGraphWorkflows(ws).find((g) => g.name === state!.workflow);
      if (!wf) raiseError("E_NOT_FOUND", { kind: "Workflow", id: state!.workflow });
      if (!wf!.graph.nodes.some((n) => n.id === nodeId)) {
        raiseError("E_NOT_FOUND", { kind: "Node", id: `${run}/${nodeId}` });
      }
      const outcome = await retryNode(ws, run, wf!.name, wf!.graph, nodeId, {
        noCache: opts.cache === false,
        onEvent: (runId, kind, message) => {
          if (isPretty()) console.log(`[${runId}] ${kind}: ${message}`);
        },
      });
      out({ workspace: ws, ...outcome });
    });

  // ── trigger (webhook secret management, #520) ──────────────────────────────
  const trigger = new Command("trigger").description(
    "Webhook-trigger management (#520): per-trigger secrets for the POST /hooks/<ws>/<trigger-id> app endpoint. Secrets live in workspace-local engine state (.ralphy/workspaces/<ws>/farm/webhook-tokens.json) — never in the graph file, never in a #502 bundle.",
  );
  trigger
    .command("token <ws> <trigger-id>")
    .description(
      "Generate (first call), show (subsequent calls), or --rotate the secret token for one webhook-trigger node. The inbound hook authenticates with the `x-ralphy-token` header plus a fresh unix-seconds `x-ralphy-timestamp`; the trigger id must exist as a webhook-trigger node in one of the workspace's graph workflows. Example: ralphy farm trigger token my-studio on-upload --rotate",
    )
    .option("--rotate", "Replace the existing token (the old one stops working immediately)")
    .action(async (ws: string, triggerId: string, opts) => {
      requireWorkspace("farm trigger token", ws);
      const wf = requireWebhookWorkflow(ws, triggerId);
      const { record, created, rotated } = ensureTriggerToken(ws, triggerId, { rotate: !!opts.rotate });
      out({
        workspace: ws,
        trigger: triggerId,
        workflow: wf.name,
        token: record.token,
        hookPath: `/hooks/${ws}/${triggerId}`,
        store: webhookTokensPath(ws),
        created,
        rotated,
        createdAt: record.createdAt,
        rotatedAt: record.rotatedAt,
      });
    });
  cmd.addCommand(trigger);

  // ── fire (one webhook tick, #520) ───────────────────────────────────────────
  cmd
    .command("fire <ws> <trigger-id>")
    .description(
      "Fire ONE tick of the graph rooted at a webhook-trigger node, exactly like a schedule firing (#520): the trigger node completes with the payload normalized through its pick/map params, downstream nodes execute, budget caps (#481) gate the spend as usual. This is the execution half the app endpoint (POST /hooks/<ws>/<trigger-id>) spawns after validating the secret + timestamp + rate limit — call it directly to test a hook without the endpoint. Example: ralphy farm fire my-studio on-upload --payload '{\"episode\":{\"title\":\"E42\"}}'",
    )
    .option("--payload <json>", "Inline JSON payload (default: {})")
    .option("--payload-file <path>", "Read the JSON payload from a file (wins over --payload)")
    .action(async (ws: string, triggerId: string, opts) => {
      requireWorkspace("farm fire", ws);
      const wf = requireWebhookWorkflow(ws, triggerId);
      let raw = "{}";
      if (opts.payloadFile) {
        try {
          raw = readFileSync(opts.payloadFile, "utf8");
        } catch {
          raiseError("E_NOT_FOUND", { kind: "Payload file", id: String(opts.payloadFile) });
        }
      } else if (opts.payload) {
        raw = String(opts.payload);
      }
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch (e) {
        raiseError("E_VALIDATION_FAILED", {
          target: "farm fire",
          detail: `payload is not valid JSON: ${(e as Error).message}`,
        });
      }
      const outcome = await fireTick(
        ws,
        wf.name,
        wf.graph,
        {
          onEvent: (runId, kind, message) => {
            if (isPretty()) console.log(`[${runId}] ${kind}: ${message}`);
          },
        },
        { node: triggerId, payload },
      );
      out({ workspace: ws, trigger: triggerId, workflow: wf.name, ...outcome });
    });

  // ── stop ───────────────────────────────────────────────────────────────────
  cmd
    .command("stop")
    .description(
      "Stop a running farm process: SIGTERM to the pidfile's pid (the loop finishes the node in flight and exits; incomplete runs resume on the next start). With NO --workspace it stops the multi-workspace daemon (#522); with --workspace it stops that workspace's single-workspace process. Example: ralphy farm stop",
    )
    .option("--workspace <ws>", "Stop a SINGLE-workspace process (default: the multi-workspace daemon)")
    .action(async (opts) => {
      const single: string | undefined = opts.workspace;
      if (single) requireWorkspace("farm stop", single);
      else if (layoutMode() === "legacy") raiseError("E_LEGACY_LAYOUT", { verb: "farm stop" });
      const pidSlug = single ?? MULTI_DAEMON_SLUG;
      const label = single ? { workspace: single } : { daemon: MULTI_DAEMON_SLUG };
      const pid = readFarmPid(pidSlug);
      if (!isFarmAlive(pid)) {
        clearFarmPid(pidSlug);
        out({ ...label, stopped: false, pid: null, detail: "no live farm process (stale pidfile cleared if present)" });
        return;
      }
      process.kill(pid!, "SIGTERM");
      ok(`Sent SIGTERM to farm pid ${pid}`);
      out({ ...label, stopped: true, pid, detail: "the loop exits after the node in flight; runs resume on the next start" });
    });

  return cmd;
}
