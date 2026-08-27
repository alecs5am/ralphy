/**
 * What the viewer stands on: its chrome vocabulary, the readings it shows, and the stage that
 * draws whichever kind of artifact this is.
 *
 * The stage decides nothing about the artifact -- the kind comes from the mime type, and each
 * player is handed the skin of the surface it stands on rather than repainting half of it.
 */
import { FileText, ImageOff } from "lucide-react";
import { useEffect, useState } from "react";
import type { ArtifactRevisionDto } from "../../../../electron/ralphy/types";
import { isSupportedFontPreviewMime } from "../../../../shared/font-preview";
import { AudioWaveform, ImageViewport, VideoPlayer } from "@/entities/media";
import type { Availability, SharedArtifactPresentation } from "../lib/presentation";

/* The viewer is a full-surface light widget: its own surface, the stage and the context rail one
   step down, and a block inside the rail one step up again. Controls that stand on media take the
   on-instrument ink and ring in both themes, because the frame under them is black either way. */
export const ACTION = "inline-flex min-h-7 items-center justify-center gap-1.5 rounded-control bg-surface-sunken px-2.5 type-label text-muted transition-colors duration-normal ease-instrument motion-reduce:transition-none motion-reduce:duration-0 hover:bg-surface-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-3.25";
/* The selected revision is the disabled one, so the dimming lives on the other branch: a pill
   cannot be both the current choice and greyed out. */
export const TRANSPORT_BUTTON = "inline-flex min-h-6 items-center justify-center gap-1.5 rounded-control px-2 font-code type-mono-sm transition-colors duration-normal ease-instrument motion-reduce:transition-none motion-reduce:duration-0 disabled:cursor-not-allowed";
export const STEP = "absolute top-1/2 z-sticky grid size-8.5 -mt-4.25 place-items-center rounded-full bg-media-plate text-on-instrument disabled:cursor-not-allowed disabled:opacity-28 focus-visible:outline-focus-on-instrument [&_svg]:size-3.75";
export const ALERT = "shared-viewer-alert flex flex-none items-center gap-2 rounded-field bg-surface-sunken px-2.5 py-2 type-mono-md text-ink [&>span]:min-w-0 [&>span]:flex-1";
export const STATE = "flex max-w-shared-notice flex-col items-center justify-center gap-2 p-6 text-center text-muted [&>svg]:size-7 [&>svg]:text-muted";
export const STATE_TITLE = "type-md font-normal text-ink";
export const STATE_LINE = "font-code type-mono-md";
export const SECTION_LABEL = "m-0 font-code type-mono-sm font-normal tracking-caps text-muted";
export const SECTION_COPY = "m-0 type-label leading-normal text-muted";
export const FACT_ROW = "grid grid-cols-(--shared-library-viewer-fact-columns) gap-2";
export const FACT_LABEL = "m-0 type-mono-sm text-muted";
export const FACT_VALUE = "m-0 font-code type-mono-sm text-right text-muted [overflow-wrap:anywhere]";
export const REASON = "-mt-1.75 mb-0 type-mono-md leading-caption text-muted";

export type PreviewState =
  | { status: "loading" }
  | { status: "ready"; url: string; sizeBytes: number }
  | { status: "unavailable"; reason: string };

