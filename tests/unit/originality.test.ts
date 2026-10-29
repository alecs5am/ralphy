// Originality check (#561) — pure pieces: frame hashes, the audio fingerprint,
// script similarity, the alignment score, threshold behaviour, the variant
// planner, and the tournament's sibling gate with injected comparisons.
// No ffmpeg, no store, no model calls (the media round trip lives in
// tests/integration/unit-originality.test.ts).

import { describe, expect, test } from "bun:test";
import {
  dHash,
  frameSignature,
  hamming128,
  mirrorRaster,
  pHash,
  popcount32,
  rasterStddev,
  signatureSimilarity,
  GRID,
} from "../../cli/lib/originality/frame-hash";
import { audioFingerprint, matchAudioBlocks, AUDIO_SAMPLE_RATE } from "../../cli/lib/originality/audio-fingerprint";
import { compareScripts, openingWords, textFromJson, textFromSubtitles } from "../../cli/lib/originality/script-similarity";
import {
  compareAudio,
  compareFingerprints,
  compareVisual,
  decideVerdict,
  sequenceScore,
  ORIGINALITY_THRESHOLDS,
  type MediaFingerprint,
} from "../../cli/lib/originality/compare";
import {
  classifyAxis,
  planVariants,
  uniquenessOf,
  VariantPlanError,
  VARY_AXIS_MAP,
} from "../../cli/lib/variant-planner";
import { buildVariantMatrix, manualScorer, runTournament, type TournamentCandidate } from "../../cli/lib/variant-tournament";
import { parseTournamentResult } from "../../cli/lib/schemas/variant-matrix";
import { deriveDecisions, parseLedgerAssignment } from "../../cli/lib/analytics/ledger";

// ─── synthetic rasters / signals ─────────────────────────────────────────────

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** A structured 32x32 raster: a few blobs at seeded positions. */
function blobRaster(seed: number): Uint8Array {
  const rnd = seeded(seed);
  const blobs = Array.from({ length: 5 }, () => ({ x: rnd() * GRID, y: rnd() * GRID, r: 3 + rnd() * 8, v: 60 + rnd() * 190 }));
  const out = new Uint8Array(GRID * GRID);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      let v = 20;
      for (const b of blobs) if ((x - b.x) ** 2 + (y - b.y) ** 2 < b.r ** 2) v = b.v;
      out[y * GRID + x] = v;
    }
  }
  return out;
}

function regrade(raster: Uint8Array): Uint8Array {
  return raster.map((v) => Math.min(255, Math.round(v * 0.8 + 30)));
}

/** Stepped tones: a "melody" of `notes` (Hz) each `stepSec` long. */
function melody(notes: number[], stepSec: number, gain = 8000): Int16Array {
  const per = Math.round(stepSec * AUDIO_SAMPLE_RATE);
  const out = new Int16Array(per * notes.length);
  notes.forEach((hz, n) => {
    for (let i = 0; i < per; i++) {
      const t = i / AUDIO_SAMPLE_RATE;
      // Plucked-note envelope plus vibrato: real music changes over time.
      const env = Math.exp(-3 * t) * (1 + 0.3 * Math.sin(2 * Math.PI * 5 * t));
      out[n * per + i] = Math.round(gain * env * (Math.sin(2 * Math.PI * hz * t) + 0.4 * Math.sin(2 * Math.PI * hz * 2.01 * t)));
    }
  });
  return out;
}

function fp(partial: Partial<MediaFingerprint>): MediaFingerprint {
  return { label: "x", path: null, kind: "video", durationSec: null, frames: [], audio: null, script: null, scriptSource: null, ...partial };
}

// ─── frame hashes ────────────────────────────────────────────────────────────

