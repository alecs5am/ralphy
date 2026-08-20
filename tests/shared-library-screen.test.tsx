import { act } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ArtifactMediaCardDto, Page } from "../electron/ralphy/types";
import { bridge } from "../src/lib/ipc";
import { SharedLibraryScreen } from "../src/screens/SharedLibraryScreen";
import { createReactHost, type HostNode } from "./react-host";

function artifact(id: string, overrides: Partial<ArtifactMediaCardDto> = {}): ArtifactMediaCardDto {
  return {
    ref: { type: "artifact", id },
    workspaceId: "workspace-1",
    projectId: null,
    slug: id,
    kind: "reference-image",
    selectedRevisionId: `revision-${id}`,
    selectedState: "approved",
    mime: "image/png",
    bytes: 2_048,
    selectedAt: 100,
    revisionCount: 2,
    selectedObjectId: `object-${id}`,
    storageClass: "durable",
    usageRoles: [],
    target: { type: "object", id: `object-${id}` },
    mediaKind: "image",
    provenance: "unknown",
    ...overrides,
  };
}

function page(items: ArtifactMediaCardDto[], nextCursor: string | null = null): Page<ArtifactMediaCardDto> {
  return { items, nextCursor };
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

function byText(root: HostNode, text: string): HostNode {
  const node = [...root.querySelectorAll("button")].find((candidate) => candidate.textContent === text);
  if (!node) throw new Error(`Button not found: ${text}`);
  return node;
}

function byAria(root: HostNode, tag: string, label: string): HostNode | null {
  return root.querySelectorAll(tag).find((node) => node.getAttribute("aria-label") === label) ?? null;
}

async function choose(root: HostNode, label: "Kind" | "Provenance" | "Sort", value: string) {
  const trigger = byAria(root, "button", label);
  if (!trigger) throw new Error(`Select trigger not found: ${label}`);
  const select = root.querySelectorAll("select")[["Kind", "Provenance", "Sort"].indexOf(label)] as HostNode & { value: string };
  if (!select) throw new Error(`Select input not found: ${label}`);
  select.value = value;
  await act(async () => { select.dispatchEvent(new Event("change", { bubbles: true })); await settle(); });
}

async function mountScreen(props: Partial<React.ComponentProps<typeof SharedLibraryScreen>> = {}) {
  const host = createReactHost();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host.container as unknown as Element);
  const screenProps: React.ComponentProps<typeof SharedLibraryScreen> = {
    workspaceId: "workspace-1",
    workspaceName: "Launch Studio",
    rootEpoch: 1,
    ...props,
  };
  await act(async () => {
    root.render(<SharedLibraryScreen {...screenProps} />);
    await settle();
  });
  await act(async () => { await settle(); });
  return { host, root, screenProps };
}

afterEach(() => vi.restoreAllMocks());

