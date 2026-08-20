import { FileText, ImageOff } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProjectPreview } from "../../lib/ipc";
import { AudioWaveform } from "../../components/media/AudioWaveform";
import { ImageViewport } from "../../components/media/ImageViewport";
import { VideoPlayer } from "../../components/media/VideoPlayer";
import type { SharedArtifactPresentation } from "./presentation";

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

  if (preview.status === "loading") return <span className="shared-artifact-preview-state" role="status">Loading preview…</span>;
  if (preview.status === "unavailable") return <span className="shared-artifact-preview-state" title={preview.reason}><ImageOff aria-hidden="true" /><span>Preview unavailable</span></span>;
  if (list) {
    if (artifact.mediaKind === "image") return <img src={preview.value.url} alt="" />;
    if (artifact.mediaKind === "video") return <video src={preview.value.url} aria-label={`${artifact.slug} preview`} muted playsInline preload="metadata" />;
    return <FileText aria-hidden="true" />;
  }
  if (artifact.mediaKind === "image") return <ImageViewport src={preview.value.url} name={artifact.slug} compact />;
  if (artifact.mediaKind === "video") return <VideoPlayer src={preview.value.url} name={artifact.slug} compact />;
  if (artifact.mediaKind === "audio") return <AudioWaveform src={preview.value.url} name={artifact.slug} sizeBytes={preview.value.sizeBytes} compact />;
  return <span className="shared-artifact-preview-state"><FileText aria-hidden="true" /><span>{artifact.mime ?? artifact.kind}</span></span>;
}