describe("frame hashes (pHash + dHash)", () => {
  test("identical rasters hash identically; unrelated rasters land near half the bits", () => {
    const a = blobRaster(1);
    expect(signatureSimilarity(frameSignature(0, a).hash, frameSignature(0, a).hash)).toBe(1);
    const distances: number[] = [];
    for (let s = 2; s < 30; s++) distances.push(hamming128(frameSignature(0, a).hash, frameSignature(0, blobRaster(s)).hash));
    const mean = distances.reduce((x, y) => x + y, 0) / distances.length;
    expect(mean).toBeGreaterThan(40);
  });

  test("a regrade (gain + offset) barely moves the hash", () => {
    const a = blobRaster(4);
    expect(signatureSimilarity(frameSignature(0, a).hash, frameSignature(0, regrade(a)).hash)).toBeGreaterThan(0.9);
  });

  test("a mirrored frame matches through its mirror signature, not its plain one", () => {
    const a = blobRaster(7);
    const flipped = frameSignature(0, mirrorRaster(a));
    const original = frameSignature(0, a);
    expect(signatureSimilarity(original.mirror, flipped.hash)).toBe(1);
    expect(signatureSimilarity(original.hash, flipped.hash)).toBeLessThan(0.85);
  });

  test("flat frames are flagged so black frames never match each other", () => {
    expect(frameSignature(0, new Uint8Array(GRID * GRID).fill(0)).flat).toBe(true);
    expect(frameSignature(0, blobRaster(3)).flat).toBe(false);
    expect(rasterStddev([10, 10, 10, 10])).toBe(0);
  });

  test("bit helpers", () => {
    expect(popcount32(0)).toBe(0);
    expect(popcount32(0xffffffff)).toBe(32);
    expect(popcount32(0b1011)).toBe(3);
    expect(pHash(blobRaster(5))).toHaveLength(2);
    expect(dHash(blobRaster(5))).toHaveLength(2);
  });
});

// ─── alignment + visual axis ─────────────────────────────────────────────────

describe("sequence alignment (material vs sequence)", () => {
  const eye = (n: number, perm: number[]) => perm.map((j) => {
    const row = new Float64Array(n);
    row[j] = 1;
    return row;
  });

  test("same order scores 1 on both", () => {
    expect(sequenceScore(eye(4, [0, 1, 2, 3]), 4)).toEqual({ score: 1, material: 1, sequence: 1 });
  });

  test("reversed order keeps the material but loses the sequence", () => {
    const r = sequenceScore(eye(4, [3, 2, 1, 0]), 4);
    expect(r.material).toBe(1);
    expect(r.sequence).toBe(0.25);
    expect(r.score).toBe(0.625);
  });

  test("many-to-one (a slowed or sped copy) still aligns", () => {
    expect(sequenceScore(eye(3, [0, 0, 1, 1, 2, 2]), 6).sequence).toBe(1);
  });

  test("compareVisual tries the mirrored orientation and skips flat frames", () => {
    const rasters = [1, 2, 3, 4].map(blobRaster);
    const base = rasters.map((r, i) => frameSignature(i, r));
    const mirrored = rasters.map((r, i) => frameSignature(i, mirrorRaster(r)));
    const black = frameSignature(9, new Uint8Array(GRID * GRID));
    const v = compareVisual([...mirrored, black], base)!;
    expect(v.mirrored).toBe(true);
    expect(v.score).toBe(1);
    expect(v.frames.subject).toBe(4);
    expect(compareVisual([black], base)).toBeNull();
  });
});

// ─── audio fingerprint ───────────────────────────────────────────────────────

describe("audio fingerprint (band-energy differences)", () => {
  const notes = [220, 330, 262, 392, 294, 440, 247, 349, 196, 523];
  const song = melody(notes, 0.5);

  test("the same track reads as the same audio; a gain change too", () => {
    const a = audioFingerprint(song);
    const b = audioFingerprint(song.map((v) => Math.round(v * 0.5)) as unknown as Int16Array);
    const axis = compareAudio(a, b)!;
    expect(axis.medianBer).toBeLessThan(0.1);
    expect(axis.score).toBeGreaterThan(0.85);
  });

  test("a trimmed copy is found at an offset", () => {
    const trimmed = song.subarray(Math.round(1.5 * AUDIO_SAMPLE_RATE));
    const blocks = matchAudioBlocks(audioFingerprint(trimmed), audioFingerprint(song));
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0]!.ber).toBeLessThan(0.15);
    expect(blocks[0]!.offset).toBeGreaterThan(30);
  });

  test("an unrelated melody does not match", () => {
    const other = melody([600, 610, 590, 700, 720, 680, 650, 640, 630, 615], 0.5);
    const axis = compareAudio(audioFingerprint(other), audioFingerprint(song))!;
    expect(axis.score).toBeLessThan(ORIGINALITY_THRESHOLDS.audio.similar);
  });

  test("silence is not a fingerprint", () => {
    expect(compareAudio(audioFingerprint(new Int16Array(AUDIO_SAMPLE_RATE * 4)), audioFingerprint(song))).toBeNull();
  });
});

