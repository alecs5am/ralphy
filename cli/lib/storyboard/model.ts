// Storyboard review contract (#570) — the pure half.
//
// A storyboard is the per-scene review sheet the user approves BEFORE any paid
// image / video generation for a scene runs. Each scene carries the frame (a
// cheap still or sketch), the VO line, the duration, the camera note, the
// chosen models and the estimated cost, plus its approval state.
//
// Scene content is DERIVED from the project (scenario, prompts, plan, frames);
// approvals are STORED in the project's `storyboard` Document (one immutable
// JSON revision per decision, see `record.ts`). An approval is pinned to the
// scene's content fingerprint: when the VO, duration, camera or frame changes
// after approval, the approval reads as `stale` and the gate treats the scene
// as unapproved until the user approves it again.
//
// This file holds only types and pure functions so tests, the CLI, the bridge
// and the HTML renderer share one vocabulary.

import { createHash } from "node:crypto";

export const STORYBOARD_SCHEMA_VERSION = 1;
export const STORYBOARD_DOCUMENT_SLUG = "storyboard-review";

/** A stored decision. `pending` is the absence of a decision. */
export type StoryboardDecision = "approved" | "rejected";

/** The state a scene reads as: a stored decision, nothing yet, or a decision on older content. */
export type StoryboardSceneState = "pending" | "approved" | "rejected" | "stale";

/** Who wrote a decision or a comment. */
export type StoryboardSource = "cli" | "desktop" | "bridge";

/** Modes whose projects edit raw footage: no storyboard approval step (#570). */
export const RAW_FOOTAGE_MODES: readonly string[] = ["personal-clipper", "podcast-video"];

export interface StoryboardFrame {
  /** Slot the frame was found under (`storyboard-scene-01`), or the scenario path. */
  slot: string;
  /** Where the frame came from. */
  source: "artifact" | "file";
  /** Store Artifact id when the frame is an Artifact. */
  artifactId: string | null;
  revisionId: string | null;
  objectId: string | null;
  /** Absolute path of the frame bytes on disk, when known. */
  path: string | null;
  mime: string | null;
  /** Stable identity of the frame content (revision id or file sha256). */
  key: string;
}

export interface StoryboardModels {
  image: string | null;
  video: string | null;
}

/** A scene as derived from the project, before approvals are merged in. */
export interface StoryboardSceneDraft {
  id: string;
  order: number;
  role: string | null;
  vo: string;
  durationSec: number;
  camera: string;
  frame: StoryboardFrame | null;
  models: StoryboardModels;
  estimatedCostUsd: number;
  /** sha256 over vo + duration + camera + frame key. */
  fingerprint: string;
}

export interface StoryboardApproval {
  decision: StoryboardDecision;
  /** Fingerprint of the scene content the decision was made on. */
  fingerprint: string;
  comment: string | null;
  decidedAt: string;
  source: StoryboardSource;
}

export interface StoryboardComment {
  at: string;
  text: string;
  /** The decision the comment came with, or null for a plain comment. */
  decision: StoryboardDecision | null;
  source: StoryboardSource;
}

/** The body of one `storyboard` Document revision. */
export interface StoryboardRecord {
  schemaVersion: typeof STORYBOARD_SCHEMA_VERSION;
  approvals: Record<string, StoryboardApproval>;
  comments: Record<string, StoryboardComment[]>;
  /** When the last approve-all ran, or null. */
  approvedAllAt: string | null;
  /** Snapshot of the scenes the last decision was made on (audit; not authoritative). */
  scenes: StoryboardSceneDraft[];
  updatedAt: string;
}

export interface StoryboardScene extends StoryboardSceneDraft {
  state: StoryboardSceneState;
  approval: StoryboardApproval | null;
  comments: StoryboardComment[];
}

export interface StoryboardTotals {
  scenes: number;
  approved: number;
  rejected: number;
  pending: number;
  stale: number;
  estimatedCostUsd: number;
  durationSec: number;
}

/** The storyboard as `ralphy storyboard show` and `storyboard.show` return it. */
export interface StoryboardView {
  schemaVersion: typeof STORYBOARD_SCHEMA_VERSION;
  project: { id: string; slug: string; workspaceId: string };
  /** True when the approval gate applies to this project (#570). */
  aiProduction: boolean;
  /** Why `aiProduction` is what it is. */
  aiProductionReason: string;
  contentMode: string | null;
  /** Where the scenes were read from, or null when the project has no scenario. */
  scenarioSource: string | null;
  scenes: StoryboardScene[];
  totals: StoryboardTotals;
  /** Every scene approved on its current content. */
  approvedAll: boolean;
  approvedAllAt: string | null;
  /** The stored Document head, or null before the first decision. */
  document: { documentId: string; revisionId: string; revisionNo: number } | null;
}

export function emptyRecord(now = new Date().toISOString()): StoryboardRecord {
  return {
    schemaVersion: STORYBOARD_SCHEMA_VERSION,
    approvals: {},
    comments: {},
    approvedAllAt: null,
    scenes: [],
    updatedAt: now,
  };
}

