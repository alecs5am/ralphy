import { useCallback, useEffect, useRef, useState } from "react";
import { openComposition, type Composition, type EditOp } from "@hyperframes/sdk";
import { bridge } from "@/shared/api/ipc";
import { videoHtml, type VideoWorkspaceRef, type VideoWorkspaceLoad, type VideoWorkspaceAsset } from "../../../../shared/video-workspace";
import { addClip, compositionInfo, duplicateClip, splitClip, timelineElements } from "../lib/composition";
import { videoAssetMetadata } from "../lib/media";

export function useVideoWorkspace(ref: VideoWorkspaceRef) {
  const [comp, setComp] = useState<Composition | null>(null);
  const [loaded, setLoaded] = useState<VideoWorkspaceLoad | null>(null);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false), [rendering, setRendering] = useState(false);
  const [fps, setFps] = useState(30), [assets, setAssets] = useState<VideoWorkspaceAsset[]>([]);
  const [savedHtml, setSavedHtml] = useState("");
  const revision = useRef<string | null>(null), active = useRef(true);
  const saveFlight = useRef<Promise<string | null> | null>(null);
  const renderFlight = useRef(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const currentComp = useRef<Composition | null>(null);
  const backupKey = useRef(""), currentFps = useRef(fps);
  const lastSaved = useRef({ html: "", fps: 30 });
  currentFps.current = fps;
  const backup = () => {
    if (!currentComp.current || !backupKey.current) return;
    try { localStorage.setItem(backupKey.current, JSON.stringify({ html: currentComp.current.serialize(), fps: currentFps.current, revision: revision.current })); }
    catch { setError("Draft backup is unavailable. Save this video before leaving."); }
  };
  useEffect(() => {
    active.current = true;
    let current = true, session: Composition | null = null;
    setError(null); setComp(null); setLoaded(null);
    void bridge.loadVideoWorkspace(ref).then(async (value) => {
      if (!current) return;
      backupKey.current = `ralphy.video-draft:${value.draftPath ?? JSON.stringify(ref)}`;
      let recovered: { html: string; fps: number; revision: string } | null = null;
      try { const raw = localStorage.getItem(backupKey.current); if (raw) { const next = JSON.parse(raw); videoHtml(next.html); if ([24, 25, 30, 60].includes(next.fps)) recovered = next; } } catch { setError("The local recovery copy could not be read. The saved video is unchanged."); }
      session = await openComposition(value.draft.html, { coalesceMs: 350 });
      if (!current) { session.dispose(); return; }
      // Persist SDK identifiers too: agent selection references must exist in the saved source.
      const html = value.draft.html;
      if (recovered && (recovered.html !== html || recovered.fps !== value.draft.fps)) {
        session.dispose(); session = await openComposition(recovered.html, { coalesceMs: 350 });
        if (!current) { session.dispose(); return; }
        if (recovered.revision !== value.revision) {
          value.versions = [{ id: value.revision ?? "saved-source", html: value.draft.html, savedAt: value.draft.updatedAt }, ...value.versions].slice(0, 8);
          setError("Recovered your local edits. The saved video also changed; review both in Versions before saving, or reload to use the saved video.");
        }
      }
      const original = session.getElements().find((item) => item.attributes["data-editor-probe"] === "true");
      if (original) {
        const asset = value.draft.assets.find((asset) => asset.src === original.attributes.src);
        const metadata = asset && await videoAssetMetadata(asset);
        if (!current) { session.dispose(); return; }
        if (!metadata) throw new Error("The original video’s duration could not be read. Check that its media file is available and supported.");
        const root = compositionInfo(session).root!;
        session.batch(() => {
          session!.dispatch({ type: "setCompositionMetadata", duration: metadata.duration, width: metadata.width || 1080, height: metadata.height || 1920 });
          session!.setStyle(root.scopedId, { width: `${metadata.width || 1080}px`, height: `${metadata.height || 1920}px` });
          session!.setTiming(original.scopedId, { duration: metadata.duration }); session!.setAttribute(original.scopedId, "data-editor-probe", null);
        });
      }
      session.on("change", () => { backup(); setTick((value) => value + 1); });
      session.on("selectionchange", () => setTick((value) => value + 1));
      currentComp.current = session;
      revision.current = value.revision;
      lastSaved.current = { html, fps: value.draft.fps };
      setLoaded(value); setAssets(value.draft.assets); setFps(recovered?.fps ?? value.draft.fps); setSavedHtml(html); setComp(session);
    }).catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { current = false; active.current = false; currentComp.current?.dispose(); session?.dispose(); };
  }, [ref.workspaceId, ref.projectId, ref.unitId, loadAttempt]);

  const fail = useCallback((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)), []);
  const html = comp?.serialize() ?? "";
  const missingMedia = comp?.getElements().filter((item) => ["img", "video", "audio"].includes(item.tag) && item.attributes.src && !item.attributes.src.startsWith("data:") && !assets.some((asset) => !asset.missing && asset.src.replace(/^\.\//, "") === item.attributes.src.replace(/^\.\//, ""))) ?? [];
  const dirty = !!comp && (html !== savedHtml || fps !== loaded?.draft.fps);
  const save = useCallback(async (): Promise<string | null> => {
    if (!comp) return null;
    while (saveFlight.current) { await saveFlight.current; }
    if (comp !== currentComp.current || !active.current) return null;
    const source = comp.serialize();
    if (source === lastSaved.current.html && fps === lastSaved.current.fps) return revision.current;
    setSaving(true);
    const key = backupKey.current;
    const request = bridge.saveVideoWorkspace(ref, source, fps, revision.current).then((value) => {
      try { const raw = localStorage.getItem(key); if (raw) { const copy = JSON.parse(raw); if (copy.html === source && copy.fps === fps) localStorage.removeItem(key); } } catch { /* Preserve recovery data if storage is unavailable. */ }
      if (!active.current || currentComp.current !== comp) return value.revision;
      revision.current = value.revision;
      lastSaved.current = { html: source, fps };
      setLoaded(value); setSavedHtml(source); setError(null);
      return value.revision;
    }).catch((cause) => { if (active.current) fail(cause); return null; }).finally(() => { saveFlight.current = null; if (active.current) setSaving(false); });
    saveFlight.current = request;
    return request;
  }, [comp, savedHtml, fps, loaded?.draft.fps, ref.workspaceId, ref.projectId, ref.unitId, fail]);

  useEffect(() => { if (comp && fps !== lastSaved.current.fps) backup(); }, [fps, comp]);

  useEffect(() => {
    if (!dirty || error || rendering) return;
    const timer = window.setTimeout(() => void save(), 1100);
    return () => window.clearTimeout(timer);
  }, [dirty, html, fps, save, error, rendering]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => { if (dirty || saving || rendering) event.preventDefault(); };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, saving, rendering]);

  const edit = (op: EditOp) => {
    if (!comp) return;
    try { const available = comp.can(op); if (!available.ok) throw new Error(available.message); comp.dispatch(op); setError(null); } catch (cause) { fail(cause); }
  };
  const attempt = (run: () => void) => { try { run(); setError(null); } catch (cause) { fail(cause); } };
  const select = (id: string, additive = false) => comp?.setSelection(additive ? comp.getSelection().includes(id) ? comp.getSelection().filter((key) => key !== id) : [...comp.getSelection(), id] : [id]);
  const importAsset = async (file?: File) => {
    try {
      const asset = await bridge.importVideoWorkspaceAsset(ref, file);
      if (asset && active.current) setAssets((items) => [...items, asset]);
      return asset;
    } catch (cause) { fail(cause); return null; }
  };
  const insert = (asset: VideoWorkspaceAsset | null, at: number, duration?: number) => attempt(() => { if (comp) comp.setSelection([addClip(comp, asset, at, duration)]); });
  const render = async () => {
    if (renderFlight.current || !comp) return;
    renderFlight.current = true;
    setRendering(true);
    try {
      const expected = await save();
      if (!expected) return;
      const result = await bridge.renderVideoWorkspace(ref, expected);
      const latest = await bridge.loadVideoWorkspace(ref);
      if (active.current) { revision.current = latest.revision; setLoaded({ ...latest, render: result }); }
    } catch (cause) {
      fail(cause);
      // A failed render may already have sealed its source. Refresh metadata, keeping local edits.
      try { const latest = await bridge.loadVideoWorkspace(ref); if (active.current) { revision.current = latest.revision; setLoaded(latest); } } catch { /* Keep the actionable render error. */ }
    } finally { renderFlight.current = false; if (active.current) setRendering(false); }
  };
  const restore = async (html: string) => {
    if (!await save()) return;
    try {
      const next = await openComposition(html, { coalesceMs: 350 });
      if (!active.current) { next.dispose(); return; }
      next.on("change", () => { backup(); setTick((value) => value + 1); });
      next.on("selectionchange", () => setTick((value) => value + 1));
      currentComp.current?.dispose(); currentComp.current = next; backup(); setComp(next); setError(null);
    } catch (cause) { fail(cause); }
  };
  return {
    comp, loaded, assets, missingMedia, fps, setFps, tick, html, dirty, error, saving, rendering, save, render, restore, fail, attempt, edit, select, importAsset, insert,
    retry: () => { try { if (backupKey.current) localStorage.removeItem(backupKey.current); } catch { /* The saved source can still be opened. */ } setLoadAttempt((value) => value + 1); },
    selection: comp?.getSelection() ?? [], elements: comp ? timelineElements(comp) : [], info: comp ? compositionInfo(comp) : null,
    duplicate: () => attempt(() => { if (comp) comp.batch(() => { const ids = comp.getSelection().map((id) => duplicateClip(comp, id)).filter((id): id is string => !!id); comp.setSelection(ids); }); }),
    split: (at: number) => attempt(() => { if (comp) comp.batch(() => { for (const id of comp.getSelection()) splitClip(comp, id, at, fps); }); }),
    remove: () => attempt(() => { if (comp) comp.batch(() => { for (const id of comp.getSelection()) comp.removeElement(id); comp.setSelection([]); }); }),
    undo: () => attempt(() => comp?.undo()), redo: () => attempt(() => comp?.redo()),
  };
}
export type VideoEditor = ReturnType<typeof useVideoWorkspace>;
