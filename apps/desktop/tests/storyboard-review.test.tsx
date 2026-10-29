import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { loadStoryboard, parseStoryboardReviewInput, saveStoryboardReview } from "../electron/ralphy/storyboard";
import type { StoryboardDto, StoryboardSceneDto } from "../electron/ralphy/storyboard-types";
import { previewableFrameId, sceneModelLabel, sceneUnlocked, storyboardSummary } from "@/features/storyboard-review";
import { StoryboardCard } from "../src/features/storyboard-review/ui/StoryboardCard";

const scope = { workspaceId: "ws-one", projectId: "prj-one" };

function scene(overrides: Partial<StoryboardSceneDto> = {}): StoryboardSceneDto {
  return {
    id: "scene-01", order: 1, role: "hook", vo: "Stop scrolling.", durationSec: 3, camera: "selfie 35mm",
    frame: null, models: { image: "google/gemini-3-pro-image-preview", video: "kwaivgi/kling-v3.0-pro" },
    estimatedCostUsd: 0.46, fingerprint: "abc", state: "pending", approval: null, comments: [],
    ...overrides,
  };
}

function storyboard(scenes: StoryboardSceneDto[] = [scene()]): StoryboardDto {
  return {
    schemaVersion: 1,
    project: { id: "prj-one", slug: "spot-001", workspaceId: "ws-one" },
    aiProduction: true, aiProductionReason: "AI production", contentMode: null, scenarioSource: "scenario.json",
    scenes,
    totals: {
      scenes: scenes.length,
      approved: scenes.filter((entry) => entry.state === "approved").length,
      rejected: scenes.filter((entry) => entry.state === "rejected").length,
      pending: scenes.filter((entry) => entry.state === "pending").length,
      stale: scenes.filter((entry) => entry.state === "stale").length,
      estimatedCostUsd: 0.46 * scenes.length, durationSec: 3 * scenes.length,
    },
    approvedAll: scenes.every((entry) => entry.state === "approved"), approvedAllAt: null, document: null,
  };
}

describe("storyboard bridge calls", () => {
  test("decisions run in a scoped audit Session and return the storyboard after the write", async () => {
    const after = storyboard([scene({ state: "approved" })]);
    const request = vi.fn(async (method: string) => {
      if (method === "session.start") return { id: "ses-one" };
      if (method === "storyboard.review") return { touched: ["scene-01"], revisionId: "drev-one", storyboard: after };
      return { id: "ses-one" };
    });
    expect(await saveStoryboardReview(request as never, scope, { action: "approve", scenes: ["scene-01"], comment: " looks right " })).toBe(after);
    expect(request).toHaveBeenCalledWith("session.start", expect.objectContaining({ ...scope, agent: "desktop-storyboard" }));
    expect(request).toHaveBeenCalledWith("storyboard.review", { context: { sessionId: "ses-one" }, action: "approve", scenes: ["scene-01"], comment: "looks right" });
    expect(request).toHaveBeenLastCalledWith("session.end", { sessionId: "ses-one" });

    request.mockClear();
    await saveStoryboardReview(request as never, scope, { action: "approve", all: true });
    expect(request).toHaveBeenCalledWith("storyboard.review", { context: { sessionId: "ses-one" }, action: "approve", all: true });
  });

  test("invalid decisions never reach the runtime", async () => {
    const request = vi.fn();
    await expect(saveStoryboardReview(request as never, scope, { action: "comment", scenes: ["scene-01"] })).rejects.toMatchObject({ code: "E_VALIDATION_FAILED" });
    await expect(saveStoryboardReview(request as never, scope, { action: "approve", scenes: ["../etc"] })).rejects.toMatchObject({ code: "E_VALIDATION_FAILED" });
    await expect(saveStoryboardReview(request as never, scope, { action: "approve", scenes: [] } as never)).rejects.toMatchObject({ code: "E_VALIDATION_FAILED" });
    await expect(saveStoryboardReview(request as never, scope, { action: "approve", scenes: ["scene-01"], comment: "x".repeat(4097) })).rejects.toMatchObject({ code: "E_VALIDATION_FAILED" });
    expect(() => parseStoryboardReviewInput({ action: "delete", all: true })).toThrow("approve, reject, or comment");
    expect(request).not.toHaveBeenCalled();
  });

  test("a storyboard for another project is refused", async () => {
    const other = { ...storyboard(), project: { id: "prj-two", slug: "other", workspaceId: "ws-one" } };
    await expect(loadStoryboard((async () => other) as never, scope)).rejects.toThrow("Invalid storyboard");
    const own = storyboard();
    expect(await loadStoryboard((async () => own) as never, scope)).toBe(own);
  });
});

describe("storyboard presentation", () => {
  test("summarizes the review and names what each scene will cost", () => {
    const view = storyboard([scene({ state: "approved" }), scene({ id: "scene-02", state: "stale" }), scene({ id: "scene-03", state: "rejected" })]);
    expect(storyboardSummary(view)).toBe("1 of 3 approved · 1 rejected · 1 waiting · 9s · est. $1.38");
    expect(storyboardSummary(storyboard([]))).toBe("No scenes to review yet.");
    expect(sceneModelLabel(scene())).toBe("image google/gemini-3-pro-image-preview · video kwaivgi/kling-v3.0-pro");
    expect(sceneUnlocked(scene({ state: "approved" }))).toBe(true);
    expect(sceneUnlocked(scene({ state: "stale" }))).toBe(false);
    expect(previewableFrameId(scene({ frame: { slot: "storyboard-scene-01", source: "artifact", artifactId: "art-one", revisionId: "rev", objectId: "obj", path: null, mime: "image/png", key: "rev" } }))).toBe("art-one");
    expect(previewableFrameId(scene({ frame: { slot: "storyboard/scene-01.png", source: "file", artifactId: null, revisionId: null, objectId: null, path: "/x.png", mime: "image/png", key: "sha" } }))).toBeNull();
  });

  test("a card draws the frame slot, VO, duration, camera, model, cost, state and the three decisions", () => {
    const html = renderToStaticMarkup(<StoryboardCard
      scene={scene({ state: "rejected", comments: [{ at: "t", text: "label is wrong", decision: "rejected", source: "cli" }] })}
      project={scope}
      saving={false}
      onDecide={async () => true}
    />);
    for (const text of ["scene-01 · hook", "Stop scrolling.", "3s", "selfie 35mm", "kling-v3.0-pro", "$0.46", "Rejected", "label is wrong", "Approve", "Reject", "Comment", "No preview yet"]) {
      expect(html).toContain(text);
    }
  });
});
