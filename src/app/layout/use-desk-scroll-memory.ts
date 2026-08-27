/**
 * Where each route was left scrolled to, and putting it back once the route can hold it.
 *
 * The offset is captured on the way out, during the render that first sees a new key, because by
 * the time an effect runs the old route is already unmounted and its scrollTop is zero. Restoring
 * waits for the content: a route that renders its rows asynchronously has no scroll height yet, so
 * the restore re-runs on mutation until the target offset is reachable, then stops watching.
 */
import { useLayoutEffect, useRef } from "react";

interface PendingRouteTransition {
  from: string;
  to: string;
  offset: number;
}

export function useDeskScrollMemory(deskElement: HTMLElement | null, routeScrollKey: string) {
  const offsets = useRef(new Map<string, number>());
  const committedRouteKey = useRef(routeScrollKey);
  const pendingRouteTransition = useRef<PendingRouteTransition | null>(null);

  if (routeScrollKey === committedRouteKey.current) {
    pendingRouteTransition.current = null;
  } else if (pendingRouteTransition.current?.to !== routeScrollKey) {
    const transition = {
      from: committedRouteKey.current,
      to: routeScrollKey,
      offset: deskElement?.scrollTop ?? 0,
    };
    offsets.current.set(transition.from, transition.offset);
    pendingRouteTransition.current = transition;
  }

  useLayoutEffect(() => {
    if (!deskElement) return;
    const transition = pendingRouteTransition.current;
    if (transition?.to === routeScrollKey) {
      offsets.current.set(transition.from, transition.offset);
      pendingRouteTransition.current = null;
    }
    committedRouteKey.current = routeScrollKey;
    const targetOffset = offsets.current.get(routeScrollKey) ?? 0;
    let frame = 0;
    const observer = new MutationObserver(() => restoreWhenReady());
    const restoreWhenReady = () => {
      const available = Math.max(0, deskElement.scrollHeight - deskElement.clientHeight);
      deskElement.scrollTo({ top: Math.min(targetOffset, available) });
      if (targetOffset === 0 || available >= targetOffset) observer.disconnect();
    };
    observer.observe(deskElement, { attributes: true, childList: true, subtree: true });
    restoreWhenReady();
    frame = window.requestAnimationFrame(restoreWhenReady);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [deskElement, routeScrollKey]);

  /** Remember an offset a caller captured itself, and apply it if that route is the open one. */
  return (key: string, offset: number) => { offsets.current.set(key, offset); };
}
