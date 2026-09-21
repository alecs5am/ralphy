import { ArrowUpRight, FileText } from "@/shared/ui/icons";
import { Window, WindowBody, WindowTitlebar } from "@/shared/ui/Window";
import type { MarketplaceItemPresentation } from "../lib/presentation";
import { templateModules } from "../lib/template-modules";
import { marketplacePreview } from "./MarketplaceItemPreview";

export function MarketplaceTemplateModules({ item, items, selectedStep, onOpenItem }: {
  item: MarketplaceItemPresentation;
  items?: MarketplaceItemPresentation[];
  selectedStep: number;
  onOpenItem?(key: string): void;
}) {
  const modules = templateModules(item, items);
  if (!modules.length) return null;
  return <Window className="explore-template-modules" role="region" aria-label="Included modules">
    <WindowTitlebar><h3 className="m-0 flex-1 type-sm font-medium">Included modules</h3><span className="type-xs text-muted">{modules.length}</span></WindowTitlebar>
    <WindowBody><ul className="m-0 list-none p-0">
      {modules.map((module) => {
        const media = module.item && marketplacePreview(module.item);
        const thumbnail = media?.kind === "image" ? media.url : media?.posterUrl;
        const active = module.step === selectedStep;
        const name = module.item?.name ?? "Module unavailable";
        return <li key={`${module.key}:${module.step}`} className="explore-template-module" data-active={active} data-module-key={module.key}>
          <button type="button" className="explore-template-module-open focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink" disabled={!module.item || !onOpenItem} aria-label={`Open ${name}`} onClick={() => module.item && onOpenItem?.(module.item.key)}>
            <span className="explore-template-module-thumbnail" aria-hidden="true">{thumbnail
              ? <img src={thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
              : <FileText className="size-5 text-muted" />}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
              <span className="type-meta text-muted">Step {module.step + 1} · {module.role}{active ? " · Current step" : ""}</span>
              <strong className="line-clamp-2 type-sm font-medium">{name}</strong>
            </span>
            {module.item && onOpenItem && <ArrowUpRight className="size-3.5 shrink-0 text-muted" aria-hidden="true" />}
          </button>
        </li>;
      })}
    </ul></WindowBody>
  </Window>;
}
