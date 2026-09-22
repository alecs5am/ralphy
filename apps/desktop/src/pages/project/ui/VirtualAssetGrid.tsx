import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useId, useLayoutEffect, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";

import type { MediaCardDto, MediaRef } from "../../../../electron/ralphy/types";
import type { ProjectReference } from "@/shared/api/ipc";
import { assetGridGeometry, mediaCardFacts, mediaCardKind, mediaCardName, MediaCardPreview, mediaFallbackAspectRatio, previewKey, previewKind, type MediaCardIdentity, type ResolvePreview } from "@/entities/media";
import { entityDragProps, type Attachment } from "@/features/agent-chat";
import { AutoCursorTail } from "./AutoCursorTail";
import { useRememberedScroll } from "../lib/scroll-memory";
import { gridMoveIndex } from "../lib/grid-navigation";

/**
 * The media library as a virtualized row grid, and the tile it repeats.
 *
 * Both belong to this page rather than to the media entity: the tile is a drag source for the
 * chat and a selection target for the page's context menu. The grid owns its scroll and measures
 * against its viewport. MediaCardPreview draws each record one layer down.
 */

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

interface MediaCardTileProps extends MediaCardIdentity {
  selected: boolean;
  onSelect(): void;
  onOpen(): void;
  onContextMenu(point: { x: number; y: number }): void;
  aspectRatio?: number;
  onAspectRatio?(key: string, ratio: number): void;
  actionLabel?: string;
}


/* What a media tile is when it lands in the chat: an artifact by its slug, anything else by the
   ref the library itself uses. Neither is a path -- a media record is a record, and the agent
   resolves it against the library the same way the panel did. */
export function mediaAttachment(card: MediaCardDto): Attachment {
  return {
    kind: "media",
    ref: "slug" in card ? card.slug : `${card.ref.type}/${card.ref.id}`,
    label: mediaCardName(card),
  };
}

export function MediaCardTile({ card, project, rootEpoch, selected, resolvePreview, onSelect, onOpen, onContextMenu, aspectRatio, onAspectRatio, actionLabel }: MediaCardTileProps) {
  const name = mediaCardName(card);
  const factsId = useId();
  const key = previewKey(project, rootEpoch, card.ref);
  const ratio = aspectRatio ?? mediaFallbackAspectRatio(previewKind(card), key);
  const rememberRatio = useCallback((value: number) => onAspectRatio?.(key, value), [key, onAspectRatio]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.repeat) return;
    if (event.key === " ") { event.preventDefault(); onSelect(); }
    if (event.key === "Enter") { event.preventDefault(); if (event.currentTarget.parentElement) stopPreview(event.currentTarget.parentElement); onOpen(); }
  };
  const focusTile = (event: MouseEvent<HTMLElement>) => {
    const target = event.currentTarget.querySelector<HTMLElement>(".media-card-button");
    target?.focus({ preventScroll: true });
  };
  const openContext = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    stopPreview(event.currentTarget);
    focusTile(event);
    onSelect();
    onContextMenu({ x: event.clientX, y: event.clientY });
  };
  const stopPreview = (element: HTMLElement) => {
    const video = element.querySelector("video");
    if (video) { video.pause(); video.currentTime = 0; }
  };
  /* `cursor: grab` never rendered: `.media-card-tile` restated `pointer` after it, so the tile
     reads as a click target at rest and only says "grabbing" while a drag is live. */
  return <article {...entityDragProps(mediaAttachment(card))} className={`asset-tile media-card-tile media-caption-surface group relative flex w-full min-h-0 flex-col overflow-hidden rounded-cell bg-frame text-left text-ink cursor-pointer active:cursor-grabbing [contain:layout_style] ${selected ? "is-selected" : ""}`} data-selected={selected || undefined} style={{ "--asset-aspect": ratio, aspectRatio: ratio } as CSSProperties} onMouseEnter={(event) => { const video = event.currentTarget.querySelector("video"); if (video) void video.play().catch(() => undefined); }} onMouseLeave={(event) => stopPreview(event.currentTarget)} onClick={(event) => { stopPreview(event.currentTarget); focusTile(event); onOpen(); }} onContextMenu={openContext}>
    <MediaCardPreview card={card} project={project} rootEpoch={rootEpoch} resolvePreview={resolvePreview} fill className="absolute inset-0 size-full" aspectRatio={ratio} onAspectRatio={rememberRatio} />
    <button className="media-card-button media-hover-caption absolute inset-x-1 bottom-1 flex min-w-0 items-start gap-1.5 rounded-cell bg-media-plate p-2 text-left text-on-instrument transition-opacity duration-fast motion-reduce:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-on-instrument" type="button" aria-label={`${actionLabel ?? name}${selected ? ", selected" : ""}`} aria-pressed={selected} aria-describedby={factsId} onKeyDown={onKeyDown} onKeyUp={(event) => { if (event.key === " ") event.preventDefault(); }}>
      <span className="asset-copy grid w-full min-w-0 gap-0.5"><strong className="block truncate type-label leading-4 font-normal">{name}</strong><small id={factsId} className="block truncate font-code type-mono-xs leading-4 tracking-label text-on-instrument">{mediaCardKind(card)} · {mediaCardFacts(card)}</small></span>
    </button>
  </article>;
}

