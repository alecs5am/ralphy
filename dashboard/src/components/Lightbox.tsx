import { useEffect } from "react";
import { X } from "lucide-react";
import { CopyToChat } from "./CopyToChat";

type Props = {
  src: string;       // relative path
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
};

function detectType(src: string): "image" | "video" | "audio" {
  const ext = src.split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return "image";
  if (["mp4", "mov", "webm"].includes(ext)) return "video";
  return "audio";
}

export function Lightbox({ src, onClose, onPrev, onNext }: Props) {
  const type = detectType(src);
  const url = `/media/${src}`;
  const filename = src.split("/").pop() || src;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onPrev, onNext]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center"
      onClick={onClose}
    >
      {/* Toolbar */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs text-zinc-400 font-mono truncate max-w-[60%]">{src}</span>
        <div className="flex items-center gap-2">
          <CopyToChat relativePath={src} size="md" />
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white px-2"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Navigation arrows */}
      {onPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white text-3xl z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60"
        >
          ‹
        </button>
      )}
      {onNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white text-3xl z-10 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60"
        >
          ›
        </button>
      )}

      {/* Content */}
      <div
        className="max-w-[90vw] max-h-[85vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {type === "image" && (
          <img src={url} alt={filename} className="max-w-full max-h-[85vh] object-contain rounded-lg" />
        )}
        {type === "video" && (
          <video src={url} controls autoPlay className="max-w-full max-h-[85vh] rounded-lg" />
        )}
        {type === "audio" && (
          <div className="bg-zinc-900 rounded-lg p-8 flex flex-col items-center gap-4">
            <div className="text-zinc-300 text-sm">{filename}</div>
            <audio src={url} controls autoPlay className="w-80" />
          </div>
        )}
      </div>

      {/* Filename at bottom */}
      <div className="absolute bottom-4 text-[10px] text-zinc-600">{filename}</div>
    </div>
  );
}
