import {
  Blocks,
  Bot,
  CircleAlert,
  Code2,
  Cpu,
  FileText,
  LayoutTemplate,
  MessageSquareText,
  Package,
  RefreshCw,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState, type ComponentType, type KeyboardEvent, type SVGProps } from "react";
import type {
  MarketplaceBrowseRoute,
  MarketplaceCategory,
  MarketplaceLibrarySection,
  MarketplaceQueryState,
} from "../../state/marketplace-navigation";
import type {
  Availability,
  MarketplaceCategoryPresentation,
  MarketplaceItemPresentation,
  MarketplaceSnapshot,
  MarketplaceSourceIssue,
} from "./presentation";
import {
  MarketplaceUnavailableCategory,
  MarketplaceUnavailableCollectionRoute,
} from "./MarketplaceUnavailableViews";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
const categoryIcons: Record<MarketplaceCategory, Icon> = {
  models: Cpu,
  templates: LayoutTemplate,
  recipes: Code2,
  prompts: MessageSquareText,
  components: Blocks,
  skills: Bot,
};
const categoryLabels: Record<MarketplaceCategory, string> = {
  models: "Models",
  templates: "Templates",
  recipes: "Recipes",
  prompts: "Prompts",
  components: "Components & Effects",
  skills: "Skills",
};
const sourceLabels: Record<MarketplaceSourceIssue["source"], string> = {
  "ralphy-public": "Ralphy public library",
  huggingface: "Hugging Face",
  civitai: "Civitai",
  modelscope: "ModelScope",
  models: "Model catalog",
};

export function marketplaceItemDomId(key: string): string {
  let hash = 14_695_981_039_346_656_037n;
  for (const character of key) {
    hash ^= BigInt(character.codePointAt(0)!);
    hash = BigInt.asUintN(64, hash * 1_099_511_628_211n);
  }
  return `marketplace-item-${key.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 220)}-${hash.toString(36)}`;
}

function countLabel(count: Availability<number>): string {
  if (count.status !== "ready") return count.reason;
  return `${count.value} ${count.value === 1 ? "item" : "items"}`;
}

function CategoryCard({ value, onOpen }: { value: MarketplaceCategoryPresentation; onOpen(category: MarketplaceCategory): void }) {
  const Icon = categoryIcons[value.category];
  return <li>
    <button className="marketplace-category-card" type="button" onClick={() => onOpen(value.category)}>
      <span><Icon aria-hidden="true" /><strong>{value.label}</strong></span>
      <small className={value.count.status === "unavailable" ? "is-unavailable" : ""}>{countLabel(value.count)}</small>
      <p>{value.purpose}</p>
    </button>
  </li>;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

export function MarketplaceDiscover({ snapshot, onOpenCategory, onOpenLibrary }: {
  snapshot: Extract<MarketplaceSnapshot, { status: "ready" }>;
  onOpenCategory(category: MarketplaceCategory): void;
  onOpenLibrary(section: MarketplaceLibrarySection): void;
}) {
  const installed = snapshot.machine?.installed?.filter(({ runtime }) => runtime === "ollama") ?? [];
  const updated = snapshot.items
    .flatMap((item) => {
      if (item.updatedAt.status !== "ready") return [];
      const timestamp = Date.parse(item.updatedAt.value);
      return Number.isFinite(timestamp) ? [{ item, timestamp }] : [];
    })
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 6)
    .map(({ item }) => item);
  const hasAnyCount = snapshot.categories.some(({ count }) => count.status === "ready" && count.value > 0);
  return <div className="marketplace-discover">
    <section aria-labelledby="marketplace-categories-heading">
      <div className="marketplace-section-heading"><span>Browse</span><h2 id="marketplace-categories-heading">Categories</h2></div>
      <ul className="marketplace-category-grid" role="list">{snapshot.categories.map((category) => <CategoryCard value={category} onOpen={onOpenCategory} key={category.category} />)}</ul>
    </section>
    {!hasAnyCount && <div className="marketplace-empty-note" role="status"><Package aria-hidden="true" /><span><strong>No items have been returned by the current sources yet.</strong><small>Categories remain visible with their current source state.</small></span></div>}
    {installed.length > 0 && <section aria-labelledby="marketplace-continue-heading">
      <div className="marketplace-section-heading"><span>Local state</span><h2 id="marketplace-continue-heading">Continue where you left off</h2></div>
      <ul className="marketplace-installed-list" role="list">{installed.map((item) => <li key={`${item.runtime}:${item.id}`}><button type="button" onClick={() => onOpenLibrary("installed")}><Cpu aria-hidden="true" /><span><strong>{item.name}</strong><small>Registered in Ollama · {item.format}</small></span></button></li>)}</ul>
    </section>}
    {updated.length > 0 && <section aria-labelledby="marketplace-updated-heading">
      <div className="marketplace-section-heading"><span>Source timestamps</span><h2 id="marketplace-updated-heading">Recently updated</h2></div>
      <ul className="marketplace-updated-list" role="list">{updated.map((item) => <li key={item.key}><span><strong>{item.name}</strong><small>{categoryLabels[item.category]} · {item.sourceLabel}</small></span><time dateTime={item.updatedAt.status === "ready" ? item.updatedAt.value : undefined}>{item.updatedAt.status === "ready" ? formatDate(item.updatedAt.value) : ""}</time></li>)}</ul>
    </section>}
  </div>;
}

