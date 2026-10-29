// Storyboard review before paid AI generation (#570). Public surface.

export * from "./model.js";
export { findStoryboardProject, requireStoryboardProject, deriveStoryboard, type StoryboardProject } from "./source.js";
export { loadStoryboardRecord, reviewStoryboard, showStoryboard, type ReviewStoryboardResult } from "./record.js";
export { checkStoryboardGate, enforceStoryboardGate, readStoryboardConsent, type StoryboardGateVerdict } from "./gate.js";
export { renderStoryboardHtml, writeStoryboardHtml } from "./html.js";

import type { StoryboardView } from "./model.js";

/** The compact approval state `project status --contract` carries (#570). */
export interface StoryboardStatusSummary {
  /** Project slug, for the commands an agent should run next. */
  project: string;
  aiProduction: boolean;
  reason: string;
  scenes: number;
  approved: number;
  rejected: number;
  pending: number;
  stale: number;
  approvedAll: boolean;
  estimatedCostUsd: number;
  /** Per scene: its review state. */
  perScene: Array<{ id: string; state: string; comment: string | null }>;
  revisionId: string | null;
}

export function summarizeStoryboard(view: StoryboardView): StoryboardStatusSummary {
  return {
    project: view.project.slug,
    aiProduction: view.aiProduction,
    reason: view.aiProductionReason,
    scenes: view.totals.scenes,
    approved: view.totals.approved,
    rejected: view.totals.rejected,
    pending: view.totals.pending,
    stale: view.totals.stale,
    approvedAll: view.approvedAll,
    estimatedCostUsd: view.totals.estimatedCostUsd,
    perScene: view.scenes.map((scene) => ({
      id: scene.id,
      state: scene.state,
      comment: scene.approval?.comment ?? scene.comments.at(-1)?.text ?? null,
    })),
    revisionId: view.document?.revisionId ?? null,
  };
}
