import { useCallback, useState, type KeyboardEvent } from "react";
import type { MediaCardDto, MediaRef } from "../../../../electron/ralphy/types";
import type { ProjectReference } from "@/shared/api/ipc";
import { mediaCardFacts, mediaCardKind, mediaCardName, MediaCardPreview, type ResolvePreview } from "@/entities/media";
import { COMMAND_BUTTON } from "@/shared/ui/route-chrome";
import { AutoCursorTail } from "./AutoCursorTail";
import { MediaCardTile } from "./VirtualAssetGrid";
import { gridMoveIndex } from "../lib/grid-navigation";

export function MediaGallery({ items, project, rootEpoch, selectedRef, resolvePreview, onSelect, onOpen, onContextMenu, hasMore, loadingMore, appendError, onLoadMore, onRetryAppend, aspect }: {
  items: MediaCardDto[];
  project: ProjectReference;
  rootEpoch: number;
  selectedRef: MediaRef | null;
  resolvePreview: ResolvePreview;
  onSelect(card: MediaCardDto): void;
  onOpen(card: MediaCardDto): void;
  onContextMenu(card: MediaCardDto, point: { x: number; y: number }): void;
  hasMore: boolean;
  loadingMore: boolean;
  appendError: string | null;
  onLoadMore(): void;
  onRetryAppend(): void;
  aspect?: number;
}) {
  const [rail, setRail] = useState<HTMLDivElement | null>(null);
  const attachRail = useCallback((node: HTMLDivElement | null) => setRail((current) => current === node ? current : node), []);
  const selected = items.find((card) => card.ref.type === selectedRef?.type && card.ref.id === selectedRef.id) ?? items[0];
  /* The rail is one row, so it is the grid walk with every item in a single line: left and right
     step, up and down land outside it and do nothing. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const current = items.findIndex((card) => card.ref.type === selected?.ref.type && card.ref.id === selected?.ref.id);
    const next = gridMoveIndex(current, event.key, items.length, items.length);
    if (next === null) return;
    event.preventDefault();
    onSelect(items[next]!);
    rail?.querySelectorAll(".media-gallery-thumb")[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  if (!selected) return null;
  const name = mediaCardName(selected);
  return <div className="media-gallery flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 overflow-hidden" onKeyDown={onKeyDown}>
    <section className="media-gallery-stage relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-frame bg-frame" aria-label={`Preview ${name}`} onDoubleClick={() => onOpen(selected)}>
      <MediaCardPreview card={selected} project={project} rootEpoch={rootEpoch} resolvePreview={resolvePreview} fill fit="contain" className="absolute inset-0 size-full" />
    </section>
    <div className="media-gallery-meta flex min-w-0 flex-none items-center gap-2 px-1">
      <span className="min-w-0 flex-1 truncate type-sm"><strong className="font-normal">{name}</strong><span className="ml-2 font-code type-mono-xs text-muted">{mediaCardKind(selected)} · {mediaCardFacts(selected)}</span></span>
      <button className={COMMAND_BUTTON} type="button" onClick={() => onOpen(selected)}>Open preview</button>
    </div>
    <div className="media-gallery-rail flex min-w-0 flex-none gap-1.5 overflow-x-auto overflow-y-hidden overscroll-contain pb-1" aria-label="Gallery thumbnails" ref={attachRail}>
      {items.map((card) => <div className="media-gallery-thumb w-24 shrink-0" key={`${card.ref.type}:${card.ref.id}`}>
        <MediaCardTile card={card} project={project} rootEpoch={rootEpoch} selected={card.ref.type === selected.ref.type && card.ref.id === selected.ref.id} resolvePreview={resolvePreview} aspectRatio={aspect} actionLabel={`Show ${mediaCardName(card)}`} onSelect={() => onSelect(card)} onOpen={() => onSelect(card)} onContextMenu={(point) => onContextMenu(card, point)} />
      </div>)}
      <AutoCursorTail root={rail} axis="horizontal" hasMore={hasMore} loading={loadingMore} error={appendError} onLoadMore={onLoadMore} onRetry={onRetryAppend} />
    </div>
  </div>;
}
