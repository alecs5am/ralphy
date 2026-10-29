import type { RalphyBridgeClient } from "./client";
import type { DesktopStoryboardReviewInput, StoryboardDto } from "./storyboard-types";

/* The storyboard gallery's two calls (#570). The runtime derives the scenes and
   owns every rule (approval pinned to content, the user-prompt log, the generate
   gate); this module only validates what crosses the IPC boundary and scopes
   each decision to an audit Session, as a media review does. */

const MAX_COMMENT_BYTES = 4096;
const SCENE_ID = /^scene-\d{2,3}$/;

export async function loadStoryboard(
  request: RalphyBridgeClient["request"],
  scope: { workspaceId: string; projectId: string },
): Promise<StoryboardDto> {
  const storyboard = await request("storyboard.show", { context: scope });
  assertStoryboard(storyboard, scope.projectId);
  return storyboard;
}

export async function saveStoryboardReview(
  request: RalphyBridgeClient["request"],
  scope: { workspaceId: string; projectId: string },
  value: DesktopStoryboardReviewInput,
): Promise<StoryboardDto> {
  const input = parseStoryboardReviewInput(value);
  const session = await request("session.start", { ...scope, agent: "desktop-storyboard", metadata: { source: "user" } });
  try {
    const result = await request("storyboard.review", {
      context: { sessionId: session.id },
      action: input.action,
      ...(input.all ? { all: true as const } : { scenes: input.scenes }),
      ...(input.comment ? { comment: input.comment } : {}),
    });
    assertStoryboard(result.storyboard, scope.projectId);
    return result.storyboard;
  } finally {
    // A recorded decision is durable even if closing its audit Session fails.
    await request("session.end", { sessionId: session.id }).catch(() => undefined);
  }
}

export function parseStoryboardReviewInput(value: unknown): { action: "approve" | "reject" | "comment"; scenes: string[]; all: boolean; comment: string | null } {
  const invalid = (message: string) => Object.assign(new Error(message), { code: "E_VALIDATION_FAILED" });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("Choose a storyboard decision.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["action", "scenes", "all", "comment"].includes(key))) throw invalid("Unsupported storyboard decision.");
  const action = input.action;
  if (action !== "approve" && action !== "reject" && action !== "comment") throw invalid("Choose approve, reject, or comment.");
  const all = input.all === true;
  const scenes = input.scenes === undefined ? [] : input.scenes;
  if (!Array.isArray(scenes) || !scenes.every((scene) => typeof scene === "string" && SCENE_ID.test(scene)) || scenes.length > 200) {
    throw invalid("Choose the scenes to decide on.");
  }
  if (all === scenes.length > 0) throw invalid("Choose either scenes or every scene.");
  if (input.comment !== undefined && typeof input.comment !== "string") throw invalid("A comment is text.");
  const comment = typeof input.comment === "string" && input.comment.trim() ? input.comment.trim() : null;
  if (comment && Buffer.byteLength(comment, "utf8") > MAX_COMMENT_BYTES) throw invalid("The comment is too long. Shorten it and try again.");
  if (action === "comment" && !comment) throw invalid("Write the comment first.");
  return { action, scenes: scenes as string[], all, comment };
}

function assertStoryboard(value: unknown, projectId: string): asserts value is StoryboardDto {
  const storyboard = value as StoryboardDto | null;
  if (!storyboard || typeof storyboard !== "object" || storyboard.schemaVersion !== 1
    || storyboard.project?.id !== projectId || !Array.isArray(storyboard.scenes)
    || !storyboard.scenes.every((scene) => scene && typeof scene.id === "string" && typeof scene.state === "string")) {
    throw new Error("Invalid storyboard");
  }
}
