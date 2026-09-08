import { Blocks, Bot, Code2, Cpu, LayoutTemplate, MessageSquareText } from "@/shared/ui/icons";
import type { MarketplaceCategory } from "../model/navigation";

export const categoryIdentity = {
  models: { icon: Cpu, label: "Models", title: "Find your creative engine.", description: "Explore models by medium, runtime and what fits this Mac.", note: "Weights · Runtimes · Local inference", mark: "01", tone: "bg-instrument text-on-instrument" },
  templates: { icon: LayoutTemplate, label: "Templates", title: "Start with a direction.", description: "A considered starting point for your next production.", note: "Structure · References · Starting points", mark: "02", tone: "bg-surface-sunken text-ink" },
  recipes: { icon: Code2, label: "Recipes", title: "Make the process repeatable.", description: "Practical treatments and reproducible steps for your media.", note: "Inputs · Steps · Artifacts", mark: "03", tone: "bg-instrument text-on-instrument" },
  prompts: { icon: MessageSquareText, label: "Prompts", title: "Put the right words to work.", description: "Reusable instructions to give a conversation clear direction.", note: "Instructions · Variables · Examples", mark: "04", tone: "bg-surface-sunken text-ink" },
  components: { icon: Blocks, label: "Components & Effects", title: "Build a visual language.", description: "Compose with reusable pieces, motion and finishing touches.", note: "Elements · Motion · Effects", mark: "05", tone: "bg-surface-sunken text-ink" },
  skills: { icon: Bot, label: "Skills", title: "Give your agent a new ability.", description: "Focused knowledge and workflows for the way you create.", note: "Knowledge · Tools · Workflows", mark: "06", tone: "bg-instrument text-on-instrument" },
} as const;

/* Six editorial marks, not fabricated media previews. They remain recognizable at row size. */
export function MarketplaceCategoryArtwork({ category, className = "" }: { category: MarketplaceCategory; className?: string }) {
  return <svg className={`marketplace-category-artwork ${className}`} viewBox="0 0 240 120" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false">
    {category === "models" && <>
      <circle cx="120" cy="60" r="37" /><ellipse cx="120" cy="60" rx="60" ry="22" transform="rotate(-30 120 60)" /><ellipse cx="120" cy="60" rx="60" ry="22" transform="rotate(30 120 60)" /><circle cx="120" cy="60" r="8" fill="currentColor" /><circle cx="171" cy="32" r="4" fill="currentColor" />
    </>}
    {category === "templates" && <>
      <rect x="66" y="16" width="75" height="88" rx="5" transform="rotate(-9 66 16)" opacity=".35" /><rect x="99" y="13" width="75" height="94" rx="5" /><rect x="107" y="21" width="59" height="52" rx="2" fill="currentColor" opacity=".12" /><path d="m109 66 17-22 13 14 12-9 13 17M108 82h43m-43 8h29" /><circle cx="152" cy="34" r="5" fill="currentColor" />
    </>}
    {category === "recipes" && <>
      <path d="M53 60h28m35 0h27m35 0h22M75 55l6 5-6 5m62-10 6 5-6 5" /><rect x="26" y="45" width="30" height="30" rx="5" /><rect x="83" y="35" width="34" height="50" rx="5" /><rect x="145" y="24" width="34" height="72" rx="5" /><path d="m91 53 8 7-8 7m16-14-8 7 8 7m45-21h20m-20 14h20m-20 14h13" /><circle cx="205" cy="60" r="6" fill="currentColor" />
    </>}
    {category === "prompts" && <>
      <path d="M55 25h130v 62h-63l-19 17V87H55z" /><path d="M72 42h75m-75 12h92m-92 12h47" strokeWidth="3" /><path d="m138 64-4 5 4 5m18-10 4 5-4 5m-9-13-3 17" />
    </>}
    {category === "components" && <>
      <rect x="57" y="24" width="42" height="42" rx="9" /><circle cx="136" cy="45" r="21" fill="currentColor" opacity=".16" /><path d="m167 63 23-40 23 40z" /><path d="m60 86 13-13 13 13-13 13z" fill="currentColor" /><rect x="109" y="75" width="79" height="21" rx="10.5" /><path d="M120 86h26m20 0h10" />
    </>}
    {category === "skills" && <>
      <path d="M120 28V17m-32 40H70m100 0h-18M99 88v 13m42-13v 13" /><rect x="87" y="29" width="66" height="60" rx="18" /><circle cx="107" cy="55" r="5" fill="currentColor" /><circle cx="134" cy="55" r="5" fill="currentColor" /><path d="M108 72h24m-78-40 4 7 8 1-6 5 2 8-8-4-7 4 1-8-6-5 8-1zm133 43 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
    </>}
  </svg>;
}

export function MarketplaceCategoryBanner({ category }: { category: MarketplaceCategory }) {
  const identity = categoryIdentity[category];
  const Icon = identity.icon;
  return <header className="marketplace-category-banner mt-3 flex min-w-0 items-center justify-between gap-4 rounded-window bg-panel p-3 text-ink">
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center gap-2 font-mono type-meta uppercase tracking-caps text-muted"><Icon className="size-4" aria-hidden="true" />{identity.label}</span>
      <h2 className="m-0 text-lg font-normal leading-tight">{identity.title}</h2>
      <p className="m-0 max-w-xl text-xs leading-copy text-muted">{identity.description}</p>
    </div>
    <span className={`w-24 shrink-0 overflow-hidden rounded-frame ${identity.tone} @max-marketplace-column/main-region:hidden`}><MarketplaceCategoryArtwork category={category} className="h-16 w-full" /></span>
  </header>;
}

export function MarketplaceCategorySignature({ category }: { category: MarketplaceCategory }) {
  const { icon: Icon, note } = categoryIdentity[category];
  return <span className="col-span-full mt-3 flex items-center gap-2 rounded-control bg-instrument-raised px-3 py-1 font-mono type-meta text-on-instrument-muted"><Icon className="size-4 shrink-0" aria-hidden="true" /><span>{note}</span><MarketplaceCategoryArtwork category={category} className="ml-auto h-12 w-24 shrink-0 @max-marketplace-column/main-region:hidden" /></span>;
}
