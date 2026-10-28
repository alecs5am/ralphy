// Retention facts pre-check (#571) — cli/lib/eval/retention-check.ts and the
// `ralphy eval retention-check` verb.
//
// The pre-check reports FACTS only and never fails: these tests lock the
// numbers (hook length, quiet stretch, CTA position, loop-back, words per
// second), the shape tolerance (canonical record, legacy array, legacy CTA
// block, garbage input), the archive-path resolution order, the anchor format
// of the review doc, and the pretty-mode render. No network, no model call.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  retentionCheck,
  resolveCaArchive,
  countWords,
  contentWords,
  RETENTION_REVIEW_DOC,
  CA_ARCHIVE_ENV,
} from "../../cli/lib/eval/retention-check.ts";
import { out, setPretty } from "../../cli/lib/output.js";
import { setMode } from "../../cli/lib/ui.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

// A generic how-to short: hook with a promise cue, two silent B-roll beats in
// the middle (the quiet stretch), a CTA that echoes the opening.
const CANONICAL = {
  project_id: "knife-tip-001",
  target_duration_s: 19,
  hook: { scene_id: "scene-01", vo: "Your knife is dull for one reason. Here's why.", duration_s: 3 },
  body: [
    { scene_id: "scene-02", vo: "Most people sharpen at the wrong angle.", duration_s: 4 },
    { scene_id: "scene-03", vo: "", duration_s: 2 },
    { scene_id: "scene-04", vo: "", duration_s: 3 },
    { scene_id: "scene-05", vo: "Hold the blade at fifteen degrees and pull slowly.", duration_s: 4 },
  ],
  cta: { scene_id: "scene-06", vo: "Follow for part two, and check if your knife is still dull.", duration_s: 3 },
  scenes: {
    "scene-01": { id: "scene-01", role: "hook", vo_text: "Your knife is dull for one reason. Here's why.", target_duration_s: 3, camera: "close-up on a dull edge", refs: [] },
    "scene-02": { id: "scene-02", role: "body", vo_text: "Most people sharpen at the wrong angle.", target_duration_s: 4, camera: "over-shoulder at the stone", refs: [] },
    "scene-03": { id: "scene-03", role: "body", vo_text: "", target_duration_s: 2, camera: "macro of the burr", refs: [], silent: true },
    "scene-04": { id: "scene-04", role: "body", vo_text: "", target_duration_s: 3, camera: "slow push-in on the angle guide", refs: [], silent: true },
    "scene-05": { id: "scene-05", role: "body", vo_text: "Hold the blade at fifteen degrees and pull slowly.", target_duration_s: 4, camera: "top-down on the stroke", refs: [] },
    "scene-06": { id: "scene-06", role: "cta", vo_text: "Follow for part two, and check if your knife is still dull.", target_duration_s: 3, camera: "tomato slice test", refs: [] },
  },
};

describe("retentionCheck: canonical scenario facts", () => {
  const f = retentionCheck(CANONICAL);

  test("runtime and words per second", () => {
    expect(f.factsOnly).toBe(true);
    expect(f.runtime.runtimeS).toBe(19);
    expect(f.runtime.sceneCount).toBe(6);
    expect(f.runtime.voWords).toBe(9 + 7 + 9 + 12);
    expect(f.scenes.find((s) => s.id === "scene-02")!.wps).toBe(1.75);
    expect(f.scenes.find((s) => s.id === "scene-03")!.wps).toBeNull();
    // Words cover hook + scene-02 + scene-05 + cta = 14 of 19 s.
    expect(f.runtime.wordCoveragePct).toBe(73.7);
  });

  test("hook length: hook-scene end, first statement, promise cue", () => {
    expect(f.hook.sceneIds).toEqual(["scene-01"]);
    expect(f.hook.endS).toBe(3);
    expect(f.hook.endPct).toBe(15.8);
    // 7 of 9 hook words close the first sentence: 7/9 * 3 s.
    expect(f.hook.firstStatementS).toBe(2.33);
    expect(f.hook.promiseCue).toBe("here's how/why/what");
    expect(f.hook.promiseCueS).toBe(3);
  });

  test("longest quiet stretch merges consecutive scenes with no new words", () => {
    expect(f.longestQuietStretch).toEqual({
      seconds: 5,
      startS: 7,
      endS: 12,
      sceneIds: ["scene-03", "scene-04"],
      basis: "words",
    });
    expect(f.longestBeat).toEqual({ sceneId: "scene-02", seconds: 4, startS: 3, endS: 7 });
  });

  test("CTA position as % of runtime plus ask cues", () => {
    expect(f.cta.declared).toBe(true);
    expect(f.cta.sceneIds).toEqual(["scene-06"]);
    expect(f.cta.startS).toBe(16);
    expect(f.cta.startPct).toBe(84.2);
    expect(f.cta.askCues).toEqual([{ sceneId: "scene-06", atS: 16, atPct: 84.2, cue: "follow" }]);
  });

  test("loop-back: the last beat echoes the opening", () => {
    expect(f.loopBack.echoesOpening).toBe(true);
    expect(f.loopBack.sharedWords.sort()).toEqual(["dull", "knife"]);
    expect(f.loopBack.visualReturnCue).toBe(false);
    expect(f.loopBack.lastSceneId).toBe("scene-06");
  });

  test("never emits a verdict or a failure field", () => {
    const keys = Object.keys(f);
    expect(keys).not.toContain("verdict");
    expect(keys).not.toContain("passed");
    expect(keys).not.toContain("failures");
  });
});

