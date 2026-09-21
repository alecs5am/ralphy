/**
 * A list of Marketplace items: the row, its preview, and the keyboard that walks the list.
 *
 * Above a threshold the list virtualizes, and the two renderers share one row so a keyboard move
 * lands the same way in both -- the virtual one scrolls the row into view first, which is the only
 * difference between them. A preview that fails to load falls back to its category glyph rather
 * than leaving a hole the size of a video.
 */
import { ArrowUpRight } from "@/shared/ui/icons";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { WINDOW, WINDOW_PLATE } from "@/shared/ui/Window";
import type {
  MarketplaceQueryState,
} from "../model/navigation";
import type {
  MarketplaceItemPresentation,
} from "../lib/presentation";
import { declaredModelText, marketplaceModelDescription, marketplaceRevisionLabel } from "../lib/model-copy";
import { categoryIcons, categoryLabels } from "./browse-discover";
import { marketplaceItemDomId } from "./MarketplaceBrowse";
import { categoryIdentity } from "./MarketplaceCategoryIdentity";
import { MarketplaceItemPreview } from "./MarketplaceItemPreview";
import { MarketplaceCreativeResults } from "./MarketplaceCreativeResults";


export interface MarketplaceResultsProps {
  items: MarketplaceItemPresentation[];
  query: MarketplaceQueryState;
  originKey?: string | null;
  onOpenItem(key: string): void;
  onUse?(item: MarketplaceItemPresentation): void;
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
    className={`${WINDOW} marketplace-result marketplace-result-${item.category} w-full text-left text-ink hover:bg-surface-hover`}
    id={marketplaceItemDomId(item.key)}
    data-marketplace-item-key={item.key}
    type="button"
    tabIndex={tabStop === undefined ? undefined : tabStop ? 0 : -1}
    onClick={() => onOpenItem(item.key)}
    onFocus={onFocus}
    onKeyDown={openFromKeyboard}
  >
    <span className={`${WINDOW_PLATE} grid w-full min-w-0 grid-cols-(--marketplace-result-columns) items-center gap-2 p-2 @max-marketplace-result/main-region:grid-cols-(--marketplace-result-columns-narrow)`}>
    <span className="marketplace-result-preview grid size-18 place-items-center overflow-hidden rounded-control bg-instrument text-on-instrument [&_img]:size-full [&_img]:object-cover [&_video]:size-full [&_video]:object-cover"><MarketplaceItemPreview item={item} /></span>
    <span className="marketplace-result-copy flex min-w-0 flex-col gap-0.5">
      <span className="marketplace-result-category flex items-center gap-1.5 font-mono type-mono-xs uppercase tracking-caps text-muted"><Icon className="size-3" aria-hidden="true" />{categoryLabels[item.category]}<MarketplaceInstallBadge item={item} /></span>
      <strong className="truncate type-sm font-normal">{item.name}</strong>
      <p className="m-0 truncate type-xs leading-snug text-muted">{item.category === "models" ? marketplaceModelDescription(item.model) : item.summary || "No description provided."}</p>
      <small className="truncate font-mono type-mono-xs text-muted">{item.sourceLabel}{item.version.status === "ready" ? ` · ${item.category === "models" ? marketplaceRevisionLabel(item.version.value) : item.version.value}` : ""}</small>
    </span>
    <span className="marketplace-result-evidence flex min-w-0 flex-col gap-1.5 @max-marketplace-result/main-region:hidden">
      <MarketplaceItemMetadata item={item} />
    </span>
    <span className="marketplace-result-action flex h-8 items-center gap-2 rounded-control bg-surface-sunken px-3 type-xs text-ink @max-marketplace-result/main-region:hidden">View details<ArrowUpRight className="size-3" aria-hidden="true" /></span>
    </span>
  </button>;
}

function MarketplaceItemMetadata({ item }: { item: MarketplaceItemPresentation }) {
  const lines = item.origin === "pack"
    ? [item.pack.tags.slice(0, 2).join(" · ") || categoryIdentity[item.category].note, item.pack.path ? "Bundled document" : "Catalog reference"]
    : item.category === "models"
      ? [declaredModelText(item.model.modality, item.model.recommendedPackage.format) || "Package format not declared", declaredModelText(item.model.comfort.label) || "Compatibility not assessed"]
      : item.category === "recipes"
        ? [item.recipe.recipe?.kind ?? "Media recipe", item.recipe.recipe?.artifact ? "Artifact included" : "Read the instructions"]
        : item.category === "sounds" ? ["Sound", `${item.sound.referenceUrls.length} references`]
        : ["Creative starting point", `${(item.category === "templates" ? item.template : item.recipe).referenceUrls.length} references`];
  return <>{lines.map((line, index) => <small className="truncate font-mono type-mono-xs text-muted" key={index}>{line}</small>)}</>;
}

/* The legacy install record is a bookmark, not an agent capability switch. */
function MarketplaceInstallBadge({ item }: { item: MarketplaceItemPresentation }) {
  if (item.origin !== "pack" || item.install.status !== "installed") return null;
  return <span className="marketplace-result-installed rounded-control bg-instrument px-1.5 py-0.5 text-on-instrument">Saved</span>;
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
  const creative = props.items.filter(({ category }) => category !== "models" && category !== "skills");
  const technical = props.items.filter(({ category }) => category === "models" || category === "skills");
  if (creative.length) return <><MarketplaceCreativeResults {...props} items={creative} />{technical.length > 0 && <StandardMarketplaceResults {...props} items={technical} />}</>;
  return props.items.length > 100 ? <VirtualMarketplaceResults {...props} /> : <StandardMarketplaceResults {...props} />;
}
