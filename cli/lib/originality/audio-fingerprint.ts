// Local audio fingerprint for the originality check (#561). PURE: no I/O.
//
// A band-energy-difference fingerprint in the style of Haitsma & Kalker
// (ISMIR 2002), the published basis of several production audio matchers:
//
//   1. Mono PCM at 8 kHz (decoded by ffmpeg, see `extract.ts`).
//   2. Hann-windowed frames of 2048 samples (256 ms), hop 256 samples (32 ms).
//   3. Energy in 33 log-spaced bands between 300 and 2000 Hz per frame.
//   4. One 32-bit sub-fingerprint per frame: bit m is the sign of the band
//      energy difference (m vs m+1) minus the same difference one frame back.
//
// The bits depend on spectral SHAPE changes, not level, so gain changes, mild
// EQ, and re-encoding leave most of them intact (bit error rate well under
// 0.2); unrelated audio sits near 0.5. Like the original method, it is NOT
// robust to tempo or pitch changes beyond a few percent; the visual axis
// carries those cases.
//
// Matching is block-wise, so partial reuse and reordered sections are found:
// every ~2 s block of the subject is slid across the other track and its best
// bit error rate (BER) and offset are kept.

export const AUDIO_SAMPLE_RATE = 8000;
export const FRAME_SIZE = 2048;
export const HOP_SIZE = 256;
const BANDS = 33;
const F_MIN = 300;
const F_MAX = 2000;
/** Frames per matching block (~2 s at a 32 ms hop). */
export const BLOCK_FRAMES = 64;
/** Stride between subject blocks. */
export const BLOCK_STRIDE = 32;
/**
 * A bit is UNRELIABLE when its energy difference is below this share of the
 * loudest band in the two frames (-50 dB): near-empty bands on tonal content
 * flip on rounding noise. Unreliable bits are masked out of the BER on both
 * sides instead of being forced to 0, so two unrelated tonal tracks do not
 * "agree" on their empty bands.
 */
const RELIABLE_SHARE = 1e-5;
/** RMS (int16 units) below which a frame is treated as silence. */
export const SILENCE_RMS = 60;

export interface AudioFingerprint {
  /** One 32-bit sub-fingerprint per frame. */
  bits: Uint32Array;
  /** Per-frame mask of reliable bits (see RELIABLE_SHARE). */
  reliable: Uint32Array;
  /** 1 where the frame is audible, 0 where it is silence (excluded from BER). */
  voiced: Uint8Array;
  /** Seconds per frame (the hop). */
  hopSec: number;
}

/** Compute the fingerprint of mono 16-bit PCM at AUDIO_SAMPLE_RATE. */
export function audioFingerprint(pcm: Int16Array, sampleRate = AUDIO_SAMPLE_RATE): AudioFingerprint {
  const frames = pcm.length < FRAME_SIZE ? 0 : Math.floor((pcm.length - FRAME_SIZE) / HOP_SIZE) + 1;
  const window = hann(FRAME_SIZE);
  const edges = bandEdges(sampleRate);
  const energies: Float64Array[] = [];
  const voicedFlags = new Uint8Array(frames);
  const re = new Float64Array(FRAME_SIZE);
  const im = new Float64Array(FRAME_SIZE);
  for (let f = 0; f < frames; f++) {
    const start = f * HOP_SIZE;
    let sq = 0;
    for (let i = 0; i < FRAME_SIZE; i++) {
      const sample = pcm[start + i]!;
      sq += sample * sample;
      re[i] = sample * window[i]!;
      im[i] = 0;
    }
    voicedFlags[f] = Math.sqrt(sq / FRAME_SIZE) >= SILENCE_RMS ? 1 : 0;
    fftInPlace(re, im);
    const bands = new Float64Array(BANDS + 1);
    for (let b = 0; b <= BANDS; b++) {
      let e = 0;
      for (let k = edges[b]!; k < edges[b + 1]!; k++) e += re[k]! * re[k]! + im[k]! * im[k]!;
      bands[b] = e;
    }
    energies.push(bands);
  }
  const bits = new Uint32Array(frames);
  const reliable = new Uint32Array(frames);
  for (let f = 1; f < frames; f++) {
    const cur = energies[f]!;
    const prev = energies[f - 1]!;
    let peak = 0;
    for (let b = 0; b <= BANDS; b++) peak = Math.max(peak, cur[b]!, prev[b]!);
    const epsilon = peak * RELIABLE_SHARE;
    let word = 0;
    let mask = 0;
    for (let m = 0; m < 32; m++) {
      const d = cur[m]! - cur[m + 1]! - (prev[m]! - prev[m + 1]!);
      if (d > 0) word |= 1 << (31 - m);
      if (Math.abs(d) >= epsilon) mask |= 1 << (31 - m);
    }
    bits[f] = word >>> 0;
    reliable[f] = mask >>> 0;
  }
  // Frame 0 has no predecessor: treat it as silence so it never votes.
  if (frames > 0) voicedFlags[0] = 0;
  return { bits, reliable, voiced: voicedFlags, hopSec: HOP_SIZE / sampleRate };
}

