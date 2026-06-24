// `ralphy run` — the workspace-scoped content-farm campaign control plane (#480).
//
// A Run binds ONE campaign across its member projects. It REFERENCES existing
// artifacts (project ids, batch id, paths, Unit ids) — never duplicates them.
// Storage is file-on-disk under the workspace (`runs/<id>/run.json` + an
// append-only `run-events.jsonl`), mirroring how batches live under batchesDir().
// All reads/aggregation are pure — ZERO model calls.

import { Command } from "commander";
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

  return cmd;
}
