import { FileText, Film, Image, Music2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { MediaCardDto, MediaRef } from "../../../../electron/ralphy/types";
import type { ProjectPreview, ProjectReference } from "@/shared/api/ipc";
import { previewScheduler } from "../lib/media";
import { AudioWaveform } from "./AudioWaveform";

/**
 * A media record, as a picture with a name.
 *
 * This used to live inside the project page's virtualized grid, which is also where the two
 * other places that show a media record had to reach for it -- a page importing a sibling page,
 * which is the one dependency the layout forbids. What a media object looks like is the media
 * entity's business; how a grid of them scrolls is the page's.
 *
 * The preview cache is module state on purpose. A tile mounts and unmounts as the grid scrolls,
 * and re-resolving a preview through IPC on every pass is what made the grid stutter; the cache
 * is bounded at 128 and drops its oldest entry, so a long library does not grow it without end.
 */

export type ResolvePreview = (project: ProjectReference, ref: MediaCardDto["ref"]) => Promise<ProjectPreview | null>;
export type PreviewKind = "image" | "video" | "audio";

export interface MediaCardIdentity {
  card: MediaCardDto;
  project: ProjectReference;
  rootEpoch: number;
  resolvePreview: ResolvePreview;
}

type PreviewCacheEntry = { promise: Promise<ProjectPreview | null>; settled: boolean; value: ProjectPreview | null; aspectRatio: number | null };
type PreviewState = { key: string; entry: PreviewCacheEntry | null; value: ProjectPreview | null };
const previewCache = new Map<string, PreviewCacheEntry>();

export function previewKind(card: MediaCardDto): PreviewKind | null {
  const kind = card.mime?.split("/")[0] ?? ("kind" in card ? card.kind : null);
  return kind === "image" || kind === "video" || kind === "audio" ? kind : null;
}

export function previewKey(project: ProjectReference, rootEpoch: number, ref: MediaRef): string {
  return JSON.stringify([rootEpoch, project.workspaceId, project.projectId, ref.type, ref.id]);
}

function cachedPreview(key: string, project: ProjectReference, ref: MediaRef, resolvePreview: ResolvePreview): PreviewCacheEntry {
  const cached = previewCache.get(key);
  if (cached) return cached;
  const entry: PreviewCacheEntry = { promise: Promise.resolve(null), settled: false, value: null, aspectRatio: null };
  entry.promise = resolvePreview(project, ref).then((value) => {
    entry.settled = true;
    entry.value = value;
    return value;
  }, (error) => {
    if (previewCache.get(key) === entry) previewCache.delete(key);
    throw error;
  });
  previewCache.set(key, entry);
  if (previewCache.size > 128) previewCache.delete(previewCache.keys().next().value!);
  return entry;
}

export function mediaCardName(card: MediaCardDto): string {
  if ("slug" in card) return card.slug;
  if ("purpose" in card) return card.purpose;
  return card.mime || "Media object";
}

export function mediaCardKind(card: MediaCardDto): string {
  if (card.ref.type === "artifact") return "Artifact";
  if (card.ref.type === "run-object") return "Run object";
  return "Object";
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "Size unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function mediaCardFacts(card: MediaCardDto): string {
  if ("slug" in card) return [card.mime, formatBytes(card.bytes), card.selectedState ?? "unselected", ...card.usageRoles].filter(Boolean).join(" · ");
  if ("purpose" in card) return [card.mime, formatBytes(card.bytes), card.state, card.retention].filter(Boolean).join(" · ");
  return [card.mime, formatBytes(card.bytes), card.storageClass, `${card.referenceCount} references`].join(" · ");
}

function FileGlyph({ kind, size = 26 }: { kind: PreviewKind | null; size?: number }) {
  if (kind === "image") return <Image size={size} />;
  if (kind === "video") return <Film size={size} />;
  if (kind === "audio") return <Music2 size={size} />;
  return <FileText size={size} />;
}

export function MediaCardPreview({
  card,
  project,
  rootEpoch,
  resolvePreview,
  fill = false,
  className = "",
  aspectRatio,
  onAspectRatio,
}: MediaCardIdentity & {
  fill?: boolean;
  className?: string;
  aspectRatio?: number;
  onAspectRatio?(ratio: number): void;
}) {
  const kind = previewKind(card);
  const key = previewKey(project, rootEpoch, card.ref);
  const initial = previewCache.get(key);
  const [preview, setPreview] = useState<PreviewState>(() => ({ key, entry: initial ?? null, value: null }));
  const releaseRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const cached = previewCache.get(key);
    setPreview({ key, entry: cached ?? null, value: null });
    if (!kind) return;
    let disposed = false;
    void previewScheduler.acquire(kind).then(async (release) => {
      if (disposed) { release(); return; }
      releaseRef.current = release;
      try {
        const entry = cachedPreview(key, project, card.ref, resolvePreview);
        const value = await entry.promise;
        if (!disposed) {
          setPreview({ key, entry, value });
          if (entry.aspectRatio !== null) onAspectRatio?.(entry.aspectRatio);
        }
        if (!value) { release(); releaseRef.current = null; }
      } catch {
        if (!disposed) setPreview({ key, entry: null, value: null });
        release();
        releaseRef.current = null;
      }
    });
    return () => {
      disposed = true;
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, [card.ref, key, kind, onAspectRatio, project, resolvePreview]);
  const loaded = useCallback(() => { releaseRef.current?.(); releaseRef.current = null; }, []);
  const loadedWithSize = useCallback((width: number, height: number) => {
    const ratio = Math.min(2.4, Math.max(0.5, width / height));
    if (Number.isFinite(ratio) && width > 0 && height > 0) {
      setPreview((current) => {
        if (current.key === key && current.entry) current.entry.aspectRatio = ratio;
        return current;
      });
      onAspectRatio?.(ratio);
    }
    loaded();
  }, [key, loaded, onAspectRatio]);
  const failed = useCallback(() => {
    setPreview((current) => {
      if (current.key !== key) return current;
      if (current.entry && previewCache.get(key) === current.entry) previewCache.delete(key);
      return { key, entry: null, value: null };
    });
    loaded();
  }, [key, loaded]);
  const source = preview.key === key ? preview.value : null;
  const glyph = <FileGlyph kind={kind} />;
  let content = glyph;
  if (source && kind === "image") content = <img className="size-full object-cover" src={source.url} alt="" loading="lazy" onLoad={(event) => loadedWithSize(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} onError={failed} />;
  else if (source && kind === "video") content = <video className="size-full object-cover" src={source.url} muted preload="metadata" onLoadedMetadata={(event) => loadedWithSize(event.currentTarget.videoWidth, event.currentTarget.videoHeight)} onError={failed} />;
  else if (source && kind === "audio") content = <AudioWaveform src={source.url} name={mediaCardName(card)} sizeBytes={source.sizeBytes} compact tone="instrument" onReady={loaded} onError={failed} />;
  return <div className={`asset-preview relative grid w-full flex-none place-items-center overflow-hidden rounded-cell [corner-shape:squircle] bg-frame text-on-instrument-muted${className ? ` ${className}` : ""}`} style={fill ? undefined : { aspectRatio: aspectRatio ?? 1, height: "auto" }} aria-hidden={kind === "audio" ? undefined : true}>
    {content}
    {/* The frame stays chrome-free once a preview lands; the badge is only the label for an
        empty frame, and the kind is already spelled out in the caption below it.
        The kind tints are gone: `--ok`, `--warn`, `--fg-2` and `--fg-3` all resolve to the same
        #A4A4A0 on a dark surface, so image/video/audio/text painted one grey, and only `pdf`
        differed -- alert red on a label that carries no alarm. The plate is the shared
        `bg-media-plate` role, replacing the 78% the old shared mark rule hand-picked; this badge
        only ever shows over the empty frame, so its secondary ink is read against #060606 and
        not against media. This badge still states no `display`:
        the workspace project card's collage hides it with `[&_.asset-extension]:hidden`, which is
        (0,2,0) and beats any per-element display utility, but a `block` here would be a second
        decision about the same property on the same element. */}
    {!source && <span className={`asset-extension type-${kind ?? "file"} min-h-5 rounded-chip bg-media-plate px-1.75 type-xs text-on-instrument-muted`}><FileGlyph kind={kind} size={11} />{kind ?? "file"}</span>}
  </div>;
}

