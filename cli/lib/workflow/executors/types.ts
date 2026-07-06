// Shared executor contract (#499) — cycle-free base module: the per-node
// executor files import from here, never from index.ts (which owns the
// registry and imports THEM for registration).

import type { WorkflowNode } from "../../schemas/workflow.js";
import type { ModelFactory } from "../../providers/ai-sdk.js";

/** Structured, throwable failure — the runner's on_fail routing consumes it. */
export class NodeExecutionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "NodeExecutionError";
    this.code = code;
  }
}

/** The EXACT coding-agent binaries allowed. Anything else is rejected. */
export const CODING_AGENT_BINARIES = ["claude", "codex", "gemini"] as const;
export type CodingAgentBinary = (typeof CODING_AGENT_BINARIES)[number];

/** A generations.jsonl-shaped row; the runner decides where it lands. */
export type ExecutorLogEntry = Record<string, unknown> & {
  provider: string;
  model: string;
  endpoint: string;
  kind: string;
  status: "ok" | "error";
};

/** Everything a node executor may touch. The runner (#503) builds this. */
export interface ExecutorContext {
  /** Workspace slug the run belongs to. */
  workspace: string;
  /** Absolute workspace dir — the base for prompt/schema file-ref resolution. */
  workspaceDir: string;
  /** Project id when the run is project-scoped (gen-log destination). */
  projectId?: string;
  /** Absolute dir where node output artifacts land (append-only, .vN versioned). */
  artifactsDir: string;
  /** Resolved in-port values keyed by port name (feeds {{slot}} interpolation). */
  inputs: Record<string, unknown>;
  /**
   * Tools the graph exposes to agent-loop nodes, keyed by name (built via
   * defineSdkTool). A node's params.tools whitelist selects from this set —
   * executors never invent tools.
   */
  tools?: Record<string, unknown>;
  /** Append one row to the run/gen log (model, tokens, cost per SDK call). */
  log: (entry: ExecutorLogEntry) => Promise<void>;
  /** Report realized spend (USD) to the runner's budget accounting. */
  reportCost: (usd: number) => void;
  /** Test seam: replaces the OpenRouter model factory (zero-network tests). */
  modelFactory?: ModelFactory;
  /**
   * The #480 Run this node executes under (set by the farm runner, #503).
   * Control-flow executors (approval / budget-guard) read the run's spend
   * ledger and write inbox packs against it. Absent outside a farm run.
   */
  runId?: string;
  /** Absolute run dir (`runs/<runId>/`) — inbox packs + run-scoped files. */
  runDir?: string;
  /**
   * Realized run-wide spend so far (USD), accumulated by the runner from the
   * run journal + this run's reportCost calls. budget-guard's spent basis.
   */
  runSpendUsd?: number;
  /**
   * Test seam for ingestion nodes (#500): fetch implementation the connectors
   * (firecrawl / apify) and rss feed pulls go through. Default: global fetch.
   */
  fetchImpl?: typeof fetch;
  /**
   * Test seam for coding-agent: maps an ALLOWLISTED binary + prompt to the
   * argv to spawn. The allowlist check runs before this — the seam cannot
   * widen the public binary surface.
   */
  resolveBinaryArgv?: (binary: CodingAgentBinary, prompt: string) => string[];
}

export interface ExecutorResult {
  /** The node's output value (text, or the parsed object for generate-object). */
  output: unknown;
  /** Absolute path of the artifact written (append-only versioned). */
  artifactPath?: string;
  /**
   * Node ids the runner should mark skipped (branch pruning, #503): a
   * `switch` deactivates its unselected route targets, a `gate` verdict
   * "ship" deactivates its repair branch. The skip cascades to nodes whose
   * inputs depend on a skipped producer. Additive — non-control-flow
   * executors never set it.
   */
  deactivate?: string[];
}

export type NodeExecutor = (node: WorkflowNode, ctx: ExecutorContext) => Promise<ExecutorResult>;
