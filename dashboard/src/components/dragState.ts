// Cross-component drag state for media drops onto the terminal.
// Tab dragging was removed with the split-panel layout.

export type DragPayload = {
  area: "editor";
  groupId: string;
  tabId: string;
};

let current: DragPayload | null = null;
const listeners = new Set<(p: DragPayload | null) => void>();

export function setDrag(p: DragPayload | null) {
  current = p;
  for (const l of listeners) l(p);
}

export function getDrag(): DragPayload | null {
  return current;
}

export function subscribeDrag(l: (p: DragPayload | null) => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
