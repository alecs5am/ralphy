import type { WorkspaceOverviewDto } from "../../electron/ralphy/types";
import type { MediaWorkbenchBridge } from "../../electron/media/types";

export type WorkspaceScreenApi = Pick<MediaWorkbenchBridge, "loadWorkspaceOverview">;
export interface WorkspaceScreenSnapshot {
  status: "idle" | "loading" | "ready" | "error";
  value: WorkspaceOverviewDto | null;
  error: string | null;
  refreshing: boolean;
  lastSuccessfulRefreshAt: number | null;
}
export interface WorkspaceScreenController {
  getSnapshot(): WorkspaceScreenSnapshot;
  subscribe(listener: () => void): () => void;
  start(): Promise<void>;
  refresh(sequence: number): Promise<void>;
  retry(): Promise<void>;
  dispose(): void;
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export function createWorkspaceScreenController(
  api: WorkspaceScreenApi,
  workspaceId: string,
  initialActivitySequence = 0,
  now: () => number = Date.now,
): WorkspaceScreenController {
  let snapshot: WorkspaceScreenSnapshot = { status: "idle", value: null, error: null, refreshing: false, lastSuccessfulRefreshAt: null };
  let disposed = false;
  let requestId = 0;
  let coveredActivitySequence = initialActivitySequence;
  const listeners = new Set<() => void>();
  const emit = (next: WorkspaceScreenSnapshot) => {
    if (disposed) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const load = async () => {
    if (disposed) return;
    const currentRequest = ++requestId;
    const previous = snapshot.status === "ready" ? snapshot.value : null;
    emit(previous
      ? { ...snapshot, status: "ready", value: previous, error: null, refreshing: true }
      : { ...snapshot, status: "loading", value: null, error: null, refreshing: false });
    try {
      const value = await api.loadWorkspaceOverview(workspaceId);
      if (currentRequest === requestId) emit({ status: "ready", value, error: null, refreshing: false, lastSuccessfulRefreshAt: now() });
    } catch (error) {
      if (currentRequest !== requestId) return;
      emit(previous
        ? { ...snapshot, status: "ready", value: previous, error: errorMessage(error), refreshing: false }
        : { ...snapshot, status: "error", value: null, error: errorMessage(error), refreshing: false });
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async start() { if (snapshot.status === "idle") await load(); },
    async refresh(sequence) {
      if (disposed || sequence <= coveredActivitySequence) return;
      coveredActivitySequence = sequence;
      await load();
    },
    retry: load,
    dispose() { disposed = true; requestId += 1; listeners.clear(); },
  };
}