// ─── script similarity ───────────────────────────────────────────────────────

describe("script similarity", () => {
  const script = "Stop buying cheap kettles. This one pours straight, heats in two minutes, and the handle never gets hot. Link in bio.";

  test("the same script reads 1; an unrelated one reads 0", () => {
    expect(compareScripts(script, script)!.containment).toBe(1);
    expect(compareScripts(script, "Here is how to repot a fern without killing the roots.")!.containment).toBe(0);
  });

  test("a hook rewrite keeps most of the body but drops the hook overlap", () => {
    const rewritten = "Your kettle is lying to you. This one pours straight, heats in two minutes, and the handle never gets hot. Link in bio.";
    const r = compareScripts(rewritten, script)!;
    expect(r.hook).toBe(0);
    expect(r.containment).toBeGreaterThan(0.6);
    expect(openingWords(rewritten)).toEqual(["your", "kettle", "is", "lying", "to", "you"]);
  });

  test("extracts cue text from SRT and VO fields from scenario JSON, never prompts", () => {
    expect(textFromSubtitles("1\n00:00:00,000 --> 00:00:01,000\nHello <b>there</b>\n\n2\n00:00:01,000 --> 00:00:02,000\nfriend")).toBe("Hello there friend");
    const text = textFromJson({
      hook: { vo: "Stop scrolling", type: "warning" },
      scenes: [{ vo_text: "Kettle pours straight", prompt: "a kettle on a marble counter, 35mm" }],
      cta: "Link in bio",
    });
    expect(text).toBe("Stop scrolling Kettle pours straight Link in bio");
  });
});

// ─── thresholds ──────────────────────────────────────────────────────────────

describe("verdict thresholds", () => {
  const axis = (score: number, material = score) => ({ score, material, sequence: score });

  test("visual at the duplicate threshold is a likely duplicate; just below is similar", () => {
    expect(decideVerdict({ visual: axis(0.85), audio: null, script: null }).verdict).toBe("likely-duplicate");
    expect(decideVerdict({ visual: axis(0.849), audio: null, script: null }).verdict).toBe("similar");
    expect(decideVerdict({ visual: axis(0.49, 0.49), audio: null, script: null }).verdict).toBe("original");
  });

  test("reused footage in a new order is similar through its material", () => {
    expect(decideVerdict({ visual: { score: 0.45, material: 0.6, sequence: 0.3 }, audio: null, script: null }).verdict).toBe("similar");
  });

  test("the same soundtrack over reused footage is a duplicate; over new footage it is similar", () => {
    expect(decideVerdict({ visual: axis(0.6), audio: axis(0.9), script: null }).verdict).toBe("likely-duplicate");
    expect(decideVerdict({ visual: axis(0.1), audio: axis(0.9), script: null }).verdict).toBe("similar");
  });

  test("the same script under new pictures is similar, never a duplicate; text-only pieces can be", () => {
    expect(decideVerdict({ visual: axis(0.1), audio: null, script: { score: 1, jaccard: 1, hook: 1 } }).verdict).toBe("similar");
    expect(decideVerdict({ visual: null, audio: null, script: { score: 0.95, jaccard: 0.9, hook: 1 } }).verdict).toBe("likely-duplicate");
    expect(decideVerdict({ visual: null, audio: null, script: { score: 0.5, jaccard: 0.4, hook: 0 } }).verdict).toBe("original");
  });

  test("compareFingerprints reports only the axes both sides carry", () => {
    const c = compareFingerprints(fp({ script: "one two three four five" }), fp({ script: "one two three four five" }));
    expect(c.axesCompared).toEqual(["script"]);
    expect(c.visual).toBeNull();
  });
});

// ─── variant planner ─────────────────────────────────────────────────────────

