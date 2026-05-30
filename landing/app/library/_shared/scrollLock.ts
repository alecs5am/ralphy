// Ref-counted body scroll lock. Nested overlays (carousel modal → remix modal,
// lightbox → remix modal) each lock/unlock independently; a naive
// save-and-restore of `body.style.overflow` breaks because the inner overlay
// saves "hidden" (set by the outer one) and restores it on close, leaving the
// page permanently unscrollable. A shared counter fixes that: the lock is only
// released — and the original overflow restored — when the LAST overlay closes.

let count = 0;
let savedOverflow = "";

export function lockScroll() {
  if (typeof document === "undefined") return;
  if (count === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  count++;
}

export function unlockScroll() {
  if (typeof document === "undefined") return;
  count = Math.max(0, count - 1);
  if (count === 0) document.body.style.overflow = savedOverflow;
}
