import { useState } from "react";
import type { MarketplaceItemPresentation } from "../lib/presentation";
import { studioCatalog } from "../lib/studio-catalog";
import { categoryLabels } from "./browse-discover";
import { CreativeCard, EffectCard } from "./MarketplaceCreativeResults";
import { marketplacePreview } from "./MarketplaceItemPreview";
import { MarketplaceSounds } from "./MarketplaceSounds";

/** Keep discovery attached to the working item, using only real, previewable catalog entries. */
export function MarketplaceDetailCollection({ item, items, onOpenItem, onUse, collection = "all" }: {
  item: MarketplaceItemPresentation;
  items: MarketplaceItemPresentation[];
  onOpenItem(key: string): void;
  onUse?(item: MarketplaceItemPresentation): void;
  collection?: "all" | "similar" | "complements";
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const candidates = [...new Map([...items, ...studioCatalog()].map((candidate) => [candidate.key, candidate])).values()]
    .filter((candidate) => candidate.key !== item.key && marketplacePreview(candidate) && !failed.includes(candidate.key));
  const score = (candidate: MarketplaceItemPresentation) => candidate.tags.filter((tag) => item.tags.includes(tag)).length;
  candidates.sort((a, b) => score(b) - score(a));
  const similar = candidates.filter((candidate) => candidate.category === item.category).slice(0, 6);
  const complements = candidates.filter((candidate) => candidate.category !== item.category && score(candidate) > 0).slice(0, 4);
  const unavailable = (candidate: MarketplaceItemPresentation) => setFailed((current) => [...current, candidate.key]);
  const groups = [
    { key: "similar", title: `More ${categoryLabels[item.category].toLowerCase()}`, description: "Keep exploring this collection.", entries: similar },
    { key: "complements", title: "Pair with", description: "In a similar direction.", entries: complements },
  ].filter(({ key, entries }) => entries.length && (collection === "all" || collection === key));
  return <div className="explore-detail-collections">
    {groups.map(({ title, description, entries }) => {
      const sounds = entries.filter((candidate) => candidate.category !== "recipes" && marketplacePreview(candidate)?.kind === "audio");
      const visuals = entries.filter((candidate) => candidate.category === "recipes" || marketplacePreview(candidate)?.kind !== "audio");
      return <section className="explore-detail-collection" key={title} aria-label={title}>
        <header><h3>{title}</h3><p>{description}</p></header>
        {visuals.length > 0 && <div className="explore-related-grid">{visuals.map((candidate) => candidate.category === "recipes"
          ? <EffectCard key={candidate.key} item={candidate} onOpenItem={onOpenItem} onUnavailable={() => unavailable(candidate)} />
          : <CreativeCard key={candidate.key} item={candidate} onOpenItem={onOpenItem} onUnavailable={() => unavailable(candidate)} />)}</div>}
        {sounds.length > 0 && <MarketplaceSounds items={sounds} showFilters={false} onOpenItem={onOpenItem} onUse={onUse} onUnavailable={unavailable} />}
      </section>;
    })}
  </div>;
}
