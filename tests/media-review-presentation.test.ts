import { describe, expect, test } from "vitest";
import type { MediaCardDto } from "../electron/ralphy/types";
import { productionMediaReviewStatus } from "@/features/media-review";

const artifact = {
  ref: { type: "artifact", id: "artifact-1" }, workspaceId: "workspace-1", projectId: "project-1",
  slug: "hero", kind: "image", selectedRevisionId: "revision-1", selectedState: "approved",
  mime: "image/png", bytes: 12, selectedAt: 1, revisionCount: 1, selectedObjectId: "object-1",
  storageClass: "final", usageRoles: [], target: { type: "object", id: "object-1" },
  mediaKind: "image", provenance: "generation",
} satisfies MediaCardDto;

describe("production media review presentation", () => {
  test("reports only validated artifact revision state", () => {
    expect(productionMediaReviewStatus(artifact)).toEqual({ status: "ready", value: "approved" });
    expect(productionMediaReviewStatus({ ...artifact, selectedState: "unknown" } as MediaCardDto)).toEqual({
      status: "unavailable",
      reason: "Review status is unavailable for this media item.",
    });
  });
});
