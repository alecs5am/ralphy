import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Columns2, Film, History, LoaderCircle, Maximize2, PanelLeftOpen, PanelRightClose, PanelRightOpen, Play, RotateCcw, Save, SlidersHorizontal, Sparkles, Type, X } from "@/shared/ui/icons";
import { PageHeader, PageHeaderHost, usePageHeaderHost, PAGE_HEADER_BUTTON, PAGE_HEADER_PRIMARY } from "@/shared/ui/PageHeader";
import { ResizeHandle } from "@/shared/ui/ResizeHandle";
import type { VideoAgentRequest, VideoWorkspaceRef } from "../../../../shared/video-workspace";
import { useVideoWorkspace } from "../model/useVideoWorkspace";
import { VideoStage, type VideoTransport } from "./VideoStage";
import { VideoTimeline } from "./VideoTimeline";
import { VideoInspector } from "./VideoInspector";
import { VideoLibrary } from "./VideoLibrary";
import { VideoAgent, VideoHistory } from "./VideoHistory";

export function VideoWorkspace({ reference, title, onClose, onRequestAgent }: { reference: VideoWorkspaceRef; title: string; onClose(): void; onRequestAgent?(request: VideoAgentRequest): void }) {
  const editor = useVideoWorkspace(reference);
  const [tab, setTab] = useState<"inspector" | "agent" | "versions">("inspector");
  const [transport, setTransport] = useState<VideoTransport>({ player: null, time: 0, playing: false, ready: false });
  const [library, setLibrary] = useState(true), [inspector, setInspector] = useState(true), [compact, setCompact] = useState(false);
  const [guides, setGuides] = useState(false), [compare, setCompare] = useState<string | null>(null), [dropping, setDropping] = useState(false);
  const root = useRef<HTMLElement>(null);
  const headerHost = usePageHeaderHost(), [fullscreen, setFullscreen] = useState(false);
  useEffect(() => { const change = () => setFullscreen(document.fullscreenElement === root.current); document.addEventListener("fullscreenchange", change); return () => document.removeEventListener("fullscreenchange", change); }, []);
  const [timelineHeight, setTimelineHeight] = useState(244), [resizing, setResizing] = useState(false);
  const updateTransport = useCallback((next: Partial<VideoTransport>) => setTransport((value) => ({ ...value, ...next })), []);
  useEffect(() => {
    if (!root.current) return;
    root.current.focus();
    const observer = new ResizeObserver(([entry]) => { const small = entry.contentRect.width < 1040; setCompact((value) => { if (value !== small) setLibrary(!small); return small; }); });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const seek = (value: number) => { const time = Math.min(editor.info?.duration ?? 18, Math.max(0, value)); transport.player?.pause(); transport.player?.seek(time); updateTransport({ time, playing: false }); };
  const toggle = () => { if (!transport.ready) return; if (transport.player?.paused) transport.player.play(); else transport.player?.pause(); };
  const close = async () => { if (editor.rendering) { editor.fail("Wait for the active render to finish before closing this workspace."); return; } if (editor.dirty && !await editor.save()) return; onClose(); };
  const reload = () => { if (!editor.dirty || window.confirm("Reload the saved draft? Unsaved edits will be discarded.")) { transport.player?.pause(); editor.retry(); } };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat || !editor.comp) return;
      const target = event.target as HTMLElement;
      if (target.closest("input,textarea,select,[contenteditable=true],[role=dialog],[role=listbox],[role=separator]")) return;
      if (event.metaKey || event.ctrlKey) {
        if (event.key.toLowerCase() === "a") { event.preventDefault(); editor.comp.setSelection(editor.elements.map((item) => item.scopedId)); }
        if (event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) editor.redo(); else editor.undo(); }
        if (event.key.toLowerCase() === "s") { event.preventDefault(); void editor.save(); }
        if (event.key.toLowerCase() === "d") { event.preventDefault(); editor.duplicate(); }
        return;
      }
      if (event.altKey || target.closest("button,a")) return;
      if (event.code === "Space") { event.preventDefault(); toggle(); }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); seek(transport.time + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 10 : 1) / editor.fps); }
      if (event.key.toLowerCase() === "s") { event.preventDefault(); editor.split(transport.time); }
      if (event.key === "Backspace" || event.key === "Delete") { event.preventDefault(); editor.remove(); }
      if (event.key === "Escape") editor.comp.setSelection([]);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [editor.tick, editor.comp, editor.html, editor.save, transport, editor.fps]);
  return <main className="video-workspace" ref={root} tabIndex={-1} data-compact={compact} data-resizing={resizing} aria-label={`${title} video editor`} onDropCapture={() => setDropping(false)} onDragOver={(event) => { if (event.dataTransfer.types.includes("Files") || event.dataTransfer.types.includes("application/x-ralphy-video-asset")) event.preventDefault(); }} onDrop={async (event) => {
    if (event.defaultPrevented) return;
    event.preventDefault(); setDropping(false);
    const asset = editor.assets.find((item) => item.src === event.dataTransfer.getData("application/x-ralphy-video-asset"));
    if (asset) editor.insert(asset, transport.time);
    for (const file of Array.from(event.dataTransfer.files)) { const added = await editor.importAsset(file); if (added && ["image", "video", "audio"].includes(added.kind)) editor.insert(added, transport.time); }
  }}>
    <PageHeaderHost.Provider value={fullscreen ? null : headerHost}><PageHeader title={title} icon={Film} meta={<span className="video-save-state">{editor.saving ? <LoaderCircle size={11} /> : editor.dirty ? <span className="video-unsaved-dot" /> : <Check size={11} />}{editor.saving ? "Saving" : editor.dirty ? "Draft" : "Saved"}</span>}>
      <button type="button" className={PAGE_HEADER_BUTTON} aria-label="Back to Units" onClick={() => void close()}><ArrowLeft size={14} /></button>
      <button type="button" className={PAGE_HEADER_BUTTON} aria-label="Save video draft" title="Save · ⌘S" disabled={!editor.comp || editor.saving || editor.rendering} onClick={() => void editor.save()}><Save size={14} /></button>
      <button type="button" className={PAGE_HEADER_BUTTON} aria-label="Reload saved video" title="Reload saved draft" disabled={editor.rendering || editor.saving} onClick={reload}><RotateCcw size={14} /></button>
      <button type="button" className={PAGE_HEADER_BUTTON} aria-pressed={!!compare} title="Compare saved drafts" onClick={() => { if (compare) setCompare(null); else { setTab("versions"); setInspector(true); const previous = editor.loaded?.versions[0]; if (previous) setCompare(previous.html); } }}><Columns2 size={14} /><span className="video-header-label">Compare</span></button>
      <button type="button" className={PAGE_HEADER_BUTTON} aria-pressed={inspector && tab === "agent"} onClick={() => { setTab("agent"); setInspector(true); }}><Sparkles size={14} /><span className="video-header-label">Ask agent</span></button>
      <button type="button" className={PAGE_HEADER_BUTTON} aria-label={fullscreen ? "Exit fullscreen editor" : "Expand video editor"} onClick={() => (fullscreen ? document.exitFullscreen() : root.current?.requestFullscreen())?.catch(editor.fail)}><Maximize2 size={14} /></button>
      <button type="button" className={PAGE_HEADER_PRIMARY} disabled={!editor.comp || editor.rendering || !!editor.missingMedia.length || !editor.loaded?.draft.checkoutPath} title={editor.missingMedia.length ? "Replace unavailable media before rendering" : !editor.loaded?.draft.checkoutPath ? "A valid Composition source is needed to render this Unit" : "Render this exact saved draft"} onClick={() => void editor.render()}>{editor.rendering ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />}<span>{editor.rendering ? "Rendering" : "Render"}</span></button>
    </PageHeader></PageHeaderHost.Provider>
    {!editor.comp ? <div className="video-workspace-loading" role={editor.error ? "alert" : "status"}><Film size={28} /><strong>{editor.error ?? "Opening your video workspace…"}</strong>{editor.error && <button type="button" onClick={reload}>Try again</button>}</div> : <>
      {editor.error && <div className="video-workspace-error" role="alert"><span>{editor.error}</span><button type="button" disabled={editor.saving || editor.rendering} onClick={() => void (editor.renderError ? editor.render() : editor.save())}>{editor.renderError ? "Retry render" : "Retry save"}</button><button type="button" aria-label="Dismiss editor message" onClick={() => editor.attempt(() => undefined)}><X size={14} /></button></div>}
      {editor.loaded?.draft.sourceWarning && <div className="video-workspace-error" role="status">{editor.loaded.draft.sourceWarning}</div>}
      {!!editor.missingMedia.length && <div className="video-workspace-error" role="status"><Film size={14} /><span>{editor.missingMedia.length} media {editor.missingMedia.length === 1 ? "file is" : "files are"} unavailable. Replace the source to restore the preview.</span><button type="button" onClick={() => { editor.select(editor.missingMedia[0].scopedId); setTab("inspector"); setInspector(true); }}>Locate clip</button></div>}
      <div className="video-workspace-layout" data-library={library} data-inspector={inspector} onDragOver={(event) => { if (event.dataTransfer.types.some((type) => type === "Files" || type === "application/x-ralphy-video-asset")) { event.preventDefault(); setDropping(true); } }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropping(false); }} onDrop={async (event) => {
        event.preventDefault(); setDropping(false);
        const src = event.dataTransfer.getData("application/x-ralphy-video-asset"), files = Array.from(event.dataTransfer.files);
        const asset = editor.assets.find((item) => item.src === src);
        if (asset) editor.insert(asset, transport.time);
        for (const file of files) { const added = await editor.importAsset(file); if (added && !["font", "other"].includes(added.kind)) editor.insert(added, transport.time); }
      }}>
        {library ? <VideoLibrary editor={editor} at={transport.time} seek={seek} onCollapse={() => setLibrary(false)} /> : <div className="video-library-rail"><button type="button" aria-label="Open video library" onClick={() => setLibrary(true)}><PanelLeftOpen size={17} /></button><button type="button" aria-label="Add title at playhead" onClick={() => editor.insert(null, transport.time)}><Type size={17} /></button></div>}
        <VideoStage editor={editor} reference={reference} transport={transport} onTransport={updateTransport} guides={guides} onGuides={() => setGuides(!guides)} compareHtml={compare} />
        {compare && <button className="video-end-compare" type="button" onClick={() => setCompare(null)}><X size={13} />Close comparison</button>}
        {inspector ? <aside className="video-right-panel" aria-label="Video properties"><div className="video-panel-tabs" role="group" aria-label="Video tools">
          {(["inspector", "agent", "versions"] as const).map((value) => { const Icon = value === "inspector" ? SlidersHorizontal : value === "agent" ? Sparkles : History; return <button type="button" key={value} aria-pressed={tab === value} onClick={() => setTab(value)}><Icon size={13} />{value[0].toUpperCase() + value.slice(1)}</button>; })}
          <button type="button" aria-label="Hide video inspector" onClick={() => setInspector(false)}><PanelRightClose size={13} /></button>
        </div><div className="video-panel-scroll">{tab === "inspector" ? <VideoInspector editor={editor} at={transport.time} /> : tab === "versions" ? <VideoHistory editor={editor} onCompare={setCompare} /> : <VideoAgent editor={editor} reference={reference} title={title} at={transport.time} onRequest={onRequestAgent} />}</div></aside>
          : <button className="video-show-inspector" type="button" aria-label="Open video inspector" onClick={() => setInspector(true)}><PanelRightOpen size={16} /></button>}
        {dropping && <div className="video-drop-indicator"><Film size={24} /><strong>Add media at the playhead</strong></div>}
        {editor.loaded?.draft.sourceKind === "file" && <span className="video-source-note" title={editor.loaded.draft.sourceWarning}>Original media · one clip{!editor.loaded.draft.checkoutPath && " · Rendering needs a composition source"}</span>}
      </div>
      <div className="video-timeline-container" style={{ height: timelineHeight }}>
        <ResizeHandle ariaLabel="Resize timeline" orientation="horizontal" value={timelineHeight} min={180} max={Math.max(244, (root.current?.clientHeight ?? 700) * .58)} defaultValue={244} direction={-1} className="video-timeline-resize" onChange={setTimelineHeight} onActiveChange={setResizing} />
        <VideoTimeline editor={editor} transport={transport} seek={seek} toggle={toggle} />
      </div>
    </>}
  </main>;
}