describe("Shared Library screen", () => {
  test("renders the live shell, honest compact totals, current controls, and unavailable future filters", async () => {
    vi.spyOn(bridge, "loadSharedLibraryPage").mockResolvedValue(page([
      artifact("brand-mark"),
      artifact("opening-hook", { mediaKind: "audio", mime: "audio/mpeg", bytes: 4_096 }),
    ]));
    const mounted = await mountScreen();
    try {
      const text = mounted.host.container.textContent;
      expect(text).toContain("Shared Library");
      expect(text).toContain("Reusable workspace artifacts for people and agents");
      expect(text).toContain("2 ARTIFACTS");
      expect(text).toContain("6.0 KB");
      expect(text).toContain("Add artifact");
      expect(text).toContain("Promote from project");
      expect(byAria(mounted.host.container, "input", "Search Shared Library")?.getAttribute("placeholder"))
        .toBe("Search slug, kind, referenced role, provenance");
      expect(text).toContain("Grid");
      expect(text).toContain("List");
      expect(text).not.toContain("Shared Library is not wired yet");
      expect(mounted.host.container.querySelectorAll(".shared-library-primary")).toHaveLength(1);
      const unavailable = mounted.host.container.querySelectorAll("[data-unavailable-filter]");
      expect(unavailable.map((control) => control.textContent)).toEqual(expect.arrayContaining([
        "Semantic role", "Entity", "Canonical", "Used / unused", "Rights", "Missing metadata", "Group by entity",
      ]));
      expect(unavailable.every((control) => control.disabled && /Core/.test(control.getAttribute("title") ?? ""))).toBe(true);
      expect(text).not.toMatch(/semantic search/i);
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("searches exact returned fields and keeps unknown usage roles under Referenced as", async () => {
    vi.spyOn(bridge, "loadSharedLibraryPage").mockResolvedValue(page([
      artifact("generated-hook", {
        kind: "soundtrack", mediaKind: "audio", mime: "audio/mpeg",
        provenance: "generation", usageRoles: ["Agent-created opening ritual"],
      }),
      artifact("brand-mark", { provenance: "not-generation", usageRoles: ["logo lockup"] }),
    ]));
    const mounted = await mountScreen();
    try {
      const search = byAria(mounted.host.container, "input", "Search Shared Library") as HostNode & { value: string };
      search.value = "AGENT-CREATED OPENING";
      await act(async () => { search.dispatchEvent(new Event("input", { bubbles: true })); await settle(); });
      expect(mounted.host.container.textContent).toContain("generated-hook");
      expect(mounted.host.container.textContent).not.toContain("brand-mark");
      expect(mounted.host.container.textContent).toContain("Referenced as");
      expect(mounted.host.container.textContent).toContain("Agent-created opening ritual");
      expect(mounted.host.container.textContent).not.toContain("Semantic role: Agent-created opening ritual");

      search.value = "";
      await act(async () => { search.dispatchEvent(new Event("input", { bubbles: true })); await settle(); });
      await choose(mounted.host.container, "Kind", "audio");
      await choose(mounted.host.container, "Provenance", "generation");
      expect(mounted.host.container.querySelectorAll(".shared-artifact-card")).toHaveLength(1);
      expect(mounted.host.container.textContent).toContain("generated-hook");
      expect(mounted.host.container.textContent).not.toContain("brand-mark");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("uses one grid chrome band, honest workspace previews, and keyboard viewer callbacks", async () => {
    vi.spyOn(bridge, "loadSharedLibraryPage").mockResolvedValue(page([
      artifact("portrait", { usageRoles: ["Very long future usage role that must stay lossless"] }),
      artifact("theme", { mediaKind: "audio", mime: "audio/mpeg", usageRoles: ["music bed"] }),
      artifact("notes", { mediaKind: "document", mime: "application/pdf", target: null, selectedRevisionId: null, selectedObjectId: null }),
    ]));
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockImplementation(async (_workspaceId, id) => id === "notes" ? null : ({
      url: `ralphy-media://asset/${id}`,
      sizeBytes: 2_048,
    }));
    const onOpenInspector = vi.fn();
    const onOpenViewer = vi.fn();
    const mounted = await mountScreen({ onOpenInspector, onOpenViewer });
    try {
      expect(mounted.host.container.querySelectorAll(".shared-artifact-card")).toHaveLength(3);
      expect(mounted.host.container.querySelectorAll(".shared-artifact-chrome")).toHaveLength(3);
      expect(mounted.host.container.querySelectorAll(".shared-artifact-frame .shared-artifact-chrome")).toHaveLength(3);
      expect(mounted.host.container.querySelector('[src="ralphy-media://asset/portrait"]')).not.toBeNull();
      const audio = mounted.host.container.querySelector("audio");
      expect(audio).not.toBeNull();
      expect(audio!.getAttribute("autoplay")).toBeNull();
      expect(mounted.host.container.querySelector(".audio-waveform-heading strong")?.textContent).toBe("Slug identity: theme");
      expect(mounted.host.container.textContent).toContain("Preview unavailable");

      const portrait = byAria(mounted.host.container, "button", "Select portrait identity and open inspector")!;
      expect(portrait).not.toBeNull();
      expect(portrait.getAttribute("aria-describedby")).not.toBeNull();
      expect(mounted.host.container.textContent).toContain("Click or press Space to select this slug identity and open the inspector. Press Enter or double-click to open the viewer.");
      expect(mounted.host.container.textContent).toContain("Title unavailable");
      expect(mounted.host.container.textContent).toContain("SLUG · portrait");
      expect(portrait.closest("article")?.getAttribute("role")).toBeNull();
      await act(async () => portrait.dispatchEvent(new Event("click", { bubbles: true })));
      expect(onOpenInspector).toHaveBeenCalledWith(expect.objectContaining({ id: "portrait" }));
      const space = new Event("keyup", { bubbles: true, cancelable: true });
      Object.defineProperty(space, "key", { value: " " });
      await act(async () => portrait.dispatchEvent(space));
      expect(onOpenInspector).toHaveBeenCalledTimes(2);
      await act(async () => portrait.dispatchEvent(new Event("dblclick", { bubbles: true })));
      const enter = new Event("keydown", { bubbles: true, cancelable: true });
      Object.defineProperty(enter, "key", { value: "Enter" });
      await act(async () => portrait.dispatchEvent(enter));
      expect(onOpenViewer).toHaveBeenCalledTimes(2);
      expect(onOpenViewer).toHaveBeenLastCalledWith(expect.objectContaining({ id: "portrait" }));
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test.each(["Grid", "List"] as const)("closes the inspector back to the exact %s origin while preserving query, scroll, and selection", async (view) => {
    vi.spyOn(bridge, "loadSharedLibraryPage").mockResolvedValue(page([
      artifact("portrait"), artifact("other"),
    ]));
    vi.spyOn(bridge, "loadSharedLibraryArtifact").mockResolvedValue(artifact("portrait"));
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({ items: [], nextCursor: null });
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue(null);
    const mounted = await mountScreen();
    try {
      if (view === "List") await act(async () => { byText(mounted.host.container, "List").dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      const search = byAria(mounted.host.container, "input", "Search Shared Library") as HostNode & { value: string };
      search.value = "portrait";
      await act(async () => { search.dispatchEvent(new Event("input", { bubbles: true })); await settle(); });
      const scroll = mounted.host.container.querySelector(".shared-library-scroll")!;
      scroll.scrollTop = 83;
      const origin = byAria(mounted.host.container, "button", "Select portrait identity and open inspector")!;
      origin.focus();
      await act(async () => { origin.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect(mounted.host.container.querySelector(".shared-artifact-inspector")).not.toBeNull();
      expect(mounted.host.container.querySelector(".shared-library-content")?.getAttribute("data-inspector-open")).toBe("true");
      expect(mounted.host.container.textContent).toContain("Context agents receive");

      await act(async () => { byAria(mounted.host.container, "button", "Close artifact inspector")!.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect(mounted.host.container.querySelector(".shared-artifact-inspector")).toBeNull();
      expect((search.value ?? "")).toBe("portrait");
      expect(scroll.scrollTop).toBe(83);
      const selectedOrigin = view === "Grid" ? origin.closest("article") : origin.closest(".shared-library-audit-row");
      expect(selectedOrigin?.getAttribute("class")).toContain("is-selected");
      expect(document.activeElement).toBe(origin);
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("keeps a page-two unselected artifact, loaded extent, revision history, selection, and exact focus after selecting its future default", async () => {
    const first = artifact("first");
    const second = artifact("second", { selectedRevisionId: null, selectedState: null, selectedObjectId: null, target: null });
    const selected = artifact("second", { selectedRevisionId: "revision-second-1", selectedState: "candidate" });
    vi.spyOn(bridge, "loadSharedLibraryPage")
      .mockResolvedValueOnce(page([first], "page-2"))
      .mockResolvedValueOnce(page([second], "page-3"));
    vi.spyOn(bridge, "loadSharedLibraryArtifact").mockResolvedValue(second);
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({ items: [{
      id: "revision-second-1",
      artifactId: "second",
      objectId: "object-second-1",
      revisionNo: 1,
      parentRevisionId: null,
      iterationId: null,
      state: "candidate",
      authoredBySessionId: null,
      createdAt: Date.parse("2026-08-20T10:00:00.000Z"),
    }], nextCursor: null });
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue(null);
    const select = vi.spyOn(bridge, "selectSharedLibraryRevision").mockResolvedValue(selected);
    const mounted = await mountScreen();
    try {
      await act(async () => { byText(mounted.host.container, "Load more").dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      const origin = byAria(mounted.host.container, "button", "Select second identity and open inspector")!;
      origin.focus();
      await act(async () => { origin.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      await act(async () => { byAria(mounted.host.container, "button", "Select revision 1 as default for future use")!.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });

      expect(select).toHaveBeenCalledWith("workspace-1", "second", "revision-second-1", null);
      expect(mounted.host.container.textContent).toContain("Revision 1Selected default");
      expect(mounted.host.container.textContent).toContain("first");
      expect(mounted.host.container.textContent).toContain("second");
      expect(byText(mounted.host.container, "Load more")).not.toBeNull();

      await act(async () => { byAria(mounted.host.container, "button", "Close artifact inspector")!.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect(byAria(mounted.host.container, "button", "Select second identity and open inspector")).toBe(origin);
      expect(origin.closest("article")?.getAttribute("class")).toContain("is-selected");
      expect(document.activeElement).toBe(origin);
      expect(bridge.loadSharedLibraryPage).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("renders the 44px audit list with unavailable future cells and disabled bulk mutations", async () => {
    vi.spyOn(bridge, "loadSharedLibraryPage").mockResolvedValue(page([
      artifact("portrait", { usageRoles: ["character reference"] }),
      artifact("theme", { mediaKind: "audio", mime: "audio/mpeg", usageRoles: ["music bed"] }),
    ]));
    const mounted = await mountScreen();
    try {
      await act(async () => byText(mounted.host.container, "List").dispatchEvent(new Event("click", { bubbles: true })));
      const text = mounted.host.container.textContent;
      for (const column of ["ARTIFACT", "KIND", "REFERENCED AS", "CANONICAL", "REVISION", "REVISION COUNT", "USED BY", "RIGHTS", "LAST USED", "ATTENTION"]) {
        expect(text).toContain(column);
      }
      expect(mounted.host.container.querySelectorAll(".shared-library-audit-row")).toHaveLength(2);
      expect(text).toContain("Title unavailable");
      expect(text).toContain("SLUG · portrait");
      const firstRow = mounted.host.container.querySelectorAll(".shared-library-audit-row")[0];
      expect(firstRow.children[5]?.textContent).toBe("revision-portraitapproved");
      expect(firstRow.children[6]?.textContent).toBe("2 revisions");
      expect(text).toContain("Unavailable");
      expect(text).not.toContain("not used");

      const select = byAria(mounted.host.container, "input", "Select portrait")!;
      await act(async () => select.dispatchEvent(new Event("click", { bubbles: true })));
      expect(mounted.host.container.textContent).toContain("1 SELECTED");
      for (const label of ["Assign role", "Tag", "Review metadata", "Archive"]) {
        const action = byText(mounted.host.container, label);
        expect(action.disabled).toBe(true);
        expect(action.getAttribute("title")).toMatch(/Core mutation/i);
      }
      expect(mounted.host.container.textContent).not.toMatch(/replace revision|update all/i);
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test.each([
    ["image", "image/png", "img"],
    ["video", "video/mp4", "video"],
    ["audio", "audio/mpeg", "audio"],
  ] as const)("falls back when a resolved %s preview emits a real media error", async (mediaKind, mime, tag) => {
    vi.spyOn(bridge, "loadSharedLibraryPage").mockResolvedValue(page([artifact(`${mediaKind}-asset`, { mediaKind, mime })]));
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue({ url: `ralphy-media://asset/${mediaKind}`, sizeBytes: 2_048 });
    const mounted = await mountScreen();
    try {
      const media = mounted.host.container.querySelector(tag);
      expect(media).not.toBeNull();
      await act(async () => { media!.dispatchEvent(new Event("error")); await settle(); });
      expect(mounted.host.container.textContent).toContain("Preview unavailable");
      expect(mounted.host.container.querySelector(tag)).toBeNull();
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("retains loaded rows across an append error and retries the bounded page locally", async () => {
    vi.spyOn(bridge, "loadSharedLibraryPage")
      .mockResolvedValueOnce(page([artifact("first")], "next"))
      .mockRejectedValueOnce(new Error("Next page unavailable"))
      .mockResolvedValueOnce(page([artifact("second")], null));
    const mounted = await mountScreen();
    try {
      expect(mounted.host.container.textContent).toContain("SHOWING 1 LOADED ARTIFACT");
      await act(async () => { byText(mounted.host.container, "Load more").dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect(mounted.host.container.textContent).toContain("first");
      expect(mounted.host.container.textContent).toContain("Next page unavailable");
      await act(async () => { byText(mounted.host.container, "Retry").dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect(mounted.host.container.textContent).toContain("first");
      expect(mounted.host.container.textContent).toContain("second");
      expect(mounted.host.container.textContent).not.toContain("Next page unavailable");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("removes stale state and preview tokens when only the root changes", async () => {
    const oldPreview = deferred<{ url: string; sizeBytes: number } | null>();
    vi.spyOn(bridge, "loadSharedLibraryPage")
      .mockResolvedValueOnce(page([artifact("old-card")]))
      .mockResolvedValueOnce(page([artifact("new-card")]));
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockImplementation(async (_workspaceId, artifactId) => artifactId === "old-card"
      ? oldPreview.promise
      : { url: "ralphy-media://asset/new-token", sizeBytes: 2_048 });
    const mounted = await mountScreen();
    try {
      const search = byAria(mounted.host.container, "input", "Search Shared Library") as HostNode & { value: string };
      search.value = "old";
      await act(async () => { search.dispatchEvent(new Event("input", { bubbles: true })); await settle(); });
      await act(async () => byAria(mounted.host.container, "button", "Select old-card identity and open inspector")!.dispatchEvent(new Event("click", { bubbles: true })));

      await act(async () => {
        mounted.root.render(<SharedLibraryScreen workspaceId="workspace-1" workspaceName="Launch Studio" rootEpoch={2} />);
      });
      expect(mounted.host.container.textContent).not.toContain("old-card");
      oldPreview.resolve({ url: "ralphy-media://asset/stale-token", sizeBytes: 2_048 });
      await act(async () => { await settle(); });
      expect(mounted.host.container.textContent).toContain("new-card");
      expect(mounted.host.container.querySelector('[src="ralphy-media://asset/new-token"]')).not.toBeNull();
      expect(mounted.host.container.querySelector('[src="ralphy-media://asset/stale-token"]')).toBeNull();
      expect((byAria(mounted.host.container, "input", "Search Shared Library") as HostNode & { value?: string }).value ?? "").toBe("");
      expect(mounted.host.container.querySelector(".is-selected")).toBeNull();
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("removes stale state and preview tokens when only the workspace changes", async () => {
    const oldPreview = deferred<{ url: string; sizeBytes: number } | null>();
    vi.spyOn(bridge, "loadSharedLibraryPage").mockImplementation(async (workspaceId) => workspaceId === "workspace-1"
      ? page([artifact("old-card")])
      : page([artifact("new-card", { workspaceId: "workspace-2" })]));
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockImplementation(async (workspaceId) => workspaceId === "workspace-1"
      ? oldPreview.promise
      : { url: "ralphy-media://asset/new-token", sizeBytes: 2_048 });
    const mounted = await mountScreen();
    try {
      const search = byAria(mounted.host.container, "input", "Search Shared Library") as HostNode & { value: string };
      search.value = "old";
      await act(async () => { search.dispatchEvent(new Event("input", { bubbles: true })); await settle(); });
      await act(async () => byAria(mounted.host.container, "button", "Select old-card identity and open inspector")!.dispatchEvent(new Event("click", { bubbles: true })));

      await act(async () => {
        mounted.root.render(<SharedLibraryScreen workspaceId="workspace-2" workspaceName="Second Studio" rootEpoch={1} />);
      });
      expect(mounted.host.container.textContent).not.toContain("old-card");
      oldPreview.resolve({ url: "ralphy-media://asset/stale-token", sizeBytes: 2_048 });
      await act(async () => { await settle(); });
      expect(mounted.host.container.textContent).toContain("new-card");
      expect(mounted.host.container.querySelector('[src="ralphy-media://asset/new-token"]')).not.toBeNull();
      expect(mounted.host.container.querySelector('[src="ralphy-media://asset/stale-token"]')).toBeNull();
      expect((byAria(mounted.host.container, "input", "Search Shared Library") as HostNode & { value?: string }).value ?? "").toBe("");
      expect(mounted.host.container.querySelector(".is-selected")).toBeNull();
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });
});
