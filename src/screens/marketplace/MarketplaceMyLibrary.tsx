import { Bookmark, FolderInput, TriangleAlert } from "lucide-react";
import type { LocalModelMachine } from "../../../electron/media/types";
import type { MarketplaceLibrarySection } from "../../state/marketplace-navigation";
import { MarketplaceInstalledModels } from "./MarketplaceModelViews";
import { MarketplaceDownloads, MarketplaceUpdateConflictReview } from "./MarketplaceWorkflows";

function UnavailableLibrarySection({ title, reason, children }: { title: string; reason: string; children?: React.ReactNode }) {
  return <section className="marketplace-library-unavailable" role="status">
    <TriangleAlert aria-hidden="true" /><h2>{title}</h2><p>{reason}</p>{children}<small>No zero count is inferred.</small>
  </section>;
}

export function MarketplaceMyLibrary({ section, machine }: { section: MarketplaceLibrarySection; machine: LocalModelMachine | null }) {
  if (section === "installed") return <MarketplaceInstalledModels machine={machine} />;
  if (section === "downloads") return <MarketplaceDownloads presentation={{ availability: "unavailable", reason: "Downloads are unavailable because there is no persistent background-download contract" }} />;
  if (section === "updates") return <MarketplaceUpdateConflictReview />;
  if (section === "saved") return <UnavailableLibrarySection title="Saved" reason="Saved items are unavailable because there is no persistent saved-state contract">
    <p><Bookmark aria-hidden="true" />Local forks are unavailable because there is no persistent fork-state contract.</p>
  </UnavailableLibrarySection>;
  if (section === "added") return <UnavailableLibrarySection title="Added to workspaces and projects" reason="Added items are unavailable because there is no persistent workspace/project addition-state contract">
    <p><FolderInput aria-hidden="true" />Adding is unavailable without a Core mutation contract.</p>
  </UnavailableLibrarySection>;
  return <UnavailableLibrarySection title="Needs attention" reason="Needs attention is unavailable because there is no persistent attention-state contract" />;
}
