// Workflow-graph node executor registry (#499) — THE seam later issues extend.
//
// An executor turns one WorkflowNode into an output: `(node, ctx) => result`.
// The shared contract (ExecutorContext, NodeExecutor, NodeExecutionError)
// lives in types.ts; per-category executor implementations live in sibling
// files (llm.ts, coding-agent.ts here; ingestion #500, publish #501,
// control-flow/data #503, calendar #504, ralphy-verbs #511; raw media nodes
// remain unregistered).
//
// Registered here: the four A-category LLM node types — generate-text,
// generate-object, agent-loop (via the AI SDK layer, D-01/D-04), coding-agent
// (headless external binary, NO SDK) — the D-category ingestion nodes +
// dedup (#500), the calendar-slot control-flow node (#504), the E-category
// publish + x-post nodes via Postiz (#501), the analytics-pull feedback-loop
// node (#507), and the #503 control-flow/data set (approval, budget-guard,
// gate, join, switch, transform, template-string, artifact-write). The generic `http` node is deliberately
// unregistered (see ingestion.ts / issue #500 notes); `schedule` and
// `fan-out` are runner built-ins (#503, see control-flow.ts header).

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
import { analyticsPullExecutor } from "./analytics.js";
import {
  approvalExecutor,
  budgetGuardExecutor,
  gateExecutor,
  joinExecutor,
  switchExecutor,
  transformExecutor,
  templateStringExecutor,
  artifactWriteExecutor,
} from "./control-flow.js";
import {
  ralphyGenerateExecutor,
  ralphyRenderExecutor,
  ralphyEvalExecutor,
  ralphyRepairExecutor,
  ralphyUnitExecutor,
  ralphyCaptionsExecutor,
  ralphySocialCopyExecutor,
} from "./ralphy-verbs.js";

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

// E. Publish nodes via Postiz (#501) + the loop-closing analytics-pull
// (#507). youtube-upload (direct API) stays a named follow-up (#501 notes).
registerExecutor("publish", publishExecutor);
registerExecutor("x-post", xPostExecutor);
registerExecutor("analytics-pull", analyticsPullExecutor);

// F. Control flow + G. data nodes (#503). NOT registered on purpose:
// `schedule` (the farm runner's trigger built-in, not an executable step) and
// `fan-out` (the runner itself maps the downstream subgraph once per item,
// #510 — branch-scoped records, concurrency cap, per-branch on_fail + resume;
// see control-flow.ts and the runner header).
registerExecutor("approval", approvalExecutor);
registerExecutor("budget-guard", budgetGuardExecutor);
registerExecutor("gate", gateExecutor);
registerExecutor("join", joinExecutor);
registerExecutor("switch", switchExecutor);
registerExecutor("transform", transformExecutor);
registerExecutor("template-string", templateStringExecutor);
registerExecutor("artifact-write", artifactWriteExecutor);

// C. Ralphy verb nodes (#511) — the production middle. Each calls the SAME
// library code its CLI verb uses, in-process (never a child ralphy process,
// never a new model-call path — AGENTS.md invariants #1/#2).
registerExecutor("ralphy-generate", ralphyGenerateExecutor);
registerExecutor("ralphy-render", ralphyRenderExecutor);
registerExecutor("ralphy-eval", ralphyEvalExecutor);
registerExecutor("ralphy-repair", ralphyRepairExecutor);
registerExecutor("ralphy-unit", ralphyUnitExecutor);
registerExecutor("ralphy-captions", ralphyCaptionsExecutor);
registerExecutor("ralphy-social-copy", ralphySocialCopyExecutor);
