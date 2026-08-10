import { useVirtualizer } from "@tanstack/react-virtual";
import { FileText, Film, Image, Music2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { MediaCardDto, MediaRef } from "../../electron/ralphy/types";
import type { ProjectPreview, ProjectReference } from "../lib/ipc";
import { assetGridGeometry, previewScheduler } from "../lib/media";
import { AudioWaveform } from "./media/AudioWaveform";

type ResolvePreview = (project: ProjectReference, ref: MediaCardDto["ref"]) => Promise<ProjectPreview | null>;

interface VirtualAssetGridProps {
  items: MediaCardDto[];
  project: ProjectReference;
  rootEpoch: number;
  selectedRef: MediaRef | null;
  resolvePreview: ResolvePreview;
  onSelect(card: MediaCardDto): void;
  onOpen(card: MediaCardDto): void;
}

interface MediaCardTileProps {
  card: MediaCardDto;
  project: ProjectReference;
  rootEpoch: number;
  selected: boolean;
  resolvePreview: ResolvePreview;
  onSelect(): void;
  onOpen(): void;
}

type PreviewKind = "image" | "video" | "audio";
type PreviewCacheEntry = { promise: Promise<ProjectPreview | null>; settled: boolean; value: ProjectPreview | null };
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
  const entry: PreviewCacheEntry = { promise: Promise.resolve(null), settled: false, value: null };
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

function TilePreview({ card, project, rootEpoch, resolvePreview }: Pick<MediaCardTileProps, "card" | "project" | "rootEpoch" | "resolvePreview">) {
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
        if (!disposed) setPreview({ key, entry, value });
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
  }, [card.ref, key, kind, project, resolvePreview]);
  const loaded = useCallback(() => { releaseRef.current?.(); releaseRef.current = null; }, []);
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
  if (source && kind === "image") content = <img src={source.url} alt="" loading="lazy" onLoad={loaded} onError={failed} />;
  else if (source && kind === "video") content = <video src={source.url} muted preload="metadata" onLoadedMetadata={loaded} onError={failed} />;
  else if (source && kind === "audio") content = <AudioWaveform src={source.url} name={mediaCardName(card)} sizeBytes={source.sizeBytes} compact onReady={loaded} onError={failed} />;
  return <div className="asset-preview" style={{ aspectRatio: "16 / 10", height: "auto" }} aria-hidden={kind === "audio" ? undefined : true}>
    {content}
    <span className={`asset-extension type-${kind ?? "file"}`}><FileGlyph kind={kind} size={11} />{kind ?? "file"}</span>
  </div>;
}

export function MediaCardTile({ card, project, rootEpoch, selected, resolvePreview, onSelect, onOpen }: MediaCardTileProps) {
  const name = mediaCardName(card);
  const kind = previewKind(card);
  const copy = <span className="asset-copy"><strong>{name}</strong><small>{mediaCardKind(card)} · {card.ref.id} · {mediaCardFacts(card)}</small></span>;
  const selection = <button type="button" aria-label={`${name}${selected ? ", selected" : ""}`} aria-pressed={selected} onClick={onSelect} onDoubleClick={onOpen} style={{ width: "100%", padding: 0, border: 0, background: "transparent", color: "inherit", textAlign: "left" }}>
    {kind === "audio" ? copy : <><TilePreview card={card} project={project} rootEpoch={rootEpoch} resolvePreview={resolvePreview} />{copy}</>}
  </button>;
  return <article className={`asset-tile media-card-tile${selected ? " is-selected" : ""}`} style={{ position: "relative" }}>
    {kind === "audio" && <TilePreview card={card} project={project} rootEpoch={rootEpoch} resolvePreview={resolvePreview} />}
    {selection}
    <button type="button" aria-label={`Open ${name}`} onClick={onOpen} style={{ position: "absolute", top: 8, right: 8, zIndex: 1 }}>Open</button>
  </article>;
}

export function VirtualAssetGrid({ items, project, rootEpoch, selectedRef, resolvePreview, onSelect, onOpen }: VirtualAssetGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const geometry = assetGridGeometry(width, 190, 16);
  const rows = useMemo(() => Array.from({ length: Math.ceil(items.length / geometry.columns) }, (_, index) => ({ key: index, items: items.slice(index * geometry.columns, (index + 1) * geometry.columns) })), [geometry.columns, items]);
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, getItemKey: (index) => rows[index]?.key ?? index, estimateSize: () => geometry.rowHeight, overscan: 3 });
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => {
      const style = window.getComputedStyle(element);
      setWidth(Math.max(1, element.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)));
    };
    measure();
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => virtualizer.measure(), [geometry.columns, geometry.rowHeight, virtualizer]);
  if (items.length === 0) return <div className="asset-grid-empty"><strong>No media matches this filter.</strong><span>Change the media filter to see other records.</span></div>;
  return <div className="asset-grid-scroll" ref={scrollRef}>
    <div className="virtual-grid-space" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((virtualRow) => <div className="virtual-asset-row" key={virtualRow.key} style={{ transform: `translateY(${virtualRow.start}px)`, gridTemplateColumns: `repeat(${geometry.columns}, minmax(0, 1fr))`, height: `${geometry.rowHeight}px`, "--asset-tile-height": `${geometry.tileHeight}px`, "--asset-row-gap": `${geometry.gap}px` } as CSSProperties}>
        {rows[virtualRow.index].items.map((card) => <MediaCardTile key={previewKey(project, rootEpoch, card.ref)} card={card} project={project} rootEpoch={rootEpoch} selected={selectedRef?.type === card.ref.type && selectedRef.id === card.ref.id} resolvePreview={resolvePreview} onSelect={() => onSelect(card)} onOpen={() => onOpen(card)} />)}
      </div>)}
    </div>
  </div>;
}