export function VirtualAssetGrid({ items, project, rootEpoch, selectedRef, resolvePreview, onSelect, onOpen, onContextMenu, density, maxColumns = 7, gap = 16, hasMore, loadingMore, appendError, onLoadMore, onRetryAppend, scrollMemory, scrollKey, scrollResetToken }: VirtualAssetGridProps) {
  const [gridElement, setGridElement] = useState<HTMLDivElement | null>(null);
  const rememberedScroll = useRememberedScroll(scrollMemory, scrollKey, scrollResetToken);
  const attachScroll = useCallback((node: HTMLDivElement | null) => {
    setGridElement((current) => current === node ? current : node);
    rememberedScroll.ref(node);
  }, [rememberedScroll.ref]);
  const [width, setWidth] = useState(800);
  /* The index whose tile should take focus once the row it is on has been rendered. Arrow keys
     can land on a row the virtualizer has not built yet, so the move asks for the scroll and
     leaves the focus for the render that follows it. */
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const geometry = assetGridGeometry(width, density, gap, maxColumns);
  const cardRatio = useCallback((card: MediaCardDto) => mediaFallbackAspectRatio(previewKind(card), previewKey(project, rootEpoch, card.ref)), [project, rootEpoch]);
  const rowCount = Math.ceil(items.length / geometry.columns);
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => gridElement,
    getItemKey: (index) => index,
    estimateSize: () => geometry.tileHeight,
    initialOffset: () => scrollMemory.get(scrollKey) ?? 0,
    initialRect: { width: 800, height: 600 },
    gap: geometry.gap,
    overscan: 2,
  });
  useLayoutEffect(() => {
    const element = gridElement;
    if (!element) return;
    const measure = () => {
      const style = window.getComputedStyle(element);
      setWidth(Math.max(1, element.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)));
    };
    measure();
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [gridElement]);
  useEffect(() => virtualizer.measure(), [geometry.columns, geometry.tileHeight, virtualizer]);
  useEffect(() => {
    if (focusIndex === null || !gridElement) return;
    const frame = window.requestAnimationFrame(() => {
      gridElement.querySelector<HTMLElement>(`[data-tile-index="${focusIndex}"] .media-card-button`)?.focus({ preventScroll: true });
      setFocusIndex(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusIndex, gridElement]);
  /* Arrows move the selection, Enter opens it. A grid that opened on arrow would make browsing
     it a series of modals, and the selection is what the page's context menu and viewer read. */
  const onGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const current = items.findIndex((card) => selectedRef?.type === card.ref.type && selectedRef.id === card.ref.id);
    const next = gridMoveIndex(current, event.key, geometry.columns, items.length);
    if (next === null) return;
    event.preventDefault();
    onSelect(items[next]!);
    virtualizer.scrollToIndex(Math.floor(next / geometry.columns));
    setFocusIndex(next);
  };
  if (items.length === 0) return <div className="asset-grid-empty flex min-h-0 flex-1 flex-col items-center justify-center gap-1 type-xs text-muted"><strong className="type-sm font-normal">No media matches this filter.</strong><span>Change the media filter to see other records.</span></div>;
  return <div className="asset-grid-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain" ref={attachScroll} onKeyDown={onGridKeyDown} onScroll={(event) => { event.currentTarget.querySelectorAll("video").forEach((video) => video.pause()); rememberedScroll.onScroll(event); }}>
    <div className="virtual-grid-space relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((virtual) => {
        const first = virtual.index * geometry.columns;
        const row = items.slice(first, first + geometry.columns);
        return <div className="virtual-grid-row absolute top-0 grid w-full [contain:layout_style]" key={virtual.key} style={{ gap: geometry.gap, gridTemplateColumns: `repeat(${geometry.columns}, minmax(0, 1fr))`, transform: `translateY(${virtual.start}px)` }}>
          {row.map((card, column) => <div className="virtual-grid-item min-w-0" data-tile-index={first + column} key={previewKey(project, rootEpoch, card.ref)}>
            <MediaCardTile card={card} project={project} rootEpoch={rootEpoch} selected={selectedRef?.type === card.ref.type && selectedRef.id === card.ref.id} resolvePreview={resolvePreview} aspectRatio={cardRatio(card)} onSelect={() => onSelect(card)} onOpen={() => onOpen(card)} onContextMenu={(point) => onContextMenu(card, point)} />
          </div>)}
        </div>;
      })}
    </div>
    <AutoCursorTail root={gridElement} hasMore={hasMore} loading={loadingMore} error={appendError} onLoadMore={onLoadMore} onRetry={onRetryAppend} />
  </div>;
}
