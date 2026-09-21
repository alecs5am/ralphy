import { act, useSyncExternalStore } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";

import type { UnitDto, UnitRevisionDto } from "../electron/ralphy/types";
import type { ProjectSummary } from "@/shared/api/ipc";
import { bridge } from "@/shared/api/ipc";
import * as screen from "@/pages/project";
import { UnitSocialPreview } from "@/pages/project";
import type { SocialTarget, UnitMedia } from "@/entities/unit";
import { createReactHost, type HostNode } from "./react-host";
import { WINDOW_CLOSE } from "@/shared/ui/Window";

// The project workbench has no stylesheet of its own any more, so these contracts are read
// where they now live: the theme file that names each role key and the component that reads it.
const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const projectTheme = source("src/app/styles/theme/project.css");
const projectScreen = source("src/pages/project/ui/ProjectScreen.tsx");
const unitsPanel = source("src/pages/project/ui/UnitsPanel.tsx");
const unitViewer = source("src/pages/project/ui/UnitViewer.tsx");
const unitSocial = source("src/pages/project/ui/UnitSocialPreview.tsx");
const phoneMockup = source("src/shared/ui/IPhoneMockup.tsx");

const project: ProjectSummary = {
  id: "project-1", workspaceId: "workspace-1", projectId: "project-1", name: "Launch", brief: "Brief",
  status: "active", phase: "production", finalState: "working", platform: null, aspectRatio: null,
  spendUsd: null, finalCount: 0, sharedCount: 0, unitCount: 60, recentActivity: "2026-08-11T00:00:00.000Z",
};

const unit = (index: number): UnitDto => ({
  id: `unit-${index}`, workspaceId: "workspace-1", projectId: "project-1", compositionId: null, slug: `Unit ${index}`,
  format: "9:16", selectedRevisionId: `revision-${index}-2`, latestRevisionId: `revision-${index}-3`,
  createdAt: 1, updatedAt: 2,
});
const revision = (id: string, revisionNo: number, sealedAt: number | null = 2): UnitRevisionDto => ({
  id, unitId: "unit-1", compositionRevisionId: null, revisionNo, parentRevisionId: revisionNo > 1 ? `revision-1-${revisionNo - 1}` : null,
  iterationId: "iteration-1", note: null, authoredBySessionId: "session-1", createdAt: revisionNo, sealedAt,
});

function createApi() {
  const units = Array.from({ length: 60 }, (_, index) => unit(index));
  return {
    loadProjectPage: vi.fn(async ({ cursor }: { cursor?: string }) => cursor
      ? { items: [unit(60)], nextCursor: null }
      : { items: units, nextCursor: "units-next" }),
    loadProjectUnit: vi.fn(async (_project: unknown, unitId: string) => units.find(({ id }) => id === unitId)!),
    loadProjectUnitRevision: vi.fn(async (_project: unknown, _unitId: string, revisionId: string) => {
      const no = Number(revisionId.at(-1));
      return revision(revisionId, no, no === 4 ? null : no);
    }),
    loadProjectUnitPage: vi.fn(async (_project: unknown, request: { kind: string; cursor?: string }) => {
      if (request.kind === "revisions") return request.cursor
        ? { items: [revision("revision-1-1", 1)], nextCursor: null }
        : { items: [revision("revision-1-4", 4, null), revision("revision-1-3", 3)], nextCursor: "revisions-next" };
      if (request.kind === "items") return request.cursor
        ? { items: [{ id: "item-2", unitRevisionId: "revision-1-2", artifactRevisionId: null, documentRevisionId: "document-revision-2", role: "caption", position: 2, config: { trim: true }, createdAt: 2 }], nextCursor: null }
        : { items: [{ id: "item-1", unitRevisionId: "revision-1-2", artifactRevisionId: "artifact-revision-1", documentRevisionId: null, role: "visual", position: 1, config: null, createdAt: 1 }], nextCursor: "items-next" };
      return request.cursor
        ? { items: [{ id: "presentation-2", unitRevisionId: "revision-1-2", platform: "youtube", position: 2, effectiveCaptionRevisionId: null, coverArtifactRevisionId: null, crop: null, safeArea: null, options: {}, createdAt: 2 }], nextCursor: null }
        : { items: [{ id: "presentation-1", unitRevisionId: "revision-1-2", platform: "tiktok", position: 1, effectiveCaptionRevisionId: "caption-1", coverArtifactRevisionId: "cover-1", crop: { x: 0 }, safeArea: { top: 10 }, options: { loop: false }, createdAt: 1 }], nextCursor: "presentations-next" };
    }),
    selectProjectUnitRevision: vi.fn(async (_project: unknown, _unitId: string, revisionId: string) => ({ ...unit(1), selectedRevisionId: revisionId })),
    resolveCompositionOutputPreview: vi.fn(async (_project: unknown, revisionId: string) => ({ url: `ralphy-media://asset/${revisionId}`, sizeBytes: 12, mime: revisionId === "cover-1" ? "image/png" : "video/mp4" })),
    loadDocumentPreview: vi.fn(async (_project: unknown, revisionId: string) => ({ revisionId, format: "markdown", text: "# Script", truncated: false })),
    loadProjectUnitPreview: vi.fn(),
    reviseProjectUnit: vi.fn(),
    loadProjectComposition: vi.fn(),
    loadProjectCompositionRevision: vi.fn(),
    loadProjectCompositionBuild: vi.fn(),
    loadProjectCompositionPage: vi.fn(),
    reviseProjectComposition: vi.fn(),
    selectProjectCompositionRevision: vi.fn(),
    buildProjectComposition: vi.fn(),
  };
}

