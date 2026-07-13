/** Fold a string into a stable 32-bit seed (FNV-1a). */
export function hashSeed(...parts: string[]): number {
  let hash = 0x811c9dc5;
  for (const char of parts.join("\0")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface Prng {
  next(): number;
  float(min: number, max: number): number;
  int(min: number, max: number): number;
}

/** Small deterministic Mulberry32 random stream. */
export function makePrng(seed: number | string): Prng {
  let state = (typeof seed === "number" ? seed >>> 0 : hashSeed(seed)) || 1;
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    float: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
  };
}
