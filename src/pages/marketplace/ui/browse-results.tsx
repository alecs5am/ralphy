/**
 * A list of Marketplace items: the row, its preview, and the keyboard that walks the list.
 *
 * Above a threshold the list virtualizes, and the two renderers share one row so a keyboard move
 * lands the same way in both -- the virtual one scrolls the row into view first, which is the only
 * difference between them. A preview that fails to load falls back to its category glyph rather
 * than leaving a hole the size of a video.
 */
import {
  Code2,
  Cpu,
  FileText,
  LayoutTemplate,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type {
  MarketplaceQueryState,
} from "../model/navigation";
import type {
  Availability,
  MarketplaceItemPresentation,
} from "../lib/presentation";
import { marketplacePublicMediaKind } from "../lib/presentation";
import { categoryIcons, categoryLabels } from "./browse-discover";
import { marketplaceItemDomId } from "./MarketplaceBrowse";

type MarketplacePreview = { url: string; kind: "image" | "video"; posterUrl?: string };

function preview(item: MarketplaceItemPresentation): MarketplacePreview | null {
  if (item.category === "models") {
    const url = item.model.previewUrl ?? item.model.iconUrl;
    return url ? { url, kind: "image" } : null;
  }
  if (item.origin === "public" && item.category === "templates") {
    const url = item.template.referenceUrls.find((candidate) => marketplacePublicMediaKind(candidate) !== null);
    return url ? { url, kind: marketplacePublicMediaKind(url)! } : null;
  }
  if (item.origin === "public" && item.category === "recipes") {
    const demo = item.recipe.recipe?.demo;
    const url = [demo?.storageUrl, demo?.afterUrl, demo?.beforeUrl, demo?.posterUrl]
      .find((candidate): candidate is string => Boolean(candidate && marketplacePublicMediaKind(candidate)));
    if (!url) return null;
    const posterUrl = demo?.posterUrl && marketplacePublicMediaKind(demo.posterUrl) === "image" ? demo.posterUrl : undefined;
    return { url, kind: marketplacePublicMediaKind(url)!, posterUrl };
  }
  return null;
}

function previewFallback(item: MarketplaceItemPresentation, failedKind?: "image" | "video") {
  if (item.category === "models") return <span className="marketplace-preview-fallback flex size-full flex-col items-center justify-center gap-1.5 text-on-instrument-muted"><Cpu className="size-4" aria-hidden="true" /><small className="max-w-24 text-center font-mono type-mono-xs leading-tight">{item.model.recommendedPackage.format || "Format unavailable"}</small></span>;
  if (item.origin === "public" && item.category === "recipes") return <span className="marketplace-preview-fallback flex size-full flex-col items-center justify-center gap-1.5 text-on-instrument-muted"><Code2 className="size-4" aria-hidden="true" /><small className="max-w-24 text-center font-mono type-mono-xs leading-tight">{failedKind ? `Recipe ${failedKind} preview unavailable` : item.recipe.recipe?.kind ?? "Recipe preview unavailable"}</small></span>;
  /* A bundled row is a document, not a picture of one. Naming its slug beats
     apologising for a preview the source was never going to carry. */
  if (item.origin === "pack") return <span className="marketplace-preview-fallback flex size-full flex-col items-center justify-center gap-1.5 text-on-instrument-muted"><FileText className="size-4" aria-hidden="true" /><small className="max-w-24 text-center font-mono type-mono-xs leading-tight">{item.pack.slug}</small></span>;
  return <span className="marketplace-preview-fallback flex size-full flex-col items-center justify-center gap-1.5 text-on-instrument-muted"><LayoutTemplate className="size-4" aria-hidden="true" /><small className="max-w-24 text-center font-mono type-mono-xs leading-tight">{failedKind ? `Template ${failedKind} preview unavailable` : "Preview unavailable from schema 1"}</small></span>;
}

function MarketplaceItemPreview({ item }: { item: MarketplaceItemPresentation }) {
  const media = preview(item);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => setFailedUrl(null), [item.key, media?.url]);
  if (!media || failedUrl === media.url) return previewFallback(item, media?.kind);
  return media.kind === "video"
    ? <video src={media.url} poster={media.posterUrl} muted playsInline preload="metadata" controlsList="nodownload" aria-hidden="true" onError={() => setFailedUrl(media.url)} />
    : <img src={media.url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(media.url)} />;
}

function availabilityLabel(value: Availability<string>, fallback: string): string {
  return value.status === "ready" ? value.value : fallback;
}

export interface MarketplaceResultsProps {
  items: MarketplaceItemPresentation[];
  query: MarketplaceQueryState;
  originKey?: string | null;
  onOpenItem(key: string): void;
}

