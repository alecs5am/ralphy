// Post-render next step (#575). The #562 harness baseline found eval ran in
// 1 of 21 production sessions: agents stop at render/final.mp4. The render
// summary therefore names the next contract phase and the exact command, so
// the agent does not have to remember the contract order.

import { evaluateContract, type ContractEvaluation } from "../contract.js";

export interface RenderNextStep {
  /** Contract phase id the agent should run next. */
  phase: string;
  /** The command that runs it. */
  command: string;
  /** Always-valid command that prints the whole contract state. */
  contract: string;
  why: string;
}

const AFTER_RENDER: Record<string, { command: (id: string) => string; why: string }> = {
  eval: {
    command: (id) => `ralphy eval video ${id}`,
    why: "Post-render quality gate: eval.json is required before shipping or forming a Unit.",
  },
  unit: {
    command: (id) => `ralphy unit create ${id} --slug <slug> --format <format> --from "render/final.mp4"`,
    why: "Eval is present: package the deliverable as an append-only Unit.",
  },
  postmortem: {
    command: () => "/postmortem",
    why: "Deliverable exists: capture what worked and what cost time.",
  },
};

/**
 * The first post-render phase that is not satisfied yet, with its command.
 * Falls back to eval when the contract cannot be evaluated (never throws).
 */
export function renderNextStep(
  projectId: string,
  evaluate: (id: string) => ContractEvaluation = evaluateContract,
): RenderNextStep {
  const contract = `ralphy project status ${projectId} --contract`;
  let phase = "eval";
  try {
    const phases = evaluate(projectId).phases;
    const next = phases.find((p) => p.id in AFTER_RENDER && !p.present);
    if (next) phase = next.id;
    else if (phases.some((p) => p.id === "eval" && p.present)) phase = "postmortem";
  } catch {
    // Contract evaluation is advisory here; a failure must not fail the render.
  }
  const step = AFTER_RENDER[phase];
  return { phase, command: step.command(projectId), contract, why: step.why };
}
