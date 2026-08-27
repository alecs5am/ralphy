/**
 * The dock's single host element, moved between the three places it can stand.
 *
 * The rail's contents are one DOM node, portalled once and relocated -- docked beside the desk, in
 * the overlay sheet, or parked offscreen. Re-mounting it instead would restart the chat's own
 * state on every dock change, which is why the node moves rather than the tree.
 *
 * Focus is the subtle half. Moving a node loses whatever was focused inside it, so the focused
 * element is saved on the way out and restored on the way in -- twice, because a portalled
 * overlay steals focus back on the frame after it opens.
 */
import { useLayoutEffect, type RefObject } from "react";

import type { InstrumentRightRailMode } from "@/shared/instrument/types";

export function useRailHost({ railHost, railParking, dockedRailTarget, overlayRailTarget, mode, focusedRailElement }: {
  railHost: HTMLElement | null;
  railParking: HTMLElement | null;
  dockedRailTarget: HTMLElement | null;
  overlayRailTarget: HTMLElement | null;
  mode: InstrumentRightRailMode;
  focusedRailElement: RefObject<HTMLElement | null>;
}) {
  useLayoutEffect(() => {
    if (!railHost || !railParking) return;
    const target = mode === "docked"
      ? dockedRailTarget
      : mode === "overlay"
        ? overlayRailTarget
        : railParking;
    if (!target) return;
    target.appendChild(railHost);
    const focused = focusedRailElement.current;
    let focusTimer = 0;
    if (focused && railHost.contains(focused) && document.activeElement !== focused) {
      focused.focus({ preventScroll: true });
    }
    if (mode !== "closed" && focused && railHost.contains(focused)) {
      focusTimer = window.setTimeout(() => focused.focus({ preventScroll: true }), 0);
    }
    focusedRailElement.current = null;
    return () => {
      window.clearTimeout(focusTimer);
      const active = document.activeElement;
      if (active instanceof HTMLElement && railHost.contains(active)) focusedRailElement.current = active;
      railParking.appendChild(railHost);
    };
  }, [dockedRailTarget, mode, overlayRailTarget, railHost, railParking]);
}
