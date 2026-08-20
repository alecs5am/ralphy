import { describe, expect, test, vi } from "vitest";
import type { RalphyBridgeClient } from "../electron/ralphy/client";
import {
  createSharedLibraryReader,
  type SharedLibraryAction,
} from "../electron/ralphy/shared-library-reader";
import type {
  ArtifactMediaCardDto,
  ArtifactRevisionDto,
} from "../electron/ralphy/types";

const workspaceId = "ws_1";
const card: ArtifactMediaCardDto = {
  ref: { type: "artifact", id: "art_1" },
  workspaceId,
  projectId: null,
  slug: "opening-hook",
  kind: "audio",
  selectedRevisionId: "arev_1",
  selectedState: "approved",
  mime: "audio/mpeg",
  bytes: 12,
  selectedAt: 3,
  revisionCount: 1,
  selectedObjectId: "obj_1",
  storageClass: "durable",
  usageRoles: ["opening hook"],
  target: { type: "object", id: "obj_1" },
  mediaKind: "audio",
  provenance: "not-generation",
};
const revision: ArtifactRevisionDto = {
  id: "arev_1",
  artifactId: "art_1",
  objectId: "obj_1",
  revisionNo: 1,
  parentRevisionId: null,
  iterationId: null,
  state: "approved",
  authoredBySessionId: null,
  createdAt: 2,
};

function page(items: ArtifactMediaCardDto[] = [card], nextCursor: string | null = null) {
  return { items, nextCursor };
}

