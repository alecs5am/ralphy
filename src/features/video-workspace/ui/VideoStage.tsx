import { createElement, useEffect, useRef, useState } from "react";
import { Frame, Maximize2, Volume2, VolumeX } from "lucide-react";
import "@hyperframes/player";
import type { HyperframesPlayer } from "@hyperframes/player";
import { bridge } from "@/shared/api/ipc";
import type { VideoWorkspaceRef } from "../../../../shared/video-workspace";
import type { VideoEditor } from "../model/useVideoWorkspace";
import { videoPreviewHtml } from "../lib/preview";

export interface VideoTransport { player: HyperframesPlayer | null; time: number; playing: boolean; ready: boolean }
export function VideoStage({ editor, reference, transport, onTransport, compareHtml, guides, onGuides }: {
  editor: VideoEditor; reference: VideoWorkspaceRef; transport: VideoTransport;
  onTransport(value: Partial<VideoTransport>): void; compareHtml: string | null; guides: boolean; onGuides(): void;
}) {
  const [url, setUrl] = useState(""), [compareUrl, setCompareUrl] = useState("");
  const [previewError, setPreviewError] = useState<string | null>(null), [muted, setMuted] = useState(false);
  const player = useRef<HyperframesPlayer | null>(null), compare = useRef<HyperframesPlayer | null>(null);
  const source = useRef(0), time = useRef(transport.time), selection = useRef(editor.selection);
  const frame = useRef<HTMLDivElement>(null);
  time.current = transport.time; selection.current = editor.selection;
  useEffect(() => {
    const generation = ++source.current;
    if (!editor.html) return;
    const timer = setTimeout(() => {
      void bridge.previewVideoWorkspace(reference, videoPreviewHtml(editor.html, editor.assets)).then((next) => {
        if (source.current !== generation) return;
        setUrl(next); setPreviewError(null); onTransport({ ready: false, playing: false });
      }).catch((error) => { if (source.current === generation) setPreviewError(error.message); });
    }, 180);
    return () => { clearTimeout(timer); source.current++; };
  }, [editor.html, editor.assets, reference.unitId]);
  useEffect(() => {
    let current = true;
    setCompareUrl("");
    if (compareHtml) void bridge.previewVideoWorkspace(reference, videoPreviewHtml(compareHtml, editor.assets)).then((next) => { if (current) setCompareUrl(next); }).catch((error) => setPreviewError(error.message));
    return () => { current = false; };
  }, [compareHtml, editor.assets]);
  useEffect(() => {
    const element = player.current;
    if (!element) return;
    onTransport({ player: element });
    const highlight = () => element.iframeElement.contentWindow?.postMessage({ source: "ralphy-video-highlight", ids: selection.current }, "*");
    const ready = () => { element.seek(time.current); element.muted = muted; highlight(); onTransport({ ready: true, playing: false }); };
    const sync = () => { onTransport({ time: element.currentTime, playing: !element.paused }); if (compare.current?.ready) { compare.current.seek(element.currentTime); if (!element.paused) compare.current.play(); else compare.current.pause(); } };
    const error = (event: Event) => setPreviewError((event as CustomEvent).detail?.message ?? "Preview could not be loaded");
    element.addEventListener("ready", ready); element.addEventListener("error", error);
    for (const event of ["timeupdate", "play", "pause", "ended"]) element.addEventListener(event, sync);
    return () => { element.pause(); element.removeEventListener("ready", ready); element.removeEventListener("error", error); for (const event of ["timeupdate", "play", "pause", "ended"]) element.removeEventListener(event, sync); };
  }, [url]);
  useEffect(() => {
    const element = compare.current;
    const ready = () => { element?.seek(time.current); if (element) element.muted = true; };
    element?.addEventListener("ready", ready);
    return () => element?.removeEventListener("ready", ready);
  }, [compareUrl]);
  useEffect(() => { player.current?.iframeElement.contentWindow?.postMessage({ source: "ralphy-video-highlight", ids: editor.selection }, "*"); }, [editor.selection.join(","), url]);
  useEffect(() => {
    const message = (event: MessageEvent) => {
      if (event.source !== player.current?.iframeElement.contentWindow) return;
      const { source, id, x, y, shift } = event.data ?? {};
      if (typeof id !== "string" || !editor.comp?.getElement(id)) return;
      if (source === "ralphy-video-selection") { editor.select(id, !!shift); player.current?.closest<HTMLElement>(".video-workspace")?.focus(); }
      if (source === "ralphy-video-move" && Number.isFinite(x) && Number.isFinite(y) && !editor.comp.getElement(id)?.animationIds.length) editor.edit({ type: "setStyle", target: id, styles: { left: `${x}px`, top: `${y}px`, right: "auto", bottom: "auto" } });
    };
    window.addEventListener("message", message);
    return () => window.removeEventListener("message", message);
  }, [editor.comp, editor.tick]);
  const info = editor.info;
  return <section className="video-stage" aria-label="Video preview">
    <div className="video-stage-toolbar"><span>{info?.width} × {info?.height}<i />{editor.fps} FPS</span><div>
      <button type="button" onClick={onGuides} aria-pressed={guides} title="Safe area guides" aria-label="Safe area guides"><Frame size={14} /></button>
      <button type="button" onClick={() => { setMuted(!muted); if (player.current) player.current.muted = !muted; if (compare.current) compare.current.muted = true; }} aria-label={muted ? "Unmute preview" : "Mute preview"}>{muted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
      <button type="button" onClick={() => frame.current?.requestFullscreen().catch(editor.fail)} aria-label="Fullscreen preview"><Maximize2 size={14} /></button>
    </div></div>
    <div className="video-stage-frames" data-compare={!!compareHtml} ref={frame}>
      {compareHtml && <div className="video-stage-column"><span className="video-stage-badge">Saved version</span><div className="video-stage-fit" style={{ aspectRatio: `${info?.width ?? 1080} / ${info?.height ?? 1920}` }}>{createElement("hyperframes-player", { ref: compare, src: compareUrl || undefined, "sandbox-origin": "", width: info?.width, height: info?.height, muted: "" })}</div></div>}
      <div className="video-stage-column"><span className="video-stage-badge">{compareHtml ? "Current draft" : "Preview"}</span><div className="video-stage-fit" style={{ aspectRatio: `${info?.width ?? 1080} / ${info?.height ?? 1920}` }}>
        {createElement("hyperframes-player", { ref: player, src: url || undefined, "sandbox-origin": "", width: info?.width, height: info?.height })}
        {guides && <div className="video-safe-guides" aria-hidden="true"><span>SAFE AREA</span></div>}
        {!url && <span className="video-stage-loading">Opening preview…</span>}
      </div></div>
    </div>
    {previewError && <p className="video-stage-error" role="alert">{previewError}</p>}
  </section>;
}
