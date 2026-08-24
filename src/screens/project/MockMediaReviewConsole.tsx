import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";

import { Keycap } from "../../components/ui/Keycap";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { MediaCardPreview, mediaCardName } from "../../components/VirtualAssetGrid";
import { InstrumentOverlay } from "../../instrument/overlay-registry";
import { bridge } from "../../lib/ipc";
import type { MediaReviewConsoleProps } from "./MediaReviewConsole";
import { createMockReviewSession, isReviewShortcutEligible, reduceMockReviewSession, type MockReviewAction } from "./mock-review";
import type { MediaReviewVerdict } from "./media-review-presentation";
import { ACTIONS, CONSOLE, COPY, FEEDBACK, GLYPH_ACTION, HEADER, HEADER_LABEL, META, NAME, NAVIGATION, NAV_ACTION, POSITION, PREVIEW, PREVIEW_BUTTON, STATUS, STATUS_DOT, VERDICT_ACTIVE, VERDICT_REST, statusDotTone } from "./review-console";

const verdictLabels: Record<MediaReviewVerdict, string> = {
  approved: "Approved",
  "needs-work": "Needs Work",
  rejected: "Rejected",
};

/* The mock's own dialog. `InstrumentOverlay` gives a `dialog` kind the managed surface --
   `rounded-panel bg-surface text-ink` -- so this form stands on a *theme* plate, not on a black
   widget, and every pair below is the theme family. The sheet this replaced painted the copy
   with `--instrument-text-on-dark-secondary-readable`, which measured #A4A4A0 on the light
   theme's #F1F2F6 at 2.24:1, and its submit button put #F2F2F0 on #E0362C at 4.33:1. The alarm
   is not a text surface: a primary action here is the inversion of its own plate, and the alarm
   tone stays on the verdict dot, which carries no copy. */
const DIALOG = "fixed top-1/2 left-1/2 z-mock-review w-mock-review -translate-x-1/2 -translate-y-1/2";
const FORM = "mock-needs-work grid gap-4.5 p-5";
const FORM_EYEBROW = "font-code type-mono-sm tracking-mono text-muted uppercase";
const FIELD = "min-h-27.5 resize-y rounded-field bg-surface-sunken p-3 type-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink";
const DIALOG_ACTION = "inline-flex min-h-8.5 flex-none items-center justify-center rounded-control px-3.5 type-sm focus-visible:outline-2 focus-visible:-outline-offset-2";
const DIALOG_GHOST = `${DIALOG_ACTION} bg-surface-sunken text-ink hover:bg-surface-hover focus-visible:outline-ink`;
const DIALOG_PRIMARY = `${DIALOG_ACTION} bg-desk-primary text-desk-primary-ink hover:bg-desk-primary focus-visible:outline-desk-primary-ink disabled:opacity-45`;

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

  const verdict = review?.verdict ?? "working";
  return <section className={CONSOLE} aria-label="Media review console" tabIndex={-1} onKeyDown={shortcut}>
    <header className={HEADER}>
      <span className={HEADER_LABEL}>TEST REVIEW SESSION · NOT SAVED</span>
      <button className={GLYPH_ACTION} type="button" aria-label="Open selected media" onClick={() => { void controller.openMediaViewer(card); }}><Maximize2 aria-hidden="true" /></button>
    </header>
    <button className={PREVIEW_BUTTON} type="button" aria-label={`Preview ${mediaCardName(card)}`} onClick={() => { void controller.openMediaViewer(card); }}>
      <MediaCardPreview card={card} project={project} rootEpoch={rootEpoch} resolvePreview={bridge.resolveProjectPreview} fill className={PREVIEW} />
    </button>
    <div className={COPY}>
      <span className={`${STATUS} is-${verdict}`}><i className={`${STATUS_DOT} ${statusDotTone(verdict)}`} aria-hidden="true" />{review ? verdictLabels[review.verdict] : "Working"}</span>
      <strong className={NAME}>{mediaCardName(card)}</strong>
      <small className={META}>{card.ref.type} · {card.mime || "MIME unavailable"}</small>
    </div>
    <div className={ACTIONS} aria-label="Review actions">
      {(["approved", "needs-work", "rejected"] as const).map((option) => <button
        ref={option === "needs-work" ? needsWorkOpener : undefined}
        type="button"
        className={review?.verdict === option ? `${VERDICT_ACTIVE} is-active` : VERDICT_REST}
        aria-pressed={review?.verdict === option}
        aria-disabled={!canReview || undefined}
        key={option}
        onClick={(event) => { if (!canReview) event.preventDefault(); else reviewWith(option); }}
      >{verdictLabels[option]}<Keycap
        tokens={[option === "approved" ? "A" : option === "needs-work" ? "N" : "R"]}
        tone={review?.verdict === option ? "on-light" : "on-dark"}
      /></button>)}
    </div>
    {review?.feedback && <p className={FEEDBACK}>“{review.feedback}”</p>}
    <footer className={NAVIGATION}>
      <button className={NAV_ACTION} type="button" aria-label="Previous media" disabled={position <= 0} onClick={() => onNavigate(-1)}><ChevronLeft aria-hidden="true" /></button>
      <span className={POSITION}>{position + 1} / {total}</span>
      <button className={NAV_ACTION} type="button" aria-label="Next media" disabled={position < 0 || position >= total - 1} onClick={() => onNavigate(1)}><ChevronRight aria-hidden="true" /></button>
    </footer>
    <InstrumentOverlay
      id="mock-needs-work"
      open={session.needsWorkDraft !== null}
      label="Needs Work feedback"
      description="Feedback is required for this test review"
      opener={needsWorkOpener.current}
      onOpenChange={(open) => { if (!open) dispatch({ type: "cancel-needs-work" }); }}
      surfaceClassName={DIALOG}
    >
      <form className={FORM} onSubmit={(event) => { event.preventDefault(); dispatch({ type: "submit-needs-work" }); }}>
        <header className="grid gap-1.25"><span className={FORM_EYEBROW}>TEST REVIEW SESSION</span><h2 className="m-0 type-md font-normal text-ink">What needs work?</h2><p className="m-0 type-sm leading-copy text-muted">This feedback stays in renderer memory and is not saved.</p></header>
        <label className="grid gap-1.75 type-sm text-muted">Feedback<textarea className={FIELD} autoFocus value={session.needsWorkDraft?.feedback ?? ""} onChange={(event) => dispatch({ type: "change-feedback", value: event.target.value })} /></label>
        <footer className="flex justify-end gap-2">
          <button className={DIALOG_GHOST} type="button" onClick={() => dispatch({ type: "cancel-needs-work" })}>Cancel</button>
          <button className={DIALOG_PRIMARY} type="submit" disabled={!session.needsWorkDraft?.feedback.trim()}>Mark Needs Work</button>
        </footer>
      </form>
    </InstrumentOverlay>
  </section>;
}