function MarketplaceResult({ item, index, tabStop, onFocus, onMove, onOpenItem }: {
  item: MarketplaceItemPresentation;
  index?: number;
  tabStop?: boolean;
  onFocus?(): void;
  onMove?(key: ResultMoveKey, index: number): void;
  onOpenItem(key: string): void;
}) {
  const Icon = categoryIcons[item.category];
  const openFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (onMove && index !== undefined && ["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"].includes(event.key)) {
      event.preventDefault();
      onMove(event.key as ResultMoveKey, index);
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpenItem(item.key);
  };
  return <button
    className={`marketplace-result marketplace-result-${item.category} grid min-h-26 w-full min-w-0 grid-cols-(--marketplace-result-columns) items-center gap-3 rounded-cell bg-surface p-2 text-left text-ink hover:bg-surface-hover @max-marketplace-result/main-region:grid-cols-(--marketplace-result-columns-narrow)`}
    id={marketplaceItemDomId(item.key)}
    data-marketplace-item-key={item.key}
    type="button"
    tabIndex={tabStop === undefined ? undefined : tabStop ? 0 : -1}
    onClick={() => onOpenItem(item.key)}
    onFocus={onFocus}
    onKeyDown={openFromKeyboard}
  >
    <span className="marketplace-result-preview grid h-22 w-26 place-items-center overflow-hidden rounded-control bg-instrument text-on-instrument @max-marketplace-result/main-region:h-18 @max-marketplace-result/main-region:w-22 [&_img]:size-full [&_img]:object-cover [&_video]:size-full [&_video]:object-cover"><MarketplaceItemPreview item={item} /></span>
    <span className="marketplace-result-copy flex min-w-0 flex-col gap-1">
      <span className="marketplace-result-category flex items-center gap-1.5 font-mono type-mono-xs uppercase tracking-caps text-muted"><Icon className="size-3" aria-hidden="true" />{categoryLabels[item.category]}<MarketplaceInstallBadge item={item} /></span>
      <strong className="truncate text-base font-normal">{item.name}</strong>
      <p className="m-0 line-clamp-2 text-xs leading-snug text-muted">{item.summary || "The current source did not provide a summary."}</p>
      <small className="truncate font-mono type-mono-xs text-muted">{item.sourceLabel} · {availabilityLabel(item.version, "Version unavailable")}</small>
    </span>
    <span className="marketplace-result-evidence flex min-w-0 flex-col gap-1.5 @max-marketplace-result/main-region:hidden">
      <small className="truncate font-mono type-mono-xs text-muted">{availabilityLabel(item.license, "License unavailable")}</small>
      <small className="truncate font-mono type-mono-xs text-muted">{availabilityLabel(item.compatibility, "Compatibility unavailable")}</small>
    </span>
    <span className="marketplace-result-action flex h-8 items-center rounded-control bg-instrument px-3 text-xs text-on-instrument @max-marketplace-result/main-region:hidden">View details</span>
  </button>;
}

/* An installed row says so on the shelf, and an installed-but-off row says that
   too -- otherwise "installed" and "in use" look identical from here. */
function MarketplaceInstallBadge({ item }: { item: MarketplaceItemPresentation }) {
  if (item.origin !== "pack" || item.install.status !== "installed") return null;
  return item.install.enabled
    ? <span className="marketplace-result-installed rounded-control bg-instrument px-1.5 py-0.5 text-on-instrument">Installed</span>
    : <span className="marketplace-result-installed rounded-control bg-surface-sunken px-1.5 py-0.5 text-muted">Installed · off</span>;
}

function resultOrderLabel(query: MarketplaceQueryState): string {
  return query.sort === "relevance" ? "Relevance · keyword" : query.sort === "updated" ? "Updated" : "Name";
}

type ResultMoveKey = "ArrowDown" | "ArrowUp" | "Home" | "End" | "PageDown" | "PageUp";

function resultMoveIndex(key: ResultMoveKey, index: number, count: number): number {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const distance = key === "PageDown" || key === "PageUp" ? 6 : 1;
  return Math.max(0, Math.min(count - 1, index + (key === "ArrowDown" || key === "PageDown" ? distance : -distance)));
}