/** Parse a stored revision body; malformed input reads as an empty record. */
export function parseRecord(raw: unknown): StoryboardRecord {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyRecord();
  const value = raw as Partial<StoryboardRecord>;
  const approvals: Record<string, StoryboardApproval> = {};
  for (const [scene, approval] of Object.entries(value.approvals ?? {})) {
    if (
      approval && typeof approval === "object" &&
      (approval.decision === "approved" || approval.decision === "rejected") &&
      typeof approval.fingerprint === "string"
    ) {
      approvals[scene] = {
        decision: approval.decision,
        fingerprint: approval.fingerprint,
        comment: typeof approval.comment === "string" ? approval.comment : null,
        decidedAt: typeof approval.decidedAt === "string" ? approval.decidedAt : "",
        source: sourceOf(approval.source),
      };
    }
  }
  const comments: Record<string, StoryboardComment[]> = {};
  for (const [scene, list] of Object.entries(value.comments ?? {})) {
    if (!Array.isArray(list)) continue;
    comments[scene] = list
      .filter((entry) => entry && typeof entry.text === "string")
      .map((entry) => ({
        at: typeof entry.at === "string" ? entry.at : "",
        text: entry.text,
        decision: entry.decision === "approved" || entry.decision === "rejected" ? entry.decision : null,
        source: sourceOf(entry.source),
      }));
  }
  return {
    schemaVersion: STORYBOARD_SCHEMA_VERSION,
    approvals,
    comments,
    approvedAllAt: typeof value.approvedAllAt === "string" ? value.approvedAllAt : null,
    scenes: Array.isArray(value.scenes) ? value.scenes : [],
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  };
}

function sourceOf(value: unknown): StoryboardSource {
  return value === "desktop" || value === "bridge" ? value : "cli";
}

/** Content fingerprint of a scene: what the user actually saw when deciding. */
export function sceneFingerprint(scene: {
  vo: string;
  durationSec: number;
  camera: string;
  frame: { key: string } | null;
}): string {
  return createHash("sha256")
    .update(JSON.stringify([scene.vo.trim(), scene.durationSec, scene.camera.trim(), scene.frame?.key ?? null]))
    .digest("hex")
    .slice(0, 16);
}

/** Merge derived scenes with stored approvals into the reviewable scenes. */
export function mergeScenes(
  drafts: StoryboardSceneDraft[],
  record: StoryboardRecord,
): StoryboardScene[] {
  return drafts.map((draft) => {
    const approval = record.approvals[draft.id] ?? null;
    const state: StoryboardSceneState = !approval
      ? "pending"
      : approval.fingerprint !== draft.fingerprint
        ? "stale"
        : approval.decision;
    return { ...draft, state, approval, comments: record.comments[draft.id] ?? [] };
  });
}

export function totalsOf(scenes: StoryboardScene[]): StoryboardTotals {
  const count = (state: StoryboardSceneState) => scenes.filter((scene) => scene.state === state).length;
  return {
    scenes: scenes.length,
    approved: count("approved"),
    rejected: count("rejected"),
    pending: count("pending"),
    stale: count("stale"),
    estimatedCostUsd: round4(scenes.reduce((sum, scene) => sum + scene.estimatedCostUsd, 0)),
    durationSec: round4(scenes.reduce((sum, scene) => sum + scene.durationSec, 0)),
  };
}

export type StoryboardReviewAction = "approve" | "reject" | "comment";

/** A review request the storyboard cannot apply (unknown scene, missing text). */
export class StoryboardReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoryboardReviewError";
  }
}

export interface StoryboardReviewInput {
  action: StoryboardReviewAction;
  /** Scene ids to decide on. Ignored when `all` is true. */
  scenes?: string[];
  /** Apply to every scene (approve-all / reject-all). */
  all?: boolean;
  comment?: string | null;
  source?: StoryboardSource;
  now?: string;
}

/**
 * Apply one review decision to a record. Pure: returns the next record and the
 * scene ids it touched. Unknown scene ids refuse — a decision must name a scene
 * the user can see.
 */
export function applyReview(
  record: StoryboardRecord,
  drafts: StoryboardSceneDraft[],
  input: StoryboardReviewInput,
): { record: StoryboardRecord; touched: string[] } {
  const now = input.now ?? new Date().toISOString();
  const source = input.source ?? "cli";
  const comment = input.comment?.trim() ? input.comment.trim() : null;
  const known = new Map(drafts.map((draft) => [draft.id, draft]));
  const targets = input.all ? drafts.map((draft) => draft.id) : [...new Set(input.scenes ?? [])];
  if (targets.length === 0) {
    throw new StoryboardReviewError(input.all ? "the storyboard has no scenes to review" : "name at least one scene (--scene <id>) or pass --all");
  }
  const unknown = targets.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new StoryboardReviewError(`unknown storyboard scene(s): ${unknown.join(", ")} (scenes: ${[...known.keys()].join(", ") || "none"})`);
  }
  if (input.action === "comment" && !comment) throw new StoryboardReviewError("a comment needs text (--comment <text>)");

  const next: StoryboardRecord = {
    ...record,
    approvals: { ...record.approvals },
    comments: Object.fromEntries(Object.entries(record.comments).map(([id, list]) => [id, [...list]])),
    scenes: drafts,
    updatedAt: now,
  };
  const decision: StoryboardDecision | null =
    input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : null;
  for (const id of targets) {
    if (decision) {
      next.approvals[id] = { decision, fingerprint: known.get(id)!.fingerprint, comment, decidedAt: now, source };
    }
    if (comment) {
      next.comments[id] = [...(next.comments[id] ?? []), { at: now, text: comment, decision, source }];
    }
  }
  if (input.all && decision === "approved") next.approvedAllAt = now;
  if (decision === "rejected") next.approvedAllAt = null;
  return { record: next, touched: targets };
}

/** `scene-03` from a slot such as `scene-03-bg-image`; null for a non-scene slot. */
export function sceneOfSlot(slot: string): string | null {
  const canonical = slot.trim().toLowerCase().replace(/_/g, "-");
  const match = /^(scene-\d{2,3})(?:-|$)/.exec(canonical);
  if (!match) return null;
  // Storyboard frames themselves are the cheap review stills, never gated.
  if (/(?:^|-)(storyboard|sketch)(?:-|$)/.test(canonical)) return null;
  return match[1]!;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
