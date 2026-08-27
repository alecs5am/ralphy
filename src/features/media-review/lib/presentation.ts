import type { ArtifactRevisionState, MediaCardDto } from "../../../../electron/ralphy/types";
import type { Availability } from "@/shared/instrument/types";

export type MediaReviewVerdict = "approved" | "needs-work" | "rejected";
export type ProductionMediaReviewStatus = ArtifactRevisionState;

export const MEDIA_REVIEW_UNSUPPORTED_REASON = "Review is unavailable in Core 0.3.0 from Desktop.";

const REVISION_STATES = new Set<ArtifactRevisionState>([
  "working", "candidate", "approved", "rejected", "superseded", "archived",
]);

function isArtifactRevisionState(value: unknown): value is ArtifactRevisionState {
  return typeof value === "string" && REVISION_STATES.has(value as ArtifactRevisionState);
}

export function productionMediaReviewStatus(card: MediaCardDto): Availability<ProductionMediaReviewStatus> {
  if (card.ref.type === "artifact" && "selectedState" in card && isArtifactRevisionState(card.selectedState)) {
    return { status: "ready", value: card.selectedState };
  }
  return { status: "unavailable", reason: "Review status is unavailable for this media item." };
}
