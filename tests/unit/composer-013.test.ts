// Unit tests for the timeline-aware composer (#013).
//
// Pure-function coverage:
//   - mutateTimelineRemoveSegment re-flows VO + caption offsets (the
//     "structural edit auto-reflows everything" promise).
//   - buildFilterGraph produces a syntactically valid graph (no
//     label collisions, no single-letter labels per #011).
//   - normalizeCaptions tolerates the Remotion / snake_case / seconds shapes.

import { afterEach, describe, test, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildTimelineFromInputs,
  buildFilterGraph,
  checkFilterGraph,
  mutateTimelineRemoveSegment,
  normalizeCaptions,
  renderTimeline,
  type Timeline,
} from "../../cli/lib/composer.js";
import { spawnSyncInDirectory } from "../../cli/lib/render/descriptor-launch.js";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

// Helper: a 3-segment timeline with VO + captions + music. Numbers are
// intentionally simple so the re-flow assertions read as plain arithmetic.
function fixtureTimeline(): Timeline {
  return {
    segments: [
      { slot: "scene-01-vid", clip_path: "/p/s1.mp4", trim_in_s: 0, trim_out_s: 4, duration_s: 4, transition: "hard-cut" },
      { slot: "scene-02-vid", clip_path: "/p/s2.mp4", trim_in_s: 0, trim_out_s: 6, duration_s: 6, transition: "hard-cut" },
      { slot: "scene-03-vid", clip_path: "/p/s3.mp4", trim_in_s: 0, trim_out_s: 5, duration_s: 5, transition: "hard-cut" },
    ],
    vo_track: {
      // One VO clip per scene window: scene-01 @ 0s, scene-02 @ 4s, scene-03 @ 10s.
      clips: [
        { path: "/p/vo1.mp3", start_at_s: 0 },
        { path: "/p/vo2.mp3", start_at_s: 4 },
        { path: "/p/vo3.mp3", start_at_s: 10 },
      ],
    },
    captions_track: [
      { phrase: "hook", start_ms: 200, end_ms: 1200 },
      { phrase: "intro", start_ms: 4500, end_ms: 5500 },
      { phrase: "payoff", start_ms: 11000, end_ms: 12500 },
    ],
    music_track: { path: "/p/music.mp3", volume: 0.6, fade_in_ms: 500, fade_out_ms: 1000 },
    total_duration_s: 15,
  };
}

