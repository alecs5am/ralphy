import { describe, expect, test, vi } from "vitest";
import type { ArtifactMediaCardDto, Page } from "../electron/ralphy/types";
import { createSharedLibraryController } from "../src/state/shared-library-controller";

function artifact(id: string, overrides: Partial<ArtifactMediaCardDto> = {}): ArtifactMediaCardDto {
  return {
    ref: { type: "artifact", id },
    workspaceId: "workspace-1",
    projectId: null,
    slug: id,
    kind: "image",
    selectedRevisionId: `revision-${id}`,
    selectedState: "approved",
    mime: "image/png",
    bytes: 100,
    selectedAt: 100,
    revisionCount: 1,
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

describe("Shared Library controller", () => {
  test("starts once and derives local query, filter, sort, and selection without reloading", async () => {
    const loadSharedLibraryPage = vi.fn(async () => page([
      artifact("zeta", { selectedAt: 200, bytes: 50 }),
      artifact("alpha", { mediaKind: "audio", mime: "audio/mpeg", provenance: "generation", usageRoles: ["opening hook"], selectedAt: 100, bytes: 900 }),
    ]));
    const controller = createSharedLibraryController({ loadSharedLibraryPage }, "workspace-1");

    expect(controller.getSnapshot()).toMatchObject({ status: "loading", query: { text: "", view: "grid" } });
    await controller.start();
    await controller.start();
    expect(loadSharedLibraryPage).toHaveBeenCalledTimes(1);
    expect(loadSharedLibraryPage).toHaveBeenCalledWith("workspace-1");

    controller.selectArtifact("alpha");
    controller.setQuery({ view: "list", sort: "size", text: "opening", mediaKind: "audio", provenance: "generation" });
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      query: { text: "opening", mediaKind: "audio", provenance: "generation", view: "list", sort: "size" },
      value: { selectedArtifactId: "alpha", artifacts: [{ id: "alpha" }] },
    });
    expect(loadSharedLibraryPage).toHaveBeenCalledTimes(1);

    controller.setQuery({ text: "approved" });
    expect(controller.getSnapshot()).toMatchObject({ status: "ready", value: { selectedArtifactId: null, artifacts: [] } });
  });

  test("refreshes in place, keeps a surviving stable selection, and ignores stale refreshes", async () => {
    const firstRefresh = deferred<Page<ArtifactMediaCardDto>>();
    const secondRefresh = deferred<Page<ArtifactMediaCardDto>>();
    const loadSharedLibraryPage = vi.fn()
      .mockResolvedValueOnce(page([artifact("keep"), artifact("remove")]))
      .mockReturnValueOnce(firstRefresh.promise)
      .mockReturnValueOnce(secondRefresh.promise);
    const controller = createSharedLibraryController({ loadSharedLibraryPage }, "workspace-1");
    await controller.start();
    controller.selectArtifact("keep");

    const stale = controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready", refreshing: true, value: { selectedArtifactId: "keep", artifacts: [{ id: "keep" }, { id: "remove" }] },
    });
    const current = controller.refresh();
    secondRefresh.resolve(page([artifact("keep", { slug: "updated" })]));
    await current;
    firstRefresh.resolve(page([artifact("stale")]));
    await stale;

    expect(controller.getSnapshot()).toMatchObject({
      status: "ready", refreshing: false, refreshError: null,
      value: { selectedArtifactId: "keep", artifacts: [{ id: "keep", slug: "updated" }] },
    });
  });

  test("keeps loaded rows on refresh failure and clears selection only when a successful refresh removes it", async () => {
    const loadSharedLibraryPage = vi.fn()
      .mockResolvedValueOnce(page([artifact("selected")]))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(page([artifact("replacement")]));
    const controller = createSharedLibraryController({ loadSharedLibraryPage }, "workspace-1");
    await controller.start();
    controller.selectArtifact("selected");

    await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready", refreshing: false, refreshError: "offline",
      value: { selectedArtifactId: "selected", artifacts: [{ id: "selected" }] },
    });
    await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready", refreshError: null,
      value: { selectedArtifactId: null, artifacts: [{ id: "replacement" }] },
    });
  });

  test("appends with stable-ID deduplication and exposes a retryable page-local error", async () => {
    const loadSharedLibraryPage = vi.fn()
      .mockResolvedValueOnce(page([artifact("a"), artifact("b")], "cursor-1"))
      .mockRejectedValueOnce(new Error("page unavailable"))
      .mockResolvedValueOnce(page([artifact("b", { slug: "duplicate-update" }), artifact("c")], null));
    const controller = createSharedLibraryController({ loadSharedLibraryPage }, "workspace-1");
    await controller.start();

    await controller.loadMore();
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready", loadingMore: false, pageError: "page unavailable",
      value: { nextCursor: "cursor-1", artifacts: [{ id: "a" }, { id: "b" }] },
    });
    await controller.loadMore();
    expect(loadSharedLibraryPage).toHaveBeenNthCalledWith(2, "workspace-1", { after: "cursor-1" });
    expect(loadSharedLibraryPage).toHaveBeenNthCalledWith(3, "workspace-1", { after: "cursor-1" });
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready", loadingMore: false, pageError: null,
      value: { nextCursor: null, artifacts: [{ id: "a" }, { id: "b", slug: "b" }, { id: "c" }] },
    });
  });

  test("reconciles an exact returned artifact in place without truncating loaded pages, cursor, query, or selection", async () => {
    const loadSharedLibraryPage = vi.fn()
      .mockResolvedValueOnce(page([artifact("first")], "cursor-1"))
      .mockResolvedValueOnce(page([artifact("second", { selectedRevisionId: null, selectedState: null })], "cursor-2"));
    const controller = createSharedLibraryController({ loadSharedLibraryPage }, "workspace-1");
    await controller.start();
    await controller.loadMore();
    controller.setQuery({ view: "list", sort: "name" });
    controller.selectArtifact("second");

    controller.reconcileArtifact(artifact("second", { selectedRevisionId: "revision-2", selectedState: "candidate" }));

    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      query: { view: "list", sort: "name" },
      refreshing: false,
      loadingMore: false,
      value: {
        selectedArtifactId: "second",
        nextCursor: "cursor-2",
        artifacts: [
          { id: "first" },
          { id: "second", selectedRevisionId: "revision-2", selectedState: "candidate" },
        ],
      },
    });
    expect(loadSharedLibraryPage).toHaveBeenCalledTimes(2);
  });

  test("suppresses stale append results and all publication after disposal", async () => {
    const append = deferred<Page<ArtifactMediaCardDto>>();
    const refresh = deferred<Page<ArtifactMediaCardDto>>();
    const loadSharedLibraryPage = vi.fn()
      .mockResolvedValueOnce(page([artifact("first")], "cursor-1"))
      .mockReturnValueOnce(append.promise)
      .mockReturnValueOnce(refresh.promise);
    const controller = createSharedLibraryController({ loadSharedLibraryPage }, "workspace-1");
    const listener = vi.fn();
    controller.subscribe(listener);
    await controller.start();

    const staleAppend = controller.loadMore();
    const currentRefresh = controller.refresh();
    refresh.resolve(page([artifact("fresh")]));
    await currentRefresh;
    append.resolve(page([artifact("stale")], null));
    await staleAppend;
    expect(controller.getSnapshot()).toMatchObject({ status: "ready", value: { artifacts: [{ id: "fresh" }] } });

    const pending = deferred<Page<ArtifactMediaCardDto>>();
    loadSharedLibraryPage.mockReturnValueOnce(pending.promise);
    const beforeDispose = listener.mock.calls.length;
    const disposedRefresh = controller.refresh();
    controller.dispose();
    pending.resolve(page([artifact("after-dispose")]));
    await disposedRefresh;
    controller.setQuery({ text: "ignored" });
    controller.selectArtifact("fresh");
    expect(listener).toHaveBeenCalledTimes(beforeDispose + 1);
  });

  test("publishes an initial error and allows refresh to recover", async () => {
    const loadSharedLibraryPage = vi.fn()
      .mockRejectedValueOnce(new Error("initial failure"))
      .mockResolvedValueOnce(page([artifact("recovered")]));
    const controller = createSharedLibraryController({ loadSharedLibraryPage }, "workspace-1");

    await controller.start();
    expect(controller.getSnapshot()).toMatchObject({ status: "error", error: "initial failure" });
    await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({ status: "ready", value: { artifacts: [{ id: "recovered" }] } });
  });
});
