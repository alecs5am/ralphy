// Workflow-graph node executor registry (#499) — THE seam later issues extend.
//
// An executor turns one WorkflowNode into an output: `(node, ctx) => result`.
// The shared contract (ExecutorContext, NodeExecutor, NodeExecutionError)
// lives in types.ts; per-category executor implementations live in sibling
// files (llm.ts, coding-agent.ts here; media / ralphy-verb / ingestion /
// publish / control-flow / data land in #500/#501/#503/#504 via
// registerExecutor()).
//
// Registered here: the four A-category LLM node types — generate-text,
// generate-object, agent-loop (via the AI SDK layer, D-01/D-04), coding-agent
// (headless external binary, NO SDK) — the D-category ingestion nodes +
// dedup (#500), the calendar-slot control-flow node (#504), and the E-category
// publish + x-post nodes via Postiz (#501). The generic `http` node is
// deliberately unregistered (see ingestion.ts / issue #500 notes).

import type { WorkflowNodeType } from "../../schemas/workflow.js";
import type { NodeExecutor } from "./types.js";
import { generateTextExecutor, generateObjectExecutor, agentLoopExecutor } from "./llm.js";
import { codingAgentExecutor } from "./coding-agent.js";
import {
  webScrapeExecutor,
  actorExecutor,
  rssExecutor,
  trendWatchExecutor,
  dedupExecutor,
} from "./ingestion.js";
import { calendarSlotExecutor } from "./calendar.js";
import { publishExecutor, xPostExecutor } from "./publish.js";

export {
  NodeExecutionError,
  CODING_AGENT_BINARIES,
  type CodingAgentBinary,
  type ExecutorContext,
  type ExecutorLogEntry,
  type ExecutorResult,
  type NodeExecutor,
} from "./types.js";

const REGISTRY = new Map<WorkflowNodeType, NodeExecutor>();

/** Register an executor for a node type. Double registration is a bug. */
export function registerExecutor(type: WorkflowNodeType, executor: NodeExecutor): void {
  if (REGISTRY.has(type)) {
    throw new Error(`executor for node type "${type}" is already registered`);
  }
  REGISTRY.set(type, executor);
}

export function getExecutor(type: WorkflowNodeType): NodeExecutor | undefined {
  return REGISTRY.get(type);
}

export function registeredExecutorTypes(): WorkflowNodeType[] {
  return [...REGISTRY.keys()];
}

// A. LLM nodes (#499). Later issues extend this list, not this file's API.
registerExecutor("generate-text", generateTextExecutor);
registerExecutor("generate-object", generateObjectExecutor);
registerExecutor("agent-loop", agentLoopExecutor);
registerExecutor("coding-agent", codingAgentExecutor);

// D. Ingestion nodes + the seen-store-backed dedup (#500).
registerExecutor("web-scrape", webScrapeExecutor);
registerExecutor("actor", actorExecutor);
registerExecutor("rss", rssExecutor);
registerExecutor("trend-watch", trendWatchExecutor);
registerExecutor("dedup", dedupExecutor);

// F. Control flow: calendar-slot — the workspace content calendar (#504).
registerExecutor("calendar-slot", calendarSlotExecutor);

// E. Publish nodes via Postiz (#501). youtube-upload (direct API) and
// analytics-pull are named follow-ups (#501 notes / #507).
registerExecutor("publish", publishExecutor);
registerExecutor("x-post", xPostExecutor);