describe("mutateTimelineRemoveSegment (#013)", () => {
  test("removing middle segment shifts later segments + VO + captions by its duration", () => {
    const before = fixtureTimeline();
    const after = mutateTimelineRemoveSegment(before, "scene-02-vid");

    // Segments: scene-02 dropped, segment count -1.
    expect(after.segments.map((s) => s.slot)).toEqual(["scene-01-vid", "scene-03-vid"]);
    expect(after.total_duration_s).toBe(9); // 4 + 5

    // VO: the scene-02 clip (@4s) lived inside the dropped window [4,10) → dropped.
    //     The scene-03 clip (@10s) shifts left by 6s → 4s.
    const voStarts = after.vo_track.clips.map((c) => c.start_at_s);
    expect(voStarts).toEqual([0, 4]);

    // Captions: "intro" @ 4500ms lived inside [4000,10000) → dropped.
    //           "payoff" @ 11000ms → shifts to 5000ms; end shifts too.
    const capByPhrase = Object.fromEntries(after.captions_track.map((c) => [c.phrase, c]));
    expect(capByPhrase.hook).toEqual({ phrase: "hook", start_ms: 200, end_ms: 1200 });
    expect(capByPhrase.intro).toBeUndefined();
    expect(capByPhrase.payoff).toEqual({ phrase: "payoff", start_ms: 5000, end_ms: 6500 });
  });

  test("removing first segment shifts everything left, drops VO/caption inside its window", () => {
    const after = mutateTimelineRemoveSegment(fixtureTimeline(), "scene-01-vid");

    expect(after.segments.map((s) => s.slot)).toEqual(["scene-02-vid", "scene-03-vid"]);
    expect(after.total_duration_s).toBe(11); // 6 + 5

    // VO @ 0s → dropped, @4s → 0s, @10s → 6s.
    expect(after.vo_track.clips.map((c) => c.start_at_s)).toEqual([0, 6]);

    // Caption "hook" @ 200ms (inside [0,4000)) → dropped.
    const phrases = after.captions_track.map((c) => c.phrase);
    expect(phrases).not.toContain("hook");
    expect(phrases).toContain("intro");
    expect(phrases).toContain("payoff");
  });

  test("removing last segment only shortens total — earlier offsets unchanged", () => {
    const after = mutateTimelineRemoveSegment(fixtureTimeline(), "scene-03-vid");
    expect(after.segments.map((s) => s.slot)).toEqual(["scene-01-vid", "scene-02-vid"]);
    expect(after.total_duration_s).toBe(10);
    // VO @ 0 and @ 4 stay; @ 10 (inside [10,15)) drops.
    expect(after.vo_track.clips.map((c) => c.start_at_s)).toEqual([0, 4]);
    // "payoff" was @11000 (inside [10000,15000)) → drops.
    expect(after.captions_track.map((c) => c.phrase)).toEqual(["hook", "intro"]);
  });

  test("unknown slot → returns input unchanged (no-op, agent surfaces it)", () => {
    const before = fixtureTimeline();
    const after = mutateTimelineRemoveSegment(before, "scene-99-does-not-exist");
    expect(after).toEqual(before);
  });

  test("is a pure function — does not mutate inputs", () => {
    const before = fixtureTimeline();
    const snapshot = JSON.parse(JSON.stringify(before));
    mutateTimelineRemoveSegment(before, "scene-02-vid");
    expect(before).toEqual(snapshot);
  });
});

