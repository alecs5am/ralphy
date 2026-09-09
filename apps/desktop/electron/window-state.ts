export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function parseWindowBounds(value: unknown): WindowBounds | null {
  if (value === null || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const values = [row.x, row.y, row.width, row.height];
  if (!values.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    return null;
  }
  if ((row.width as number) <= 0 || (row.height as number) <= 0) return null;
  return {
    x: Math.round(row.x as number),
    y: Math.round(row.y as number),
    width: Math.round(row.width as number),
    height: Math.round(row.height as number),
  };
}

export function fitWindowBounds(
  bounds: WindowBounds,
  workArea: WindowBounds,
  minimum: Pick<WindowBounds, "width" | "height">,
): WindowBounds {
  const width = Math.min(workArea.width, Math.max(minimum.width, bounds.width));
  const height = Math.min(workArea.height, Math.max(minimum.height, bounds.height));
  return {
    x: Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - width),
    y: Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - height),
    width,
    height,
  };
}
