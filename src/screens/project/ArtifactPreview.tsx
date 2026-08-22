import { ImageOff } from "lucide-react";

import { AudioWaveform } from "../../components/media/AudioWaveform";
import { ImageViewport } from "../../components/media/ImageViewport";
import { VideoPlayer } from "../../components/media/VideoPlayer";
import type { ProjectScreenSnapshot } from "../../state/project-screen-controller";
import { DocumentContent } from "./DocumentsPanel";

type Preview = ProjectScreenSnapshot["compositionPreview"] | ProjectScreenSnapshot["unitPreview"];

const EMPTY = "preview-empty grid h-full place-items-center text-muted";

export function ArtifactPreview({ preview, empty, retry }: { preview: Preview; empty: string; retry(): void }) {
  if (preview.status === "idle") return <div className={EMPTY}>{empty}</div>;
  if (preview.status === "loading") return <div className="project-skeleton" role="status">Loading preview…</div>;
  if (preview.status === "error") return <div className="preview-unavailable" role="alert"><ImageOff size={20} aria-hidden="true" /><strong>Preview unavailable</strong><span>{preview.error}</span><button className="command-button" type="button" onClick={retry}>Retry</button></div>;
  if (!preview.value) return <div className={EMPTY}>{empty}</div>;
  if ("text" in preview.value) return preview.value.text.trim()
    ? <DocumentContent format={preview.value.format} text={preview.value.text} />
    : <div className={EMPTY}>Document source is empty.</div>;
  const name = preview.artifactRevisionId ?? "Artifact preview";
  /* The build-output plate is a light widget, so the waveform -- the one player with no plate of
     its own -- takes the theme ink; the picture and the video keep their black media frame. */
  if (preview.value.mime?.startsWith("image/")) return <ImageViewport src={preview.value.url} name={name} tone="instrument" />;
  if (preview.value.mime?.startsWith("video/")) return <VideoPlayer src={preview.value.url} name={name} compact tone="instrument" />;
  if (preview.value.mime?.startsWith("audio/")) return <AudioWaveform src={preview.value.url} name={name} sizeBytes={preview.value.sizeBytes} compact tone="surface" />;
  return <a href={preview.value.url} aria-label={`Open ${name}`}>Open preview</a>;
}
