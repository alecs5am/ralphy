import { useRef, useState, type PointerEvent } from "react";
import { Captions, Film, Magnet, Mic, Music2, Pause, Play, Redo2, Scissors, SkipBack, SkipForward, Type, Undo2, Eye, EyeOff, Minus, Plus, LocateFixed } from "@/shared/ui/icons";
import type { ElementSnapshot } from "@hyperframes/sdk";
import type { VideoEditor } from "../model/useVideoWorkspace";
import type { VideoTransport } from "./VideoStage";
import { changeTiming, elementName, frameTime, timecode, TRACKS, trimClip } from "../lib/composition";

const ICONS = [Film, Type, Captions, Mic, Music2];
export function VideoTimeline({ editor, transport, seek, toggle }: { editor: VideoEditor; transport: VideoTransport; seek(time: number): void; toggle(): void }) {
  const [zoom, setZoom] = useState(1), [snap, setSnap] = useState(true);
  const [draft, setDraft] = useState<{ id: string; start: number; duration: number } | null>(null);
  const drag = useRef<{ item: ElementSnapshot; x: number; scale: number; delta: number; edge?: "start" | "end"; moved: boolean } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const duration = editor.info?.duration ?? 18;
  const maxTrack = Math.max(4, ...editor.elements.map((item) => item.trackIndex ?? 0));
  const tracks = Array.from({ length: Math.min(30, maxTrack + 1) }, (_, index) => index);
  const steps = Math.ceil(duration / (duration > 60 ? 10 : duration > 24 ? 5 : 2));
  const begin = (event: PointerEvent<HTMLElement>, item: ElementSnapshot) => {
    if (event.button !== 0 || !editor.comp) return;
    event.stopPropagation();
    if (!editor.selection.includes(item.scopedId)) editor.select(item.scopedId, event.shiftKey || event.metaKey);
    else if (event.shiftKey || event.metaKey) { editor.select(item.scopedId, true); return; }
    const row = event.currentTarget.parentElement!;
    const edge = (event.target as HTMLElement).dataset.edge as "start" | "end" | undefined;
    drag.current = { item, x: event.clientX, scale: row.getBoundingClientRect().width / duration, delta: 0, edge, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || !current.scale) return;
    if (Math.abs(event.clientX - current.x) < 3 && !current.moved) return;
    current.moved = true;
    let delta = frameTime((event.clientX - current.x) / current.scale, editor.fps);
    const start = current.item.start ?? 0, length = current.item.duration ?? 1;
    if (snap) {
      const anchors = [0, transport.time, duration, ...editor.elements.filter((item) => !editor.selection.includes(item.scopedId)).flatMap((item) => [item.start!, item.start! + item.duration!])];
      const edgeTime = current.edge === "end" ? start + length : start;
      const near = anchors.find((anchor) => Math.abs(anchor - edgeTime - delta) * current.scale < 7);
      if (near !== undefined) delta = near - edgeTime;
    }
    const selected = editor.elements.filter((item) => editor.selection.includes(item.scopedId));
    if (!current.edge) delta = Math.min(duration - Math.max(...selected.map((item) => item.start! + item.duration!)), Math.max(-Math.min(...selected.map((item) => item.start!)), delta));
    else if (current.edge === "start") delta = Math.max(-start, current.item.tag === "video" || current.item.tag === "audio" ? -Number(current.item.attributes["data-media-start"] || 0) : -Infinity, Math.min(length - 1 / editor.fps, delta));
    else delta = Math.max(1 / editor.fps - length, Math.min(duration - start - length, delta));
    current.delta = delta;
    setDraft({ id: current.item.scopedId, start: start + (current.edge !== "end" ? delta : 0), duration: length + (current.edge === "start" ? -delta : current.edge === "end" ? delta : 0) });
  };
  const end = () => {
    const current = drag.current; drag.current = null; setDraft(null);
    if (!current?.moved || !editor.comp) return;
    editor.attempt(() => {
      if (current.edge) trimClip(editor.comp!, current.item.scopedId, current.edge, current.delta, editor.fps);
      else editor.comp!.batch(() => { for (const item of editor.elements.filter((item) => editor.selection.includes(item.scopedId))) changeTiming(editor.comp!, item.scopedId, item.start! + current.delta, item.duration!, editor.fps); });
    });
  };
  const cancel = () => { drag.current = null; setDraft(null); };
  return <section className="video-timeline" aria-label="Video timeline" onKeyDown={(event) => { if (event.key === "Escape" && drag.current) { event.stopPropagation(); cancel(); } }}>
    <div className="video-transport">
      <div className="video-transport-actions"><button type="button" aria-label="Previous frame" onClick={() => seek(transport.time - 1 / editor.fps)}><SkipBack size={13} /></button><button className="video-play" type="button" disabled={!transport.ready} aria-label={transport.playing ? "Pause" : "Play"} onClick={toggle}>{transport.playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button><button type="button" aria-label="Next frame" onClick={() => seek(transport.time + 1 / editor.fps)}><SkipForward size={13} /></button><strong className="video-timecode">{timecode(transport.time, editor.fps)}</strong><span className="video-time-total">/ {timecode(duration, editor.fps)}</span></div>
      <div className="video-transport-tools"><button type="button" disabled={!editor.comp?.canUndo()} aria-label="Undo" title="Undo · ⌘Z" onClick={editor.undo}><Undo2 size={14} /></button><button type="button" disabled={!editor.comp?.canRedo()} aria-label="Redo" title="Redo · ⇧⌘Z" onClick={editor.redo}><Redo2 size={14} /></button><i /><button type="button" aria-label="Split at playhead" disabled={!editor.selection.length} title="Split · S" onClick={() => editor.split(transport.time)}><Scissors size={14} /></button><button type="button" aria-label="Snap to clips" aria-pressed={snap} title="Snap to clips" onClick={() => setSnap(!snap)}><Magnet size={14} /></button><span className="video-edit-mode">NON-RIPPLE</span></div>
      <div className="video-timeline-zoom"><button type="button" aria-label="Zoom out timeline" onClick={() => setZoom(Math.max(1, zoom - .5))}><Minus size={13} /></button><button type="button" aria-label="Fit timeline" onClick={() => { setZoom(1); scroller.current?.scrollTo({ left: 0 }); }}><LocateFixed size={14} /></button><button type="button" aria-label="Zoom in timeline" onClick={() => setZoom(Math.min(8, zoom + .5))}><Plus size={13} /></button></div>
    </div>
    <div className="video-timeline-scroll" ref={scroller}>
      <div className="video-timeline-grid" style={{ minWidth: `${zoom * 100}%` }}>
        <div className="video-track-label video-ruler-label">{editor.elements.length} CLIPS</div><div className="video-ruler">
          {Array.from({ length: steps + 1 }, (_, index) => <span key={index} style={{ left: `${index / steps * 100}%` }}>{timecode(index / steps * duration, editor.fps).slice(0, 5)}</span>)}
          <input aria-label="Playhead" type="range" min="0" max={duration} step={1 / editor.fps} value={transport.time} onChange={(event) => seek(Number(event.currentTarget.value))} />
        </div>
        {tracks.map((index) => {
          const Icon = ICONS[index] ?? Film, clips = editor.elements.filter((item) => (item.trackIndex ?? 0) === index);
          const hidden = clips.length > 0 && clips.every((item) => item.attributes["data-hidden"] === "true");
          return <div className="video-track" key={index} data-kind={index === 0 ? "video" : index > 2 ? "audio" : "text"}>
            <div className="video-track-label"><Icon size={13} /><span>{TRACKS[index] ?? `Track ${index + 1}`}</span><button type="button" aria-label={`${hidden ? "Show" : "Hide"} ${TRACKS[index] ?? `track ${index + 1}`}`} disabled={!clips.length} onClick={() => editor.attempt(() => editor.comp?.batch(() => clips.forEach((item) => editor.comp!.setAttribute(item.scopedId, "data-hidden", hidden ? null : "true"))))}>{hidden ? <EyeOff size={12} /> : <Eye size={12} />}</button></div>
            <div className="video-track-clips" role="group" aria-label={TRACKS[index] ?? `Track ${index + 1}`} onDoubleClick={(event) => { if (event.target === event.currentTarget) seek((event.clientX - event.currentTarget.getBoundingClientRect().left) / event.currentTarget.clientWidth * duration); }}>
              {clips.map((item) => {
                const selected = editor.selection.includes(item.scopedId);
                const shown = draft?.id === item.scopedId ? draft : draft && selected && !drag.current?.edge ? { start: item.start! + drag.current!.delta, duration: item.duration! } : { start: item.start!, duration: item.duration! };
                const asset = editor.assets.find((asset) => asset.src === item.attributes.src?.replace(/^\.\//, ""));
                return <div key={item.scopedId} className="video-clip" role="button" tabIndex={0} aria-label={`${elementName(item)}, ${timecode(item.start!, editor.fps)} to ${timecode(item.start! + item.duration!, editor.fps)}`} aria-pressed={selected} data-selected={selected} data-hidden={item.attributes["data-hidden"] === "true"} style={{ left: `${shown.start / duration * 100}%`, width: `${shown.duration / duration * 100}%` }} onPointerDown={(event) => begin(event, item)} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel} onKeyDown={(event) => { if (event.key === "Enter") editor.select(item.scopedId, event.shiftKey); }}>
                  <span className="video-trim-handle" data-edge="start" />
                  {asset?.kind === "image" && asset.previewUrl && <img src={asset.previewUrl} alt="" draggable={false} />}
                  <span className="video-clip-title">{elementName(item)}</span>
                  {index > 2 && <span className="video-audio-line" aria-hidden="true" />}
                  <span className="video-trim-handle" data-edge="end" />
                </div>;
              })}
              <div className="video-playhead" style={{ left: `${transport.time / duration * 100}%` }} aria-hidden="true" />
            </div>
          </div>;
        })}
      </div>
    </div>
  </section>;
}
