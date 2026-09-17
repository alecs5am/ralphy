import type { RalphyBridgeClient } from "./client";
import type { ArtifactMediaCardDto } from "./types";

export interface DesktopMediaReviewInput {
  artifactId: string;
  expectedSelectedRevisionId: string;
  verdict: "approved" | "needs-work" | "rejected";
  feedback?: string;
}

export async function saveMediaReview(
  request: RalphyBridgeClient["request"],
  scope: { workspaceId: string; projectId: string },
  value: DesktopMediaReviewInput,
): Promise<ArtifactMediaCardDto> {
  if (!value || typeof value !== "object" || Object.keys(value).some((key) => !["artifactId", "expectedSelectedRevisionId", "verdict", "feedback"].includes(key))
    || ![value.artifactId, value.expectedSelectedRevisionId].every((id) => typeof id === "string" && /^[\w.-]{1,256}$/.test(id))
    || !["approved", "needs-work", "rejected"].includes(value.verdict)
    || (value.feedback !== undefined && typeof value.feedback !== "string")
    || (value.verdict === "needs-work" && !value.feedback?.trim())) {
    throw Object.assign(new Error("Select a media revision and provide feedback for Needs Work."), { code: "E_VALIDATION_FAILED" });
  }
  if (value.feedback && Buffer.byteLength(value.feedback.trim(), "utf8") > 4096) {
    throw Object.assign(new Error("Feedback is too long. Shorten it and try again."), { code: "E_VALIDATION_FAILED" });
  }
  const ref = { type: "artifact" as const, id: value.artifactId };
  const card = await request("media.show", { context: scope, ref });
  if (card.ref.type !== "artifact" || !("selectedRevisionId" in card) || card.selectedRevisionId !== value.expectedSelectedRevisionId) {
    throw Object.assign(new Error("This media changed. Refresh it before reviewing."), { code: "E_CONFLICT" });
  }
  const session = await request("session.start", { ...scope, agent: "desktop-review", metadata: { source: "user" } });
  try {
    const context = { sessionId: session.id };
    const iteration = value.verdict === "needs-work"
      ? await request("project.iteration.create", { context, projectId: scope.projectId, title: "Media review", reason: "User feedback" })
      : null;
    const result = await request("media.review", {
      context, ref, verdict: value.verdict, expectedSelectedRevisionId: value.expectedSelectedRevisionId,
      ...(iteration ? { iterationId: iteration.id, feedback: value.feedback!.trim() } : {}),
    });
    if (result.card.ref.type !== "artifact" || result.card.ref.id !== value.artifactId
      || result.card.workspaceId !== scope.workspaceId || result.card.projectId !== scope.projectId) throw new Error("Invalid media review result");
    return result.card as ArtifactMediaCardDto;
  } finally {
    // A completed review is durable even if connection shutdown prevents closing its audit session.
    await request("session.end", { sessionId: session.id }).catch(() => undefined);
  }
}
