import { describe, expect, test, vi } from "vitest";
import type { UnitItemDto, UnitPresentationDto } from "../electron/ralphy/types";
import { preferredUnitPoster, resolveUnitMedia, socialTargets, type UnitMedia } from "@/entities/unit";

const project = { workspaceId: "workspace-1", projectId: "project-1" };

describe("Unit social previews", () => {
  test("selects landscape and portrait covers before rendering video chrome", () => {
    const media = [
      { id: "video", role: "primary", position: 0, kind: "video", preview: { url: "video.mp4", sizeBytes: 1, mime: "video/mp4" } },
      { id: "cover", role: "cover", position: 1, kind: "other", preview: { url: "cover.jpg", sizeBytes: 1, mime: null } },
      { id: "vertical-cover", role: "vertical-cover", position: 2, kind: "other", preview: { url: "vertical.jpg", sizeBytes: 1, mime: null } },
    ] as UnitMedia[];

    expect(preferredUnitPoster(media)?.id).toBe("cover");
    expect(preferredUnitPoster(media, true)?.id).toBe("vertical-cover");
  });

  test("maps current Unit formats to automatic social targets without duplicates", () => {
    expect(socialTargets("video", []).map(({ id }) => id)).toEqual(["tiktok-video", "instagram-reels", "youtube-shorts"]);
    expect(socialTargets("audio", []).map(({ platform }) => platform)).toEqual(["tiktok", "instagram", "youtube"]);
    expect(socialTargets("carousel", [{ platform: "instagram" }, { platform: "linkedin" }] as UnitPresentationDto[]).map(({ platform }) => platform))
      .toEqual(["instagram", "x", "linkedin"]);
    expect(socialTargets("9:16", [{ platform: "tiktok" }, { platform: "youtube" }] as UnitPresentationDto[]).map(({ label }) => label))
      .toEqual(["TikTok", "Reels", "Shorts"]);
    expect(socialTargets("unknown", []).map(({ id }) => id)).toEqual(["generic-unit"]);
  });

  test("resolves ordered artifact and document media while isolating one failed item", async () => {
    const items = [
      { id: "document", role: "caption", position: 2, artifactRevisionId: null, documentRevisionId: "document-revision", unitRevisionId: "unit-revision" },
      { id: "failed", role: "missing", position: 1, artifactRevisionId: "failed-revision", documentRevisionId: null, unitRevisionId: "unit-revision" },
      { id: "video", role: "primary", position: 0, artifactRevisionId: "video-revision", documentRevisionId: null, unitRevisionId: "unit-revision" },
    ] as UnitItemDto[];
    const api = {
      resolveCompositionOutputPreview: vi.fn(async (_project, id: string) => {
        if (id === "failed-revision") throw new Error("missing");
        return { url: "ralphy-media://video", sizeBytes: 42, mime: "video/mp4" };
      }),
      loadDocumentPreview: vi.fn(async () => ({ revisionId: "document-revision", format: "markdown", text: "Caption", truncated: false })),
    };

    await expect(resolveUnitMedia(api, project, items)).resolves.toMatchObject([
      { id: "video", position: 0, kind: "video" },
      { id: "document", position: 2, kind: "document" },
    ]);
  });
});
