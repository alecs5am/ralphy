/** The keys that move a selection through a grid. */
export const GRID_MOVE_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"] as const;

/**
 * Where an arrow key lands in a fixed-column grid, or null when it lands outside it.
 *
 * Left and right move one tile in reading order rather than stopping at the edge of a row: the
 * grid is one list that happens to wrap, and a gallery whose right arrow dies at every row end
 * makes the operator reach for the mouse to cross a boundary the eye does not see.
 */
export function gridMoveIndex(index: number, key: string, columns: number, count: number): number | null {
  if (count <= 0 || columns <= 0) return null;
  /* Nothing selected yet: any of these keys means "start here" rather than "move from nowhere". */
  if (index < 0) return GRID_MOVE_KEYS.some((name) => name === key) ? 0 : null;
  const next = key === "ArrowLeft" ? index - 1
    : key === "ArrowRight" ? index + 1
      : key === "ArrowUp" ? index - columns
        : key === "ArrowDown" ? index + columns
          : key === "Home" ? 0
            : key === "End" ? count - 1
              : null;
  return next === null || next < 0 || next >= count ? null : next;
}
