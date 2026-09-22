import { renderToStaticMarkup } from "react-dom/server";
import { act, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, test, vi } from "vitest";
import type { MediaCardDto, MediaGenerationDetailDto, RunObjectMediaCardDto } from "../electron/ralphy/types";
import { VirtualAssetGrid, MediaCardTile } from "@/pages/project";
import { AudioWaveform } from "@/entities/media";
import { ImageViewport } from "@/entities/media";
import { compactVideoStartTime, VideoPlayer } from "@/entities/media";
import { ProjectScreenView, createProjectScreenController } from "@/pages/project";
import { bridge, type ProjectSummary } from "@/shared/api/ipc";
import { createReactHost, type HostNode } from "./react-host";
import { MEDIA_REVIEW_UNSUPPORTED_REASON as REVIEW_REASON } from "@/features/media-review";
import { productionMediaReviewStatus } from "@/features/media-review/lib/presentation";

const card: MediaCardDto = {
  ref: { type: "artifact", id: "artifact-1" },
  workspaceId: "workspace-1",
  projectId: "project-1",
  slug: "Campaign hero",
  kind: "image",
  selectedRevisionId: "revision-1",
  selectedState: "approved",
  mime: "image/png",
  bytes: 2048,
  selectedAt: 1,
  revisionCount: 2,
  selectedObjectId: "object-1",
  storageClass: "final",
  usageRoles: ["cover"],
  target: { type: "object", id: "object-1" },
  mediaKind: "image",
  provenance: "generation",
};

const project: ProjectSummary = {
  id: "project-1", workspaceId: "workspace-1", projectId: "project-1", name: "Launch", brief: "Brief",
  status: "active", phase: null, finalState: "working", platform: null, aspectRatio: null, spendUsd: null,
  finalCount: 0, sharedCount: 0, unitCount: 0, recentActivity: "2026-08-02T00:00:00.000Z",
};

const runObject: RunObjectMediaCardDto = {
  ref: { type: "run-object", id: "run-object-1" }, workspaceId: "workspace-1", projectId: "project-1",
  runId: "run-1", purpose: "diagnostic-log", state: "ready", retention: "cache", mime: "text/plain", bytes: 128,
  createdAt: 1, objectId: null, logicalPath: "runs/run-1/diagnostics.txt", locationClass: "cache",
  attemptId: null, attemptNo: null, target: { type: "run-object", id: "run-object-1" },
  mediaKind: "document", provenance: "unknown",
};

function projectApi() {
  return {
    loadProjectOverview: async () => ({ project: { id: "project-1", workspaceId: "workspace-1", slug: "launch", name: "Launch", purpose: null, state: "active", rowVersion: 1, createdAt: 1, updatedAt: 1 } }),
    loadProjectPage: async ({ tab }) => ({ items: tab === "media" ? [runObject] : [], nextCursor: null }),
    loadProjectMediaCard: async () => runObject,
    loadDocumentPreview: async () => ({ revisionId: "revision-1", format: "text", text: "", truncated: false }),
    searchProjectDocuments: async () => ({ items: [], nextCursor: null }),
    showProjectDocument: async () => { throw new Error("Not used"); },
    reviseProjectDocument: async () => { throw new Error("Not used"); },
    resolveProjectPreview: async () => null,
    loadProjectGeneration: async (_project: unknown, target: MediaGenerationDetailDto["target"]) => ({ status: "unknown" as const, target, reason: "not-recorded" as const }),
    loadProjectMediaRevisions: async () => ({ items: [], nextCursor: null }),
    selectProjectMediaRevision: async () => { throw new Error("Not used"); },
  };
}

function MountedProject({ controller }: { controller: ReturnType<typeof createProjectScreenController> }) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return <ProjectScreenView project={project} controller={controller} snapshot={snapshot} />;
}

