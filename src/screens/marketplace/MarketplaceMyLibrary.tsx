import { Bookmark, FolderInput, TriangleAlert } from "lucide-react";
import type { LocalModelMachine } from "../../../electron/media/types";
import type { MarketplaceLibrarySection } from "../../state/marketplace-navigation";
import { LIBRARY_MONO, LIBRARY_TITLE, LIBRARY_UNAVAILABLE } from "./detail-chrome";
import { MarketplaceInstalledModels } from "./MarketplaceModelViews";
import { MarketplaceDownloads, MarketplaceUpdateConflictReview } from "./MarketplaceWorkflows";

/* Every paragraph in this plate is a glyph beside a reason, so the row is the paragraph. */
const REASON_ROW = "m-0 flex items-center gap-2 type-sm leading-copy text-muted";
const REASON_GLYPH = "w-3.5 flex-none";

function UnavailableLibrarySection({ title, reason, children }: { title: string; reason: string; children?: React.ReactNode }) {
  return <section className={`marketplace-library-unavailable ${LIBRARY_UNAVAILABLE}`} role="status">
    <TriangleAlert className="w-5 text-alert" aria-hidden="true" /><h2 className={LIBRARY_TITLE}>{title}</h2><p className={REASON_ROW}>{reason}</p>{children}<small className={LIBRARY_MONO}>No zero count is inferred.</small>
  </section>;
}

export function MarketplaceMyLibrary({ section, machine }: { section: MarketplaceLibrarySection; machine: LocalModelMachine | null }) {
  if (section === "installed") return <MarketplaceInstalledModels machine={machine} />;
  if (section === "downloads") return <MarketplaceDownloads presentation={{ availability: "unavailable", reason: "Downloads are unavailable because there is no persistent background-download contract" }} />;
  if (section === "updates") return <MarketplaceUpdateConflictReview />;
  if (section === "saved") return <UnavailableLibrarySection title="Saved" reason="Saved items are unavailable because there is no persistent saved-state contract">
    <p className={REASON_ROW}><Bookmark className={REASON_GLYPH} aria-hidden="true" />Local forks are unavailable because there is no persistent fork-state contract.</p>
  </UnavailableLibrarySection>;
  if (section === "added") return <UnavailableLibrarySection title="Added to workspaces and projects" reason="Added items are unavailable because there is no persistent workspace/project addition-state contract">
    <p className={REASON_ROW}><FolderInput className={REASON_GLYPH} aria-hidden="true" />Adding is unavailable without a Core mutation contract.</p>
  </UnavailableLibrarySection>;
  return <UnavailableLibrarySection title="Needs attention" reason="Needs attention is unavailable because there is no persistent attention-state contract" />;
}
