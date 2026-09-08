import { useEffect, useRef, useState } from "react";
import { bridge } from "@/shared/api/ipc";
import { parseCanvas, type SavedCanvas, type WorkflowCanvas } from "../../../../shared/workflow-canvas";
import { copyCanvas, createCanvasHistory, moveCanvasHistory, newCanvas, recordCanvasEdit, type CanvasEditOptions, type CanvasTemplate } from "./canvas-editor";

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export function useCanvasEditor(workspaceId: string, storageScope: string, agentBusy: boolean) {
  const [items, setItems] = useState<SavedCanvas[]>([]);
  const [draft, setDraft] = useState<WorkflowCanvas | null>(null);
  const [saved, setSaved] = useState<SavedCanvas | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const loadVersion = useRef(0);
  const inFlight = useRef(false);
  const history = useRef(createCanvasHistory());
  const draftKey = `ralphy.canvas.draft:${storageScope}:${workspaceId}`;
  const selectionKey = `ralphy.canvas.selected:${storageScope}:${workspaceId}`;
  const scope = useRef(draftKey);
  scope.current = draftKey;
  const current = useRef({ draft, saved, dirty });
  current.current = { draft, saved, dirty };
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  function replace(next: WorkflowCanvas | null, baseline: SavedCanvas | null, changed: boolean) {
    current.current = { draft: next, saved: baseline, dirty: changed };
    setDraft(next); setSaved(baseline); setDirty(changed);
  }

  function backup(next: WorkflowCanvas, baseline: SavedCanvas | null, changed = true) {
    try {
      if (changed) localStorage.setItem(draftKey, JSON.stringify({ canvas: next, saved: baseline }));
      else localStorage.removeItem(draftKey);
    } catch { setError("Draft backup is unavailable. Save this canvas before leaving."); }
  }

  async function reload() {
    const version = ++loadVersion.current;
    try {
      const next = await bridge.loadCanvases(workspaceId);
      if (!alive.current || scope.current !== draftKey || version !== loadVersion.current) return;
      setItems(next);
      const state = current.current;
      if (!state.draft) {
        const selected = next.find((item) => item.canvas.id === localStorage.getItem(selectionKey));
        if (selected) replace(selected.canvas, selected, false);
      }
      if (!state.dirty && state.draft) {
        const updated = next.find((item) => item.canvas.id === state.draft!.id);
        if (updated && updated.revision !== state.saved?.revision) {
          history.current = createCanvasHistory();
          replace(updated.canvas, updated, false);
        }
      }
      setError(null);
    } catch (cause) { if (alive.current && scope.current === draftKey && version === loadVersion.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (alive.current && scope.current === draftKey && version === loadVersion.current) setLoading(false); }
  }

  useEffect(() => {
    history.current = createCanvasHistory();
    replace(null, null, false); setItems([]); setLoading(true);
    void reload();
    try {
      const stored = localStorage.getItem(draftKey);
      if (stored) {
        const value = JSON.parse(stored);
        const name = value.canvas?.name;
        const restored = parseCanvas({ ...value.canvas, name: typeof name === "string" && !name.trim() ? "Untitled canvas" : name });
        replace({ ...restored, name }, value.saved ?? null, true);
      }
    } catch { setError("A saved draft could not be restored. Your canvas files are unchanged."); }
  }, [draftKey]);
  useEffect(() => { if (!agentBusy) void reload(); }, [agentBusy]);
  useEffect(() => {
    const onFocus = () => { void reload(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [workspaceId, storageScope]);

  function edit(update: WorkflowCanvas | ((canvas: WorkflowCanvas) => WorkflowCanvas), options?: CanvasEditOptions) {
    const state = current.current;
    if (typeof update === "function" && !state.draft) return;
    const next = typeof update === "function" ? update(state.draft!) : update;
    if (same(state.draft, next)) return;
    if (state.draft) recordCanvasEdit(history.current, state.draft, options);
    const changed = !same(next, state.saved?.canvas);
    replace(next, state.saved, changed); setError(null);
    backup(next, state.saved, changed);
  }

  function travel(direction: "undo" | "redo") {
    const state = current.current;
    if (!state.draft) return;
    const next = moveCanvasHistory(history.current, state.draft, direction);
    if (!next) return;
    const changed = !same(next, state.saved?.canvas);
    replace(next, state.saved, changed); setError(null);
    backup(next, state.saved, changed);
  }

  async function canSwitch(): Promise<boolean> {
    if (inFlight.current) { setError("Wait for this save to finish before switching canvases."); return false; }
    if (current.current.dirty && !await save()) return false;
    if (current.current.dirty) { setError("New changes arrived while saving. Switch again to save them first."); return false; }
    return alive.current && scope.current === draftKey;
  }

  async function select(item: SavedCanvas | null) {
    if (item?.canvas.id === current.current.draft?.id || !await canSwitch()) return;
    try { if (item) localStorage.setItem(selectionKey, item.canvas.id); else localStorage.removeItem(selectionKey); }
    catch { setError("The selected canvas could not be remembered on this Mac."); }
    history.current = createCanvasHistory();
    replace(item?.canvas ?? null, item, false); setError(null);
  }

  function start(canvas: WorkflowCanvas) {
    history.current = createCanvasHistory();
    replace(canvas, null, true); setError(null); backup(canvas, null);
  }

  async function create(template: CanvasTemplate) {
    if (await canSwitch()) start(newCanvas(template));
  }

  async function duplicate() {
    if (await canSwitch() && current.current.draft) start(copyCanvas(current.current.draft));
  }

  async function save(): Promise<SavedCanvas | null> {
    const submitted = current.current;
    if (!submitted.draft || inFlight.current) return null;
    inFlight.current = true;
    loadVersion.current += 1;
    history.current.key = undefined;
    setSaving(true); setError(null);
    try {
      const result = await bridge.saveCanvas(workspaceId, parseCanvas(submitted.draft), submitted.saved?.revision ?? null);
      loadVersion.current += 1;
      // A save may finish after navigation. Clear only its own backup, never a newer draft.
      try {
        localStorage.setItem(selectionKey, result.canvas.id);
        if (localStorage.getItem(draftKey) === JSON.stringify({ canvas: submitted.draft, saved: submitted.saved })) localStorage.removeItem(draftKey);
      } catch { if (alive.current && scope.current === draftKey) setError("Canvas saved, but its local draft backup could not be cleared."); }
      if (!alive.current || scope.current !== draftKey) return result;
      const latest = current.current.draft;
      if (latest?.id === submitted.draft.id && !same(latest, submitted.draft)) {
        const changed = !same(latest, result.canvas);
        replace(latest, result, changed);
        backup(latest, result, changed);
      } else replace(result.canvas, result, false);
      setItems((values) => [...values.filter((value) => value.canvas.id !== result.canvas.id), result]);
      return result;
    } catch (cause) { if (alive.current && scope.current === draftKey) setError(cause instanceof Error ? cause.message : String(cause)); return null; }
    finally { inFlight.current = false; if (alive.current) setSaving(false); }
  }

  function discard() {
    if (inFlight.current) { setError("Wait for this save to finish before discarding the draft."); return; }
    try { localStorage.removeItem(draftKey); }
    catch { setError("The local draft could not be removed. Try again before leaving."); return; }
    history.current = createCanvasHistory();
    replace(current.current.saved?.canvas ?? null, current.current.saved, false); setError(null);
    void reload();
  }
  return { items, draft, saved, dirty, loading, saving, error, setError, edit, select, create, duplicate, save, discard, reload,
    undo: () => travel("undo"), redo: () => travel("redo"), canUndo: history.current.past.length > 0, canRedo: history.current.future.length > 0 };
}
