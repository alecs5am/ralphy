import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ArtifactMediaCardDto, Page } from "../electron/ralphy/types";
import { bridge } from "@/shared/api/ipc";
import { SharedLibraryScreen, SharedLibraryScreenView } from "@/pages/shared-library/ui/SharedLibraryScreen";
import { createSharedLibraryController } from "@/pages/shared-library/model/controller";
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
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
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
  test("keeps the pre-effect bootstrap shell geometrically stable", () => {
    const markup = renderToStaticMarkup(<SharedLibraryScreen workspaceId="workspace-1" workspaceName="Launch Studio" rootEpoch={1} />);
    expect(markup).toContain("shared-library-toolbar");
    expect(markup).toContain("shared-library-skeleton");
    expect(markup).toContain('aria-busy="true"');
    expect(markup.match(/role="status"/g)).toHaveLength(1);
  });

  test("keeps the loading shell stable with one quiet skeleton status", async () => {
    const pending = deferred<Page<ArtifactMediaCardDto>>();
    vi.spyOn(bridge, "loadSharedLibraryPage").mockReturnValue(pending.promise);
    const mounted = await mountScreen();
    try {
      const screen = mounted.host.container.querySelector(".shared-library-screen");
      expect(screen?.getAttribute("aria-busy")).toBe("true");
      expect(mounted.host.container.textContent).toContain("Shared Library");
      expect(mounted.host.container.querySelector(".shared-library-toolbar")).not.toBeNull();
      expect(mounted.host.container.querySelector(".shared-library-skeleton")).not.toBeNull();
      expect(mounted.host.container.querySelectorAll("[role=status]")).toHaveLength(1);
      expect(mounted.host.container.querySelectorAll(".shared-artifact-card")).toHaveLength(0);
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
      pending.resolve(page([]));
    }
  });

  test("keeps populated unresolved previews out of live regions", async () => {
    const preview = deferred<{ url: string; sizeBytes: number } | null>();
    vi.spyOn(bridge, "loadSharedLibraryPage").mockResolvedValue(page([artifact("portrait"), artifact("theme")]));
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockReturnValue(preview.promise);
    const mounted = await mountScreen();
    try {
      expect(mounted.host.container.querySelectorAll(".shared-artifact-preview-state")).toHaveLength(2);
      expect(mounted.host.container.querySelectorAll("[role=status]")).toHaveLength(0);
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
      preview.resolve(null);
    }
  });

  test("recovers from a full initial error through the visible Retry action", async () => {
    vi.spyOn(bridge, "loadSharedLibraryPage")
      .mockRejectedValueOnce(new Error("Library unavailable"))
      .mockResolvedValueOnce(page([artifact("recovered")]));
    const mounted = await mountScreen();
    try {
      expect(mounted.host.container.querySelector("[role=alert]")?.textContent).toContain("Library unavailable");
      await act(async () => { byText(mounted.host.container, "Retry").dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect(mounted.host.container.textContent).toContain("recovered");
      expect(mounted.host.container.textContent).not.toContain("Library unavailable");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("retains loaded content while refresh is busy and keeps a refresh failure local", async () => {
    const refreshPage = deferred<Page<ArtifactMediaCardDto>>();
    const controller = createSharedLibraryController({
      loadSharedLibraryPage: vi.fn()
        .mockResolvedValueOnce(page([artifact("retained")]))
        .mockReturnValueOnce(refreshPage.promise),
    }, "workspace-1");
    await controller.start();
    const refresh = controller.refresh();
    const render = () => renderToStaticMarkup(<SharedLibraryScreenView
      workspaceId="workspace-1" workspaceName="Launch Studio" rootEpoch={1}
      controller={controller} snapshot={controller.getSnapshot()}
      resolvePreview={async () => null}
    />);
    expect(render()).toContain('aria-busy="true"');
    expect(render()).toContain("retained");

    refreshPage.reject(new Error("Refresh unavailable"));
    await refresh;
    const failed = render();
    expect(failed).toContain("retained");
    expect(failed).toContain("Refresh unavailable");
    expect(failed).toContain("Retry refresh");
    controller.dispose();
  });

  test("renders the fixed empty library copy with one primary Add action and secondary Promote action", async () => {
    vi.spyOn(bridge, "loadSharedLibraryPage").mockResolvedValue(page([]));
    const mounted = await mountScreen();
    try {
      expect(mounted.host.container.textContent).toContain("Build a reusable source of truth");
      expect(mounted.host.container.textContent).toContain("Add canonical characters, locations, products, audio hooks, and brand assets for future projects.");
      expect(byText(mounted.host.container, "Add artifact").getAttribute("class")).toContain("shared-library-primary");
      expect(byText(mounted.host.container, "Promote from project").getAttribute("class") ?? "").not.toContain("shared-library-primary");
      expect(mounted.host.container.querySelectorAll(".shared-library-primary")).toHaveLength(1);
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

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
      // The field is a flex child in a crowded toolbar; a long placeholder ran off its own pill.
      expect(byAria(mounted.host.container, "input", "Search Shared Library")?.getAttribute("placeholder"))
        .toBe("Search artifacts");
      expect(text).toContain("Grid");
      expect(text).toContain("List");
      expect(text).not.toContain("Shared Library is not wired yet");
      expect(mounted.host.container.querySelectorAll(".shared-library-primary")).toHaveLength(1);
      const unavailable = mounted.host.container.querySelectorAll("[data-unavailable-filter]");
      expect(unavailable.map((control) => control.textContent)).toEqual(expect.arrayContaining([
        "Semantic role", "Entity", "Canonical", "Used / unused", "Rights", "Missing metadata", "Group by entity",
      ]));
      expect(unavailable.every((control) => !control.disabled && control.getAttribute("aria-disabled") === "true" && !!control.getAttribute("aria-describedby"))).toBe(true);
      const filterReason = unavailable[0]?.getAttribute("aria-describedby");
      expect(mounted.host.container.querySelector(`#${filterReason}`)?.textContent).toMatch(/unavailable from the current Core/i);
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

  test("keeps filters visible and suggests only truthful returned fields when no results match", async () => {
    vi.spyOn(bridge, "loadSharedLibraryPage").mockResolvedValue(page([artifact("portrait")]));
    const mounted = await mountScreen();
    try {
      const search = byAria(mounted.host.container, "input", "Search Shared Library") as HostNode & { value: string };
      search.value = "not-returned";
      await act(async () => { search.dispatchEvent(new Event("input", { bubbles: true })); await settle(); });
      expect(mounted.host.container.querySelector(".shared-library-toolbar")).not.toBeNull();
      expect(mounted.host.container.textContent).toContain("No artifacts match these filters");
      expect(mounted.host.container.textContent).toContain("Try slug, kind, MIME, referenced role, or provenance.");
      await act(async () => { byText(mounted.host.container, "Clear filters").dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect(mounted.host.container.textContent).toContain("portrait");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("keeps absent attention contracts explicit without inferring evidence states", async () => {
    vi.spyOn(bridge, "loadSharedLibraryPage").mockResolvedValue(page([artifact("portrait")]));
    const mounted = await mountScreen();
    try {
      const text = mounted.host.container.textContent;
      for (const state of ["missing-file", "broken-reference", "rights-unknown", "duplicate-candidate", "revision-update"]) {
        expect(text.toLocaleLowerCase()).toContain(`${state} evidence`);
      }
      expect(text).toContain("unavailable from this Core version; no state is inferred");
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("names an unselected target as no preview target in the card, inspector, and viewer", async () => {
    const targetless = artifact("unselected", { selectedRevisionId: null, selectedState: null, selectedObjectId: null, target: null });
    vi.spyOn(bridge, "loadSharedLibraryPage").mockResolvedValue(page([targetless]));
    vi.spyOn(bridge, "loadSharedLibraryArtifact").mockResolvedValue(targetless);
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({ items: [], nextCursor: null });
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue(null);
    const mounted = await mountScreen();
    try {
      const identity = byAria(mounted.host.container, "button", "Select unselected identity and open inspector")!;
      expect(identity.closest("article")?.textContent).toContain("No preview target");
      await act(async () => { identity.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      const inspectorPreview = mounted.host.container.querySelector(".shared-inspector-preview");
      expect(inspectorPreview?.textContent).toContain("No preview target");
      expect(inspectorPreview?.textContent).not.toMatch(/missing file|broken reference|rights unknown|duplicate|revision update/i);
      await act(async () => { byAria(mounted.host.container, "button", "Close artifact inspector")!.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      const enter = new Event("keydown", { bubbles: true, cancelable: true });
      Object.defineProperty(enter, "key", { value: "Enter" });
      await act(async () => { identity.dispatchEvent(enter); await settle(); });
      const viewerPreview = (document.body as unknown as HostNode).querySelector(".shared-viewer-preview-state");
      expect(viewerPreview?.textContent).toContain("No preview target");
      expect(viewerPreview?.textContent).not.toMatch(/missing file|corrupt|damaged/i);
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
      const targetless = byAria(mounted.host.container, "button", "Select notes identity and open inspector")?.closest("article");
      expect(targetless?.textContent).toContain("No preview target");
      expect(targetless?.textContent).not.toMatch(/missing file|broken reference|rights unknown|duplicate|revision update/i);

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

  test("exposes selected grid and audit artifacts without relying on color", async () => {
    vi.spyOn(bridge, "loadSharedLibraryPage").mockResolvedValue(page([artifact("portrait"), artifact("theme")]));
    const mounted = await mountScreen();
    try {
      const portrait = byAria(mounted.host.container, "button", "Select portrait identity and open inspector")!;
      const theme = byAria(mounted.host.container, "button", "Select theme identity and open inspector")!;
      expect(portrait.getAttribute("aria-pressed")).toBe("false");
      expect(theme.getAttribute("aria-pressed")).toBe("false");
      await act(async () => { portrait.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect(portrait.getAttribute("aria-pressed")).toBe("true");
      expect(theme.getAttribute("aria-pressed")).toBe("false");

      await act(async () => { byText(mounted.host.container, "List").dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect(mounted.host.container.querySelector(".shared-library-audit")?.getAttribute("role")).toBe("grid");
      const rows = mounted.host.container.querySelectorAll(".shared-library-audit-row");
      expect(rows[0].getAttribute("aria-selected")).toBe("true");
      expect(rows[1].getAttribute("aria-selected")).toBe("false");
      await act(async () => { rows[1].dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect(rows[0].getAttribute("aria-selected")).toBe("false");
      expect(rows[1].getAttribute("aria-selected")).toBe("true");
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
      for (const state of [
        "Canonical evidence unavailable",
        "Usage evidence unavailable",
        "Rights evidence unavailable",
        "Last-used evidence unavailable",
        "Attention evidence unavailable",
      ]) expect(text).toContain(state);
      expect(text).not.toContain("not used");

      const auditScroll = mounted.host.container.querySelector(".shared-library-audit-scroll");
      expect(auditScroll?.getAttribute("role")).toBe("region");
      expect(auditScroll?.getAttribute("aria-label")).toContain("Scrollable");
      expect(auditScroll?.getAttribute("tabindex")).toBe("0");

      const firstRowKey = new Event("keydown", { bubbles: true, cancelable: true });
      Object.defineProperty(firstRowKey, "key", { value: " " });
      await act(async () => { firstRow.dispatchEvent(firstRowKey); await settle(); });
      expect(mounted.host.container.querySelector(".shared-artifact-inspector")).not.toBeNull();
      await act(async () => { byAria(mounted.host.container, "button", "Close artifact inspector")!.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      const enterRow = new Event("keydown", { bubbles: true, cancelable: true });
      Object.defineProperty(enterRow, "key", { value: "Enter" });
      await act(async () => { firstRow.dispatchEvent(enterRow); await settle(); });
      expect((document.body as unknown as HostNode).querySelector(".shared-artifact-viewer")).not.toBeNull();
      await act(async () => { byAria(document.body as unknown as HostNode, "button", "Close viewer")!.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });

      const select = byAria(mounted.host.container, "input", "Select portrait")!;
      await act(async () => select.dispatchEvent(new Event("click", { bubbles: true })));
      expect(mounted.host.container.textContent).toContain("1 SELECTED");
      for (const label of ["Assign role", "Tag", "Review metadata", "Archive"]) {
        const action = byText(mounted.host.container, label);
        expect(action.disabled).toBe(false);
        expect(action.getAttribute("aria-disabled")).toBe("true");
        const reasonId = action.getAttribute("aria-describedby");
        expect(mounted.host.container.querySelector(`#${reasonId}`)?.textContent).toMatch(/Core mutation/i);
      }
      expect(mounted.host.container.textContent).not.toMatch(/replace revision|update all/i);
    } finally {
      await act(async () => mounted.root.unmount());
      mounted.host.restore();
    }
  });

  test("restores the exact audit row after Space inspector and Enter viewer paths", async () => {
    const card = artifact("portrait");
    vi.spyOn(bridge, "loadSharedLibraryPage").mockResolvedValue(page([card]));
    vi.spyOn(bridge, "loadSharedLibraryArtifact").mockResolvedValue(card);
    vi.spyOn(bridge, "loadSharedLibraryRevisions").mockResolvedValue({ items: [], nextCursor: null });
    vi.spyOn(bridge, "resolveSharedLibraryPreview").mockResolvedValue(null);
    const mounted = await mountScreen();
    try {
      await act(async () => { byText(mounted.host.container, "List").dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      const row = mounted.host.container.querySelector(".shared-library-audit-row")!;

      row.focus();
      const space = new Event("keydown", { bubbles: true, cancelable: true });
      Object.defineProperty(space, "key", { value: " " });
      await act(async () => { row.dispatchEvent(space); await settle(); });
      await act(async () => { byAria(mounted.host.container, "button", "Close artifact inspector")!.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect(document.activeElement).toBe(row);

      row.focus();
      const enter = new Event("keydown", { bubbles: true, cancelable: true });
      Object.defineProperty(enter, "key", { value: "Enter" });
      await act(async () => { row.dispatchEvent(enter); await settle(); });
      await act(async () => { byAria(document.body as unknown as HostNode, "button", "Close viewer")!.dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect(document.activeElement).toBe(row);
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
      expect(mounted.host.container.textContent).toContain("Showing loaded artifacts");
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

  test("keeps bounded rows visible and marks only the collection busy while loading more", async () => {
    const next = deferred<Page<ArtifactMediaCardDto>>();
    vi.spyOn(bridge, "loadSharedLibraryPage")
      .mockResolvedValueOnce(page([artifact("first")], "next"))
      .mockReturnValueOnce(next.promise);
    const mounted = await mountScreen();
    try {
      await act(async () => { byText(mounted.host.container, "Load more").dispatchEvent(new Event("click", { bubbles: true })); await settle(); });
      expect(mounted.host.container.textContent).toContain("first");
      expect(mounted.host.container.textContent).toContain("Loading more artifacts…");
      expect(mounted.host.container.querySelector(".shared-library-scroll")?.getAttribute("aria-busy")).toBe("true");
      next.resolve(page([artifact("second")], null));
      await act(async () => { await settle(); });
      expect(mounted.host.container.textContent).toContain("second");
      expect(mounted.host.container.querySelector(".shared-library-scroll")?.getAttribute("aria-busy")).toBeNull();
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
