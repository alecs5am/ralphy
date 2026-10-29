// HyperFrames track runtime math (issue #559): interpolation, mapping, corner
// pin, and determinism under out-of-order seeks. The runtime is a plain
// browser script, so the test evaluates the exact text `ralphy track helper`
// installs.

import { describe, expect, test } from "bun:test";
import runtimeSource from "../../cli/lib/track/ralphy-track.js" with { type: "text" };

type Vec2 = [number, number];
type Key = { t: number; x: number; y: number; confidence: number; lost: boolean; corners?: Vec2[]; box?: number[] };
type Track = { kind: string; source: { width: number; height: number }; keyframes: Key[] };
type Mapping = { box: [number, number, number, number]; fit: string };
type Runtime = {
  version: string;
  fitTransform(w: number, h: number, mapping?: Mapping): { sx: number; sy: number; ox: number; oy: number };
  sample(track: Track, t: number, opts?: Record<string, unknown>): { x: number; y: number; corners?: Vec2[] };
  homography(src: Vec2[], dst: Vec2[]): number[];
  applyHomography(h: number[], p: Vec2): Vec2;
  cornerPinMatrix3d(w: number, h: number, quad: Vec2[]): string;
  expandQuad(quad: Vec2[], d: number): Vec2[];
  follow(tl: FakeTimeline, el: FakeEl, track: Track, opts?: Record<string, unknown>): { duration: number };
  cornerPin(tl: FakeTimeline, el: FakeEl, track: Track, opts?: Record<string, unknown>): { duration: number };
};

function loadRuntime(): Runtime {
  const win: { RalphyTrack?: Runtime } = {};
  new Function("window", runtimeSource)(win);
  if (!win.RalphyTrack) throw new Error("runtime did not register window.RalphyTrack");
  return win.RalphyTrack;
}

type Tween = { target: { c: number }; vars: { c: number; duration: number; onUpdate: () => void }; position: number };
class FakeTimeline {
  tweens: Tween[] = [];
  to(target: { c: number }, vars: Tween["vars"], position: number) {
    this.tweens.push({ target, vars, position });
    return this;
  }
  /** What GSAP does on totalTime(t, false) for a linear tween on a proxy. */
  seek(t: number) {
    for (const tw of this.tweens) {
      const local = Math.min(Math.max(t - tw.position, 0), tw.vars.duration);
      tw.target.c = (local / tw.vars.duration) * tw.vars.c;
      tw.vars.onUpdate();
    }
  }
}
type FakeEl = { style: Record<string, string>; offsetWidth: number; offsetHeight: number };
const el = (w = 0, h = 0): FakeEl => ({ style: {}, offsetWidth: w, offsetHeight: h });

const RT = loadRuntime();

function pointTrack(): Track {
  return {
    kind: "point",
    source: { width: 1000, height: 500 },
    keyframes: [
      { t: 0, x: 100, y: 100, confidence: 1, lost: false },
      { t: 1, x: 200, y: 300, confidence: 1, lost: false },
      { t: 2, x: 999, y: 999, confidence: 0.05, lost: true },
      { t: 3, x: 400, y: 100, confidence: 0.9, lost: false },
    ],
  };
}

/** Apply a CSS matrix3d (column-major) with transform-origin 0 0 to a 2D point. */
function applyCssMatrix3d(css: string, p: Vec2): Vec2 {
  const m = css.replace(/^matrix3d\(|\)$/g, "").split(",").map(Number);
  const x = m[0]! * p[0] + m[4]! * p[1] + m[12]!;
  const y = m[1]! * p[0] + m[5]! * p[1] + m[13]!;
  const w = m[3]! * p[0] + m[7]! * p[1] + m[15]!;
  return [x / w, y / w];
}

