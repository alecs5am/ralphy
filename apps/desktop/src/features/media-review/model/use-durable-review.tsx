import { useEffect, useRef, useState } from "react";
import { bridge, type ProjectSummary } from "@/shared/api/ipc";
import type { MediaCardDto } from "../../../../electron/ralphy/types";
import { InstrumentOverlay } from "@/shared/instrument/overlay-registry";
import { MODAL_ACTION_GHOST, MODAL_ACTION_PRIMARY } from "@/shared/ui/Modal";
import { WINDOW_BODY } from "@/shared/ui/Window";
import type { MediaReview } from "../ui/MediaReviewMenu";
import { productionMediaReviewStatus, type MediaReviewVerdict } from "../lib/presentation";

const LABELS = { approved: "Approved", "needs-work": "Needs Work", rejected: "Rejected" };

export function useDurableReview(project: ProjectSummary, rootEpoch: number, onSaved?: () => void): MediaReview {
  const [draft, setDraft] = useState<{ card: MediaCardDto; feedback: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scope = `${rootEpoch}:${project.workspaceId}:${project.projectId}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const saving = useRef(false);
  const feedbackTooLong = new TextEncoder().encode(draft?.feedback.trim() ?? "").byteLength > 4096;
  useEffect(() => { setDraft(null); setError(null); }, [scope]);

  const save = async (card: MediaCardDto, verdict: MediaReviewVerdict, feedback?: string) => {
    if (saving.current || !("selectedRevisionId" in card) || !card.selectedRevisionId || card.ref.type !== "artifact" || !project.projectId) return;
    saving.current = true; setBusy(true); setError(null);
    try {
      await bridge.reviewProjectMedia({ workspaceId: project.workspaceId, projectId: project.projectId }, {
        artifactId: card.ref.id, expectedSelectedRevisionId: card.selectedRevisionId, verdict, ...(feedback ? { feedback } : {}),
      });
      if (currentScope.current === scope) { setDraft(null); onSaved?.(); }
    } catch (cause) {
      if (currentScope.current === scope) setError(cause instanceof Error ? cause.message : "Review could not be saved. Try again.");
    } finally { saving.current = false; setBusy(false); }
  };

  return {
    note: "Reviews are saved with the selected media revision.",
    status(card) { const state = productionMediaReviewStatus(card); return state.status === "ready" ? state.value === "needs-work" ? "Needs Work" : state.value : "Not reviewed"; },
    rows(card) {
      const selected = "selectedRevisionId" in card && card.selectedRevisionId;
      return (["approved", "needs-work", "rejected"] as const).map((verdict) => ({
        verdict, label: LABELS[verdict], hotkey: "", active: "selectedState" in card && (card.latestReviewVerdict ?? card.selectedState) === verdict,
        disabled: busy || !selected || card.ref.type !== "artifact" || !project.projectId,
      }));
    },
    choose(card, verdict) {
      if (verdict === "needs-work") { setError(null); setDraft({ card, feedback: "" }); }
      else void save(card, verdict);
    },
    dialog: <>
      {error && !draft && <div role="alert" className="flex items-center gap-3 rounded-field bg-surface-sunken p-3 type-sm"><span>{error}</span><button type="button" className={MODAL_ACTION_GHOST} onClick={() => setError(null)}>Dismiss</button></div>}
      <InstrumentOverlay id="mock-needs-work" open={draft !== null} label="Needs Work feedback" description="Save feedback with this media revision" opener={null}
        onOpenChange={(open) => { if (!open && !busy) setDraft(null); }} surfaceClassName="fixed top-1/2 left-1/2 z-mock-review w-mock-review -translate-x-1/2 -translate-y-1/2">
        <form className={`gap-4.5 p-5 ${WINDOW_BODY}`} onSubmit={(event) => { event.preventDefault(); if (draft?.feedback.trim() && !feedbackTooLong) void save(draft.card, "needs-work", draft.feedback.trim()); }}>
          <h2 className="m-0 type-md">What needs work?</h2>
          <p className="m-0 type-sm text-muted">Your feedback and review are saved in the project history.</p>
          <label className="grid gap-2 type-sm">Feedback<textarea autoFocus required maxLength={4096} disabled={busy} className="min-h-27.5 rounded-field bg-surface-sunken p-3" value={draft?.feedback ?? ""} onChange={(event) => setDraft((value) => value ? { ...value, feedback: event.target.value } : value)} /></label>
          {feedbackTooLong && <p role="alert" className="type-sm text-muted">Feedback is too long. Shorten it before saving.</p>}
          {error && <p role="alert" className="type-sm text-muted">{error}</p>}
          <footer className="flex justify-end gap-2"><button className={MODAL_ACTION_GHOST} type="button" disabled={busy} onClick={() => setDraft(null)}>Cancel</button><button className={MODAL_ACTION_PRIMARY} type="submit" disabled={busy || feedbackTooLong || !draft?.feedback.trim()}>{busy ? "Saving…" : "Save feedback"}</button></footer>
        </form>
      </InstrumentOverlay>
    </>,
  };
}
