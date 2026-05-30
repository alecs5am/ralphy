// Unit: STORYBOARD.md beat → timestamp parser (#028).

import { describe, test, expect } from "bun:test";
import {
  parseStoryboardBeats,
  parseScenarioBeats,
} from "../../cli/lib/render/storyboard-beats.js";

describe("parseStoryboardBeats", () => {
  test("picks up canonical `### Scene 01 — HOOK (0.00–1.80s · 54f)` headers", () => {
    const md = `
# Some title

### Scene 01 — HOOK / ENTRANCE (0.00–1.80s · 54f)
some prose

### Scene 02 — MACRO TEASE (1.80–3.60s · 54f)
more prose

### Scene 03b — INSERT (5.60–6.40s · 24f)
even more prose
`;
    const beats = parseStoryboardBeats(md);
    expect(beats).toHaveLength(3);
    expect(beats[0]).toEqual({ id: "scene-01", startSec: 0, endSec: 1.8 });
    expect(beats[1]).toEqual({ id: "scene-02", startSec: 1.8, endSec: 3.6 });
    expect(beats[2]).toEqual({ id: "scene-03b", startSec: 5.6, endSec: 6.4 });
  });

  test("accepts ASCII hyphen and em-dash ranges", () => {
    const md = `
## Scene 1 (0-2 s)
## Scene 2 (2—4 s)
`;
    const beats = parseStoryboardBeats(md);
    expect(beats).toHaveLength(2);
    expect(beats[0]?.startSec).toBe(0);
    expect(beats[0]?.endSec).toBe(2);
    expect(beats[1]?.startSec).toBe(2);
    expect(beats[1]?.endSec).toBe(4);
  });

  test("skips headers without a (a–b s) range", () => {
    const md = `
### Scene 01 — no timing here
### Scene 02 — (no seconds either)
### Scene 03 — (1.0–3.0s)
`;
    const beats = parseStoryboardBeats(md);
    expect(beats).toHaveLength(1);
    expect(beats[0]?.id).toBe("scene-03");
  });

  test("ignores invalid ranges (end <= start)", () => {
    const md = `
### Scene 01 (5.0–5.0s)
### Scene 02 (4.0–3.0s)
### Scene 03 (1.0–2.0s)
`;
    const beats = parseStoryboardBeats(md);
    expect(beats).toHaveLength(1);
    expect(beats[0]?.id).toBe("scene-03");
  });
});

describe("parseScenarioBeats", () => {
  test("handles a `scenes` array with startSec / endSec", () => {
    const beats = parseScenarioBeats({
      scenes: [
        { id: "scene-01", startSec: 0, endSec: 4 },
        { id: "scene-02", startSec: 4, endSec: 18 },
      ],
    });
    expect(beats).toHaveLength(2);
    expect(beats[1]).toEqual({ id: "scene-02", startSec: 4, endSec: 18 });
  });

  test("derives endSec from durationSec when absent", () => {
    const beats = parseScenarioBeats({
      scenes: [{ id: "scene-01", startSec: 2, durationSec: 3 }],
    });
    expect(beats).toHaveLength(1);
    expect(beats[0]?.endSec).toBe(5);
  });

  test("handles a `scenes` record keyed by scene id", () => {
    const beats = parseScenarioBeats({
      scenes: {
        "scene-01": { startSec: 0, endSec: 4 },
        "scene-02": { startSec: 4, endSec: 18 },
      },
    });
    expect(beats).toHaveLength(2);
    const ids = beats.map((b) => b.id).sort();
    expect(ids).toEqual(["scene-01", "scene-02"]);
  });

  test("returns [] for missing / malformed scenarios", () => {
    expect(parseScenarioBeats(null)).toEqual([]);
    expect(parseScenarioBeats({})).toEqual([]);
    expect(parseScenarioBeats({ scenes: "not-an-object" })).toEqual([]);
    expect(parseScenarioBeats({ scenes: [{ id: "x" }] })).toEqual([]);
  });
});