function button(root: HostNode, label: string): HostNode {
  const found = root.findAll((node) => node.tagName === "BUTTON" && node.getAttribute("aria-label") === label)[0];
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

function textButton(root: HostNode, label: string): HostNode {
  const found = root.findAll((node) => node.tagName === "BUTTON" && node.textContent === label)[0];
  if (!found) throw new Error(`Missing button text: ${label}`);
  return found;
}

function keydown(target: EventTarget, key: string, modifiers: Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">> = {}) {
  const event = new Event("keydown", { bubbles: true, cancelable: true });
  Object.defineProperties(event, { key: { value: key }, ...Object.fromEntries(Object.entries(modifiers).map(([name, value]) => [name, { value }])) });
  target.dispatchEvent(event);
}

describe("Project media presentation", () => {
  test("switches from the 9:16 grid to a Finder-style gallery with an original-ratio stage", async () => {
    const second = { ...card, ref: { type: "artifact" as const, id: "artifact-2" }, slug: "Second asset" };
    const controller = createProjectScreenController({
      ...projectApi(),
      loadProjectPage: async () => ({ items: [card, second], nextCursor: null }),
    }, project);
    await controller.selectTab("media");
    const preview = vi.spyOn(bridge, "resolveProjectPreview").mockResolvedValue({ url: "ralphy-media://asset/preview", sizeBytes: 2048 });
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject controller={controller} />); await Promise.resolve(); });
      const gallery = host.container.findAll((node) => node.getAttribute("aria-label") === "Gallery view")[0];
      expect(gallery).toBeDefined();
      await act(async () => { gallery.dispatchEvent(new Event("click", { bubbles: true })); await Promise.resolve(); await Promise.resolve(); });
      expect(host.container.querySelector(".media-gallery")).toBeDefined();
      const stage = host.container.querySelector(".media-gallery-stage")!;
      await vi.waitFor(() => expect(stage.querySelector(".image-viewport")).not.toBeNull());
      const secondThumb = host.container.findAll((node) => node.getAttribute("aria-label") === "Show Second asset")[0];
      await act(async () => { secondThumb.dispatchEvent(new Event("click", { bubbles: true })); await Promise.resolve(); });
      expect(controller.getSnapshot().selectedMedia).toEqual(second);
    } finally {
      await act(async () => root.unmount());
      preview.mockRestore();
      controller.dispose();
      host.restore();
    }
  });

  test("shows a saved Needs Work verdict without relabeling ordinary candidate media", () => {
    expect(productionMediaReviewStatus({ ...card, selectedState: "candidate" })).toEqual({ status: "ready", value: "candidate" });
    expect(productionMediaReviewStatus({ ...card, selectedState: "candidate", latestReviewVerdict: "needs-work" })).toEqual({ status: "ready", value: "needs-work" });
  });
  test("uses a four-second poster for long previews and starts short clips at the beginning", () => {
    expect(compactVideoStartTime(24, true)).toBe(4);
    expect(compactVideoStartTime(24, false)).toBe(0);
    expect(compactVideoStartTime(3, true)).toBe(0);
    expect(compactVideoStartTime(4.041667, true)).toBe(0);
  });

  test("keeps accessible image zoom, pan, and fit presentation", () => {
    const markup = renderToStaticMarkup(<ImageViewport src="ralphy-media://asset/image" name="Campaign hero" />);
    expect(markup).toContain('alt="Campaign hero"');
    expect(markup).toContain('aria-label="Zoom in"');
    expect(markup).toContain('aria-label="Fit image"');
  });

  test("keeps named video and audio custom controls", () => {
    const video = renderToStaticMarkup(<VideoPlayer src="ralphy-media://asset/video" name="Final cut" />);
    const audio = renderToStaticMarkup(<AudioWaveform src="ralphy-media://asset/audio" name="Voiceover" />);
    expect(video).toContain('aria-label="Final cut"');
    expect(video).toContain('aria-label="Play Final cut"');
    expect(video).not.toContain(" controls=\"\"");
    expect(audio).toContain('aria-label="Voiceover"');
    expect(audio).toContain('aria-label="Play Voiceover"');
  });

  test("keeps a virtualized grid with stable MediaRef selection and accessible cards", () => {
    const tile = renderToStaticMarkup(<MediaCardTile
      card={card}
      project={{ workspaceId: "workspace-1", projectId: "project-1" }}
      rootEpoch={7}
      selected
      resolvePreview={async () => null}
      onSelect={() => undefined}
      onOpen={() => undefined}
      onContextMenu={() => undefined}
    />);
    const grid = renderToStaticMarkup(<VirtualAssetGrid
      items={[card]}
      project={{ workspaceId: "workspace-1", projectId: "project-1" }}
      rootEpoch={7}
      selectedRef={card.ref}
      resolvePreview={async () => null}
      onSelect={() => undefined}
      onOpen={() => undefined}
      onContextMenu={() => undefined}
      density={230}
      hasMore={false}
      loadingMore={false}
      appendError={null}
      onLoadMore={() => undefined}
      onRetryAppend={() => undefined}
      scrollMemory={new Map()}
      scrollKey="media"
      scrollResetToken={7}
    />);
    expect(tile).toContain('aria-label="Campaign hero, selected"');
    expect(tile).not.toContain('aria-label="Open Campaign hero"');
    expect(tile.match(/<button/g)).toHaveLength(1);
    expect(tile).toContain("aspect-ratio:0.5625");
    expect(tile).toContain("Image · image/png");
    expect(tile).toContain("image/png · 2.0 KB · approved · cover");
    expect(grid).toContain("asset-grid-scroll");
  });

  test("shows only loading feedback while the initial media page is pending", () => {
    const api = { ...projectApi(), loadProjectPage: () => new Promise<never>(() => undefined) };
    const controller = createProjectScreenController(api, project);
    void controller.selectTab("media");
    const markup = renderToStaticMarkup(<ProjectScreenView project={project} controller={controller} snapshot={controller.getSnapshot()} />);
    expect(markup).toContain("Loading media…");
    expect(markup).not.toContain("No media matches");
    controller.dispose();
  });

  test("searches the server after typing and keeps search and sort on subsequent pages", async () => {
    const api = { ...projectApi(), loadProjectPage: vi.fn(async ({ mediaQuery, cursor }) => ({ items: mediaQuery?.search ? [card] : [runObject], nextCursor: cursor ? null : "more" })) };
    const controller = createProjectScreenController(api as never, project);
    await controller.start();
    const tilePreview = vi.spyOn(bridge, "resolveProjectPreview").mockResolvedValue(null);
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject controller={controller} />); await Promise.resolve(); });
      const input = host.container.findAll((node) => node.getAttribute("aria-label") === "Search project media")[0] as HostNode & { value: string };
      input.value = "  Campaign  ";
      await act(async () => { input.dispatchEvent(new Event("input", { bubbles: true })); });
      expect(api.loadProjectPage).toHaveBeenCalledTimes(1);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 280));
        input.value = "Campaign hero";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(input.value).toBe("Campaign hero");
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 280)); });
      expect(api.loadProjectPage).toHaveBeenLastCalledWith(expect.objectContaining({ mediaQuery: { filter: "all", sort: "newest", search: "Campaign hero" } }));
      expect(button(host.container, "Campaign hero")).toBeDefined();
      const images = host.container.querySelectorAll("input").find((node) => node.getAttribute("aria-label") === "Images")!;
      Object.assign(images, { type: "radio", checked: true });
      await act(async () => { images.dispatchEvent(new Event("click", { bubbles: true })); await Promise.resolve(); });
      expect(api.loadProjectPage).toHaveBeenLastCalledWith(expect.objectContaining({ mediaQuery: { filter: "all", sort: "newest", search: "Campaign hero", mediaKind: "image" } }));
      await act(async () => { await controller.setMediaQuery({ sort: "name" }); await controller.loadMore("media"); });
      expect(api.loadProjectPage).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "more", mediaQuery: { filter: "all", search: "Campaign hero", mediaKind: "image", sort: "name" } }));
      input.value = "";
      await act(async () => { input.dispatchEvent(new Event("input", { bubbles: true })); });
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 280)); });
      expect(api.loadProjectPage).toHaveBeenLastCalledWith(expect.objectContaining({ mediaQuery: { filter: "all", mediaKind: "image", sort: "name" } }));
    } finally { await act(async () => root.unmount()); tilePreview.mockRestore(); host.restore(); }
  });

  test("full media grid keeps selection, viewer, context actions, focus, and density on one tile surface", async () => {
    const second = { ...card, ref: { type: "artifact" as const, id: "artifact-2" }, slug: "Second asset" };
    const api = {
      ...projectApi(),
      loadProjectPage: vi.fn(async () => ({ items: [card, second], nextCursor: "next-media-page" })),
      resolveProjectPreview: vi.fn(async () => null),
    };
    const controller = createProjectScreenController(api as never, project);
    await controller.selectTab("media");
    const tilePreview = vi.spyOn(bridge, "resolveProjectPreview").mockResolvedValue(null);
    const mediaAction = vi.spyOn(bridge, "performProjectMediaAction").mockResolvedValue();
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    const contextMenu = (target: HostNode, x = 120, y = 140) => {
      const event = new Event("contextmenu", { bubbles: true, cancelable: true });
      Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y } });
      target.dispatchEvent(event);
    };
    try {
      await act(async () => { root.render(<MountedProject controller={controller} />); await Promise.resolve(); await Promise.resolve(); });
      const first = button(host.container, "Campaign hero");
      const secondTile = button(host.container, "Second asset");
      api.resolveProjectPreview.mockClear();

      await act(async () => { first.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })); await Promise.resolve(); });
      expect(controller.getSnapshot().selectedMedia).toEqual(card);
      expect(controller.getSnapshot().mediaViewerOpen).toBe(true);
      expect(api.resolveProjectPreview).toHaveBeenCalled();
      await act(async () => { controller.closeMediaViewer(); await Promise.resolve(); });

      await act(async () => { secondTile.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })); await Promise.resolve(); });
      expect(controller.getSnapshot().mediaViewerOpen).toBe(true);
      await act(async () => { controller.closeMediaViewer(); await Promise.resolve(); });

      await act(async () => { keydown(secondTile, " "); await Promise.resolve(); });
      expect(controller.getSnapshot().selectedMedia).toEqual(second);
      await act(async () => { keydown(first, "Enter"); await Promise.resolve(); });
      expect(controller.getSnapshot().mediaViewerOpen).toBe(true);
      await act(async () => { controller.closeMediaViewer(); await Promise.resolve(); });

      await act(async () => { contextMenu(secondTile); await Promise.resolve(); await Promise.resolve(); });
      expect(controller.getSnapshot().selectedMedia).toEqual(second);
      let menu = host.container.querySelector(".asset-context-menu")!;
      expect(menu).toBeDefined();
      // The file actions, then the review section: the verdicts moved off the docked console and
      // onto the asset itself. Production exposes no review mutation, so all three rows are
      // disabled and each one carries the reason rather than implying a state change.
      expect(menu.querySelectorAll("button").map((item) => item.textContent?.replace(REVIEW_REASON, ""))).toEqual([
        "Preview", "Open externally", "Reveal in Finder", "Copy file", "Approved", "Needs Work", "Rejected",
      ]);
      expect([...menu.querySelectorAll("button")].slice(4).every((item) => item.getAttribute("aria-disabled") !== "true")).toBe(true);
      expect(menu.textContent).not.toContain(REVIEW_REASON);
      expect(menu.textContent).not.toContain("Trash");
      expect(menu.style.left).toBe("120px");
      expect(menu.style.top).toBe("140px");

      await act(async () => { textButton(menu, "Preview").dispatchEvent(new Event("click", { bubbles: true })); await Promise.resolve(); });
      expect(controller.getSnapshot().mediaViewerOpen).toBe(true);
      await act(async () => { controller.closeMediaViewer(); await Promise.resolve(); });
      for (const [label, action] of [["Open externally", "open"], ["Reveal in Finder", "finder"], ["Copy file", "copy"]] as const) {
        await act(async () => { contextMenu(secondTile); await Promise.resolve(); });
        menu = host.container.querySelector(".asset-context-menu")!;
        await act(async () => { textButton(menu, label).dispatchEvent(new Event("click", { bubbles: true })); await Promise.resolve(); });
        expect(mediaAction).toHaveBeenLastCalledWith({ workspaceId: "workspace-1", projectId: "project-1" }, second.ref, action);
      }

      await act(async () => { contextMenu(secondTile); await Promise.resolve(); await Promise.resolve(); });
      await act(async () => { keydown(globalThis.document, "Escape"); await Promise.resolve(); });
      expect(host.container.querySelector(".asset-context-menu")).toBeNull();
      expect(globalThis.document.activeElement).toBe(secondTile);
      await act(async () => { contextMenu(secondTile); await Promise.resolve(); });
      await act(async () => { globalThis.document.dispatchEvent(new Event("mousedown", { bubbles: true, cancelable: true })); await Promise.resolve(); });
      expect(host.container.querySelector(".asset-context-menu")).toBeNull();
      expect(globalThis.document.activeElement).toBe(secondTile);

      expect(host.container.querySelectorAll(".asset-grid-scroll")).toHaveLength(1);
      expect(host.container.querySelector(".project-preview")).toBeNull();
      expect(host.container.findAll((node) => node.tagName === "BUTTON" && node.getAttribute("aria-label") === "Open Campaign hero")).toHaveLength(0);
      const slider = host.container.findAll((node) => node.getAttribute("role") === "slider" && node.getAttribute("aria-label") === "Grid density")[0];
      const columns = () => Number.parseInt(/repeat\((\d+)/.exec(host.container.querySelector(".virtual-grid-row")!.style.gridTemplateColumns)?.[1] ?? "0", 10);
      await act(async () => { keydown(slider, "Home"); await Promise.resolve(); });
      const compactColumns = columns();
      await act(async () => { keydown(slider, "End"); await Promise.resolve(); });
      expect(columns()).toBeLessThan(compactColumns);
    } finally {
      await act(async () => { root.unmount(); await Promise.resolve(); });
      mediaAction.mockRestore();
      tilePreview.mockRestore();
      host.restore();
    }
  });

  test("renders only literal safe RunObject evidence and keeps the logical path inert", async () => {
    const controller = createProjectScreenController(projectApi(), project);
    await controller.selectTab("media");
    await controller.openMediaViewer({
      ...runObject,
      path: "/private/raw/path",
      hash: "secret-hash",
      metadata: { provider: "secret-provider" },
      request: { secret: "request-body" },
      response: { secret: "response-body" },
      error: { secret: "error-body" },
    } as RunObjectMediaCardDto);
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject controller={controller} />); await Promise.resolve(); });
      const dialog = (globalThis.document.body as unknown as HostNode).findAll((node) => node.getAttribute("role") === "dialog")[0];
      expect(dialog.textContent).toContain("RunObject evidence");
      expect(dialog.textContent).toContain("run-1");
      expect(dialog.textContent).toContain("AttemptUnlinked");
      expect(dialog.textContent).toContain("diagnostic-log");
      expect(dialog.textContent).toContain("ready");
      expect(dialog.textContent).toContain("cache");
      expect(dialog.textContent).toContain("runs/run-1/diagnostics.txt");
      expect(dialog.textContent).toContain("Not promoted");
      expect(dialog.findAll((node) => node.getAttribute("href") === "runs/run-1/diagnostics.txt" || (node.tagName === "BUTTON" && node.textContent === "runs/run-1/diagnostics.txt"))).toHaveLength(0);
      expect(dialog.textContent).not.toMatch(/private\/raw|secret-hash|secret-provider|request-body|response-body|error-body/);
    } finally {
      await act(async () => { root.unmount(); await Promise.resolve(); });
      host.restore();
    }
  });

  test("does not treat an Artifact with an incidental runId as a RunObject", async () => {
    const adversarial = { ...card, runId: "spoofed-run" } as MediaCardDto;
    const api = { ...projectApi(), loadProjectPage: async () => ({ items: [adversarial], nextCursor: null }) };
    const controller = createProjectScreenController(api, project);
    await controller.selectTab("media");
    await controller.openMediaViewer(adversarial);

    const markup = renderToStaticMarkup(<ProjectScreenView project={project} controller={controller} snapshot={controller.getSnapshot()} />);
    expect(markup).not.toContain("RunObject evidence");
    expect(markup).not.toContain("spoofed-run");
  });

  test("does not drain another media page while rendering the virtual grid", async () => {
    const loadProjectPage = vi.fn(async () => ({ items: [card], nextCursor: "next-media-page" }));
    const controller = createProjectScreenController({ ...projectApi(), loadProjectPage }, project);
    await controller.selectTab("media");

    renderToStaticMarkup(<ProjectScreenView project={project} rootEpoch={4} controller={controller} snapshot={controller.getSnapshot()} />);

    expect(loadProjectPage).toHaveBeenCalledOnce();
  });

  test("gives media the whole viewer when provenance is unavailable and keeps the reference in a tooltip", async () => {
    const controller = createProjectScreenController({ ...projectApi(), loadProjectPage: async () => ({ items: [card], nextCursor: null }) }, project);
    await controller.selectTab("media");
    const tilePreview = vi.spyOn(bridge, "resolveProjectPreview").mockResolvedValue(null);
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject controller={controller} />); await controller.openMediaViewer(card); });
      const body = globalThis.document.body as unknown as HostNode;
      const dialog = body.findAll((node) => node.getAttribute("role") === "dialog")[0];
      expect(dialog.querySelector(".asset-modal-inspector")).toBeNull();
      expect(dialog.querySelector(".asset-modal-body")?.getAttribute("class")).toContain("grid-cols-1");
      const header = dialog.querySelector(".asset-modal-toolbar")!;
      expect(header.textContent).toContain("Image");
      expect(header.textContent).not.toContain("artifact-1");
      expect(header.findAll((node) => node.getAttribute("title") === "artifact · artifact-1")).toHaveLength(1);
      expect(button(dialog, "Previous").disabled).toBe(true);
      expect(button(dialog, "Next").disabled).toBe(true);
    } finally { await act(async () => root.unmount()); tilePreview.mockRestore(); host.restore(); }
  });

  test("mounts the production media viewer with safe generation details and loaded-row controls", async () => {
    const prompt = '<img src=x onerror="steal()"> Keep this literal';
    const epochMs = 1_775_000_000_000;
    const subCent = { ...runObject, ref: { type: "run-object" as const, id: "run-object-cost" }, runId: "run-cost", purpose: "sub-cent" };
    const next = { ...runObject, ref: { type: "run-object" as const, id: "run-object-2" }, runId: "run-2", purpose: "second" };
    const object: MediaCardDto = { ref: { type: "object", id: "object-1" }, workspaceId: "workspace-1", projectId: "project-1", storageClass: "final", mime: "image/png", bytes: 20, createdAt: 1, referenceCount: 1, target: { type: "object", id: "object-1" } };
    const generation: MediaGenerationDetailDto = {
      status: "generation",
      target: { type: "run-object", id: "run-object-1" },
      run: { id: "run-1", workspaceId: "workspace-1", projectId: "project-1", agentSessionId: null, kind: "generation", label: "Hero", state: "succeeded", createdAt: epochMs, startedAt: epochMs + 2, endedAt: epochMs + 4 },
      attempts: { items: [
        { id: "attempt-1", runId: "run-1", attemptNo: 1, provider: "fal", model: "flux-pro", state: "succeeded", costUsd: 1.25, startedAt: epochMs + 2, endedAt: epochMs + 4, input: { version: 1, texts: [{ role: "prompt", value: prompt, truncated: false }], parameters: [{ name: "aspectRatio", value: "16:9" }] } },
        { id: "attempt-2", runId: "run-1", attemptNo: 2, provider: null, model: null, state: "failed", costUsd: null, startedAt: epochMs + 5, endedAt: null, input: null },
        { id: "attempt-3", runId: "run-1", attemptNo: 3, provider: "fal", model: "cached", state: "succeeded", costUsd: 0, startedAt: epochMs + 6, endedAt: epochMs + 6, input: null },
      ], nextCursor: null },
      cost: { knownUsd: 1.25, complete: false },
    };
    const completeSubCent: MediaGenerationDetailDto = {
      ...generation,
      target: { type: "run-object", id: "run-object-cost" },
      run: { ...generation.run, id: "run-cost", createdAt: 1, startedAt: 2, endedAt: 4 },
      attempts: { items: [], nextCursor: null },
      cost: { knownUsd: 0.0049, complete: true },
    };
    const api = {
      ...projectApi(),
      loadProjectPage: vi.fn(async () => ({ items: [runObject, subCent, next, object], nextCursor: "not-loaded" })),
      resolveProjectPreview: vi.fn(async () => ({ url: "ralphy-media://asset/viewer", sizeBytes: 128 })),
      loadProjectGeneration: vi.fn(async (_project: unknown, target: MediaGenerationDetailDto["target"]) => target.id === "run-object-1" ? generation : target.id === "run-object-cost" ? completeSubCent : ({ status: "not-generation", target, producer: { id: "run-2", workspaceId: "workspace-1", projectId: "project-1", agentSessionId: null, kind: "import", label: null, state: "succeeded", createdAt: 1, startedAt: 1, endedAt: 2 } } as const)),
    };
    const controller = createProjectScreenController(api as never, project);
    await controller.selectTab("media");
    const previewSpy = vi.spyOn(bridge, "resolveProjectPreview").mockResolvedValue(null);
    const copySpy = vi.spyOn(bridge, "copyText").mockRejectedValueOnce(new Error("Clipboard denied")).mockResolvedValue();
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject controller={controller} />); await Promise.resolve(); });
      const opener = button(host.container, "diagnostic log");
      opener.focus();
      await act(async () => { opener.dispatchEvent(new Event("click", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });

      expect(controller.getSnapshot().mediaViewerOpen).toBe(true);
      const body = globalThis.document.body as unknown as HostNode;
      const dialog = body.findAll((node) => node.getAttribute("role") === "dialog")[0];
      expect(dialog).toBeDefined();
      expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
      expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
      expect(dialog.textContent).toContain("Generation");
      expect(dialog.textContent).toContain("fal");
      expect(dialog.textContent).toContain("flux-pro");
      expect(dialog.textContent).toContain("$1.25 · Partial");
      expect(dialog.textContent).toContain("$0.00");
      expect(dialog.textContent).toContain("2 ms");
      expect(dialog.textContent).toContain("Not recorded");
      expect(dialog.textContent).toContain(prompt);
      expect(dialog.findAll((node) => node.tagName === "IMG")).toHaveLength(0);
      expect(button(dialog, "Previous").disabled).toBe(true);
      expect(button(dialog, "Next").disabled).toBe(false);
      expect(api.loadProjectPage).toHaveBeenCalledOnce();

      await act(async () => { button(dialog, "Copy prompt").dispatchEvent(new Event("click", { bubbles: true })); await Promise.resolve(); });
      expect(copySpy).toHaveBeenCalledWith(prompt);
      expect(dialog.findAll((node) => node.getAttribute("role") === "alert").map((node) => node.textContent)).toContain("Clipboard denied");
      await act(async () => { button(dialog, "Copy prompt").dispatchEvent(new Event("click", { bubbles: true })); await Promise.resolve(); });
      expect(dialog.findAll((node) => node.getAttribute("role") === "alert")).toHaveLength(0);
      expect(copySpy).toHaveBeenCalledTimes(2);

      for (const [tag, attribute, value, nested] of [
        ["input", null, null, false], ["textarea", null, null, false],
        ["div", "contenteditable", "true", true], ["div", "contenteditable", "", true],
        ["div", "contenteditable", "plaintext-only", true], ["div", "role", "slider", true],
      ] as const) {
        const field = globalThis.document.createElement(tag) as unknown as HostNode;
        if (attribute) field.setAttribute(attribute, value ?? "");
        const focused = nested ? globalThis.document.createElement("span") as unknown as HostNode : field;
        if (nested) field.appendChild(focused);
        dialog.appendChild(field);
        focused.focus();
        await act(async () => { keydown(globalThis.window, "ArrowRight"); await Promise.resolve(); });
        expect(controller.getSnapshot().selectedMedia).toEqual(runObject);
      }

      for (const modifier of ["metaKey", "ctrlKey", "altKey", "shiftKey"] as const) {
        dialog.focus();
        await act(async () => { keydown(globalThis.window, "ArrowRight", { [modifier]: true }); await Promise.resolve(); });
        expect(controller.getSnapshot().selectedMedia).toEqual(runObject);
      }

      const editableFalse = globalThis.document.createElement("div") as unknown as HostNode;
      editableFalse.setAttribute("contenteditable", "false");
      const falseChild = globalThis.document.createElement("span") as unknown as HostNode;
      editableFalse.appendChild(falseChild);
      dialog.appendChild(editableFalse);
      falseChild.focus();
      await act(async () => { keydown(globalThis.window, "ArrowRight"); await Promise.resolve(); });
      expect(controller.getSnapshot().selectedMedia).toEqual(subCent);
      await act(async () => { await controller.navigateMediaViewer(-1); });

      const surface = dialog;
      surface.focus();
      await act(async () => { keydown(globalThis.window, "ArrowRight"); await Promise.resolve(); });
      expect(controller.getSnapshot().selectedMedia).toEqual(subCent);
      expect((globalThis.document.body as unknown as HostNode).textContent).toContain("$0.0049 · Complete");
      expect((globalThis.document.body as unknown as HostNode).textContent).toContain("2 ms");
      await act(async () => { keydown(globalThis.window, "ArrowRight"); await Promise.resolve(); });
      expect(controller.getSnapshot().selectedMedia).toEqual(next);
      expect((globalThis.document.body as unknown as HostNode).textContent).toContain("Not a generation");
      await act(async () => { keydown(globalThis.window, "ArrowRight"); await Promise.resolve(); });
      expect(controller.getSnapshot().selectedMedia).toEqual(object);
      expect((globalThis.document.body as unknown as HostNode).querySelector(".asset-modal-inspector")).toBeNull();
      expect(api.loadProjectGeneration).toHaveBeenCalledTimes(5);
      expect(api.loadProjectPage).toHaveBeenCalledOnce();

      await act(async () => { keydown(globalThis.document, "Escape"); await new Promise((resolve) => setTimeout(resolve, 32)); });
      expect(controller.getSnapshot().mediaViewerOpen).toBe(false);
      expect(globalThis.document.activeElement).toBe(opener);
    } finally {
      await act(async () => { root.unmount(); await new Promise((resolve) => setTimeout(resolve, 0)); });
      previewSpy.mockRestore();
      copySpy.mockRestore();
      host.restore();
    }
  });

  test("shows a styled Prompt Not recorded fallback for null and primary-less generation inputs", async () => {
    const generation: MediaGenerationDetailDto = {
      status: "generation",
      target: { type: "run-object", id: "run-object-1" },
      run: { id: "run-1", workspaceId: "workspace-1", projectId: "project-1", agentSessionId: null, kind: "generation", label: null, state: "succeeded", createdAt: 1_775_000_000_000, startedAt: 1_775_000_000_001, endedAt: 1_775_000_000_002 },
      attempts: {
        items: [
          { id: "attempt-null", runId: "run-1", attemptNo: 1, provider: "fal", model: "model", state: "succeeded", costUsd: 0, startedAt: 1_775_000_000_001, endedAt: 1_775_000_000_002, input: null },
          { id: "attempt-empty", runId: "run-1", attemptNo: 2, provider: "fal", model: "model", state: "succeeded", costUsd: 0, startedAt: 1_775_000_000_001, endedAt: 1_775_000_000_002, input: { version: 1, texts: [], parameters: [] } },
          { id: "attempt-negative", runId: "run-1", attemptNo: 3, provider: "fal", model: "model", state: "succeeded", costUsd: 0, startedAt: 1_775_000_000_001, endedAt: 1_775_000_000_002, input: { version: 1, texts: [{ role: "negative-prompt", value: "No logos", truncated: false }], parameters: [{ name: "aspectRatio", value: "9:16" }] } },
          { id: "attempt-recorded", runId: "run-1", attemptNo: 4, provider: "fal", model: "model", state: "succeeded", costUsd: 0, startedAt: 1_775_000_000_001, endedAt: 1_775_000_000_002, input: { version: 1, texts: [{ role: "prompt", value: "<b>Literal prompt</b>", truncated: false }, { role: "text", value: "Exact voiceover", truncated: false }, { role: "negative-prompt", value: "No watermark", truncated: false }], parameters: [{ name: "aspectRatio", value: "16:9" }] } },
          { id: "attempt-text", runId: "run-1", attemptNo: 5, provider: "fal", model: "model", state: "succeeded", costUsd: 0, startedAt: 1_775_000_000_001, endedAt: 1_775_000_000_002, input: { version: 1, texts: [{ role: "text", value: "Text-only primary", truncated: false }], parameters: [] } },
        ],
        nextCursor: null,
      },
      cost: { knownUsd: 0, complete: true },
    };
    const api = {
      ...projectApi(),
      loadProjectGeneration: vi.fn(async () => generation),
      resolveProjectPreview: vi.fn(async () => null),
    };
    const controller = createProjectScreenController(api, project);
    await controller.selectTab("media");
    const tilePreview = vi.spyOn(bridge, "resolveProjectPreview").mockResolvedValue(null);
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject controller={controller} />); await Promise.resolve(); });
      await act(async () => { button(host.container, "diagnostic log").dispatchEvent(new Event("click", { bubbles: true })); await Promise.resolve(); });
      const dialog = (globalThis.document.body as unknown as HostNode).findAll((node) => node.getAttribute("role") === "dialog")[0];
      const attempts = dialog.findAll((node) => node.getAttribute("class") === "generation-attempt");
      const attempt = (number: number) => attempts.find((node) => node.textContent.startsWith(`Attempt ${number}`))!;
      const promptFallbacks = (number: number) => attempt(number).findAll((node) => (
        node.getAttribute("class") === "generation-text" && node.textContent === "PromptNot recorded"
      ));

      expect(promptFallbacks(1)).toHaveLength(1);
      expect(promptFallbacks(2)).toHaveLength(1);
      expect(promptFallbacks(3)).toHaveLength(1);
      expect(attempt(3).textContent).toContain("Negative promptNo logos");
      expect(attempt(3).textContent).toContain("aspectRatio9:16");
      expect(promptFallbacks(4)).toHaveLength(0);
      expect(attempt(4).textContent).toContain("Prompt<b>Literal prompt</b>");
      expect(attempt(4).textContent).toContain("TextExact voiceover");
      expect(attempt(4).textContent).toContain("Negative promptNo watermark");
      expect(attempt(4).textContent).toContain("aspectRatio16:9");
      expect(promptFallbacks(5)).toHaveLength(0);
      expect(attempt(5).textContent).toContain("TextText-only primary");
      expect(dialog.findAll((node) => node.tagName === "B")).toHaveLength(0);
    } finally {
      if (controller.getSnapshot().mediaViewerOpen) {
        await act(async () => { keydown(globalThis.document, "Escape"); await new Promise((resolve) => setTimeout(resolve, 32)); });
      }
      await act(async () => { root.unmount(); await new Promise((resolve) => setTimeout(resolve, 0)); });
      tilePreview.mockRestore();
      host.restore();
    }
  });

  test("shows independent viewer loading and generation Retry without reloading preview", async () => {
    let resolvePreview!: (value: { url: string; sizeBytes: number }) => void;
    let rejectGeneration!: (error: Error) => void;
    const preview = new Promise<{ url: string; sizeBytes: number }>((resolve) => { resolvePreview = resolve; });
    const generation = new Promise<MediaGenerationDetailDto>((_resolve, reject) => { rejectGeneration = reject; });
    const api = {
      ...projectApi(),
      loadProjectPage: vi.fn(async () => ({ items: [runObject], nextCursor: null })),
      resolveProjectPreview: vi.fn(() => preview),
      loadProjectGeneration: vi.fn().mockReturnValueOnce(generation).mockResolvedValueOnce({ status: "unknown", target: { type: "run-object", id: "run-object-1" }, reason: "not-recorded" }),
    };
    const controller = createProjectScreenController(api as never, project);
    await controller.selectTab("media");
    const tilePreview = vi.spyOn(bridge, "resolveProjectPreview").mockResolvedValue(null);
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject controller={controller} />); await Promise.resolve(); });
      await act(async () => { button(host.container, "diagnostic log").dispatchEvent(new Event("click", { bubbles: true })); await Promise.resolve(); });
      const body = globalThis.document.body as unknown as HostNode;
      expect(body.findAll((node) => node.getAttribute("role") === "status").map((node) => node.textContent)).toEqual(expect.arrayContaining(["Loading preview…", "Loading generation details…"]));

      resolvePreview({ url: "ralphy-media://asset/ready", sizeBytes: 128 });
      rejectGeneration(new Error("Offline"));
      await act(async () => { await Promise.allSettled([preview, generation]); });
      expect(body.findAll((node) => node.getAttribute("role") === "alert").map((node) => node.textContent)).toContain("OfflineRetry");

      await act(async () => { textButton(body, "Retry").dispatchEvent(new Event("click", { bubbles: true })); await Promise.resolve(); });
      expect(body.textContent).toContain("Provenance unavailable");
      expect(api.resolveProjectPreview).toHaveBeenCalledOnce();
      expect(api.loadProjectGeneration).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => { root.unmount(); await new Promise((resolve) => setTimeout(resolve, 0)); });
      tilePreview.mockRestore();
      host.restore();
    }
  });

  test("restores focus to the stable media search field after filtering removes the opener", async () => {
    const api = {
      ...projectApi(),
      loadProjectPage: vi.fn(async ({ mediaQuery }: { mediaQuery?: { filter: string } }) => ({ items: mediaQuery?.filter === "references" ? [] : [runObject], nextCursor: null })),
    };
    const controller = createProjectScreenController(api as never, project);
    await controller.selectTab("media");
    const tilePreview = vi.spyOn(bridge, "resolveProjectPreview").mockResolvedValue(null);
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject controller={controller} />); await Promise.resolve(); });
      const opener = button(host.container, "diagnostic log");
      opener.focus();
      await act(async () => { opener.dispatchEvent(new Event("click", { bubbles: true })); await Promise.resolve(); });
      const dialog = (globalThis.document.body as unknown as HostNode).findAll((node) => node.getAttribute("role") === "dialog")[0];
      expect(globalThis.document.activeElement).toBe(dialog);

      await act(async () => { await controller.setMediaQuery({ filter: "references" }); await new Promise((resolve) => setTimeout(resolve, 0)); });

      const mediaTab = host.container.findAll((node) => node.getAttribute("data-media-focus-fallback") === "true")[0];
      expect(mediaTab).toBeDefined();
      expect(globalThis.document.activeElement).toBe(mediaTab);
      expect((globalThis.document.activeElement as unknown as HostNode).isConnected).toBe(true);
      expect(globalThis.document.activeElement).not.toBe(globalThis.document.body);
    } finally {
      await act(async () => { root.unmount(); await Promise.resolve(); });
      tilePreview.mockRestore();
      host.restore();
    }
  });

  test("restores focus to the replacement media search field when an open viewer controller is disposed", async () => {
    const first = createProjectScreenController(projectApi(), project);
    await first.selectTab("media");
    const replacement = createProjectScreenController(projectApi(), project);
    await replacement.start();
    const tilePreview = vi.spyOn(bridge, "resolveProjectPreview").mockResolvedValue(null);
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject key="root-1" controller={first} />); await Promise.resolve(); });
      const opener = button(host.container, "diagnostic log");
      opener.focus();
      await act(async () => { opener.dispatchEvent(new Event("click", { bubbles: true })); await Promise.resolve(); });
      const removedDialog = (globalThis.document.body as unknown as HostNode).findAll((node) => node.getAttribute("role") === "dialog")[0];
      expect(globalThis.document.activeElement).toBe(removedDialog);

      first.dispose();
      await act(async () => { root.render(<MountedProject key="root-2" controller={replacement} />); await new Promise((resolve) => setTimeout(resolve, 0)); });

      const mediaTab = host.container.findAll((node) => node.getAttribute("data-media-focus-fallback") === "true")[0];
      expect(globalThis.document.activeElement).toBe(mediaTab);
      expect((globalThis.document.activeElement as unknown as HostNode).isConnected).toBe(true);
      expect(globalThis.document.activeElement).not.toBe(removedDialog);
      expect(globalThis.document.activeElement).not.toBe(globalThis.document.body);
    } finally {
      await act(async () => { root.unmount(); await Promise.resolve(); });
      replacement.dispose();
      tilePreview.mockRestore();
      host.restore();
    }
  });

  test("opens the current Artifact file without a revision chooser", async () => {
    const api = {
      ...projectApi(),
      loadProjectPage: vi.fn(async () => ({ items: [card], nextCursor: "more" })),
      loadProjectMediaRevisions: vi.fn(async () => ({ items: [], nextCursor: null })),
      selectProjectMediaRevision: vi.fn(async () => card),
      resolveProjectPreview: vi.fn(async () => ({ url: "ralphy-media://asset/hero", sizeBytes: 2048 })),
      loadProjectGeneration: vi.fn(async (_project: unknown, target: MediaGenerationDetailDto["target"]) => ({ status: "unknown" as const, target, reason: "not-recorded" as const })),
    };
    const controller = createProjectScreenController(api as never, project);
    await controller.selectTab("media");
    const tilePreview = vi.spyOn(bridge, "resolveProjectPreview").mockResolvedValue(null);
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject controller={controller} />); await Promise.resolve(); });
      await act(async () => { button(host.container, "Campaign hero").dispatchEvent(new Event("click", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
      const body = globalThis.document.body as unknown as HostNode;
      const image = body.findAll((node) => node.tagName === "IMG" && node.getAttribute("alt") === "Campaign hero")[0];
      expect(image.getAttribute("src")).toBe("ralphy-media://asset/hero");
      expect(body.textContent).not.toContain("Select a revision");
      expect(api.loadProjectMediaRevisions).not.toHaveBeenCalled();
      expect(api.selectProjectMediaRevision).not.toHaveBeenCalled();
    } finally {
      await act(async () => { root.unmount(); await new Promise((resolve) => setTimeout(resolve, 0)); });
      tilePreview.mockRestore();
      host.restore();
    }
  });
});
