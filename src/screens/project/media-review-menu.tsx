import { useEffect, useMemo, useState } from "react";

import type { MediaCardDto } from "../../../electron/ralphy/types";
import type { ProjectSummary } from "../../lib/ipc";
import { InstrumentOverlay } from "../../instrument/overlay-registry";
import { MODAL_ACTION_GHOST, MODAL_ACTION_PRIMARY } from "../../components/ui/Modal";
import { WINDOW_BODY } from "../../components/ui/Window";
import { MEDIA_REVIEW_UNSUPPORTED_REASON, productionMediaReviewStatus, type MediaReviewVerdict } from "./media-review-presentation";
import { createMockReviewSession, reduceMockReviewSession, type MockReviewAction } from "./mock-review";

/**
 * Review, as a section of the media grid's own context menu.
 *
 * It used to be a console docked in the shell's right rail, beside the chat -- a second place
 * where one asset was the subject, competing with the modal that already is that place. The
 * verdicts belong to the asset, so they hang off the asset: right-click gives the three of them
 * and the status the asset actually reports, and a double-click opens the modal.
 *
 * Availability stays honest in both directions. Core 0.3.0 exposes no review mutation, so the
 * three rows are disabled and say why; the UX Testing Lab's renderer-only session is the one
 * place they act, and it says in the row group that nothing is saved.
 */

const VERDICT_LABELS: Record<MediaReviewVerdict, string> = {
  approved: "Approved",
  "needs-work": "Needs Work",
  rejected: "Rejected",
};

const VERDICTS = ["approved", "needs-work", "rejected"] as const;

export interface MediaReviewRow {
  verdict: MediaReviewVerdict;
  label: string;
  hotkey: string;
  active: boolean;
  disabled: boolean;
}

export interface MediaReview {
  /** What the section says about itself: the source of the verdicts, or why there are none. */
  note: string;
  /** The card's current state, as the card itself reports it. */
  status(card: MediaCardDto): string;
  rows(card: MediaCardDto): MediaReviewRow[];
  choose(card: MediaCardDto, verdict: MediaReviewVerdict): void;
  /** The mock's feedback dialog, which outlives the menu that opened it. */
  dialog: React.ReactNode;
}

const DIALOG = "fixed top-1/2 left-1/2 z-mock-review w-mock-review -translate-x-1/2 -translate-y-1/2";
const FORM = `mock-needs-work gap-4.5 p-5 ${WINDOW_BODY}`;
const FORM_EYEBROW = "font-code type-mono-sm tracking-mono text-muted uppercase";
const FIELD = "min-h-27.5 resize-y rounded-field bg-surface-sunken p-3 type-sm text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink";

export function useMediaReview({ workspaceName, project, rootEpoch }: {
  workspaceName: string | null;
  project: ProjectSummary;
  rootEpoch: number;
}): MediaReview {
  const mocked = import.meta.env.VITE_RALPHY_ENABLE_MOCKS === "true" && workspaceName === "UX Testing Lab";
  const context = useMemo(
    () => ({ rootEpoch, workspaceId: project.workspaceId, projectId: project.projectId }),
    [project.projectId, project.workspaceId, rootEpoch],
  );
  const contextKey = JSON.stringify(context);
  const [session, setSession] = useState(() => createMockReviewSession(context));
  useEffect(() => setSession(createMockReviewSession(context)), [contextKey]);
  const dispatch = (action: MockReviewAction) => setSession((current) => reduceMockReviewSession(current, action));

  const reviewOf = (card: MediaCardDto) => mocked && card.ref.type === "artifact" ? session.reviews[card.ref.id] ?? null : null;

  return {
    note: mocked ? "TEST REVIEW SESSION · NOT SAVED" : MEDIA_REVIEW_UNSUPPORTED_REASON,
    status(card) {
      const review = reviewOf(card);
      if (review) return VERDICT_LABELS[review.verdict];
      const status = productionMediaReviewStatus(card);
      return status.status === "ready" ? status.value : "unavailable";
    },
    rows(card) {
      const review = reviewOf(card);
      const canReview = mocked && card.ref.type === "artifact";
      return VERDICTS.map((verdict) => ({
        verdict,
        label: VERDICT_LABELS[verdict],
        hotkey: verdict === "approved" ? "A" : verdict === "needs-work" ? "N" : "R",
        active: review?.verdict === verdict,
        disabled: !canReview,
      }));
    },
    choose(card, verdict) {
      if (!mocked || card.ref.type !== "artifact") return;
      if (verdict === "needs-work") dispatch({ type: "open-needs-work", artifactId: card.ref.id });
      else dispatch({ type: verdict === "approved" ? "approve" : "reject", artifactId: card.ref.id });
    },
    dialog: <InstrumentOverlay
      id="mock-needs-work"
      open={session.needsWorkDraft !== null}
      label="Needs Work feedback"
      description="Feedback is required for this test review"
      opener={null}
      onOpenChange={(open) => { if (!open) dispatch({ type: "cancel-needs-work" }); }}
      surfaceClassName={DIALOG}
    >
      <form className={FORM} onSubmit={(event) => { event.preventDefault(); dispatch({ type: "submit-needs-work" }); }}>
        <header className="grid gap-1.25"><span className={FORM_EYEBROW}>TEST REVIEW SESSION</span><h2 className="m-0 type-md font-normal text-ink">What needs work?</h2><p className="m-0 type-sm leading-copy text-muted">This feedback stays in renderer memory and is not saved.</p></header>
        <label className="grid gap-1.75 type-sm text-muted">Feedback<textarea className={FIELD} autoFocus value={session.needsWorkDraft?.feedback ?? ""} onChange={(event) => dispatch({ type: "change-feedback", value: event.target.value })} /></label>
        <footer className="flex justify-end gap-2">
          <button className={MODAL_ACTION_GHOST} type="button" onClick={() => dispatch({ type: "cancel-needs-work" })}>Cancel</button>
          <button className={MODAL_ACTION_PRIMARY} type="submit" disabled={!session.needsWorkDraft?.feedback.trim()}>Mark Needs Work</button>
        </footer>
      </form>
    </InstrumentOverlay>,
  };
}
