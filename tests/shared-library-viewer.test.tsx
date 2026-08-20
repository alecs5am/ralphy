import { act } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ArtifactMediaCardDto, ArtifactRevisionDto } from "../electron/ralphy/types";
import { bridge } from "../src/lib/ipc";
import { SharedLibraryScreen } from "../src/screens/SharedLibraryScreen";
import { SharedArtifactViewer } from "../src/screens/shared-library/SharedArtifactViewer";
import { presentSharedArtifact } from "../src/screens/shared-library/presentation";
import { createReactHost, type HostNode } from "./react-host";

function artifact(id: string, overrides: Partial<ArtifactMediaCardDto> = {}): ArtifactMediaCardDto {
  return {
    ref: { type: "artifact", id },
    workspaceId: "workspace-1",
    projectId: null,
    slug: id,
    kind: "reference",
    selectedRevisionId: `revision-${id}-1`,
    selectedState: "approved",
    mime: "image/png",
    bytes: 2_048,
    selectedAt: Date.parse("2026-08-20T10:00:00.000Z"),
    revisionCount: 2,
    selectedObjectId: `object-${id}-1`,
    storageClass: "durable",
    usageRoles: ["opening hook"],
    target: { type: "object", id: `object-${id}-1` },
    mediaKind: "image",
    provenance: "unknown",
    ...overrides,
  };
}

