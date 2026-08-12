import { ImageOff } from "lucide-react";

import { AudioWaveform } from "../../components/media/AudioWaveform";
import { ImageViewport } from "../../components/media/ImageViewport";
import { VideoPlayer } from "../../components/media/VideoPlayer";
import type { ProjectScreenSnapshot } from "../../state/project-screen-controller";

type Preview = ProjectScreenSnapshot["compositionPreview"];

export function ArtifactPreview({ preview, empty, retry }: { preview: Preview; empty: string; retry(): void }) {
  if (preview.status === "idle") return <div className="preview-empty">{empty}</div>;
  if (preview.status === "loading") return <div className="project-skeleton" role="status">Loading preview…</div>;
  if (preview.status === "error") return <div className="preview-unavailable" role="alert"><ImageOff size={20} aria-hidden="true" /><strong>Preview unavailable</strong><span>{preview.error}</span><button className="command-button" type="button" onClick={retry}>Retry</button></div>;
  if (!preview.value) return <div className="preview-empty">{empty}</div>;
  const name = preview.artifactRevisionId ?? "Artifact preview";
  if (preview.value.mime?.startsWith("image/")) return <ImageViewport src={preview.value.url} name={name} />;
  if (preview.value.mime?.startsWith("video/")) return <VideoPlayer src={preview.value.url} name={name} compact />;
  if (preview.value.mime?.startsWith("audio/")) return <AudioWaveform src={preview.value.url} name={name} sizeBytes={preview.value.sizeBytes} compact />;
  return <a href={preview.value.url} aria-label={`Open ${name}`}>Open preview</a>;
}
