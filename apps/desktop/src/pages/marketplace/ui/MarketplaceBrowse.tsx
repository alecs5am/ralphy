/**
 * Which browse view a route asks for, and the id a row carries so Back can find it again.
 *
 * The id is a hash rather than the key itself: an item id may hold anything, and `getElementById`
 * needs something a selector can survive. Discover and the result list live beside this file.
 */
import {
  CircleAlert,
  FileText,
  Package,
  RefreshCw,
} from "@/shared/ui/icons";
import type {
  MarketplaceBrowseRoute,
  MarketplaceCategory,
  MarketplaceLibrarySection,
} from "../model/navigation";
import type {
  MarketplaceSnapshot,
  MarketplaceItemPresentation,
} from "../lib/presentation";
import { formatDate, MarketplaceDiscover, sourceLabels } from "./browse-discover";
import { MarketplaceResults } from "./browse-results";
import { MarketplaceCreativeResults } from "./MarketplaceCreativeResults";
import {
  MarketplaceUnavailableCategory,
  MarketplaceUnavailableCollectionRoute,
} from "./MarketplaceUnavailableViews";

export function marketplaceItemDomId(key: string): string {
  let hash = 14_695_981_039_346_656_037n;
  for (const character of key) {
    hash ^= BigInt(character.codePointAt(0)!);
    hash = BigInt.asUintN(64, hash * 1_099_511_628_211n);
  }
  return `marketplace-item-${key.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 220)}-${hash.toString(36)}`;
}

function SourceState({ snapshot, onRetry }: { snapshot: Extract<MarketplaceSnapshot, { status: "ready" | "error" }>; onRetry(): void }) {
  if (snapshot.sourceErrors.length === 0) return null;
  const partial = snapshot.status === "ready";
  return <details className="marketplace-source-state my-1 rounded-cell bg-surface px-2 py-1 type-xs text-muted" open={partial ? undefined : true}>
    <summary className="cursor-pointer">{partial ? "Some sources are unavailable" : "Library unavailable"}</summary>
    <div className="flex flex-wrap items-center gap-2 py-2" role={partial ? "status" : "alert"}>
      <span className="flex min-w-0 flex-1 flex-col gap-1">{snapshot.sourceErrors.map((issue) => <span key={`${issue.source}:${issue.scope}`}><strong className="font-medium">{sourceLabels[issue.source]} is unavailable.</strong> {issue.message}</span>)}</span>
      <button className="h-7 rounded-control bg-surface-sunken px-2 text-ink" type="button" onClick={onRetry}>Retry sources</button>
    </div>
  </details>;
}

export function MarketplaceCategoryView({ category, snapshot, originKey, onOpenItem, onOpenUnavailableDetail, onUse }: {
  category: MarketplaceCategory;
  snapshot: Extract<MarketplaceSnapshot, { status: "ready" }>;
  originKey?: string | null;
  onOpenItem(key: string): void;
  onUse?(item: MarketplaceItemPresentation): void;
  onOpenUnavailableDetail?(category: "prompts" | "components" | "skills"): void;
}) {
  const categoryState = snapshot.categories.find((item) => item.category === category);
  const items = snapshot.items.filter((item) => item.category === category);
  if (categoryState?.count.status === "unavailable" && (category === "prompts" || category === "components" || category === "skills")) {
    return <MarketplaceUnavailableCategory category={category} sourceReason={categoryState.count.reason} onOpenDetail={onOpenUnavailableDetail} />;
  }
  return category === "models" || category === "skills"
    ? <MarketplaceResults items={items} query={snapshot.query} originKey={originKey} onOpenItem={onOpenItem} />
    : <MarketplaceCreativeResults items={items} category={category} originKey={originKey} onOpenItem={onOpenItem} onUse={onUse} />;
}

export interface MarketplaceBrowseProps {
  route: MarketplaceBrowseRoute;
  snapshot: MarketplaceSnapshot;
  originKey?: string | null;
  onOpenItem(key: string): void;
  onUse?(item: MarketplaceItemPresentation): void;
  onOpenCategory(category: MarketplaceCategory): void;
  onOpenLibrary(section: MarketplaceLibrarySection): void;
  onOpenCollection?(): void;
  onOpenUnavailableDetail?(category: "prompts" | "components" | "skills"): void;
  onRetry(): void;
  onClearQuery(): void;
  onClearFilters(): void;
}

