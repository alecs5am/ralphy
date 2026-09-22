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
