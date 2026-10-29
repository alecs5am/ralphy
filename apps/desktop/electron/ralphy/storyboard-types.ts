/* The storyboard review contract (#570) as the runtime's `storyboard.show` and
   `storyboard.review` bridge methods return it. Scene content is derived by the
   runtime from the project; the app only draws it and sends decisions back. */

export type StoryboardSceneState = "pending" | "approved" | "rejected" | "stale";
export type StoryboardDecision = "approved" | "rejected";
export type StoryboardReviewAction = "approve" | "reject" | "comment";

export interface StoryboardFrameDto {
  slot: string;
  source: "artifact" | "file";
  artifactId: string | null;
  revisionId: string | null;
  objectId: string | null;
  path: string | null;
  mime: string | null;
  key: string;
}

export interface StoryboardApprovalDto {
  decision: StoryboardDecision;
  fingerprint: string;
  comment: string | null;
  decidedAt: string;
  source: "cli" | "desktop" | "bridge";
}

export interface StoryboardCommentDto {
  at: string;
  text: string;
  decision: StoryboardDecision | null;
  source: "cli" | "desktop" | "bridge";
}

export interface StoryboardSceneDto {
  id: string;
  order: number;
  role: string | null;
  vo: string;
  durationSec: number;
  camera: string;
  frame: StoryboardFrameDto | null;
  models: { image: string | null; video: string | null };
  estimatedCostUsd: number;
  fingerprint: string;
  state: StoryboardSceneState;
  approval: StoryboardApprovalDto | null;
  comments: StoryboardCommentDto[];
}

export interface StoryboardDto {
  schemaVersion: 1;
  project: { id: string; slug: string; workspaceId: string };
  aiProduction: boolean;
  aiProductionReason: string;
  contentMode: string | null;
  scenarioSource: string | null;
  scenes: StoryboardSceneDto[];
  totals: {
    scenes: number;
    approved: number;
    rejected: number;
    pending: number;
    stale: number;
    estimatedCostUsd: number;
    durationSec: number;
  };
  approvedAll: boolean;
  approvedAllAt: string | null;
  document: { documentId: string; revisionId: string; revisionNo: number } | null;
}

export interface StoryboardReviewResultDto {
  touched: string[];
  revisionId: string;
  storyboard: StoryboardDto;
}

/** What the renderer sends for one decision: named scenes, or every scene. */
export type DesktopStoryboardReviewInput =
  | { action: StoryboardReviewAction; scenes: string[]; all?: never; comment?: string }
  | { action: StoryboardReviewAction; all: true; scenes?: never; comment?: string };
