import type { MediaWorkbenchBridge } from "../../electron/media/types";
import type { ArtifactMediaCardDto, Page } from "../../electron/ralphy/types";
import {
  DEFAULT_SHARED_LIBRARY_QUERY,
  presentSharedLibrary,
  type SharedLibraryPresentation,
  type SharedLibraryQueryState,
} from "../screens/shared-library/presentation";

export type SharedLibrarySnapshot =
  | { status: "loading"; query: SharedLibraryQueryState }
  | { status: "ready"; value: SharedLibraryPresentation; query: SharedLibraryQueryState; refreshing: boolean; loadingMore: boolean; pageError: string | null; refreshError: string | null }
  | { status: "error"; error: string; query: SharedLibraryQueryState };

export interface SharedLibraryController {
  subscribe(listener: () => void): () => void;
  getSnapshot(): SharedLibrarySnapshot;
  start(): Promise<void>;
  refresh(): Promise<void>;
  loadMore(): Promise<void>;
  setQuery(patch: Partial<SharedLibraryQueryState>): void;
  selectArtifact(id: string | null): void;
  dispose(): void;
}

export type SharedLibraryApi = Pick<MediaWorkbenchBridge, "loadSharedLibraryPage">;

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export function createSharedLibraryController(
  api: SharedLibraryApi,
  workspaceId: string,
): SharedLibraryController {
  let query = { ...DEFAULT_SHARED_LIBRARY_QUERY };
  let snapshot: SharedLibrarySnapshot = { status: "loading", query };
  let loaded: Page<ArtifactMediaCardDto> | null = null;
  let selectedArtifactId: string | null = null;
  let started = false;
  let disposed = false;
  let requestId = 0;
  const listeners = new Set<() => void>();
  const emit = (next: SharedLibrarySnapshot) => {
    if (disposed) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const ready = (
    page: Page<ArtifactMediaCardDto>,
    state: Pick<Extract<SharedLibrarySnapshot, { status: "ready" }>, "refreshing" | "loadingMore" | "pageError" | "refreshError">,
  ): Extract<SharedLibrarySnapshot, { status: "ready" }> => {
    const value = presentSharedLibrary(page, selectedArtifactId, query);
    selectedArtifactId = value.selectedArtifactId;
    return { status: "ready", value, query, ...state };
  };

  const replace = async () => {
    if (disposed) return;
    const currentRequest = ++requestId;
    const previous = loaded;
    if (previous) {
      emit(ready(previous, { refreshing: true, loadingMore: false, pageError: null, refreshError: null }));
    } else {
      emit({ status: "loading", query });
    }
    try {
      const page = await api.loadSharedLibraryPage(workspaceId);
      if (disposed || currentRequest !== requestId) return;
      loaded = page;
      emit(ready(page, { refreshing: false, loadingMore: false, pageError: null, refreshError: null }));
    } catch (error) {
      if (disposed || currentRequest !== requestId) return;
      if (previous) {
        emit(ready(previous, {
          refreshing: false,
          loadingMore: false,
          pageError: null,
          refreshError: errorMessage(error),
        }));
      } else {
        emit({ status: "error", error: errorMessage(error), query });
      }
    }
  };

  const controller: SharedLibraryController = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async start() {
      if (started || disposed) return;
      started = true;
      await replace();
    },
    async refresh() {
      if (disposed) return;
      started = true;
      await replace();
    },
    async loadMore() {
      if (disposed || snapshot.status !== "ready" || snapshot.refreshing || snapshot.loadingMore || !loaded?.nextCursor) return;
      const current = loaded;
      const cursor = current.nextCursor;
      const currentRequest = ++requestId;
      emit(ready(current, { refreshing: false, loadingMore: true, pageError: null, refreshError: snapshot.refreshError }));
      try {
        const page = await api.loadSharedLibraryPage(workspaceId, { after: cursor });
        if (disposed || currentRequest !== requestId) return;
        const seen = new Set(current.items.map(({ ref }) => ref.id));
        loaded = {
          items: [...current.items, ...page.items.filter(({ ref }) => !seen.has(ref.id) && !!seen.add(ref.id))],
          nextCursor: page.nextCursor,
        };
        emit(ready(loaded, { refreshing: false, loadingMore: false, pageError: null, refreshError: snapshot.refreshError }));
      } catch (error) {
        if (disposed || currentRequest !== requestId) return;
        emit(ready(current, {
          refreshing: false,
          loadingMore: false,
          pageError: errorMessage(error),
          refreshError: snapshot.refreshError,
        }));
      }
    },
    setQuery(patch) {
      if (disposed) return;
      query = { ...query, ...patch };
      if (snapshot.status === "loading") emit({ status: "loading", query });
      if (snapshot.status === "error") emit({ ...snapshot, query });
      if (snapshot.status === "ready" && loaded) {
        emit(ready(loaded, {
          refreshing: snapshot.refreshing,
          loadingMore: snapshot.loadingMore,
          pageError: snapshot.pageError,
          refreshError: snapshot.refreshError,
        }));
      }
    },
    selectArtifact(id) {
      if (disposed || snapshot.status !== "ready") return;
      selectedArtifactId = id !== null && snapshot.value.artifacts.some((artifact) => artifact.id === id) ? id : null;
      emit({ ...snapshot, value: { ...snapshot.value, selectedArtifactId } });
    },
    dispose() {
      disposed = true;
      requestId += 1;
      listeners.clear();
    },
  };
  return controller;
}
