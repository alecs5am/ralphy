import { useEffect, useRef, useState } from "react";
import { bridge, type ProjectReference } from "@/shared/api/ipc";
import { resolveUnitRevisionPreview, type UnitMedia } from "../lib/unit-previews";

/** The original is explicit, never inferred from revision order. */
import { AudioTrack } from "@/shared/ui/AudioTrack";
export function UnitSourcePreview({ project, revisionId, label }: { project: ProjectReference; revisionId: string; label: string }) {
  const [media, setMedia] = useState<UnitMedia | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let current = true;
    setMedia(null);
    setLoading(true);
    void resolveUnitRevisionPreview(bridge, project, revisionId, true).then((value) => { if (current) setMedia(value); }).catch(() => {}).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [project.workspaceId, project.projectId, revisionId, attempt]);
  const preview = media?.preview;
  useEffect(() => {
    const video = videoRef.current;
    return () => video?.pause?.();
  }, [preview]);
  return <section className="unit-source-preview flex min-h-0 min-w-0 flex-1 flex-col text-ink" aria-label="Original revision">
    <header className="sr-only">Original · {label}</header>
    <div className="grid min-h-0 min-w-0 flex-1 place-items-center overflow-auto">
      {loading ? <span role="status" className="p-3 type-sm text-muted">Loading original…</span>
        : preview && "url" in preview && media?.kind === "video" ? <video ref={videoRef} className="size-full min-h-0 object-contain" src={preview.url} controls playsInline autoPlay loop muted preload="metadata" aria-label="Original video" />
          : preview && "url" in preview && media?.kind === "image" ? <img className="size-full min-h-0 object-contain" src={preview.url} alt={`Original · ${label}`} />
            : preview && "url" in preview && media?.kind === "audio" ? <AudioTrack className="w-full max-w-lg p-4" src={preview.url} name="Original audio" />
              : preview && "text" in preview ? <p className="whitespace-pre-wrap type-sm">{preview.text}</p>
                : <button type="button" className="px-3 py-2 type-sm" onClick={() => setAttempt((value) => value + 1)}>Original unavailable · Retry</button>}
    </div>
  </section>;
}
