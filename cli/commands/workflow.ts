import { Command } from "commander";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
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
import { lintWorkflowFile, isArtifactRef } from "../lib/workflow-graph.js";
import { listSubgraphSummaries, subgraphUsage } from "../lib/subgraph.js";
import { getExecutor, registeredExecutorTypes, type ExecutorContext } from "../lib/workflow/executors/index.js";
import { parseWorkflowDocument, type Workflow } from "../lib/schemas/workflow.js";
import { parse as parseYaml } from "yaml";

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

  // ── subgraphs ──────────────────────────────────────────────────────────────
  cmd
    .command("subgraphs <slug>")
    .description(
      "List the workspace's reusable named subgraphs (#517, subgraphs/<name>.json): version, typed entry/exit ports, the overridable param surface, and which workflows instantiate them. A `subgraph` node instantiates one by name with param overrides; expansion into the flat graph happens at lint/load time, one level of nesting only. ZERO model calls. Example: ralphy workflow subgraphs tech-news",
    )
    .action(async (slug: string) => {
      requireRalphyLayout("workflow subgraphs");
      ensureWorkspaceExists(slug);
      out(listSubgraphSummaries(slug));
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

  // ── lint ───────────────────────────────────────────────────────────────────
  cmd
    .command("lint <slug> [name]")
    .description(
      "Offline validation of a workspace's workflows: schema parse for legacy linear workflows (#478), and for node-graph workflows (#498) the full graph checks — #517 subgraph expansion first (missing subgraph refs, unknown overrides, boundary port mismatches, nested subgraphs are errors; an authored-but-unused subgraph is a warning), then DAG (no cycles), edge resolution, port typing, the #497 provider-coverage matrix (a declared-unsupported media param is a HARD error naming the fix), and the #515 prompt-pack lint (model-aware rules over each node's prompt text / prompt file — per-model char caps, kling no-music clause, ElevenLabs artist-name detector, photoreal negative cluster — plus params.guidelines slug validation; also standalone as `ralphy prompt lint <ws>`). Reads .json (storage format) and .yaml (accepted at lint/import per D-03). Omit name to lint every workflow. ZERO model calls. Example: ralphy workflow lint silent-hill episode",
    )
    .action(async (slug: string, name?: string) => {
      requireRalphyLayout("workflow lint");
      ensureWorkspaceExists(slug);
      const dir = workflowsDir(slug);
      const files = existsSync(dir)
        ? (await fs.readdir(dir)).filter((f) => /\.(json|ya?ml)$/.test(f)).sort()
        : [];
      let targets = files;
      if (name) {
        targets = files.filter((f) => f.replace(/\.(json|ya?ml)$/, "") === name);
        if (targets.length === 0) {
          raiseError("E_NOT_FOUND", { kind: "Workflow", id: `${slug}/${name}` });
        }
      }
      // #517: an authored subgraph no workflow instantiates is a workspace-level
      // WARNING (only meaningful when linting the whole workspace).
      const unusedSubgraphs = name ? [] : subgraphUsage(slug).unused;
      if (targets.length === 0) {
        // Graceful no-op: nothing to lint is not a failure.
        out({
          workspace: slug,
          ok: true,
          errorCount: 0,
          warningCount: unusedSubgraphs.length,
          unusedSubgraphs,
          workflows: [],
          note: `no workflows in ${slug} — scaffold one with: ralphy workflow init ${slug}`,
        });
        return;
      }
      const results = targets.map((f) => lintWorkflowFile(path.join(dir, f), slug));
      const ok = results.every((r) => r.ok);
      const errorCount = results.reduce((n, r) => n + r.errors.length, 0);
      const warningCount =
        results.reduce((n, r) => n + r.warnings.length, 0) + unusedSubgraphs.length;
      if (!ok) process.exitCode = 1;
      out({ workspace: slug, ok, errorCount, warningCount, unusedSubgraphs, workflows: results });
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

  // ── run-node ───────────────────────────────────────────────────────────────
  // Debug primitive for #500 ingestion (and any registered executor): execute
  // ONE node of a node-graph workflow standalone, outside the #503 runner.
  cmd
    .command("run-node <slug> <workflow> <node-id>")
    .description(
      "DEBUG: execute ONE node of a node-graph workflow (#498) standalone and print its output. In-ports resolve from artifact refs only (a file path or artifact:<path>) — an upstream <node>.<out> ref errors (run the upstream node first and point the port at its artifact). Node artifacts land under the workspace's runs/run-node/<workflow>/ (append-only). Example: ralphy workflow run-node tech-news pipeline trend-watch",
    )
    .action(async (slug: string, wfName: string, nodeId: string) => {
      requireRalphyLayout("workflow run-node");
      ensureWorkspaceExists(slug);
      const file = ["json", "yaml", "yml"]
        .map((ext) => path.join(workflowsDir(slug), `${wfName}.${ext}`))
        .find(existsSync);
      if (!file) {
        raiseError("E_NOT_FOUND", { kind: "Workflow", id: `${slug}/${wfName}` });
        return;
      }
      const src = await fs.readFile(file, "utf-8");
      const doc = parseWorkflowDocument(/\.ya?ml$/.test(file) ? parseYaml(src) : JSON.parse(src));
      if (doc.kind !== "graph") {
        err(`'${slug}/${wfName}' is a linear workflow (steps[]) — run-node executes node-graph workflows (nodes[])`);
      }
      const node = doc.graph.nodes.find((n) => n.id === nodeId);
      if (!node) {
        raiseError("E_NOT_FOUND", { kind: "Node", id: `${slug}/${wfName}/${nodeId}` });
        return;
      }
      const exec = getExecutor(node.type);
      if (!exec) {
        err(
          `no executor registered for node type "${node.type}" — debug-runnable types: ${registeredExecutorTypes().sort().join(", ")}`,
        );
      }
      // Standalone = no upstream outputs. Only artifact refs resolve.
      const wsDir = workspaceDir(slug);
      const inputs: Record<string, unknown> = {};
      for (const [port, ref] of Object.entries(node.in)) {
        if (!isArtifactRef(ref)) {
          err(
            `in-port "${port}" references upstream node output "${ref}" — run-node executes ONE node standalone; point the port at an artifact ref (artifact:<path> or a file path) instead`,
          );
        }
        const rel = ref.replace(/^artifact:/, "");
        const abs = [path.resolve(rel), path.resolve(wsDir, rel)].find(existsSync);
        if (!abs) {
          raiseError("E_NOT_FOUND", { kind: "Artifact", id: rel });
          return;
        }
        const text = await fs.readFile(abs, "utf-8");
        inputs[port] = abs.endsWith(".json") ? JSON.parse(text) : text;
      }
      const artifactsDir = path.join(wsDir, "runs", "run-node", wfName);
      const logPath = path.join(artifactsDir, "log.jsonl");
      let costUsd = 0;
      const ctx: ExecutorContext = {
        workspace: slug,
        workspaceDir: wsDir,
        artifactsDir,
        inputs,
        log: async (entry) => {
          await fs.mkdir(artifactsDir, { recursive: true });
          await fs.appendFile(logPath, JSON.stringify({ ts: new Date().toISOString(), node: nodeId, ...entry }) + "\n");
        },
        reportCost: (usd) => {
          costUsd += usd;
        },
      };
      try {
        const res = await exec!(node, ctx);
        out({
          workspace: slug,
          workflow: wfName,
          node: nodeId,
          type: node.type,
          items: Array.isArray(res.output) ? res.output.length : null,
          artifactPath: res.artifactPath ?? null,
          costUsd,
          output: res.output,
        });
      } catch (e) {
        err(`run-node failed: ${(e as Error).message}`);
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
