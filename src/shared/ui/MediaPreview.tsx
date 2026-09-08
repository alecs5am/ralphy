import { Film, Image, Music2 } from "./icons";
import { useState } from "react";

export function MediaPreview({ url, posterUrl, kind, label, text }: { url?: string; posterUrl?: string; kind: "text" | "image" | "video" | "audio"; label: string; text?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const Icon = kind === "video" ? Film : kind === "audio" ? Music2 : Image;
  if (kind === "text") return <p className="m-0 max-h-40 overflow-auto p-3 type-xs leading-relaxed whitespace-pre-wrap text-on-instrument">{text || label}</p>;
  if (!url || failed === url) return <span className="flex aspect-video w-full flex-col items-center justify-center gap-2 p-4 text-center text-on-instrument-muted"><Icon size={24} strokeWidth={1.3} aria-hidden="true" /><span className="type-xs">{url ? "Preview unavailable" : "No preview yet"}</span></span>;
  if (kind === "video") return <video className="nodrag nopan nowheel aspect-video w-full object-contain" src={url} poster={posterUrl} controls preload="metadata" aria-label={label} onError={() => setFailed(url)} />;
  if (kind === "audio") return <div className="flex min-h-24 flex-col justify-center gap-3 p-3 text-on-instrument-muted"><Music2 size={24} aria-hidden="true" /><audio className="nodrag nopan nowheel w-full" src={url} controls preload="metadata" aria-label={label} onError={() => setFailed(url)} /></div>;
  return <img className="aspect-video w-full object-contain" src={url} alt={label} draggable={false} onError={() => setFailed(url)} />;
}
