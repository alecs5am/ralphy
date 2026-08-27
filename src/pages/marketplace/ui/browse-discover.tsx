/**
 * The section's front page: six categories, each stating how many things it holds.
 *
 * A count is an `Availability`, not a number, so a category with nothing in it says whether that
 * is because there is nothing or because no source is configured -- the operator can act on only
 * one of those.
 */
import {
  Blocks,
  Bot,
  Code2,
  Cpu,
  FolderHeart,
  LayoutTemplate,
  MessageSquareText,
  Package,
} from "lucide-react";
import { type ComponentType, type SVGProps } from "react";
import type {
  MarketplaceCategory,
  MarketplaceLibrarySection,
} from "../model/navigation";
import type {
  Availability,
  MarketplaceCategoryPresentation,
  MarketplaceSnapshot,
  MarketplaceSourceIssue,
} from "../lib/presentation";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
export const categoryIcons: Record<MarketplaceCategory, Icon> = {
  models: Cpu,
  templates: LayoutTemplate,
  recipes: Code2,
  prompts: MessageSquareText,
  components: Blocks,
  skills: Bot,
};
export const categoryLabels: Record<MarketplaceCategory, string> = {
  models: "Models",
  templates: "Templates",
  recipes: "Recipes",
  prompts: "Prompts",
  components: "Components & Effects",
  skills: "Skills",
};
export const sourceLabels: Record<MarketplaceSourceIssue["source"], string> = {
  "ralphy-public": "Ralphy public library",
  "ralphy-bundled": "Bundled catalog",
  huggingface: "Hugging Face",
  civitai: "Civitai",
  modelscope: "ModelScope",
  models: "Model catalog",
};


export function countLabel(count: Availability<number>): string {
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

export function formatDate(value: string): string {
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