describe("buildFilterGraph (#013)", () => {
  test("emits a syntactically valid graph with multi-char labels (#011 lesson)", () => {
    const g = buildFilterGraph(fixtureTimeline());
    const check = checkFilterGraph(g.filter);
    expect(check.issues).toEqual([]);
    expect(check.ok).toBe(true);
    // No single-letter sink labels.
    expect(g.filter).not.toMatch(/\[v\](?!:)/);
    expect(g.filter).not.toMatch(/\[m\](?!:)/);
    expect(g.filter).not.toMatch(/\[a\](?!:)/);
    // Required canonical labels present.
    expect(g.filter).toContain("[vmain]");
    expect(g.filter).toContain("[amain]");
    expect(g.filter).toContain("[music]");
    expect(g.filter).toContain("[mducked]");
    expect(g.filter).toContain("[vout]");
    expect(g.filter).toContain("[aout]");
  });

  test("input order: segments first, then music, then VO clips", () => {
    const g = buildFilterGraph(fixtureTimeline());
    expect(g.inputOrder).toEqual([
      "/p/s1.mp4",
      "/p/s2.mp4",
      "/p/s3.mp4",
      "/p/music.mp3",
      "/p/vo1.mp3",
      "/p/vo2.mp3",
      "/p/vo3.mp3",
    ]);
  });

  test("each segment gets a 50ms in/out audio fade — anti-click invariant", () => {
    const g = buildFilterGraph(fixtureTimeline());
    // afade=t=in:st=0:d=0.05 appears once per segment.
    const inFades = g.filter.match(/afade=t=in:st=0:d=0\.05/g) ?? [];
    expect(inFades.length).toBe(3);
    // afade=t=out:st=<duration-0.05>:d=0.05 for each segment.
    expect(g.filter).toMatch(/afade=t=out:st=3\.950:d=0\.05/); // seg 0 (4s)
    expect(g.filter).toMatch(/afade=t=out:st=5\.950:d=0\.05/); // seg 1 (6s)
    expect(g.filter).toMatch(/afade=t=out:st=4\.950:d=0\.05/); // seg 2 (5s)
  });

  test("concat step emits the right segment count", () => {
    const g = buildFilterGraph(fixtureTimeline());
    expect(g.filter).toContain("concat=n=3:v=1:a=1");
  });

  test("VO clips use adelay with stereo-safe `N|N` form", () => {
    const g = buildFilterGraph(fixtureTimeline());
    expect(g.filter).toContain("adelay=0|0");
    expect(g.filter).toContain("adelay=4000|4000");
    expect(g.filter).toContain("adelay=10000|10000");
  });

  test("music gets sidechain compression keyed by the VO+bed bus", () => {
    const g = buildFilterGraph(fixtureTimeline());
    expect(g.filter).toContain("sidechaincompress=threshold=0.05:ratio=8:attack=10:release=250[mducked]");
    expect(g.filter).toContain("loudnorm=I=-16:TP=-1.5:LRA=11[aout]");
  });

  test("after removing a segment, the rebuilt graph re-flows VO offsets in adelay", () => {
    const t = mutateTimelineRemoveSegment(fixtureTimeline(), "scene-02-vid");
    const g = buildFilterGraph(t);
    // VO @ 0 stays, scene-03 VO shifted from 10s → 4s.
    expect(g.filter).toContain("adelay=0|0");
    expect(g.filter).toContain("adelay=4000|4000");
    expect(g.filter).not.toContain("adelay=10000|10000");
    // Music fade-out anchors against the new total duration (9s - 1s = 8s).
    expect(g.filter).toMatch(/afade=t=out:st=8\.000:d=1/);
  });

  test("no music → no [music] / [mducked] / [premix] labels", () => {
    const t = fixtureTimeline();
    t.music_track = { volume: 0.6 }; // strip music
    const g = buildFilterGraph(t);
    expect(g.filter).not.toContain("[music]");
    expect(g.filter).not.toContain("[mducked]");
    expect(g.filter).not.toContain("[premix]");
    // Loudnorm still runs against the VO+bed bus.
    expect(g.filter).toContain("loudnorm=I=-16");
  });

  test("throws on empty timeline (caller should never reach this)", () => {
    const empty: Timeline = {
      segments: [],
      vo_track: { clips: [] },
      captions_track: [],
      music_track: { volume: 0.6 },
      total_duration_s: 0,
    };
    expect(() => buildFilterGraph(empty)).toThrow();
  });
});

describe("checkFilterGraph (#013)", () => {
  test("flags duplicate sink labels", () => {
    const bad = "[0:a]volume=1[mixed];[1:a]volume=1[mixed]";
    const r = checkFilterGraph(bad);
    expect(r.ok).toBe(false);
    expect(r.issues.join("\n")).toContain("duplicate sink label [mixed]");
  });

  test("flags single-letter labels (#011 regression guard)", () => {
    const bad = "[0:a]volume=1[v]";
    const r = checkFilterGraph(bad);
    expect(r.ok).toBe(false);
    expect(r.issues.join("\n")).toContain("single-letter label [v]");
  });

  test("accepts a clean multi-char graph", () => {
    const clean = "[0:a]volume=1[voice];[1:a]volume=0.6[music];[voice][music]amix=inputs=2[mixed]";
    const r = checkFilterGraph(clean);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });
});

