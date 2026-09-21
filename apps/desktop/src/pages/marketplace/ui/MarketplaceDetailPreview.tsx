import { Image as ImageIcon } from "@/shared/ui/icons";
import type { MarketplaceItemPresentation } from "../lib/presentation";
import type { EffectSettings } from "../lib/effect-settings";
import { EXPLORE_COPY } from "../lib/explore-detail-chrome";
import { marketplacePreview } from "./MarketplaceItemPreview";
import { MarketplaceEffectPreview } from "./MarketplaceEffectPreview";
import { MarketplaceAudioCompare } from "./MarketplaceAudioCompare";
import { MarketplaceVisualPreview } from "./MarketplaceVisualPreview";
import type { VisualSettings } from "../lib/studio-visual-scenes";

export function MarketplaceDetailPreview({ item, settings, visualSettings, onSettingsChange, showControls = true }: {
  item: MarketplaceItemPresentation;
  settings?: EffectSettings;
  visualSettings?: VisualSettings;
  showControls?: boolean;
  onSettingsChange?(settings: EffectSettings): void;
}) {
  const media = marketplacePreview(item);
  if (!media) return <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-field bg-surface-sunken px-4 text-muted">
    <ImageIcon className="size-6" aria-hidden="true" />
    <p className={EXPLORE_COPY}>{item.category === "sounds" ? "Audio not provided" : "No preview yet"}</p>
  </div>;
  return <section className="marketplace-public-preview min-w-0" aria-label={`Preview of ${item.name}`}>
    {item.studio?.visualId || item.studio?.remocnVisual
      ? <MarketplaceVisualPreview item={item} settings={visualSettings} showControls={showControls} />
      : media.kind === "audio"
      ? <>{media.posterUrl && <div className="explore-audio-cover"><img src={media.posterUrl} alt="" /><div><h3>{item.name}</h3><p>{item.tags.slice(0, 3).join(" · ")}</p></div></div>}<MarketplaceAudioCompare key={media.url} media={media} name={item.name} /></>
      : <MarketplaceEffectPreview key={media.url} media={media} name={item.name} effectId={item.studio?.effectId} settings={settings} onSettingsChange={onSettingsChange} showControls={showControls} />}
  </section>;
}
