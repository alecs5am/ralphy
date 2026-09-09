import { useCallback, useEffect, useRef, useState } from "react";
import { bridge } from "@/shared/api/ipc";
import type { CanvasModelCatalog, CanvasRun } from "../../../../shared/canvas-runtime";
import type { SavedCanvas } from "../../../../shared/workflow-canvas";

const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const active = (run: CanvasRun) => run.status === "running" || run.status === "pending";
export function useCanvasRuntime(workspaceId: string, canvasId?: string) {
  const [catalog, setCatalog] = useState<CanvasModelCatalog>({ models: [], providers: [], errors: [] });
  const [loadingModels, setLoadingModels] = useState(true);
  const [runs, setRuns] = useState<CanvasRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const alive = useRef(true);
  const modelVersion = useRef(0);
  const pollVersion = useRef(0);
  const modelWorkspace = useRef(workspaceId);
  const scope = useRef({ key: `${workspaceId}:${canvasId}`, version: 0 });
  const startToken = useRef<object | null>(null);
  const wakePolling = useRef<() => void>(() => {});
  const currentRuns = useRef(runs);
  currentRuns.current = runs;
  if (modelWorkspace.current !== workspaceId) { modelWorkspace.current = workspaceId; modelVersion.current += 1; }
  if (scope.current.key !== `${workspaceId}:${canvasId}`) {
    scope.current = { key: `${workspaceId}:${canvasId}`, version: scope.current.version + 1 };
    pollVersion.current += 1;
    startToken.current = null;
  }
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; scope.current.version += 1; modelVersion.current += 1; pollVersion.current += 1; startToken.current = null; };
  }, []);
  const refreshModels = useCallback(async () => {
    const version = ++modelVersion.current;
    const current = () => alive.current && modelWorkspace.current === workspaceId && version === modelVersion.current;
    setLoadingModels(true);
    try { const next = await bridge.loadCanvasModels(workspaceId); if (current()) setCatalog(next); }
    catch (cause) { if (current()) setError(message(cause)); }
    finally { if (current()) setLoadingModels(false); }
  }, [workspaceId]);
  useEffect(() => {
    setCatalog({ models: [], providers: [], errors: [] });
    void refreshModels();
  }, [refreshModels]);
  useEffect(() => {
    setRuns([]); setSelectedRunId(null); setError(null); setStarting(false);
    if (!canvasId) return;
    let stopped = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout>;
    const scopeVersion = scope.current.version;
    const schedule = () => { clearTimeout(timer); if (!stopped) timer = setTimeout(refresh, 1800); };
    const refresh = async () => {
      if (stopped || inFlight) return;
      clearTimeout(timer);
      inFlight = true;
      const version = pollVersion.current;
      const current = () => !stopped && alive.current && scope.current.version === scopeVersion && version === pollVersion.current;
      let keepPolling = false;
      try {
        const next = await bridge.loadCanvasRuns(workspaceId, canvasId);
        if (current()) {
          keepPolling = next.some(active);
          setRuns(next);
        } else keepPolling = currentRuns.current.some(active);
      }
      catch (cause) { if (current()) { setError(message(cause)); keepPolling = currentRuns.current.some(active); } }
      finally { inFlight = false; }
      if (keepPolling || startToken.current) schedule();
    };
    const focus = () => { void refresh(); };
    wakePolling.current = schedule;
    window.addEventListener("focus", focus);
    void refresh();
    return () => { stopped = true; clearTimeout(timer); window.removeEventListener("focus", focus); wakePolling.current = () => {}; };
  }, [workspaceId, canvasId]);
  const start = async (saved: SavedCanvas, mode: "preview" | "execute", nodeId?: string) => {
    if (startToken.current) return;
    if (saved.canvas.id !== canvasId) { setError("Open this canvas before running it."); return; }
    const token = {};
    startToken.current = token;
    const scopeVersion = scope.current.version;
    const current = () => alive.current && scope.current.version === scopeVersion && startToken.current === token;
    pollVersion.current += 1;
    setStarting(true); setError(null);
    wakePolling.current();
    try {
      const run = await bridge.startCanvasRun(workspaceId, saved.canvas.id, { mode, expectedRevision: saved.revision, nodeId });
      if (current()) {
        pollVersion.current += 1;
        setRuns((values) => [run, ...values.filter((item) => item.id !== run.id)]); setSelectedRunId(run.id);
        if (active(run)) wakePolling.current();
      }
    } catch (cause) { if (current()) setError(message(cause)); }
    finally { if (current()) { startToken.current = null; setStarting(false); } }
  };
  const cancel = async (id: string) => {
    const scopeVersion = scope.current.version;
    const current = () => alive.current && scope.current.version === scopeVersion;
    pollVersion.current += 1;
    try {
      const run = await bridge.cancelCanvasRun(workspaceId, id);
      if (current()) { pollVersion.current += 1; setRuns((values) => values.map((item) => item.id === id ? run : item)); }
    } catch (cause) { if (current()) setError(message(cause)); }
  };
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0];
  return { catalog, loadingModels, refreshModels, runs, selectedRun, setSelectedRunId, start, cancel, starting, error, setError, running: runs.some((run) => run.status === "running" || run.status === "pending") };
}
