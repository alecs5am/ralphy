import { Check, ChevronLeft, ChevronRight, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ArtifactMediaCardDto, MediaCardDto } from "../../electron/ralphy/types";
import type { ProjectMediaReviewVerdict, ProjectReference } from "../lib/ipc";
import { bridge } from "../lib/ipc";
import { MediaCardPreview, mediaCardName } from "./VirtualAssetGrid";

export interface ProjectShellContext {
  project: ProjectReference;
  rootEpoch: number;
  selectedMedia: MediaCardDto;
  canSelectPrevious: boolean;
  canSelectNext: boolean;
  clearMediaSelection(): void;
  selectAdjacentMedia(direction: -1 | 1): void;
  reviewSelectedMedia(verdict: ProjectMediaReviewVerdict): Promise<void>;
}

function editableTarget(event: KeyboardEvent): boolean {
  let target = event.target instanceof HTMLElement
    ? event.target
    : document.activeElement instanceof HTMLElement ? document.activeElement : null;
  for (; target; target = target.parentElement) {
    const tag = target.tagName.toLowerCase();
    const contentEditable = target.getAttribute("contenteditable");
    if (tag === "input" || tag === "textarea"
      || (contentEditable !== null && contentEditable.toLowerCase() !== "false")) return true;
  }
  return false;
}

function cardMetadata(card: MediaCardDto): string {
  return [card.ref.type, card.mediaKind, card.mime ?? "type unknown"].join(" · ");
}

function isArtifact(card: MediaCardDto): card is ArtifactMediaCardDto {
  return card.ref.type === "artifact";
}

export function ReviewConsole({ context }: { context: ProjectShellContext }) {
  const [busy, setBusy] = useState<ProjectMediaReviewVerdict | null>(null);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const request = useRef(0);
  const surface = useRef<HTMLElement>(null);
  const card = context.selectedMedia;
  const reviewable = isArtifact(card) && card.selectedRevisionId !== null;
  const currentVerdict = isArtifact(card) ? card.selectedState ?? "unreviewed" : "Review unavailable";

  useEffect(() => {
    request.current += 1;
    setBusy(null);
    setFeedback(null);
  }, [card.ref.id, card.ref.type]);

  const review = async (verdict: ProjectMediaReviewVerdict) => {
    if (!reviewable || busy) return;
    const requestId = ++request.current;
    setBusy(verdict);
    setFeedback(null);
    try {
      await context.reviewSelectedMedia(verdict);
      if (requestId === request.current) {
        setBusy(null);
        setFeedback({ error: false, message: "Review updated." });
      }
    } catch (error) {
      if (requestId === request.current) {
        setBusy(null);
        setFeedback({ error: true, message: error instanceof Error ? error.message : "Review could not be updated." });
      }
    }
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      if (document.querySelector('[role="dialog"]') || document.querySelector('[role="menu"]')) return;
      for (let element: HTMLElement | null = surface.current; element; element = element.parentElement) {
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        context.clearMediaSelection();
        return;
      }
      if (editableTarget(event)) return;
      const verdict = ({ a: "approved", r: "rejected" } as const)[event.key.toLocaleLowerCase() as "a" | "r"];
      if (verdict) {
        event.preventDefault();
        void review(verdict);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [busy, context, reviewable]);

  return <section className="review-console" aria-label="Media review console" ref={surface}>
    <header className="review-console-header">
      <button type="button" aria-label="Clear media selection" title="Clear selection" onClick={context.clearMediaSelection}>
        <X size={14} aria-hidden="true" />
      </button>
    </header>
    <MediaCardPreview
      card={card}
      project={context.project}
      rootEpoch={context.rootEpoch}
      resolvePreview={bridge.resolveProjectPreview}
      className="review-console-preview"
    />
    <div className="review-console-copy">
      <strong>{mediaCardName(card)}</strong>
      <small>{cardMetadata(card)} · Verdict {currentVerdict}</small>
    </div>
    <div className="review-console-actions" aria-label="Review verdict">
      <button type="button" disabled={!reviewable || busy !== null} onClick={() => { void review("approved"); }}><Check size={14} aria-hidden="true" />Approve <kbd>A</kbd></button>
      <button type="button" disabled title="Needs work requires an iteration feedback workflow, which is not available yet."><RotateCcw size={14} aria-hidden="true" />Needs work <kbd>N</kbd></button>
      <button type="button" disabled={!reviewable || busy !== null} onClick={() => { void review("rejected"); }}><X size={14} aria-hidden="true" />Reject <kbd>R</kbd></button>
    </div>
    <div className="review-console-navigation">
      <button type="button" aria-label="Previous media" disabled={!context.canSelectPrevious} onClick={() => context.selectAdjacentMedia(-1)}>
        <ChevronLeft size={15} aria-hidden="true" />
      </button>
      <button type="button" aria-label="Next media" disabled={!context.canSelectNext} onClick={() => context.selectAdjacentMedia(1)}>
        <ChevronRight size={15} aria-hidden="true" />
      </button>
    </div>
    {!reviewable && <p className="review-console-help">Review requires an Artifact with a selected revision.</p>}
    {busy && <p role="status">Updating review…</p>}
    {feedback && <p role={feedback.error ? "alert" : "status"}>{feedback.message}</p>}
  </section>;
}
