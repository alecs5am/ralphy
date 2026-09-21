/**
 * Shared playback gating for marketplace visual previews. A full Visuals page mounts hundreds of
 * cards, and one `IntersectionObserver` + `matchMedia` + `visibilitychange` listener per card is
 * the reported lag, so the process shares exactly one of each: built on the first subscription,
 * torn down when the last subscriber leaves, rebuilt if a card subscribes again.
 *
 * A lift of the logic from `ui/MarketplaceVisualPreview.tsx`, not a redesign: `playing` keeps the
 * same formula and `visible` still starts optimistic so a card plays before the observer reports.
 */
import { useCallback, useRef, useSyncExternalStore, type RefObject } from "react";

/** `playing` is `active && visible && !hidden && !paused && (!reduced || manual)`. */
export type PlaybackState = Snapshot & { readonly playing: boolean };

type Snapshot = { readonly visible: boolean; readonly reduced: boolean; readonly hidden: boolean };
type Cell = { snapshot: Snapshot; notify: () => void };

/** What a card sees before anything is observed, and wherever the browser APIs are absent. */
const idle: Snapshot = { visible: true, reduced: false, hidden: false };

const cells = new Set<Cell>();
const handlers = new WeakMap<Element, (visible: boolean) => void>();
const motionListeners = new Set<() => void>();
let observer: IntersectionObserver | null = null;
let media: MediaQueryList | null = null;
let reduced = false, hidden = false;

/** Rebuild one cell's snapshot; returns whether anything moved. */
function sync(cell: Cell, visible: boolean): boolean {
  const previous = cell.snapshot;
  if (previous.visible === visible && previous.reduced === reduced && previous.hidden === hidden) return false;
  cell.snapshot = { visible, reduced, hidden };
  return true;
}

const push = (cell: Cell, visible: boolean) => { if (sync(cell, visible)) cell.notify(); };
const broadcast = () => { for (const cell of cells) push(cell, cell.snapshot.visible); };
/** Both exports share the listeners, so both keep them alive. */
const live = () => cells.size + motionListeners.size;

const onMotion = () => {
  reduced = media?.matches ?? false;
  broadcast();
  for (const listener of [...motionListeners]) listener();
};
const onVisibility = () => { hidden = document.visibilityState === "hidden"; broadcast(); };

function start(): void {
  media = typeof window === "undefined" ? null : (window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null);
  reduced = media?.matches ?? false;
  media?.addEventListener?.("change", onMotion);
  if (typeof document === "undefined") return;
  hidden = document.visibilityState === "hidden";
  document.addEventListener("visibilitychange", onVisibility);
}

function stop(): void {
  observer?.disconnect();
  media?.removeEventListener?.("change", onMotion);
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
  observer = null; media = null; reduced = false; hidden = false;
}

/** The process-wide observer, built on the first `observe` and dispatched through `handlers`. */
function observe(element: Element, cell: Cell): void {
  if (!observer && typeof IntersectionObserver !== "undefined") {
    observer = new IntersectionObserver(
      (entries) => { for (const entry of entries) handlers.get(entry.target)?.(entry.isIntersecting); },
      { threshold: 0.05 },
    );
  }
  handlers.set(element, (visible) => push(cell, visible));
  observer?.observe(element);
}

function attach(cell: Cell, element: Element | null, notify: () => void): () => void {
  if (live() === 0) start();
  cell.notify = notify;
  cells.add(cell);
  // No notify here: React re-reads the snapshot right after `subscribe` returns.
  sync(cell, cell.snapshot.visible);
  if (element) observe(element, cell);
  return () => {
    cells.delete(cell);
    if (element) { handlers.delete(element); observer?.unobserve(element); }
    if (live() === 0) stop();
  };
}

/**
 * Run `listener` on every reduced-motion `change` event, sharing the one `matchMedia` listener.
 * Cards use it to drop a manual play override the way the per-card effect used to.
 */
export function onReducedMotionChange(listener: () => void): () => void {
  if (live() === 0) start();
  motionListeners.add(listener);
  return () => { motionListeners.delete(listener); if (live() === 0) stop(); };
}

export function useRemocnPlayback(
  ref: RefObject<Element | null>,
  options: { active: boolean; manual: boolean; paused?: boolean },
): PlaybackState {
  const cell = useRef<Cell | null>(null);
  cell.current ??= { snapshot: idle, notify: () => {} };
  const subscribe = useCallback((notify: () => void) => attach(cell.current!, ref.current, notify), [ref]);
  const snapshot = useSyncExternalStore(subscribe, () => cell.current!.snapshot, () => idle);
  const playing = options.active && snapshot.visible && !snapshot.hidden && !options.paused
    && (!snapshot.reduced || options.manual);
  return { playing, ...snapshot };
}
