import { renderToStaticMarkup } from "react-dom/server";
import { act, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, test, vi } from "vitest";
import type { MediaCardDto, MediaGenerationDetailDto, RunObjectMediaCardDto } from "../electron/ralphy/types";
import { VirtualAssetGrid, MediaCardTile } from "../src/components/VirtualAssetGrid";
import { AudioWaveform } from "../src/components/media/AudioWaveform";
import { ImageViewport } from "../src/components/media/ImageViewport";
import { VideoPlayer } from "../src/components/media/VideoPlayer";
import { ProjectScreenView, createProjectScreenController } from "../src/screens/ProjectScreen";
import { bridge, type ProjectSummary } from "../src/lib/ipc";
import { createReactHost, type HostNode } from "./react-host";

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
};

function projectApi() {
  return {
    loadProjectOverview: async () => ({ project: { id: "project-1", workspaceId: "workspace-1", slug: "launch", name: "Launch", purpose: null, state: "active", rowVersion: 1, createdAt: 1, updatedAt: 1 } }),
    loadProjectPage: async () => ({ items: [runObject], nextCursor: null }),
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
  test("keeps accessible image zoom, pan, and fit presentation", () => {
    const markup = renderToStaticMarkup(<ImageViewport src="ralphy-media://asset/image" name="Campaign hero" />);
    expect(markup).toContain('alt="Campaign hero"');
    expect(markup).toContain('aria-label="Zoom in"');
    expect(markup).toContain('aria-label="Fit image"');
  });

  test("keeps named video and audio custom controls", () => {
    const video = renderToStaticMarkup(<VideoPlayer src="ralphy-media://asset/video" name="Final cut" />);
    const audio = renderToStaticMarkup(<AudioWaveform src="ralphy-media://asset/audio" name="Voiceover" sizeBytes={2048} />);
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
    />);
    const grid = renderToStaticMarkup(<VirtualAssetGrid
      items={[card]}
      project={{ workspaceId: "workspace-1", projectId: "project-1" }}
      rootEpoch={7}
      selectedRef={card.ref}
      resolvePreview={async () => null}
      onSelect={() => undefined}
      onOpen={() => undefined}
    />);
    expect(tile).toContain('aria-label="Campaign hero, selected"');
    expect(tile).toContain('aria-label="Open Campaign hero"');
    expect(tile.match(/<button/g)).toHaveLength(2);
    expect(tile).toContain("aspect-ratio:16 / 10");
    expect(tile).toContain("Artifact · artifact-1");
    expect(tile).toContain("image/png · 2.0 KB · approved · cover");
    expect(grid).toContain("asset-grid-scroll");
  });

  test("renders only literal safe RunObject evidence and keeps the logical path inert", async () => {
    const controller = createProjectScreenController(projectApi(), project);
    await controller.selectTab("media");
    await controller.openMedia({
      ...runObject,
      path: "/private/raw/path",
      hash: "secret-hash",
      metadata: { provider: "secret-provider" },
      request: { secret: "request-body" },
      response: { secret: "response-body" },
      error: { secret: "error-body" },
    } as RunObjectMediaCardDto);

    const markup = renderToStaticMarkup(<ProjectScreenView project={project} controller={controller} snapshot={controller.getSnapshot()} />);
    expect(markup).toContain("RunObject evidence");
    expect(markup).toContain("run-1");
    expect(markup).toContain("Attempt</dt><dd>Unlinked");
    expect(markup).toContain("diagnostic-log");
    expect(markup).toContain("ready");
    expect(markup).toContain("cache");
    expect(markup).toContain("runs/run-1/diagnostics.txt");
    expect(markup).toContain("Not promoted");
    expect(markup).not.toMatch(/href="runs\/run-1\/diagnostics\.txt|<button[^>]*>runs\/run-1\/diagnostics\.txt/);
    expect(markup).not.toMatch(/private\/raw|secret-hash|secret-provider|request-body|response-body|error-body/);
  });

  test("does not treat an Artifact with an incidental runId as a RunObject", async () => {
    const adversarial = { ...card, runId: "spoofed-run" } as MediaCardDto;
    const api = { ...projectApi(), loadProjectPage: async () => ({ items: [adversarial], nextCursor: null }) };
    const controller = createProjectScreenController(api, project);
    await controller.selectTab("media");
    await controller.openMedia(adversarial);

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
      const opener = button(host.container, "Open diagnostic-log");
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
      expect((globalThis.document.body as unknown as HostNode).textContent).toContain("Provenance unavailable");
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
      await act(async () => { button(host.container, "Open diagnostic-log").dispatchEvent(new Event("click", { bubbles: true })); await Promise.resolve(); });
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
      await act(async () => { button(host.container, "Open diagnostic-log").dispatchEvent(new Event("click", { bubbles: true })); await Promise.resolve(); });
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

  test("restores focus to the stable Media tab after filtering removes the opener", async () => {
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
      const opener = button(host.container, "Open diagnostic-log");
      opener.focus();
      await act(async () => { opener.dispatchEvent(new Event("click", { bubbles: true })); await Promise.resolve(); });
      const dialog = (globalThis.document.body as unknown as HostNode).findAll((node) => node.getAttribute("role") === "dialog")[0];
      expect(globalThis.document.activeElement).toBe(dialog);

      await act(async () => { textButton(host.container, "References").dispatchEvent(new Event("click", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });

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

  test("restores focus to the replacement Media tab when an open viewer controller is disposed", async () => {
    const first = createProjectScreenController(projectApi(), project);
    await first.selectTab("media");
    const replacement = createProjectScreenController(projectApi(), project);
    await replacement.start();
    const tilePreview = vi.spyOn(bridge, "resolveProjectPreview").mockResolvedValue(null);
    const host = createReactHost();
    const root = createRoot(host.container as unknown as Element);
    try {
      await act(async () => { root.render(<MountedProject key="root-1" controller={first} />); await Promise.resolve(); });
      const opener = button(host.container, "Open diagnostic-log");
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

  test("shows the unselected Artifact revision chooser and replaces it with the selected image", async () => {
    const unselected: MediaCardDto = { ...card, selectedRevisionId: null, selectedState: null, mime: null, bytes: null, selectedAt: null, selectedObjectId: null, storageClass: null, target: null };
    const selected: MediaCardDto = { ...card, selectedRevisionId: "revision-1", target: { type: "object", id: "object-1" } };
    const revision = { id: "revision-1", artifactId: "artifact-1", objectId: "object-1", revisionNo: 1, parentRevisionId: null, iterationId: null, state: "approved" as const, authoredBySessionId: null, createdAt: 2 };
    const api = {
      ...projectApi(),
      loadProjectPage: vi.fn(async () => ({ items: [unselected], nextCursor: "more" })),
      loadProjectMediaRevisions: vi.fn(async () => ({ items: [revision], nextCursor: null })),
      selectProjectMediaRevision: vi.fn(async () => selected),
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
      await act(async () => { button(host.container, "Open Campaign hero").dispatchEvent(new Event("click", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
      const body = globalThis.document.body as unknown as HostNode;
      expect(body.textContent).toContain("Select a revision");
      expect(body.textContent).toContain("Revision 1 · approved");
      expect(api.resolveProjectPreview).not.toHaveBeenCalled();
      expect(api.loadProjectGeneration).not.toHaveBeenCalled();

      await act(async () => { textButton(body, "Select").dispatchEvent(new Event("click", { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
      const image = body.findAll((node) => node.tagName === "IMG" && node.getAttribute("alt") === "Campaign hero")[0];
      expect(image.getAttribute("src")).toBe("ralphy-media://asset/hero");
      expect(controller.getSnapshot().domain.pages.media).toMatchObject({ items: [selected], nextCursor: "more" });
    } finally {
      await act(async () => { root.unmount(); await new Promise((resolve) => setTimeout(resolve, 0)); });
      tilePreview.mockRestore();
      host.restore();
    }
  });
});
