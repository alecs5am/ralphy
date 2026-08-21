import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import type { MediaCardDto } from "../../../electron/ralphy/types";
import type { ProjectSummary } from "../../lib/ipc";
import { bridge } from "../../lib/ipc";
import { MediaCardPreview, mediaCardName } from "../../components/VirtualAssetGrid";
import type { ProjectScreenController } from "../../state/project-screen-controller";
import { MEDIA_REVIEW_UNSUPPORTED_REASON, productionMediaReviewStatus, type MediaReviewVerdict } from "./media-review-presentation";

export interface MediaReviewConsoleProps {
  card: MediaCardDto;
  project: ProjectSummary;
  workspaceName: string | null;
  rootEpoch: number;
  controller: ProjectScreenController;
  position: number;
  total: number;
  onNavigate(delta: -1 | 1): void;
}

const verdictLabels: Record<MediaReviewVerdict, string> = {
  approved: "Approved",
  "needs-work": "Needs Work",
  rejected: "Rejected",
};

export function MediaReviewConsole(props: MediaReviewConsoleProps) {
  const [MockConsole, setMockConsole] = useState<ComponentType<MediaReviewConsoleProps> | null>(null);

  useEffect(() => {
    let active = true;
    setMockConsole(null);
    if (import.meta.env.VITE_RALPHY_ENABLE_MOCKS === "true" && props.workspaceName === "UX Testing Lab") {
      void import("./MockMediaReviewConsole").then(({ MockMediaReviewConsole }) => {
        if (active) setMockConsole(() => MockMediaReviewConsole);
      });
    }
    return () => { active = false; };
  }, [props.workspaceName]);

  return MockConsole ? <MockConsole {...props} /> : <ProductionMediaReviewConsole {...props} />;
}

function ProductionMediaReviewConsole({ card, project, rootEpoch, controller, position, total, onNavigate }: MediaReviewConsoleProps) {
  const status = productionMediaReviewStatus(card);
  return <section className="review-console" aria-label="Media review console">
    <header className="review-console-header">
      <span>READ-ONLY REVIEW</span>
      <button type="button" aria-label="Open selected media" onClick={() => { void controller.openMediaViewer(card); }}><Maximize2 aria-hidden="true" /></button>
    </header>
    <button className="review-console-preview-button" type="button" aria-label={`Preview ${mediaCardName(card)}`} onClick={() => { void controller.openMediaViewer(card); }}>
      <MediaCardPreview card={card} project={project} rootEpoch={rootEpoch} resolvePreview={bridge.resolveProjectPreview} fill className="review-console-preview" />
    </button>
    <div className="review-console-copy">
      <span className={`media-review-status is-${status.status === "ready" ? status.value : "unavailable"}`}><i aria-hidden="true" />{status.status === "ready" ? status.value : "Status unavailable"}</span>
      <strong>{mediaCardName(card)}</strong>
      <small>{card.ref.type} · {card.mime || "MIME unavailable"}</small>
    </div>
    <div className="review-console-actions" aria-label="Review actions">
      {(["approved", "needs-work", "rejected"] as const).map((verdict) => {
        const unsupportedId = `media-review-${verdict}-unsupported`;
        return <button type="button" aria-disabled="true" aria-describedby={unsupportedId} key={verdict} onClick={(event) => event.preventDefault()}>
          {verdictLabels[verdict]}<kbd>{verdict === "approved" ? "A" : verdict === "needs-work" ? "N" : "R"}</kbd>
          <span id={unsupportedId} hidden>{MEDIA_REVIEW_UNSUPPORTED_REASON}</span>
        </button>;
      })}
    </div>
    <p className="review-console-help">{MEDIA_REVIEW_UNSUPPORTED_REASON}</p>
    <footer className="review-console-navigation">
      <button type="button" aria-label="Previous media" disabled={position <= 0} onClick={() => onNavigate(-1)}><ChevronLeft aria-hidden="true" /></button>
      <span>{position + 1} / {total}</span>
      <button type="button" aria-label="Next media" disabled={position < 0 || position >= total - 1} onClick={() => onNavigate(1)}><ChevronRight aria-hidden="true" /></button>
    </footer>
  </section>;
}
