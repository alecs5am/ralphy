import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import type { MediaCardDto } from "../../../electron/ralphy/types";
import type { ProjectSummary } from "../../lib/ipc";
import { bridge } from "../../lib/ipc";
import { MediaCardPreview, mediaCardName } from "../../components/VirtualAssetGrid";
import type { ProjectScreenController } from "../../state/project-screen-controller";
import { MEDIA_REVIEW_UNSUPPORTED_REASON, productionMediaReviewStatus, type MediaReviewVerdict } from "./media-review-presentation";
import { ACTIONS, CONSOLE, COPY, GLYPH_ACTION, HEADER, HEADER_LABEL, HELP, KEYCAP, META, NAME, NAVIGATION, NAV_ACTION, POSITION, PREVIEW, PREVIEW_BUTTON, STATUS, STATUS_DOT, VERDICT_UNSUPPORTED, statusDotTone } from "./review-console";

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
  const statusValue = status.status === "ready" ? status.value : "unavailable";
  return <section className={CONSOLE} aria-label="Media review console">
    <header className={HEADER}>
      <span className={HEADER_LABEL}>READ-ONLY REVIEW</span>
      <button className={GLYPH_ACTION} type="button" aria-label="Open selected media" onClick={() => { void controller.openMediaViewer(card); }}><Maximize2 aria-hidden="true" /></button>
    </header>
    <button className={PREVIEW_BUTTON} type="button" aria-label={`Preview ${mediaCardName(card)}`} onClick={() => { void controller.openMediaViewer(card); }}>
      <MediaCardPreview card={card} project={project} rootEpoch={rootEpoch} resolvePreview={bridge.resolveProjectPreview} fill className={PREVIEW} />
    </button>
    <div className={COPY}>
      <span className={`${STATUS} is-${statusValue}`}><i className={`${STATUS_DOT} ${statusDotTone(statusValue)}`} aria-hidden="true" />{status.status === "ready" ? status.value : "Status unavailable"}</span>
      <strong className={NAME}>{mediaCardName(card)}</strong>
      <small className={META}>{card.ref.type} · {card.mime || "MIME unavailable"}</small>
    </div>
    <div className={ACTIONS} aria-label="Review actions">
      {(["approved", "needs-work", "rejected"] as const).map((verdict) => {
        const unsupportedId = `media-review-${verdict}-unsupported`;
        return <button className={VERDICT_UNSUPPORTED} type="button" aria-disabled="true" aria-describedby={unsupportedId} key={verdict} onClick={(event) => event.preventDefault()}>
          {verdictLabels[verdict]}<kbd className={KEYCAP}>{verdict === "approved" ? "A" : verdict === "needs-work" ? "N" : "R"}</kbd>
          <span id={unsupportedId} hidden>{MEDIA_REVIEW_UNSUPPORTED_REASON}</span>
        </button>;
      })}
    </div>
    <p className={HELP}>{MEDIA_REVIEW_UNSUPPORTED_REASON}</p>
    <footer className={NAVIGATION}>
      <button className={NAV_ACTION} type="button" aria-label="Previous media" disabled={position <= 0} onClick={() => onNavigate(-1)}><ChevronLeft aria-hidden="true" /></button>
      <span className={POSITION}>{position + 1} / {total}</span>
      <button className={NAV_ACTION} type="button" aria-label="Next media" disabled={position < 0 || position >= total - 1} onClick={() => onNavigate(1)}><ChevronRight aria-hidden="true" /></button>
    </footer>
  </section>;
}
