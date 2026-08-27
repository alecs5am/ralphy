import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";

import type { MediaCardDto, MediaRef } from "../../../../electron/ralphy/types";
import type { ProjectReference } from "@/shared/api/ipc";
import { assetGridGeometry, mediaCardFacts, mediaCardKind, mediaCardName, MediaCardPreview, mediaFallbackAspectRatio, previewKey, previewKind, type MediaCardIdentity, type ResolvePreview } from "@/entities/media";
import { useOptionalInstrumentScroll } from "@/shared/lib/instrument-scroll";
import { entityDragProps, type Attachment } from "@/features/agent-chat";
import { AutoCursorTail } from "./AutoCursorTail";
import { useRememberedScroll } from "../lib/scroll-memory";

/**
 * The media library as a masonry grid, and the tile it repeats.
 *
 * Both belong to this page rather than to the media entity: the tile is a drag source for the
 * chat and a selection target for the page's context menu, and the grid measures itself against
 * the shell's own scroller. What a media record looks like is `MediaCardPreview`, one layer down.
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
  const focusTile = (event: MouseEvent<HTMLElement>) => {
    const target = event.currentTarget.querySelector<HTMLElement>(".media-card-button");
    target?.focus({ preventScroll: true });
  };
  const openContext = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    focusTile(event);
    onSelect();
    onContextMenu({ x: event.clientX, y: event.clientY });
  };
  /* `cursor: grab` never rendered: `.media-card-tile` restated `pointer` after it, so the tile
     reads as a click target at rest and only says "grabbing" while a drag is live. */
  return <article {...entityDragProps(mediaAttachment(card))} className={`asset-tile media-card-tile group flex w-full min-h-0 flex-col gap-2 bg-transparent text-left text-ink cursor-pointer active:cursor-grabbing [contain:layout_style] ${selected ? "is-selected" : ""}`} data-selected={selected || undefined} style={{ "--asset-aspect": ratio } as CSSProperties} onClick={(event) => { focusTile(event); onSelect(); }} onDoubleClick={onOpen} onContextMenu={openContext}>
    <MediaCardPreview card={card} project={project} rootEpoch={rootEpoch} resolvePreview={resolvePreview} aspectRatio={ratio} onAspectRatio={rememberRatio} />
    <button className="media-card-button flex w-full min-w-0 items-start gap-1.5 bg-transparent p-0 text-left text-ink focus-visible:rounded-control" type="button" aria-label={`${name}${selected ? ", selected" : ""}`} aria-pressed={selected} onKeyDown={onKeyDown}>
      <i className={`mt-1 size-1.5 shrink-0 rounded-full ${selected ? "bg-brand" : "bg-ink"}`} aria-hidden="true" />
      <span className="asset-copy grid h-auto w-full min-w-0 flex-none gap-0.75 px-0.5 pt-2.25"><strong className="block truncate type-label leading-4 font-normal text-ink">{name}</strong><small className="block truncate font-code type-mono-xs leading-4 tracking-label text-muted uppercase">{mediaCardKind(card)} · {mediaCardFacts(card)}</small></span>
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