function useResultNavigation(items: MarketplaceItemPresentation[], scrollToIndex?: (index: number) => void) {
  const [activeKey, setActiveKey] = useState<string | null>(items[0]?.key ?? null);
  const focusFrame = useRef<number | null>(null);
  useEffect(() => {
    if (activeKey !== null && items.some(({ key }) => key === activeKey)) return;
    setActiveKey(items[0]?.key ?? null);
  }, [activeKey, items]);
  useEffect(() => () => {
    if (focusFrame.current !== null) window.cancelAnimationFrame(focusFrame.current);
  }, []);
  const move = (key: ResultMoveKey, index: number) => {
    const targetIndex = resultMoveIndex(key, index, items.length);
    const target = items[targetIndex];
    if (!target) return;
    setActiveKey(target.key);
    scrollToIndex?.(targetIndex);
    if (focusFrame.current !== null) window.cancelAnimationFrame(focusFrame.current);
    let attempts = 0;
    const focus = () => {
      const element = document.getElementById(marketplaceItemDomId(target.key));
      if (element) {
        element.focus({ preventScroll: true });
        focusFrame.current = null;
      } else if (attempts < 8) {
        attempts += 1;
        focusFrame.current = window.requestAnimationFrame(focus);
      }
    };
    focusFrame.current = window.requestAnimationFrame(focus);
  };
  return { activeKey, setActiveKey, move };
}

function VirtualMarketplaceResults({ items, query, originKey, onOpenItem }: MarketplaceResultsProps) {
  const root = useRef<HTMLOListElement>(null);
  const scrollMargin = root.current?.offsetTop ?? 0;
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => root.current?.closest<HTMLDivElement>(".marketplace-scroll") ?? null,
    getItemKey: (index) => items[index]?.key ?? index,
    estimateSize: () => 112,
    overscan: 6,
    initialRect: { width: 900, height: 700 },
    scrollMargin,
  });
  const navigation = useResultNavigation(items, (index) => virtualizer.scrollToIndex(index, { align: "auto" }));
  const rows = virtualizer.getVirtualItems();
  const originIndex = originKey ? items.findIndex(({ key }) => key === originKey) : -1;
  useEffect(() => {
    if (originIndex < 0 || !originKey || document.getElementById(marketplaceItemDomId(originKey))) return;
    let nextFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      nextFrame = window.requestAnimationFrame(() => {
        if (!document.getElementById(marketplaceItemDomId(originKey))) virtualizer.scrollToIndex(originIndex, { align: "start" });
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(nextFrame);
    };
  }, [originIndex, originKey, virtualizer]);
  const activeKey = rows.some((row) => items[row.index]?.key === navigation.activeKey)
    ? navigation.activeKey
    : items[rows[0]?.index ?? -1]?.key ?? null;
  return <section className="marketplace-results pt-5" aria-labelledby="marketplace-results-heading">
    <div className="marketplace-results-meta mb-2 flex items-baseline justify-between gap-4 px-1"><h2 className="m-0 text-base font-normal" id="marketplace-results-heading">{items.length} results</h2><span className="font-mono type-mono-xs uppercase tracking-caps text-muted">{resultOrderLabel(query)}</span></div>
    <ol
      className="marketplace-results-list is-virtualized relative block list-none p-0"
      role="list"
      ref={root}
      style={{ height: virtualizer.getTotalSize() }}
    >
      {rows.map((row) => {
        const item = items[row.index]!;
        return <li className="absolute top-0 left-0 h-28 w-full" key={row.key} aria-setsize={items.length} aria-posinset={row.index + 1} style={{ transform: `translateY(${row.start - scrollMargin}px)` }}>
          <MarketplaceResult
            item={item}
            index={row.index}
            tabStop={activeKey === item.key}
            onFocus={() => navigation.setActiveKey(item.key)}
            onMove={navigation.move}
            onOpenItem={onOpenItem}
          />
        </li>;
      })}
    </ol>
  </section>;
}

function StandardMarketplaceResults({ items, query, onOpenItem }: MarketplaceResultsProps) {
  return <section className="marketplace-results pt-5" aria-labelledby="marketplace-results-heading">
    <div className="marketplace-results-meta mb-2 flex items-baseline justify-between gap-4 px-1"><h2 className="m-0 text-base font-normal" id="marketplace-results-heading">{items.length} {items.length === 1 ? "result" : "results"}</h2><span className="font-mono type-mono-xs uppercase tracking-caps text-muted">{resultOrderLabel(query)}</span></div>
    <ol className="marketplace-results-list flex list-none flex-col gap-2 p-0" role="list">
      {items.map((item, index) => <li key={item.key} aria-setsize={items.length} aria-posinset={index + 1}>
        <MarketplaceResult item={item} onOpenItem={onOpenItem} />
      </li>)}
    </ol>
  </section>;
}

export function MarketplaceResults(props: MarketplaceResultsProps) {
  return props.items.length > 100 ? <VirtualMarketplaceResults {...props} /> : <StandardMarketplaceResults {...props} />;
}
