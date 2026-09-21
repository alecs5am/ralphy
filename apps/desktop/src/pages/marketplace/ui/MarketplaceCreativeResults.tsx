import { useEffect, useState } from "react";
import { Archive, ArrowRight, ArrowUpRight } from "@/shared/ui/icons";
import { WINDOW_FLUSH, WINDOW_PLATE, WINDOW_TITLEBAR } from "@/shared/ui/Window";
import type { MarketplaceCategory } from "../model/navigation";
import type { MarketplaceItemPresentation } from "../lib/presentation";
import { categoryIcons, categoryLabels, creativeCategories } from "./browse-discover";
import { marketplaceItemDomId } from "./MarketplaceBrowse";
import { MarketplaceItemPreview, marketplacePreview } from "./MarketplaceItemPreview";
import { MarketplaceEffectPreview } from "./MarketplaceEffectPreview";
import { MarketplaceSounds } from "./MarketplaceSounds";
import { MarketplaceAudioCompare } from "./MarketplaceAudioCompare";

interface CreativeResultsProps {
  items: MarketplaceItemPresentation[];
  category?: MarketplaceCategory;
  originKey?: string | null;
  onOpenItem(key: string): void;
  onOpenCategory?(category: MarketplaceCategory): void;
  onUse?(item: MarketplaceItemPresentation): void;
}

