import { useRef } from "react";
import { Captions, Copy, Film, SlidersHorizontal, Trash2, Type, Upload, Volume2, WandSparkles } from "@/shared/ui/icons";
import { GenerationParameter } from "@/entities/generation";
import { Window, WindowBody, WindowTitlebar } from "@/shared/ui/Window";
import { INSTRUMENT_PALETTE } from "@/shared/instrument/palette";
import type { VideoEditor } from "../model/useVideoWorkspace";
import { changeTiming, elementName, TRACKS, videoElement } from "../lib/composition";
import { videoAssetMetadata } from "../lib/media";

function NumberField({ label, value, min = 0, max = 10000, step = 1, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange(value: number): void }) {
  return <label className="video-number-field"><span>{label}</span><input aria-label={label} type="number" min={min} max={max} step={step} value={Number(value.toFixed(3))} onChange={(event) => { if (event.currentTarget.value !== "" && Number.isFinite(event.currentTarget.valueAsNumber)) onChange(Math.max(min, Math.min(max, event.currentTarget.valueAsNumber))); }} /></label>;
}
export function VideoInspector({ editor, at }: { editor: VideoEditor; at: number }) {
  const replacement = useRef<HTMLInputElement>(null);
  const item = editor.selection.length === 1 && editor.comp ? videoElement(editor.comp, editor.selection[0]) : null;
  const style = (key: string, value: string) => item && editor.edit({ type: "setStyle", target: item.scopedId, styles: { [key]: value } });
  const parameter = (id: string, label: string, value: number, min: number, max: number, step: number, onChange: (value: number) => void) => <GenerationParameter field={{ id: `video-${id}`, label, type: "number", min, max, step }} value={value} onChange={(next) => { if (typeof next === "number" && Number.isFinite(next)) onChange(next); }} />;
  const choices = (id: string, label: string, value: string, options: { value: string; label: string }[], onChange: (value: string) => void) => <GenerationParameter field={{ id: `video-${id}`, label, type: "choice", options }} value={value} onChange={(next) => onChange(String(next))} />;
  const info = editor.info;
  const isText = item?.text !== null && item?.text !== undefined;
  const replace = async (file?: File) => {
    if (!item) return;
    const asset = await editor.importAsset(file);
    if (!asset) return;
    if (asset.kind !== (item.tag === "img" ? "image" : item.tag)) { editor.fail("Choose the same media type to replace this clip. The file is available in Assets."); return; }
    if (asset.kind !== "image") {
      const metadata = await videoAssetMetadata(asset);
      if (!metadata || metadata.duration < (item.duration ?? 0)) { editor.fail("This source is shorter than the clip or could not be read. Trim the occupied range first, or choose a longer source."); return; }
    }
    editor.attempt(() => editor.comp!.batch(() => { editor.comp!.setAttribute(item.scopedId, "src", asset.src); editor.comp!.setAttribute(item.scopedId, "data-media-start", null); editor.comp!.setAttribute(item.scopedId, "data-name", asset.name); }));
  };
  return <div className="video-inspector-content">
    {!item ? <>
      <Window><WindowTitlebar><SlidersHorizontal size={14} /><strong>{editor.selection.length ? `${editor.selection.length} selected` : "Video settings"}</strong></WindowTitlebar><WindowBody className="video-properties">
        {editor.selection.length > 1 ? <><p className="video-help">Move selected clips together on the timeline. Select one to edit its properties.</p><div className="video-inline-actions"><button type="button" onClick={editor.duplicate}><Copy size={14} />Duplicate</button><button type="button" onClick={editor.remove}><Trash2 size={14} />Delete</button></div></> : <>
          {choices("aspect", "Format", info?.width === info?.height ? "1:1" : (info?.width ?? 0) > (info?.height ?? 1) ? "16:9" : "9:16", [{ value: "9:16", label: "9:16" }, { value: "16:9", label: "16:9" }, { value: "1:1", label: "1:1" }], (value) => editor.attempt(() => {
            const [width, height] = value === "16:9" ? [1920, 1080] : value === "1:1" ? [1080, 1080] : [1080, 1920];
            editor.comp?.batch(() => { editor.comp!.dispatch({ type: "setCompositionMetadata", width, height }); if (info?.root) editor.comp!.setStyle(info.root.scopedId, { width: `${width}px`, height: `${height}px` }); });
          }))}
          {choices("fps", "Frame rate", String(editor.fps), [24, 25, 30, 60].map((value) => ({ value: String(value), label: `${value} fps` })), (value) => editor.setFps(Number(value)))}
          <NumberField label="Duration, seconds" value={info?.duration ?? 18} min={1} max={600} step={1 / editor.fps} onChange={(duration) => {
            if (duration < Math.max(0, ...editor.elements.map((element) => element.start! + element.duration!))) { editor.fail("Trim the clips that extend past this duration first."); return; }
            editor.edit({ type: "setCompositionMetadata", duration });
          }} />
          <button className="video-add-title" type="button" onClick={() => editor.insert(null, at)}><Type size={15} />Add title at playhead</button>
        </>}
      </WindowBody></Window>
      <div className="video-inspector-hint"><WandSparkles size={20} /><strong>Make it yours.</strong><p>Select a clip or title to refine it. Drag media onto the timeline to build your sequence.</p><span>SPACE <i /> PLAY / PAUSE</span><span>S <i /> SPLIT AT PLAYHEAD</span><span>⌘ Z <i /> UNDO</span></div>
    </> : <>
      <Window><WindowTitlebar>{isText ? <Type size={14} /> : item.tag === "audio" ? <Volume2 size={14} /> : <Film size={14} />}<strong title={elementName(item)}>{elementName(item)}</strong><span className="video-property-kind">{isText ? "TEXT" : item.tag === "img" ? "IMAGE" : item.tag.toUpperCase()}</span></WindowTitlebar><WindowBody className="video-properties">
        {isText && <><textarea className="video-title-input" aria-label="Title text" value={item.text ?? ""} maxLength={2000} onChange={(event) => editor.edit({ type: "setText", target: item.scopedId, value: event.currentTarget.value })} />
          {choices("font", "Typeface", item.inlineStyles.fontFamily || "Arial,sans-serif", [{ value: "Arial,sans-serif", label: "Sans" }, { value: "Georgia,serif", label: "Serif" }, { value: "monospace", label: "Mono" }], (value) => style("fontFamily", value))}
          <div className="video-property-pair"><NumberField label="Size" value={parseFloat(item.inlineStyles.fontSize || "64")} min={8} max={400} onChange={(value) => style("fontSize", `${value}px`)} /><label className="video-color-field"><span>COLOR</span><input type="color" aria-label="Text color" value={/^#[0-9a-f]{6}$/i.test(item.inlineStyles.color ?? "") ? item.inlineStyles.color : INSTRUMENT_PALETTE.light.brandInk} onChange={(event) => style("color", event.currentTarget.value)} /></label></div>
          {choices("align", "Alignment", item.inlineStyles.textAlign || "left", [{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }], (value) => style("textAlign", value))}
        </>}
        {item.tag !== "audio" && parameter("opacity", "Opacity", Number(item.inlineStyles.opacity ?? 1), 0, 1, .01, (value) => style("opacity", String(value)))}
        {item.tag === "video" || item.tag === "img" ? choices("fit", "Framing", item.inlineStyles.objectFit || "cover", [{ value: "cover", label: "Fill" }, { value: "contain", label: "Fit" }], (value) => style("objectFit", value)) : null}
        {item.tag === "audio" || item.tag === "video" ? parameter("volume", "Volume", Number(item.attributes["data-volume"] ?? 1), 0, 1, .01, (value) => editor.edit({ type: "setAttribute", target: item.scopedId, name: "data-volume", value: String(value) })) : null}
        {["video", "audio", "img"].includes(item.tag) && <><button className="video-add-title" type="button" onClick={() => window.ralphy ? void replace() : replacement.current?.click()}><Upload size={14} />Replace media</button><input ref={replacement} type="file" hidden accept={item.tag === "img" ? "image/*" : `${item.tag}/*`} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void replace(file); event.currentTarget.value = ""; }} /><p className="video-help">Keeps this clip’s timing and placement. Choose a source long enough for the occupied range.</p></>}
        {item.animationIds.length > 0 && <p className="video-help">This element has a source animation. Timing and visual properties remain editable; use the agent for animation changes.</p>}
      </WindowBody></Window>
      <Window><WindowTitlebar><SlidersHorizontal size={14} /><strong>Timing & placement</strong></WindowTitlebar><WindowBody className="video-properties">
        {item.start !== null && item.duration !== null && <div className="video-property-pair"><NumberField label="Start, s" value={item.start} max={info!.duration - 1 / editor.fps} step={1 / editor.fps} onChange={(value) => editor.attempt(() => changeTiming(editor.comp!, item.scopedId, value, item.duration!, editor.fps))} /><NumberField label="Length, s" value={item.duration} min={1 / editor.fps} max={info!.duration - item.start} step={1 / editor.fps} onChange={(value) => editor.attempt(() => changeTiming(editor.comp!, item.scopedId, item.start!, value, editor.fps))} /></div>}
        {choices("track", "Track", String(item.trackIndex ?? 0), TRACKS.map((label, index) => ({ label, value: String(index) })), (value) => editor.edit({ type: "setTiming", target: item.scopedId, trackIndex: Number(value) }))}
        {item.tag !== "audio" && <div className="video-property-pair"><NumberField label={item.inlineStyles.left?.endsWith("%") ? "X, %" : "X, px"} min={-2000} value={parseFloat(item.inlineStyles.left || "0") || 0} onChange={(value) => style("left", `${value}${item.inlineStyles.left?.endsWith("%") ? "%" : "px"}`)} /><NumberField label={item.inlineStyles.top?.endsWith("%") ? "Y, %" : "Y, px"} min={-2000} value={parseFloat(item.inlineStyles.top || "0") || 0} onChange={(value) => style("top", `${value}${item.inlineStyles.top?.endsWith("%") ? "%" : "px"}`)} /></div>}
        {isText && <button className="video-add-title" type="button" onClick={() => editor.edit({ type: "setTiming", target: item.scopedId, trackIndex: 2 })}><Captions size={14} />Move to captions track</button>}
      </WindowBody></Window>
      <div className="video-inline-actions"><button type="button" onClick={editor.duplicate}><Copy size={14} />Duplicate</button><button type="button" onClick={editor.remove}><Trash2 size={14} />Delete</button></div>
    </>}
  </div>;
}