describe("Shared Library reader", () => {
  test("loads one exact workspace Artifact page with optional Core facets", async () => {
    const request = vi.fn(async () => page([card], "next"));
    const reader = createSharedLibraryReader({
      request: request as RalphyBridgeClient["request"],
    });

    await expect(reader.loadPage(workspaceId)).resolves.toEqual(page([card], "next"));
    expect(request).toHaveBeenLastCalledWith("media.list", {
      context: { workspaceId }, limit: 50, types: ["artifact"],
    });
    await reader.loadPage(workspaceId, {
      after: "opaque", mediaKind: "audio", provenance: "not-generation",
    });
    expect(request).toHaveBeenLastCalledWith("media.list", {
      context: { workspaceId }, after: "opaque", mediaKind: "audio",
      provenance: "not-generation", limit: 50, types: ["artifact"],
    });
  });

  test("rejects invalid requests before Core and malformed workspace pages after Core", async () => {
    const request = vi.fn(async () => page());
    const reader = createSharedLibraryReader({
      request: request as RalphyBridgeClient["request"],
    });
    for (const [id, query] of [
      ["", undefined],
      [workspaceId, { after: "" }],
      [workspaceId, { after: 1 }],
      [workspaceId, { mediaKind: "text" }],
      [workspaceId, { provenance: "private" }],
      [workspaceId, { extra: true }],
    ] as const) {
      await expect(reader.loadPage(id, query as never)).rejects.toThrow();
    }
    expect(request).not.toHaveBeenCalled();

    const malformed = [
      { ...page(), private: true },
      page([{ ...card, projectId: "prj_1" }]),
      page([{ ...card, workspaceId: "ws_2" }]),
      page([{ ...card, ref: { type: "object", id: "obj_1" } } as never]),
      page([{ ...card, privatePath: "/private/media.mp3" } as never]),
      page(Array.from({ length: 51 }, (_, index) => ({
        ...card, ref: { type: "artifact" as const, id: `art_${index}` },
      }))),
      page([card], ""),
      page([card], 1 as never),
    ];
    for (const value of malformed) {
      const invalid = createSharedLibraryReader({
        request: vi.fn(async () => value) as unknown as RalphyBridgeClient["request"],
      });
      await expect(invalid.loadPage(workspaceId)).rejects.toThrow(/workspace shared artifact/i);
    }
  });

  test("shows exact workspace Artifacts and rejects cross-scope or target mismatches", async () => {
    const request = vi.fn(async () => card);
    const reader = createSharedLibraryReader({
      request: request as RalphyBridgeClient["request"],
    });

    await expect(reader.loadArtifact(workspaceId, "art_1")).resolves.toEqual(card);
    expect(request).toHaveBeenCalledWith("media.show", {
      context: { workspaceId }, ref: { type: "artifact", id: "art_1" },
    });
    for (const artifactId of ["", "x".repeat(129)]) {
      await expect(reader.loadArtifact(workspaceId, artifactId)).rejects.toThrow();
    }

    for (const value of [
      { ...card, ref: { type: "artifact", id: "art_2" } },
      { ...card, workspaceId: "ws_2" },
      { ...card, projectId: "prj_1" },
      { ...card, target: { type: "object", id: "obj_2" } },
    ]) {
      const invalid = createSharedLibraryReader({
        request: vi.fn(async () => value) as unknown as RalphyBridgeClient["request"],
      });
      await expect(invalid.loadArtifact(workspaceId, "art_1"))
        .rejects.toThrow(/workspace shared artifact/i);
    }
  });

  test("pages exact revisions and forwards the null-aware selection CAS", async () => {
    const request = vi.fn(async (method: string) => method === "media.revisions"
      ? { items: [revision], nextCursor: "next" }
      : card);
    const reader = createSharedLibraryReader({
      request: request as RalphyBridgeClient["request"],
    });

    await expect(reader.loadRevisions(workspaceId, "art_1", "after"))
      .resolves.toEqual({ items: [revision], nextCursor: "next" });
    expect(request).toHaveBeenNthCalledWith(1, "media.revisions", {
      context: { workspaceId }, ref: { type: "artifact", id: "art_1" },
      after: "after", limit: 50,
    });
    await expect(reader.selectRevision(workspaceId, "art_1", "arev_1", null))
      .resolves.toEqual(card);
    expect(request).toHaveBeenNthCalledWith(2, "media.select", {
      context: { workspaceId }, ref: { type: "artifact", id: "art_1" },
      revisionId: "arev_1", expectedSelectedRevisionId: null,
    });

    for (const call of [
      () => reader.loadRevisions(workspaceId, "art_1", ""),
      () => reader.selectRevision(workspaceId, "art_1", "", null),
      () => reader.selectRevision(workspaceId, "art_1", "arev_1", ""),
    ]) await expect(call()).rejects.toThrow();

    const invalidRevision = createSharedLibraryReader({
      request: vi.fn(async () => ({
        items: [{ ...revision, artifactId: "art_2" }], nextCursor: null,
      })) as unknown as RalphyBridgeClient["request"],
    });
    await expect(invalidRevision.loadRevisions(workspaceId, "art_1"))
      .rejects.toThrow(/artifact revision page/i);

    const invalidSelection = createSharedLibraryReader({
      request: vi.fn(async () => ({ ...card, selectedRevisionId: "arev_2" })) as unknown as RalphyBridgeClient["request"],
    });
    await expect(invalidSelection.selectRevision(workspaceId, "art_1", "arev_1", null))
      .rejects.toThrow(/workspace shared artifact/i);
  });

  test("returns null for targetless previews and otherwise returns only a minted URL", async () => {
    const targetless = {
      ...card,
      selectedRevisionId: null,
      selectedState: null,
      mime: null,
      bytes: null,
      selectedAt: null,
      selectedObjectId: null,
      storageClass: null,
      target: null,
    } satisfies ArtifactMediaCardDto;
    const request = vi.fn(async (method: string, params: { ref?: { id: string } }) => {
      if (method === "media.show") return params.ref?.id === "targetless"
        ? { ...targetless, ref: { type: "artifact", id: "targetless" } }
        : card;
      return { absolutePath: "/private/.ralphy/buckets/hook.mp3", mime: "audio/mpeg", bytes: 12 };
    });
    const mint = vi.fn(async () => ({ url: "ralphy-media://asset/token", sizeBytes: 12 }));
    const reader = createSharedLibraryReader({
      request: request as RalphyBridgeClient["request"], mint,
    });

    await expect(reader.resolvePreview(workspaceId, "targetless")).resolves.toBeNull();
    expect(mint).not.toHaveBeenCalled();
    await expect(reader.resolvePreview(workspaceId, "art_1")).resolves.toEqual({
      url: "ralphy-media://asset/token", sizeBytes: 12,
    });
    expect(request).toHaveBeenLastCalledWith("locator.resolve", {
      context: { workspaceId }, target: card.target, purpose: "preview",
    });
    expect(mint).toHaveBeenCalledWith(
      "/private/.ralphy/buckets/hook.mp3", "audio/mpeg", 12,
    );
    expect(JSON.stringify(await reader.resolvePreview(workspaceId, "art_1")))
      .not.toContain("/private/");
  });

  test("fails closed on forged locators and maps only main-process actions", async () => {
    const locator = {
      absolutePath: "/private/.ralphy/buckets/hook.mp3", mime: "audio/mpeg", bytes: 12,
    };
    const request = vi.fn(async (method: string) => method === "media.show" ? card : locator);
    const reader = createSharedLibraryReader({
      request: request as RalphyBridgeClient["request"],
    });

    for (const action of ["open", "finder"] as const satisfies SharedLibraryAction[]) {
      request.mockClear();
      await expect(reader.resolveActionLocator(workspaceId, "art_1", action))
        .resolves.toEqual(locator);
      expect(request).toHaveBeenNthCalledWith(2, "locator.resolve", {
        context: { workspaceId }, target: card.target, purpose: action,
      });
    }

    for (const value of [
      { ...locator, absolutePath: "relative/hook.mp3" },
      { ...locator, mime: 1 },
      { ...locator, bytes: -1 },
      { ...locator, private: true },
    ]) {
      const invalid = createSharedLibraryReader({
        request: vi.fn(async (method: string) => method === "media.show" ? card : value) as unknown as RalphyBridgeClient["request"],
      });
      await expect(invalid.resolveActionLocator(workspaceId, "art_1", "open"))
        .rejects.toThrow(/action locator/i);
    }
    await expect(reader.resolveActionLocator(workspaceId, "art_1", "copy" as never))
      .rejects.toThrow(/action/i);
  });
});
