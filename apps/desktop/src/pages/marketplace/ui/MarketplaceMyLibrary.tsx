import { FolderInput, TriangleAlert } from "@/shared/ui/icons";
import type { LocalModelMachine } from "../../../../electron/media/types";
import type { MarketplaceLibrarySection } from "../model/navigation";
import { LIBRARY_COPY, LIBRARY_MONO, LIBRARY_PLATE, LIBRARY_ROUTE, LIBRARY_TITLE, LIBRARY_UNAVAILABLE } from "../lib/detail-chrome";
import type { MarketplacePackItemPresentation } from "../lib/presentation";
import { MarketplaceInstalledModels } from "./MarketplaceModelViews";
import { MarketplaceDownloads, MarketplaceUpdateConflictReview } from "./MarketplaceWorkflows";
import { categoryIdentity, MarketplaceCategoryArtwork } from "./MarketplaceCategoryIdentity";

/* Every paragraph in this plate is a glyph beside a reason, so the row is the paragraph. */
const REASON_ROW = "m-0 flex items-center gap-2 type-sm leading-copy text-muted";
const REASON_GLYPH = "w-3.5 flex-none";

function UnavailableLibrarySection({ title, reason, children }: { title: string; reason: string; children?: React.ReactNode }) {
  return <section className={`marketplace-library-unavailable ${LIBRARY_UNAVAILABLE}`} role="status">
    <TriangleAlert className="w-5 text-alert" aria-hidden="true" /><h2 className={LIBRARY_TITLE}>{title}</h2><p className={REASON_ROW}>{reason}</p>{children}<small className={LIBRARY_MONO}>No zero count is inferred.</small>
  </section>;
}

const CATEGORY_LABEL: Record<MarketplacePackItemPresentation["category"], string> = {
  skills: "Skill",
  prompts: "Prompt",
  templates: "Template",
  recipes: "Recipe",
  components: "Component",
};

/* Legacy enabled and disabled selections are both retained as saved references. */
function MarketplaceInstalledPackItems({ items, workspaceName, onOpenItem }: {
  items: MarketplacePackItemPresentation[];
  workspaceName: string | null;
  onOpenItem(key: string): void;
}) {
  return <section className={`marketplace-installed-pack ${LIBRARY_ROUTE}`} aria-labelledby="marketplace-installed-pack-title">
    <span><small>My Library · Bundled documents</small><h2 className={LIBRARY_TITLE} id="marketplace-installed-pack-title">Saved for this workspace</h2></span>
    <p className={LIBRARY_COPY}>{workspaceName === null
      ? "Create a workspace to save bundled documents for later."
      : `Bookmarks for “${workspaceName}” on this Mac. Saving a document does not change agent capabilities.`}</p>
    {items.length === 0
      ? <div className={LIBRARY_PLATE} role="status">No saved documents yet. Browse a category and choose Save to workspace.</div>
      : <ul className="m-0 flex list-none flex-col gap-2 p-0" role="list">{items.map((item) => <li key={item.key}>
        <button
          className="flex min-h-16 w-full min-w-0 items-center justify-between gap-4 rounded-cell bg-surface px-3.5 py-3 text-left text-ink hover:bg-surface-hover"
          type="button"
          onClick={() => onOpenItem(item.key)}
        >
          <span className={`w-22 shrink-0 overflow-hidden rounded-control ${categoryIdentity[item.category].tone}`}><MarketplaceCategoryArtwork category={item.category} className="h-12 w-full" /></span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.75">
            <strong className="truncate font-normal">{item.name}</strong>
            <small className={LIBRARY_MONO}>{CATEGORY_LABEL[item.category]} · {item.pack.slug}</small>
          </span>
          <span className={`${LIBRARY_MONO} shrink-0`}>Saved</span>
        </button>
      </li>)}</ul>}
  </section>;
}

export function MarketplaceMyLibrary({ section, machine, installedItems, workspaceName, onOpenItem }: {
  section: MarketplaceLibrarySection;
  machine: LocalModelMachine | null;
  installedItems: MarketplacePackItemPresentation[];
  workspaceName: string | null;
  onOpenItem(key: string): void;
}) {
  if (section === "installed") return <MarketplaceInstalledModels machine={machine} />;
  if (section === "saved") return <MarketplaceInstalledPackItems items={installedItems} workspaceName={workspaceName} onOpenItem={onOpenItem} />;
  if (section === "downloads") return <MarketplaceDownloads presentation={{ availability: "unavailable", reason: "Downloads are unavailable because there is no persistent background-download contract" }} />;
  if (section === "updates") return <MarketplaceUpdateConflictReview />;
  if (section === "added") return <UnavailableLibrarySection title="Added to workspaces and projects" reason="Added items are unavailable because there is no persistent workspace/project addition-state contract">
    <p className={REASON_ROW}><FolderInput className={REASON_GLYPH} aria-hidden="true" />Adding is unavailable without a Core mutation contract.</p>
  </UnavailableLibrarySection>;
  return <UnavailableLibrarySection title="Needs attention" reason="Needs attention is unavailable because there is no persistent attention-state contract" />;
}