function revision(artifactId: string, revisionNo: number, overrides: Partial<ArtifactRevisionDto> = {}): ArtifactRevisionDto {
  return {
    id: `revision-${artifactId}-${revisionNo}`,
    artifactId,
    objectId: `object-${artifactId}-${revisionNo}`,
    revisionNo,
    parentRevisionId: revisionNo === 1 ? null : `revision-${artifactId}-${revisionNo - 1}`,
    iterationId: null,
    state: revisionNo === 1 ? "approved" : "candidate",
    authoredBySessionId: null,
    createdAt: Date.parse(`2026-08-${18 + revisionNo}T10:00:00.000Z`),
    ...overrides,
  };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function byAria(root: HostNode, tag: string, label: string): HostNode {
  const node = root.querySelectorAll(tag).find((candidate) => candidate.getAttribute("aria-label") === label);
  if (!node) throw new Error(`${tag} not found: ${label}`);
  return node;
}

async function click(node: HostNode) {
  await act(async () => { node.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
}

async function mountViewer(card = artifact("portrait"), cards = [card], props: Partial<React.ComponentProps<typeof SharedArtifactViewer>> = {}) {
  const host = createReactHost();
  const origin = document.createElement("button") as unknown as HostNode;
  origin.textContent = "origin";
  (document.body as unknown as HostNode).appendChild(origin);
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  await act(async () => {
    root.render(<SharedArtifactViewer
      artifact={presentSharedArtifact(card)}
      artifacts={cards.map(presentSharedArtifact)}
      workspaceId={card.workspaceId}
      rootEpoch={1}
      returnFocus={origin as unknown as HTMLElement}
      onClose={() => undefined}
      onNavigate={() => undefined}
      onReconcile={() => undefined}
      {...props}
    />);
    await settle();
  });
  await act(async () => { await settle(); });
  return { host, root, origin, body: document.body as unknown as HostNode };
}

afterEach(() => vi.restoreAllMocks());

describe("Shared Artifact viewer", () => {
  test("owns one opaque full-window surface and shows truthful image, identity, context, usage, and revision evidence", async () => {
    const card = artifact("portrait", { selectedRevisionId: "revision-portrait-2", usageRoles: ["character reference"] });
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue({ url: "ralphy-media://asset/portrait-token", sizeBytes: 2_048 });
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({
      items: [revision("portrait", 2), revision("portrait", 1)],
      nextCursor: null,
    });
    const open = vi.spyOn(bridge, "performSharedLibraryAction").mockResolvedValue();
    const mounted = await mountViewer(card);
    try {
      const surface = mounted.body.querySelector(".shared-artifact-viewer");
      expect(surface).not.toBeNull();
      expect(surface?.getAttribute("role")).toBe("dialog");
      expect(mounted.body.querySelectorAll(".shared-artifact-viewer")).toHaveLength(1);
      const text = surface!.textContent;
      expect(text).toContain("Slug identity · portrait");
      expect(text).toContain("Title unavailable — Core does not return artifact titles");
      expect(text).toContain("Context agents receive");
      expect(text).toContain("Agent use guidance is unavailable from this Core version");
      expect(text).toContain("Actual usage");
      expect(text).toContain("System-derived backlinks are unavailable from this Core version");
      expect(text).toContain("Referenced as");
      expect(text).toContain("character reference");
      expect(text).toContain("Revision 2");
      expect(text).toContain("Selected default");
      expect(text).toContain("Revision 1");
      expect(text).toContain("1 / 1 loaded");
      expect(text).not.toMatch(/fake thumbnail|page 1\s*\/\s*4|sha-?256|\bv2\b|0 references/i);
      expect(surface?.querySelector('[src="ralphy-media://asset/portrait-token"]')).not.toBeNull();
      expect(surface?.querySelector(".image-viewport")).not.toBeNull();
      expect(byAria(surface!, "button", "Zoom in")).not.toBeNull();
      expect(byAria(surface!, "button", "Fit image")).not.toBeNull();
      expect(text).toContain("FIT");
      expect(text).toContain("100%");
      await click(byAria(surface!, "button", "Open original"));
      expect(open).toHaveBeenCalledWith("workspace-1", "portrait", "open");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("routes video from MIME even when Core classifies the media kind as other and never autoplays", async () => {
    const card = artifact("clip", { mediaKind: "other", mime: "video/mp4" });
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue({ url: "ralphy-media://asset/clip-token", sizeBytes: 8_192 });
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({ items: [], nextCursor: null });
    const mounted = await mountViewer(card);
    try {
      const video = mounted.body.querySelector("video");
      expect(video).not.toBeNull();
      expect(video?.getAttribute("src")).toBe("ralphy-media://asset/clip-token");
      expect(video?.getAttribute("autoplay")).toBeNull();
      expect(byAria(mounted.body, "button", "Play Slug identity: clip")).not.toBeNull();
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("routes audio from MIME with labelled playback, seek, mute, volume, and loaded duration without autoplay", async () => {
    const card = artifact("sonic-hook", { mediaKind: "other", mime: "audio/mpeg", bytes: 50_000_000 });
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue({ url: "ralphy-media://asset/audio-token", sizeBytes: 50_000_000 });
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({ items: [], nextCursor: null });
    const mounted = await mountViewer(card);
    try {
      const audio = mounted.body.querySelector("audio") as HostNode & { duration?: number; volume?: number; muted?: boolean };
      expect(audio).not.toBeNull();
      expect(audio.getAttribute("autoplay")).toBeNull();
      audio.duration = 3.9;
      audio.volume = 1;
      audio.muted = false;
      await act(async () => { audio.dispatchEvent(new Event("loadedmetadata")); await settle(); });
      expect(byAria(mounted.body, "button", "Play Slug identity: sonic-hook")).not.toBeNull();
      expect(byAria(mounted.body, "div", "Position in Slug identity: sonic-hook")).not.toBeNull();
      expect(byAria(mounted.body, "button", "Mute Slug identity: sonic-hook")).not.toBeNull();
      expect(byAria(mounted.body, "div", "Volume for Slug identity: sonic-hook")).not.toBeNull();
      expect(mounted.body.textContent).toContain("0:03 · streaming preview");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("shows an actual SVG on a neutral field and loads a font specimen only through the guarded URL", async () => {
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockImplementation(async (_workspaceId, id) => ({
      url: `ralphy-media://asset/${id}-token`, sizeBytes: 2_048,
    }));
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({ items: [], nextCursor: null });
    const vector = await mountViewer(artifact("brand-vector", { mediaKind: "other", mime: "image/svg+xml" }));
    try {
      expect(vector.body.querySelector(".shared-viewer-vector-stage .image-viewport")).not.toBeNull();
      expect(vector.body.querySelector('[src="ralphy-media://asset/brand-vector-token"]')).not.toBeNull();
    } finally {
      await act(async () => vector.root.unmount());
      vector.host.restore();
    }

    const originalFontFace = Object.getOwnPropertyDescriptor(globalThis, "FontFace");
    const loadedFaces: string[] = [];
    class TestFontFace {
      constructor(readonly family: string, readonly source: string) {}
      async load() { loadedFaces.push(`${this.family}:${this.source}`); return this; }
    }
    Object.defineProperty(globalThis, "FontFace", { configurable: true, value: TestFontFace });
    const font = await mountViewer(artifact("licensed-cut", { mediaKind: "other", mime: "font/woff2" }));
    try {
      expect(font.body.textContent).toContain("Font specimen · licensed-cut");
      expect(font.body.textContent).toContain("Aa Bb Cc 123");
      expect(loadedFaces).toEqual(["licensed-cut:url(\"ralphy-media://asset/licensed-cut-token\")"]);
      expect(font.body.textContent).not.toContain("Acme Display");
    } finally {
      await act(async () => font.root.unmount());
      font.host.restore();
      if (originalFontFace) Object.defineProperty(globalThis, "FontFace", originalFontFace);
      else delete (globalThis as { FontFace?: unknown }).FontFace;
    }
  });

  test.each([
    "application/pdf",
    "application/json",
    "text/csv",
    "application/x-subrip",
    "application/x-cube",
  ])("uses an honest facts-only fallback for unsupported %s content", async (mime) => {
    const card = artifact("facts-only", { mediaKind: "other", mime, bytes: 4_096 });
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue({ url: "ralphy-media://asset/facts-token", sizeBytes: 4_096 });
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({ items: [], nextCursor: null });
    const mounted = await mountViewer(card);
    try {
      const text = mounted.body.textContent;
      expect(text).toContain("In-place preview unavailable");
      expect(text).toContain(mime);
      expect(text).toContain("4.0 KB");
      expect(text).toContain("Open original");
      expect(text).not.toMatch(/page \d|row count|first rows|lorem|fake thumbnail|document text/i);
      expect(mounted.body.querySelector("iframe")).toBeNull();
      expect(mounted.body.querySelector("object")).toBeNull();
      expect(mounted.body.querySelector("pre")).toBeNull();
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("reports a targetless document before the generic facts-only fallback", async () => {
    const card = artifact("targetless", {
      mediaKind: "document",
      mime: "application/pdf",
      selectedRevisionId: null,
      selectedState: null,
      selectedObjectId: null,
      target: null,
    });
    const resolve = vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue(null);
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({ items: [], nextCursor: null });
    const mounted = await mountViewer(card);
    try {
      expect(mounted.body.textContent).toContain("Preview unavailable");
      expect(mounted.body.textContent).toContain("Core returned no selected preview target");
      expect(byAria(mounted.body, "button", "Open original").disabled).toBe(true);
      expect(resolve).not.toHaveBeenCalled();
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("navigates only the current loaded order with honest boundaries and keeps revision selection on the original focus return", async () => {
    const first = artifact("first", { selectedRevisionId: "revision-first-1" });
    const second = artifact("second");
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue(null);
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({
      items: [revision("first", 1), revision("first", 2)], nextCursor: "more-revisions",
    });
    const selected = artifact("first", { selectedRevisionId: "revision-first-2", selectedState: "candidate" });
    const select = vi.spyOn(bridge, "selectSharedLibraryRevision").mockResolvedValue(selected);
    const navigate = vi.fn();
    const reconcile = vi.fn();
    const mounted = await mountViewer(first, [first, second], { onNavigate: navigate, onReconcile: reconcile });
    try {
      const previous = byAria(mounted.body, "button", "Previous artifact");
      const next = byAria(mounted.body, "button", "Next artifact");
      expect(previous.disabled).toBe(true);
      expect(next.disabled).toBe(false);
      expect(mounted.body.textContent).toContain("1 / 2 loaded");
      expect(mounted.body.textContent).toContain("More revisions are available");
      await click(next);
      expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ id: "second" }));
      navigate.mockClear();
      const arrowRight = new Event("keydown", { cancelable: true });
      Object.defineProperty(arrowRight, "key", { value: "ArrowRight" });
      await act(async () => { window.dispatchEvent(arrowRight); await settle(); });
      expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ id: "second" }));
      await click(byAria(mounted.body, "button", "Select revision 2 as default for future use"));
      expect(select).toHaveBeenCalledWith("workspace-1", "first", "revision-first-2", "revision-first-1");
      expect(reconcile).toHaveBeenCalledWith(selected);
      expect(mounted.body.textContent).toContain("Revision 2Selected default");
      expect(mounted.origin.textContent).toBe("origin");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("reports media decode failures as preview unavailable rather than corruption", async () => {
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue({ url: "ralphy-media://asset/decode-token", sizeBytes: 2_048 });
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({ items: [], nextCursor: null });
    const mounted = await mountViewer();
    try {
      const image = mounted.body.querySelector('[src="ralphy-media://asset/decode-token"]');
      expect(image).not.toBeNull();
      await act(async () => { image!.dispatchEvent(new Event("error")); await settle(); });
      expect(mounted.body.textContent).toContain("Preview unavailable");
      expect(mounted.body.textContent).not.toMatch(/corrupt|damaged/i);
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("reports expired preview tokens and revision-load failures without claiming corruption", async () => {
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockRejectedValue(new Error("expired token"));
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockRejectedValue(new Error("revision load failed"));
    const mounted = await mountViewer();
    try {
      expect(mounted.body.textContent).toContain("Preview unavailable");
      expect(mounted.body.textContent).toContain("Revision history unavailable");
      expect(mounted.body.textContent).not.toMatch(/corrupt|damaged/i);
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("opens from Enter, double-click, and the explicit Preview action, then restores exact selection, query, scroll, and focus on close", async () => {
    const card = artifact("portrait");
    vi.spyOn(bridge, "loadSharedLibraryPage").mockResolvedValue({ items: [card, artifact("other")], nextCursor: "not-loaded" });
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue({ url: "ralphy-media://asset/portrait", sizeBytes: 2_048 });
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({ items: [revision("portrait", 1)], nextCursor: null });
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    await act(async () => { root.render(<SharedLibraryScreen workspaceId="workspace-1" workspaceName="Studio" rootEpoch={1} />); await settle(); });
    await act(async () => { await settle(); });
    try {
      const input = byAria(host.container, "input", "Search Shared Library") as HostNode & { value: string };
      input.value = "portrait";
      await act(async () => { input.dispatchEvent(new Event("input", { bubbles: true })); await settle(); });
      const scroll = host.container.querySelector(".shared-library-scroll")!;
      scroll.scrollTop = 91;
      const identity = byAria(host.container, "button", "Select portrait identity and open inspector");
      identity.focus();

      await act(async () => { identity.dispatchEvent(new Event("dblclick", { bubbles: true })); await settle(); });
      expect((document.body as unknown as HostNode).querySelector(".shared-artifact-viewer")).not.toBeNull();
      await click(byAria(document.body as unknown as HostNode, "button", "Close viewer"));
      expect(document.activeElement).toBe(identity);

      const enter = new Event("keydown", { bubbles: true, cancelable: true });
      Object.defineProperty(enter, "key", { value: "Enter" });
      await act(async () => { identity.dispatchEvent(enter); await settle(); });
      expect((document.body as unknown as HostNode).querySelector(".shared-artifact-viewer")).not.toBeNull();
      const escape = new Event("keydown", { bubbles: true, cancelable: true });
      Object.defineProperty(escape, "key", { value: "Escape" });
      await act(async () => { document.dispatchEvent(escape); await settle(); });
      expect((document.body as unknown as HostNode).querySelector(".shared-artifact-viewer")).toBeNull();
      expect(document.activeElement).toBe(identity);

      const preview = byAria(host.container, "button", "Preview portrait");
      preview.focus();
      await click(preview);
      await click(byAria(document.body as unknown as HostNode, "button", "Close viewer"));
      expect(document.activeElement).toBe(preview);
      expect(input.value).toBe("portrait");
      expect(scroll.scrollTop).toBe(91);
      expect(identity.closest("article")?.getAttribute("class")).toContain("is-selected");
      expect(host.container.textContent).toContain("Load more");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });
});
