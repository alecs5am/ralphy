import { act } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ArtifactMediaCardDto, ArtifactRevisionDto, Page } from "../electron/ralphy/types";
import { bridge } from "../src/lib/ipc";
import { SharedArtifactInspector } from "../src/screens/shared-library/SharedArtifactInspector";
import { presentSharedArtifact } from "../src/screens/shared-library/presentation";
import { createReactHost, type HostNode } from "./react-host";

function artifact(overrides: Partial<ArtifactMediaCardDto> = {}): ArtifactMediaCardDto {
  return {
    ref: { type: "artifact", id: "artifact-1" },
    workspaceId: "workspace-1",
    projectId: null,
    slug: "brand-hook",
    kind: "audio-hook",
    selectedRevisionId: "revision-1",
    selectedState: "approved",
    mime: "audio/mpeg",
    bytes: 2_048,
    selectedAt: Date.parse("2026-08-18T10:00:00.000Z"),
    revisionCount: 3,
    selectedObjectId: "object-private",
    storageClass: "durable",
    usageRoles: ["opening hook", "brand signature"],
    target: { type: "object", id: "object-private" },
    mediaKind: "audio",
    provenance: "generation",
    ...overrides,
  };
}

function revision(revisionNo: number, overrides: Partial<ArtifactRevisionDto> = {}): ArtifactRevisionDto {
  return {
    id: `revision-${revisionNo}`,
    artifactId: "artifact-1",
    objectId: `object-${revisionNo}`,
    revisionNo,
    parentRevisionId: revisionNo === 1 ? null : `revision-${revisionNo - 1}`,
    iterationId: null,
    state: revisionNo === 1 ? "approved" : "candidate",
    authoredBySessionId: revisionNo === 1 ? "session-1" : null,
    createdAt: Date.parse(`2026-08-${17 + revisionNo}T10:00:00.000Z`),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function button(root: HostNode, text: string): HostNode {
  const found = root.querySelectorAll("button").find((node) => node.textContent === text);
  if (!found) throw new Error(`Button not found: ${text}`);
  return found;
}

function buttonByAria(root: HostNode, label: string): HostNode {
  const found = root.querySelectorAll("button").find((node) => node.getAttribute("aria-label") === label);
  if (!found) throw new Error(`Button not found: ${label}`);
  return found;
}

async function click(node: HostNode) {
  await act(async () => { node.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
}

async function mountInspector(card = artifact(), props: Partial<React.ComponentProps<typeof SharedArtifactInspector>> = {}) {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  await act(async () => {
    root.render(<SharedArtifactInspector
      artifact={presentSharedArtifact(card)}
      workspaceId={card.workspaceId}
      rootEpoch={1}
      returnFocus={null}
      onClose={() => undefined}
      onRefresh={async () => undefined}
      {...props}
    />);
    await settle();
  });
  await act(async () => { await settle(); });
  return { host, root };
}

afterEach(() => vi.restoreAllMocks());

describe("Shared Artifact inspector", () => {
  test("separates returned identity and referenced-role evidence from unavailable intended use, rights, backlinks, and relationships", async () => {
    vi.spyOn(bridge, "loadSharedLibraryArtifact").mockResolvedValue(artifact());
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({ items: [revision(1)], nextCursor: null });
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue({ url: "ralphy-media://asset/audio", sizeBytes: 2_048 });
    const mounted = await mountInspector();
    try {
      const text = mounted.host.container.textContent;
      expect(text).toContain("Title unavailable");
      expect(text).toContain("Slug identity · brand-hook");
      expect(text).toContain("audio-hook");
      expect(text).toContain("approved");
      expect(text).toContain("audio/mpeg");
      expect(text).toContain("2.0 KB");
      expect(text).toContain("Coarse media provenance");
      expect(text).toContain("Generated media evidence");
      expect(text).toContain("Context agents receive");
      for (const field of ["Purpose", "Use when", "Avoid when", "Constraints"]) expect(text).toContain(field);
      expect(text.match(/Unavailable from this Core version/g)?.length).toBeGreaterThanOrEqual(4);
      expect(text).toContain("Actual usage");
      expect(text).toContain("System-derived backlinks are unavailable from this Core version");
      expect(text).toContain("Referenced as");
      expect(text).toContain("opening hook");
      expect(text).toContain("brand signature");
      const referencedEvidence = mounted.host.container.querySelector(".shared-inspector-referenced-as");
      const actualUsage = mounted.host.container.querySelector(".shared-inspector-actual-usage");
      expect(referencedEvidence).not.toBeNull();
      expect(actualUsage).not.toBeNull();
      expect(referencedEvidence!.textContent).toContain("opening hook");
      expect(actualUsage!.textContent).not.toContain("opening hook");
      expect(text).toContain("Provenance and rights");
      expect(text).toContain("Rights and provenance evidence are unavailable from this Core version");
      expect(text).toContain("Related artifacts");
      expect(text).toContain("Relationship data is unavailable from this Core version");
      expect(text).toContain("Use in project");
      expect(text).toContain("Complete metadata");
      expect(text).toContain("Open original");
      expect(text).not.toMatch(/0 references|not used yet|rights safe|system prompt/i);
      expect(text).not.toMatch(/object-private|object path|bucket|sha-?256|hash/i);

      const technical = mounted.host.container.querySelector(".shared-inspector-technical");
      expect(technical?.getAttribute("open")).toBeNull();
      expect(technical?.textContent).toContain("artifact-1");
      expect(technical?.textContent).toContain("revision-1");
      expect(technical?.textContent).toContain("audio/mpeg");
      expect(technical?.textContent).toContain("durable");
      expect(button(mounted.host.container, "Use in project").disabled).toBe(true);
      expect(button(mounted.host.container, "Complete metadata").disabled).toBe(true);
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("keeps append-only revision pages bounded and shows only exact revision state, date, parent, and session evidence", async () => {
    vi.spyOn(bridge, "loadSharedLibraryArtifact").mockResolvedValue(artifact());
    vi.spyOn(bridge, "loadSharedLibraryRevisions")
      .mockResolvedValueOnce({ items: [revision(1), revision(2)], nextCursor: "next" })
      .mockRejectedValueOnce(new Error("Revision page unavailable"))
      .mockResolvedValueOnce({ items: [revision(3)], nextCursor: null });
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue(null);
    const mounted = await mountInspector();
    try {
      const text = mounted.host.container.textContent;
      expect(text).toContain("Revisions");
      expect(text).toContain("Append-only");
      expect(text).toContain("Revision 1");
      expect(text).toContain("Selected default");
      expect(text).toContain("approved");
      expect(text).toContain("2026-08-18T10:00:00.000Z");
      expect(text).toContain("Parent revision ID · None returned");
      expect(text).toContain("Authored session ID · session-1");
      expect(text).toContain("Revision 2");
      expect(text).toContain("Select as default for future use");
      expect(text).toContain("Parent revision ID · revision-1");
      expect(text).toContain("Authored session ID · None returned");
      expect(text).not.toMatch(/change note|dimensions|duration|hash|source|usages pinned|usage count/i);

      await click(button(mounted.host.container, "Load more revisions"));
      expect(mounted.host.container.textContent).toContain("Revision page unavailable");
      expect(mounted.host.container.textContent).toContain("Revision 1");
      await click(button(mounted.host.container, "Retry revision page"));
      expect(mounted.host.container.textContent).toContain("Revision 3");
      expect(mounted.host.container.textContent).not.toContain("Revision page unavailable");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("selects a future default with the current CAS pointer and leaves existing references pinned", async () => {
    const pending = deferred<ArtifactMediaCardDto>();
    const refresh = vi.fn(async () => undefined);
    vi.spyOn(bridge, "loadSharedLibraryArtifact").mockResolvedValue(artifact());
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({ items: [revision(1), revision(2)], nextCursor: null });
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue(null);
    const select = vi.spyOn(bridge, "selectSharedLibraryRevision").mockReturnValue(pending.promise);
    const mounted = await mountInspector(artifact(), { onRefresh: refresh });
    try {
      await click(buttonByAria(mounted.host.container, "Select revision 2 as default for future use"));
      expect(select).toHaveBeenCalledWith("workspace-1", "artifact-1", "revision-2", "revision-1");
      expect(mounted.host.container.textContent).toContain("Selecting default revision…");
      expect(mounted.host.container.textContent).toContain("Existing references stay pinned");
      expect(mounted.host.container.textContent).not.toMatch(/existing references stay pinned\s*\d|\d+ existing references/i);
      await act(async () => { pending.resolve(artifact({ selectedRevisionId: "revision-2", selectedState: "candidate" })); await settle(); });
      expect(mounted.host.container.textContent).toContain("Revision 2Selected default");
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("reloads a conflicting selected pointer before retrying the same future default", async () => {
    const conflict = Object.assign(new Error("Conflict"), { code: "E_CONFLICT" });
    vi.spyOn(bridge, "loadSharedLibraryArtifact")
      .mockResolvedValueOnce(artifact())
      .mockResolvedValueOnce(artifact({ selectedRevisionId: "revision-3", selectedState: "approved" }));
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({ items: [revision(1), revision(2), revision(3)], nextCursor: null });
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue(null);
    const select = vi.spyOn(bridge, "selectSharedLibraryRevision")
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce(artifact({ selectedRevisionId: "revision-2", selectedState: "candidate" }));
    const mounted = await mountInspector();
    try {
      await click(buttonByAria(mounted.host.container, "Select revision 2 as default for future use"));
      expect(mounted.host.container.textContent).toContain("The selected default changed in Core. Reload current state before retrying.");
      await click(button(mounted.host.container, "Reload current state"));
      expect(mounted.host.container.textContent).toContain("Current selected default reloaded. Retry when ready.");
      await click(button(mounted.host.container, "Retry selection"));
      expect(select.mock.calls).toEqual([
        ["workspace-1", "artifact-1", "revision-2", "revision-1"],
        ["workspace-1", "artifact-1", "revision-2", "revision-3"],
      ]);
      expect(mounted.host.container.textContent).toContain("Revision 2Selected default");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("keeps targetless and failed previews explicit and delegates opening to the safe bridge action", async () => {
    vi.spyOn(bridge, "loadSharedLibraryArtifact").mockResolvedValue(artifact());
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({ items: [], nextCursor: null });
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockRejectedValue(new Error("decode failed"));
    const open = vi.spyOn(bridge, "performSharedLibraryAction").mockResolvedValue();
    const mounted = await mountInspector();
    try {
      expect(mounted.host.container.textContent).toContain("Preview unavailable");
      await click(button(mounted.host.container, "Open original"));
      expect(open).toHaveBeenCalledWith("workspace-1", "artifact-1", "open");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }

    vi.restoreAllMocks();
    vi.spyOn(bridge, "loadSharedLibraryArtifact").mockResolvedValue(artifact({ target: null }));
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({ items: [], nextCursor: null });
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue(null);
    const targetless = await mountInspector(artifact({ target: null }));
    try {
      expect(targetless.host.container.textContent).toContain("Preview unavailable");
      expect(button(targetless.host.container, "Open original").disabled).toBe(true);
    } finally {
      await act(async () => targetless.root.unmount());
      targetless.host.restore();
    }
  });
});
