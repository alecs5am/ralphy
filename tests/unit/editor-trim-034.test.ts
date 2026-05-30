// Unit tests for the trim-analyze helpers (#034).
// Pure shape / prompt / idempotency logic — no LLM call, no filesystem.

import { describe, test, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildTrimAnalysisPrompt,
  needsAnalysis,
  normalizeTrimAnalysisJson,
  loadOrSeedSummary,
  upsertRow,
  slotFromClipPath,
  type TrimAnalysisRow,
  type TrimAnalysisSummary,
} from "../../cli/lib/editor/trim.js";

describe("buildTrimAnalysisPrompt (#034)", () => {
  test("contains the JSON keys the editor expects to act on", () => {
    const p = buildTrimAnalysisPrompt();
    expect(p).toContain("observed_duration_sec");
    expect(p).toContain("dead_head_sec");
    expect(p).toContain("dead_tail_sec");
    expect(p).toContain("trim_in_s");
    expect(p).toContain("trim_out_s");
    expect(p).toContain("max_trim_sec");
    expect(p).toContain("trim_from");
    expect(p).toContain("hot_moments");
  });

  test("instructs the model to preserve > aggressively trim", () => {
    const p = buildTrimAnalysisPrompt();
    expect(p).toContain("PRESERVING > AGGRESSIVE");
  });

  test("stable across calls (no Date.now in the prompt)", () => {
    expect(buildTrimAnalysisPrompt()).toBe(buildTrimAnalysisPrompt());
  });
});

describe("normalizeTrimAnalysisJson (#034)", () => {
  test("full vision JSON → fully-populated TrimAnalysisRow", () => {
    const raw = {
      observed_duration_sec: 5.0,
      dead_head_sec: 0.4,
      dead_tail_sec: 0.6,
      best_subwindow: { start: 0.4, end: 4.4 },
      trim_recommendation: {
        max_trim_sec: 1.0,
        trim_in_s: 0.4,
        trim_out_s: 4.4,
        trim_from: "both",
      },
      hot_moments: [
        { t: 1.2, intensity: "high", what: "head turn" },
        { t: 3.5, intensity: "medium", what: "cut to insert" },
      ],
    };
    const row = normalizeTrimAnalysisJson(raw, {
      slot: "scene-01-vid",
      clipPath: "/p/scene-01-vid.mp4",
      clipMtimeMs: 1700000000000,
      analysisPath: "/p/analysis/scene-01-vid.json",
      model: "google/gemini-3.1-pro-preview",
      analyzedAt: "2026-05-30T00:00:00Z",
    });
    expect(row.slot).toBe("scene-01-vid");
    expect(row.observedDurationSec).toBe(5.0);
    expect(row.deadHeadSec).toBe(0.4);
    expect(row.deadTailSec).toBe(0.6);
    expect(row.trimInSec).toBe(0.4);
    expect(row.trimOutSec).toBe(4.4);
    expect(row.maxTrimSec).toBe(1.0);
    expect(row.trimFrom).toBe("both");
    expect(row.hotMoments?.length).toBe(2);
    expect(row.analyzedAt).toBe("2026-05-30T00:00:00Z");
  });

  test("missing fields → undefined (does not throw)", () => {
    const row = normalizeTrimAnalysisJson({}, {
      slot: "s",
      clipPath: "/p.mp4",
      clipMtimeMs: 0,
      analysisPath: "/a.json",
      model: "m",
    });
    expect(row.deadHeadSec).toBeUndefined();
    expect(row.trimFrom).toBeUndefined();
    expect(row.hotMoments).toBeUndefined();
  });

  test("legacy `beats` field is accepted as hot_moments", () => {
    const raw = { beats: [{ t: 0.5, intensity: "low", what: "x" }] };
    const row = normalizeTrimAnalysisJson(raw, {
      slot: "s", clipPath: "/p.mp4", clipMtimeMs: 0, analysisPath: "/a.json", model: "m",
    });
    expect(row.hotMoments?.length).toBe(1);
    expect(row.hotMoments?.[0]?.t).toBe(0.5);
  });

  test("invalid trim_from values are dropped to undefined", () => {
    const raw = { trim_recommendation: { trim_from: "middle" } };
    const row = normalizeTrimAnalysisJson(raw, {
      slot: "s", clipPath: "/p.mp4", clipMtimeMs: 0, analysisPath: "/a.json", model: "m",
    });
    expect(row.trimFrom).toBeUndefined();
  });

  test("non-object raw input → empty row (no crash)", () => {
    const row = normalizeTrimAnalysisJson(null, {
      slot: "s", clipPath: "/p.mp4", clipMtimeMs: 0, analysisPath: "/a.json", model: "m",
    });
    expect(row.slot).toBe("s");
    expect(row.deadHeadSec).toBeUndefined();
  });
});

