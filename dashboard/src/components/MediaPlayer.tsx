import { CopyToChat } from "./CopyToChat";
import { useWorkspace } from "../stores/workspace";
import { RALPH_PATH_MIME } from "./Terminal";

type Props = {
  src: string;
  type?: "image" | "video" | "audio";
  className?: string;
  onClick?: () => void;
};

function detectType(src: string): "image" | "video" | "audio" {
  const ext = src.split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return "image";
  if (["mp4", "mov", "webm"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "aiff", "ogg"].includes(ext)) return "audio";
  return "image";
}

export function MediaPlayer({ src, type, className = "", onClick }: Props) {
  const mediaType = type || detectType(src);
  const url = `/media/${src}`;
  const projectRoot = useWorkspace((s) => s.projectRoot);
  const absolutePath = projectRoot ? `${projectRoot}/${src}` : src;
  const filename = src.split("/").pop() || src;

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData(RALPH_PATH_MIME, absolutePath);
    e.dataTransfer.setData("text/plain", absolutePath);
    e.dataTransfer.setData("text/uri-list", `file://${absolutePath}`);
    e.dataTransfer.effectAllowed = "copyLink";
  }

  return (
    <div
      className={`relative group ${className}`}
      draggable
      onDragStart={handleDragStart}
      title={`${filename}\n${absolutePath}\n(Drag to terminal to insert path)`}
    >
      {mediaType === "image" && (
        <img
          src={url}
          alt={filename}
          className={`w-full h-full object-cover rounded-lg ${onClick ? "cursor-pointer hover:brightness-110 transition" : ""}`}
          loading="lazy"
          draggable={false}
          onClick={onClick}
        />
      )}
      {mediaType === "video" && (
        <video
          src={url}
          controls
          className={`w-full h-full object-contain rounded-lg bg-black ${onClick ? "cursor-pointer" : ""}`}
          preload="metadata"
          draggable={false}
          onClick={(e) => {
            if (onClick && e.target === e.currentTarget) onClick();
          }}
        />
      )}
      {mediaType === "audio" && (
        <div
          className={`flex flex-col items-center justify-center p-4 bg-zinc-800 rounded-lg h-full min-h-[80px] ${onClick ? "cursor-pointer" : ""}`}
          onClick={onClick}
        >
          <div className="text-zinc-300 text-xs mb-2 truncate max-w-full w-full text-center">
            {filename}
          </div>
          <audio
            src={url}
            controls
            className="w-full max-w-[300px]"
            preload="metadata"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />
        </div>
      )}

      {/* Filename overlay — shown on image/video tiles */}
      {(mediaType === "image" || mediaType === "video") && (
        <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/80 via-black/50 to-transparent rounded-b-lg pointer-events-none">
          <div className="text-[10px] text-zinc-100 truncate" title={filename}>
            {filename}
          </div>
        </div>
      )}

      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyToChat relativePath={src} />
      </div>
    </div>
  );
}