describe("RalphyTrack.sample (interpolation)", () => {
  test("linear between neighbours", () => {
    const s = RT.sample(pointTrack(), 0.25);
    expect(s.x).toBeCloseTo(125, 9);
    expect(s.y).toBeCloseTo(150, 9);
  });

  test("holds the first key before the track and the last key after it", () => {
    expect(RT.sample(pointTrack(), -5)).toMatchObject({ x: 100, y: 100 });
    expect(RT.sample(pointTrack(), 99)).toMatchObject({ x: 400, y: 100 });
  });

  test("lost keyframes are skipped: the gap is bridged between good keys", () => {
    const s = RT.sample(pointTrack(), 2);
    expect(s.x).toBeCloseTo(300, 9);
    expect(s.y).toBeCloseTo(200, 9);
  });

  test("minConfidence promotes weak keys to lost", () => {
    const s = RT.sample(pointTrack(), 3, { minConfidence: 0.95 });
    expect(s).toMatchObject({ x: 200, y: 300 });
  });

  test("smooth averages neighbouring keys", () => {
    const s = RT.sample(pointTrack(), 1, { smooth: 1 });
    expect(s.x).toBeCloseTo((100 + 200 + 400) / 3, 9);
  });

  test("planar corners interpolate per corner", () => {
    const track: Track = {
      kind: "planar",
      source: { width: 100, height: 100 },
      keyframes: [
        { t: 0, x: 5, y: 5, confidence: 1, lost: false, corners: [[0, 0], [10, 0], [10, 10], [0, 10]] },
        { t: 1, x: 25, y: 5, confidence: 1, lost: false, corners: [[20, 0], [30, 0], [30, 10], [20, 10]] },
      ],
    };
    expect(RT.sample(track, 0.5).corners).toEqual([[10, 0], [20, 0], [20, 10], [10, 10]]);
  });

  test("a track with no usable keyframes throws", () => {
    const t = pointTrack();
    t.keyframes.forEach((k) => (k.lost = true));
    expect(() => RT.sample(t, 0)).toThrow(/no usable keyframes/);
  });
});

describe("RalphyTrack.fitTransform (source px -> composition px)", () => {
  test("identity without a mapping", () => {
    expect(RT.fitTransform(1920, 1080)).toEqual({ sx: 1, sy: 1, ox: 0, oy: 0 });
  });
  test("cover crops a 16:9 source into a 9:16 frame", () => {
    const m = RT.fitTransform(1920, 1080, { box: [0, 0, 1080, 1920], fit: "cover" });
    expect(m.sx).toBeCloseTo(1920 / 1080, 9);
    expect(m.ox).toBeCloseTo((1080 - 1920 * (1920 / 1080)) / 2, 9);
    expect(m.oy).toBeCloseTo(0, 9);
  });
  test("contain letterboxes and honours the box offset", () => {
    const m = RT.fitTransform(1000, 500, { box: [100, 50, 500, 500], fit: "contain" });
    expect(m).toEqual({ sx: 0.5, sy: 0.5, ox: 100, oy: 50 + 125 });
  });
  test("fill scales axes independently", () => {
    expect(RT.fitTransform(1000, 500, { box: [0, 0, 500, 500], fit: "fill" })).toEqual({ sx: 0.5, sy: 1, ox: 0, oy: 0 });
  });
});

describe("corner pin math", () => {
  const quad: Vec2[] = [[120, 80], [530, 110], [500, 420], [90, 380]];

  test("homography maps the four source corners onto the quad", () => {
    const src: Vec2[] = [[0, 0], [640, 0], [640, 480], [0, 480]];
    const h = RT.homography(src, quad);
    src.forEach((p, i) => {
      const q = RT.applyHomography(h, p);
      expect(q[0]).toBeCloseTo(quad[i]![0], 6);
      expect(q[1]).toBeCloseTo(quad[i]![1], 6);
    });
  });

  test("matrix3d sends element corners to the quad (CSS column-major math)", () => {
    const css = RT.cornerPinMatrix3d(640, 480, quad);
    expect(css.startsWith("matrix3d(")).toBe(true);
    const corners: Vec2[] = [[0, 0], [640, 0], [640, 480], [0, 480]];
    corners.forEach((p, i) => {
      const q = applyCssMatrix3d(css, p);
      expect(q[0]).toBeCloseTo(quad[i]![0], 4);
      expect(q[1]).toBeCloseTo(quad[i]![1], 4);
    });
  });

  test("identity quad gives the identity matrix", () => {
    expect(RT.cornerPinMatrix3d(100, 50, [[0, 0], [100, 0], [100, 50], [0, 50]])).toBe(
      "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)",
    );
  });

  test("a degenerate quad throws", () => {
    expect(() => RT.homography([[0, 0], [1, 0], [1, 1], [0, 1]], [[0, 0], [0, 0], [0, 0], [0, 0]])).toThrow(/degenerate/);
  });

  test("expandQuad grows a square symmetrically", () => {
    const g = RT.expandQuad([[0, 0], [10, 0], [10, 10], [0, 10]], 2);
    expect(g[0]![0]).toBeCloseTo(-2, 9);
    expect(g[0]![1]).toBeCloseTo(-2, 9);
    expect(g[2]![0]).toBeCloseTo(12, 9);
  });
});

