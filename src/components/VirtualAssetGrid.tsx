import { useVirtualizer } from "@tanstack/react-virtual";
import { FileText, Film, Image, Music2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import type { MediaCardDto, MediaRef } from "../../electron/ralphy/types";
import type { ProjectPreview, ProjectReference } from "../lib/ipc";
import { assetGridGeometry, mediaFallbackAspectRatio, previewScheduler } from "../lib/media";
import { useOptionalInstrumentScroll } from "../instrument/InstrumentShell";
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
  maxColumns?: number;
  gap?: number;
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

function mediaCardKind(card: MediaCardDto): string {
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

function mediaCardFacts(card: MediaCardDto): string {
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
}: Pick<MediaCardTileProps, "card" | "project" | "rootEpoch" | "resolvePreview"> & {
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
  return <div className={`asset-preview relative grid w-full flex-none place-items-center overflow-hidden rounded-cell bg-frame text-on-instrument-muted${className ? ` ${className}` : ""}`} style={fill ? undefined : { aspectRatio: aspectRatio ?? 1, height: "auto" }} aria-hidden={kind === "audio" ? undefined : true}>
    {content}
    {/* The frame stays chrome-free once a preview lands; the badge is only the label for an
        empty frame, and the kind is already spelled out in the caption below it.
        The kind tints are gone: `--ok`, `--warn`, `--fg-2` and `--fg-3` all resolve to the same
        #A4A4A0 on a dark surface, so image/video/audio/text painted one grey, and only `pdf`
        differed -- alert red on a label that carries no alarm. The scrim keeps the 78% of
        `--instrument-media-frame` the shared mark rule used. This badge still states no `display`:
        the workspace project card's collage hides it with `[&_.asset-extension]:hidden`, which is
        (0,2,0) and beats any per-element display utility, but a `block` here would be a second
        decision about the same property on the same element. */}
    {!source && <span className={`asset-extension type-${kind ?? "file"} min-h-5 rounded-chip bg-frame/78 px-1.75 type-xs text-on-instrument-muted`}><FileGlyph kind={kind} size={11} />{kind ?? "file"}</span>}
  </div>;
}

export function MediaCardTile({ card, project, rootEpoch, selected, resolvePreview, onSelect, onOpen, onContextMenu, aspectRatio, onAspectRatio }: MediaCardTileProps) {
  const name = mediaCardName(card);
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
  /* `cursor: grab` never rendered: `.media-card-tile` restated `pointer` after it, so the tile
     reads as a click target at rest and only says "grabbing" while a drag is live. */
  return <article className={`asset-tile media-card-tile group flex w-full min-h-0 flex-col gap-2 bg-transparent text-left text-ink cursor-pointer active:cursor-grabbing [contain:layout_style] ${selected ? "is-selected" : ""}`} data-selected={selected || undefined} style={{ "--asset-aspect": ratio } as CSSProperties}>
    <MediaCardPreview card={card} project={project} rootEpoch={rootEpoch} resolvePreview={resolvePreview} aspectRatio={ratio} onAspectRatio={rememberRatio} />
    <button className="media-card-button flex w-full min-w-0 items-start gap-1.5 bg-transparent p-0 text-left text-ink focus-visible:rounded-control" type="button" aria-label={`${name}${selected ? ", selected" : ""}`} aria-pressed={selected} onClick={onSelect} onDoubleClick={onOpen} onKeyDown={onKeyDown} onContextMenu={openContext}>
      <i className={`mt-1 size-1.5 shrink-0 rounded-full ${selected ? "bg-alert" : "bg-ink"}`} aria-hidden="true" />
      <span className="asset-copy grid h-auto w-full min-w-0 px-0.5 pt-2.25"><strong className="block truncate type-label leading-4 font-normal text-ink">{name}</strong><small className="block truncate font-code type-mono-xs leading-4 tracking-label text-muted uppercase">{mediaCardKind(card)} · {mediaCardFacts(card)}</small></span>
    </button>
  </article>;
}

// Caption sits under the frame now, so the row estimate has to reserve its two lines.
const CAPTION_HEIGHT = 44;

export function VirtualAssetGrid({ items, project, rootEpoch, selectedRef, resolvePreview, onSelect, onOpen, onContextMenu, density, maxColumns = 7, gap = 16, hasMore, loadingMore, appendError, onLoadMore, onRetryAppend, scrollMemory, scrollKey, scrollResetToken }: VirtualAssetGridProps) {
  const instrumentScroll = useOptionalInstrumentScroll();
  const [gridElement, setGridElement] = useState<HTMLDivElement | null>(null);
  const rememberedScroll = useRememberedScroll(scrollMemory, scrollKey, scrollResetToken);
  const attachScroll = useCallback((node: HTMLDivElement | null) => {
    setGridElement((current) => current === node ? current : node);
    rememberedScroll.ref(instrumentScroll ? null : node);
  }, [instrumentScroll, rememberedScroll.ref]);
  const scrollRoot = instrumentScroll?.element ?? gridElement;
  const [scrollMargin, setScrollMargin] = useState(0);
  const [width, setWidth] = useState(800);
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const geometry = assetGridGeometry(width, density, gap, maxColumns);
  const cardRatio = useCallback((card: MediaCardDto) => {
    const key = previewKey(project, rootEpoch, card.ref);
    return ratios[key] ?? mediaFallbackAspectRatio(previewKind(card), key);
  }, [project, ratios, rootEpoch]);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRoot,
    getItemKey: (index) => previewKey(project, rootEpoch, items[index]!.ref),
    estimateSize: (index) => geometry.tileWidth / cardRatio(items[index]!) + CAPTION_HEIGHT,
    initialOffset: () => instrumentScroll ? 0 : scrollMemory.get(scrollKey) ?? 0,
    initialRect: { width: 800, height: 600 },
    lanes: geometry.columns,
    gap: geometry.gap,
    overscan: geometry.columns * 2,
    scrollMargin,
  });
  const rememberAspectRatio = useCallback((key: string, ratio: number) => {
    setRatios((current) => current[key] === ratio ? current : { ...current, [key]: ratio });
  }, []);
  useLayoutEffect(() => {
    const element = gridElement;
    if (!element) return;
    const measure = () => {
      const style = window.getComputedStyle(element);
      setWidth(Math.max(1, element.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)));
      if (instrumentScroll?.element) {
        const gridBounds = element.getBoundingClientRect();
        const deskBounds = instrumentScroll.element.getBoundingClientRect();
        setScrollMargin(gridBounds.top - deskBounds.top + instrumentScroll.element.scrollTop);
      } else {
        setScrollMargin(0);
      }
    };
    measure();
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [gridElement, instrumentScroll]);
  useEffect(() => virtualizer.measure(), [geometry.columns, geometry.tileWidth, ratios, virtualizer]);
  if (items.length === 0) return <div className="asset-grid-empty flex min-h-0 flex-1 flex-col items-center justify-center gap-1 type-xs text-muted"><strong className="type-sm font-normal">No media matches this filter.</strong><span>Change the media filter to see other records.</span></div>;
  return <div className="asset-grid-scroll" ref={attachScroll} onScroll={instrumentScroll ? undefined : rememberedScroll.onScroll}>
    <div className="virtual-grid-space relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((virtual) => {
        const card = items[virtual.index]!;
        return <div className="virtual-masonry-item absolute top-0 [contain:layout_style]" data-lane={virtual.lane} key={virtual.key} style={{ left: `${virtual.lane * (geometry.tileWidth + geometry.gap)}px`, transform: `translateY(${virtual.start - scrollMargin}px)`, width: `${geometry.tileWidth}px` }}>
          <MediaCardTile card={card} project={project} rootEpoch={rootEpoch} selected={selectedRef?.type === card.ref.type && selectedRef.id === card.ref.id} resolvePreview={resolvePreview} aspectRatio={cardRatio(card)} onAspectRatio={rememberAspectRatio} onSelect={() => onSelect(card)} onOpen={() => onOpen(card)} onContextMenu={(point) => onContextMenu(card, point)} />
        </div>;
      })}
    </div>
    <AutoCursorTail root={scrollRoot} hasMore={hasMore} loading={loadingMore} error={appendError} onLoadMore={onLoadMore} onRetry={onRetryAppend} />
  </div>;
}