function MountedProject({ controller, memory, targetUnitId, onTargetUnitOpened }: { controller: any; memory: Map<string, number>; targetUnitId?: string | null; onTargetUnitOpened?(): void }) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const View = screen.ProjectScreenView as React.ComponentType<any>;
  return <View project={project} rootEpoch={1} controller={controller} snapshot={snapshot} unitsScrollMemory={memory} targetUnitId={targetUnitId} onTargetUnitOpened={onTargetUnitOpened} />;
}

function button(root: HostNode, text: string): HostNode {
  const found = root.findAll((node) => node.tagName === "BUTTON" && node.textContent.includes(text))[0];
  if (!found) throw new Error(`Missing ${text} button`);
  return found;
}

async function click(node: HostNode): Promise<void> {
  await act(async () => {
    node.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("units workbench", () => {
  test("refreshes an open Unit after activity, following latest or preserving an older choice", async () => {
    const api = createApi();
    const controller = screen.createProjectScreenController(api as any, project);
    await controller.openUnit("unit-1");
    await controller.inspectUnitRevision("revision-1-3");
    api.loadProjectUnit.mockResolvedValue({ ...unit(1), latestRevisionId: "revision-1-4" });
    await controller.refresh(1);
    expect(controller.getSnapshot().unit.value?.latestRevisionId).toBe("revision-1-4");
    expect(controller.getSnapshot().inspectedUnitRevisionId).toBe("revision-1-4");
    await controller.inspectUnitRevision("revision-1-2");
    api.loadProjectUnit.mockResolvedValue({ ...unit(1), latestRevisionId: "revision-1-5" });
    await controller.refresh(2);
    expect(controller.getSnapshot().unit.value?.latestRevisionId).toBe("revision-1-5");
    expect(controller.getSnapshot().inspectedUnitRevisionId).toBe("revision-1-2");
    controller.dispose();
  });

  test("embeds the same Unit viewer inside its host without a modal or blocking the chat", async () => {
    const api = createApi();
    api.loadProjectUnit.mockImplementation(async () => ({ ...unit(1), sourceRevisionId: "revision-1-1", sourceLabel: "Uploaded file" }));
    api.loadProjectPage.mockResolvedValue({ items: [{ ...unit(1), sourceRevisionId: "revision-1-1", sourceLabel: "Uploaded file" }], nextCursor: null } as never);
    const controller = screen.createProjectScreenController(api as any, project);
    await controller.start();
    await controller.openUnit("unit-1");
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    const close = vi.fn();
    try {
      await act(async () => root.render(<screen.UnitViewer embedded open controller={controller} snapshot={controller.getSnapshot()} returnFocus={null} onOpenChange={close} />));
      expect(host.container.querySelector(".unit-viewer")).not.toBeNull();
      expect(document.body.querySelector(".unit-viewer-overlay")).toBeNull();
      expect(document.body.querySelector('[role="dialog"]')).toBeNull();
      expect(controller.getSnapshot().unit.value?.sourceRevisionId).toBe("revision-1-1");
      expect(host.container.querySelector(".unit-original-revision")).not.toBeNull();
      expect(host.container.querySelector(".unit-original-revision")!.getAttribute("class")).not.toContain("ring-brand");
      expect(host.container.findAll((node) => node.getAttribute("role") === "option" && node.getAttribute("aria-selected") === "true")).toHaveLength(1);
      expect(host.container.findAll((node) => node.getAttribute("aria-label") === "View revision 1")).toHaveLength(0);
      await click(host.container.findAll((node) => node.getAttribute("aria-label") === "View revision 0")[0]!);
      expect(host.container.querySelector(".unit-viewer-state")?.textContent).toBe("R0 · Original");
      expect(host.container.querySelector(".unit-source-preview")?.textContent).toContain("Uploaded file");
      expect(host.container.querySelector(".unit-original-revision")!.getAttribute("class")).toContain("is-viewing");
      expect(host.container.findAll((node) => node.getAttribute("role") === "option" && node.getAttribute("aria-selected") === "true")).toHaveLength(1);
      expect(host.container.querySelector(".unit-primary-action")).toBeNull();
      expect(api.selectProjectUnitRevision).not.toHaveBeenCalled();
      await click(host.container.findAll((node) => node.getAttribute("aria-label") === "View revision 3")[0]!);
      expect(host.container.querySelector(".unit-source-preview")).toBeNull();

      expect(host.container.querySelector(".iphone-mockup")).toBeNull();
      expect(host.container.querySelector(".unit-viewer-meta")).toBeNull();
      const pageCalls = api.loadProjectUnitPage.mock.calls.length;
      await click(host.container.findAll((node) => node.getAttribute("aria-label") === "Grid view")[0]!);
      expect(host.container.querySelector(".unit-viewer-main")).toBeNull();
      expect(host.container.querySelector(".unit-revision-browser")?.getAttribute("class")).toContain("is-grid");
      await click(host.container.findAll((node) => node.getAttribute("aria-label") === "Gallery view")[0]!);
      expect(api.loadProjectUnitPage.mock.calls.length).toBe(pageCalls);
      expect(api.selectProjectUnitRevision).not.toHaveBeenCalled();
      expect(host.container.querySelector(".unit-clean-preview")).not.toBeNull();
      expect(host.container.querySelector(".unit-preview-mode")).toBeNull();
      await controller.inspectUnitRevision("revision-1-3");
      await act(async () => root.render(<screen.UnitViewer embedded open controller={controller} snapshot={controller.getSnapshot()} returnFocus={null} onOpenChange={close} />));
      expect(host.container.querySelector(".iphone-mockup")).toBeNull();
      await click(button(host.container, "Device mockup"));
      expect(host.container.querySelector(".iphone-mockup")).not.toBeNull();
      await click(host.container.findAll((node) => node.getAttribute("aria-label") === "Close Unit preview")[0]!);
      expect(close).toHaveBeenCalledWith(false);
    } finally { await act(async () => root.unmount()); controller.dispose(); host.restore(); }
  });

  test("does not duplicate a presentation image as its own cover slide", async () => {
    const api = createApi();
    api.loadProjectUnit.mockImplementation(async () => ({ ...unit(1), format: "image" }));
    api.loadProjectUnitPage.mockImplementation(async (_project, request): Promise<any> => ({ items: request.kind === "items"
      ? [{ id: "image", unitRevisionId: "revision-1-2", artifactRevisionId: "image-rev", documentRevisionId: null, role: "primary", position: 0, config: null, createdAt: 1 }]
      : request.kind === "presentations" ? [{ id: "presentation", unitRevisionId: "revision-1-2", platform: "instagram", position: 0, effectiveCaptionRevisionId: null, coverArtifactRevisionId: "image-rev", crop: null, safeArea: null, options: {}, createdAt: 1 }]
        : [revision("revision-1-2", 2)], nextCursor: null }));
    const preview = { url: "ralphy-media://asset/image", sizeBytes: 12, mime: "image/png" };
    api.resolveCompositionOutputPreview.mockResolvedValue(preview);
    const mediaSpy = vi.spyOn(bridge, "resolveCompositionOutputPreview").mockResolvedValue(preview);
    const metadataSpy = vi.spyOn(bridge, "loadProjectUnitPreview").mockResolvedValue({ unitRevisionId: "revision-1-2", platform: "instagram", presentation: { caption: "", unitItemIds: ["image"] } });
    const controller = screen.createProjectScreenController(api as any, project);
    await controller.selectTab("units");
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject controller={controller} memory={new Map()} targetUnitId="unit-1" />); });
      await vi.waitFor(() => expect(document.body.querySelectorAll(".unit-clean-preview img")).toHaveLength(1));
      expect(document.body.querySelector(".unit-stage-slide-count")).toBeNull();
    } finally {
      await act(async () => { root.unmount(); });
      controller.dispose(); host.restore(); mediaSpy.mockRestore(); metadataSpy.mockRestore();
    }
  });

  test("consumes a chat navigation request so remounting does not reopen the closed viewer", async () => {
    const controller = screen.createProjectScreenController(createApi() as any, project);
    await controller.selectTab("units");
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    let targetUnitId: string | null = "unit-1";
    const onTargetUnitOpened = vi.fn(() => { targetUnitId = null; });
    const render = () => <MountedProject controller={controller} memory={new Map()} targetUnitId={targetUnitId} onTargetUnitOpened={onTargetUnitOpened} />;
    try {
      await act(async () => { root.render(render()); });
      expect(onTargetUnitOpened).toHaveBeenCalledOnce();
      const viewer = document.body.querySelector(".unit-viewer")! as unknown as HostNode;
      await click(viewer.findAll((node) => node.getAttribute("aria-label") === "Close Unit preview")[0]!);
      expect(document.body.querySelector(".unit-viewer")).toBeNull();
      await act(async () => { root.render(null); });
      await act(async () => { root.render(render()); });
      expect(document.body.querySelector(".unit-viewer")).toBeNull();
      expect(onTargetUnitOpened).toHaveBeenCalledOnce();
    } finally {
      await act(async () => { root.unmount(); });
      controller.dispose(); host.restore();
    }
  });

  test("opens a Unit card in the social-preview modal with revision selection", async () => {
    const previewSpy = vi.spyOn(bridge, "resolveCompositionOutputPreview").mockResolvedValue({ url: "ralphy-media://asset/video-1", sizeBytes: 12, mime: "video/mp4" });
    const api = createApi();
    const controller = screen.createProjectScreenController(api as any, project);
    await controller.selectTab("units");
    const memory = new Map<string, number>();
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);

    try {
      await act(async () => { root.render(<MountedProject controller={controller} memory={memory} />); await Promise.resolve(); });
      const grid = host.container.querySelector(".units-grid-scroll")!;
      expect(grid.getAttribute("role")).toBe("region");
      expect(grid.querySelectorAll(".unit-card")).toHaveLength(60);
      expect(host.container.findAll((node) => node.getAttribute("aria-label") === "Unit status filter")[0]).toBeDefined();
      expect(host.container.findAll((node) => node.getAttribute("aria-label") === "Search units")[0]).toBeDefined();
      expect(host.container.textContent).not.toContain("New unit");
      expect(document.body.querySelector(".unit-viewer")).toBeNull();

      grid.scrollTop = 280;
      await act(async () => { grid.dispatchEvent(new Event("scroll")); });
      const card = button(grid, "Unit 1");
      await click(card);

      await vi.waitFor(() => expect(controller.getSnapshot().unitId).toBe("unit-1"));
      await vi.waitFor(() => expect(document.body.querySelector(".unit-viewer")).not.toBeNull());
      const viewer = document.body.querySelector(".unit-viewer")! as unknown as HostNode;
      expect(viewer.querySelector(".iphone-mockup")).toBeNull();
      expect(viewer.querySelector(".unit-viewer-meta")).toBeNull();
      await click(button(viewer, "Device mockup"));
      expect(viewer.findAll((node) => node.getAttribute("aria-label") === "iPhone preview")[0]).toBeDefined();
      expect(viewer.findAll((node) => node.getAttribute("aria-label") === "Preview mode")[0]).toBeDefined();
      expect(viewer.findAll((node) => node.getAttribute("aria-label") === "Unit revisions list")[0]).toBeDefined();
      expect(grid.scrollTop).toBe(280);
      expect(memory).toEqual(new Map([["units-grid", 280]]));
      await vi.waitFor(() => {
        expect(viewer.findAll((node) => node.getAttribute("aria-label") === "Social platform")[0]).toBeDefined();
      });
      const socialTabs = viewer.findAll((node) => node.getAttribute("aria-label") === "Social platform")[0]!;
      expect(socialTabs.findAll((node) => node.tagName === "BUTTON")).toHaveLength(2);
      await vi.waitFor(() => {
        expect(controller.getSnapshot().unitRevisions.nextCursor).toBeNull();
        expect(controller.getSnapshot().unitRevisions.items.map(({ id }: UnitRevisionDto) => id)).toContain("revision-1-1");
      });
      await vi.waitFor(() => {
        expect(controller.getSnapshot().unitItems.items.map(({ id }: { id: string }) => id)).toEqual(["item-1", "item-2"]);
        expect(controller.getSnapshot().unitPresentations.items.map(({ id }: { id: string }) => id)).toEqual(["presentation-1", "presentation-2"]);
      });
      expect(controller.getSnapshot().unitItems.nextCursor).toBeNull();
      expect(controller.getSnapshot().unitPresentations.nextCursor).toBeNull();
      await vi.waitFor(() => {
        expect(controller.getSnapshot().unitPreview.artifactRevisionId).toBe("cover-1");
        expect(viewer.querySelector(".unit-social-media video")).not.toBeNull();
      });
      const platformTabs = socialTabs.findAll((node) => node.tagName === "BUTTON");
      expect(platformTabs.map((node) => node.textContent)).toEqual(["TikTok", "Shorts"]);
      await click(platformTabs[0]);
      expect(platformTabs[0].getAttribute("aria-pressed")).toBe("true");
      expect(viewer.findAll((node) => node.getAttribute("aria-label") === "tiktok preview")[0]).toBeDefined();

      const video = viewer.querySelector(".unit-social-media video")! as HostNode & {
        currentTime: number; duration: number; muted: boolean; paused: boolean;
        play(): Promise<void>; pause(): void;
      };
      const play = vi.fn(async () => { video.paused = false; video.dispatchEvent(new Event("play")); });
      const pause = vi.fn(() => { video.paused = true; video.dispatchEvent(new Event("pause")); });
      Object.assign(video, { currentTime: 4, duration: 24, muted: false, paused: true, play, pause });
      await act(async () => { video.dispatchEvent(new Event("loadedmetadata")); await Promise.resolve(); });

      await click(viewer.findAll((node) => node.getAttribute("aria-label") === "Play preview")[0]);
      expect(play).toHaveBeenCalledOnce();
      await click(viewer.findAll((node) => node.getAttribute("aria-label") === "Mute preview")[0]);
      expect(video.muted).toBe(true);
      const seek = viewer.findAll((node) => node.getAttribute("aria-label") === "Position in preview")[0];
      const positionBeforeSeek = video.currentTime;
      const right = new Event("keydown", { bubbles: true, cancelable: true });
      Object.defineProperty(right, "key", { value: "ArrowRight" });
      await act(async () => { seek.dispatchEvent(right); await Promise.resolve(); });
      expect(video.currentTime).toBeGreaterThan(positionBeforeSeek);
      expect(video.currentTime).toBeLessThanOrEqual(video.duration);

      await click(viewer.findAll((node) => node.getAttribute("aria-label") === "Close Unit preview")[0]!);
      await vi.waitFor(() => expect(document.body.querySelector(".unit-viewer")).toBeNull());
      expect(document.activeElement).toBe(card);
    } finally {
      await act(async () => root.unmount());
      previewSpy.mockRestore();
      host.restore();
    }
  });

  test("shows a creationless empty state", async () => {
    const api = createApi();
    api.loadProjectPage.mockResolvedValue({ items: [], nextCursor: null });
    const controller = screen.createProjectScreenController(api as any, project);
    await controller.selectTab("units");
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);

    try {
      await act(async () => { root.render(<MountedProject controller={controller} memory={new Map()} />); await Promise.resolve(); });
      expect(host.container.textContent).toContain("No units yet");
      expect(host.container.textContent).not.toContain("New unit");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("labels audio Unit cards as audio", async () => {
    const api = createApi();
    api.loadProjectPage.mockResolvedValue({ items: [{ ...unit(1), format: "audio" }], nextCursor: null });
    const controller = screen.createProjectScreenController(api as any, project);
    await controller.selectTab("units");
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);

    try {
      await act(async () => { root.render(<MountedProject controller={controller} memory={new Map()} />); await Promise.resolve(); });
      expect(host.container.querySelector(".unit-card-preview em")?.textContent).toBe("AUDIO");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("filters by every Unit format present in the workspace", async () => {
    const api = createApi();
    const formats = ["video", "sticker-pack", "custom-format", "long-form", "longform"];
    api.loadProjectPage.mockResolvedValue({
      items: formats.map((format, index) => ({ ...unit(index), slug: `${format} unit`, format })),
      nextCursor: null,
    });
    const controller = screen.createProjectScreenController(api as any, project);
    await controller.selectTab("units");
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);

    try {
      await act(async () => { root.render(<MountedProject controller={controller} memory={new Map()} />); await Promise.resolve(); });
      const typeFilter = host.container.findAll((node) => node.getAttribute("aria-label") === "Unit type filter")[0]!;
      expect(typeFilter).toBeDefined();
      expect(typeFilter.findAll((node) => node.tagName === "BUTTON").map((node) => node.textContent)).toEqual([
        "All", "Video", "Carousel", "Long-form", "Audio", "Image", "Post", "Thread", "Article", "FB creative", "Motion design", "Poster", "Sticker pack", "Custom format",
      ]);

      await click(button(typeFilter, "Sticker pack"));
      expect(host.container.querySelectorAll(".unit-card")).toHaveLength(1);
      expect(host.container.querySelector(".unit-card")?.textContent).toContain("sticker-pack unit");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("previews a document-backed Unit without a platform renderer", async () => {
    const api = createApi();
    api.loadProjectUnitPage.mockImplementation(async (_project: unknown, request: { kind: string }) => {
      if (request.kind === "revisions") return { items: [revision("revision-1-2", 2)], nextCursor: null };
      if (request.kind === "items") return { items: [{ id: "item-doc", unitRevisionId: "revision-1-2", artifactRevisionId: null, documentRevisionId: "document-revision-2", role: "body", position: 1, config: null, createdAt: 1 }], nextCursor: null };
      return { items: [], nextCursor: null };
    });
    const controller = screen.createProjectScreenController(api as any, project);

    await controller.selectTab("units");
    await controller.openUnit("unit-1");
    await vi.waitFor(() => expect(controller.getSnapshot().unitPreview.status).toBe("ready"));

    expect(api.loadDocumentPreview).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", projectId: "project-1" }, "document-revision-2",
    );
    expect(controller.getSnapshot().unitPreview.value).toMatchObject({ format: "markdown", text: "# Script" });
  });

  test("loads linked production inside the Unit and runs selection before final render", async () => {
    const api = createApi();
    const linkedUnit = { ...unit(1), compositionId: "composition-1", selectedRevisionId: null, latestRevisionId: "revision-1-1" };
    const linkedRevision = { ...revision("revision-1-1", 1), compositionRevisionId: "composition-revision-1" };
    const composition = { id: "composition-1", projectId: "project-1", slug: "launch-cut", kind: "video", latestRevisionId: "composition-revision-1", selectedRevisionId: null, createdAt: 1, updatedAt: 2 };
    const production = { id: "composition-revision-1", compositionId: composition.id, revisionNo: 1, parentRevisionId: null, iterationId: null, state: "draft", engine: "hyperframes", engineVersion: null, manifestSha256: null, authoredBySessionId: null, createdAt: 1, sealedAt: null };
    api.loadProjectPage.mockResolvedValue({ items: [linkedUnit], nextCursor: null });
    api.loadProjectUnit.mockResolvedValue(linkedUnit);
    api.loadProjectUnitPage.mockImplementation(async (_project: unknown, request: { kind: string }) => request.kind === "revisions" ? { items: [linkedRevision], nextCursor: null } : { items: [], nextCursor: null });
    api.selectProjectUnitRevision.mockResolvedValue({ ...linkedUnit, selectedRevisionId: linkedRevision.id });
    api.loadProjectComposition.mockResolvedValue(composition);
    api.loadProjectCompositionRevision.mockResolvedValue(production);
    api.loadProjectCompositionPage.mockImplementation(async (_project: unknown, request: { kind: string }) => request.kind === "revisions" ? { items: [production], nextCursor: null } : { items: [], nextCursor: null });
    api.buildProjectComposition.mockResolvedValue({ id: "build-1", compositionRevisionId: production.id, runId: "run-1", state: "succeeded", createdAt: 2, finishedAt: 3, outputs: [] });
    const controller = screen.createProjectScreenController(api as any, project);
    await controller.selectTab("units");
    await controller.openUnit(linkedUnit.id);
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);

    try {
      await act(async () => { root.render(<MountedProject controller={controller} memory={new Map()} />); await Promise.resolve(); });
      await click(button(host.container, linkedUnit.slug));
      await vi.waitFor(() => expect(document.body.querySelector(".unit-viewer")).not.toBeNull());
      const viewer = document.body.querySelector(".unit-viewer")! as unknown as HostNode;
      expect(viewer.textContent).not.toContain("Production details");
      await click(viewer.findAll((node) => node.getAttribute("aria-label") === "Content details")[0]!);
      await vi.waitFor(() => expect(viewer.textContent).toContain("Production details"));
      expect(viewer.textContent).toContain("In progress");
      await click(button(viewer, "Choose this version"));
      expect(api.selectProjectUnitRevision).toHaveBeenCalled();
      await vi.waitFor(() => expect(viewer.textContent).toContain("Render final"));
      await click(button(viewer, "Render final"));
      expect(api.buildProjectComposition).toHaveBeenCalledWith(
        { workspaceId: "workspace-1", projectId: "project-1" },
        production.id,
      );
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });

  test("keeps the card grid scrollable and the modal responsive", () => {
    // The panel is the locked outer frame and the grid scroll is the one scroll owner; both are
    // stated on the elements that own them.
    expect(projectScreen).toMatch(/project-domain-body[^`]*overflow-hidden/);
    expect(projectScreen).toContain("is-units pb-6");
    expect(unitsPanel).toMatch(/units-grid-scroll[^"]*overflow-auto/);
    // The column count is the grid's own decision: only the tile minimum is named.
    expect(projectTheme).toMatch(/--project-units-columns:\s*repeat\(auto-fill,\s*minmax\(268px,\s*1fr\)\)/);
    expect(unitsPanel).toContain("grid-cols-(--project-units-columns)");
    // The viewer's narrow form reads the viewer's own width, not the window: the desk is not the
    // window, so the 820px breakpoint is a container key now.
    expect(projectTheme).toMatch(/--container-project-viewer:\s*820px/);
    expect(unitViewer).toContain("@container/unit-viewer");
    expect(projectTheme).toContain("@container unit-viewer");
    expect(projectTheme).toContain("--unit-viewer-rail-width: 56px");
    expect(unitViewer).not.toMatch(/@(?:min|max)-\[/);
  });

  test("keeps Unit controls flat and centers the phone with its playback rail", () => {
    const reset = readFileSync(join(process.cwd(), "src/app/styles/reset.css"), "utf8");
    expect(reset).toMatch(/button\s*\{[^}]*background:\s*transparent/s);
    // Flat at rest: no plate under a control until it is hovered. The close is the kit's control
    // now -- a round chip that goes to the alarm under the cursor -- so the tone decision moved
    // with it, and this file only has to keep naming the element.
    expect(unitViewer).toContain('<WindowClose className="unit-viewer-close"');
    expect(WINDOW_CLOSE).toMatch(/rounded-full bg-chip text-muted .*hover:bg-alert/);
    // The stage centres the device on a ground of its own. It is a flex line rather than a
    // grid: a percentage max-height needs a definite track, and an auto grid row is not one,
    // so the phone grew past the column and the modal clipped it.
    expect(unitViewer).toMatch(/unit-social-stage[^`]*items-center justify-center[^`]*bg-transparent/);
    // Content cards share the product's vertical social frame.
    expect(unitsPanel).toMatch(/unit-card-preview[^"]*aspect-content[^"]*w-full/);
    expect(unitsPanel).not.toContain("aspect-auto");
    expect(unitsPanel).not.toMatch(/unit-card[^"]*hover:(?:translate|scale)/);
    // The media owns the available stage; details overlay it only when requested.
    expect(projectTheme).toContain("--unit-viewer-rail-width: 64px");
    expect(projectTheme).toContain(".unit-viewer-meta {");
    expect(projectTheme).toMatch(/\.unit-viewer-meta\s*\{[^}]*position: absolute/);
    expect(unitViewer).toContain("{detailsOpen && <aside");
    expect(unitViewer).not.toContain("LifecycleStepper");
    expect(unitsPanel).toMatch(/unit-card-status[^`]*justify-start/);
    expect(unitsPanel).toContain('retry ? "pr-14.5"');
    expect(unitViewer).toContain('PageHeaderMore label="Preview options"');
    expect(projectTheme).toMatch(/--spacing-iphone:\s*min\(100%, 316px\)/);
    // The device is sized by the height it is given and capped at its own natural size, so it
    // shrinks to fit a short stage and never stretches in a tall one. `max-h-full` cannot do
    // this: against an indeterminate track it resolves to none.
    expect(projectTheme).toMatch(/--spacing-iphone-height:\s*548px/);
    expect(phoneMockup).toMatch(/iphone-mockup[^`]*h-full max-h-iphone-height w-auto max-w-iphone/);
    // The transport stops at the same width, so it lines up under the device.
    expect(unitViewer).toMatch(/unit-playback grid w-full max-w-iphone/);
    expect(unitViewer).toMatch(/unit-playback-seek[^"]*cursor-pointer/);
    expect(unitSocial).toMatch(/unit-social-media relative aspect-content h-auto/);
  });

  test("renders platform-specific chrome for TikTok, Reels, and Shorts", async () => {
    const host = createReactHost();
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(host.container as unknown as Element);
    const media: UnitMedia[] = [{
      id: "video-1", role: "primary", position: 0, kind: "video",
      preview: { url: "ralphy-media://asset/video-1", sizeBytes: 1024, mime: "video/mp4" },
    }];
    const targets: SocialTarget[] = [
      { id: "tiktok-video", platform: "tiktok", variant: "video", label: "TikTok" },
      { id: "instagram-reels", platform: "instagram", variant: "reels", label: "Reels" },
      { id: "youtube-shorts", platform: "youtube", variant: "shorts", label: "Shorts" },
    ];

    try {
      const render = async (target: SocialTarget) => act(async () => {
        root.render(<UnitSocialPreview target={target} media={media} slug="launch" caption="Launch caption" />);
        await Promise.resolve();
      });

      await render(targets[0]);
      expect(host.container.textContent).toContain("FollowingFor You");
      expect(host.container.textContent).not.toContain("Subscribe");

      await render(targets[1]);
      expect(host.container.textContent).toContain("Reels");
      expect(host.container.textContent).toContain("Follow");
      expect(host.container.textContent).not.toContain("Dislike");

      await render(targets[2]);
      expect(host.container.textContent).toContain("Subscribe");
      expect(host.container.textContent).toContain("Dislike");
      expect(host.container.textContent).toContain("Remix");
    } finally {
      await act(async () => root.unmount());
      host.restore();
    }
  });
});
