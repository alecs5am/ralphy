import {
  Blocks,
  Bot,
  Box,
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
import { useRef, type ComponentType, type KeyboardEvent, type SVGProps } from "react";
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
  return `marketplace-item-${key.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 220)}`;
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
  const updated = snapshot.items.filter((item) => item.updatedAt.status === "ready").slice(0, 6);
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

function itemPreview(item: MarketplaceItemPresentation) {
  if (item.category === "models") {
    const url = item.model.previewUrl ?? item.model.iconUrl;
    return url
      ? <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" />
      : <span className="marketplace-preview-fallback"><Cpu aria-hidden="true" /><small>{item.model.recommendedPackage.format || "Format unavailable"}</small></span>;
  }
  if (item.category === "recipes") {
    const demo = item.recipe.recipe?.demo;
    const url = demo?.posterUrl ?? demo?.afterUrl ?? demo?.beforeUrl ?? null;
    return url
      ? <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" />
      : <span className="marketplace-preview-fallback"><Code2 aria-hidden="true" /><small>{item.recipe.recipe?.kind ?? "Recipe preview unavailable"}</small></span>;
  }
  return <span className="marketplace-preview-fallback"><LayoutTemplate aria-hidden="true" /><small>Preview unavailable from schema 1</small></span>;
}

function availabilityLabel(value: Availability<string>, fallback: string): string {
  return value.status === "ready" ? value.value : fallback;
}

export interface MarketplaceResultsProps {
  items: MarketplaceItemPresentation[];
  query: MarketplaceQueryState;
  onOpenItem(key: string): void;
}

function MarketplaceResult({ item, onOpenItem }: { item: MarketplaceItemPresentation; onOpenItem(key: string): void }) {
  const Icon = categoryIcons[item.category];
  const openFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpenItem(item.key);
  };
  return <button
    className={`marketplace-result marketplace-result-${item.category}`}
    id={marketplaceItemDomId(item.key)}
    data-marketplace-item-key={item.key}
    type="button"
    onClick={() => onOpenItem(item.key)}
    onKeyDown={openFromKeyboard}
  >
    <span className="marketplace-result-preview">{itemPreview(item)}</span>
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

function VirtualMarketplaceResults({ items, query, onOpenItem }: MarketplaceResultsProps) {
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
  const rows = virtualizer.getVirtualItems();
  return <section className="marketplace-results" aria-labelledby="marketplace-results-heading">
    <div className="marketplace-results-meta"><h2 id="marketplace-results-heading">{items.length} results</h2><span>{resultOrderLabel(query)}</span></div>
    <ol
      className="marketplace-results-list is-virtualized"
      role="list"
      ref={root}
      style={{ height: virtualizer.getTotalSize() }}
    >
      {rows.map((row) => <li key={row.key} style={{ transform: `translateY(${row.start - scrollMargin}px)` }}><MarketplaceResult item={items[row.index]!} onOpenItem={onOpenItem} /></li>)}
    </ol>
  </section>;
}

export function MarketplaceResults(props: MarketplaceResultsProps) {
  if (props.items.length > 100) return <VirtualMarketplaceResults {...props} />;
  return <section className="marketplace-results" aria-labelledby="marketplace-results-heading">
    <div className="marketplace-results-meta"><h2 id="marketplace-results-heading">{props.items.length} {props.items.length === 1 ? "result" : "results"}</h2><span>{resultOrderLabel(props.query)}</span></div>
    <ol className="marketplace-results-list" role="list">
      {props.items.map((item) => <li key={item.key}><MarketplaceResult item={item} onOpenItem={props.onOpenItem} /></li>)}
    </ol>
  </section>;
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

export function MarketplaceCategoryView({ category, snapshot, onOpenItem }: {
  category: MarketplaceCategory;
  snapshot: Extract<MarketplaceSnapshot, { status: "ready" }>;
  onOpenItem(key: string): void;
}) {
  const categoryState = snapshot.categories.find((item) => item.category === category);
  const items = snapshot.items.filter((item) => item.category === category);
  if (categoryState?.count.status === "unavailable") return <section className="marketplace-unavailable-category" role="status"><Box aria-hidden="true" /><h2>{categoryState.label} catalog unavailable</h2><p>{categoryState.count.reason}</p><small>No sample items are shown as production catalog records.</small></section>;
  return <MarketplaceResults items={items} query={snapshot.query} onOpenItem={onOpenItem} />;
}

export interface MarketplaceBrowseProps {
  route: MarketplaceBrowseRoute;
  snapshot: MarketplaceSnapshot;
  onOpenItem(key: string): void;
  onOpenCategory(category: MarketplaceCategory): void;
  onOpenLibrary(section: MarketplaceLibrarySection): void;
  onRetry(): void;
  onClearQuery(): void;
  onClearFilters(): void;
}

export function MarketplaceBrowse({ route, snapshot, onOpenItem, onOpenCategory, onOpenLibrary, onRetry, onClearQuery, onClearFilters }: MarketplaceBrowseProps) {
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
        : route.kind === "results" ? <MarketplaceResults items={snapshot.items} query={snapshot.query} onOpenItem={onOpenItem} />
          : route.kind === "category" ? <MarketplaceCategoryView category={route.category} snapshot={snapshot} onOpenItem={onOpenItem} />
            : <section className="marketplace-route-placeholder" role="status"><Package aria-hidden="true" /><h2>This Marketplace route is not available yet.</h2><p>The current Desktop contract does not expose data or a mutation for this route.</p></section>}
  </>;
}