describe("retentionCheck: new-information proxy", () => {
  test("a scene that only repeats earlier words is not new information", () => {
    const f = retentionCheck({
      scenes: [
        { id: "scene-01", role: "hook", vo_text: "Coffee tastes bitter when the water is too hot.", target_duration_s: 3 },
        { id: "scene-02", role: "body", vo_text: "Too hot water, bitter coffee.", target_duration_s: 3 },
        { id: "scene-03", role: "body", vo_text: "Use water just off the boil.", target_duration_s: 3 },
      ],
    });
    expect(f.scenes[1]!.newInfo).toBe(false);
    expect(f.scenes[1]!.newWords).toBe(0);
    expect(f.longestQuietStretch!.sceneIds).toEqual(["scene-02"]);
    expect(f.scenes[2]!.newInfo).toBe(true);
  });

  test("a visual-only scenario falls back to scene boundaries", () => {
    const f = retentionCheck({
      target_duration_s: 9,
      scenes: [
        { id: "scene-01", role: "hook", vo_text: "", silent: true, target_duration_s: 2, camera: "hat tug" },
        { id: "scene-02", role: "body", vo_text: "", silent: true, target_duration_s: 4, camera: "reveal" },
        { id: "scene-03", role: "cta", vo_text: "", silent: true, target_duration_s: 3, camera: "Return to the opening frame" },
      ],
    });
    expect(f.longestQuietStretch).toEqual({ seconds: 4, startS: 2, endS: 6, sceneIds: ["scene-02"], basis: "visual-only" });
    expect(f.runtime.wordCoveragePct).toBe(0);
    expect(f.hook.firstStatementS).toBeNull();
    expect(f.loopBack.visualReturnCue).toBe(true);
    expect(f.loopBack.echoesOpening).toBe(true);
    expect(f.notes.some((n) => n.includes("visual-only"))).toBe(true);
  });

  test("on-screen text counts: overlays and a caption cue in notes", () => {
    const f = retentionCheck({
      scenes: [
        { id: "scene-01", role: "hook", vo_text: "", target_duration_s: 2, text_overlays: [{ text: "Three mistakes that kill houseplants", x: 80, y: 300 }] },
        { id: "scene-02", role: "body", vo_text: "", target_duration_s: 2, notes: "Pot on a sill. Caption: Snake plant needs no sun." },
      ],
    });
    expect(f.scenes[0]!.textWords).toBe(5);
    expect(f.scenes[1]!.textWords).toBe(5);
    expect(f.hook.promiseCue).toBe("numbered list");
    expect(f.hook.promiseCueS).toBe(0);
    expect(f.notes.some((n) => n.includes("caption cue in notes"))).toBe(true);
  });

  test("an empty scene vo_text falls back to the SceneRef vo", () => {
    const f = retentionCheck({
      hook: { scene_id: "scene-01", vo: "Stop rinsing rice like this.", duration_s: 2 },
      scenes: { "scene-01": { id: "scene-01", role: "hook", vo_text: "", target_duration_s: 2 } },
    });
    expect(f.scenes[0]!.voWords).toBe(5);
    expect(f.notes.some((n) => n.includes("pointer"))).toBe(true);
  });
});

