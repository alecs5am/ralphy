import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { MediaCardDto, RunObjectMediaCardDto } from "../electron/ralphy/types";
import { VirtualAssetGrid, MediaCardTile } from "../src/components/VirtualAssetGrid";
import { AudioWaveform } from "../src/components/media/AudioWaveform";
import { ImageViewport } from "../src/components/media/ImageViewport";
import { VideoPlayer } from "../src/components/media/VideoPlayer";
import { ProjectScreenView, createProjectScreenController } from "../src/screens/ProjectScreen";
import type { ProjectSummary } from "../src/lib/ipc";

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
    loadDocumentPreview: async () => ({ revisionId: "revision-1", format: "text", text: "", truncated: false }),
    searchProjectDocuments: async () => ({ items: [], nextCursor: null }),
    showProjectDocument: async () => { throw new Error("Not used"); },
    reviseProjectDocument: async () => { throw new Error("Not used"); },
    resolveProjectPreview: async () => null,
  };
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
    const grid = renderToStaticMarkup(<VirtualAssetGrid items={[card]} selectedRef={card.ref} onSelect={() => undefined} />);
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
});