function previewUrl(item: MarketplaceItemPresentation): string | null {
  if (item.category === "models") {
    return item.model.previewUrl ?? item.model.iconUrl;
  }
  if (item.category === "recipes") {
    const demo = item.recipe.recipe?.demo;
    return demo?.posterUrl ?? demo?.afterUrl ?? demo?.beforeUrl ?? null;
  }
  return null;
}

function previewFallback(item: MarketplaceItemPresentation) {
  if (item.category === "models") return <span className="marketplace-preview-fallback"><Cpu aria-hidden="true" /><small>{item.model.recommendedPackage.format || "Format unavailable"}</small></span>;
  if (item.category === "recipes") return <span className="marketplace-preview-fallback"><Code2 aria-hidden="true" /><small>{item.recipe.recipe?.kind ?? "Recipe preview unavailable"}</small></span>;
  return <span className="marketplace-preview-fallback"><LayoutTemplate aria-hidden="true" /><small>Preview unavailable from schema 1</small></span>;
}

function MarketplaceItemPreview({ item }: { item: MarketplaceItemPresentation }) {
  const url = previewUrl(item);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => setFailedUrl(null), [item.key, url]);
  return url && failedUrl !== url
    ? <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />
    : previewFallback(item);
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
    className={`marketplace-result marketplace-result-${item.category}`}
    id={marketplaceItemDomId(item.key)}
    data-marketplace-item-key={item.key}
    type="button"
    tabIndex={tabStop === undefined ? undefined : tabStop ? 0 : -1}
    onClick={() => onOpenItem(item.key)}
    onFocus={onFocus}
    onKeyDown={openFromKeyboard}
  >
    <span className="marketplace-result-preview"><MarketplaceItemPreview item={item} /></span>
    <span className="marketplace-result-copy">
      <span className="marketplace-result-category"><Icon aria-hidden="true" />{categoryLabels[item.category]}</span>
      <strong>{item.name}</strong>
      <p>{item.summary || "The current source did not provide a summary."}</p>
      <small>{item.sourceLabel} · {availabilityLabel(item.version, "Version unavailable")}</small>
    </span>
    <span className="marketplace-result-evidence">
      <small>{availabilityLabel(item.license, "License unavailable")}</small>
      <small>{availabilityLabel(item.compatibility, "Compatibility unavailable")}</small>
    </span>
    <span className="marketplace-result-action">View details</span>
  </button>;
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
    estimateSize: () => 126,
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
  return <section className="marketplace-results" aria-labelledby="marketplace-results-heading">
    <div className="marketplace-results-meta"><h2 id="marketplace-results-heading">{items.length} results</h2><span>{resultOrderLabel(query)}</span></div>
    <ol
      className="marketplace-results-list is-virtualized"
      role="list"
      ref={root}
      style={{ height: virtualizer.getTotalSize() }}
    >
      {rows.map((row) => {
        const item = items[row.index]!;
        return <li key={row.key} aria-setsize={items.length} aria-posinset={row.index + 1} style={{ transform: `translateY(${row.start - scrollMargin}px)` }}>
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
  return <section className="marketplace-results" aria-labelledby="marketplace-results-heading">
    <div className="marketplace-results-meta"><h2 id="marketplace-results-heading">{items.length} {items.length === 1 ? "result" : "results"}</h2><span>{resultOrderLabel(query)}</span></div>
    <ol className="marketplace-results-list" role="list">
      {items.map((item, index) => <li key={item.key} aria-setsize={items.length} aria-posinset={index + 1}>
        <MarketplaceResult item={item} onOpenItem={onOpenItem} />
      </li>)}
    </ol>
  </section>;
}

export function MarketplaceResults(props: MarketplaceResultsProps) {
  return props.items.length > 100 ? <VirtualMarketplaceResults {...props} /> : <StandardMarketplaceResults {...props} />;
}

function SourceState({ snapshot, onRetry }: { snapshot: Extract<MarketplaceSnapshot, { status: "ready" | "error" }>; onRetry(): void }) {
  if (snapshot.sourceErrors.length === 0) return null;
  const partial = snapshot.status === "ready";
  return <div className={`marketplace-source-state${partial ? " is-partial" : " is-total"}`} role={partial ? "status" : "alert"}>
    <CircleAlert aria-hidden="true" />
    <span>{snapshot.sourceErrors.map((issue) => <span key={`${issue.source}:${issue.scope}`}><strong>{sourceLabels[issue.source]} is unavailable</strong><small>{issue.message}</small></span>)}{partial && <em>Results from healthy sources are still shown.</em>}</span>
    <button type="button" onClick={onRetry}><RefreshCw aria-hidden="true" />Retry sources</button>
  </div>;
}

export function MarketplaceCategoryView({ category, snapshot, originKey, onOpenItem, onOpenUnavailableDetail }: {
  category: MarketplaceCategory;
  snapshot: Extract<MarketplaceSnapshot, { status: "ready" }>;
  originKey?: string | null;
  onOpenItem(key: string): void;
  onOpenUnavailableDetail?(category: "prompts" | "components" | "skills"): void;
}) {
  const categoryState = snapshot.categories.find((item) => item.category === category);
  const items = snapshot.items.filter((item) => item.category === category);
  if (categoryState?.count.status === "unavailable" && (category === "prompts" || category === "components" || category === "skills")) {
    return <MarketplaceUnavailableCategory category={category} sourceReason={categoryState.count.reason} onOpenDetail={onOpenUnavailableDetail} />;
  }
  return <MarketplaceResults items={items} query={snapshot.query} originKey={originKey} onOpenItem={onOpenItem} />;
}

export interface MarketplaceBrowseProps {
  route: MarketplaceBrowseRoute;
  snapshot: MarketplaceSnapshot;
  originKey?: string | null;
  onOpenItem(key: string): void;
  onOpenCategory(category: MarketplaceCategory): void;
  onOpenLibrary(section: MarketplaceLibrarySection): void;
  onOpenUnavailableDetail?(category: "prompts" | "components" | "skills"): void;
  onRetry(): void;
  onClearQuery(): void;
  onClearFilters(): void;
}

export function MarketplaceBrowse({ route, snapshot, originKey, onOpenItem, onOpenCategory, onOpenLibrary, onOpenUnavailableDetail, onRetry, onClearQuery, onClearFilters }: MarketplaceBrowseProps) {
  if (snapshot.status === "loading") return <div className="marketplace-loading" role="status" aria-busy="true"><div aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <i key={index} />)}</div><span>Loading Marketplace…</span></div>;
  if (snapshot.status === "error") return <div className="marketplace-total-failure"><SourceState snapshot={snapshot} onRetry={onRetry} /><h2>{snapshot.error}</h2><p>No source returned a current result set.</p></div>;
  const categoryUnavailable = route.kind === "category"
    && snapshot.categories.find(({ category }) => category === route.category)?.count.status === "unavailable";
  const noResults = (route.kind === "results" || route.kind === "category")
    && !categoryUnavailable
    && snapshot.items.length === 0;
  return <>
    {snapshot.refreshing && <div className="marketplace-refreshing" role="status">Refreshing catalog…</div>}
    {snapshot.publicSource?.source === "cache" && <div className="marketplace-cache-state" role="status"><CircleAlert aria-hidden="true" /><span><strong>Cached public catalog</strong><small>{snapshot.publicSource.warning ?? `Last refreshed ${formatDate(snapshot.publicSource.refreshedAt)}`}</small></span><button type="button" onClick={onRetry}><RefreshCw aria-hidden="true" />Refresh</button></div>}
    <SourceState snapshot={snapshot} onRetry={onRetry} />
    {noResults ? <div className="marketplace-no-results" role="status"><FileText aria-hidden="true" /><h2>No results</h2><p>The current query and filters returned no source-backed items.</p><span><button type="button" onClick={onClearFilters}>Clear filters</button><button type="button" onClick={onClearQuery}>Clear query</button></span></div>
      : route.kind === "discover" ? <MarketplaceDiscover snapshot={snapshot} onOpenCategory={onOpenCategory} onOpenLibrary={onOpenLibrary} />
        : route.kind === "results" ? <MarketplaceResults items={snapshot.items} query={snapshot.query} originKey={originKey} onOpenItem={onOpenItem} />
          : route.kind === "category" ? <MarketplaceCategoryView category={route.category} snapshot={snapshot} originKey={originKey} onOpenItem={onOpenItem} onOpenUnavailableDetail={onOpenUnavailableDetail} />
            : route.kind === "collection" ? <MarketplaceUnavailableCollectionRoute />
              : <section className="marketplace-route-placeholder" role="status"><Package aria-hidden="true" /><h2>This Marketplace route is not available yet.</h2><p>The current Desktop contract does not expose data or a mutation for this route.</p></section>}
  </>;
}
