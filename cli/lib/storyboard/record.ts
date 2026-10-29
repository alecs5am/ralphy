// Storyboard review (#570) — the stored half.
//
// Approvals live in ONE project-scoped Document (kind `storyboard`, slug
// `storyboard-review`). Every decision appends an immutable JSON revision —
// the Document's revision history is the audit trail, nothing is overwritten —
// and every decision is mirrored into the Project's user-prompt log
// (`stage: storyboard-approval | storyboard-rejection | storyboard-comment`),
// so the approval that unlocks paid generation is on record twice.

import { logUserPromptInDir } from "../gen-log.js";
import { createDocument, reviseDocument } from "../store/documents.js";
import { openDomainDb } from "../store/db.js";
import { StoreConflictError } from "../store/types.js";
import {
  applyReview,
  emptyRecord,
  mergeScenes,
  parseRecord,
  STORYBOARD_DOCUMENT_SLUG,
  STORYBOARD_SCHEMA_VERSION,
  totalsOf,
  type StoryboardRecord,
  type StoryboardReviewInput,
  type StoryboardView,
} from "./model.js";
import { deriveStoryboard, type StoryboardProject } from "./source.js";

type StoredHead = {
  documentId: string;
  revisionId: string | null;
  revisionNo: number | null;
  body: string | null;
};

function storedHead(projectId: string): StoredHead | null {
  try {
    return openDomainDb().query<StoredHead, [string, string]>(
      `SELECT document.id AS documentId, revision.id AS revisionId,
              revision.revision_no AS revisionNo, revision.body
       FROM documents document
       LEFT JOIN document_revisions revision ON revision.id = document.current_revision_id
       WHERE document.project_id = ? AND document.slug = ?`,
    ).get(projectId, STORYBOARD_DOCUMENT_SLUG);
  } catch {
    return null;
  }
}

/** The stored record (empty before the first decision). */
export function loadStoryboardRecord(projectId: string): {
  record: StoryboardRecord;
  head: StoredHead | null;
} {
  const head = storedHead(projectId);
  if (!head?.body) return { record: emptyRecord(""), head };
  try {
    return { record: parseRecord(JSON.parse(head.body)), head };
  } catch {
    return { record: emptyRecord(""), head };
  }
}

/** The reviewable storyboard: derived scenes merged with stored approvals. */
export function showStoryboard(project: StoryboardProject): StoryboardView {
  const derived = deriveStoryboard(project);
  const { record, head } = loadStoryboardRecord(project.id);
  const scenes = mergeScenes(derived.scenes, record);
  const totals = totalsOf(scenes);
  return {
    schemaVersion: STORYBOARD_SCHEMA_VERSION,
    project: { id: project.id, slug: project.slug, workspaceId: project.workspaceId },
    aiProduction: derived.aiProduction,
    aiProductionReason: derived.aiProductionReason,
    contentMode: derived.contentMode,
    scenarioSource: derived.scenarioSource,
    scenes,
    totals,
    approvedAll: totals.scenes > 0 && totals.approved === totals.scenes,
    approvedAllAt: record.approvedAllAt,
    document: head?.revisionId && head.revisionNo !== null
      ? { documentId: head.documentId, revisionId: head.revisionId, revisionNo: head.revisionNo }
      : null,
  };
}

export interface ReviewStoryboardResult {
  storyboard: StoryboardView;
  touched: string[];
  revisionId: string;
}

/**
 * Record one review decision: append a Document revision and log the decision
 * to the user-prompt log. Retries once when another writer moved the head.
 */
export async function reviewStoryboard(
  project: StoryboardProject,
  input: StoryboardReviewInput & { authoredBySessionId?: string | null },
): Promise<ReviewStoryboardResult> {
  const derived = deriveStoryboard(project);
  let attempt = 0;
  for (;;) {
    const { record, head } = loadStoryboardRecord(project.id);
    const base = head?.body ? record : emptyRecord(input.now);
    const { record: next, touched } = applyReview(base, derived.scenes, input);
    const documentId = head?.documentId ?? createDocument({
      projectId: project.id,
      kind: "storyboard",
      slug: STORYBOARD_DOCUMENT_SLUG,
      title: "Storyboard review",
    }).id;
    try {
      const revision = reviseDocument({
        documentId,
        expectedHeadId: head?.revisionId ?? null,
        format: "json",
        title: "Storyboard review",
        body: JSON.stringify(next),
        authoredBySessionId: input.authoredBySessionId ?? null,
      });
      await logUserPromptInDir(project.dir, {
        stage: input.action === "approve"
          ? "storyboard-approval"
          : input.action === "reject"
            ? "storyboard-rejection"
            : "storyboard-comment",
        text: input.comment?.trim()
          || `${input.action === "approve" ? "approved" : "rejected"} ${input.all ? "all scenes" : touched.join(", ")}`,
        note: `scenes=${touched.join(",")}${input.all ? " all=true" : ""} source=${input.source ?? "cli"} revision=${revision.id}`,
      });
      return { storyboard: showStoryboard(project), touched, revisionId: revision.id };
    } catch (error) {
      if (error instanceof StoreConflictError && attempt === 0) {
        attempt += 1;
        continue;
      }
      throw error;
    }
  }
}