describe("retentionCheck: shape tolerance (never throws)", () => {
  test("legacy array shape with durationSec + voiceover.text, roles inferred", () => {
    const f = retentionCheck({
      duration: 10,
      scenes: [
        { id: "s1", durationSec: 2, voiceover: { text: "Stop scrolling right now." } },
        { id: "s2", durationSec: 8, voiceover: { text: "This one trick saves an hour every week." } },
      ],
    });
    expect(f.hook.sceneIds).toEqual(["s1"]);
    expect(f.hook.endS).toBe(2);
    expect(f.scenes[0]!.role).toBe("hook");
    expect(f.scenes[1]!.role).toBe("body");
    expect(f.runtime.declaredS).toBe(10);
  });

  test("no CTA declared: startPct is null, not a failure", () => {
    const f = retentionCheck({
      scenes: [{ id: "scene-01", role: "hook", vo_text: "A quiet morning walk.", target_duration_s: 5 }],
    });
    expect(f.cta.declared).toBe(false);
    expect(f.cta.startS).toBeNull();
    expect(f.cta.startPct).toBeNull();
    expect(f.loopBack.lastSceneId).toBeNull();
  });

  test("legacy top-level cta block extends the runtime", () => {
    const f = retentionCheck({
      scenes: [{ id: "source", durationSec: 60, description: "owner reel" }],
      cta: { startSec: 60, durationSec: 4, action: "Book a call today" },
    });
    expect(f.runtime.runtimeS).toBe(64);
    expect(f.cta.declared).toBe(true);
    expect(f.cta.startS).toBe(60);
    expect(f.cta.startPct).toBe(93.8);
    expect(f.cta.askCues.map((c) => c.cue)).toContain("book");
  });

  test("garbage and empty inputs return empty facts with notes", () => {
    for (const input of [null, "scenario", 42, {}, { scenes: "nope" }, { scenes: [] }]) {
      const f = retentionCheck(input);
      expect(f.factsOnly).toBe(true);
      expect(f.scenes).toEqual([]);
      expect(f.notes.length).toBeGreaterThan(0);
      expect(f.longestBeat).toBeNull();
    }
  });

  test("word helpers", () => {
    expect(countWords("Twenty-six thousand likes. Don't scroll!")).toBe(6);
    expect(contentWords("Here's why the knife is dull")).toEqual(["knife", "dull"]);
  });
});

describe("resolveCaArchive: env → workspace setting → default", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ralphy-ca-"));
  const archive = path.join(tmp, "archive");
  mkdirSync(archive);

  test("env var wins and existing dir is available", () => {
    const r = resolveCaArchive({ env: { [CA_ARCHIVE_ENV]: archive }, configValue: "/elsewhere", home: tmp });
    expect(r.source).toBe("env");
    expect(r.path).toBe(archive);
    expect(r.available).toBe(true);
    expect(r.anchorLookup).toContain("02_distilled");
  });

  test("config value is used when no env var is set, with ~ expansion", () => {
    const r = resolveCaArchive({ env: {}, configValue: "~/archive", home: tmp });
    expect(r.source).toBe("config");
    expect(r.path).toBe(archive);
    expect(r.available).toBe(true);
  });

  test("default path degrades gracefully when absent", () => {
    const r = resolveCaArchive({ env: {}, readConfig: () => undefined, home: path.join(tmp, "nobody") });
    expect(r.source).toBe("default");
    expect(r.path).toBe(path.join(tmp, "nobody", "Desktop", "Content-Autopilot-Archive"));
    expect(r.available).toBe(false);
  });

  test("a throwing config reader is ignored", () => {
    const r = resolveCaArchive({ env: {}, readConfig: () => { throw new Error("no store"); }, home: tmp });
    expect(r.source).toBe("default");
  });
});