/** Share of audible frames; 0 means the track is effectively silent. */
export function voicedShare(fp: AudioFingerprint): number {
  if (fp.voiced.length === 0) return 0;
  let n = 0;
  for (const v of fp.voiced) n += v;
  return n / fp.voiced.length;
}

export interface AudioBlockMatch {
  /** Subject frame index the block starts at. */
  start: number;
  /** Best bit error rate found in the other track (0 identical, ~0.5 unrelated). */
  ber: number;
  /** Other-track frame offset of the best match. */
  offset: number;
}

/**
 * Slide every subject block across the other track and keep the best BER.
 * Blocks that are mostly silence are skipped. O(subject x other) popcounts.
 */
export function matchAudioBlocks(subject: AudioFingerprint, other: AudioFingerprint): AudioBlockMatch[] {
  const matches: AudioBlockMatch[] = [];
  const n = subject.bits.length;
  const m = other.bits.length;
  if (n === 0 || m === 0) return matches;
  const block = Math.min(BLOCK_FRAMES, n, m);
  if (block < 8) return matches;
  for (let start = 0; start + block <= n; start += Math.min(BLOCK_STRIDE, block)) {
    let voiced = 0;
    for (let i = 0; i < block; i++) voiced += subject.voiced[start + i]!;
    if (voiced < block / 2) continue;
    let best = 1;
    let bestOffset = 0;
    for (let offset = 0; offset + block <= m; offset++) {
      let errors = 0;
      let compared = 0;
      for (let i = 0; i < block; i++) {
        if (!subject.voiced[start + i] || !other.voiced[offset + i]) continue;
        const mask = subject.reliable[start + i]! & other.reliable[offset + i]!;
        errors += popcount((subject.bits[start + i]! ^ other.bits[offset + i]!) & mask);
        compared += popcount(mask);
      }
      if (compared < (block * 32) / 4) continue;
      const ber = errors / compared;
      if (ber < best) {
        best = ber;
        bestOffset = offset;
      }
    }
    matches.push({ start, ber: best === 1 ? 0.5 : best, offset: bestOffset });
  }
  return matches;
}

// ─── DSP helpers ─────────────────────────────────────────────────────────────

function hann(size: number): Float64Array {
  const w = new Float64Array(size);
  for (let i = 0; i < size; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  return w;
}

function bandEdges(sampleRate: number): number[] {
  const edges: number[] = [];
  const binHz = sampleRate / FRAME_SIZE;
  for (let b = 0; b <= BANDS + 1; b++) {
    const hz = F_MIN * Math.pow(F_MAX / F_MIN, b / (BANDS + 1));
    edges.push(Math.max(1, Math.round(hz / binHz)));
  }
  // Guarantee every band spans at least one bin.
  for (let b = 1; b < edges.length; b++) if (edges[b]! <= edges[b - 1]!) edges[b] = edges[b - 1]! + 1;
  return edges;
}

/** In-place iterative radix-2 FFT; length must be a power of two. */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const aRe = re[i + k]!;
        const aIm = im[i + k]!;
        const bRe = re[i + k + len / 2]! * curRe - im[i + k + len / 2]! * curIm;
        const bIm = re[i + k + len / 2]! * curIm + im[i + k + len / 2]! * curRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + len / 2] = aRe - bRe;
        im[i + k + len / 2] = aIm - bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

function popcount(value: number): number {
  let v = value >>> 0;
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}
