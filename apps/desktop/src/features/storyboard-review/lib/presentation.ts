import type { StoryboardDto, StoryboardSceneDto, StoryboardSceneState } from "../../../../electron/ralphy/storyboard-types";

/* What a scene's state reads as, and the words the gallery repeats. Pure, so the card and its
   tests read one vocabulary. */

export const STORYBOARD_STATE_LABELS: Record<StoryboardSceneState, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  stale: "Changed since approval",
};

export function formatCostUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function sceneModelLabel(scene: StoryboardSceneDto): string {
  const parts = [scene.models.image && `image ${scene.models.image}`, scene.models.video && `video ${scene.models.video}`].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No model chosen";
}

/** One line under the gallery title: how far the review has come. */
export function storyboardSummary(storyboard: StoryboardDto): string {
  const totals = storyboard.totals;
  if (totals.scenes === 0) return "No scenes to review yet.";
  const open = totals.pending + totals.stale;
  const parts = [`${totals.approved} of ${totals.scenes} approved`];
  if (totals.rejected) parts.push(`${totals.rejected} rejected`);
  if (open) parts.push(`${open} waiting`);
  parts.push(`${totals.durationSec}s`, `est. ${formatCostUsd(totals.estimatedCostUsd)}`);
  return parts.join(" · ");
}

/** Paid generation for a scene runs only once it reads as approved. */
export function sceneUnlocked(scene: StoryboardSceneDto): boolean {
  return scene.state === "approved";
}

/** The frame the card can draw: a store Artifact is previewable, a loose file is not. */
export function previewableFrameId(scene: StoryboardSceneDto): string | null {
  return scene.frame?.source === "artifact" && scene.frame.artifactId ? scene.frame.artifactId : null;
}
