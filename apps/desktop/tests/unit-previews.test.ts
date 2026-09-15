import { describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UnitSocialPreview } from "../src/pages/project/ui/UnitSocialPreview";
import type { UnitItemDto, UnitPresentationDto } from "../electron/ralphy/types";
import { preferredUnitPoster, resolveUnitMedia, resolveUnitRevisionPreview, socialTargets, type UnitMedia } from "@/entities/unit";
import { SocialIcon } from "@/shared/ui/SocialIcon";

const project = { workspaceId: "workspace-1", projectId: "project-1" };

describe("Unit social previews", () => {
  test("renders a visible platform icon for Facebook and unknown platforms", () => {
    for (const platform of ["facebook", "generic"]) {
      expect(renderToStaticMarkup(createElement(SocialIcon, { platform }))).toContain("<svg");
    }
  });

  test("loads each revision's cover independently and falls back to its public video across pages", async () => {
    const api = {
      loadProjectUnitPage: vi.fn(async (_project, request) => request.kind === "presentations"
        ? { items: [{ id: "presentation", platform: "facebook", position: 0, coverArtifactRevisionId: `cover-${request.revisionId}` }], nextCursor: null }
        : request.cursor ? { items: [{ id: "public-video", role: "primary", position: 1, artifactRevisionId: "video", documentRevisionId: null }], nextCursor: null }
          : { items: [{ id: "evidence", role: "source", position: 0, artifactRevisionId: "private-source", documentRevisionId: null }], nextCursor: "next" }),
      loadProjectUnitPreview: vi.fn(async () => ({ presentation: { unitItemIds: ["public-video"] } })),
      resolveCompositionOutputPreview: vi.fn(async (_project, id) => {
        if (id === "cover-r2") throw new Error("Missing poster");
        return { url: `ralphy-media://asset/${id}`, sizeBytes: 10, mime: id === "video" ? "video/mp4" : "image/png" };
      }),
      loadDocumentPreview: vi.fn(),
    };
    const cardReference = { ...project, unitId: "unit-1", title: "Creative" };
    expect(await resolveUnitRevisionPreview(api as never, cardReference, "r1")).toMatchObject({ kind: "image", preview: { url: "ralphy-media://asset/cover-r1" } });
    expect(api.loadProjectUnitPage.mock.calls[0][0]).toEqual(project);
    expect(await resolveUnitRevisionPreview(api as never, project, "r1", true)).toMatchObject({ kind: "video", preview: { url: "ralphy-media://asset/video" } });
    expect(await resolveUnitRevisionPreview(api as never, project, "r2")).toMatchObject({ kind: "video", preview: { url: "ralphy-media://asset/video" } });
    expect(api.resolveCompositionOutputPreview.mock.calls.some(([, id]) => id === "private-source")).toBe(false);
  });
  test("shows a text post's document body even when its caption differs", () => {
    const html = renderToStaticMarkup(createElement(UnitSocialPreview, {
      target: { id: "facebook-post", platform: "facebook", variant: "post", label: "Facebook" },
      slug: "creative", caption: "A different caption", media: [{ id: "doc", role: "content", position: 0, kind: "document", preview: { revisionId: "rev", format: "markdown", text: "The real creative copy", truncated: false } }],
    }));
    expect(html).toContain("The real creative copy");
    expect(html).toContain("Facebook · Text post");
    expect(html).not.toContain("A different caption");
  });
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
      .toEqual(["instagram", "linkedin"]);
    expect(socialTargets("9:16", [{ platform: "tiktok" }, { platform: "youtube" }] as UnitPresentationDto[]).map(({ label }) => label))
      .toEqual(["TikTok", "Shorts"]);
    expect(socialTargets("post", [{ platform: "facebook" }] as UnitPresentationDto[]).map(({ platform }) => platform)).toEqual(["facebook"]);
    expect(socialTargets("image", [{ platform: "instagram" }] as UnitPresentationDto[])).toMatchObject([{ variant: "post", label: "Instagram" }]);
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
