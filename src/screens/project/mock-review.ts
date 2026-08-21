import type { MediaReviewVerdict } from "./media-review-presentation";

export interface MockReviewIteration { id: string; label: string; active: boolean }
export interface MockReviewRecord { artifactId: string; verdict: MediaReviewVerdict; feedback: string | null; iterationId: string | null }
export interface MockReviewContext { rootEpoch: number; workspaceId: string; projectId: string | null }
export interface MockReviewSessionState {
  context: MockReviewContext;
  iteration: MockReviewIteration | null;
  reviews: Readonly<Record<string, MockReviewRecord>>;
  needsWorkDraft: { artifactId: string; feedback: string } | null;
}
export type MockReviewAction =
  | { type: "approve" | "reject"; artifactId: string }
  | { type: "open-needs-work"; artifactId: string }
  | { type: "change-feedback"; value: string }
  | { type: "submit-needs-work" }
  | { type: "cancel-needs-work" }
  | { type: "reset-context"; context: MockReviewContext };

export function createMockReviewSession(context: MockReviewContext): MockReviewSessionState {
  return {
    context,
    iteration: { id: "ux-review-iteration-3", label: "Iteration 3", active: true },
    reviews: {},
    needsWorkDraft: null,
  };
}

function record(state: MockReviewSessionState, artifactId: string, verdict: MediaReviewVerdict, feedback: string | null): MockReviewSessionState {
  return {
    ...state,
    reviews: {
      ...state.reviews,
      [artifactId]: { artifactId, verdict, feedback, iterationId: state.iteration?.id ?? null },
    },
    needsWorkDraft: null,
  };
}

export function reduceMockReviewSession(state: MockReviewSessionState, action: MockReviewAction): MockReviewSessionState {
  if (action.type === "reset-context") return createMockReviewSession(action.context);
  if (action.type === "approve") return record(state, action.artifactId, "approved", null);
  if (action.type === "reject") return record(state, action.artifactId, "rejected", null);
  if (action.type === "open-needs-work") return { ...state, needsWorkDraft: { artifactId: action.artifactId, feedback: "" } };
  if (action.type === "change-feedback") return state.needsWorkDraft
    ? { ...state, needsWorkDraft: { ...state.needsWorkDraft, feedback: action.value } }
    : state;
  if (action.type === "cancel-needs-work") return { ...state, needsWorkDraft: null };
  const draft = state.needsWorkDraft;
  if (!draft?.feedback.trim()) throw new Error("Feedback is required for Needs Work.");
  return record(state, draft.artifactId, "needs-work", draft.feedback.trim());
}

function interactiveTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  return !!target.closest("input, textarea, select, button, a, [contenteditable]:not([contenteditable='false']), [role='button'], [role='dialog'], [role='menu'], [role='listbox'], [role='slider']");
}

export function isReviewShortcutEligible(event: KeyboardEvent, ui: {
  context: MockReviewContext | null;
  selected: boolean;
  overlayOpen: boolean;
  iterationActive: boolean;
}): boolean {
  return ui.context !== null
    && ui.selected
    && !ui.overlayOpen
    && ui.iterationActive
    && !event.defaultPrevented
    && !event.repeat
    && !event.isComposing
    && !event.metaKey
    && !event.ctrlKey
    && !event.altKey
    && !event.shiftKey
    && !interactiveTarget(event.target);
}