describe("normalizeCaptions (#013)", () => {
  test("Remotion shape (startMs/endMs/text)", () => {
    const r = normalizeCaptions([
      { text: "hi", startMs: 100, endMs: 800 },
      { text: "there", startMs: 800, endMs: 1500 },
    ]);
    expect(r).toEqual([
      { phrase: "hi", start_ms: 100, end_ms: 800, style: undefined },
      { phrase: "there", start_ms: 800, end_ms: 1500, style: undefined },
    ]);
  });

  test("snake_case shape (start_ms/end_ms/phrase)", () => {
    const r = normalizeCaptions([{ phrase: "hi", start_ms: 100, end_ms: 800 }]);
    expect(r[0]!.phrase).toBe("hi");
    expect(r[0]!.start_ms).toBe(100);
  });

  test("seconds shape (start/end in seconds → converted to ms)", () => {
    const r = normalizeCaptions([{ word: "hello", start: 1.5, end: 2.0 }]);
    expect(r[0]!.start_ms).toBe(1500);
    expect(r[0]!.end_ms).toBe(2000);
  });

  test("{captions:[]} wrapper accepted", () => {
    const r = normalizeCaptions({ captions: [{ text: "x", start_ms: 0, end_ms: 100 }] });
    expect(r.length).toBe(1);
  });

  test("missing timestamps → row dropped silently", () => {
    const r = normalizeCaptions([{ text: "no times" }, { text: "ok", start_ms: 0, end_ms: 100 }]);
    expect(r.map((c) => c.phrase)).toEqual(["ok"]);
  });

  test("null / wrong type → []", () => {
    expect(normalizeCaptions(null)).toEqual([]);
    expect(normalizeCaptions(42)).toEqual([]);
    expect(normalizeCaptions("string")).toEqual([]);
  });
});

describe("descriptor-pinned composition rendering", () => {
  test("probes, reads captions, and renders in the opened directory after its path is replaced", async () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-composer-pinned-"));
    temporaryDirectories.push(temporary);
    const project = path.join(temporary, "project");
    const external = path.join(temporary, "external");
    const bin = path.join(temporary, "bin");
    fs.mkdirSync(project);
    fs.mkdirSync(external);
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(project, "clip.mp4"), "pinned");
    fs.writeFileSync(path.join(project, "captions.json"), JSON.stringify([{ text: "pinned caption", startMs: 0, endMs: 100 }]));
    fs.writeFileSync(path.join(external, "clip.mp4"), "external");
    fs.writeFileSync(path.join(external, "captions.json"), JSON.stringify([{ text: "external caption", startMs: 0, endMs: 100 }]));
    fs.writeFileSync(path.join(external, "out.mp4"), "external sentinel");
    fs.writeFileSync(path.join(bin, "ffprobe"), "#!/bin/sh\nprintf probed > .ffprobe-cwd\nprintf '4\\n'\n", { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "ffmpeg"), "#!/bin/sh\n[ \"$1\" = -version ] && exit 0\nfor last; do :; done\nprintf pinned-render > \"$last\"\n", { mode: 0o755 });

    const directoryFd = fs.openSync(project, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
    const captionFd = fs.openSync(path.join(project, "captions.json"), fs.constants.O_RDONLY);
    const oldPath = process.env.PATH;
    try {
      fs.renameSync(project, `${project}.original`);
      fs.symlinkSync(external, project);
      process.env.PATH = `${bin}:${oldPath ?? ""}`;
      const probe = spawnSyncInDirectory(directoryFd, [path.join(bin, "ffprobe")]);
      expect({ status: probe.status, stdout: probe.stdout, stderr: probe.stderr }).toEqual({ status: 0, stdout: "4\n", stderr: "" });
      const timeline = await buildTimelineFromInputs([
        { path: "clip.mp4", role: "scene" },
        { path: "captions.json", role: "captions", fd: captionFd },
      ], { directoryFd });
      expect(timeline.total_duration_s).toBe(4);
      expect(timeline.captions_track[0]?.phrase).toBe("pinned caption");
      expect(fs.readFileSync(path.join(`${project}.original`, ".ffprobe-cwd"), "utf8")).toBe("probed");
      expect(fs.existsSync(path.join(external, ".ffprobe-cwd"))).toBe(false);
      await renderTimeline(timeline, "out.mp4", { directoryFd });
      expect(fs.readFileSync(path.join(`${project}.original`, "out.mp4"), "utf8")).toBe("pinned-render");
      expect(fs.readFileSync(path.join(external, "out.mp4"), "utf8")).toBe("external sentinel");
    } finally {
      process.env.PATH = oldPath;
      fs.closeSync(captionFd);
      fs.closeSync(directoryFd);
    }
  });
});
