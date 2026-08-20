import { describe, expect, test } from "vitest";
import type { ArtifactMediaCardDto, Page } from "../electron/ralphy/types";
import {
  DEFAULT_SHARED_LIBRARY_QUERY,
  presentSharedArtifact,
  presentSharedLibrary,
} from "../src/screens/shared-library/presentation";

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
  test("maps only current Core media fields and marks every absent capability unavailable", () => {
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
    expect(card.title).toEqual({ status: "unavailable", reason: expect.stringContaining("Core") });
    expect(card.semanticRoles).toEqual({ status: "unavailable", reason: expect.stringContaining("Core") });
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
    ]), null, DEFAULT_SHARED_LIBRARY_QUERY);
    const bounded = presentSharedLibrary(page([artifact()], "next-page"), "artifact-a", DEFAULT_SHARED_LIBRARY_QUERY);

    expect(complete.totalCount).toEqual({ status: "ready", value: 2 });
    expect(complete.totalSelectedBytes).toEqual({ status: "ready", value: 120 });
    expect(bounded).toMatchObject({
      selectedArtifactId: "artifact-a",
      nextCursor: "next-page",
      totalCount: { status: "partial", value: 1, reason: "Showing 1 loaded artifacts; more are available from Core." },
      totalSelectedBytes: { status: "partial", value: 120, reason: "Showing 1 loaded artifacts; more are available from Core." },
    });
    expect(presentSharedLibrary(page([]), null, DEFAULT_SHARED_LIBRARY_QUERY)).toMatchObject({
      totalCount: { status: "ready", value: 0 },
      totalSelectedBytes: { status: "ready", value: 0 },
    });
  });

  test("searches only returned local fields and applies exact filters and stable sorts", () => {
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

    const search = (text: string) => presentSharedLibrary(page(items), null, { ...DEFAULT_SHARED_LIBRARY_QUERY, text }).artifacts.map(({ id }) => id);
    for (const [field, text, expected] of [
      ["slug", "zeta", ["artifact-a"]],
      ["kind", "REFERENCE-IMAGE", ["artifact-b"]],
      ["MIME", "image/png", ["artifact-b"]],
      ["referencedAs", "visual anchor", ["artifact-b"]],
      ["provenance", "not-generation", ["artifact-b"]],
      ["selected state is outside the search contract", "approved", []],
      ["artifact ID is outside the search contract", "artifact-b", []],
    ] as const) {
      expect(search(text), field).toEqual(expected);
    }

    expect(presentSharedLibrary(page(items), null, {
      ...DEFAULT_SHARED_LIBRARY_QUERY, mediaKind: "image", provenance: "not-generation",
    }).artifacts.map(({ id }) => id)).toEqual(["artifact-b"]);
    for (const [sort, expected] of [
      ["recently-selected", ["artifact-a", "artifact-b", "artifact-c"]],
      ["name", ["artifact-b", "artifact-c", "artifact-a"]],
      ["size", ["artifact-b", "artifact-a", "artifact-c"]],
    ] as const) {
      expect(presentSharedLibrary(page(items), null, { ...DEFAULT_SHARED_LIBRARY_QUERY, sort }).artifacts.map(({ id }) => id), sort)
        .toEqual(expected);
    }
  });
});
