import { describe, expect, test } from "vitest";
import type { ArtifactMediaCardDto, Page } from "../electron/ralphy/types";
import {
  presentSharedArtifact,
  presentSharedLibrary,
} from "@/pages/shared-library";

function artifact(overrides: Partial<ArtifactMediaCardDto> = {}): ArtifactMediaCardDto {
  return {
    ref: { type: "artifact", id: "artifact-a" },
    workspaceId: "workspace-1",
    projectId: null,
    slug: "opening-audio",
    kind: "soundtrack",
    selectedRevisionId: "revision-a",
    selectedState: "approved",
    mime: "audio/mpeg",
    bytes: 120,
    selectedAt: 200,
    revisionCount: 2,
    selectedObjectId: "object-a",
    storageClass: "durable",
    usageRoles: ["opening hook"],
    target: { type: "object", id: "object-a" },
    mediaKind: "audio",
    provenance: "generation",
    ...overrides,
  };
}

function page(items: ArtifactMediaCardDto[], nextCursor: string | null = null): Page<ArtifactMediaCardDto> {
  return { items, nextCursor };
}

describe("Shared Library presentation", () => {
  test("uses the returned name and fields while retaining explicit missing metadata", () => {
    const card = presentSharedArtifact(artifact());

    expect(card).toMatchObject({
      id: "artifact-a",
      slug: "opening-audio",
      kind: "soundtrack",
      mediaKind: "audio",
      mime: "audio/mpeg",
      bytes: 120,
      selectedRevisionId: "revision-a",
      selectedState: "approved",
      selectedAt: 200,
      revisionCount: 2,
      storageClass: "durable",
      provenance: "generation",
      referencedAs: ["opening hook"],
      preview: "available",
    });
    expect(card.title).toEqual({ status: "ready", value: "opening-audio" });
    expect(card.semanticRoles).toEqual({ status: "unavailable", reason: expect.stringContaining("unavailable") });
    expect(card.tags.status).toBe("unavailable");
    expect(card.entities.status).toBe("unavailable");
    expect(card.canonicalStatus.status).toBe("unavailable");
    expect(card.agentUse.status).toBe("unavailable");
    expect(card.rights.status).toBe("unavailable");
    expect(card.usageBacklinks.status).toBe("unavailable");
    expect(card.attention.status).toBe("unavailable");
    expect(card.relationships.status).toBe("unavailable");
    expect(JSON.stringify(card)).not.toMatch(/not used yet|rights unknown|approved alternative|reference only/i);
  });

  test("keeps an unselected targetless artifact distinct from missing metadata or a missing file", () => {
    const card = presentSharedArtifact(artifact({
      selectedRevisionId: null,
      selectedState: null,
      selectedAt: null,
      selectedObjectId: null,
      target: null,
      mime: null,
      bytes: null,
      storageClass: null,
      usageRoles: [],
    }));

    expect(card).toMatchObject({
      selectedRevisionId: null,
      selectedState: null,
      selectedAt: null,
      mime: null,
      bytes: null,
      storageClass: null,
      referencedAs: [],
      preview: "no-target",
    });
    expect(JSON.stringify(card)).not.toMatch(/missing file|not documented|not used/i);
  });

  test("reports exact totals only for a complete loaded collection", () => {
    const complete = presentSharedLibrary(page([
      artifact(),
      artifact({
        ref: { type: "artifact", id: "artifact-b" },
        slug: "unselected-image",
        selectedRevisionId: null,
        selectedState: null,
        selectedAt: null,
        selectedObjectId: null,
        target: null,
        mediaKind: "image",
        mime: null,
        bytes: null,
      }),
    ]), null);
    const bounded = presentSharedLibrary(page([artifact()], "next-page"), "artifact-a");

    expect(complete.totalCount).toEqual({ status: "ready", value: 2 });
    expect(complete.totalSelectedBytes).toEqual({ status: "ready", value: 120 });
    expect(bounded).toMatchObject({
      selectedArtifactId: "artifact-a",
      nextCursor: "next-page",
      totalCount: { status: "partial", value: 1, reason: "Showing 1 loaded artifacts; more are available in this library." },
      totalSelectedBytes: { status: "partial", value: 120, reason: "Showing 1 loaded artifacts; more are available in this library." },
    });
    expect(presentSharedLibrary(page([]), null)).toMatchObject({
      totalCount: { status: "ready", value: 0 },
      totalSelectedBytes: { status: "ready", value: 0 },
    });
  });

  test("preserves the returned order and selects only an artifact in the loaded result", () => {
    const items = [
      artifact({ ref: { type: "artifact", id: "artifact-a" }, slug: "zeta", bytes: 120, selectedAt: 200 }),
      artifact({
        ref: { type: "artifact", id: "artifact-b" }, slug: "alpha", kind: "reference-image",
        mediaKind: "image", mime: "image/png", bytes: 800, selectedAt: 100,
        usageRoles: ["Visual Anchor"], provenance: "not-generation",
      }),
      artifact({
        ref: { type: "artifact", id: "artifact-c" }, slug: "middle", kind: "document",
        mediaKind: "document", mime: "application/pdf", bytes: 20, selectedAt: null,
        usageRoles: [], provenance: "unknown",
      }),
    ];

    expect(presentSharedLibrary(page(items), "artifact-b")).toMatchObject({
      artifacts: [{ id: "artifact-a" }, { id: "artifact-b" }, { id: "artifact-c" }],
      selectedArtifactId: "artifact-b",
    });
    expect(presentSharedLibrary(page(items), "missing").selectedArtifactId).toBeNull();
  });
});