export type RevisionState = {
  items: ArtifactRevisionDto[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
};

export type SelectionState =
  | { status: "idle" }
  | { status: "pending" | "conflict" | "reloading" | "reloaded" | "error"; revisionId: string; message?: string };

export type ViewerKind = "image" | "vector" | "video" | "audio" | "font" | "unsupported";

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
export const isConflict = (error: unknown) => error !== null && typeof error === "object" && (error as { code?: unknown }).code === "E_CONFLICT";
export const titleText = (artifact: SharedArtifactPresentation) => artifact.title.status === "ready" || artifact.title.status === "partial"
  ? artifact.title.value
  : "Title unavailable — Core does not return artifact titles";
export const formatBytes = (bytes: number | null) => bytes === null
  ? "Size unavailable"
  : bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 ** 2
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

export function viewerKind(mime: string | null): ViewerKind {
  const value = mime?.toLocaleLowerCase() ?? "";
  if (value === "image/svg+xml" || value === "application/svg+xml") return "vector";
  if (value.startsWith("image/")) return "image";
  if (value.startsWith("video/")) return "video";
  if (value.startsWith("audio/")) return "audio";
  if (isSupportedFontPreviewMime(mime)) return "font";
  return "unsupported";
}

export function editableTarget(event: KeyboardEvent): boolean {
  let target = event.target instanceof HTMLElement
    ? event.target
    : document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  for (; target; target = target.parentElement) {
    const tag = target.tagName.toLocaleLowerCase();
    if (tag === "input" || tag === "textarea" || target.getAttribute("role") === "slider" || target.isContentEditable) return true;
  }
  return false;
}

export function FontSpecimen({ src, slug, onError }: { src: string; slug: string; onError(): void }) {
  const [face, setFace] = useState<FontFace | null>(null);
  useEffect(() => {
    if (typeof FontFace === "undefined") {
      onError();
      return;
    }
    let current = true;
    let loaded: FontFace | null = null;
    let candidate: FontFace;
    try {
      candidate = new FontFace("RalphySharedArtifactPreview", `url("${src}")`);
    } catch {
      onError();
      return;
    }
    void candidate.load().then((value) => {
      if (!current) return;
      loaded = value;
      document.fonts?.add(value);
      setFace(value);
    }).catch(() => { if (current) onError(); });
    return () => {
      current = false;
      if (loaded) document.fonts?.delete(loaded);
    };
  }, [onError, slug, src]);
  if (!face) return <div className={`shared-viewer-preview-state ${STATE}`} role="status">Loading font preview…</div>;
  /* A specimen previews the face at the size the face is meant to be read at, so these two steps
     are content and not UI type. */
  return <div className="flex max-h-full w-shared-specimen max-w-shared-specimen-inset flex-col gap-4.5 overflow-y-auto p-10.5" style={{ fontFamily: '"RalphySharedArtifactPreview"' }}>
    <span className="font-code type-mono-sm tracking-caps text-muted">Font specimen · {slug}</span>
    <strong className="type-specimen-display font-normal leading-specimen-display text-ink">Aa Bb Cc 123</strong>
    <p className="m-0 type-specimen leading-specimen text-ink">Handgloves &amp; rooftop dusk</p>
    <small className="type-title leading-specimen-sample text-muted">ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789</small>
  </div>;
}

export const availabilityReason = (value: Availability<unknown>) => value.status === "ready" ? "Available from Core." : value.reason;
export const stringList = (value: Availability<string[]>) => value.status === "ready"
  ? value.value.length ? value.value.join(" · ") : "No values returned by Core."
  : value.status === "partial"
    ? value.value.length ? value.value.join(" · ") : value.reason
    : value.reason;

export function ViewerStage({ artifact, preview, kind, onPreviewError }: {
  artifact: SharedArtifactPresentation;
  preview: PreviewState;
  kind: ViewerKind;
  onPreviewError(): void;
}) {
  if (artifact.preview === "no-target") return <div className={`shared-viewer-preview-state ${STATE}`}>
    <ImageOff aria-hidden="true" /><strong className={STATE_TITLE}>Preview unavailable</strong><span className={STATE_LINE}>No preview target · Core returned no selected preview target.</span>
  </div>;
  if (kind === "unsupported") return <div className={STATE}>
    <FileText aria-hidden="true" />
    <strong className={STATE_TITLE}>In-place preview unavailable</strong>
    <span className={STATE_LINE}>{artifact.mime ?? "MIME unavailable"} · {formatBytes(artifact.bytes)}</span>
    <p className="mt-0.75 mb-0 type-label leading-normal text-muted">The current Desktop contract exposes no bounded safe read for this content. Use Open original.</p>
  </div>;
  if (preview.status === "loading") return <div className={`shared-viewer-preview-state ${STATE}`} role="status">Loading preview…</div>;
  if (preview.status === "unavailable") return <div className={`shared-viewer-preview-state ${STATE}`} title={preview.reason}>
    <ImageOff aria-hidden="true" /><strong className={STATE_TITLE}>Preview unavailable</strong><span className={STATE_LINE}>{preview.reason}</span>
  </div>;
  const name = `Slug identity: ${artifact.slug}`;
  if (kind === "image" || kind === "vector") return <div className={`absolute inset-0 grid place-items-center [&>.image-viewport]:size-full ${kind === "vector" ? "shared-viewer-vector-stage bg-ghost" : "shared-viewer-image-stage"}`}>
    <ImageViewport src={preview.url} name={name} tone="instrument" onError={onPreviewError} />
    <span className="pointer-events-none absolute bottom-3 left-3 h-5.5 rounded-chip bg-media-plate px-2 py-1.25 font-code type-mono-sm tracking-label text-on-instrument">FIT</span>
  </div>;
  /* The stage is a light widget (`bg-surface-sunken`). A picture and a video bring their own
     black media frame, so their chrome stays on-dark; the waveform paints no plate at all, and
     with the on-dark default its title read #F2F2F0 on #E4E4E2 -- 1.06:1. */
  if (kind === "video") return <VideoPlayer src={preview.url} name={name} tone="instrument" onError={onPreviewError} />;
  if (kind === "audio") return <AudioWaveform src={preview.url} name={name} sizeBytes={preview.sizeBytes} tone="surface" onError={onPreviewError} />;
  return <FontSpecimen src={preview.url} slug={artifact.slug} onError={onPreviewError} />;
}
