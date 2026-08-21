import { describe, expect, test } from "vitest";
import { createMockReviewSession, isReviewShortcutEligible, reduceMockReviewSession } from "../src/screens/project/mock-review";

const context = { rootEpoch: 7, workspaceId: "ux", projectId: "project-a" };

describe("renderer-only mock review", () => {
  test("records local verdicts, requires feedback, and resets the complete tuple", () => {
    const approved = reduceMockReviewSession(createMockReviewSession(context), { type: "approve", artifactId: "art-1" });
    expect(approved.reviews["art-1"]?.verdict).toBe("approved");
    const drafting = reduceMockReviewSession(approved, { type: "open-needs-work", artifactId: "art-1" });
    expect(() => reduceMockReviewSession(drafting, { type: "submit-needs-work" })).toThrow(/Feedback is required/);
    const reset = reduceMockReviewSession(drafting, { type: "reset-context", context: { ...context, projectId: "project-b" } });
    expect(reset).toMatchObject({ context: { ...context, projectId: "project-b" }, reviews: {}, needsWorkDraft: null });
  });

  test("keeps shortcuts outside interactive or modal UI", () => {
    const event = {
      defaultPrevented: false, repeat: false, isComposing: false,
      metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target: null,
    } as KeyboardEvent;
    const ui = { context, selected: true, overlayOpen: false, iterationActive: true };
    expect(isReviewShortcutEligible(event, ui)).toBe(true);
    expect(isReviewShortcutEligible(event, { ...ui, overlayOpen: true })).toBe(false);
  });
});
