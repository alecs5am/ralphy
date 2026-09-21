import { Blocks, Bot, Cpu, LayoutTemplate, MessageSquareText, Music2, Sparkles, type AppIcon } from "@/shared/ui/icons";
import type { MarketplaceCategory, MarketplaceLibrarySection } from "../model/navigation";
import type { Availability, MarketplaceSnapshot, MarketplaceSourceIssue, MarketplaceItemPresentation } from "../lib/presentation";
import { MarketplaceCreativeResults } from "./MarketplaceCreativeResults";

export const creativeCategories = ["templates", "components", "recipes", "sounds", "prompts"] as const;
export const categoryIcons: Record<MarketplaceCategory, AppIcon> = {
  models: Cpu, templates: LayoutTemplate, recipes: Sparkles, prompts: MessageSquareText,
  components: Blocks, skills: Bot, sounds: Music2,
};
export const categoryLabels: Record<MarketplaceCategory, string> = {
  models: "Models", templates: "Templates", recipes: "Effects", prompts: "Prompts",
  components: "Visuals", skills: "Skills", sounds: "Sounds",
};
export const sourceLabels: Record<MarketplaceSourceIssue["source"], string> = {
  "ralphy-public": "Ralphy public library", "ralphy-bundled": "Bundled catalog",
  huggingface: "Hugging Face", civitai: "Civitai", modelscope: "ModelScope", models: "Model catalog",
};
export function countLabel(count: Availability<number>): string {
  return count.status === "ready" ? `${count.value} ${count.value === 1 ? "item" : "items"}` : count.reason;
}
export function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

export function MarketplaceDiscover({ snapshot, onOpenItem, onUse, originKey }: {
  snapshot: Extract<MarketplaceSnapshot, { status: "ready" }>;
  onOpenCategory(category: MarketplaceCategory): void;
  onOpenLibrary(section: MarketplaceLibrarySection): void;
  onOpenItem(key: string): void;
  onOpenCollection?(): void;
  onUse?(item: MarketplaceItemPresentation): void;
  originKey?: string | null;
}) {
  const items = snapshot.items.filter(({ category }) => category === "templates");
  return <div className="marketplace-discover">
    {items.length ? <MarketplaceCreativeResults items={items} category="templates" originKey={originKey} onOpenItem={onOpenItem} onUse={onUse} />
      : <p className="py-12 text-center type-sm text-muted" role="status">No templates match this view.</p>}
  </div>;
}
