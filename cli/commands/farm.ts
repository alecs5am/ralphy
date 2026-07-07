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
  farmPidPath,
  readFarmPid,
  isFarmAlive,
  writeFarmPid,
  clearFarmPid,
  readFarmState,
  loadGraphWorkflows,
  retryNode,
} from "../lib/farm/runner.js";
import { listDeadLetters, deadLetterPath } from "../lib/farm/dead-letter.js";

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
      "Start the farm scheduler for a workspace (FOREGROUND — background it yourself or docker run it). Reads schedule nodes (params.cron: standard 5-field cron; * , - / steps; numeric only) from the workspace's graph workflows, sleeps until the next fire, executes each tick as one Run, and resumes incomplete/parked runs on boot and on every tick. Refuses when a live farm process already holds the workspace pidfile. Example: ralphy farm start --workspace my-studio --once --tick-now",
    )
    .option("--workspace <ws>", "Workspace slug (default: the active workspace)")
    .option("--once", "Exit after the first tick completes (test/CI mode)")
    .option("--tick-now", "Fire every scheduled graph immediately once at startup (debug)")
    .option(
      "--no-cache",
      "Force execution on every node, ignoring the #513 content-hash cache (paid nodes re-bill even on identical inputs)",
    )
    .action(async (opts) => {
      const ws: string = opts.workspace ?? currentWorkspace();
      requireWorkspace("farm start", ws);
      const existing = readFarmPid(ws);
      if (isFarmAlive(existing)) {
        raiseError("E_VALIDATION_FAILED", {
          target: "farm",
          detail: `a farm process for workspace "${ws}" is already running (pid ${existing}, ${farmPidPath(ws)}) — stop it first with \`ralphy farm stop --workspace ${ws}\``,
        });
      }
      clearFarmPid(ws); // stale pidfile from a dead process
      writeFarmPid(ws, process.pid);
      let stopping = false;
      const stop = () => {
        stopping = true;
      };
      process.on("SIGTERM", stop);
      process.on("SIGINT", stop);
      ok(`Farm started for workspace "${ws}" (pid ${process.pid}) — Ctrl-C / ralphy farm stop to end`);
      try {
        await farmLoop(
          { workspace: ws, once: !!opts.once, tickNow: !!opts.tickNow, noCache: opts.cache === false },
          {
            shouldStop: () => stopping,
            onEvent: (runId, kind, message) => {
              if (isPretty()) console.log(`[${runId}] ${kind}: ${message}`);
            },
          },
        );
      } finally {
        clearFarmPid(ws);
      }
      out({ workspace: ws, stopped: stopping, status: farmStatus(ws).counts });
    });

  // ── status ─────────────────────────────────────────────────────────────────
  cmd
    .command("status")
    .description(
      "Farm status for a workspace: whether a farm process is live (pidfile), run counts by state (running / parked-approval / halted-budget / halted-failure / complete), per-run node progress + realized spend from each run journal, and #513 content-hash cache hits + cost saved (per run and aggregate). Example: ralphy farm status --workspace my-studio",
    )
    .option("--workspace <ws>", "Workspace slug (default: the active workspace)")
    .action(async (opts) => {
      const ws: string = opts.workspace ?? currentWorkspace();
      requireWorkspace("farm status", ws);
      out(farmStatus(ws));
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

  // ── stop ───────────────────────────────────────────────────────────────────
  cmd
    .command("stop")
    .description(
      "Stop the workspace's running farm process: SIGTERM to the pidfile's pid (the loop finishes the node in flight and exits; incomplete runs resume on the next start). Example: ralphy farm stop --workspace my-studio",
    )
    .option("--workspace <ws>", "Workspace slug (default: the active workspace)")
    .action(async (opts) => {
      const ws: string = opts.workspace ?? currentWorkspace();
      requireWorkspace("farm stop", ws);
      const pid = readFarmPid(ws);
      if (!isFarmAlive(pid)) {
        clearFarmPid(ws);
        out({ workspace: ws, stopped: false, pid: null, detail: "no live farm process (stale pidfile cleared if present)" });
        return;
      }
      process.kill(pid!, "SIGTERM");
      ok(`Sent SIGTERM to farm pid ${pid}`);
      out({ workspace: ws, stopped: true, pid, detail: "the loop exits after the node in flight; runs resume on the next start" });
    });

  return cmd;
}
