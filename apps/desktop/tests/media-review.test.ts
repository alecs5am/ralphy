import { expect, test, vi } from "vitest";
import { saveMediaReview } from "../electron/ralphy/media-review";

test("reviews use a scoped audit session, require feedback, and reject stale selections", async () => {
  const scope = { workspaceId: "ws-one", projectId: "proj-one" };
  const card = { ...scope, ref: { type: "artifact", id: "art-one" }, selectedRevisionId: "rev-one" };
  const request = vi.fn(async (method: string) => {
    if (method === "media.show") return card;
    if (method === "session.start") return { id: "ses-one" };
    if (method === "project.iteration.create") return { id: "iter-one" };
    if (method === "media.review") return { card: { ...card, selectedRevisionId: "rev-two", selectedState: "working" } };
    return { id: "ses-one" };
  });
  const input = { artifactId: "art-one", expectedSelectedRevisionId: "rev-one", verdict: "needs-work" as const, feedback: " Shorter opening " };
  expect(await saveMediaReview(request as never, scope, input)).toMatchObject({ selectedRevisionId: "rev-two" });
  expect(request).toHaveBeenCalledWith("media.review", expect.objectContaining({ context: { sessionId: "ses-one" }, iterationId: "iter-one", feedback: "Shorter opening" }));
  expect(request).toHaveBeenLastCalledWith("session.end", { sessionId: "ses-one" });
  request.mockClear();
  await expect(saveMediaReview(request as never, scope, { ...input, feedback: " " })).rejects.toMatchObject({ code: "E_VALIDATION_FAILED" });
  expect(request).not.toHaveBeenCalled();
  await expect(saveMediaReview(request as never, scope, { ...input, feedback: "🎬".repeat(1025) })).rejects.toMatchObject({ code: "E_VALIDATION_FAILED" });
  expect(request).not.toHaveBeenCalled();
  await expect(saveMediaReview(request as never, scope, { ...input, expectedSelectedRevisionId: "old" })).rejects.toMatchObject({ code: "E_CONFLICT" });
  expect(request).toHaveBeenCalledTimes(1);
});