describe("timeline attachment (deterministic under seek)", () => {
  test("follow writes a pure function of time regardless of seek order", () => {
    const tl = new FakeTimeline();
    const pin = el(40, 20);
    const res = RT.follow(tl, pin, pointTrack(), { mapping: { box: [0, 0, 500, 250], fit: "fill" }, offset: [5, 0] });
    expect(res.duration).toBeCloseTo(3, 9);
    expect(tl.tweens).toHaveLength(1);
    // Initial render happens at construction (frame 0 before any seek).
    expect(pin.style.transform).toBe("translate(35px, 40px)");
    tl.seek(0.5);
    const at05 = pin.style.transform;
    tl.seek(2.7);
    tl.seek(0.1);
    tl.seek(0.5);
    expect(pin.style.transform).toBe(at05);
    // x: lerp(100,200,0.5)=150 * 0.5 - 20 + 5 = 60; y: 200 * 0.5 - 10 = 90
    expect(at05).toBe("translate(60px, 90px)");
  });

  test("clipStart and mediaStart shift composition time into source time", () => {
    const tl = new FakeTimeline();
    const pin = el();
    RT.follow(tl, pin, pointTrack(), { clipStart: 2, mediaStart: 1, anchor: [0, 0] });
    tl.seek(2); // source time 1
    expect(pin.style.transform).toBe("translate(200px, 300px)");
  });

  test("hideWhenLost hides the element inside a lost stretch only", () => {
    const tl = new FakeTimeline();
    const pin = el();
    RT.follow(tl, pin, pointTrack(), { anchor: [0, 0], hideWhenLost: true });
    tl.seek(2.1);
    expect(pin.style.opacity).toBe("0");
    tl.seek(0.5);
    expect(pin.style.opacity).toBe("");
  });

  test("cornerPin sets size, origin, and a matrix that lands on the sampled quad", () => {
    const track: Track = {
      kind: "planar",
      source: { width: 1000, height: 1000 },
      keyframes: [
        { t: 0, x: 0, y: 0, confidence: 1, lost: false, corners: [[100, 100], [300, 120], [290, 400], [90, 380]] },
        { t: 1, x: 0, y: 0, confidence: 1, lost: false, corners: [[200, 100], [400, 120], [390, 400], [190, 380]] },
      ],
    };
    const tl = new FakeTimeline();
    const screen = el();
    RT.cornerPin(tl, screen, track, { size: [400, 300] });
    expect(screen.style.transformOrigin).toBe("0 0");
    expect(screen.style.width).toBe("400px");
    tl.seek(0.5);
    const tlCorner = applyCssMatrix3d(screen.style.transform!, [0, 0]);
    const brCorner = applyCssMatrix3d(screen.style.transform!, [400, 300]);
    expect(tlCorner[0]).toBeCloseTo(150, 4);
    expect(tlCorner[1]).toBeCloseTo(100, 4);
    expect(brCorner[0]).toBeCloseTo(340, 4);
    expect(brCorner[1]).toBeCloseTo(400, 4);
  });

  test("cornerPin refuses a point track", () => {
    expect(() => RT.cornerPin(new FakeTimeline(), el(10, 10), pointTrack(), {})).toThrow(/planar/);
  });
});
