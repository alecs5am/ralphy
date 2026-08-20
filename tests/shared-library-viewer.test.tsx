import { act, useState } from "react";
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function byAria(root: HostNode, tag: string, label: string): HostNode {
  const node = root.querySelectorAll(tag).find((candidate) => candidate.getAttribute("aria-label") === label);
  if (!node) throw new Error(`${tag} not found: ${label}`);
  return node;
}

function buttonByText(root: HostNode, label: string): HostNode {
  const node = root.querySelectorAll("button").find((candidate) => candidate.textContent === label);
  if (!node) throw new Error(`button not found: ${label}`);
  return node;
}

async function click(node: HostNode) {
  await act(async () => { node.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
}

function mouseEvent(type: "click" | "dblclick", detail: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "detail", { value: detail });
  return event;
}

async function mountViewer(card = artifact("portrait"), cards = [card], props: Partial<React.ComponentProps<typeof SharedArtifactViewer>> = {}, beforeRender?: () => void) {
  const host = createReactHost();
  beforeRender?.();
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
      expect(text).toContain("Agent use guidance is unavailable from the current Core media contract.");
      for (const field of ["Semantic roles", "Tags", "Named entities", "Canonical status", "Agent-use canonical status"]) expect(text).toContain(field);
      expect(text).toContain("Selected revision stateapproved");
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
      const useInProject = buttonByText(surface!, "Use in project unavailable");
      expect(useInProject.disabled).toBe(false);
      expect(useInProject.getAttribute("aria-disabled")).toBe("true");
      expect(surface?.querySelector(`#${useInProject.getAttribute("aria-describedby")}`)?.textContent).toContain("unavailable until Core exposes a mutation contract");
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
    let originalFonts: PropertyDescriptor | undefined;
    const loadedFaces: string[] = [];
    const addFace = vi.fn();
    const deleteFace = vi.fn();
    class TestFontFace {
      constructor(readonly family: string, readonly source: string) {}
      async load() { loadedFaces.push(`${this.family}:${this.source}`); return this; }
    }
    Object.defineProperty(globalThis, "FontFace", { configurable: true, value: TestFontFace });
    const fontCard = artifact("licensed-cut", { mediaKind: "other", mime: "font/woff2" });
    const font = await mountViewer(fontCard, [fontCard], {}, () => {
      originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
      Object.defineProperty(document, "fonts", { configurable: true, value: { add: addFace, delete: deleteFace } });
    });
    try {
      expect(font.body.textContent).toContain("Font specimen · licensed-cut");
      expect(font.body.textContent).toContain("Aa Bb Cc 123");
      expect(loadedFaces).toEqual(["RalphySharedArtifactPreview:url(\"ralphy-media://asset/licensed-cut-token\")"]);
      expect(addFace).toHaveBeenCalledOnce();
      expect(font.body.textContent).not.toContain("Acme Display");
    } finally {
      await act(async () => font.root.unmount());
      expect(deleteFace).toHaveBeenCalledOnce();
      if (originalFontFace) Object.defineProperty(globalThis, "FontFace", originalFontFace);
      else delete (globalThis as { FontFace?: unknown }).FontFace;
      if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
      else delete (document as unknown as { fonts?: unknown }).fonts;
      font.host.restore();
    }
  });

  test.each(["construction", "load"])("turns font %s failures into a truthful preview failure", async (failure) => {
    const originalFontFace = Object.getOwnPropertyDescriptor(globalThis, "FontFace");
    const TestFontFace = failure === "construction"
      ? class { constructor() { throw new Error("invalid font bytes"); } }
      : class { async load() { throw new Error("font load failed"); } };
    Object.defineProperty(globalThis, "FontFace", { configurable: true, value: TestFontFace });
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue({ url: "ralphy-media://asset/bad-font-token", sizeBytes: 2_048 });
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({ items: [], nextCursor: null });
    const mounted = await mountViewer(artifact("unsafe-\"font", { mediaKind: "other", mime: "font/woff2" }));
    try {
      expect(mounted.body.textContent).toContain("Preview unavailable");
      expect(mounted.body.textContent).toContain("could not be decoded or loaded");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
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
    "font/collection",
    "font/javascript",
    "font/unknown",
    "application/font-executable",
    "application/vnd.ms-fontobject",
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
      expect(arrowRight.defaultPrevented).toBe(true);
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

  test("rerenders the controlled viewer with the next artifact preview, revisions, position, and boundaries", async () => {
    const first = artifact("first", { selectedRevisionId: "revision-first-1" });
    const second = artifact("second", { selectedRevisionId: "revision-second-4" });
    const cards = [first, second].map(presentSharedArtifact);
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockImplementation(async (_workspaceId, id) => ({
      url: `ralphy-media://asset/${id}`,
      sizeBytes: 2_048,
    }));
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockImplementation(async (_workspaceId, id) => ({
      items: [revision(id, id === "second" ? 4 : 1)],
      nextCursor: null,
    }));
    const host = createReactHost();
    const origin = document.createElement("button") as unknown as HostNode;
    (document.body as unknown as HostNode).appendChild(origin);
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    function Harness() {
      const [current, setCurrent] = useState(cards[0]);
      return <SharedArtifactViewer
        artifact={current}
        artifacts={cards}
        workspaceId="workspace-1"
        rootEpoch={1}
        returnFocus={origin as unknown as HTMLElement}
        onClose={() => undefined}
        onNavigate={setCurrent}
        onReconcile={() => undefined}
      />;
    }
    await act(async () => { root.render(<Harness />); await settle(); });
    await act(async () => { await settle(); });
    try {
      await click(byAria(document.body as unknown as HostNode, "button", "Next artifact"));
      await act(async () => { await settle(); });
      const body = document.body as unknown as HostNode;
      expect(body.textContent).toContain("Slug identity · second");
      expect(body.querySelector('[src="ralphy-media://asset/second"]')).not.toBeNull();
      expect(body.querySelector('[src="ralphy-media://asset/first"]')).toBeNull();
      expect(body.textContent).toContain("Revision 4Selected default");
      expect(body.textContent).toContain("2 / 2 loaded");
      expect(byAria(body, "button", "Previous artifact").disabled).toBe(false);
      expect(byAria(body, "button", "Next artifact").disabled).toBe(true);
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("invalidates a pending open-original request when the artifact changes", async () => {
    const first = artifact("first");
    const second = artifact("second");
    const pending = deferred<void>();
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue(null);
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({ items: [], nextCursor: null });
    vi.spyOn(bridge, "performSharedLibraryAction").mockReturnValue(pending.promise);
    const mounted = await mountViewer(first, [first, second]);
    try {
      await click(byAria(mounted.body, "button", "Open original"));
      expect(mounted.body.textContent).toContain("Opening original…");
      await act(async () => {
        mounted.root.render(<SharedArtifactViewer
          artifact={presentSharedArtifact(second)}
          artifacts={[first, second].map(presentSharedArtifact)}
          workspaceId="workspace-1"
          rootEpoch={1}
          returnFocus={mounted.origin as unknown as HTMLElement}
          onClose={() => undefined}
          onNavigate={() => undefined}
          onReconcile={() => undefined}
        />);
        await settle();
      });
      expect(mounted.body.textContent).toContain("Slug identity · second");
      expect(mounted.body.textContent).not.toContain("Opening original…");
      pending.reject(new Error("stale open failure"));
      await act(async () => { await settle(); });
      expect(mounted.body.textContent).not.toContain("Open original unavailable");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("ignores a pending revision selection after navigating to another artifact", async () => {
    const first = artifact("first", { selectedRevisionId: "revision-first-1" });
    const second = artifact("second", { selectedRevisionId: "revision-second-1" });
    const pending = deferred<ArtifactMediaCardDto>();
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockImplementation(async (_workspaceId, id) => ({
      url: `ralphy-media://asset/${id}`,
      sizeBytes: 2_048,
    }));
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockImplementation(async (_workspaceId, id) => ({
      items: [revision(id, 2), revision(id, 1)],
      nextCursor: null,
    }));
    vi.spyOn(bridge, "selectSharedLibraryRevision").mockReturnValue(pending.promise);
    const mounted = await mountViewer(first, [first, second]);
    try {
      await click(byAria(mounted.body, "button", "Select revision 2 as default for future use"));
      await act(async () => {
        mounted.root.render(<SharedArtifactViewer
          artifact={presentSharedArtifact(second)}
          artifacts={[first, second].map(presentSharedArtifact)}
          workspaceId="workspace-1"
          rootEpoch={1}
          returnFocus={mounted.origin as unknown as HTMLElement}
          onClose={() => undefined}
          onNavigate={() => undefined}
          onReconcile={() => undefined}
        />);
        await settle();
      });
      await act(async () => { await settle(); });
      expect(mounted.body.textContent).toContain("Slug identity · second");
      expect(mounted.body.querySelector('[src="ralphy-media://asset/second"]')).not.toBeNull();
      expect(mounted.body.textContent).toContain("Revision 1Selected default");

      pending.resolve(artifact("first", { selectedRevisionId: "revision-first-2" }));
      await act(async () => { await settle(); });

      expect(mounted.body.textContent).toContain("Slug identity · second");
      expect(mounted.body.textContent).not.toContain("Slug identity · first");
      expect(mounted.body.querySelector('[src="ralphy-media://asset/second"]')).not.toBeNull();
      expect(mounted.body.textContent).not.toContain("Revision selection unavailable");
      expect(byAria(mounted.body, "button", "Select revision 2 as default for future use").disabled).toBe(false);
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("reloads current viewer state after a selection conflict and retries with the fresh expected revision", async () => {
    const current = artifact("conflicted", { selectedRevisionId: "revision-conflicted-1" });
    const reloaded = artifact("conflicted", { selectedRevisionId: "revision-conflicted-2", selectedState: "candidate" });
    const selected = artifact("conflicted", { selectedRevisionId: "revision-conflicted-3", selectedState: "approved" });
    const conflict = Object.assign(new Error("stale selected revision"), { code: "E_CONFLICT" });
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue({ url: "ralphy-media://asset/conflicted", sizeBytes: 2_048 });
    const loadRevisions = vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({
      items: [revision("conflicted", 3), revision("conflicted", 2), revision("conflicted", 1)],
      nextCursor: null,
    });
    const loadDetail = vi.spyOn(bridge, "loadSharedLibraryArtifact").mockResolvedValue(reloaded);
    const select = vi.spyOn(bridge, "selectSharedLibraryRevision")
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce(selected);
    const reconcile = vi.fn();
    const mounted = await mountViewer(current, [current], { onReconcile: reconcile });
    try {
      await click(byAria(mounted.body, "button", "Select revision 3 as default for future use"));
      expect(mounted.body.textContent).toContain("The selected default changed in Core. Reload current state before retrying.");
      expect(mounted.body.textContent).toContain("Slug identity · conflicted");

      await click(buttonByText(mounted.body, "Reload current state"));
      expect(loadDetail).toHaveBeenCalledWith("workspace-1", "conflicted");
      expect(loadRevisions).toHaveBeenCalledTimes(2);
      expect(mounted.body.textContent).toContain("Current selected default reloaded. Retry when ready.");
      expect(mounted.body.textContent).toContain("Revision 2Selected default");

      await click(buttonByText(mounted.body, "Retry selection"));
      expect(select).toHaveBeenNthCalledWith(1, "workspace-1", "conflicted", "revision-conflicted-3", "revision-conflicted-1");
      expect(select).toHaveBeenNthCalledWith(2, "workspace-1", "conflicted", "revision-conflicted-3", "revision-conflicted-2");
      expect(reconcile).toHaveBeenCalledWith(selected);
      expect(mounted.body.textContent).toContain("Slug identity · conflicted");
      expect(mounted.body.textContent).toContain("Revision 3Selected default");
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

      await act(async () => {
        identity.dispatchEvent(mouseEvent("click", 1));
        await settle();
      });
      await act(async () => {
        identity.dispatchEvent(mouseEvent("click", 2));
        identity.dispatchEvent(mouseEvent("dblclick", 2));
        await settle();
      });
      expect((document.body as unknown as HostNode).querySelector(".shared-artifact-viewer")).not.toBeNull();
      expect(host.container.querySelector(".shared-artifact-inspector")).toBeNull();
      await click(byAria(document.body as unknown as HostNode, "button", "Close viewer"));
      expect(host.container.querySelector(".shared-artifact-inspector")).toBeNull();
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
