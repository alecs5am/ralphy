import { useCallback, useEffect, useRef, useState } from "react";
import { bridge } from "@/shared/api/ipc";
import { GENERATION_PROVIDERS_CHANGED_EVENT, generationDraftFromRun, type GenerationCatalog, type GenerationDraft, type GenerationKind, type GenerationModel } from "../../../../shared/generation-studio";
import { mergeCanvasRuns, type CanvasRun, type CanvasRunResult } from "../../../../shared/canvas-runtime";
import { chooseGenerationModel, defaultGenerationModel, emptyDraft, running } from "../lib/generation-presentation";

const message = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);

/** The screen keys this controller by workspace and root, so native responses never cross scopes. */
export function useGenerationStudio(workspaceId: string) {
  const [catalog, setCatalog] = useState<GenerationCatalog>({ models: [], providers: [], errors: [] });
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<GenerationDraft>(emptyDraft);
  const [runs, setRuns] = useState<CanvasRun[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadedOlder = useRef(false), paging = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "failed">("saved");
  const [starting, setStarting] = useState(false);
  const [lastStartedId, setLastStartedId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [reload, setReload] = useState(0);
  const alive = useRef(true), startingRef = useRef(false), importingRef = useRef(false);
  const version = useRef(0), saveVersion = useRef(0), catalogVersion = useRef(0);
  const draftRef = useRef(draft), runsRef = useRef(runs), refresh = useRef<() => void>(() => {});
  const kindDrafts = useRef<Partial<Record<GenerationKind, GenerationDraft>>>({});
  draftRef.current = draft; runsRef.current = runs;
  useEffect(() => { alive.current = true; return () => { alive.current = false; version.current++; catalogVersion.current++; saveVersion.current++; }; }, []);

  const refreshCatalog = useCallback(async () => {
    const request = ++catalogVersion.current;
    setLoading(true);
    try { const value = await bridge.loadGenerationCatalog(workspaceId); if (alive.current && request === catalogVersion.current) setCatalog(value); }
    catch (cause) { if (alive.current && request === catalogVersion.current) setError(message(cause)); }
    finally { if (alive.current && request === catalogVersion.current) setLoading(false); }
  }, [workspaceId]);
  useEffect(() => { void refreshCatalog(); }, [refreshCatalog, reload]);
  useEffect(() => {
    const refresh = () => { void refreshCatalog(); };
    window.addEventListener(GENERATION_PROVIDERS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(GENERATION_PROVIDERS_CHANGED_EVENT, refresh);
  }, [refreshCatalog]);
  useEffect(() => {
    let current = true;
    setReady(false);
    void bridge.loadGenerationDraft(workspaceId).then((value) => {
      if (!current) return;
      setDraft(value ?? emptyDraft()); draftRef.current = value ?? emptyDraft(); setReady(true);
    }).catch((cause) => { if (current) setError(message(cause)); });
    return () => { current = false; };
  }, [workspaceId, reload]);

  const edit = useCallback((next: GenerationDraft) => {
    draftRef.current = next; setDraft(next); kindDrafts.current[next.kind] = next;
    const request = ++saveVersion.current;
    setSaveState("saving");
    void bridge.saveGenerationDraft(workspaceId, next).then(() => {
      if (alive.current && request === saveVersion.current) setSaveState("saved");
    }).catch((cause) => {
      if (alive.current && request === saveVersion.current) { setSaveState("failed"); setError(`Draft not saved: ${message(cause)}`); }
    });
  }, [workspaceId]);
  useEffect(() => {
    if (!ready || loading || draftRef.current.modelId) return;
    const model = defaultGenerationModel(catalog.models, draftRef.current.kind);
    if (model) edit(chooseGenerationModel(draftRef.current, model));
  }, [ready, loading, catalog, edit]);

  useEffect(() => {
    let stopped = false, inFlight = false;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => { clearTimeout(timer); if (!stopped) timer = setTimeout(load, 1800); };
    const load = async () => {
      if (stopped || inFlight) return;
      clearTimeout(timer); inFlight = true;
      const request = version.current;
      try {
        const page = await bridge.loadGenerationRuns(workspaceId);
        if (!stopped && request === version.current) {
          const next = mergeCanvasRuns(runsRef.current, page.items);
          runsRef.current = next; setRuns(next);
          if (!loadedOlder.current) setNextCursor(page.nextCursor);
        }
      } catch (cause) { if (!stopped && request === version.current) setError(message(cause)); }
      finally { inFlight = false; }
      if (runsRef.current.some(running) || startingRef.current) schedule();
    };
    refresh.current = schedule;
    const focus = () => { void load(); };
    window.addEventListener("focus", focus); void load();
    return () => { stopped = true; clearTimeout(timer); refresh.current = () => {}; window.removeEventListener("focus", focus); };
  }, [workspaceId, reload]);

  const loadOlder = async () => {
    if (!nextCursor || paging.current) return;
    paging.current = true; setLoadingOlder(true);
    try {
      const page = await bridge.loadGenerationRuns(workspaceId, nextCursor);
      if (alive.current) { loadedOlder.current = true; const next = mergeCanvasRuns(runsRef.current, page.items); runsRef.current = next; setRuns(next); setNextCursor(page.nextCursor); }
    } catch (cause) { if (alive.current) setError(message(cause)); }
    finally { paging.current = false; if (alive.current) setLoadingOlder(false); }
  };

  const chooseModel = (model: GenerationModel) => edit(chooseGenerationModel(draftRef.current, model));
  const chooseKind = (kind: GenerationKind) => {
    if (draftRef.current.kind === kind) return;
    kindDrafts.current[draftRef.current.kind] = draftRef.current;
    const previous = kindDrafts.current[kind];
    const model = defaultGenerationModel(catalog.models, kind);
    edit(previous ?? (model ? chooseGenerationModel({ ...emptyDraft(), kind }, model) : { ...emptyDraft(), kind }));
  };
  const start = async (mode: "preview" | "execute") => {
    if (startingRef.current || runsRef.current.some(running) || !ready) return;
    startingRef.current = true; setStarting(true); setError(null); version.current++;
    refresh.current();
    try {
      const run = await bridge.startGeneration(workspaceId, draftRef.current, mode);
      if (alive.current) { version.current++; const next = [run, ...runsRef.current.filter((item) => item.id !== run.id)]; runsRef.current = next; setRuns(next); setLastStartedId(run.id); refresh.current(); }
    } catch (cause) { if (alive.current) setError(message(cause)); }
    finally { startingRef.current = false; if (alive.current) setStarting(false); }
  };
  const cancel = async (id: string) => {
    version.current++;
    try {
      const run = await bridge.cancelGenerationRun(workspaceId, id);
      if (alive.current) { version.current++; const next = runsRef.current.map((item) => item.id === id ? run : item); runsRef.current = next; setRuns(next); }
    } catch (cause) { if (alive.current) setError(message(cause)); }
  };
  const addReference = (role: string, result: CanvasRunResult) => {
    const current = draftRef.current;
    const model = catalog.models.find((item) => item.id === current.modelId && item.provider === current.provider && item.kind === current.kind);
    const spec = model?.inputs.find((item) => item.id === role);
    if (result.unavailableReason) { setError(result.unavailableReason); return; }
    if (!result.asset || !spec || result.asset.kind !== spec.kind) { setError("This model does not accept that reference type."); return; }
    if (current.inputs.filter((item) => item.role === role).length >= spec.maxCount) { setError(`Remove a ${spec.label.toLocaleLowerCase()} before adding another.`); return; }
    edit({ ...current, inputs: [...current.inputs, { role, asset: result.asset }] });
  };
  const importReference = async (role: string, file?: File): Promise<string | null> => {
    if (importingRef.current) return null;
    const initial = draftRef.current;
    importingRef.current = true; setImporting(true);
    try {
      const asset = await (file ? bridge.importCanvasAsset(workspaceId, file) : bridge.importCanvasAsset(workspaceId));
      if (asset && alive.current && initial.modelId === draftRef.current.modelId && initial.provider === draftRef.current.provider && initial.kind === draftRef.current.kind) {
        const spec = catalog.models.find((item) => item.id === initial.modelId && item.provider === initial.provider && item.kind === initial.kind)?.inputs.find((input) => input.id === role);
        if (!spec || spec.kind !== asset.kind) throw new Error(`${spec?.kind ?? "Supported media"} files only`);
        addReference(role, { id: "import", nodeId: "input", kind: asset.kind, label: asset.name, asset });
      }
      return null;
    } catch (cause) { return message(cause); }
    finally { importingRef.current = false; if (alive.current) setImporting(false); }
  };
  const exportResult = async (result: CanvasRunResult) => {
    if (result.unavailableReason) { setError(result.unavailableReason); return; }
    if (!result.asset) return;
    try { await bridge.exportGenerationAsset(workspaceId, result.asset); }
    catch (cause) { if (alive.current) setError(message(cause)); }
  };
  return {
    catalog, loading, ready, draft, edit, chooseKind, chooseModel, runs, lastStartedId, error, setError, saveState, loadOlder, hasOlder: nextCursor !== null, loadingOlder,
    starting, importing, busy: starting || runs.some(running), start, cancel, importReference, addReference, exportResult,
    refreshCatalog, retryLoad: () => { setError(null); setReload((value) => value + 1); }, retrySave: () => edit(draftRef.current),
    restore: (run: CanvasRun) => { const next = generationDraftFromRun(run); if (next) edit(next); },
  };
}
