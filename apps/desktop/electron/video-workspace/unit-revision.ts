import type { CanvasRequest } from "../canvas/runtime-results";
import type { JsonObject, Page } from "../ralphy/types";
import { VideoWorkspaceError, type VideoWorkspaceRef } from "../../shared/video-workspace";

async function allRows<T>(load: (after?: string) => Promise<Page<T>>): Promise<T[]> {
  const rows: T[] = [], seen = new Set<string>();
  let after: string | undefined;
  do {
    const page = await load(after);
    rows.push(...page.items);
    if (!page.nextCursor) return rows;
    if (seen.has(page.nextCursor)) throw new VideoWorkspaceError("Video revision history could not be loaded completely");
    seen.add(page.nextCursor); after = page.nextCursor;
  } while (after);
  return rows;
}

/** Keep captions and presentation references when a render replaces the Unit's video. */
export async function prepareVideoUnitRevision(request: CanvasRequest, ref: VideoWorkspaceRef) {
  const context = { workspaceId: ref.workspaceId, projectId: ref.projectId };
  const unit = await request("unit.show", { context, unitId: ref.unitId });
  const revisionId = unit.latestRevisionId;
  const items = revisionId ? await allRows((after) => request("unit.items", { context, revisionId, after, limit: 100 })) : [];
  const presentations = revisionId ? await allRows((after) => request("unit.presentations", { context, revisionId, after, limit: 100 })) : [];
  let videoPosition = -1;
  for (const item of [...items].sort((a, b) => Number(b.role === "master") - Number(a.role === "master"))) {
    if (!item.artifactRevisionId) continue;
    const media = await request("media.revision.show", { context, revisionId: item.artifactRevisionId });
    const source = await request("locator.resolve", { context, target: { type: "object", id: media.objectId }, purpose: "preview" });
    if (source.mime?.startsWith("video/")) { videoPosition = item.position; break; }
  }
  const copied = await Promise.all(presentations.map(async (presentation): Promise<JsonObject> => {
    const [references, captions] = await Promise.all([
      allRows((after) => request("presentation.items", { context, presentationId: presentation.id, after, limit: 100 })),
      allRows((after) => request("presentation.captions", { context, presentationId: presentation.id, after, limit: 100 })),
    ]);
    captions.sort((a, b) => a.revisionNo - b.revisionNo);
    const effective = captions.findIndex((caption) => caption.id === presentation.effectiveCaptionRevisionId);
    return {
      platform: presentation.platform, position: presentation.position,
      coverArtifactRevisionId: presentation.coverArtifactRevisionId, crop: presentation.crop,
      safeArea: presentation.safeArea, options: presentation.options,
      captions: captions.map(({ state, text }) => ({ state, text })),
      effectiveCaptionRevisionNo: effective === -1 ? null : effective + 1,
      items: references.map((reference) => {
        const item = items.find(({ id }) => id === reference.unitItemId);
        if (!item) throw new VideoWorkspaceError("Video presentation references a missing item");
        return { unitItemPosition: item.position, position: reference.position, config: reference.config };
      }),
    };
  }));
  return async (artifactRevisionId: string, compositionRevisionId: string) => {
    const next: JsonObject[] = items.map(({ artifactRevisionId: artifact, documentRevisionId, role, position, config }) => ({
      artifactRevisionId: position === videoPosition ? artifactRevisionId : artifact,
      documentRevisionId, role, position, config,
    }));
    if (videoPosition === -1) next.push({ artifactRevisionId, role: "master", position: Math.max(-1, ...items.map(({ position }) => position)) + 1 });
    return request("unit.revise", {
      context, unitId: unit.id, expectedLatestRevisionId: revisionId,
      parentRevisionId: revisionId, compositionRevisionId, note: "Video editor render",
      items: next, presentations: copied,
    });
  };
}