describe("variant planner — substance over cosmetics", () => {
  test("classifies substantive, cosmetic, and unknown labels (with aliases)", () => {
    expect(classifyAxis("hook")).toBe("substantive");
    expect(classifyAxis("B-roll")).toBe("substantive");
    expect(classifyAxis("mirror")).toBe("cosmetic");
    expect(classifyAxis("LUT")).toBe("cosmetic");
    expect(classifyAxis("music-bed")).toBe("unknown");
    expect(VARY_AXIS_MAP.hook).toBe("hook-rewrite");
  });

  test("cosmetic transforms never count toward uniqueness", () => {
    const cosmeticOnly = uniquenessOf(["mirror", "speed", "color-grade", "crop", "trim"]);
    expect(cosmeticOnly.substantive).toEqual([]);
    expect(cosmeticOnly.sufficient).toBe(false);
    const withCosmetic = uniquenessOf(["broll-swap", "vo-rerecord", "mirror"]);
    const without = uniquenessOf(["broll-swap", "vo-rerecord"]);
    expect(withCosmetic.sufficient).toBe(without.sufficient);
    expect(withCosmetic.channels).toEqual(without.channels);
  });

  test("a change that leaves the footage alone is not sufficient on its own", () => {
    expect(uniquenessOf(["hook-rewrite"]).sufficient).toBe(false);
    expect(uniquenessOf(["vo-rerecord"]).sufficient).toBe(false);
    expect(uniquenessOf(["broll-swap", "vo-rerecord"]).sufficient).toBe(true);
    expect(uniquenessOf(["structure-reorder"]).sufficient).toBe(true);
  });

  test("plans pairwise-distinct, sufficient axis sets deterministically", () => {
    const plan = planVariants({ baseId: "kettle", count: 5, cosmetic: ["lut"] });
    expect(plan.map((v) => v.variantId)).toEqual(["kettle-v1", "kettle-v2", "kettle-v3", "kettle-v4", "kettle-v5"]);
    const keys = plan.map((v) => v.changedAxes.join("+"));
    expect(new Set(keys).size).toBe(5);
    for (const v of plan) {
      expect(v.changedAxes.length).toBeGreaterThanOrEqual(2);
      expect(uniquenessOf(v.changedAxes).sufficient).toBe(true);
      expect(v.cosmeticLayer).toEqual(["color-grade"]);
      expect(v.changedAxes).not.toContain("color-grade");
    }
    expect(planVariants({ baseId: "kettle", count: 5, cosmetic: ["lut"] })).toEqual(plan);
  });

  test("refuses a cosmetic transform offered as a variation axis", () => {
    expect(() => planVariants({ baseId: "k", count: 2, axes: ["mirror", "speed"] })).toThrow(VariantPlanError);
    expect(() => planVariants({ baseId: "k", count: 2, axes: ["hook"], cosmetic: ["broll"] })).toThrow(VariantPlanError);
  });

  test("refuses when the pool cannot produce enough distinct substantive plans", () => {
    expect(() => planVariants({ baseId: "k", count: 4, axes: ["broll", "vo"] })).toThrow(/distinct substantive plans/u);
  });

  test("the matrix records each axis kind and the planned variants", () => {
    const variants = planVariants({ baseId: "k", count: 2, axes: ["broll", "vo", "hook"] });
    const m = buildVariantMatrix({ baseId: "k", axes: [{ axis: "broll-swap" }, { axis: "mirror" }, { axis: "music-bed" }], variants });
    expect(m.axes.map((a) => a.kind)).toEqual(["substantive", "cosmetic", "unknown"]);
    expect(m.variants).toHaveLength(2);
  });
});

// ─── tournament sibling gate ─────────────────────────────────────────────────

