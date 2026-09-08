import { useRef, useState } from "react";
import { Film, FolderOpen, Image, Music2, PanelLeftClose, Plus, Search, Type, Upload } from "@/shared/ui/icons";
import { Window, WindowBody, WindowTitlebar } from "@/shared/ui/Window";
import type { VideoEditor } from "../model/useVideoWorkspace";
import type { VideoWorkspaceAsset } from "../../../../shared/video-workspace";
import { elementName, timecode } from "../lib/composition";
import { videoAssetMetadata } from "../lib/media";

export function VideoLibrary({ editor, at, onCollapse, seek }: { editor: VideoEditor; at: number; onCollapse(): void; seek(time: number): void }) {
  const [tab, setTab] = useState<"scenes" | "assets">("scenes"), [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const insert = async (asset: VideoWorkspaceAsset) => {
    if (asset.kind === "font" || asset.kind === "other") return;
    const duration = (await videoAssetMetadata(asset))?.duration ?? 4;
    editor.insert(asset, at, duration || 4);
  };
  const importFiles = async (files?: FileList | File[]) => {
    setImporting(true); setTab("assets");
    try {
      if (files) { for (const file of Array.from(files)) await editor.importAsset(file); }
      else if (window.ralphy) await editor.importAsset(); else input.current?.click();
    } finally { setImporting(false); }
  };
  const scenes = editor.elements.filter((item) => (item.trackIndex ?? 0) === 0).sort((a, b) => a.start! - b.start!);
  const assets = editor.assets.filter((asset) => ["image", "video", "audio"].includes(asset.kind) && asset.name.toLowerCase().includes(query.toLowerCase()));
  return <Window className="video-library" onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDrop={(event) => { if (event.dataTransfer.files.length) { event.preventDefault(); event.stopPropagation(); void importFiles(event.dataTransfer.files); } }}>
    <WindowTitlebar><Film size={14} /><strong>Library</strong><button type="button" aria-label="Collapse library" onClick={onCollapse}><PanelLeftClose size={14} /></button></WindowTitlebar>
    <WindowBody><div className="video-library-controls"><div className="video-segments" role="group" aria-label="Library view"><button type="button" aria-pressed={tab === "scenes"} onClick={() => setTab("scenes")}>Scenes <small>{scenes.length}</small></button><button type="button" aria-pressed={tab === "assets"} onClick={() => setTab("assets")}>Assets <small>{assets.length}</small></button></div>
      {tab === "assets" && <label className="video-library-search"><Search size={13} /><input aria-label="Search video assets" placeholder="Search assets…" value={query} onChange={(event) => setQuery(event.currentTarget.value)} /></label>}
    </div><div className="video-library-items">
      {tab === "scenes" ? <div className="video-scenes">{scenes.map((scene, index) => {
        const asset = editor.assets.find((asset) => asset.src === scene.attributes.src?.replace(/^\.\//, ""));
        return <button className="video-scene" type="button" key={scene.scopedId} aria-pressed={editor.selection.includes(scene.scopedId)} title="Select scene · double-click to seek" onClick={() => editor.select(scene.scopedId)} onDoubleClick={() => seek(scene.start!)}>
          <span className="video-scene-thumb">{asset?.previewUrl && asset.kind === "image" ? <img alt="" src={asset.previewUrl} /> : asset?.previewUrl && asset.kind === "video" ? <video src={`${asset.previewUrl}#t=.1`} muted preload="metadata" /> : <Film size={22} />}<small>{String(index + 1).padStart(2, "0")}</small><em>{Math.round(scene.duration! * 10) / 10}s</em></span><strong>{elementName(scene)}</strong><span className="video-scene-meta">{timecode(scene.start!, editor.fps).slice(0, 5)} — {timecode(scene.start! + scene.duration!, editor.fps).slice(0, 5)}</span>
        </button>;
      })}</div> : <div className="video-assets">{assets.map((asset) => <button className="video-asset" key={asset.src} type="button" disabled={asset.missing} draggable={!asset.missing} onDragStart={(event) => event.dataTransfer.setData("application/x-ralphy-video-asset", asset.src)} onClick={() => void insert(asset)} title={`Add ${asset.name} at playhead`}>
        <span>{asset.kind === "image" && asset.previewUrl ? <img src={asset.previewUrl} alt="" /> : asset.kind === "video" && asset.previewUrl ? <video src={`${asset.previewUrl}#t=.1`} muted preload="metadata" /> : asset.kind === "audio" ? <Music2 size={20} /> : <Image size={20} />}<i><Plus size={12} /></i></span><strong>{asset.name}</strong><small>{asset.missing ? "MISSING" : asset.kind}</small>
      </button>)}</div>}
      {!(tab === "scenes" ? scenes.length : assets.length) && <div className="video-library-empty"><FolderOpen size={24} /><strong>{query ? "No matches" : "Start your sequence"}</strong><p>{query ? "Try another asset name." : "Drop media here, then add it at the playhead."}</p></div>}
    </div><div className="video-library-footer"><button type="button" disabled={importing} onClick={() => void importFiles()}><Upload size={14} />{importing ? "Importing…" : "Import media"}</button><button type="button" aria-label="Add title" onClick={() => editor.insert(null, at)}><Type size={15} /></button></div>
      <input hidden multiple type="file" ref={input} accept="image/*,video/*,audio/*" onChange={(event) => { if (event.currentTarget.files) void importFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
    </WindowBody>
  </Window>;
}
