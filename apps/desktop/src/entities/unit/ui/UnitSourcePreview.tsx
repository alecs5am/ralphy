import { useEffect, useState } from "react";
import { bridge, type ProjectReference } from "@/shared/api/ipc";
import { resolveUnitRevisionPreview, type UnitMedia } from "../lib/unit-previews";

/** The original is explicit, never inferred from revision order. */
export function UnitSourcePreview({ project, revisionId, label }: { project: ProjectReference; revisionId: string; label: string }) {
  const [media, setMedia] = useState<UnitMedia | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setMedia(null);
    setLoading(true);
    void resolveUnitRevisionPreview(bridge, project, revisionId, true).then((value) => { if (current) setMedia(value); }).catch(() => {}).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [project.workspaceId, project.projectId, revisionId, attempt]);
  const preview = media?.preview;
  return <section className="unit-source-preview col-span-full grid min-h-0 min-w-0 content-start gap-3 overflow-auto rounded-field bg-card p-3 text-ink" aria-label="Original revision">
    <header className="flex items-center gap-3"><strong className="rounded-chip bg-brand px-2 py-1 font-code type-sm text-brand-ink">R0 · Original</strong><span className="type-sm text-muted">{label}</span></header>
    <div className="grid min-w-0 place-items-center rounded-field bg-card p-2">
      {loading ? <span role="status" className="p-3 type-sm text-muted">Loading original…</span>
        : preview && "url" in preview && media?.kind === "video" ? <video className="max-h-unit-media-preview w-full object-contain" src={preview.url} controls playsInline preload="metadata" aria-label="Original video" />
          : preview && "url" in preview && media?.kind === "image" ? <img className="max-h-unit-media-preview w-full object-contain" src={preview.url} alt={`Original · ${label}`} />
            : preview && "url" in preview && media?.kind === "audio" ? <audio src={preview.url} controls aria-label="Original audio" />
              : preview && "text" in preview ? <p className="whitespace-pre-wrap type-sm">{preview.text}</p>
                : <button type="button" className="px-3 py-2 type-sm" onClick={() => setAttempt((value) => value + 1)}>Original unavailable · Retry</button>}
    </div>
  </section>;
}
