import {
  Blocks,
  Bot,
  CircleAlert,
  Code2,
  Cpu,
  FileText,
  FolderHeart,
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
import { marketplacePublicMediaKind } from "./presentation";
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
  "ralphy-bundled": "Bundled catalog",
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
  return <li className="min-w-0">
    <button className="marketplace-category-card grid min-h-24 w-full grid-cols-(--marketplace-card-columns) content-between gap-x-3 gap-y-2 rounded-cell bg-surface p-4 text-left text-ink hover:bg-surface-hover" type="button" onClick={() => onOpen(value.category)}>
      <span className="flex min-w-0 items-center gap-2"><Icon className="size-4 shrink-0" aria-hidden="true" /><strong className="truncate text-sm font-normal">{value.label}</strong></span>
      <small className={`font-mono type-meta text-muted ${value.count.status === "unavailable" ? "max-w-36 text-right leading-tight" : ""}`}>{countLabel(value.count)}</small>
      <p className="col-span-full m-0 line-clamp-2 text-xs leading-snug text-muted">{value.purpose}</p>
    </button>
  </li>;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

export function MarketplaceDiscover({ snapshot, onOpenCategory, onOpenLibrary, onOpenCollection }: {
  snapshot: Extract<MarketplaceSnapshot, { status: "ready" }>;
  onOpenCategory(category: MarketplaceCategory): void;
  onOpenLibrary(section: MarketplaceLibrarySection): void;
  onOpenCollection?(): void;
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
  return <div className="marketplace-discover flex flex-col gap-6 pt-5">
    <section aria-labelledby="marketplace-categories-heading">
      <div className="marketplace-section-heading mb-2 grid gap-0.5 px-1"><span className="font-mono type-mono-xs uppercase tracking-mono text-muted">Browse</span><h2 className="m-0 text-base font-normal" id="marketplace-categories-heading">Categories</h2></div>
      <ul className="marketplace-category-grid grid list-none grid-cols-3 gap-2 p-0 @max-marketplace-grid/main-region:grid-cols-2 @max-marketplace-column/main-region:grid-cols-1" role="list">{snapshot.categories.map((category) => <CategoryCard value={category} onOpen={onOpenCategory} key={category.category} />)}</ul>
    </section>
    {!hasAnyCount && <div className="marketplace-empty-note flex min-h-20 items-center gap-3 rounded-cell bg-surface p-4" role="status"><Package className="size-5 shrink-0 text-muted" aria-hidden="true" /><span className="flex flex-col gap-0.5"><strong className="text-sm font-normal">No items have been returned by the current sources yet.</strong><small className="text-xs text-muted">Categories remain visible with their current source state.</small></span></div>}
    <section aria-labelledby="marketplace-community-heading">
      <div className="marketplace-section-heading mb-2 grid gap-0.5 px-1"><span className="font-mono type-mono-xs uppercase tracking-mono text-muted">Read-only route</span><h2 className="m-0 text-base font-normal" id="marketplace-community-heading">Community</h2></div>
      <button className="flex min-h-20 w-full items-center gap-3 rounded-cell bg-surface p-4 text-left text-ink hover:bg-surface-hover" type="button" aria-disabled={onOpenCollection ? undefined : true} aria-describedby="marketplace-community-contract-note" onClick={onOpenCollection}><FolderHeart className="size-4 shrink-0" aria-hidden="true" /><span className="flex min-w-0 flex-1 flex-col gap-0.5"><strong className="truncate text-sm font-normal">Community contributions</strong><small className="text-xs text-muted" id="marketplace-community-contract-note">Read-only unavailable-contract review</small></span><small className="font-mono type-meta text-muted">Read-only</small></button>
    </section>
    {installed.length > 0 && <section aria-labelledby="marketplace-continue-heading">
      <div className="marketplace-section-heading mb-2 grid gap-0.5 px-1"><span className="font-mono type-mono-xs uppercase tracking-mono text-muted">Local state</span><h2 className="m-0 text-base font-normal" id="marketplace-continue-heading">Continue where you left off</h2></div>
      <ul className="marketplace-installed-list grid list-none grid-cols-3 gap-2 p-0 @max-marketplace-grid/main-region:grid-cols-2 @max-marketplace-column/main-region:grid-cols-1" role="list">{installed.map((item) => <li className="min-w-0" key={`${item.runtime}:${item.id}`}><button className="flex min-h-16 w-full items-center gap-3 rounded-cell bg-surface px-4 py-3 text-left hover:bg-surface-hover" type="button" onClick={() => onOpenLibrary("installed")}><Cpu className="size-4 shrink-0" aria-hidden="true" /><span className="flex min-w-0 flex-col gap-0.5"><strong className="truncate text-sm font-normal">{item.name}</strong><small className="truncate font-mono type-meta text-muted">Registered in Ollama · {item.format}</small></span></button></li>)}</ul>
    </section>}
    {updated.length > 0 && <section aria-labelledby="marketplace-updated-heading">
      <div className="marketplace-section-heading mb-2 grid gap-0.5 px-1"><span className="font-mono type-mono-xs uppercase tracking-mono text-muted">Source timestamps</span><h2 className="m-0 text-base font-normal" id="marketplace-updated-heading">Recently updated</h2></div>
      <ul className="marketplace-updated-list grid gap-1 p-0" role="list">{updated.map((item) => <li className="flex min-h-12 min-w-0 items-center gap-4 rounded-cell bg-surface px-4 py-2" key={item.key}><span className="flex min-w-0 flex-1 flex-col gap-0.5"><strong className="truncate text-sm font-normal">{item.name}</strong><small className="truncate font-mono type-meta text-muted">{categoryLabels[item.category]} · {item.sourceLabel}</small></span><time className="shrink-0 font-mono type-meta text-muted" dateTime={item.updatedAt.status === "ready" ? item.updatedAt.value : undefined}>{item.updatedAt.status === "ready" ? formatDate(item.updatedAt.value) : ""}</time></li>)}</ul>
    </section>}
  </div>;
}

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

function SourceState({ snapshot, onRetry }: { snapshot: Extract<MarketplaceSnapshot, { status: "ready" | "error" }>; onRetry(): void }) {
  if (snapshot.sourceErrors.length === 0) return null;
  const partial = snapshot.status === "ready";
  return <div className={`marketplace-source-state${partial ? " is-partial" : " is-total"} mt-2 flex min-h-14 items-center gap-3 rounded-panel bg-instrument px-4 py-3 text-on-instrument @max-marketplace-column/main-region:flex-wrap`} role={partial ? "status" : "alert"}>
    <CircleAlert className="size-4 shrink-0 text-alert" aria-hidden="true" />
    <span className="flex min-w-0 flex-1 flex-col gap-1">{snapshot.sourceErrors.map((issue) => <span className="flex min-w-0 flex-col" key={`${issue.source}:${issue.scope}`}><strong className="text-sm font-normal">{sourceLabels[issue.source]} is unavailable</strong><small className="text-xs text-on-instrument-muted">{issue.message}</small></span>)}{partial && <em className="text-xs not-italic text-on-instrument-muted">Results from healthy sources are still shown.</em>}</span>
    <button className="flex h-8 shrink-0 items-center gap-1.5 rounded-control bg-instrument-raised px-3 text-xs text-on-instrument @max-marketplace-column/main-region:ml-7 hover:bg-ghost-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-on-instrument" type="button" onClick={onRetry}><RefreshCw className="size-3" aria-hidden="true" />Retry sources</button>
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
  onOpenCollection?(): void;
  onOpenUnavailableDetail?(category: "prompts" | "components" | "skills"): void;
  onRetry(): void;
  onClearQuery(): void;
  onClearFilters(): void;
}

export function MarketplaceBrowse({ route, snapshot, originKey, onOpenItem, onOpenCategory, onOpenLibrary, onOpenCollection, onOpenUnavailableDetail, onRetry, onClearQuery, onClearFilters }: MarketplaceBrowseProps) {
  if (snapshot.status === "loading") return <div className="marketplace-loading flex min-h-72 flex-col items-center justify-center gap-4 text-muted" role="status" aria-busy="true"><div className="grid w-full grid-cols-3 gap-2 @max-marketplace-grid/main-region:grid-cols-2 @max-marketplace-column/main-region:grid-cols-1" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <i className="h-24 animate-pulse rounded-panel bg-surface motion-reduce:animate-none" key={index} />)}</div><span className="text-xs">Loading Marketplace…</span></div>;
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
    {noResults ? <div className="marketplace-no-results mt-5 flex min-h-64 flex-col items-center justify-center gap-2 rounded-panel bg-surface p-6 text-center" role="status"><FileText className="size-5 text-muted" aria-hidden="true" /><h2 className="m-0 text-base font-normal">No results</h2><p className="m-0 max-w-xl text-sm text-muted">The current query and filters returned no source-backed items.</p><span className="mt-2 flex flex-wrap justify-center gap-2"><button className="h-8 rounded-control bg-instrument px-3 text-xs text-on-instrument" type="button" onClick={onClearFilters}>Clear filters</button><button className="h-8 rounded-control bg-surface-sunken px-3 text-xs text-ink" type="button" onClick={onClearQuery}>Clear query</button></span></div>
      : route.kind === "discover" ? <MarketplaceDiscover snapshot={snapshot} onOpenCategory={onOpenCategory} onOpenLibrary={onOpenLibrary} onOpenCollection={onOpenCollection} />
        : route.kind === "results" ? <MarketplaceResults items={snapshot.items} query={snapshot.query} originKey={originKey} onOpenItem={onOpenItem} />
          : route.kind === "category" ? <MarketplaceCategoryView category={route.category} snapshot={snapshot} originKey={originKey} onOpenItem={onOpenItem} onOpenUnavailableDetail={onOpenUnavailableDetail} />
            : route.kind === "collection" ? <MarketplaceUnavailableCollectionRoute />
              : <section className="marketplace-route-placeholder mt-5 flex min-h-64 flex-col items-center justify-center gap-2 rounded-panel bg-surface p-6 text-center" role="status"><Package className="size-5 text-muted" aria-hidden="true" /><h2 className="m-0 text-base font-normal">This Marketplace route is not available yet.</h2><p className="m-0 max-w-xl text-sm text-muted">The current Desktop contract does not expose data or a mutation for this route.</p></section>}
  </>;
}
