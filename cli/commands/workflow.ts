import { Command } from "commander";
import fs from "fs/promises";
import { existsSync } from "fs";
import {
  layoutMode,
  workspaceDir,
  workflowsDir,
  projectDir,
  DEFAULT_WORKSPACE,
} from "../lib/paths.js";
import { out, ok, err } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { logUserPrompt } from "../lib/gen-log.js";
import { CONTENT_MODES_LIST, type ContentMode } from "../lib/content-modes.js";
import {
  workflowPath,
  listWorkflowNames,
  loadWorkflow,
  deriveDefaultWorkflow,
  evaluateWorkflow,
} from "../lib/workflow.js";
import type { Workflow } from "../lib/schemas/workflow.js";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function requireRalphyLayout(verb: string) {
  if (layoutMode() === "legacy") raiseError("E_LEGACY_LAYOUT", { verb });
}

function ensureWorkspaceExists(slug: string) {
  if (slug !== DEFAULT_WORKSPACE && !existsSync(workspaceDir(slug))) {
    raiseError("E_NOT_FOUND", { kind: "Workspace", id: slug });
  }
}

/** Compact a workflow into the row shape show / init print. */
function summarize(wf: Workflow) {
  return {
    name: wf.name,
    version: wf.version,
    steps: wf.steps.map((s) => ({
      id: s.id,
      label: s.label || s.id,
      phase: s.phase,
      engine: s.engine,
      model: s.model ?? (s.models?.length ? s.models.join(", ") : null),
      variants: s.variants,
      gate: s.gate,
      mode: s.mode,
    })),
  };
}

export function workflowCmd() {
  const cmd = new Command("workflow").description(
    "Author + inspect a workspace's declarative staged pipeline (workflows/<name>.json) — the configurable idea→video flow (#478)",
  );

  // ── init ───────────────────────────────────────────────────────────────────
  cmd
    .command("init <slug>")
    .description(
      "Scaffold a default workflow.json for a workspace, derived from the contract spine + the workspace stageGates. A STARTING POINT to edit — sets phases, gates, and auto|approve; leaves models unset. Example: ralphy workflow init silent-hill --mode tutorial-ugc",
    )
    .option("--name <name>", "Workflow name (file basename, default 'episode')", "episode")
    .option("--mode <content-mode>", "Content mode to infer image-vs-video engines from (optional)")
    .action(async (slug: string, opts) => {
      requireRalphyLayout("workflow init");
      ensureWorkspaceExists(slug);
      const name = String(opts.name || "episode");
      if (!SLUG_RE.test(name)) {
        raiseError("E_VALIDATION_FAILED", {
          target: "name",
          detail: `'${name}' is not a valid workflow name (lowercase kebab-case)`,
        });
      }
      const mode = opts.mode as string | undefined;
      if (mode && !CONTENT_MODES_LIST.includes(mode as ContentMode)) {
        raiseError("E_VALIDATION_FAILED", {
          target: "mode",
          detail: `unknown content mode '${mode}' (see ralphy template suggest --help)`,
        });
      }
      const dest = workflowPath(slug, name);
      if (existsSync(dest)) {
        raiseError("E_ALREADY_EXISTS", { kind: "Workflow", id: `${slug}/${name}` });
      }
      const wf = deriveDefaultWorkflow(slug, mode as ContentMode | undefined, name);
      await fs.mkdir(workflowsDir(slug), { recursive: true });
      await fs.writeFile(dest, JSON.stringify(wf, null, 2) + "\n");
      ok(`Workflow scaffolded: ${slug}/${name} (${wf.steps.length} steps) — edit ${dest} to set models / variants`);
      out({ workspace: slug, ...summarize(wf), path: dest });
    });

  // ── list ───────────────────────────────────────────────────────────────────
  cmd
    .command("list <slug>")
    .description("List the workflows authored in a workspace")
    .action(async (slug: string) => {
      requireRalphyLayout("workflow list");
      ensureWorkspaceExists(slug);
      out(listWorkflowNames(slug).map((name) => ({ name, path: workflowPath(slug, name) })));
    });

  // ── show ───────────────────────────────────────────────────────────────────
  cmd
    .command("show <slug> [name]")
    .description("Show a workflow's ordered steps. Omit name when the workspace has exactly one workflow.")
    .action(async (slug: string, name?: string) => {
      requireRalphyLayout("workflow show");
      ensureWorkspaceExists(slug);
      let wfName = name;
      if (!wfName) {
        const names = listWorkflowNames(slug);
        if (names.length === 0) {
          err(`No workflows in ${slug} — scaffold one with: ralphy workflow init ${slug}`);
          return;
        }
        if (names.length > 1) {
          err(`${slug} has ${names.length} workflows (${names.join(", ")}) — pass a name: ralphy workflow show ${slug} <name>`);
          return;
        }
        wfName = names[0];
      }
      if (!existsSync(workflowPath(slug, wfName))) {
        raiseError("E_NOT_FOUND", { kind: "Workflow", id: `${slug}/${wfName}` });
      }
      try {
        const wf = await loadWorkflow(slug, wfName);
        out({ workspace: slug, ...summarize(wf) });
      } catch (e) {
        err(`workflow show failed: ${(e as Error).message}`);
      }
    });

  // ── status ───────────────────────────────────────────────────────────────
  cmd
    .command("status <project>")
    .description(
      "Per-step run status of a project's workflow (done | running | waiting | blocked | queued), derived from the contract ledger + workspace-eval.json + the job queue. Surfaces the current step + the next action. ZERO model calls. Example: ralphy workflow status choose-silenthill-005",
    )
    .option("--workflow <name>", "Which workflow (default: the workspace's only one, or 'episode')")
    .action(async (project: string, opts) => {
      requireRalphyLayout("workflow status");
      if (!existsSync(projectDir(project))) {
        raiseError("E_NOT_FOUND", { kind: "Project", id: project });
      }
      try {
        out(await evaluateWorkflow(project, opts.workflow as string | undefined));
      } catch (e) {
        err(`workflow status failed: ${(e as Error).message}`);
      }
    });

  // ── run ────────────────────────────────────────────────────────────────────
  // The agent-facing / Studio entry point (D-3 driver-agnostic): logs the idea
  // and returns the workflow ledger with the next action. It NEVER spends — paid
  // generation stays gated behind the agent executing the surfaced step. A future
  // headless callLLM() driver consumes the same ledger.
  cmd
    .command("run <project>")
    .description(
      "Start / advance a project's workflow: log the idea and surface the current step + next action (same ledger as `status`). Drives the pipeline WITHOUT spending — the agent (or a future headless driver) executes the surfaced step, then re-runs to advance. Example: ralphy workflow run choose-silenthill-005 --idea 'foggy hospital, the nurse offers a deal'",
    )
    .option("--idea <text>", "The video idea to log to the project's user-prompts.jsonl")
    .option("--workflow <name>", "Which workflow (default: the workspace's only one, or 'episode')")
    .action(async (project: string, opts) => {
      requireRalphyLayout("workflow run");
      if (!existsSync(projectDir(project))) {
        raiseError("E_NOT_FOUND", { kind: "Project", id: project });
      }
      try {
        if (opts.idea) {
          await logUserPrompt(project, { text: String(opts.idea), stage: "workflow:idea", note: "workflow run idea" });
        }
        const ev = await evaluateWorkflow(project, opts.workflow as string | undefined);
        out({ ...ev, ideaLogged: Boolean(opts.idea) });
      } catch (e) {
        err(`workflow run failed: ${(e as Error).message}`);
      }
    });

  return cmd;
}
