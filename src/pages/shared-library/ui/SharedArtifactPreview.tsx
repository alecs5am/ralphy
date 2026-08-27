import { FileText, ImageOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ProjectPreview } from "@/shared/api/ipc";
import { AudioWaveform } from "@/entities/media/ui/AudioWaveform";
import { ImageViewport } from "@/entities/media/ui/ImageViewport";
import { VideoPlayer } from "@/entities/media/ui/VideoPlayer";
import type { SharedArtifactPresentation } from "../lib/presentation";

type PreviewState = { status: "loading" } | { status: "ready"; value: ProjectPreview } | { status: "unavailable"; reason: string };

export function SharedArtifactPreview({ artifact, workspaceId, rootEpoch, resolvePreview, list = false }: {
  artifact: SharedArtifactPresentation;
  workspaceId: string;
  rootEpoch: number;
  resolvePreview(workspaceId: string, artifactId: string): Promise<ProjectPreview | null>;
  list?: boolean;
}) {
  const [preview, setPreview] = useState<PreviewState>(() => artifact.preview === "no-target"
    ? { status: "unavailable", reason: "No selected preview target was returned by Core." }
    : { status: "loading" });
  const mediaError = useCallback(() => setPreview({ status: "unavailable", reason: "The resolved preview media could not be decoded or loaded." }), []);
  useEffect(() => {
    let current = true;
    if (artifact.preview === "no-target") {
      setPreview({ status: "unavailable", reason: "No selected preview target was returned by Core." });
      return () => { current = false; };
    }
    setPreview({ status: "loading" });
    void resolvePreview(workspaceId, artifact.id).then((value) => {
      if (current) setPreview(value
        ? { status: "ready", value }
        : { status: "unavailable", reason: "Core did not return a preview URL." });
    }).catch(() => {
      if (current) setPreview({ status: "unavailable", reason: "The preview could not be loaded." });
    });
    return () => { current = false; };
  }, [artifact.id, artifact.preview, resolvePreview, rootEpoch, workspaceId]);

  if (preview.status === "loading") return <span className="shared-artifact-preview-state" aria-hidden="true">Loading preview…</span>;
  if (preview.status === "unavailable") return <span className="shared-artifact-preview-state" title={preview.reason}><ImageOff aria-hidden="true" /><span>Preview unavailable</span></span>;
  const identityName = `Slug identity: ${artifact.slug}`;
  if (list) {
    if (artifact.mediaKind === "image") return <img src={preview.value.url} alt="" onError={mediaError} />;
    if (artifact.mediaKind === "video") return <video src={preview.value.url} aria-label={`${identityName} preview`} muted playsInline preload="metadata" onError={mediaError} />;
    return <FileText aria-hidden="true" />;
  }
  /* Every host of this preview is a black plate -- the card frame, the inspector plate and the
     list cell -- so all three players take the instrument pair. */
  if (artifact.mediaKind === "image") return <ImageViewport src={preview.value.url} name={identityName} compact tone="instrument" onError={mediaError} />;
  if (artifact.mediaKind === "video") return <VideoPlayer src={preview.value.url} name={identityName} compact tone="instrument" onError={mediaError} />;
  if (artifact.mediaKind === "audio") return <AudioWaveform src={preview.value.url} name={identityName} sizeBytes={preview.value.sizeBytes} compact tone="instrument" onError={mediaError} />;
  return <span className="shared-artifact-preview-state"><FileText aria-hidden="true" /><span>{artifact.mime ?? artifact.kind}</span></span>;
}
