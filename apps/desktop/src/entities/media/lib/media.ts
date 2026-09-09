export interface AssetGridGeometry {
  columns: number;
  tileWidth: number;
  tileHeight: number;
  rowHeight: number;
  gap: number;
}

export function assetGridGeometry(width: number, targetTileWidth: number, gap: number, maxColumns = Number.POSITIVE_INFINITY): AssetGridGeometry {
  const safeWidth = Math.max(1, Number.isFinite(width) ? width : 1);
  const safeGap = Math.max(0, Number.isFinite(gap) ? gap : 0);
  const naturalColumns = Math.max(1, Math.floor((safeWidth + safeGap) / (Math.max(1, Number.isFinite(targetTileWidth) ? targetTileWidth : 1) + safeGap)));
  const columnLimit = Number.isFinite(maxColumns) ? Math.max(1, Math.floor(maxColumns)) : Number.POSITIVE_INFINITY;
  const columns = Math.min(naturalColumns, columnLimit);
  const tileWidth = Math.max(1, (safeWidth - safeGap * (columns - 1)) / columns);
  const tileHeight = Math.max(1, tileWidth * 0.625) + 54;
  return { columns, tileWidth, tileHeight, rowHeight: tileHeight + safeGap, gap: safeGap };
}

export function mediaFallbackAspectRatio(kind: "image" | "video" | "audio" | null, stableKey: string): number {
  if (kind === "audio") return 1.6;
  if (kind === "video") return 16 / 9;
  if (kind === "image") return 1;
  let hash = 2_166_136_261;
  for (const character of stableKey) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619) >>> 0;
  return [0.72, 0.8, 0.9, 1, 1.15][hash % 5]!;
}

type PreviewKind = "image" | "video" | "audio";

export function createPreviewScheduler(limits: Record<PreviewKind, number>) {
  const active: Record<PreviewKind, number> = { image: 0, video: 0, audio: 0 };
  const waiting: Record<PreviewKind, Array<(release: () => void) => void>> = { image: [], video: [], audio: [] };
  const releaseFor = (kind: PreviewKind): (() => void) => {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = waiting[kind].shift();
      if (next) next(releaseFor(kind));
      else active[kind] -= 1;
    };
  };
  return {
    acquire(kind: PreviewKind): Promise<() => void> {
      if (active[kind] < Math.max(1, limits[kind])) {
        active[kind] += 1;
        return Promise.resolve(releaseFor(kind));
      }
      return new Promise((resolve) => waiting[kind].push(resolve));
    },
  };
}

export const previewScheduler = createPreviewScheduler({ image: 4, video: 2, audio: 1 });
