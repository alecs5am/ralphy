// Colour-difference keyer math and graph (issue #560). Pure: no ffmpeg.

import { describe, expect, test } from "bun:test";
import {
  alphaFor,
  chromaKeyGraph,
  DEFAULT_HIGH_FRAC,
  DEFAULT_LOW_FRAC,
  estimateScreen,
  isChromaScreen,
  keyThresholds,
  MIN_SCREEN_STRENGTH,
} from "../../cli/lib/matte/chroma.js";

/** A w x h RGB24 frame filled with `bg`, with a `fg` rectangle in the middle. */
function frame(w: number, h: number, bg: [number, number, number], fg?: [number, number, number], inset = 0): Uint8Array {
  const buf = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = fg && x >= inset && x < w - inset && y >= inset && y < h - inset;
      const c = inside ? fg! : bg;
      buf.set(c, (y * w + x) * 3);
    }
  }
  return buf;
}

describe("estimateScreen", () => {
  test("reads a green screen from the frame border and ignores the subject", () => {
    const est = estimateScreen(frame(32, 48, [2, 175, 58], [210, 160, 140], 6), 32, 48)!;
    expect(est.screen).toBe("green");
    expect(est.rgb).toEqual([2, 175, 58]);
    expect(est.strength).toBe(175 - 58);
    expect(est.coverage).toBe(1);
  });

  test("detects a blue screen", () => {
    const est = estimateScreen(frame(32, 32, [20, 60, 200]), 32, 32)!;
    expect(est.screen).toBe("blue");
    expect(est.strength).toBe(200 - 60);
  });

  test("a subject touching the border does not drag the strength down", () => {
    // Left third of the frame is skin (subject reaching the edge), the rest is screen.
    const w = 30, h = 30;
    const buf = frame(w, h, [2, 175, 58]);
    for (let y = 0; y < h; y++) for (let x = 0; x < 10; x++) buf.set([210, 160, 140], (y * w + x) * 3);
    const est = estimateScreen(buf, w, h)!;
    expect(est.strength).toBe(117);
    expect(est.coverage).toBeLessThan(1);
    expect(est.coverage).toBeGreaterThan(0.5);
  });

  test("footage without a screen reports strength below the floor", () => {
    const est = estimateScreen(frame(32, 32, [120, 110, 100]), 32, 32)!;
    expect(est.strength).toBeLessThan(MIN_SCREEN_STRENGTH);
  });

  test("a small green prop at the edge is not a screen", () => {
    // Only the top-left 4x4 corner is green; the rest of the border is a grey room.
    const w = 32, h = 32;
    const buf = frame(w, h, [120, 110, 100]);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) buf.set([2, 175, 58], (y * w + x) * 3);
    const est = estimateScreen(buf, w, h)!;
    expect(est.strength).toBeGreaterThanOrEqual(MIN_SCREEN_STRENGTH);
    expect(isChromaScreen(est)).toBe(false);
    expect(isChromaScreen(estimateScreen(frame(w, h, [2, 175, 58]), w, h)!)).toBe(true);
  });

  test("forced screen colour wins over auto detection", () => {
    const est = estimateScreen(frame(16, 16, [2, 175, 58]), 16, 16, { screen: "blue" })!;
    expect(est.screen).toBe("blue");
  });

  test("rejects an undersized buffer", () => {
    expect(estimateScreen(new Uint8Array(10), 16, 16)).toBeNull();
  });
});

describe("keyThresholds", () => {
  test("scale with the screen strength by default", () => {
    expect(keyThresholds(117)).toEqual({ low: Math.round(117 * DEFAULT_LOW_FRAC), high: Math.round(117 * DEFAULT_HIGH_FRAC) });
  });

  test("explicit values win and stay ordered", () => {
    expect(keyThresholds(117, { low: 30, high: 95 })).toEqual({ low: 30, high: 95 });
    expect(keyThresholds(117, { low: 200, high: 100 })).toEqual({ low: 200, high: 201 });
  });

  test("a weak screen is floored so the ramp never collapses", () => {
    const t = keyThresholds(3);
    expect(t.high).toBeGreaterThan(t.low);
    expect(t.high).toBe(Math.round(MIN_SCREEN_STRENGTH * DEFAULT_HIGH_FRAC));
  });
});

describe("alphaFor", () => {
  const t = { low: 12, high: 106 };
  test("subject opaque, screen transparent, linear in between", () => {
    expect(alphaFor(-40, t)).toBe(255);
    expect(alphaFor(0, t)).toBe(255);
    expect(alphaFor(12, t)).toBe(255);
    expect(alphaFor(106, t)).toBe(0);
    expect(alphaFor(200, t)).toBe(0);
    expect(alphaFor(59, t)).toBeCloseTo(127.5, 5);
  });
});

describe("chromaKeyGraph", () => {
  const thresholds = { low: 12, high: 106 };

  test("green: key on G, despill G against max(R, B), rebuild gbrap in G,B,R,A order", () => {
    const g = chromaKeyGraph({ screen: "green", thresholds, despill: "max" });
    // extractplanes emits r, g, b in flag order regardless of listing.
    expect(g).toContain("extractplanes=r+g+b[pr][pg][pb]");
    expect(g).toContain("[pg]split[k1][k2]");
    expect(g).toContain("lut=c0='clip(255*(106-val)/94,0,255)'");
    expect(g).toContain("[k2][mx2]blend=all_mode=darken[kd]");
    expect(g).toContain("[kd][o2b][o1b][alpha]mergeplanes=mapping=0x00102030:format=gbrap[keyed]");
  });

  test("blue: key on B, G and R are the other channels", () => {
    const g = chromaKeyGraph({ screen: "blue", thresholds, despill: "max", outputLabel: "out" });
    expect(g).toContain("[pb]split[k1][k2]");
    expect(g).toContain("[pr]split[o1a][o1b]");
    expect(g).toContain("[pg]split[o2a][o2b]");
    // gbrap order: G (o2), B (key), R (o1).
    expect(g).toContain("[o2b][kd][o1b][alpha]mergeplanes");
    expect(g.endsWith("[out]")).toBe(true);
  });

  test("despill avg and off keep every split output consumed", () => {
    const avg = chromaKeyGraph({ screen: "green", thresholds, despill: "avg" });
    expect(avg).toContain("blend=all_mode=average[avg]");
    expect(avg).toContain("[mx2]nullsink");
    expect(avg).toContain("[kd][o2d][o1d][alpha]");
    const off = chromaKeyGraph({ screen: "green", thresholds, despill: "off" });
    expect(off).toContain("[k2]null[kd]");
    expect(off).toContain("[mx2]nullsink");
  });

  test("choke and soften shape the matte only", () => {
    const g = chromaKeyGraph({ screen: "green", thresholds, despill: "max", choke: 2, soften: 1.5 });
    expect(g.match(/,erosion/g)?.length).toBe(2);
    expect(g).toContain(",gblur=sigma=1.5[alpha]");
    const grow = chromaKeyGraph({ screen: "green", thresholds, despill: "max", choke: -3 });
    expect(grow.match(/,dilation/g)?.length).toBe(3);
  });

  test("refuses an empty ramp", () => {
    expect(() => chromaKeyGraph({ screen: "green", thresholds: { low: 50, high: 50 }, despill: "max" })).toThrow();
  });
});
