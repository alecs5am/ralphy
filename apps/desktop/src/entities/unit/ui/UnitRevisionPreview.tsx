import { useEffect, useState } from "react";
import { bridge, type ProjectReference } from "@/shared/api/ipc";
import { FileText, ImageOff, Music2, Play } from "@/shared/ui/icons";
import { resolveUnitRevisionPreview, type UnitMedia } from "../lib/unit-previews";

export function UnitRevisionPreview({ project, revisionId, sealedAt, className = "" }: {
  project: ProjectReference;
  revisionId: string;
  sealedAt?: number | null;
  className?: string;
}) {
  const identity = `${project.workspaceId}:${project.projectId}:${revisionId}:${sealedAt}`;
  const [result, setResult] = useState<{ identity: string; media: UnitMedia | null } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    setFailed(false);
    void resolveUnitRevisionPreview(bridge, project, revisionId).then((media) => {
      if (current) setResult({ identity, media });
    }).catch(() => { if (current) setResult({ identity, media: null }); });
    return () => { current = false; };
  }, [identity]);
  const ready = result?.identity === identity;
  const media = ready && !failed ? result.media : null;
  const preview = media?.preview;
  return <span className={`unit-revision-preview relative grid place-items-center overflow-hidden bg-surface-sunken text-muted ${className}`} data-preview-state={!ready ? "loading" : media ? "ready" : "unavailable"}>
    {!ready ? <span className="size-full animate-pulse bg-ink/5 motion-reduce:animate-none" aria-label="Loading preview" />
      : preview && "text" in preview ? <span className="grid size-full content-start gap-2 overflow-hidden bg-card p-3 text-left"><FileText size={16} /><span className="line-clamp-5 whitespace-pre-line type-xs leading-row text-ink">{preview.text}</span></span>
        : preview && "url" in preview && media?.kind === "image" ? <img className="absolute inset-0 size-full object-contain" src={preview.url} alt="" onError={() => setFailed(true)} />
          : preview && "url" in preview && media?.kind === "video" ? <><video className="absolute inset-0 size-full object-contain" src={preview.url} muted playsInline preload="metadata" onLoadedMetadata={(event) => { const video = event.currentTarget; if (Number.isFinite(video.duration)) video.currentTime = Math.min(.1, video.duration / 2); }} onError={() => setFailed(true)} /><span className="absolute bottom-2 right-2 grid size-5.5 place-items-center rounded-full bg-media-plate text-on-instrument"><Play size={12} /></span></>
            : media?.kind === "audio" ? <Music2 size={24} aria-label="Audio version" />
              : <span className="grid justify-items-center gap-1.5 p-2"><ImageOff size={18} /><span className="type-xs">No preview</span></span>}
  </span>;
}
