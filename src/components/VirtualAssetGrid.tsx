import { useVirtualizer } from "@tanstack/react-virtual";
import { FileText, Film, Image, Music2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import type { MediaCardDto, MediaRef } from "../../electron/ralphy/types";
import type { ProjectPreview, ProjectReference } from "../lib/ipc";
import { assetGridGeometry, mediaFallbackAspectRatio, previewScheduler } from "../lib/media";
import { AutoCursorTail } from "../screens/project/AutoCursorTail";
import { useRememberedScroll } from "../screens/project/scroll-memory";
import { AudioWaveform } from "./media/AudioWaveform";

type ResolvePreview = (project: ProjectReference, ref: MediaCardDto["ref"]) => Promise<ProjectPreview | null>;

export interface VirtualAssetGridProps {
  items: MediaCardDto[];
  project: ProjectReference;
  rootEpoch: number;
  selectedRef: MediaRef | null;
  resolvePreview: ResolvePreview;
  onSelect(card: MediaCardDto): void;
  onOpen(card: MediaCardDto): void;
  onContextMenu(card: MediaCardDto, point: { x: number; y: number }): void;
  density: number;
  hasMore: boolean;
  loadingMore: boolean;
  appendError: string | null;
  onLoadMore(): void;
  onRetryAppend(): void;
  scrollMemory: Map<string, number>;
  scrollKey: string;
  scrollResetToken: string | number;
}

interface MediaCardTileProps {
  card: MediaCardDto;
  project: ProjectReference;
  rootEpoch: number;
  selected: boolean;
  resolvePreview: ResolvePreview;
  onSelect(): void;
  onOpen(): void;
  onContextMenu(point: { x: number; y: number }): void;
  aspectRatio?: number;
  onAspectRatio?(key: string, ratio: number): void;
}

type PreviewKind = "image" | "video" | "audio";
type PreviewCacheEntry = { promise: Promise<ProjectPreview | null>; settled: boolean; value: ProjectPreview | null; aspectRatio: number | null };
type PreviewState = { key: string; entry: PreviewCacheEntry | null; value: ProjectPreview | null };
const previewCache = new Map<string, PreviewCacheEntry>();

function previewKind(card: MediaCardDto): PreviewKind | null {
  const kind = card.mime?.split("/")[0] ?? ("kind" in card ? card.kind : null);
  return kind === "image" || kind === "video" || kind === "audio" ? kind : null;
}

function previewKey(project: ProjectReference, rootEpoch: number, ref: MediaRef): string {
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

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "Size unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function mediaCardStatus(card: MediaCardDto): { className: string; label: string } {
  if (!("selectedRevisionId" in card) || !card.selectedRevisionId) return { className: "is-unreviewed", label: "Unreviewed" };
  const state = card.selectedState?.toLocaleLowerCase();
  if (state === "approved") return { className: "is-approved", label: "Approved" };
  if (state === "rejected" || state === "reject") return { className: "is-rejected", label: "Rejected" };
  if (state === "candidate" || state === "working" || state === "needs work" || state === "needs-work") return { className: "is-needs-work", label: "Needs work" };
  return { className: "is-unreviewed", label: "Unreviewed" };
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
  showTypeBadge = true,
}: Pick<MediaCardTileProps, "card" | "project" | "rootEpoch" | "resolvePreview"> & {
  fill?: boolean;
  className?: string;
  aspectRatio?: number;
  onAspectRatio?(ratio: number): void;
  showTypeBadge?: boolean;
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
  if (source && kind === "image") content = <img src={source.url} alt="" loading="lazy" onLoad={(event) => loadedWithSize(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} onError={failed} />;
  else if (source && kind === "video") content = <video
    src={source.url}
    muted
    preload="metadata"
    onLoadedMetadata={(event) => loadedWithSize(event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
    onError={failed}
  />;
  else if (source && kind === "audio") content = <AudioWaveform src={source.url} name={mediaCardName(card)} sizeBytes={source.sizeBytes} compact onReady={loaded} onError={failed} />;
  return <div className={`asset-preview${className ? ` ${className}` : ""}`} style={fill ? undefined : { aspectRatio: aspectRatio ?? 1, height: "auto" }} aria-hidden={kind === "audio" ? undefined : true}>
    {content}
    {showTypeBadge && <span className={`asset-extension type-${kind ?? "file"}`}><FileGlyph kind={kind} size={11} />{kind ?? "file"}</span>}
  </div>;
}

export function MediaCardTile({ card, project, rootEpoch, selected, resolvePreview, onSelect, onOpen, onContextMenu, aspectRatio, onAspectRatio }: MediaCardTileProps) {
  const name = mediaCardName(card);
  const status = mediaCardStatus(card);
  const key = previewKey(project, rootEpoch, card.ref);
  const ratio = aspectRatio ?? mediaFallbackAspectRatio(previewKind(card), key);
  const rememberRatio = useCallback((value: number) => onAspectRatio?.(key, value), [key, onAspectRatio]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.repeat) return;
    if (event.key === " ") { event.preventDefault(); onSelect(); }
    if (event.key === "Enter") { event.preventDefault(); onOpen(); }
  };
  const openContext = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    onSelect();
    onContextMenu({ x: event.clientX, y: event.clientY });
  };
  const previewVideo = (event: MouseEvent<HTMLButtonElement>) => event.currentTarget.parentElement?.querySelector("video");
  return <article className={`asset-tile media-card-tile${selected ? " is-selected" : ""}`} data-selected={selected || undefined} style={{ "--asset-aspect": ratio } as CSSProperties}>
    <MediaCardPreview card={card} project={project} rootEpoch={rootEpoch} resolvePreview={resolvePreview} aspectRatio={ratio} onAspectRatio={rememberRatio} showTypeBadge={false} />
    {selected && <span className="media-console-badge">IN CONSOLE</span>}
    <button className="media-card-button" type="button" aria-label={`${name}${selected ? ", selected" : ""}`} aria-pressed={selected} onClick={onSelect} onDoubleClick={onOpen} onKeyDown={onKeyDown} onContextMenu={openContext} onMouseEnter={(event) => { void previewVideo(event)?.play().catch(() => undefined); }} onMouseLeave={(event) => { const video = previewVideo(event); if (video) { video.pause(); video.currentTime = 0; } }}>
      <span className="media-card-caption"><span className={`media-card-status ${status.className}`} role="img" aria-label={status.label} /><strong>{name}</strong><small>{formatBytes(card.bytes)}</small></span>
    </button>
  </article>;
}

export function VirtualAssetGrid({ items, project, rootEpoch, selectedRef, resolvePreview, onSelect, onOpen, onContextMenu, density, hasMore, loadingMore, appendError, onLoadMore, onRetryAppend, scrollMemory, scrollKey, scrollResetToken }: VirtualAssetGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const rememberedScroll = useRememberedScroll(scrollMemory, scrollKey, scrollResetToken);
  const attachScroll = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    rememberedScroll.ref(node);
    setScrollRoot((current) => current === node ? current : node);
  }, [rememberedScroll.ref]);
  const [width, setWidth] = useState(800);
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const geometry = assetGridGeometry(width, density, 10, 7);
  const cardRatio = useCallback((card: MediaCardDto) => {
    const key = previewKey(project, rootEpoch, card.ref);
    return ratios[key] ?? mediaFallbackAspectRatio(previewKind(card), key);
  }, [project, ratios, rootEpoch]);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => previewKey(project, rootEpoch, items[index]!.ref),
    estimateSize: (index) => geometry.tileWidth / cardRatio(items[index]!) + 27,
    initialOffset: () => scrollMemory.get(scrollKey) ?? 0,
    initialRect: { width: 800, height: 600 },
    lanes: geometry.columns,
    gap: geometry.gap,
    overscan: geometry.columns * 2,
  });
  const rememberAspectRatio = useCallback((key: string, ratio: number) => {
    setRatios((current) => current[key] === ratio ? current : { ...current, [key]: ratio });
  }, []);
  useLayoutEffect(() => {
    const element = scrollRoot;
    if (!element) return;
    const measure = () => {
      const style = window.getComputedStyle(element);
      setWidth(Math.max(1, element.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)));
    };
    measure();
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollRoot]);
  useEffect(() => virtualizer.measure(), [geometry.columns, geometry.tileWidth, ratios, virtualizer]);
  if (items.length === 0) return <div className="asset-grid-empty"><strong>No media matches this filter.</strong><span>Change the media filter to see other records.</span></div>;
  return <div className="asset-grid-scroll" ref={attachScroll} onScroll={rememberedScroll.onScroll}>
    <div className="virtual-grid-space" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((virtual) => {
        const card = items[virtual.index]!;
        return <div className="virtual-masonry-item" data-lane={virtual.lane} key={virtual.key} style={{ left: `${virtual.lane * (geometry.tileWidth + geometry.gap)}px`, transform: `translateY(${virtual.start}px)`, width: `${geometry.tileWidth}px` }}>
          <MediaCardTile card={card} project={project} rootEpoch={rootEpoch} selected={selectedRef?.type === card.ref.type && selectedRef.id === card.ref.id} resolvePreview={resolvePreview} aspectRatio={cardRatio(card)} onAspectRatio={rememberAspectRatio} onSelect={() => onSelect(card)} onOpen={() => onOpen(card)} onContextMenu={(point) => onContextMenu(card, point)} />
        </div>;
      })}
    </div>
    <AutoCursorTail root={scrollRoot} hasMore={hasMore} loading={loadingMore} error={appendError} onLoadMore={onLoadMore} onRetry={onRetryAppend} />
  </div>;
}