describe("retention-review.md anchors", () => {
  const doc = readFileSync(path.join(REPO, RETENTION_REVIEW_DOC), "utf8");
  // The literal format description `[CA: <lesson id> @ hh:mm:ss]` is not an anchor.
  const anchors = [...doc.matchAll(/\[CA: ([^\]]+)\]/g)]
    .map((m) => m[1]!)
    .filter((a) => a !== "<lesson id> @ hh:mm:ss");

  test("every anchor is a pointer of the form <lesson id> @ hh:mm:ss", () => {
    expect(anchors.length).toBeGreaterThanOrEqual(40);
    for (const a of anchors) {
      expect(a, `bad anchor "${a}"`).toMatch(/^lesn_[A-Za-z0-9]+ @ \d{2}:\d{2}:\d{2}$/);
    }
  });

  test("covers the required sections and the rubric reconciliation", () => {
    for (const heading of [
      "## Step 1: name the content job first",
      "## Step 2: the hook earns attention and matches the promise",
      "## Step 3: one clear idea",
      "## Step 4: development adds new information",
      "## Step 5: payoff",
      "## Step 6: the next step fits the job",
      "## Step 7: visual presentation pass",
      "## Context rules: what the course does not prescribe",
      "## Where this disagrees with docs/virality-rubric.md",
    ]) {
      expect(doc).toContain(heading);
    }
  });

  // Resolves each anchor against the local archive when it is present (the
  // owner's machine); CI without the archive checks the format only.
  const ca = resolveCaArchive({ readConfig: () => undefined });
  const indexPath = path.join(ca.path, "index.json");
  test.skipIf(!ca.available || !existsSync(indexPath))("anchors resolve against the local archive", () => {
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
      lessons: Array<{ id: string; durationSeconds?: number }>;
    };
    const byId = new Map(index.lessons.map((l) => [l.id, l]));
    const transcripts = readdirSync(path.join(ca.path, "01_transcripts"));
    for (const a of anchors) {
      const [id, ts] = a.split(" @ ") as [string, string];
      const lesson = byId.get(id);
      expect(lesson, `unknown lesson ${id}`).toBeDefined();
      expect(transcripts.some((f) => f.startsWith(`${id}-`)), `no transcript for ${id}`).toBe(true);
      const [h, m, s] = ts.split(":").map(Number) as [number, number, number];
      const sec = h * 3600 + m * 60 + s;
      if (typeof lesson!.durationSeconds === "number") {
        expect(sec, `${a} is past the lesson end`).toBeLessThanOrEqual(lesson!.durationSeconds + 30);
      }
    }
  });
});

describe("pretty-mode render of real facts", () => {
  let captured: string[] = [];
  const originalLog = console.log;
  beforeEach(() => {
    captured = [];
    console.log = (...args: unknown[]) => {
      captured.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    };
    setPretty(true);
    setMode("pretty");
  });
  afterEach(() => {
    console.log = originalLog;
    setPretty(false);
    setMode("auto");
  });

  test("no [object Object], no standalone undefined, no JSON escapes", () => {
    const f = retentionCheck(CANONICAL);
    out({ project: "knife-tip-001", scenarioPath: "/tmp/scenario.json", factsOnly: true, ...f });
    const text = captured.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
    expect(text).not.toContain("[object Object]");
    expect(text).not.toMatch(/[\s│|]undefined[\s│|]/);
    expect(text).not.toMatch(/\\"[a-z_]+\\":/);
    expect(text).toContain("scene-03");
  });
});

describe("CLI smoke: ralphy eval retention-check (offline)", () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ralphy-retention-"));
  const scenarioPath = path.join(tmp, "scenario.json");
  writeFileSync(scenarioPath, JSON.stringify(CANONICAL));
  const archive = path.join(tmp, "ca-archive");
  mkdirSync(archive);
  const env = { ...process.env, HOME: tmp, RALPHY_PROJECT_DIR: "", [CA_ARCHIVE_ENV]: archive };

  test("prints facts for a scenario file and exits 0", () => {
    const r = spawnSync("bun", ["run", CLI, "--json", "eval", "retention-check", scenarioPath], {
      cwd: tmp,
      encoding: "utf8",
      env,
    });
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.factsOnly).toBe(true);
    expect(json.scenarioPath).toBe(scenarioPath);
    expect(json.hook.endS).toBe(3);
    expect(json.cta.startPct).toBe(84.2);
    expect(json.longestQuietStretch.seconds).toBe(5);
    expect(json.archive).toEqual({ path: archive, source: "env", available: true });
    expect(json.reviewMethod).toBe(RETENTION_REVIEW_DOC);
  });

  test("a directory target resolves to its scenario.json", () => {
    const r = spawnSync("bun", ["run", CLI, "--json", "eval", "retention-check", tmp], {
      cwd: tmp,
      encoding: "utf8",
      env,
    });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).scenarioPath).toBe(scenarioPath);
  });

  test("a missing scenario is E_NOT_FOUND", () => {
    const r = spawnSync("bun", ["run", CLI, "--json", "eval", "retention-check", "no-such-project-xyz"], {
      cwd: tmp,
      encoding: "utf8",
      env,
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("E_NOT_FOUND");
  });
});