export function CreativeCard({ item, onOpenItem, onUnavailable }: {
  item: MarketplaceItemPresentation;
  onOpenItem(key: string): void;
  onUnavailable(): void;
}) {
  const [active, setActive] = useState(false);
  const Icon = categoryIcons[item.category];
  return <button className={`marketplace-creative-card marketplace-creative-card-flush group w-full text-left text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${WINDOW_FLUSH}`}
    aria-label={`${item.name} · ${categoryLabels[item.category]}`}
    id={marketplaceItemDomId(item.key)} data-marketplace-item-key={item.key} type="button"
    onClick={() => onOpenItem(item.key)} onMouseEnter={() => setActive(true)} onMouseLeave={() => setActive(false)} onFocus={() => setActive(true)} onBlur={() => setActive(false)}>
    <span className={`marketplace-creative-media relative block aspect-content w-full ${WINDOW_PLATE}`}>
      <MarketplaceItemPreview item={item} active={active} onUnavailable={onUnavailable} />
      {item.category === "templates" && item.studio && <span className="marketplace-template-overlay">
        <span className="marketplace-template-format type-meta">{item.studio.format} · {item.studio.duration}</span>
        <span className="marketplace-template-cover-title">{item.name}</span>
        <span className="type-xs">{item.studio.steps?.length} steps · Make it yours <ArrowUpRight className="size-3.5" aria-hidden="true" /></span>
      </span>}
      {item.summary && <span className="marketplace-creative-caption absolute inset-x-0 bottom-0 bg-instrument/90 p-3 type-xs leading-copy text-on-instrument opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><span className="line-clamp-3">{item.summary}</span></span>}
    </span>
    <span className={`w-full ${WINDOW_TITLEBAR}`}>
      <strong className="min-w-0 flex-1 truncate type-sm font-medium">{item.name}</strong>
      <Icon className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
      <span className="sr-only">{categoryLabels[item.category]}</span>
    </span>
    <span className="marketplace-card-summary line-clamp-2 px-3 pb-2 type-xs leading-copy text-muted">{item.summary}</span>
  </button>;
}

export function EffectCard({ item, onOpenItem, onUnavailable }: {
  item: MarketplaceItemPresentation;
  onOpenItem(key: string): void;
  onUnavailable(): void;
}) {
  const media = marketplacePreview(item);
  if (!media) return null;
  return <article className={`marketplace-effect-card marketplace-creative-card-flush text-ink ${WINDOW_FLUSH}`}>
    <div className={`marketplace-creative-media ${WINDOW_PLATE}`}>
      {media.kind === "audio" ? <MarketplaceAudioCompare media={media} name={item.name} compact onUnavailable={onUnavailable} /> : <MarketplaceEffectPreview media={media} name={item.name} effectId={item.studio?.effectId} compact onUnavailable={onUnavailable} />}
    </div>
    <button className={`marketplace-effect-title rounded-frame bg-transparent text-left text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink ${WINDOW_TITLEBAR}`} type="button" id={marketplaceItemDomId(item.key)} data-marketplace-item-key={item.key} onClick={() => onOpenItem(item.key)}><strong className="min-w-0 flex-1 truncate type-sm font-medium">{item.name}</strong><ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" /><span className="sr-only">Effects</span></button>
    <p className="marketplace-card-summary m-0 line-clamp-2 px-3 pb-2 type-xs leading-copy text-muted">{item.summary}</p>
  </article>;
}

function ArchivedItems({ items, onOpenItem }: Pick<CreativeResultsProps, "items" | "onOpenItem">) {
  return <ul className="marketplace-archived-list m-0 flex list-none flex-col gap-1 p-0" aria-label="Archived resources">
    {items.map((item) => <li key={item.key}><button type="button"
      id={marketplaceItemDomId(item.key)} data-marketplace-item-key={item.key}
      className="flex w-full min-w-0 items-center gap-3 rounded-cell px-2 py-2 text-left text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
      onClick={() => onOpenItem(item.key)}>
      <Archive className="size-4 shrink-0 text-muted" aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5"><strong className="truncate type-sm font-medium">{item.name}</strong><span className="truncate type-xs text-muted">Preview unavailable · {item.tags.slice(0, 3).join(" · ") || categoryLabels[item.category]}</span></span>
      <ArrowUpRight className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
    </button></li>)}
  </ul>;
}

/** The archive is reversible: catalog records stay intact and new previews restore them. */
export function MarketplaceCreativeResults({ items, category, originKey, onOpenItem, onOpenCategory, onUse }: CreativeResultsProps) {
  const [showArchived, setShowArchived] = useState(false);
  const [failed, setFailed] = useState<Record<string, string>>({});
  const available = (item: MarketplaceItemPresentation) => {
    if (item.category === "skills" || item.category === "models") return true;
    const media = marketplacePreview(item);
    return Boolean(media && failed[item.key] !== media.url);
  };
  const markFailed = (item: MarketplaceItemPresentation) => {
    const url = marketplacePreview(item)?.url;
    if (url) setFailed((current) => current[item.key] === url ? current : { ...current, [item.key]: url });
  };
  const archivedCount = items.filter((item) => !available(item)).length;
  const originArchived = items.some((item) => item.key === originKey && !available(item));
  useEffect(() => { if (originArchived) setShowArchived(true); }, [originKey, originArchived]);
  const categories = category ? [category] : [...creativeCategories, "models", "skills"] as MarketplaceCategory[];
  const activeCount = items.length - archivedCount;
  return <section className="marketplace-creative-results flex min-w-0 flex-col gap-3" data-category={category} aria-label="Creative resources">
    <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 py-1 type-xs text-muted">
      <span>{activeCount} {activeCount === 1 ? "preview" : "previews"}{archivedCount > 0 ? ` · ${archivedCount} archived` : ""}</span>
      <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.currentTarget.checked)} />Show archived</label>
    </div>
    {activeCount === 0 && !showArchived && <p className="m-0 py-8 text-center type-sm text-muted" role="status">{archivedCount ? "These resources are archived until their previews are ready. Enable Show archived to review them." : "No resources match this view."}</p>}
    {categories.map((currentCategory) => {
      const matching = items.filter((item) => item.category === currentCategory);
      const ready = matching.filter(available);
      const archived = showArchived ? matching.filter((item) => !available(item)) : [];
      const displayed = onOpenCategory ? ready.slice(0, 4) : ready;
      if (!displayed.length && !archived.length) return null;
      const sounds = displayed.filter((item) => marketplacePreview(item)?.kind === "audio");
      const visuals = displayed.filter((item) => marketplacePreview(item)?.kind !== "audio");
      return <section className={`marketplace-category-page marketplace-category-${currentCategory} flex min-w-0 flex-col gap-2 pb-3`} key={currentCategory} aria-label={categoryLabels[currentCategory]}>
        {!category && <div className="flex items-center justify-between gap-3"><h2 className="m-0 type-sm font-medium">{categoryLabels[currentCategory]}</h2>{onOpenCategory && <button className="flex h-7 items-center gap-1.5 rounded-control px-2 type-xs text-muted hover:bg-surface-hover hover:text-ink" type="button" onClick={() => onOpenCategory(currentCategory)}>Browse {categoryLabels[currentCategory].toLocaleLowerCase()}<ArrowRight className="size-3" aria-hidden="true" /></button>}</div>}
        {(visuals.length > 0 || currentCategory === "recipes" && sounds.length > 0) && <ol className="marketplace-gallery-grid m-0 grid list-none gap-x-2 gap-y-4 p-0" role="list">
          {(currentCategory === "recipes" ? displayed : visuals).map((item) => <li className="min-w-0" key={item.key}>
            {currentCategory === "recipes" ? <EffectCard item={item} onOpenItem={onOpenItem} onUnavailable={() => markFailed(item)} /> : <CreativeCard item={item} onOpenItem={onOpenItem} onUnavailable={() => markFailed(item)} />}
          </li>)}
        </ol>}
        {currentCategory !== "recipes" && (sounds.length > 0 || currentCategory === "sounds" && archived.length > 0) && <MarketplaceSounds items={currentCategory === "sounds" ? [...sounds, ...archived] : sounds} archivedKeys={archived.map((item) => item.key)} onOpenItem={onOpenItem} onUse={onUse} onUnavailable={markFailed} />}
        {currentCategory !== "sounds" && archived.length > 0 && <ArchivedItems items={archived} onOpenItem={onOpenItem} />}
      </section>;
    })}
  </section>;
}
