/**
 * Putting the Marketplace back where it was after a navigation: the scroll offset, and the
 * control the operator left from.
 *
 * Returning to a grid is the hard case. The row that was clicked may not exist yet -- the
 * catalog is still loading, or the item is gone -- so the restore waits while it is pending,
 * gives up to the heading when it is missing, and otherwise retries across frames until the
 * element appears. Twelve frames is the ceiling: past that, landing on the heading is better
 * than a focus that arrives after the operator has started typing.
 */
import { useEffect, useRef, type RefObject } from "react";

export function useMarketplaceRestore({ scrollRef, scrollTop, focusId, focusRouteKey, itemOrigin, originAvailability }: {
  scrollRef: RefObject<HTMLDivElement | null>;
  scrollTop: number;
  focusId: string;
  focusRouteKey: string;
  itemOrigin: boolean;
  originAvailability: "pending" | "available" | "missing" | "not-item";
}) {
  const restoredOrigin = useRef<string | null>(null);
  const originRequestKey = `${focusRouteKey}:${focusId}`;

  useEffect(() => {
    if (!itemOrigin) {
      scrollRef.current?.scrollTo({ top: scrollTop });
      return;
    }
    const frame = window.requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollTop }));
    return () => window.cancelAnimationFrame(frame);
  }, [focusId, focusRouteKey, itemOrigin, scrollTop, originAvailability]);

  useEffect(() => {
    if (!itemOrigin) {
      restoredOrigin.current = null;
      const target = document.getElementById(focusId) ?? document.getElementById("marketplace-heading");
      if (!target?.closest("[hidden]")) target?.focus({ preventScroll: true });
      return;
    }
    if (restoredOrigin.current === originRequestKey) return;
    if (originAvailability === "pending") return;
    const heading = document.getElementById("marketplace-heading");
    if (heading?.closest("[hidden]")) return;
    if (originAvailability === "missing") {
      heading?.focus({ preventScroll: true });
      restoredOrigin.current = originRequestKey;
      return;
    }
    let frame = 0;
    let attempts = 0;
    const restoreFocus = () => {
      if (heading?.closest("[hidden]")) return;
      const target = document.getElementById(focusId);
      if (target) {
        target.focus({ preventScroll: true });
        restoredOrigin.current = originRequestKey;
        return;
      }
      if (attempts < 12) {
        attempts += 1;
        frame = window.requestAnimationFrame(restoreFocus);
        return;
      }
      heading?.focus({ preventScroll: true });
      restoredOrigin.current = originRequestKey;
    };
    frame = window.requestAnimationFrame(restoreFocus);
    return () => window.cancelAnimationFrame(frame);
  }, [focusId, focusRouteKey, itemOrigin, originAvailability, originRequestKey]);
}