describe("needsAnalysis (#034) — mtime idempotency", () => {
  test("no prior row → must analyze", () => {
    expect(needsAnalysis(100, undefined)).toBe(true);
  });
  test("prior mtime older than current clip mtime → re-analyze", () => {
    expect(needsAnalysis(200, { clipMtimeMs: 100 } as TrimAnalysisRow)).toBe(true);
  });
  test("prior mtime equal to current clip mtime → cached (skip)", () => {
    expect(needsAnalysis(100, { clipMtimeMs: 100 } as TrimAnalysisRow)).toBe(false);
  });
  test("prior mtime newer than current clip mtime → cached (skip)", () => {
    expect(needsAnalysis(100, { clipMtimeMs: 200 } as TrimAnalysisRow)).toBe(false);
  });
});

describe("slotFromClipPath (#034)", () => {
  test("strips extension", () => {
    expect(slotFromClipPath("/a/b/scene-01-vid.mp4")).toBe("scene-01-vid");
    expect(slotFromClipPath("intro.webm")).toBe("intro");
  });
});

describe("loadOrSeedSummary + upsertRow (#034)", () => {
  test("missing file → seeded summary with empty clips", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-trim-"));
    const summaryPath = path.join(tmp, "summary.json");
    const s = await loadOrSeedSummary(summaryPath, "proj-001", "google/gemini-3.1-pro-preview");
    expect(s.schemaVersion).toBe(1);
    expect(s.project).toBe("proj-001");
    expect(s.clips).toEqual([]);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("malformed JSON file → seeded summary (no throw)", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-trim-"));
    const summaryPath = path.join(tmp, "summary.json");
    fs.writeFileSync(summaryPath, "{ not valid json");
    const s = await loadOrSeedSummary(summaryPath, "proj-002", "m");
    expect(s.clips).toEqual([]);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("existing summary round-trips", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-trim-"));
    const summaryPath = path.join(tmp, "summary.json");
    const seed: TrimAnalysisSummary = {
      schemaVersion: 1,
      project: "p",
      generatedAt: "2026-05-29T00:00:00Z",
      model: "m",
      clips: [{
        slot: "scene-01-vid",
        clipPath: "/c.mp4",
        clipMtimeMs: 1,
        analysisPath: "/a.json",
        analyzedAt: "2026-05-29T00:00:00Z",
        model: "m",
        deadHeadSec: 0.3,
      }],
    };
    fs.writeFileSync(summaryPath, JSON.stringify(seed));
    const loaded = await loadOrSeedSummary(summaryPath, "p", "m");
    expect(loaded.clips.length).toBe(1);
    expect(loaded.clips[0]!.slot).toBe("scene-01-vid");
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("upsertRow replaces a row with the same slot + sorts", () => {
    const s: TrimAnalysisSummary = {
      schemaVersion: 1,
      project: "p",
      generatedAt: "x",
      model: "m",
      clips: [
        { slot: "scene-02", clipPath: "", clipMtimeMs: 0, analysisPath: "", analyzedAt: "", model: "m" },
        { slot: "scene-01", clipPath: "", clipMtimeMs: 0, analysisPath: "", analyzedAt: "", model: "m", deadHeadSec: 0.1 },
      ],
    };
    const next = upsertRow(s, {
      slot: "scene-01",
      clipPath: "",
      clipMtimeMs: 999,
      analysisPath: "",
      analyzedAt: "",
      model: "m",
      deadHeadSec: 0.5,
    });
    expect(next.clips.length).toBe(2);
    expect(next.clips[0]!.slot).toBe("scene-01");
    expect(next.clips[0]!.deadHeadSec).toBe(0.5);
    expect(next.clips[0]!.clipMtimeMs).toBe(999);
    expect(next.clips[1]!.slot).toBe("scene-02");
  });
});
