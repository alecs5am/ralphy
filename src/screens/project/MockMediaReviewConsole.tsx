import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { MediaCardPreview, mediaCardName } from "../../components/VirtualAssetGrid";
import { InstrumentOverlay } from "../../instrument/overlay-registry";
import { bridge } from "../../lib/ipc";
import type { MediaReviewConsoleProps } from "./MediaReviewConsole";
import { createMockReviewSession, isReviewShortcutEligible, reduceMockReviewSession, type MockReviewAction } from "./mock-review";
import type { MediaReviewVerdict } from "./media-review-presentation";
import "../../styles/mock-media-review.css";

const verdictLabels: Record<MediaReviewVerdict, string> = {
  approved: "Approved",
  "needs-work": "Needs Work",
  rejected: "Rejected",
};

export function MockMediaReviewConsole({ card, project, rootEpoch, controller, position, total, onNavigate }: MediaReviewConsoleProps) {
  const context = useMemo(() => ({ rootEpoch, workspaceId: project.workspaceId, projectId: project.projectId }), [project.projectId, project.workspaceId, rootEpoch]);
  const contextKey = JSON.stringify(context);
  const [session, setSession] = useState(() => createMockReviewSession(context));
  const needsWorkOpener = useRef<HTMLButtonElement>(null);
  const canReview = card.ref.type === "artifact";
  const review = canReview ? session.reviews[card.ref.id] : null;

  useEffect(() => setSession(createMockReviewSession(context)), [contextKey]);

  const dispatch = (action: MockReviewAction) => setSession((current) => reduceMockReviewSession(current, action));
  const reviewWith = (verdict: MediaReviewVerdict) => {
    if (!canReview) return;
    if (verdict === "needs-work") dispatch({ type: "open-needs-work", artifactId: card.ref.id });
    else dispatch({ type: verdict === "approved" ? "approve" : "reject", artifactId: card.ref.id });
  };
  const shortcut = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!isReviewShortcutEligible(event.nativeEvent, {
      context: session.context,
      selected: true,
      overlayOpen: session.needsWorkDraft !== null,
      iterationActive: session.iteration?.active === true,
    })) return;
    const key = event.key.toLocaleLowerCase();
    const verdict = key === "a" ? "approved" : key === "n" ? "needs-work" : key === "r" ? "rejected" : null;
    if (!verdict) return;
    event.preventDefault();
    reviewWith(verdict);
  };

  return <section className="review-console" aria-label="Media review console" tabIndex={-1} onKeyDown={shortcut}>
    <header className="review-console-header">
      <span>TEST REVIEW SESSION · NOT SAVED</span>
      <button type="button" aria-label="Open selected media" onClick={() => { void controller.openMediaViewer(card); }}><Maximize2 aria-hidden="true" /></button>
    </header>
    <button className="review-console-preview-button" type="button" aria-label={`Preview ${mediaCardName(card)}`} onClick={() => { void controller.openMediaViewer(card); }}>
      <MediaCardPreview card={card} project={project} rootEpoch={rootEpoch} resolvePreview={bridge.resolveProjectPreview} fill className="review-console-preview" />
    </button>
    <div className="review-console-copy">
      <span className={`media-review-status is-${review?.verdict ?? "working"}`}><i aria-hidden="true" />{review ? verdictLabels[review.verdict] : "Working"}</span>
      <strong>{mediaCardName(card)}</strong>
      <small>{card.ref.type} · {card.mime || "MIME unavailable"}</small>
    </div>
    <div className="review-console-actions" aria-label="Review actions">
      {(["approved", "needs-work", "rejected"] as const).map((verdict) => <button
        ref={verdict === "needs-work" ? needsWorkOpener : undefined}
        type="button"
        className={review?.verdict === verdict ? "is-active" : ""}
        aria-pressed={review?.verdict === verdict}
        aria-disabled={!canReview || undefined}
        key={verdict}
        onClick={(event) => { if (!canReview) event.preventDefault(); else reviewWith(verdict); }}
      >{verdictLabels[verdict]}<kbd>{verdict === "approved" ? "A" : verdict === "needs-work" ? "N" : "R"}</kbd></button>)}
    </div>
    {review?.feedback && <p className="review-console-feedback">“{review.feedback}”</p>}
    <footer className="review-console-navigation">
      <button type="button" aria-label="Previous media" disabled={position <= 0} onClick={() => onNavigate(-1)}><ChevronLeft aria-hidden="true" /></button>
      <span>{position + 1} / {total}</span>
      <button type="button" aria-label="Next media" disabled={position < 0 || position >= total - 1} onClick={() => onNavigate(1)}><ChevronRight aria-hidden="true" /></button>
    </footer>
    <InstrumentOverlay
      id="mock-needs-work"
      open={session.needsWorkDraft !== null}
      label="Needs Work feedback"
      description="Feedback is required for this test review"
      opener={needsWorkOpener.current}
      onOpenChange={(open) => { if (!open) dispatch({ type: "cancel-needs-work" }); }}
    >
      <form className="mock-needs-work" onSubmit={(event) => { event.preventDefault(); dispatch({ type: "submit-needs-work" }); }}>
        <header><span>TEST REVIEW SESSION</span><h2>What needs work?</h2><p>This feedback stays in renderer memory and is not saved.</p></header>
        <label>Feedback<textarea autoFocus value={session.needsWorkDraft?.feedback ?? ""} onChange={(event) => dispatch({ type: "change-feedback", value: event.target.value })} /></label>
        <footer><button type="button" onClick={() => dispatch({ type: "cancel-needs-work" })}>Cancel</button><button type="submit" disabled={!session.needsWorkDraft?.feedback.trim()}>Mark Needs Work</button></footer>
      </form>
    </InstrumentOverlay>
  </section>;
}
