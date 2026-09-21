import { useEffect, useRef, useState, type RefObject } from "react";
import { AudioLines, FileText, Play } from "@/shared/ui/icons";
import { marketplacePublicMediaKind, type MarketplaceItemPresentation } from "../lib/presentation";
import { categoryIdentity } from "./MarketplaceCategoryIdentity";
import { MarketplaceVisualPreview } from "./MarketplaceVisualPreview";

export type PreviewMedia = { url: string; kind: "image" | "video" | "audio"; posterUrl?: string };
type Preview = PreviewMedia & { label?: string; before?: PreviewMedia };

export function marketplacePreview(item: MarketplaceItemPresentation): Preview | null {
  if (item.studio) return item.studio.preview;
  if (item.category === "models") {
    const url = item.model.previewUrl ?? item.model.iconUrl;
    return url ? { url, kind: "image" } : null;
  }
  if (item.origin !== "public") return null;
  const source = item.category === "templates" ? item.template : item.category === "sounds" ? item.sound : item.recipe;
  const demo = source.recipe?.demo;
  const candidates = [demo?.afterUrl, demo?.storageUrl, ...source.referenceUrls, demo?.posterUrl];
  const url = candidates.find((candidate): candidate is string => Boolean(candidate
    && (item.category === "sounds" ? marketplacePublicMediaKind(candidate) === "audio" : marketplacePublicMediaKind(candidate))));
  if (!url) return null;
  const posterUrl = demo?.posterUrl && marketplacePublicMediaKind(demo.posterUrl) === "image" ? demo.posterUrl : undefined;
  const beforeUrl = demo?.beforeUrl;
  const beforeKind = beforeUrl ? marketplacePublicMediaKind(beforeUrl) : null;
  const before = beforeUrl && beforeKind && beforeUrl !== url ? { url: beforeUrl, kind: beforeKind } : undefined;
  return { url, kind: marketplacePublicMediaKind(url)!, posterUrl, before };
}

/** Hover and detail playback share the same live motion preference. */
export function usePreviewPlayback(video: RefObject<HTMLVideoElement | null>, active: boolean, url?: string, allowMotion = false) {
  useEffect(() => {
    const player = video.current;
    if (!player) return;
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => {
      if (active && (!preference?.matches || allowMotion)) void player.play?.()?.catch(() => {});
      else player.pause?.();
    };
    const preferenceChanged = () => {
      if (preference?.matches) player.pause?.();
      else update();
    };
    update();
    preference?.addEventListener?.("change", preferenceChanged);
    return () => {
      preference?.removeEventListener?.("change", preferenceChanged);
      player.pause?.();
    };
  }, [active, allowMotion, url, video]);
}

/** Media is source-validated. Missing previews show actual copy, never fictional output. */
export function MarketplaceItemPreview({ item, active = false, onUnavailable }: { item: MarketplaceItemPresentation; active?: boolean; onUnavailable?(): void }) {
  const media = marketplacePreview(item);
  const video = useRef<HTMLVideoElement>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => setFailedUrl(null), [item.key, media?.url]);
  usePreviewPlayback(video, active, media?.url);
  const failed = () => { setFailedUrl(media!.url); onUnavailable?.(); };
  if (item.studio?.visualId || item.studio?.remocnVisual) return <MarketplaceVisualPreview item={item} compact active={active} onUnavailable={onUnavailable} />;
  if (!media || failedUrl === media.url) return <span className="marketplace-preview-fallback flex size-full flex-col justify-between gap-3 p-5 text-ink">
    <span className="flex items-center gap-1.5 type-xs text-muted"><FileText className="size-3.5" />{categoryIdentity[item.category].label}</span>
    <span className="line-clamp-5 type-sm leading-copy">{item.summary || item.name}</span>
    <small className="type-xs text-muted">{failedUrl ? "Preview unavailable" : item.category === "sounds" ? "Audio not provided" : "Read & use"}</small>
  </span>;
  if (media.kind === "audio") return <span className="flex size-full flex-col items-center justify-center gap-4 bg-instrument text-on-instrument">
    <AudioLines className="h-12 w-24" aria-hidden="true" />
    <span className="flex items-center gap-2 type-xs"><Play className="size-3.5" aria-hidden="true" />Listen</span>
    {media.label && <small className="type-meta text-on-instrument-muted">{media.label}</small>}
  </span>;
  return <>
    {media.kind === "video"
      ? <video ref={video} className="size-full object-cover" src={media.url} poster={media.posterUrl} muted loop playsInline preload="metadata" aria-hidden="true" onError={failed} />
      : <img className="size-full object-cover" src={media.url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={failed} />}
    {media.label && <small className="absolute left-2 top-2 rounded-chip bg-instrument/80 px-2 py-1 type-meta text-on-instrument">{media.label}</small>}
  </>;
}