describe("tournament originality gate (injected sibling comparisons)", () => {
  const cand = (variantId: string, extra: Partial<TournamentCandidate> = {}): TournamentCandidate => ({
    variantId,
    mediaPath: `/tmp/${variantId}.mp4`,
    kind: "video",
    ...extra,
  });
  const scores = { a: 90, b: 80, c: 70 };
  // b duplicates a; c is a real re-edit.
  const sibling = async (x: TournamentCandidate, y: TournamentCandidate) =>
    x.variantId === "b" && y.variantId === "a"
      ? { verdict: "likely-duplicate" as const, visual: 0.97, audio: 1, script: null, reasons: "visual 97%: the same footage in the same order (mirrored)" }
      : { verdict: "similar" as const, visual: 0.6, audio: 0, script: null, reasons: "visual 60%: footage reused with re-edits" };

  test("a likely duplicate of a higher-ranked sibling is refused but preserved", async () => {
    const r = await runTournament({
      baseId: "farm",
      candidates: [cand("a", { changedAxes: ["broll-swap", "vo-rerecord"] }), cand("b", { changedAxes: ["layout-swap", "script-rewrite"] }), cand("c")],
      scoreFn: manualScorer(scores),
      siblingCheck: sibling,
    });
    expect(r.champion!.variantId).toBe("a");
    expect(r.emitted).toEqual(["a", "c"]);
    expect(r.refused).toEqual([
      { variantId: "b", reason: "duplicate-of-sibling", sibling: "a", detail: "visual 97%: the same footage in the same order (mirrored)", overrideReason: null },
    ]);
    expect(r.ranked.map((e) => e.variantId)).toEqual(["a", "b", "c"]);
    expect(r.losers.find((l) => l.variantId === "b")!.rationale).toContain("Refused (duplicate-of-sibling of a)");
    expect(r.originality.checked).toBe(true);
    expect(r.originality.comparisons.map((c) => `${c.variantId}>${c.sibling}`)).toEqual(["b>a", "c>a"]);
    expect(r.ranked[0]!.changedAxes).toEqual(["broll-swap", "vo-rerecord"]);
    expect(() => parseTournamentResult(r)).not.toThrow();
  });

  test("an override emits the variant and records the reason", async () => {
    const r = await runTournament({
      candidates: [cand("a"), cand("b"), cand("c")],
      scoreFn: manualScorer(scores),
      siblingCheck: sibling,
      allowDuplicates: { b: "music-bed A/B only; one ships" },
    });
    expect(r.emitted).toEqual(["a", "b", "c"]);
    expect(r.refused).toEqual([]);
    expect(r.overrides[0]).toMatchObject({ variantId: "b", reason: "duplicate-of-sibling", overrideReason: "music-bed A/B only; one ships" });
  });

  test("a variant that only carries cosmetic changes is refused even without media checks", async () => {
    const r = await runTournament({
      candidates: [cand("a", { changedAxes: ["broll-swap", "vo-rerecord"] }), cand("b", { cosmeticLayer: ["mirror", "speed"] })],
      scoreFn: manualScorer({ a: 50, b: 99 }),
    });
    expect(r.refused.map((x) => [x.variantId, x.reason])).toEqual([["b", "cosmetic-only"]]);
    expect(r.champion!.variantId).toBe("a");
    expect(r.originality.checked).toBe(false);
  });

  test("an unreadable sibling is reported as unchecked, not refused", async () => {
    const r = await runTournament({
      candidates: [cand("a"), cand("b")],
      scoreFn: manualScorer({ a: 2, b: 1 }),
      siblingCheck: async () => ({ error: "cannot read media" }),
    });
    expect(r.emitted).toEqual(["a", "b"]);
    expect(r.originality.unchecked).toEqual([{ variantId: "b", reason: "cannot read media" }]);
  });
});

// ─── decision ledger fields ──────────────────────────────────────────────────

describe("decision ledger records what a variant changed", () => {
  test("derives changed_axes and cosmetic_layer from the variant scenario", () => {
    const derived = deriveDecisions({
      scenario: { variant_axis: "hook", variant_changed_axes: ["vo-rerecord", "broll-swap"], variant_cosmetic_layer: "color-grade" },
    });
    expect(derived.changed_axes).toEqual({ value: ["broll-swap", "vo-rerecord"], source: "project:scenario.json#variant_changed_axes" });
    expect(derived.cosmetic_layer!.value).toEqual(["color-grade"]);
    expect(derived.variant_axis!.value).toBe("hook");
  });

  test("--set changed_axes is a set even with one value", () => {
    expect(parseLedgerAssignment("changed_axes=broll-swap")).toEqual({ key: "changed_axes", value: ["broll-swap"] });
  });
});
