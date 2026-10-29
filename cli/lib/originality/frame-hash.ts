// Perceptual frame hashes for the originality check (#561). PURE: no I/O.
//
// Each sampled frame arrives as a GRID x GRID 8-bit luma raster (ffmpeg scales
// and converts it, see `extract.ts`). Two classic perceptual hashes are taken
// from it and concatenated into one 128-bit signature:
//
//   • pHash (64 bits): 2-D DCT-II of the 32x32 raster, the top-left 8x8 block
//     of low-frequency coefficients thresholded at its median. Robust to
//     re-encoding, scaling, small crops, and global brightness / contrast /
//     colour changes (a LUT or a grade barely moves low-frequency luma).
//   • dHash (64 bits): a 9x8 area-resampled raster, one bit per horizontal
//     neighbour pair (left brighter than right). Cheap, and it disagrees with
//     pHash on different failure cases, so the pair is harder to collide.
//
// Mirroring flips both hashes completely, so every frame also carries the
// hash of its horizontally mirrored raster. The comparator tries both
// orientations; a mirrored copy is the same footage, not new footage.
//
// Near-uniform frames (black frames, fades, solid cards) carry no structure
// and would "match" any other flat frame, so they are flagged and skipped.

export const GRID = 32;
const LOW = 8;
/** Luma standard deviation (0-255) below which a frame is treated as flat. */
export const FLAT_STDDEV = 4;

/** One sampled frame: timestamp plus the 128-bit signature (4 x uint32). */
export interface FrameSignature {
  /** Sample time in seconds from the start of the media. */
  t: number;
  /** pHash hi/lo + dHash hi/lo. */
  hash: [number, number, number, number];
  /** The same signature computed on the horizontally mirrored raster. */
  mirror: [number, number, number, number];
  /** True when the frame is near-uniform and must not be matched. */
  flat: boolean;
}

const COS_TABLE: Float64Array = (() => {
  const table = new Float64Array(GRID * GRID);
  for (let k = 0; k < GRID; k++) {
    for (let n = 0; n < GRID; n++) {
      table[k * GRID + n] = Math.cos((Math.PI * (2 * n + 1) * k) / (2 * GRID));
    }
  }
  return table;
})();

/** Horizontal mirror of a GRID x GRID raster. */
export function mirrorRaster(raster: Uint8Array | number[], size = GRID): Uint8Array {
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) out[y * size + x] = raster[y * size + (size - 1 - x)]!;
  }
  return out;
}

/** Population standard deviation of a raster's values. */
export function rasterStddev(raster: Uint8Array | number[]): number {
  const n = raster.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += raster[i]!;
  const mean = sum / n;
  let sq = 0;
  for (let i = 0; i < n; i++) sq += (raster[i]! - mean) ** 2;
  return Math.sqrt(sq / n);
}

/** 64-bit pHash of a GRID x GRID raster as [hi, lo] uint32 words. */
export function pHash(raster: Uint8Array | number[]): [number, number] {
  // Separable DCT-II restricted to the LOW x LOW block we keep.
  const rows = new Float64Array(GRID * LOW); // rows[y][v]
  for (let y = 0; y < GRID; y++) {
    for (let v = 0; v < LOW; v++) {
      let s = 0;
      for (let x = 0; x < GRID; x++) s += raster[y * GRID + x]! * COS_TABLE[v * GRID + x]!;
      rows[y * LOW + v] = s;
    }
  }
  const coeffs = new Float64Array(LOW * LOW);
  for (let u = 0; u < LOW; u++) {
    for (let v = 0; v < LOW; v++) {
      let s = 0;
      for (let y = 0; y < GRID; y++) s += rows[y * LOW + v]! * COS_TABLE[u * GRID + y]!;
      coeffs[u * LOW + v] = s;
    }
  }
  const median = medianOf(coeffs);
  return packBits(Array.from(coeffs, (c) => c > median));
}

/** 64-bit dHash of a GRID x GRID raster as [hi, lo] uint32 words. */
export function dHash(raster: Uint8Array | number[]): [number, number] {
  const small = areaResample(raster, GRID, GRID, 9, 8);
  const bits: boolean[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) bits.push(small[y * 9 + x]! > small[y * 9 + x + 1]!);
  }
  return packBits(bits);
}

/** The 128-bit signature (pHash + dHash) of one raster. */
export function signature(raster: Uint8Array | number[]): [number, number, number, number] {
  const [p0, p1] = pHash(raster);
  const [d0, d1] = dHash(raster);
  return [p0, p1, d0, d1];
}

/** Build a FrameSignature (both orientations + flat flag) from a luma raster. */
export function frameSignature(t: number, raster: Uint8Array | number[]): FrameSignature {
  return {
    t,
    hash: signature(raster),
    mirror: signature(mirrorRaster(raster)),
    flat: rasterStddev(raster) < FLAT_STDDEV,
  };
}

/** Number of set bits in a uint32. */
export function popcount32(value: number): number {
  let v = value >>> 0;
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Hamming distance between two 128-bit signatures (0..128). */
export function hamming128(a: readonly number[], b: readonly number[]): number {
  return popcount32(a[0]! ^ b[0]!) + popcount32(a[1]! ^ b[1]!) + popcount32(a[2]! ^ b[2]!) + popcount32(a[3]! ^ b[3]!);
}

/** Similarity of two signatures in [0, 1]: 1 = identical, ~0.5 = unrelated. */
export function signatureSimilarity(a: readonly number[], b: readonly number[]): number {
  return 1 - hamming128(a, b) / 128;
}

/** Hex form of a signature (stable, for JSON caches and debugging). */
export function signatureHex(sig: readonly number[]): string {
  return sig.map((word) => (word >>> 0).toString(16).padStart(8, "0")).join("");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function medianOf(values: Float64Array): number {
  const sorted = Array.from(values).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function packBits(bits: boolean[]): [number, number] {
  let hi = 0;
  let lo = 0;
  for (let i = 0; i < 32; i++) if (bits[i]) hi |= 1 << (31 - i);
  for (let i = 0; i < 32; i++) if (bits[32 + i]) lo |= 1 << (31 - i);
  return [hi >>> 0, lo >>> 0];
}

/** Box-filter resample (fractional bin edges) of a W x H raster to w x h. */
export function areaResample(
  raster: Uint8Array | number[],
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Float64Array {
  const out = new Float64Array(dstW * dstH);
  const sx = srcW / dstW;
  const sy = srcH / dstH;
  for (let oy = 0; oy < dstH; oy++) {
    const y0 = oy * sy;
    const y1 = y0 + sy;
    for (let ox = 0; ox < dstW; ox++) {
      const x0 = ox * sx;
      const x1 = x0 + sx;
      let sum = 0;
      let area = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        if (wy <= 0) continue;
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          if (wx <= 0) continue;
          sum += raster[y * srcW + x]! * wx * wy;
          area += wx * wy;
        }
      }
      out[oy * dstW + ox] = area > 0 ? sum / area : 0;
    }
  }
  return out;
}
