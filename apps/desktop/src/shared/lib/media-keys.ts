import { useEffect, useRef, type RefObject } from "react";

/**
 * Keyboard helpers for media surfaces.
 *
 * Every viewer that binds arrows or Space to a window listener needs the same first line: do
 * nothing while the operator is typing. Three surfaces had written that check themselves, in
 * three subtly different spellings -- one missed `select`, one read `contenteditable` through a
 * property jsdom does not implement. One spelling, here, is the whole point.
 */

/** The operator is typing, dragging a slider, or otherwise owns the keystroke. */
export function editableTarget(event: KeyboardEvent): boolean {
  /* `event.target` first, `document.activeElement` as the fallback: a listener bound to `window`
     reports the window itself as the target when focus sits on the body. */
  let node = event.target instanceof HTMLElement
    ? event.target
    : document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  for (; node; node = node.parentElement) {
    const tag = node.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    /* The attribute rather than `isContentEditable`: the property is false for a node that is
       not being rendered, and jsdom does not implement it at all. `contenteditable=""` and
       `contenteditable="plaintext-only"` are both editable; only "false" is not. */
    const editable = node.getAttribute("contenteditable");
    if (editable !== null && editable.toLowerCase() !== "false") return true;
    if (node.getAttribute("role") === "slider") return true;
  }
  return false;
}

/**
 * Space starts and stops what a player is showing, while that player has focus.
 *
 * Bound to the player's own root rather than to the window: several players can be on screen at
 * once -- a grid of tiles, a canvas of nodes -- and a window listener would have to guess which
 * one the operator meant. Focus already answers that, and clicking a player focuses it.
 *
 * The root needs `tabIndex={0}` and a focus ring for this to be reachable by keyboard alone.
 */
export function useSpacePlayback(root: RefObject<HTMLElement | null>, toggle: () => void): void {
  const latest = useRef(toggle);
  latest.current = toggle;
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      /* A button, a link and a field all do something of their own with Space. Taking the key
         from a focused transport control would make the button under the cursor do two things. */
      if (event.target instanceof HTMLElement && event.target.closest("button,a,[role=button]")) return;
      if (editableTarget(event)) return;
      event.preventDefault();
      latest.current();
    };
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [root]);
}