export function MarketplaceBrowse({ route, snapshot, originKey, onOpenItem, onOpenCategory, onOpenLibrary, onOpenCollection, onOpenUnavailableDetail, onRetry, onClearQuery, onClearFilters, onUse }: MarketplaceBrowseProps) {
  if (snapshot.status === "loading") return <div className="marketplace-loading flex min-h-72 flex-col items-center justify-center gap-4 text-muted" role="status" aria-busy="true"><div className="grid w-full grid-cols-3 gap-2 @max-marketplace-grid/main-region:grid-cols-2 @max-marketplace-column/main-region:grid-cols-1" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <i className="h-24 animate-pulse rounded-panel bg-surface motion-reduce:animate-none" key={index} />)}</div><span className="text-xs">Loading creative library…</span></div>;
  if (snapshot.status === "error") return <div className="marketplace-total-failure mt-5 flex min-h-64 flex-col items-center justify-center gap-2 rounded-panel bg-surface p-6 text-center"><SourceState snapshot={snapshot} onRetry={onRetry} /><h2 className="m-0 text-base font-normal">{snapshot.error}</h2><p className="m-0 max-w-xl text-sm text-muted">No source returned a current result set. Last known source metadata is unavailable.</p></div>;
  const categoryUnavailable = route.kind === "category"
    && snapshot.categories.find(({ category }) => category === route.category)?.count.status === "unavailable";
  const noResults = (route.kind === "results" || route.kind === "category")
    && !categoryUnavailable
    && snapshot.items.length === 0;
  return <>
    {snapshot.refreshing && <div className="marketplace-refreshing mt-2 text-xs text-muted" role="status">Refreshing catalog…</div>}
    {snapshot.publicSource?.source === "cache" && <div className="marketplace-cache-state mt-2 flex min-h-14 items-center gap-3 rounded-panel bg-instrument px-4 py-3 text-on-instrument @max-marketplace-column/main-region:flex-wrap" role="status"><CircleAlert className="size-4 shrink-0 text-alert" aria-hidden="true" /><span className="flex min-w-0 flex-1 flex-col"><strong className="text-sm font-normal">Offline · cached catalog</strong><small className="text-xs text-on-instrument-muted">{snapshot.publicSource.warning ? `${snapshot.publicSource.warning} · ` : ""}Last refreshed {formatDate(snapshot.publicSource.refreshedAt)}</small></span><button className="flex h-8 shrink-0 items-center gap-1.5 rounded-control bg-instrument-raised px-3 text-xs text-on-instrument @max-marketplace-column/main-region:ml-7 hover:bg-ghost-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-on-instrument" type="button" onClick={onRetry}><RefreshCw className="size-3" aria-hidden="true" />Refresh</button></div>}
    <SourceState snapshot={snapshot} onRetry={onRetry} />
    {noResults ? <div className="marketplace-no-results mt-5 flex min-h-64 flex-col items-center justify-center gap-2 rounded-panel bg-surface p-6 text-center" role="status"><FileText className="size-5 text-muted" aria-hidden="true" /><h2 className="m-0 text-base font-normal">No results</h2><p className="m-0 max-w-xl text-sm text-muted">Try a different search or clear your filters.</p><span className="mt-2 flex flex-wrap justify-center gap-2"><button className="h-8 rounded-control bg-instrument px-3 text-xs text-on-instrument" type="button" onClick={onClearFilters}>Clear filters</button><button className="h-8 rounded-control bg-surface-sunken px-3 text-xs text-ink" type="button" onClick={onClearQuery}>Clear query</button></span></div>
      : route.kind === "discover" ? <MarketplaceDiscover snapshot={snapshot} originKey={originKey} onOpenCategory={onOpenCategory} onOpenLibrary={onOpenLibrary} onOpenItem={onOpenItem} onOpenCollection={onOpenCollection} onUse={onUse} />
        : route.kind === "results" ? <MarketplaceResults items={snapshot.items} query={snapshot.query} originKey={originKey} onOpenItem={onOpenItem} onUse={onUse} />
          : route.kind === "category" ? <MarketplaceCategoryView category={route.category} snapshot={snapshot} originKey={originKey} onOpenItem={onOpenItem} onOpenUnavailableDetail={onOpenUnavailableDetail} onUse={onUse} />
            : route.kind === "collection" ? <MarketplaceUnavailableCollectionRoute />
              : <section className="marketplace-route-placeholder mt-5 flex min-h-64 flex-col items-center justify-center gap-2 rounded-panel bg-surface p-6 text-center" role="status"><Package className="size-5 text-muted" aria-hidden="true" /><h2 className="m-0 text-base font-normal">This library section is not available yet.</h2><p className="m-0 max-w-xl text-sm text-muted">This section is not available in this build.</p></section>}
  </>;
}
