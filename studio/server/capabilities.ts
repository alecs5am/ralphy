// Capability discovery (#492) — GET /api/capabilities.
//
// A machine-readable map of the Studio API boundary so an orchestrator (Claude
// Code) DISCOVERS the supported actions + their methods/paths instead of
// guessing at file paths under `.ralphy/`. The rule (docs/workflow-app-api.md):
// prefer an endpoint here over an ad-hoc `.ralphy/` file read wherever one
// exists.
//
// This is a STATIC description (no filesystem read) — the routes it lists are
// the ones registered in server/index.ts. `mutates` flags a state-changing
// endpoint; `throughCli` names the ralphy verb a money/state transition routes
// through (Studio never runs a second media engine — invariant #1/#14).

export interface Capability {
  id: string;
  method: "GET" | "POST";
  path: string;
  summary: string;
  /** Does the call change state? GET reads are always false. */
  mutates: boolean;
  /** The ralphy verb a mutation routes through (null = metadata-only sidecar write). */
  throughCli: string | null;
}

export interface CapabilitiesView {
  version: 1;
  /** How stable object ids are formed across the surface. */
  idConventions: Record<string, string>;
  /** The media-safety + orchestration rule, stated for the consumer. */
  rules: string[];
  capabilities: Capability[];
}

const CAPABILITIES: Capability[] = [
  // ── Discovery ──
  { id: "capabilities", method: "GET", path: "/api/capabilities", summary: "This document — the supported action list.", mutates: false, throughCli: null },
  { id: "health", method: "GET", path: "/api/health", summary: "Liveness + whether auth is on (login-free).", mutates: false, throughCli: null },

  // ── Workspaces / projects / runs (reads) ──
  { id: "workspaces.list", method: "GET", path: "/api/workspaces", summary: "Every workspace with its project count.", mutates: false, throughCli: null },
  { id: "projects.list", method: "GET", path: "/api/projects?workspace=<ws>", summary: "Projects in a workspace.", mutates: false, throughCli: null },
  { id: "project.artifacts", method: "GET", path: "/api/projects/<id>/artifacts?workspace=<ws>", summary: "A project's artifacts grouped by kind.", mutates: false, throughCli: null },
  { id: "project.workflow", method: "GET", path: "/api/projects/<id>/workflow?workspace=<ws>", summary: "The derived per-step workflow lane.", mutates: false, throughCli: null },
  { id: "project.board", method: "GET", path: "/api/projects/<id>/board?workspace=<ws>", summary: "The derived scene board.", mutates: false, throughCli: null },
  { id: "runs.list", method: "GET", path: "/api/runs?workspace=<ws>", summary: "Every farm run with project counts.", mutates: false, throughCli: null },
  { id: "run.show", method: "GET", path: "/api/runs/<id>?workspace=<ws>", summary: "One run's rolled-up status/summary.", mutates: false, throughCli: null },
  { id: "run.graph", method: "GET", path: "/api/runs/<id>/graph?workspace=<ws>", summary: "The derived source-to-unit run graph.", mutates: false, throughCli: null },

  // ── Farm control plane ──
  { id: "farm.status", method: "GET", path: "/api/farm/status?workspace=<ws>", summary: "Daemon + per-run status roll-up.", mutates: false, throughCli: null },
  { id: "farm.report", method: "GET", path: "/api/farm/report?workspace=<ws>", summary: "Farm metrics roll-up.", mutates: false, throughCli: null },
  { id: "farm.simulate", method: "GET", path: "/api/farm/simulate?workspace=<ws>", summary: "Dry-run a workflow (zero spend).", mutates: false, throughCli: "workflow simulate" },
  { id: "farm.start", method: "POST", path: "/api/farm/start", summary: "Start the farm daemon (detached).", mutates: true, throughCli: "farm start" },
  { id: "farm.stop", method: "POST", path: "/api/farm/stop", summary: "Stop the farm daemon (SIGTERM).", mutates: true, throughCli: "farm stop" },

  // ── Workflows ──
  { id: "workflows.list", method: "GET", path: "/api/workspaces/<ws>/workflows", summary: "A workspace's workflows with their shape.", mutates: false, throughCli: null },
  { id: "workflow.graph", method: "GET", path: "/api/workspaces/<ws>/workflows/<name>/graph", summary: "A graph workflow's node/edge/layer view.", mutates: false, throughCli: null },

  // ── Annotations (#488) ──
  { id: "annotations.list", method: "GET", path: "/api/(projects|runs)/<id>/annotations?workspace=<ws>", summary: "The folded annotation set.", mutates: false, throughCli: null },
  { id: "annotations.add", method: "POST", path: "/api/(projects|runs)/<id>/annotations", summary: "Append a controlled-vocab tag/note (metadata only).", mutates: true, throughCli: null },
  { id: "annotations.remove", method: "POST", path: "/api/(projects|runs)/<id>/annotations/remove", summary: "Tombstone an annotation by id (metadata only).", mutates: true, throughCli: null },

  // ── Agent inbox (#489) ──
  { id: "inbox.list", method: "GET", path: "/api/(projects|runs)/<id>/inbox?workspace=<ws>", summary: "The agent context packs.", mutates: false, throughCli: null },
  { id: "inbox.show", method: "GET", path: "/api/(projects|runs)/<id>/inbox?workspace=<ws>&id=<packId>", summary: "One context pack by id.", mutates: false, throughCli: null },
  { id: "inbox.create", method: "POST", path: "/api/(projects|runs)/<id>/inbox", summary: "Write a JSON+MD context pack (metadata only, NOT a spend instruction).", mutates: true, throughCli: null },

  // ── Config patches (#491) — PROPOSE only; apply stays a ralphy verb ──
  { id: "patches.list", method: "GET", path: "/api/runs/<id>/config-patches?workspace=<ws>", summary: "Proposed patches + the folded effective config.", mutates: false, throughCli: null },
  { id: "patches.propose", method: "POST", path: "/api/runs/<id>/config-patches", summary: "Propose (validate + queue) an allowlisted config patch. Studio NEVER applies — apply is `ralphy studio patch apply`.", mutates: true, throughCli: null },

  // ── Approvals (#492/#533) — the parked-approval gate ──
  { id: "approvals.list", method: "GET", path: "/api/workspaces/<ws>/approvals", summary: "Every parked-approval item awaiting a decision, with stable <run>::<node> ids.", mutates: false, throughCli: "farm review" },
  { id: "approvals.respond", method: "POST", path: "/api/workspaces/<ws>/approvals/respond", summary: "Approve / reject / request-change one parked item. Drives `ralphy farm review` — NO new media mutation.", mutates: true, throughCli: "farm review" },
];

export function capabilitiesView(): CapabilitiesView {
  return {
    version: 1,
    idConventions: {
      workspace: "the workspace slug (kebab-case)",
      project: "the project id, {context}-{NNN}",
      run: "the farm run id",
      approval: "<run>::<node> — the run id + the parked node id",
      annotation: "a ULID-ish id returned on add",
      configPatch: "an id returned on propose",
      inboxPack: "<timestamp>-<action>",
    },
    rules: [
      "Orchestrate through this API boundary — prefer an endpoint here over an ad-hoc `.ralphy/` file read wherever one exists.",
      "Studio writes only metadata; money/state transitions go through the ralphy verb named in `throughCli`, never a second media engine.",
      "A `mutates: true` endpoint with `throughCli: null` is an append-only metadata sidecar write (board choice, annotation, inbox pack, config-patch proposal).",
      "Config patches are PROPOSALS — Studio never applies them; the agent runs `ralphy studio patch apply` behind the paid-generation gate.",
    ],
    capabilities: CAPABILITIES,
  };
}
